# EduGrade - Secure Classroom Grade Management System

EduGrade is a modern, security-focused web application for teachers to manage student grades, classes, and performance tracking. Built with Python (Quart framework) and JavaScript, it provides an intuitive interface for educational grade management with enhanced security features.

**Security-First Design**: This application prioritizes security with enhanced password hashing, short-lived sessions, and comprehensive protection mechanisms while maintaining ease of use for educators.

## Features

### Core Functionality
- **User Authentication**: Secure login/register system with enhanced session management (1-hour expiration)
- **Class Management**: Create, organize, and manage multiple classes with comprehensive overview
- **Student Management**: Add, track, and manage individual students with detailed performance records
- **Grade Tracking**: Record and calculate grades across different categories with automatic averaging

### Customization and Flexibility
- **Customizable Grading**: Configure grade ranges, percentage systems, and +/- grading systems to match your curriculum
- **Category Management**: Create and manage grading categories with custom weights and evaluation criteria
- **Performance Analytics**: Visual charts and statistics for comprehensive student performance analysis

### Data Management
- **Data Export/Import**: Backup and restore your complete dataset in JSON format for migration and safety
- **Selective Data Clearing**: Reset specific data while preserving your account and other information
- **Account Management**: Full control over your account including profile settings and secure deletion

### User Experience
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- **Dark/Light Mode**: Toggle between themes for comfortable viewing in any lighting condition
- **Intuitive Interface**: User-friendly design with clear navigation and helpful tooltips
- **Accessibility**: Built with modern web standards for better accessibility support

### Security Features
- **Data Encryption**: All user data encrypted with AES-256-GCM using password-derived keys
- **Enhanced Authentication**: 1-hour session timeout for improved security posture
- **Secure Password Storage**: PBKDF2 hashing with 200,000 iterations and 32-byte salt
- **Smart Session Caching**: In-memory caching with heartbeat system for optimal performance
- **Comprehensive Protection**: CSRF protection, CSP headers, and secure cookie management

## Technology Stack

- **Backend**: Python 3.8+ with Quart (async Flask-like framework)
- **Frontend**: HTML5, JavaScript, Tailwind CSS, Basecoat CSS
- **Database**: JSON-based file storage with AES-256-GCM encryption
- **Encryption**: AES-256-GCM for data, PBKDF2 for key derivation (cryptography library)
- **Authentication**: Secure session tokens with enhanced PBKDF2 password hashing (200k iterations, 32-byte salt)
- **Charts**: Chart.js for data visualization
- **Security**: Comprehensive security measures including encrypted storage, short-lived sessions, secure cookies, and input validation

## Requirements

### Minimum Requirements
- Python 3.8 or higher
- pip (Python package manager)
- Modern web browser with JavaScript enabled

### Recommended Requirements
- Python 3.9+ for best performance and security features
- Virtual environment for dependency isolation
- Git for version control and updates
- Modern multi-core processor for optimal hashing performance

### Security Requirements
- **For Development**: Basic setup as described
- **For Production**: 
  - HTTPS with valid SSL/TLS certificates
  - Proper firewall configuration

## Installation

### Basic Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/edugrade.git
   cd edugrade
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

   This includes the `cryptography` library for AES-256-GCM encryption.

3. **Run the application:**
   ```bash
   python app.py
   ```

4. **Access the application:**
   Open your browser and navigate to `http://localhost:1601`

### Security Considerations for Installation

- **Virtual Environment**: Recommended to install in a virtual environment to isolate dependencies
  ```bash
  python -m venv venv
  source venv/bin/activate  # On Linux/Mac
  venv\Scripts\activate  # On Windows
  ```

- **Dependency Security**: Regularly update dependencies to patch security vulnerabilities
  ```bash
  pip list --outdated
  pip install --upgrade package-name
  ```

- **Configuration Review**: Before deployment, review all security settings in `app.py`

- **Secret Key**: Change the default secret key to a long, random string for production

### Development vs Production

**Development Mode** (current configuration):
- Debug mode enabled for easier troubleshooting
- Session duration: 1 hour
- Automatic reload on code changes

**Production Mode** (recommended changes):
- Set `debug=False` in `app.py`
- Use HTTPS with proper certificates
- Set `secure=True` for cookies

## Project Structure

```
edugrade/
├── app.py                  # Main application with API routes and security configurations
├── auth.py                 # Authentication functions with enhanced password hashing
├── database.py             # Database operations with data validation
├── requirements.txt        # Python dependencies (regularly update for security)
├── static/                 # Static assets (CSS, JS, images)
│   ├── css/                # Custom styles with security considerations
│   ├── scripts/            # JavaScript modules with input validation
│   │   ├── security.js     # Security-related functions and validations
│   │   ├── auth.js         # Authentication handling with token management
│   │   └── ...             # Other modules with security best practices
│   └── logo.svg            # Application logo
├── templates/              # HTML templates with CSP headers
│   ├── index.html          # Main dashboard template with secure session handling
│   └── login.html          # Login/register template with security features
├── data/                   # JSON database storage (proper permissions required)
│   └── edugrade.json       # Main data file with password hashes (auto-created)
└── README.md               # This comprehensive security documentation
```

### Security-Relevant Files

**app.py**: Contains the core security implementations:
- Enhanced password hashing (200k iterations, 32-byte salt)
- Session management (1-hour expiration)
- Secure cookie configuration
- CSRF protection and input validation

**templates/login.html**: Security features:
- Secure form submission with CSRF tokens
- Password strength indicators
- Secure session establishment

**static/scripts/security.js**: Client-side security:
- Input validation and sanitization
- Secure data handling
- Session management utilities

## Security Features

### Password Security
- **Enhanced Password Hashing**: Uses PBKDF2 with SHA-256, 200,000 iterations, and 32-byte salt for maximum security

### Session Security
- **Short-Lived Sessions**: Secure tokens with 1-hour expiration to minimize exposure window
- **Automatic Cleanup**: Regular cleanup of expired sessions to prevent token accumulation
- **Secure Token Generation**: Cryptographically secure session tokens using Python's `secrets` module

### Web Security
- **CSRF Protection**: Built-in with Quart framework to prevent cross-site request forgery attacks
- **Content Security Policy**: Strict CSP headers for frontend security to prevent XSS attacks
- **Secure Cookies**: HttpOnly and Secure flags for session cookies to prevent JavaScript access
- **Input Validation**: Comprehensive validation for all user inputs to prevent injection attacks

### Data Encryption
- **AES-256-GCM Encryption**: All user data (classes, students, grades) is encrypted at rest
- **Password-Derived Keys**: Encryption keys are derived from user passwords using PBKDF2 (100,000 iterations)
- **Unique Nonces**: Each encryption operation uses a random 96-bit nonce for additional security
- **Authenticated Encryption**: GCM mode ensures data integrity - tampering is detected and rejected

### Smart Session Caching
- **In-Memory Cache**: Decrypted data is cached in server RAM during active sessions for performance
- **Heartbeat System**: Client sends heartbeat every 30 seconds to keep cache alive
- **Automatic Cleanup**: Cache is cleared when user closes the page or after 60 seconds of inactivity
- **Visibility-Aware**: Heartbeat pauses when browser tab is hidden, resumes when visible

### Data Protection
- **Secure Storage**: Password hashes and sensitive data are stored securely with encryption
- **Token Management**: Proper session token management with expiration and cleanup
- **Zero-Knowledge Design**: Server administrators cannot read user data without the user's password

## Usage

### Getting Started
1. **Register**: Create a new account with your email and a strong password (minimum 8 characters)
2. **Login**: Access your dashboard with your credentials (sessions expire after 1 hour for security)
3. **Setup**: Create your first class and add students through the intuitive interface

### Daily Operations
4. **Manage Grades**: Record grades, track student performance, and generate comprehensive reports
5. **Customize**: Configure grading systems, categories, and evaluation criteria to match your curriculum

### Security Best Practices
- **Password Management**: Use a strong, unique password with at least 12 characters including uppercase, lowercase, numbers, and special characters
- **Session Awareness**: Be prepared to log in every hour due to the enhanced security session timeout
- **Logout Habit**: Always log out when finished, especially on shared or public computers
- **Data Backup**: Regularly export your data to prevent loss and maintain backups

### Advanced Features
- **Multi-Class Management**: Organize and switch between different classes seamlessly
- **Custom Grading Systems**: Configure percentage ranges and +/- grading systems to match your educational standards
- **Data Export/Import**: Backup and restore your complete dataset for migration or safety

## Data Management

### Automatic Data Handling
- **Automatic Saves**: All changes are automatically saved to the server with immediate persistence
- **Data Integrity**: Comprehensive validation ensures data consistency and prevents corruption

### Backup and Recovery
- **Export**: Download your complete data as JSON for secure backups (recommended before major changes)
- **Import**: Restore data from JSON backups with validation to ensure compatibility
- **Data Migration**: Seamless transfer between instances or for backup purposes

### Data Privacy
- **Clear Data**: Reset your account while keeping your login credentials (useful for testing or fresh starts)
- **Selective Deletion**: Remove specific classes, students, or grades without affecting your account
- **Account Deletion**: Permanent account removal with all associated data (irreversible)

### Security Considerations
- **Regular Backups**: Recommended to prevent data loss from accidental deletion or system failures
- **Secure Storage**: Backup files contain sensitive educational data - store them securely
- **Data Portability**: JSON format allows for easy migration and long-term archiving

## Development

### Running in Development Mode

To run in development mode with auto-reload:

```bash
python app.py
```

The application will be available at `http://localhost:1601` with debug mode enabled.

## Configuration

### Basic Configuration
- **Port**: Change the port in `app.py` (default: 1601)
- **Secret Key**: Update `app.secret_key` in `app.py` for production (use a long, random string)

### Security Configuration
- **Session Duration**: Modify the `timedelta(hours=1)` in `login_user()` function (default: 1 hour)
- **Password Hashing**: Configure iterations in `hash_password()` function (default: 200,000)
- **Salt Size**: Configure salt size in `hash_password()` function (default: 32 bytes)

### Performance Considerations
- **Hashing Performance**: Higher iteration counts improve security but require more computational resources
- **Session Cleanup**: The automatic session cleanup runs on startup to remove expired sessions
- **Token Length**: Session tokens are 64 characters long (32 bytes hex-encoded) for maximum security

## Production Deployment

For production use:

### Security Hardening
1. Set `debug=False` in `app.run()` to disable debug mode and prevent information leakage
2. Use HTTPS with a reverse proxy (Nginx, Apache) for encrypted communication
3. Set `secure=True` for session cookies to ensure they're only sent over HTTPS connections
4. Configure proper environment variables for secrets and sensitive configuration
5. Implement regular database backups and consider database encryption for sensitive data

### Monitoring and Protection
6. Set up proper logging and monitoring for security events and suspicious activities
7. Consider implementing rate limiting to prevent brute force attacks (especially important with 1-hour sessions)
8. Configure proper CORS settings if needed for your deployment to prevent unauthorized cross-origin requests
9. Implement regular security audits and dependency updates


## Security Notice

**Important Security Information**:

### Session Expiration
This application uses 1-hour session expiration for enhanced security. Users will need to log in more frequently, but this significantly reduces the risk of session hijacking and unauthorized access. The shorter session duration means:

- **Reduced Exposure Window**: If a session token is compromised, it can only be used for a maximum of 1 hour
- **Automatic Logout**: Users are automatically logged out after inactivity, reducing the risk of unauthorized access on shared computers

### Password Security
The enhanced password hashing provides:

- **Brute Force Resistance**: 200,000 iterations make password cracking attempts computationally expensive
- **Rainbow Table Protection**: 32-byte salts prevent the use of pre-computed hash tables

### Data Encryption Security
User data is protected with military-grade encryption:

- **AES-256-GCM**: Industry-standard authenticated encryption used by governments and banks worldwide
- **Password-Derived Keys**: Your password is the only way to decrypt your data - even server admins cannot access it
- **Key Derivation**: PBKDF2 with 100,000 iterations protects against brute-force key attacks
- **Forward Secrecy**: Each encryption uses a unique random nonce, so identical data encrypts differently each time


## License and Legal Information

### License

**EduGrade - Secure Classroom Grade Management System**  
Copyright (C) 2026 Fabian Murauer

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.

### What does this mean?

- ✅ You can use, study, and modify this software
- ✅ You can share your modified versions
- ✅ Anyone using your modified version as a web service must provide the source code
- ✅ The original author (Fabian Murauer) must be credited
- ❌ You cannot make this software proprietary/closed-source
- ❌ You cannot sell this software without providing the source code

### Data Privacy
- **User Responsibility**: Users are responsible for complying with all applicable data protection laws
- **Educational Data**: The application handles sensitive student data - use responsibly
- **Security Obligations**: Implement proper security measures when deploying in production

### Disclaimer
- **Educational Use**: This application is primarily designed for educational demonstration
- **Security Features**: While enhanced security measures are implemented, no system is 100% secure
- **Production Use**: Additional security measures may be required for production environments
- **No Warranty**: The application is provided "as is" without any warranties

### Security Reporting
If you discover any security vulnerabilities, please report them through github.
---