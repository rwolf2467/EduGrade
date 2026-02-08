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
    'pin_verify': (5, 60),  # 5 PIN attempts per minute
    'share_manage': (20, 60), # 20 share management requests per minute
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
                    'message': 'backend.tooManyRequests',
                    'message_params': {'seconds': seconds_until_reset},
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

# Master key for encrypting shared data (class_shares)
# This is generated on server startup and stored in memory
MASTER_SHARE_KEY = os.urandom(32)  # 256-bit key for AES-256

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


def encrypt_share_data(data: dict, key: bytes) -> str:
    """Encrypt share data using AES-256-GCM with master key"""
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


def decrypt_share_data(encrypted_data: str, key: bytes) -> dict:
    """Decrypt share data using AES-256-GCM with master key"""
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
        print(f"Share data decryption error: {e}")
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

# ============ STUDENT ACCESS FUNCTIONS ============

def hash_pin(pin: str) -> str:
    """Hash a PIN using PBKDF2 with 50k iterations and 16-byte salt"""
    salt = secrets.token_bytes(16)
    hashed = hashlib.pbkdf2_hmac('sha256', pin.encode(), salt, 50000)
    return f"{salt.hex()}:{hashed.hex()}"

def verify_pin(stored_hash: str, pin: str) -> bool:
    """Verify a PIN against stored hash (constant-time comparison)"""
    try:
        salt_hex, stored = stored_hash.split(':')
        salt = bytes.fromhex(salt_hex)
        provided = hashlib.pbkdf2_hmac('sha256', pin.encode(), salt, 50000)
        return secrets.compare_digest(stored, provided.hex())
    except Exception:
        return False

def generate_unique_pin(existing_pins: set) -> str:
    """Generate a unique 6-digit PIN"""
    for _ in range(1000):
        pin = f"{secrets.randbelow(1000000):06d}"
        if pin not in existing_pins:
            return pin
    raise ValueError("Could not generate unique PIN")

def generate_share_token() -> str:
    """Generate a cryptographically secure share token"""
    return secrets.token_urlsafe(16)

def build_share_snapshot(user_data: dict, class_id: str) -> dict | None:
    """Extract class + students + grades + categories for a share snapshot"""
    cls = None
    for c in user_data.get('classes', []):
        if c.get('id') == class_id:
            cls = c
            break
    if not cls:
        return None

    return {
        'students': cls.get('students', []),
        'categories': user_data.get('categories', []),
        'subjects': cls.get('subjects', []),
        'plusMinusGradeSettings': user_data.get('plusMinusGradeSettings', {
            'startGrade': 3, 'plusValue': 0.5, 'minusValue': 0.5
        })
    }

def update_active_shares_for_user(user_id: str, user_data: dict):
    """Update all active share snapshots for a user"""
    db = load_db()
    if 'class_shares' not in db:
        return

    updated = False
    for token, share in db['class_shares'].items():
        if share.get('user_id') != user_id or not share.get('active', False):
            continue
        # Check if share has expired
        expires_at = share.get('expires_at')
        if expires_at and datetime.fromisoformat(expires_at) < datetime.now():
            share['active'] = False
            updated = True
            continue
        # Update snapshot
        snapshot = build_share_snapshot(user_data, share['class_id'])
        if snapshot:
            # Encrypt the updated snapshot
            encrypted_snapshot = encrypt_share_data(snapshot, MASTER_SHARE_KEY)
            share['encrypted_data'] = encrypted_snapshot
            # Update class name in case it changed
            for c in user_data.get('classes', []):
                if c.get('id') == share['class_id']:
                    share['class_name'] = c.get('name', share.get('class_name', ''))
                    break
            updated = True

    if updated:
        save_db(db)

def init_db():
    """Initialize database with default structure"""
    if not DB_PATH.exists():
        default_data = {
            "users": {},
            "sessions": {},
            "user_data": {},
            "class_shares": {}
        }
        save_db(default_data)

def load_db():
    """Load database from JSON file"""
    try:
        with open(DB_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        # Ensure class_shares key exists
        if 'class_shares' not in data:
            data['class_shares'] = {}
        return data
    except (FileNotFoundError, json.JSONDecodeError):
        init_db()
        return load_db()


def migrate_plaintext_shares():
    """Migrate any existing plaintext shares to encrypted format"""
    db = load_db()
    updated = False
    
    for token, share in db.get('class_shares', {}).items():
        # Check if this share has plaintext data (old format)
        if 'data' in share and 'encrypted_data' not in share:
            # Encrypt the existing data
            snapshot = share['data']
            encrypted_snapshot = encrypt_share_data(snapshot, MASTER_SHARE_KEY)
            
            # Replace plaintext data with encrypted data
            del share['data']
            share['encrypted_data'] = encrypted_snapshot
            updated = True
            
            print(f"Migrated share {token[:8]} to encrypted format")
    
    if updated:
        save_db(db)
        print("Completed migration of plaintext shares to encrypted format")

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

    # Clean up expired/inactive shares
    if 'class_shares' in db:
        shares_to_delete = []
        for token, share in db['class_shares'].items():
            # Check if share is marked as inactive or expired
            if not share.get('active', True):
                # Always delete inactive shares (not just mark as inactive)
                shares_to_delete.append(token)
            else:
                # Check if share has expired
                expires_at = share.get('expires_at')
                if expires_at:
                    exp = datetime.fromisoformat(expires_at)
                    if exp < now:
                        # Mark as inactive first, then delete if older than 1 day
                        share['active'] = False
                        if exp + timedelta(days=1) < now:
                            shares_to_delete.append(token)
                    # Delete shares that expired more than 30 days ago
                    elif exp + timedelta(days=30) < now:
                        shares_to_delete.append(token)
        for token in shares_to_delete:
            del db['class_shares'][token]

    save_db(db)
    return None

def save_user_data(user_id: str, data, encryption_key: bytes = None, session_token: str = None):
    """Save user data (ALWAYS encrypted - encryption_key is required)"""
    if not encryption_key:
        raise ValueError("Encryption key is required to save user data securely")

    db = load_db()
    # Store encrypted data
    encrypted = encrypt_user_data(data, encryption_key)
    db["user_data"][user_id] = {"encrypted": True, "data": encrypted}
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
            'message': 'backend.usernameLength',
            'user_id': None
        }

    if not username.replace('_', '').isalnum():
        return {
            'success': False,
            'message': 'backend.usernameChars',
            'user_id': None
        }

    # Validate email
    email = email.strip().lower()
    if '@' not in email or '.' not in email:
        return {
            'success': False,
            'message': 'backend.invalidEmail',
            'user_id': None
        }

    # Validate password
    if len(password) < 8:
        return {
            'success': False,
            'message': 'backend.passwordLength',
            'user_id': None
        }

    db = load_db()

    # Check if user already exists
    if email in db["users"]:
        return {
            'success': False,
            'message': 'backend.userExists',
            'user_id': None
        }

    # Create user with unique ID
    # Collect all existing user IDs to ensure uniqueness
    existing_ids = set()
    for user_data in db["users"].values():
        existing_ids.add(user_data.get("id"))
    for user_id_key in db.get("user_data", {}).keys():
        existing_ids.add(user_id_key)

    # Generate unique ID using UUID to prevent collisions
    import uuid
    user_id = str(uuid.uuid4())[:8]  # Use first 8 chars of UUID

    # Double-check uniqueness (should never happen with UUID, but safety first)
    max_attempts = 100
    attempts = 0
    while user_id in existing_ids and attempts < max_attempts:
        user_id = str(uuid.uuid4())[:8]
        attempts += 1

    if user_id in existing_ids:
        return {
            'success': False,
            'message': 'backend.error',
            'user_id': None
        }

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
        'message': 'backend.registrationSuccess',
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
            'message': 'backend.invalidCredentials',
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
        'message': 'backend.loginSuccess',
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

app.secret_key = 'eea304a198d6a9a860b2963de5991c3319040b665f2b912248ddc5be1c9f01f7' # Default secret key for session management. Change in production!



@app.before_serving
async def startup():
    """Initialize database on startup"""
    print("Initializing JSON database...")
    init_db()
    migrate_plaintext_shares()  # Migrate any existing plaintext shares
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

@app.route('/service-worker.js')
async def service_worker():
    """Serve service worker from root scope"""
    response = await send_file('static/service-worker.js')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['Service-Worker-Allowed'] = '/'
    response.headers['Content-Type'] = 'application/javascript'
    return response


@app.route('/.well-known/assetlinks.json')
async def assetlinks():
    """Digital Asset Links for TWA verification"""
    response = await send_file('static/.well-known/assetlinks.json')
    response.headers['Content-Type'] = 'application/json'
    return response


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
        return jsonify({'success': False, 'message': 'backend.invalidRequest'}), 400

    username = data.get('username', '')
    email = data.get('email', '')
    password = data.get('password', '')
    password_confirm = data.get('password_confirm', '')

    if not all([username, email, password, password_confirm]):
        return jsonify({'success': False, 'message': 'backend.fillAllFields'}), 400

    if password != password_confirm:
        return jsonify({'success': False, 'message': 'backend.passwordsMismatch'}), 400

    result = register_user(username, email, password)
    status_code = 200 if result['success'] else 400

    return jsonify(result), status_code


@app.route('/api/login', methods=['POST'])
@rate_limit('login')
async def api_login():
    """Log in a user"""
    data = await request.get_json()

    if not data:
        return jsonify({'success': False, 'message': 'backend.invalidRequest'}), 400

    email = data.get('email', '')
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'success': False, 'message': 'backend.fillAllFields'}), 400

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

    response = await make_response(jsonify({'success': True, 'message': 'backend.loggedOut'}))
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

        response = await make_response(jsonify({'success': True, 'message': 'backend.accountDeleted'}))
        response.delete_cookie('session_token')
        return response

    except Exception as e:
        print(f"Error deleting account for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'message': 'backend.error'}), 500


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
        return jsonify({'success': False, 'message': 'backend.invalidRequest'}), 400

    # SECURITY: Require encryption key to save data
    if not encryption_key:
        print(f"Warning: No encryption key for user {user_id} - rejecting save request")
        return jsonify({
            'success': False,
            'message': 'backend.sessionExpired',
            'requireRelogin': True
        }), 401

    try:
        # Debug: Log the received data
        print(f"Received data for user {user_id}")
        print(f"Data preview: {len(data.get('classes', []))} classes, {len(data.get('categories', []))} categories")

        # Save complete user data to JSON database (encrypted) and update cache
        save_user_data(user_id, data, encryption_key, token)

        # Update any active share snapshots for this user
        update_active_shares_for_user(user_id, data)

        print(f"Data successfully saved (encrypted) for user {user_id}")
        return jsonify({'success': True, 'message': 'backend.dataSaved'})

    except Exception as e:
        print(f"Error saving data for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'message': 'backend.error'}), 500


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


# ============ Student Access (Share) API ============

@app.route('/api/share/class', methods=['POST'])
@rate_limit('share_manage')
@login_required
async def api_create_share():
    """Create a new share for a class with PINs for each student"""
    user_id = request.user['id']  # type: ignore
    token = get_token_from_request()
    encryption_key = get_encryption_key_for_session(token)
    data = await request.get_json()

    if not data:
        return jsonify({'success': False, 'message': 'backend.invalidRequest'}), 400

    class_id = data.get('class_id')
    if not class_id:
        return jsonify({'success': False, 'message': 'backend.invalidRequest'}), 400

    expires_hours = int(data.get('expires_hours', 168))  # Default 7 days
    visibility = data.get('visibility', {
        'grades': True, 'average': True, 'finalGrade': True,
        'categoryBreakdown': False, 'chart': False
    })

    # Load user data to build snapshot
    user_data = get_user_data_cached(user_id, token, encryption_key)
    if not user_data:
        return jsonify({'success': False, 'message': 'backend.error'}), 500

    # Find the class
    cls = None
    for c in user_data.get('classes', []):
        if c.get('id') == class_id:
            cls = c
            break
    if not cls:
        return jsonify({'success': False, 'message': 'backend.classNotFound'}), 404

    # Check if a share already exists for this class
    db = load_db()
    for existing_token, existing_share in db.get('class_shares', {}).items():
        if existing_share.get('user_id') == user_id and existing_share.get('class_id') == class_id and existing_share.get('active'):
            return jsonify({'success': False, 'message': 'backend.shareExists'}), 409

    # Generate share token
    share_token = generate_share_token()

    # Generate PINs for each student
    existing_pins = set()
    students_pins = {}  # student_id -> {pin_hash, name, pin (cleartext for response only)}
    cleartext_pins = {}  # student_id -> pin (returned to teacher once)

    for student in cls.get('students', []):
        pin = generate_unique_pin(existing_pins)
        existing_pins.add(pin)
        students_pins[student['id']] = {
            'pin_hash': hash_pin(pin),
            'name': student.get('name', '')
        }
        cleartext_pins[student['id']] = pin

    # Build snapshot
    snapshot = build_share_snapshot(user_data, class_id)
    if not snapshot:
        return jsonify({'success': False, 'message': 'backend.error'}), 500

    # Get teacher name
    teacher_name = user_data.get('teacherName', '') or request.user.get('username', '')  # type: ignore

    # Encrypt the snapshot data before storing
    encrypted_snapshot = encrypt_share_data(snapshot, MASTER_SHARE_KEY)

    # Store share
    now = datetime.now()
    share_data = {
        'user_id': user_id,
        'class_id': class_id,
        'class_name': cls.get('name', ''),
        'teacher_name': teacher_name,
        'created_at': now.isoformat(),
        'expires_at': (now + timedelta(hours=expires_hours)).isoformat(),
        'active': True,
        'visibility': visibility,
        'students': students_pins,
        'encrypted_data': encrypted_snapshot  # Store encrypted data
    }

    db['class_shares'][share_token] = share_data
    save_db(db)

    # Return share info with cleartext PINs (shown once to teacher)
    pin_list = []
    for student in cls.get('students', []):
        pin_list.append({
            'student_id': student['id'],
            'name': student.get('name', ''),
            'pin': cleartext_pins.get(student['id'], '')
        })

    return jsonify({
        'success': True,
        'token': share_token,
        'expires_at': share_data['expires_at'],
        'pins': pin_list
    })


@app.route('/api/share/class/<share_token>', methods=['PUT'])
@rate_limit('share_manage')
@login_required
async def api_update_share(share_token):
    """Update visibility or expiration of an existing share"""
    user_id = request.user['id']  # type: ignore
    data = await request.get_json()

    if not data:
        return jsonify({'success': False, 'message': 'backend.invalidRequest'}), 400

    db = load_db()
    share = db.get('class_shares', {}).get(share_token)

    if not share or share.get('user_id') != user_id:
        return jsonify({'success': False, 'message': 'backend.shareNotFound'}), 404

    # Update visibility
    if 'visibility' in data:
        share['visibility'] = data['visibility']

    # Update expiration
    if 'expires_hours' in data:
        expires_hours = int(data['expires_hours'])
        share['expires_at'] = (datetime.now() + timedelta(hours=expires_hours)).isoformat()
        share['active'] = True  # Re-activate if was expired

    save_db(db)
    return jsonify({'success': True, 'message': 'backend.shareUpdated'})


@app.route('/api/share/class/<share_token>', methods=['DELETE'])
@rate_limit('share_manage')
@login_required
async def api_revoke_share(share_token):
    """Revoke (delete) a share"""
    user_id = request.user['id']  # type: ignore

    db = load_db()
    share = db.get('class_shares', {}).get(share_token)

    if not share or share.get('user_id') != user_id:
        return jsonify({'success': False, 'message': 'backend.shareNotFound'}), 404

    # Completely remove the share instead of just deactivating
    del db['class_shares'][share_token]
    save_db(db)
    return jsonify({'success': True, 'message': 'backend.shareRevoked'})


@app.route('/api/share/class/<share_token>/regenerate-pins', methods=['POST'])
@rate_limit('share_manage')
@login_required
async def api_regenerate_pins(share_token):
    """Regenerate all PINs for a share"""
    user_id = request.user['id']  # type: ignore

    db = load_db()
    share = db.get('class_shares', {}).get(share_token)

    if not share or share.get('user_id') != user_id:
        return jsonify({'success': False, 'message': 'backend.shareNotFound'}), 404

    if not share.get('active'):
        return jsonify({'success': False, 'message': 'backend.shareNotActive'}), 400

    # Regenerate PINs
    existing_pins = set()
    cleartext_pins = {}
    pin_list = []

    for student_id, student_info in share.get('students', {}).items():
        pin = generate_unique_pin(existing_pins)
        existing_pins.add(pin)
        student_info['pin_hash'] = hash_pin(pin)
        cleartext_pins[student_id] = pin
        pin_list.append({
            'student_id': student_id,
            'name': student_info.get('name', ''),
            'pin': pin
        })

    save_db(db)
    return jsonify({'success': True, 'pins': pin_list})


@app.route('/api/share/class/status/<class_id>', methods=['GET'])
@rate_limit('share_manage')
@login_required
async def api_get_share_status(class_id):
    """Get the share status for a class"""
    user_id = request.user['id']  # type: ignore

    db = load_db()
    for token, share in db.get('class_shares', {}).items():
        if share.get('user_id') == user_id and share.get('class_id') == class_id:
            # Check if share is active and not expired
            if share.get('active'):
                expires_at = share.get('expires_at')
                if expires_at and datetime.fromisoformat(expires_at) < datetime.now():
                    # Share has expired, remove it completely
                    del db['class_shares'][token]
                    save_db(db)
                    return jsonify({'success': True, 'has_share': False})
                
                return jsonify({
                    'success': True,
                    'has_share': True,
                    'token': token,
                    'class_name': share.get('class_name', ''),
                    'created_at': share.get('created_at', ''),
                    'expires_at': share.get('expires_at', ''),
                    'visibility': share.get('visibility', {}),
                    'student_count': len(share.get('students', {}))
                })

    return jsonify({'success': True, 'has_share': False})


# ============ Public Student Access ============

@app.route('/grades/<share_token>')
async def student_grades_page(share_token):
    """Student-facing page for viewing grades"""
    db = load_db()
    share = db.get('class_shares', {}).get(share_token)

    error = None
    if not share:
        error = 'invalid'
    elif not share.get('active'):
        error = 'revoked'
    else:
        expires_at = share.get('expires_at')
        if expires_at and datetime.fromisoformat(expires_at) < datetime.now():
            error = 'expired'

    return await render_template('student_grades.html',
        token=share_token,
        error=error,
        class_name=share.get('class_name', '') if share else '',
        teacher_name=share.get('teacher_name', '') if share else ''
    )


@app.route('/api/grades/<share_token>/verify', methods=['POST'])
@rate_limit('pin_verify')
async def api_verify_pin(share_token):
    """Verify student PIN and return grade data"""
    data = await request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'backend.invalidRequest'}), 400

    pin = data.get('pin', '')
    if not pin or len(pin) != 6 or not pin.isdigit():
        return jsonify({'success': False, 'message': 'backend.invalidPin'}), 400

    db = load_db()
    share = db.get('class_shares', {}).get(share_token)

    if not share:
        return jsonify({'success': False, 'message': 'backend.invalidAccessLink'}), 404

    if not share.get('active'):
        return jsonify({'success': False, 'message': 'backend.accessRevoked'}), 403

    expires_at = share.get('expires_at')
    if expires_at and datetime.fromisoformat(expires_at) < datetime.now():
        return jsonify({'success': False, 'message': 'backend.accessExpired'}), 403

    # Find student by PIN
    matched_student_id = None
    for student_id, student_info in share.get('students', {}).items():
        if verify_pin(student_info.get('pin_hash', ''), pin):
            matched_student_id = student_id
            break

    if not matched_student_id:
        return jsonify({'success': False, 'message': 'backend.wrongPin'}), 401

    # Get student data from encrypted snapshot
    encrypted_data = share.get('encrypted_data')
    if not encrypted_data:
        return jsonify({'success': False, 'message': 'backend.error'}), 500
    
    # Decrypt the snapshot data
    snapshot = decrypt_share_data(encrypted_data, MASTER_SHARE_KEY)
    
    student_data = None
    for s in snapshot.get('students', []):
        if s.get('id') == matched_student_id:
            student_data = s
            break

    if not student_data:
        return jsonify({'success': False, 'message': 'backend.studentNotFound'}), 404

    return jsonify({
        'success': True,
        'student': {
            'name': student_data.get('name', ''),
            'grades': student_data.get('grades', [])
        },
        'class_name': share.get('class_name', ''),
        'teacher_name': share.get('teacher_name', ''),
        'categories': snapshot.get('categories', []),
        'subjects': snapshot.get('subjects', []),
        'plusMinusGradeSettings': snapshot.get('plusMinusGradeSettings', {}),
        'visibility': share.get('visibility', {})
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=1601, debug=True)
