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
EduGrade Authentication Module
Token-based authentication with secure session management
"""

import secrets
import re
from datetime import datetime, timedelta
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
from quart import request, jsonify

from database import get_db

# Session duration (7 days)
SESSION_DURATION = timedelta(days=7)


def generate_session_token():
    """Generate a secure session token"""
    return secrets.token_hex(32)


async def register_user(username: str, email: str, password: str) -> dict:
    """
    Register a new user
    Returns: {'success': bool, 'message': str, 'user_id': int|None}
    """
    # Validate username
    username = username.strip()
    if len(username) < 3 or len(username) > 50:
        return {
            'success': False,
            'message': 'Benutzername muss zwischen 3 und 50 Zeichen lang sein.',
            'user_id': None
        }

    if not re.match(r'^[a-zA-Z0-9_]+$', username):
        return {
            'success': False,
            'message': 'Benutzername darf nur Buchstaben, Zahlen und Unterstriche enthalten.',
            'user_id': None
        }

    # Validate email
    email = email.strip().lower()
    if not re.match(r'^[^@]+@[^@]+\.[^@]+$', email):
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

    db = await get_db()
    try:
        # Check if username or email already exists
        cursor = await db.execute(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            (username, email)
        )
        if await cursor.fetchone():
            await db.close()
            return {
                'success': False,
                'message': 'Benutzername oder E-Mail bereits vergeben.',
                'user_id': None
            }

        # Hash password and insert user
        password_hash = generate_password_hash(password)
        cursor = await db.execute(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
            (username, email, password_hash)
        )
        await db.commit()
        user_id = cursor.lastrowid

        # Create default settings for user
        default_ranges = '[{"grade":1,"minPercent":85,"maxPercent":100},{"grade":2,"minPercent":70,"maxPercent":84},{"grade":3,"minPercent":55,"maxPercent":69},{"grade":4,"minPercent":40,"maxPercent":54},{"grade":5,"minPercent":0,"maxPercent":39}]'
        await db.execute(
            'INSERT INTO user_settings (user_id, grade_ranges) VALUES (?, ?)',
            (user_id, default_ranges)
        )
        await db.commit()
        await db.close()

        return {
            'success': True,
            'message': 'Registrierung erfolgreich!',
            'user_id': user_id
        }

    except Exception as e:
        await db.close()
        return {
            'success': False,
            'message': 'Registrierung fehlgeschlagen. Bitte versuchen Sie es erneut.',
            'user_id': None
        }


async def login_user(email: str, password: str) -> dict:
    """
    Log in a user
    Returns: {'success': bool, 'message': str, 'token': str|None, 'user': dict|None}
    """
    email = email.strip().lower()

    db = await get_db()
    try:
        cursor = await db.execute(
            'SELECT id, username, email, password_hash FROM users WHERE email = ?',
            (email,)
        )
        user = await cursor.fetchone()

        if not user or not check_password_hash(user['password_hash'], password):
            await db.close()
            return {
                'success': False,
                'message': 'Ungueltige E-Mail oder Passwort.',
                'token': None,
                'user': None
            }

        # Create session
        token = generate_session_token()
        expires_at = datetime.utcnow() + SESSION_DURATION

        await db.execute(
            'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
            (token, user['id'], expires_at.isoformat())
        )
        await db.commit()
        await db.close()

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

    except Exception as e:
        await db.close()
        return {
            'success': False,
            'message': 'Login fehlgeschlagen. Bitte versuchen Sie es erneut.',
            'token': None,
            'user': None
        }


async def logout_user(token: str) -> bool:
    """Log out a user by invalidating their session"""
    db = await get_db()
    try:
        await db.execute('DELETE FROM sessions WHERE id = ?', (token,))
        await db.commit()
        await db.close()
        return True
    except Exception:
        await db.close()
        return False


async def get_user_from_token(token: str) -> dict | None:
    """Get user from session token"""
    if not token:
        return None

    db = await get_db()
    try:
        cursor = await db.execute('''
            SELECT u.id, u.username, u.email
            FROM users u
            JOIN sessions s ON u.id = s.user_id
            WHERE s.id = ? AND s.expires_at > datetime('now')
        ''', (token,))
        user = await cursor.fetchone()
        await db.close()

        if user:
            return {
                'id': user['id'],
                'username': user['username'],
                'email': user['email']
            }
        return None

    except Exception:
        await db.close()
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

    return None


def login_required(f):
    """Decorator to require authentication for routes"""
    @wraps(f)
    async def decorated_function(*args, **kwargs):
        token = get_token_from_request()
        user = await get_user_from_token(token)

        if not user:
            return jsonify({'error': 'Authentication required'}), 401

        # Add user to request context
        request.user = user
        return await f(*args, **kwargs)

    return decorated_function
