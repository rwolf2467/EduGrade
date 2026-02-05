# EduGrade - Secure Classroom Grade Management System
# Copyright (C) 2026 Fabian Murauer
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.


"""
EduGrade - Quart Backend Application
Main application with all API routes
JSON-based database implementation
"""

import json
import hashlib
import secrets
import functools
import base64
import os
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict
from quart import Quart, render_template, request, jsonify, redirect, url_for, make_response, send_file
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# ============ RATE LIMITING ============

# Rate limit storage: {ip: {endpoint: [(timestamp, count)]}}
rate_limit_storage = defaultdict(lambda: defaultdict(list))

# Rate limit configurations: {endpoint_pattern: (max_requests, time_window_seconds)}
RATE_LIMITS = {
    'login': (5, 60),       # 5 attempts per minute
    'register': (3, 60),    # 3 attempts per minute
    'data_write': (30, 60), # 30 writes per minute
    'data_read': (60, 60),  # 60 reads per minute
    'default': (100, 60),   # 100 requests per minute default
}

def get_client_ip():
    """Get client IP from request"""
    # Check for forwarded headers (reverse proxy)
    forwarded = request.headers.get('X-Forwarded-For', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.remote_addr or 'unknown'

def check_rate_limit(endpoint_type: str = 'default') -> tuple[bool, int]:
    """
    Check if request is within rate limit.
    Returns (is_allowed, seconds_until_reset)
    """
    ip = get_client_ip()
    max_requests, time_window = RATE_LIMITS.get(endpoint_type, RATE_LIMITS['default'])
    now = datetime.now()
    window_start = now - timedelta(seconds=time_window)

    # Clean old entries and count recent requests
    recent_requests = [ts for ts in rate_limit_storage[ip][endpoint_type] if ts > window_start]
    rate_limit_storage[ip][endpoint_type] = recent_requests

    if len(recent_requests) >= max_requests:
        # Calculate time until oldest request expires
        oldest = min(recent_requests)
        seconds_until_reset = int((oldest + timedelta(seconds=time_window) - now).total_seconds()) + 1
        return False, seconds_until_reset

    # Add current request
    rate_limit_storage[ip][endpoint_type].append(now)
    return True, 0

def rate_limit(endpoint_type: str = 'default'):
    """Decorator to apply rate limiting to routes"""
    def decorator(f):
        @functools.wraps(f)
        async def decorated_function(*args, **kwargs):
            is_allowed, seconds_until_reset = check_rate_limit(endpoint_type)
            if not is_allowed:
                return jsonify({
                    'success': False,
                    'message': f'Too many requests. Please try again in {seconds_until_reset} seconds.',
                    'rate_limited': True,
                    'retry_after': seconds_until_reset
                }), 429
            return await f(*args, **kwargs)
        decorated_function.__name__ = f"{f.__name__}_rate_limited"
        return decorated_function
    return decorator

# ============ JSON DATABASE IMPLEMENTATION ============

# Database path
DATA_DIR = Path(__file__).parent / "data"
DB_PATH = DATA_DIR / "edugrade.json"

# Ensure data directory exists
DATA_DIR.mkdir(exist_ok=True)

# ============ ENCRYPTION ============

# In-memory storage for encryption keys (session_token -> encryption_key)
# This is cleared on server restart, requiring users to re-login
encryption_keys = {}

# In-memory cache for decrypted user data (session_token -> {data, last_heartbeat})
# This avoids re-decrypting on every request
user_data_cache = {}

# Heartbeat timeout in seconds - cache is cleared if no heartbeat received
HEARTBEAT_TIMEOUT = 60

def derive_encryption_key(password: str, salt: bytes) -> bytes:
    """Derive a 256-bit encryption key from password using PBKDF2"""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,  # 256 bits for AES-256
        salt=salt,
        iterations=100000,  # Fewer iterations than password hash since this runs on every login
    )
    return kdf.derive(password.encode())

def encrypt_user_data(data: dict, key: bytes) -> str:
    """Encrypt user data using AES-256-GCM"""
    # Convert data to JSON string
    json_data = json.dumps(data, ensure_ascii=False)

    # Generate a random 96-bit nonce (recommended for GCM)
    nonce = os.urandom(12)

    # Encrypt using AES-GCM
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, json_data.encode('utf-8'), None)

    # Combine nonce + ciphertext and encode as base64
    encrypted = base64.b64encode(nonce + ciphertext).decode('ascii')
    return encrypted

def decrypt_user_data(encrypted_data: str, key: bytes) -> dict:
    """Decrypt user data using AES-256-GCM"""
    try:
        # Decode from base64
        raw = base64.b64decode(encrypted_data)

        # Extract nonce (first 12 bytes) and ciphertext
        nonce = raw[:12]
        ciphertext = raw[12:]

        # Decrypt
        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)

        # Parse JSON
        return json.loads(plaintext.decode('utf-8'))
    except Exception as e:
        print(f"Decryption error: {e}")
        return {}

def hash_password(password: str) -> str:
    """Hash password using PBKDF2 with enhanced security"""
    salt = secrets.token_bytes(32) 
    hashed = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 200000)
    return f"{salt.hex()}:{hashed.hex()}"

def verify_password(stored_password: str, provided_password: str) -> bool:
    """Verify password against stored hash with backward compatibility"""
    try:
        salt_hex, stored_hash = stored_password.split(':')
        salt = bytes.fromhex(salt_hex)
        
        if len(salt) == 32:
            provided_hash = hashlib.pbkdf2_hmac('sha256', provided_password.encode(), salt, 200000)
            return secrets.compare_digest(stored_hash, provided_hash.hex())
        
        else:
            return False
    except:
        return False

def generate_session_token() -> str:
    """Generate a secure session token"""
    return secrets.token_hex(32)

def init_db():
    """Initialize database with default structure"""
    if not DB_PATH.exists():
        default_data = {
            "users": {},
            "sessions": {},
            "user_data": {}
        }
        save_db(default_data)

def load_db():
    """Load database from JSON file"""
    try:
        with open(DB_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        init_db()
        return load_db()

def save_db(data):
    """Save database to JSON file"""
    with open(DB_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

async def cleanup_expired_sessions():
    """Remove expired sessions and their caches"""
    db = load_db()
    now = datetime.now()
    expired = []

    for token, session in db["sessions"].items():
        expires_at = datetime.fromisoformat(session["expires_at"])
        if expires_at < now:
            expired.append(token)

    for token in expired:
        del db["sessions"][token]
        # Clear session cache
        clear_session_cache(token)

    # Also clean up stale caches (no heartbeat for too long)
    stale_tokens = []
    for token, cache_entry in user_data_cache.items():
        if (now - cache_entry["last_heartbeat"]).total_seconds() > HEARTBEAT_TIMEOUT * 2:
            stale_tokens.append(token)

    for token in stale_tokens:
        print(f"Clearing stale cache for token {token[:8]}...")
        clear_session_cache(token)

    save_db(db)
    return None

def save_user_data(user_id: str, data, encryption_key: bytes = None, session_token: str = None):
    """Save user data (encrypted if key is provided)"""
    db = load_db()
    if encryption_key:
        # Store encrypted data
        encrypted = encrypt_user_data(data, encryption_key)
        db["user_data"][user_id] = {"encrypted": True, "data": encrypted}
    else:
        # Store unencrypted (legacy/migration)
        db["user_data"][user_id] = data
    save_db(db)

    # Update cache if session token provided
    if session_token and session_token in user_data_cache:
        user_data_cache[session_token]["data"] = data
        user_data_cache[session_token]["last_heartbeat"] = datetime.now()

def get_user_data(user_id: str, encryption_key: bytes = None):
    """Get user data from disk (decrypted if encrypted and key is provided)"""
    db = load_db()
    stored = db["user_data"].get(user_id, {})

    # Check if data is encrypted
    if isinstance(stored, dict) and stored.get("encrypted"):
        if encryption_key:
            return decrypt_user_data(stored["data"], encryption_key)
        else:
            print(f"Warning: Encrypted data for user {user_id} but no key provided")
            return {}
    else:
        # Unencrypted data (legacy)
        return stored

def get_user_data_cached(user_id: str, session_token: str, encryption_key: bytes = None):
    """Get user data from cache or decrypt and cache it"""
    # Check cache first
    if session_token in user_data_cache:
        cache_entry = user_data_cache[session_token]
        # Check if cache is still valid (heartbeat not timed out)
        if (datetime.now() - cache_entry["last_heartbeat"]).total_seconds() < HEARTBEAT_TIMEOUT:
            print(f"Cache hit for user {user_id}")
            return cache_entry["data"]
        else:
            # Cache expired, remove it
            print(f"Cache expired for user {user_id}")
            del user_data_cache[session_token]

    # Cache miss - load and decrypt from disk
    print(f"Cache miss for user {user_id}, loading from disk")
    data = get_user_data(user_id, encryption_key)

    # Store in cache
    if data and session_token:
        user_data_cache[session_token] = {
            "data": data,
            "user_id": user_id,
            "last_heartbeat": datetime.now()
        }

    return data

def get_encryption_key_for_session(token: str) -> bytes | None:
    """Get the encryption key for a session token"""
    return encryption_keys.get(token)

def clear_session_cache(token: str):
    """Clear cache for a session"""
    if token in user_data_cache:
        del user_data_cache[token]
    if token in encryption_keys:
        del encryption_keys[token]

# ============ AUTHENTICATION FUNCTIONS ============

def register_user(username: str, email: str, password: str) -> dict:
    """Register a new user"""
    # Validate username
    username = username.strip()
    if len(username) < 3 or len(username) > 50:
        return {
            'success': False,
            'message': 'Benutzername muss zwischen 3 und 50 Zeichen lang sein.',
            'user_id': None
        }

    if not username.replace('_', '').isalnum():
        return {
            'success': False,
            'message': 'Benutzername darf nur Buchstaben, Zahlen und Unterstriche enthalten.',
            'user_id': None
        }

    # Validate email
    email = email.strip().lower()
    if '@' not in email or '.' not in email:
        return {
            'success': False,
            'message': 'Ungueltige E-Mail-Adresse.',
            'user_id': None
        }

    # Validate password
    if len(password) < 8:
        return {
            'success': False,
            'message': 'Passwort muss mindestens 8 Zeichen lang sein.',
            'user_id': None
        }

    db = load_db()

    # Check if user already exists
    if email in db["users"]:
        return {
            'success': False,
            'message': 'Benutzername oder E-Mail bereits vergeben.',
            'user_id': None
        }

    # Create user
    user_id = str(len(db["users"]) + 1)
    password_hash = hash_password(password)

    # Generate encryption salt (separate from password hash salt)
    encryption_salt = secrets.token_bytes(32)

    db["users"][email] = {
        "id": user_id,
        "username": username,
        "email": email,
        "password_hash": password_hash,
        "encryption_salt": encryption_salt.hex(),
        "created_at": datetime.now().isoformat()
    }

    # Derive encryption key from password
    encryption_key = derive_encryption_key(password, encryption_salt)

    # Initialize user data (will be encrypted)
    initial_data = {
        "teacherName": "",
        "currentClassId": None,
        "classes": [],
        "categories": [],
        "students": [],
        "participationSettings": {"plusValue": 0.5, "minusValue": 0.5},
        "plusMinusGradeSettings": {"startGrade": 3, "plusValue": 0.5, "minusValue": 0.5},
        "tutorial": {"completed": False, "neverShowAgain": False},
        "gradePercentageRanges": [
            {"grade": 1, "minPercent": 85, "maxPercent": 100},
            {"grade": 2, "minPercent": 70, "maxPercent": 84},
            {"grade": 3, "minPercent": 55, "maxPercent": 69},
            {"grade": 4, "minPercent": 40, "maxPercent": 54},
            {"grade": 5, "minPercent": 0, "maxPercent": 39}
        ]
    }

    # Encrypt and store initial data
    encrypted_data = encrypt_user_data(initial_data, encryption_key)
    db["user_data"][user_id] = {"encrypted": True, "data": encrypted_data}

    save_db(db)
    return {
        'success': True,
        'message': 'Registrierung erfolgreich!',
        'user_id': user_id
    }

def login_user(email: str, password: str) -> dict:
    """Log in a user"""
    email = email.strip().lower()

    db = load_db()
    user = db["users"].get(email)

    if not user or not verify_password(user["password_hash"], password):
        return {
            'success': False,
            'message': 'Ungueltige E-Mail oder Passwort.',
            'token': None,
            'user': None
        }

    # Create session
    token = generate_session_token()
    expires_at = (datetime.now() + timedelta(hours=1)).isoformat()

    db["sessions"][token] = {
        "user_id": user["id"],
        "created_at": datetime.now().isoformat(),
        "expires_at": expires_at
    }

    save_db(db)

    # Handle encryption key
    user_id = user["id"]
    encryption_salt_hex = user.get("encryption_salt")

    if not encryption_salt_hex:
        # Legacy user without encryption - create encryption salt now
        print(f"Creating encryption salt for legacy user {user_id}")
        encryption_salt = secrets.token_bytes(32)
        db["users"][email]["encryption_salt"] = encryption_salt.hex()
        save_db(db)
        encryption_salt_hex = encryption_salt.hex()

    # Derive encryption key
    encryption_salt = bytes.fromhex(encryption_salt_hex)
    encryption_key = derive_encryption_key(password, encryption_salt)
    encryption_keys[token] = encryption_key

    # Check if data needs migration (unencrypted -> encrypted)
    db = load_db()  # Reload to get fresh state
    stored = db["user_data"].get(user_id, {})
    if stored and not (isinstance(stored, dict) and stored.get("encrypted")):
        # Data is not encrypted yet, encrypt it now
        print(f"Migrating unencrypted data for user {user_id}")
        save_user_data(user_id, stored, encryption_key)

    return {
        'success': True,
        'message': 'Login erfolgreich!',
        'token': token,
        'user': {
            'id': user['id'],
            'username': user['username'],
            'email': user['email']
        }
    }

def logout_user(token: str) -> bool:
    """Log out a user by invalidating their session"""
    db = load_db()
    if token in db["sessions"]:
        del db["sessions"][token]
        save_db(db)

    # Clear session cache (encryption key + data cache)
    clear_session_cache(token)

    return True

def get_user_from_token(token: str) -> dict | None:
    """Get user from session token"""
    if not token:
        return None

    db = load_db()
    session = db["sessions"].get(token)
    
    if not session:
        return None

    # Check if session is expired
    expires_at = datetime.fromisoformat(session['expires_at'])
    if expires_at < datetime.now():
        return None

    # Find user by email (users are stored with email as key)
    user_id = session['user_id']
    user_info = None
    
    for email, user_data in db["users"].items():
        if user_data["id"] == user_id:
            user_info = user_data
            break
    
    if user_info:
        return {
            'id': user_info['id'],
            'username': user_info['username'],
            'email': user_info['email']
        }
    return None

def get_token_from_request():
    """Extract session token from request (cookie or header)"""
    # Try cookie first
    token = request.cookies.get('session_token')
    if token:
        return token

    # Try Authorization header
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header[7:]

    return ""

def login_required(f):
    """Decorator to require authentication for routes"""
    
    @functools.wraps(f)
    async def decorated_function(*args, **kwargs):
        token: str = get_token_from_request()
        user = get_user_from_token(token)

        if not user:
            return jsonify({'error': 'Authentication required'}), 401

        # Add user to request context
        request.user = user # type: ignore
        return await f(*args, **kwargs)

    # Give the function a unique name to avoid conflicts
    decorated_function.__name__ = f"{f.__name__}_login_required"
    return decorated_function

app = Quart(__name__,
            template_folder='templates',
            static_folder='static',
            static_url_path='/static')

app.secret_key = 'change-this-in-production-use-env-var'



@app.before_serving
async def startup():
    """Initialize database on startup"""
    print("Initializing JSON database...")
    init_db()
    await cleanup_expired_sessions() 
    print("Database initialized successfully")
# ============ Startup ============


# ============ Page Routes ============

@app.route('/')
async def index():
    """Main page - requires login"""
    token = get_token_from_request()
    user = get_user_from_token(token)

    if not user:
        return redirect(url_for('login_page'))

    return await render_template('index.html', user=user)


@app.route('/login')
async def login_page():
    """Login/Register page"""
    token = get_token_from_request()
    user = get_user_from_token(token)

    if user:
        return redirect(url_for('index'))

    return await render_template('login.html')


@app.route('/terms')
async def terms():
    return await render_template('terms.html')

@app.route('/privacy')
async def privacy():
    return await render_template('privacy.html')

@app.route('/about.html')
async def about_page():
    """About page"""
    return await send_file('about.html')


@app.route('/about_developer.html')
async def about_developer_page():
    """About developer page"""
    return await send_file('about_developer.html')


# ============ Auth API ============

@app.route('/api/register', methods=['POST'])
@rate_limit('register')
async def api_register():
    """Register a new user"""
    data = await request.get_json()

    if not data:
        return jsonify({'success': False, 'message': 'Invalid request'}), 400

    username = data.get('username', '')
    email = data.get('email', '')
    password = data.get('password', '')
    password_confirm = data.get('password_confirm', '')

    if not all([username, email, password, password_confirm]):
        return jsonify({'success': False, 'message': 'Bitte fuellen Sie alle Felder aus.'}), 400

    if password != password_confirm:
        return jsonify({'success': False, 'message': 'Die Passwoerter stimmen nicht ueberein.'}), 400

    result = register_user(username, email, password)
    status_code = 200 if result['success'] else 400

    return jsonify(result), status_code


@app.route('/api/login', methods=['POST'])
@rate_limit('login')
async def api_login():
    """Log in a user"""
    data = await request.get_json()

    if not data:
        return jsonify({'success': False, 'message': 'Invalid request'}), 400

    email = data.get('email', '')
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'success': False, 'message': 'Bitte fuellen Sie alle Felder aus.'}), 400

    result = login_user(email, password)

    if result['success']:
        response = await make_response(jsonify(result))
        response.set_cookie(
            'session_token',
            result['token'],
            httponly=True,
            secure=False,  # Set to True in production with HTTPS
            samesite='Lax',
            max_age=1 * 60 * 60 
        )
        return response

    return jsonify(result), 401


@app.route('/api/logout', methods=['POST'])
async def api_logout():
    """Log out the current user"""
    token = get_token_from_request()

    if token:
        logout_user(token)

    response = await make_response(jsonify({'success': True, 'message': 'Logged out'}))
    response.delete_cookie('session_token')
    return response


@app.route('/api/account', methods=['DELETE'])
@login_required
async def api_delete_account():
    """Delete user account and all associated data"""
    user_id = request.user['id'] # type: ignore
    user_email = request.user['email'] # type: ignore
    token = get_token_from_request()

    try:
        db = load_db()

        # Delete user data
        if user_id in db["user_data"]:
            del db["user_data"][user_id]

        # Delete all sessions for this user
        sessions_to_delete = []
        for session_token, session in db["sessions"].items():
            if session["user_id"] == user_id:
                sessions_to_delete.append(session_token)

        for session_token in sessions_to_delete:
            del db["sessions"][session_token]

        # Delete user account
        if user_email in db["users"]:
            del db["users"][user_email]

        save_db(db)

        response = await make_response(jsonify({'success': True, 'message': 'Account geloescht'}))
        response.delete_cookie('session_token')
        return response

    except Exception as e:
        print(f"Error deleting account for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'message': f'Fehler: {str(e)}'}), 500


# ============ Data Sync API ============

@app.route('/api/data', methods=['GET'])
@rate_limit('data_read')
@login_required
async def api_get_data():
    """Get all data for the current user (cached)"""
    user_id = request.user['id'] # type: ignore
    token = get_token_from_request()
    encryption_key = get_encryption_key_for_session(token)

    try:
        print(f"Loading data for user {user_id}")
        # Use cached data if available
        user_data = get_user_data_cached(user_id, token, encryption_key)

        if not user_data:
            print(f"No data found for user {user_id}, creating default data")
            # Create default data if none exists
            user_data = {
                'teacherName': '',
                'currentClassId': None,
                'classes': [],
                'categories': [],
                'students': [],
                'participationSettings': {'plusValue': 0.5, 'minusValue': 0.5},
                'plusMinusGradeSettings': {'startGrade': 3, 'plusValue': 0.5, 'minusValue': 0.5},
                'tutorial': {'completed': False, 'neverShowAgain': False},
                'gradePercentageRanges': [
                    {'grade': 1, 'minPercent': 85, 'maxPercent': 100},
                    {'grade': 2, 'minPercent': 70, 'maxPercent': 84},
                    {'grade': 3, 'minPercent': 55, 'maxPercent': 69},
                    {'grade': 4, 'minPercent': 40, 'maxPercent': 54},
                    {'grade': 5, 'minPercent': 0, 'maxPercent': 39}
                ]
            }
            save_user_data(user_id, user_data, encryption_key, token)

        print(f"Found {len(user_data.get('classes', []))} classes for user {user_id}")
        print(f"Found {len(user_data.get('categories', []))} categories for user {user_id}")

        print(f"Successfully loaded data for user {user_id}")
        return jsonify(user_data)

    except Exception as e:
        print(f"Error loading data for user {user_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/data', methods=['POST'])
@rate_limit('data_write')
@login_required
async def api_save_data():
    """Save all data for the current user (full sync)"""
    user_id = request.user['id'] # type: ignore
    token = get_token_from_request()
    encryption_key = get_encryption_key_for_session(token)
    data = await request.get_json()

    if not data:
        return jsonify({'success': False, 'message': 'Invalid request - no data received'}), 400

    try:
        # Debug: Log the received data
        print(f"Received data for user {user_id}")
        print(f"Data preview: {len(data.get('classes', []))} classes, {len(data.get('categories', []))} categories")

        # Save complete user data to JSON database (encrypted) and update cache
        save_user_data(user_id, data, encryption_key, token)

        print(f"Data successfully saved (encrypted) for user {user_id}")
        return jsonify({'success': True, 'message': 'Data saved successfully'})

    except Exception as e:
        print(f"Error saving data for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'message': f'Server error: {str(e)}'}), 500


@app.route('/api/heartbeat', methods=['POST'])
@login_required
async def api_heartbeat():
    """Heartbeat endpoint to keep session cache alive"""
    token = get_token_from_request()

    if token in user_data_cache:
        user_data_cache[token]["last_heartbeat"] = datetime.now()
        return jsonify({'success': True, 'cached': True})

    return jsonify({'success': True, 'cached': False})


@app.route('/api/disconnect', methods=['POST'])
@login_required
async def api_disconnect():
    """Called when user closes the page - clears cache but keeps session valid"""
    token = get_token_from_request()
    user_id = request.user['id'] # type: ignore

    # Clear only the data cache, keep the session and encryption key
    if token in user_data_cache:
        print(f"Clearing cache for user {user_id} (page closed)")
        del user_data_cache[token]

    return jsonify({'success': True})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=1601, debug=True)
