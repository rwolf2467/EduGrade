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
import time
import smtplib
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict
from quart import Quart, render_template, request, jsonify, redirect, url_for, make_response, send_file
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from io import BytesIO
import base64 as b64

# Try to import qrcode, but make it optional
try:
    import qrcode
    QR_CODE_AVAILABLE = True
except ImportError:
    QR_CODE_AVAILABLE = False
    print("Warning: qrcode library not available. QR code generation will not work.")

# Try to import reportlab for PDF generation
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch, cm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False
    print("Warning: reportlab library not available. PDF generation will not work.")

# ============ RATE LIMITING ============

# Rate limit storage: {ip: {endpoint: [(timestamp, count)]}}
rate_limit_storage = defaultdict(lambda: defaultdict(list))

# Rate limit configurations: {endpoint_pattern: (max_requests, time_window_seconds)}
RATE_LIMITS = {
    'login': (5, 60),           # 5 attempts per minute
    'register': (3, 60),        # 3 attempts per minute
    'data_write': (30, 60),     # 30 writes per minute
    'data_read': (60, 60),      # 60 reads per minute
    'pin_verify': (5, 60),      # 5 PIN attempts per minute
    'share_manage': (20, 60),   # 20 share management requests per minute
    'password_reset': (3, 300), # 3 attempts per 5 minutes
    'default': (100, 60),       # 100 requests per minute default
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
CONFIG_PATH = DATA_DIR / "config.json"

# Ensure data directory exists
DATA_DIR.mkdir(exist_ok=True)

# ============ CONFIG MANAGEMENT ============

def load_or_create_config():
    """Load config from file or create a new one with secure secret key on first start"""
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                config = json.load(f)
                print("Loaded existing config.json")
                return config
        except (FileNotFoundError, json.JSONDecodeError) as e:
            print(f"Warning: Could not load config.json: {e}, creating new one")

    # First start - generate secure secret key
    print("First start detected - generating secure secret key...")
    secret_key = secrets.token_hex(64)  # 128 character hexadecimal string (512 bits)

    config = {
        "secret_key": secret_key,
        "created_at": datetime.now().isoformat(),
        "version": "1.0"
    }

    # Save config to file
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

    print(f"Created new config.json with secure secret key at {CONFIG_PATH}")
    return config

# Load config on startup
APP_CONFIG = load_or_create_config()

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

# ============ RECOVERY KEY FUNCTIONS ============

def generate_recovery_key() -> str:
    """Generate a human-readable recovery key: XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"""
    parts = [secrets.token_hex(4).upper() for _ in range(4)]
    return '-'.join(parts)

def hash_recovery_key(recovery_key: str) -> str:
    """Hash a recovery key using PBKDF2 for storage"""
    salt = secrets.token_bytes(32)
    normalized = recovery_key.upper().replace('-', '')
    hashed = hashlib.pbkdf2_hmac('sha256', normalized.encode(), salt, 200000)
    return f"{salt.hex()}:{hashed.hex()}"

def verify_recovery_key(stored_hash: str, recovery_key: str) -> bool:
    """Verify a recovery key against stored hash (constant-time comparison)"""
    try:
        salt_hex, stored = stored_hash.split(':')
        salt = bytes.fromhex(salt_hex)
        normalized = recovery_key.upper().replace('-', '')
        provided = hashlib.pbkdf2_hmac('sha256', normalized.encode(), salt, 200000)
        return secrets.compare_digest(stored, provided.hex())
    except Exception:
        return False

def derive_key_from_recovery(recovery_key: str, salt: bytes) -> bytes:
    """Derive a 256-bit key from a recovery key using PBKDF2"""
    normalized = recovery_key.upper().replace('-', '')
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    return kdf.derive(normalized.encode())

def encrypt_bytes(data: bytes, key: bytes) -> str:
    """Encrypt raw bytes with AES-256-GCM, return base64 string"""
    nonce = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, data, None)
    return base64.b64encode(nonce + ciphertext).decode('ascii')

def decrypt_bytes(encrypted: str, key: bytes) -> bytes:
    """Decrypt base64 AES-256-GCM ciphertext back to raw bytes"""
    raw = base64.b64decode(encrypted)
    nonce = raw[:12]
    ciphertext = raw[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None)

def decrypt_recovery_key(encrypted_recovery_key: str, email: str) -> str:
    """Decrypt the encrypted recovery key using the user's email as the key derivation input"""
    # The recovery key is stored encrypted with a key derived from the email
    # We need to derive the same key that was used for encryption
    email_key = hashlib.sha256(email.lower().strip().encode()).digest()
    decrypted = decrypt_bytes(encrypted_recovery_key, email_key)
    return decrypted.decode('utf-8')

def encrypt_recovery_key(recovery_key: str, email: str) -> str:
    """Encrypt the recovery key using the user's email as the key derivation input"""
    email_key = hashlib.sha256(email.lower().strip().encode()).digest()
    return encrypt_bytes(recovery_key.encode('utf-8'), email_key)

# ============ EMAIL / SMTP FUNCTIONS ============

def smtp_is_configured() -> bool:
    """Return True if SMTP settings are present in config"""
    cfg = APP_CONFIG
    return bool(cfg.get('smtp_host') and cfg.get('smtp_user') and cfg.get('smtp_from'))

def _send_email_sync(to_addr: str, subject: str, html_body: str, text_body: str, pdf_attachment: bytes = None, pdf_filename: str = None):
    """Send an email synchronously (run in executor to avoid blocking)"""
    cfg = APP_CONFIG
    
    # Create message with mixed content for attachment
    msg = MIMEMultipart('mixed')
    msg['Subject'] = subject
    msg['From'] = cfg.get('smtp_from', cfg.get('smtp_user', ''))
    msg['To'] = to_addr
    
    # Create alternative part for text/html
    msg_alternative = MIMEMultipart('alternative')
    msg.attach(msg_alternative)
    msg_alternative.attach(MIMEText(text_body, 'plain', 'utf-8'))
    msg_alternative.attach(MIMEText(html_body, 'html', 'utf-8'))

    # Attach PDF if provided
    print(f"[EMAIL] PDF attachment provided: {pdf_attachment is not None}, filename: {pdf_filename}")
    if pdf_attachment and pdf_filename:
        print(f"[EMAIL] Attaching PDF: {len(pdf_attachment)} bytes")
        from email.mime.application import MIMEApplication
        part = MIMEApplication(pdf_attachment, Name=pdf_filename)
        part['Content-Disposition'] = f'attachment; filename="{pdf_filename}"'
        msg.attach(part)
        print(f"[EMAIL] PDF attached successfully. Message parts: {len(msg.get_payload())}")
    else:
        print(f"[EMAIL] No PDF attachment. pdf_attachment={pdf_attachment is not None}, pdf_filename={pdf_filename}")

    host = cfg.get('smtp_host', '')
    port = int(cfg.get('smtp_port', 587))
    user = cfg.get('smtp_user', '')
    password = cfg.get('smtp_password', '')
    use_tls = cfg.get('smtp_use_tls', True)

    if use_tls:
        server = smtplib.SMTP(host, port, timeout=10)
        server.ehlo()
        server.starttls()
    else:
        server = smtplib.SMTP_SSL(host, port, timeout=10)
    server.login(user, password)
    server.sendmail(msg['From'], [to_addr], msg.as_string())
    server.quit()
    print(f"[EMAIL] Email sent successfully to {to_addr}")

async def send_password_reset_email(to_addr: str, username: str, reset_token: str):
    """Send a password reset email (fires in background thread)"""
    app_url = APP_CONFIG.get('app_url', 'http://localhost:5000').rstrip('/')
    reset_url = f"{app_url}/login?token={reset_token}"

    subject = "EduGrade – Passwort zurücksetzen / Reset your password"

    html_body = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem;">
        <h2 style="margin-bottom: 0.5rem;">EduGrade – Passwort zurücksetzen</h2>
        <p>Hallo {username},</p>
        <p>du hast einen Passwort-Reset angefordert. <strong>Achtung: Da kein Recovery Key vorhanden ist, werden dabei alle deine Daten (Klassen, Schüler, Noten) unwiderruflich gelöscht.</strong></p>
        <p>
            <a href="{reset_url}" style="display:inline-block;padding:0.75rem 1.5rem;background:#9333ea;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">Passwort jetzt zurücksetzen</a>
        </p>
        <p style="color:#888;font-size:0.875rem;">Dieser Link ist 1 Stunde gültig. Falls du keinen Reset angefordert hast, ignoriere diese E-Mail.</p>
        <hr style="border:none;border-top:1px solid #333;margin:1.5rem 0;">
        <p style="color:#888;font-size:0.75rem;">EduGrade &mdash; <a href="{app_url}">{app_url}</a></p>
    </div>
    """

    text_body = (
        f"EduGrade – Passwort zurücksetzen\n\n"
        f"Hallo {username},\n\n"
        f"du hast einen Passwort-Reset angefordert.\n"
        f"ACHTUNG: Alle deine Daten werden dabei unwiderruflich gelöscht (kein Recovery Key vorhanden).\n\n"
        f"Link: {reset_url}\n\n"
        f"Dieser Link ist 1 Stunde gültig.\n"
        f"Falls du keinen Reset angefordert hast, ignoriere diese E-Mail."
    )

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _send_email_sync, to_addr, subject, html_body, text_body)

def generate_recovery_key_pdf(username: str, recovery_key: str) -> bytes:
    """Generate a PDF document with the recovery key"""
    if not REPORTLAB_AVAILABLE:
        raise RuntimeError("reportlab library not available")
    
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#9333EA'),
        spaceAfter=12,
        alignment=TA_CENTER
    )
    
    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#666666'),
        spaceAfter=30,
        alignment=TA_CENTER
    )
    
    warning_style = ParagraphStyle(
        'WarningBox',
        parent=styles['Normal'],
        fontSize=12,
        textColor=colors.HexColor('#DC2626'),
        backColor=colors.HexColor('#FEF2F2'),
        borderColor=colors.HexColor('#DC2626'),
        borderWidth=1,
        leftIndent=20,
        rightIndent=20,
        spaceAfter=20,
        spaceBefore=20
    )
    
    key_style = ParagraphStyle(
        'RecoveryKey',
        parent=styles['Heading2'],
        fontSize=16,
        textColor=colors.HexColor('#166534'),
        backColor=colors.HexColor('#F0FDF4'),
        borderColor=colors.HexColor('#166534'),
        borderWidth=2,
        leftIndent=20,
        rightIndent=20,
        spaceAfter=20,
        spaceBefore=20,
        alignment=TA_CENTER
    )
    
    info_style = ParagraphStyle(
        'InfoBox',
        parent=styles['Normal'],
        fontSize=11,
        textColor=colors.HexColor('#444444'),
        backColor=colors.HexColor('#EFF6FF'),
        borderColor=colors.HexColor('#3B82F6'),
        borderWidth=1,
        leftIndent=20,
        rightIndent=20,
        spaceAfter=15
    )
    
    story = []
    
    try:
        # Title
        story.append(Paragraph("EduGrade Recovery Kit", title_style))
        story.append(Spacer(1, 0.2*inch))
        
        # Subtitle
        story.append(Paragraph(f"Recovery Key for: {username}", subtitle_style))
        story.append(Spacer(1, 0.3*inch))
        
        # Warning
        warning_text = """
        <b>⚠ IMPORTANT: Store this document safely!</b><br/>
        This recovery key is the ONLY way to restore access to your account if you forget your password.
        Without this key, all your data (classes, students, grades) will be permanently lost.
        """
        story.append(Paragraph(warning_text, warning_style))
        story.append(Spacer(1, 0.2*inch))
        
        # Recovery Key - display it in the original format (XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX)
        story.append(Paragraph(f"<b>Your Recovery Key:</b><br/><span fontSize='18'>{recovery_key}</span>", key_style))
        story.append(Spacer(1, 0.3*inch))
        
        # Instructions
        info_text = """
        <b>How to use this Recovery Key:</b><br/>
        1. Keep this document in a safe place (e.g., with important papers or in a secure digital vault)<br/>
        2. If you forget your password, go to the login page and click "Forgot Password?"<br/>
        3. Enter your email address and this recovery key to reset your password<br/>
        4. Your data will be preserved when using the recovery key
        """
        story.append(Paragraph(info_text, info_style))
        story.append(Spacer(1, 0.2*inch))
        
        # Footer info
        footer_text = f"""
        <i>Generated on: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</i><br/>
        <i>EduGrade - Secure Grade Management System</i>
        """
        story.append(Paragraph(footer_text, styles['Normal']))
        
        doc.build(story)
        
        pdf_bytes = buffer.getvalue()
        buffer.close()
        print(f"PDF generated successfully: {len(pdf_bytes)} bytes")
        return pdf_bytes
    except Exception as e:
        buffer.close()
        print(f"PDF generation failed: {e}")
        import traceback
        traceback.print_exc()
        raise

async def send_recovery_key_email(to_addr: str, username: str, recovery_key: str, language: str = 'de'):
    """Send the recovery key as a PDF attachment via email"""
    app_url = APP_CONFIG.get('app_url', 'http://localhost:5000').rstrip('/')

    # Language-specific content
    if language == 'en':
        subject = "EduGrade – Your Recovery Kit"
        html_body = f"""
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem;">
            <h2 style="margin-bottom: 0.5rem;">EduGrade Recovery Kit</h2>
            <p>Hello {username},</p>
            <p>You have requested your recovery key. Attached you will find your <strong>"EduGrade Recovery Kit"</strong> as a PDF.</p>
            <p><strong>Important:</strong></p>
            <ul>
                <li>Keep this document in a safe place</li>
                <li>Without this recovery key, your data (classes, students, grades) cannot be recovered if you forget your password</li>
                <li>You can use the recovery key at login under "Forgot Password?"</li>
            </ul>
            <p style="color:#888;font-size:0.875rem;">If you did not make this request, you should change your password immediately.</p>
            <hr style="border:none;border-top:1px solid #333;margin:1.5rem 0;">
            <p style="color:#888;font-size:0.75rem;">EduGrade &mdash; <a href="{app_url}">{app_url}</a></p>
        </div>
        """
        text_body = (
            f"EduGrade Recovery Kit\n\n"
            f"Hello {username},\n\n"
            f"You have requested your recovery key. Attached you will find your Recovery Kit as a PDF.\n\n"
            f"IMPORTANT:\n"
            f"- Keep this document in a safe place\n"
            f"- Without this recovery key, your data cannot be recovered if you forget your password\n\n"
            f"If you did not make this request, you should change your password immediately."
        )
    else:  # German (default)
        subject = "EduGrade – Dein Recovery Kit"
        html_body = f"""
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem;">
            <h2 style="margin-bottom: 0.5rem;">EduGrade Recovery Kit</h2>
            <p>Hallo {username},</p>
            <p>du hast deinen Recovery Key angefordert. Im Anhang findest du dein <strong>"EduGrade Recovery Kit"</strong> als PDF.</p>
            <p><strong>Wichtig:</strong></p>
            <ul>
                <li>Bewahre dieses Dokument an einem sicheren Ort auf</li>
                <li>Ohne diesen Recovery Key können deine Daten (Klassen, Schüler, Noten) bei Passwortverlust nicht wiederhergestellt werden</li>
                <li>Du kannst den Recovery Key beim Login unter "Passwort vergessen?" verwenden</li>
            </ul>
            <p style="color:#888;font-size:0.875rem;">Falls du diese Anfrage nicht gestellt hast, solltest du dein Passwort umgehend ändern.</p>
            <hr style="border:none;border-top:1px solid #333;margin:1.5rem 0;">
            <p style="color:#888;font-size:0.75rem;">EduGrade &mdash; <a href="{app_url}">{app_url}</a></p>
        </div>
        """
        text_body = (
            f"EduGrade Recovery Kit\n\n"
            f"Hallo {username},\n\n"
            f"du hast deinen Recovery Key angefordert. Im Anhang findest du dein Recovery Kit als PDF.\n\n"
            f"WICHTIG:\n"
            f"- Bewahre dieses Dokument an einem sicheren Ort auf\n"
            f"- Ohne diesen Recovery Key können deine Daten bei Passwortverlust nicht wiederhergestellt werden\n\n"
            f"Falls du diese Anfrage nicht gestellt hast, solltest du dein Passwort umgehend ändern."
        )

    # Generate PDF
    print(f"[RECOVERY EMAIL] Starting PDF generation for {to_addr}...")
    pdf_bytes = None
    pdf_error = None
    try:
        pdf_bytes = generate_recovery_key_pdf(username, recovery_key)
        print(f"[RECOVERY EMAIL] PDF generated: {len(pdf_bytes)} bytes")
    except Exception as e:
        pdf_error = str(e)
        print(f"[RECOVERY EMAIL] PDF generation error: {e}")

    print(f"[RECOVERY EMAIL] Sending email to {to_addr} with PDF={pdf_bytes is not None}...")
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        _send_email_sync,
        to_addr,
        subject,
        html_body,
        text_body,
        pdf_bytes,
        "EduGrade_Recovery_Kit.pdf" if pdf_bytes else None
    )

    if pdf_error:
        print(f"[RECOVERY EMAIL] Sent without PDF attachment due to: {pdf_error}")
    elif pdf_bytes:
        print(f"[RECOVERY EMAIL] Sent with PDF attachment ({len(pdf_bytes)} bytes)")
    else:
        print("[RECOVERY EMAIL] Sent without PDF attachment (reportlab not available)")

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

def get_student_display_name(student: dict) -> str:
    """Build display name from firstName/lastName/middleName fields, with fallback to legacy name field"""
    first = student.get('firstName', '')
    middle = student.get('middleName', '')
    last = student.get('lastName', '')
    if first or last:
        parts = [p for p in [first, middle, last] if p]
        return ' '.join(parts)
    return student.get('name', '')

def build_share_snapshot(user_data: dict, class_id: str) -> dict | None:
    """Extract class + students + grades + categories for a share snapshot"""
    cls = None
    for c in user_data.get('classes', []):
        if c.get('id') == class_id:
            cls = c
            break
    if not cls:
        return None

    # Get the current year from the class to access students
    current_year_id = cls.get('currentYearId')
    current_year = None
    if current_year_id and cls.get('years'):
        for year in cls.get('years', []):
            if year.get('id') == current_year_id:
                current_year = year
                break
    
    # Get students from the current year if available, otherwise from class (fallback for backward compatibility)
    students = current_year.get('students', []) if current_year else cls.get('students', [])

    return {
        'students': students,
        'categories': user_data.get('categories', []),
        'subjects': current_year.get('subjects', []) if current_year else cls.get('subjects', []),
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
        # Ensure optional keys exist
        if 'class_shares' not in data:
            data['class_shares'] = {}
        if 'password_reset_tokens' not in data:
            data['password_reset_tokens'] = {}
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

    # Clean up expired password reset tokens
    if 'password_reset_tokens' in db:
        expired_tokens = [
            t for t, v in db['password_reset_tokens'].items()
            if datetime.fromisoformat(v['expires_at']) < now
        ]
        for t in expired_tokens:
            del db['password_reset_tokens'][t]

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

    # Derive the data encryption key (DEK) from the password
    encryption_key = derive_encryption_key(password, encryption_salt)

    # Generate a recovery key and store an encrypted copy of the DEK
    recovery_key = generate_recovery_key()
    recovery_salt = secrets.token_bytes(32)
    recovery_derived_key = derive_key_from_recovery(recovery_key, recovery_salt)
    encrypted_dek = encrypt_bytes(encryption_key, recovery_derived_key)
    
    # Also store the recovery key encrypted (so it can be sent via email later)
    encrypted_recovery_key = encrypt_recovery_key(recovery_key, email)

    db["users"][email] = {
        "id": user_id,
        "username": username,
        "email": email,
        "password_hash": password_hash,
        "encryption_salt": encryption_salt.hex(),
        "recovery_key_hash": hash_recovery_key(recovery_key),
        "recovery_salt": recovery_salt.hex(),
        "encrypted_dek": encrypted_dek,
        "encrypted_recovery_key": encrypted_recovery_key,
        "created_at": datetime.now().isoformat()
    }

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
        'user_id': user_id,
        'recovery_key': recovery_key
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

    # Reload user to get any updates (e.g. legacy migration above)
    db = load_db()
    user = db["users"].get(email, user)
    needs_recovery_key = not user.get('recovery_key_hash')

    return {
        'success': True,
        'message': 'backend.loginSuccess',
        'token': token,
        'needs_recovery_key': needs_recovery_key,
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

# Load version from config file
def load_version():
    """Load version information from version.json"""
    try:
        version_file = Path(__file__).parent / "version.json"
        with open(version_file, 'r', encoding='utf-8') as f:
            version_data = json.load(f)
        return version_data.get('version', '1.0.0'), version_data.get('build', '')
    except Exception as e:
        print(f"Warning: Could not load version.json: {e}")
        return '1.0.0', ''

APP_VERSION, BUILD_DATE = load_version()
VERSION_STRING = f"v{APP_VERSION} ({BUILD_DATE})" if BUILD_DATE else f"v{APP_VERSION}"

app = Quart(__name__,
            template_folder='templates',
            static_folder='static',
            static_url_path='/static')

# Use secret key from config (auto-generated on first start)
app.secret_key = APP_CONFIG['secret_key']



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

    return await render_template('index.html', user=user, app_version=APP_VERSION, version_string=VERSION_STRING)


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


# ============ Version API ============

@app.route('/api/version')
async def api_version():
    """Return current app version for update detection"""
    return jsonify({
        'version': APP_VERSION,
        'build': BUILD_DATE,
        'version_string': VERSION_STRING
    })


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


@app.route('/api/password-reset', methods=['POST'])
@rate_limit('password_reset')
async def api_password_reset():
    """Reset password using recovery key — re-encrypts data with new password, no data loss"""
    data = await request.get_json()

    if not data:
        return jsonify({'success': False, 'message': 'backend.invalidRequest'}), 400

    email = data.get('email', '').strip().lower()
    recovery_key = data.get('recovery_key', '').strip()
    new_password = data.get('new_password', '')

    if not all([email, recovery_key, new_password]):
        return jsonify({'success': False, 'message': 'backend.fillAllFields'}), 400

    if len(new_password) < 8:
        return jsonify({'success': False, 'message': 'backend.passwordLength'}), 400

    db = load_db()
    user = db["users"].get(email)

    # Always return the same error to prevent user enumeration
    if not user:
        return jsonify({'success': False, 'message': 'backend.recoveryKeyInvalid'}), 400

    # Check that recovery key infrastructure exists for this account
    if not user.get('recovery_key_hash') or not user.get('recovery_salt') or not user.get('encrypted_dek'):
        return jsonify({'success': False, 'message': 'backend.noRecoveryKey'}), 400

    # Verify the recovery key
    if not verify_recovery_key(user['recovery_key_hash'], recovery_key):
        return jsonify({'success': False, 'message': 'backend.recoveryKeyInvalid'}), 400

    try:
        # Decrypt the stored DEK using the recovery key
        recovery_salt = bytes.fromhex(user['recovery_salt'])
        recovery_derived_key = derive_key_from_recovery(recovery_key, recovery_salt)
        dek = decrypt_bytes(user['encrypted_dek'], recovery_derived_key)

        # Load and decrypt the user's data with the recovered DEK
        user_id = user['id']
        user_data_entry = db["user_data"].get(user_id, {})
        if user_data_entry.get('encrypted'):
            user_data = decrypt_user_data(user_data_entry['data'], dek)
        else:
            user_data = user_data_entry  # legacy plaintext (should not occur)

        # Derive a new DEK from the new password
        new_encryption_salt = secrets.token_bytes(32)
        new_dek = derive_encryption_key(new_password, new_encryption_salt)

        # Re-encrypt the user data with the new DEK
        encrypted_data = encrypt_user_data(user_data, new_dek)
        db["user_data"][user_id] = {"encrypted": True, "data": encrypted_data}

        # Encrypt the new DEK with the same recovery key (so recovery still works)
        new_recovery_salt = secrets.token_bytes(32)
        new_recovery_derived_key = derive_key_from_recovery(recovery_key, new_recovery_salt)
        new_encrypted_dek = encrypt_bytes(new_dek, new_recovery_derived_key)

        # Update user record
        user['password_hash'] = hash_password(new_password)
        user['encryption_salt'] = new_encryption_salt.hex()
        user['recovery_salt'] = new_recovery_salt.hex()
        user['encrypted_dek'] = new_encrypted_dek
        db["users"][email] = user

        # Invalidate all existing sessions for this user
        sessions_to_delete = [
            t for t, s in db["sessions"].items() if s["user_id"] == user_id
        ]
        for t in sessions_to_delete:
            del db["sessions"][t]
            encryption_keys.pop(t, None)
            user_data_cache.pop(t, None)

        save_db(db)
        return jsonify({'success': True, 'message': 'backend.passwordResetSuccess'})

    except Exception as e:
        print(f"Password reset error: {e}")
        return jsonify({'success': False, 'message': 'backend.error'}), 500


@app.route('/api/password-reset/email-request', methods=['POST'])
@rate_limit('password_reset')
async def api_password_reset_email_request():
    """Request a password reset link by email (for accounts without a recovery key).
    Always returns the same message to prevent user enumeration."""
    data = await request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'backend.invalidRequest'}), 400

    email = data.get('email', '').strip().lower()
    if not email:
        return jsonify({'success': False, 'message': 'backend.fillAllFields'}), 400

    if not smtp_is_configured():
        return jsonify({'success': False, 'message': 'backend.smtpNotConfigured'}), 400

    # Always respond the same way regardless of whether email exists
    generic_ok = jsonify({'success': True, 'message': 'backend.resetEmailSent'})

    db = load_db()
    user = db["users"].get(email)
    if not user:
        return generic_ok

    # Only allow email reset if there is NO recovery key (otherwise use recovery key flow)
    if user.get('recovery_key_hash'):
        # Silently succeed so as not to reveal whether recovery key exists
        return generic_ok

    # Generate a time-limited reset token (1 hour)
    reset_token = secrets.token_urlsafe(32)
    expires_at = (datetime.now() + timedelta(hours=1)).isoformat()

    db['password_reset_tokens'][reset_token] = {
        'user_email': email,
        'expires_at': expires_at,
        'used': False
    }
    save_db(db)

    try:
        await send_password_reset_email(email, user.get('username', email), reset_token)
    except Exception as e:
        print(f"Failed to send reset email to {email}: {e}")
        # Don't reveal the error to the client

    return generic_ok


@app.route('/api/recovery-key/email-request', methods=['POST'])
@rate_limit('password_reset')
async def api_recovery_key_email_request():
    """Request the recovery key to be sent via email as a PDF attachment."""
    data = await request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'backend.invalidRequest'}), 400

    email = data.get('email', '').strip().lower()
    if not email:
        return jsonify({'success': False, 'message': 'backend.fillAllFields'}), 400

    if not smtp_is_configured():
        return jsonify({'success': False, 'message': 'backend.smtpNotConfigured'}), 400

    db = load_db()
    user = db["users"].get(email)

    if not user:
        # Return success even if user doesn't exist (prevent enumeration)
        return jsonify({'success': True, 'message': 'backend.recoveryKeyEmailSent'})

    # Check if user has encrypted recovery key (new format) or only hash (old format)
    encrypted_recovery_key = user.get('encrypted_recovery_key')
    if not encrypted_recovery_key:
        return jsonify({'success': False, 'message': 'backend.noRecoveryKey'}), 404

    # Decrypt and get the recovery key
    try:
        recovery_key = decrypt_recovery_key(encrypted_recovery_key, email)
    except Exception as e:
        print(f"Failed to decrypt recovery key for {email}: {e}")
        return jsonify({'success': False, 'message': 'backend.error'}), 500

    # Get user's language preference from encrypted user data
    language = 'de'  # Default to German
    try:
        user_data_entry = db.get('user_data', {}).get(user['id'])
        if user_data_entry and user_data_entry.get('encrypted'):
            # Try to get DEK from session (works if user is logged in)
            dek = encryption_keys.get(get_token_from_request())
            if dek:
                user_data = decrypt_user_data(user_data_entry['data'], dek)
                language = user_data.get('language', 'de')
            else:
                # No session - user requested from login page
                # Try to derive DEK from recovery key (since they're using recovery key flow)
                # For now, just use German as default
                print(f"No active session for {email}, using default language 'de'")
    except Exception as e:
        print(f"Could not determine user language preference: {e}")

    try:
        await send_recovery_key_email(email, user.get('username', email), recovery_key, language)
    except Exception as e:
        print(f"Failed to send recovery key email to {email}: {e}")
        return jsonify({'success': False, 'message': 'backend.error'}), 500

    return jsonify({'success': True, 'message': 'backend.recoveryKeyEmailSent'})


@app.route('/api/password-reset/confirm-token', methods=['POST'])
@rate_limit('password_reset')
async def api_password_reset_confirm_token():
    """Reset password using an email token. DATA IS WIPED since no recovery key is available."""
    data = await request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'backend.invalidRequest'}), 400

    token = data.get('token', '').strip()
    new_password = data.get('new_password', '')

    if not token or not new_password:
        return jsonify({'success': False, 'message': 'backend.fillAllFields'}), 400

    if len(new_password) < 8:
        return jsonify({'success': False, 'message': 'backend.passwordLength'}), 400

    db = load_db()
    token_entry = db.get('password_reset_tokens', {}).get(token)

    if not token_entry:
        return jsonify({'success': False, 'message': 'backend.resetTokenInvalid'}), 400

    if token_entry.get('used'):
        return jsonify({'success': False, 'message': 'backend.resetTokenInvalid'}), 400

    if datetime.fromisoformat(token_entry['expires_at']) < datetime.now():
        return jsonify({'success': False, 'message': 'backend.resetTokenExpired'}), 400

    email = token_entry['user_email']
    user = db["users"].get(email)
    if not user:
        return jsonify({'success': False, 'message': 'backend.resetTokenInvalid'}), 400

    try:
        user_id = user['id']

        # Generate new password hash and encryption key (data will be fresh/empty)
        new_encryption_salt = secrets.token_bytes(32)
        new_dek = derive_encryption_key(new_password, new_encryption_salt)

        # Reset user data to empty initial state
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
        encrypted_data = encrypt_user_data(initial_data, new_dek)
        db["user_data"][user_id] = {"encrypted": True, "data": encrypted_data}

        # Generate a new recovery key so the account is protected going forward
        new_recovery_key = generate_recovery_key()
        new_recovery_salt = secrets.token_bytes(32)
        new_recovery_derived_key = derive_key_from_recovery(new_recovery_key, new_recovery_salt)
        new_encrypted_dek = encrypt_bytes(new_dek, new_recovery_derived_key)

        user['password_hash'] = hash_password(new_password)
        user['encryption_salt'] = new_encryption_salt.hex()
        user['recovery_key_hash'] = hash_recovery_key(new_recovery_key)
        user['recovery_salt'] = new_recovery_salt.hex()
        user['encrypted_dek'] = new_encrypted_dek
        db["users"][email] = user

        # Invalidate all existing sessions
        sessions_to_delete = [t for t, s in db["sessions"].items() if s["user_id"] == user_id]
        for t in sessions_to_delete:
            del db["sessions"][t]
            encryption_keys.pop(t, None)
            user_data_cache.pop(t, None)

        # Mark token as used
        db['password_reset_tokens'][token]['used'] = True

        save_db(db)
        return jsonify({
            'success': True,
            'message': 'backend.passwordResetSuccess',
            'recovery_key': new_recovery_key
        })

    except Exception as e:
        print(f"Token password reset error: {e}")
        return jsonify({'success': False, 'message': 'backend.error'}), 500


@app.route('/api/recovery-key/generate', methods=['POST'])
@login_required
async def api_generate_recovery_key():
    """Generate (or regenerate) a recovery key for the current user.
    Uses the DEK already held in the session — no password required."""
    token = get_token_from_request()
    user_id = request.user['id']  # type: ignore
    user_email = request.user['email']  # type: ignore

    # Get the current DEK from the session cache
    dek = encryption_keys.get(token)
    if not dek:
        return jsonify({'success': False, 'message': 'backend.sessionExpired'}), 401

    try:
        db = load_db()
        user = db["users"].get(user_email)
        if not user:
            return jsonify({'success': False, 'message': 'backend.error'}), 500

        # Generate a new recovery key and encrypt the DEK with it
        new_recovery_key = generate_recovery_key()
        new_recovery_salt = secrets.token_bytes(32)
        new_recovery_derived_key = derive_key_from_recovery(new_recovery_key, new_recovery_salt)
        new_encrypted_dek = encrypt_bytes(dek, new_recovery_derived_key)
        
        # Also encrypt the recovery key itself for email delivery
        new_encrypted_recovery_key = encrypt_recovery_key(new_recovery_key, user_email)

        user['recovery_key_hash'] = hash_recovery_key(new_recovery_key)
        user['recovery_salt'] = new_recovery_salt.hex()
        user['encrypted_dek'] = new_encrypted_dek
        user['encrypted_recovery_key'] = new_encrypted_recovery_key
        db["users"][user_email] = user

        save_db(db)
        return jsonify({'success': True, 'recovery_key': new_recovery_key})

    except Exception as e:
        print(f"Recovery key generation error: {e}")
        return jsonify({'success': False, 'message': 'backend.error'}), 500


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

    # Get the current year from the class to access students
    current_year_id = cls.get('currentYearId')
    current_year = None
    if current_year_id and cls.get('years'):
        for year in cls.get('years', []):
            if year.get('id') == current_year_id:
                current_year = year
                break
    
    # Get students from the current year if available, otherwise from class (fallback for backward compatibility)
    students = current_year.get('students', []) if current_year else cls.get('students', [])

    # Generate PINs for each student
    existing_pins = set()
    students_pins = {}  # student_id -> {pin_hash, name, pin (cleartext for response only)}
    cleartext_pins = {}  # student_id -> pin (returned to teacher once)

    for student in students:
        pin = generate_unique_pin(existing_pins)
        existing_pins.add(pin)
        students_pins[student['id']] = {
            'pin_hash': hash_pin(pin),
            'name': get_student_display_name(student)
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
    for student in students:  # Use the 'students' variable defined earlier in the function
        pin_list.append({
            'student_id': student['id'],
            'name': get_student_display_name(student),
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
            'name': get_student_display_name(student_info),
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
            'name': get_student_display_name(student_data),
            'grades': student_data.get('grades', [])
        },
        'class_name': share.get('class_name', ''),
        'teacher_name': share.get('teacher_name', ''),
        'categories': snapshot.get('categories', []),
        'subjects': snapshot.get('subjects', []),
        'plusMinusGradeSettings': snapshot.get('plusMinusGradeSettings', {}),
        'visibility': share.get('visibility', {})
    })


@app.route('/api/qrcode/generate', methods=['POST'])
async def api_generate_qr():
    """Generate a QR code for a given URL"""
    if not QR_CODE_AVAILABLE:
        return jsonify({
            'success': False, 
            'message': 'QR code library not available on this server'
        }), 500
    
    try:
        data = await request.get_json()
        
        if not data or 'url' not in data:
            return jsonify({'success': False, 'message': 'URL is required'}), 400
        
        url = data['url']
        
        # Create QR code
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(url)
        qr.make(fit=True)
        
        # Create image
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convert to base64
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        img_str = b64.b64encode(buffer.getvalue()).decode()
        
        return jsonify({
            'success': True,
            'qr_code': f"data:image/png;base64,{img_str}"
        })
    except Exception as e:
        print(f"Error generating QR code: {str(e)}")
        return jsonify({
            'success': False, 
            'message': 'Failed to generate QR code'
        }), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=1601, debug=True)
