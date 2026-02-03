"""
EduGrade - Quart Backend Application
Main application with all API routes
JSON-based database implementation
"""

import json
import hashlib
import secrets
import functools
from pathlib import Path
from datetime import datetime, timedelta
from quart import Quart, render_template, request, jsonify, redirect, url_for, make_response, send_file

# ============ JSON DATABASE IMPLEMENTATION ============

# Database path
DATA_DIR = Path(__file__).parent / "data"
DB_PATH = DATA_DIR / "edugrade.json"

# Ensure data directory exists
DATA_DIR.mkdir(exist_ok=True)

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
    """Remove expired sessions"""
    db = load_db()
    now = datetime.now()
    expired = []
    
    for token, session in db["sessions"].items():
        expires_at = datetime.fromisoformat(session["expires_at"])
        if expires_at < now:
            expired.append(token)
    
    for token in expired:
        del db["sessions"][token]
    
    save_db(db)
    # Explicitly return None for async function
    return None

def save_user_data(user_id: str, data):
    """Save user data"""
    db = load_db()
    db["user_data"][user_id] = data
    save_db(db)

def get_user_data(user_id: str):
    """Get user data"""
    db = load_db()
    return db["user_data"].get(user_id, {})

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

    db["users"][email] = {
        "id": user_id,
        "username": username,
        "email": email,
        "password_hash": password_hash,
        "created_at": datetime.now().isoformat()
    }

    # Initialize user data
    db["user_data"][user_id] = {
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
@login_required
async def api_get_data():
    """Get all data for the current user"""
    user_id = request.user['id'] # type: ignore
    
    try:
        print(f"Loading data for user {user_id}")
        user_data = get_user_data(user_id)
        
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
            save_user_data(user_id, user_data)
        
        print(f"Found {len(user_data.get('classes', []))} classes for user {user_id}")
        print(f"Found {len(user_data.get('categories', []))} categories for user {user_id}")
        
        print(f"Successfully loaded data for user {user_id}")
        return jsonify(user_data)

    except Exception as e:
        print(f"Error loading data for user {user_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/data', methods=['POST'])
@login_required
async def api_save_data():
    """Save all data for the current user (full sync)"""
    user_id = request.user['id'] # type: ignore
    data = await request.get_json()

    if not data:
        return jsonify({'success': False, 'message': 'Invalid request - no data received'}), 400

    try:
        # Debug: Log the received data
        print(f"Received data for user {user_id}")
        print(f"Data preview: {len(data.get('classes', []))} classes, {len(data.get('categories', []))} categories")

        # Save complete user data to JSON database
        save_user_data(user_id, data)
        
        print(f"Data successfully saved for user {user_id}")
        return jsonify({'success': True, 'message': 'Data saved successfully'})

    except Exception as e:
        print(f"Error saving data for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'message': f'Server error: {str(e)}'}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=1601, debug=True)
