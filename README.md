# EduGrade

A secure web application for teachers to manage student grades, classes, and performance tracking. Built with Python (Quart) and JavaScript.

## Features

- **Class & Student Management** - Create classes, add students, track individual performance
- **Grade Tracking** - Record grades with customizable categories, weights, and +/- systems
- **Analytics** - Visual charts and statistics for student performance
- **Grade Sharing with Students** - Securely share grades with students using PIN-protected access links
- **Subject-Based Organization** - Divide classes into multiple subjects for comprehensive tracking
- **Customizable Categories** - Define grade categories with custom weights and names
- **Plus/Minus Grade System** - Configurable grading system with plus and minus values
- **Participation Tracking** - Track and record student participation grades
- **Grade Percentage Ranges** - Customizable percentage-to-grade mapping
- **Data Export/Import** - Backup and restore data in JSON format
- **Dark/Light Mode** - Comfortable viewing in any environment
- **Responsive Design** - Works on desktop, tablet, and mobile
- **Tutorial System** - Guided onboarding for new users

## Security

- **AES-256-GCM Encryption** - All user data encrypted at rest with password-derived keys
- **Encrypted Grade Shares** - Shared grade data is encrypted using a master key
- **PBKDF2 Key Derivation** - 200k iterations for password hashing, 100k for encryption keys
- **1-Hour Sessions** - Short-lived sessions with automatic cleanup
- **Zero-Knowledge** - Server admins cannot read user data without the password
- **PIN-Protected Access** - Student grade access secured with 6-digit PINs
- **Smart Caching** - In-memory cache with heartbeat system for performance
- **Automatic Share Cleanup** - Expired and revoked shares are automatically removed

## Tech Stack

| Component | Technology                                |
|-----------|-------------------------------------------|
| Backend   | Python 3.8+, Quart (async)                |
| Frontend  | HTML5, JavaScript, Tailwind CSS, Basecoat |
| Storage   | JSON files with AES-256-GCM encryption    |
| Charts    | Chart.js                                  |

## Quick Start

```bash
# Clone and install
git clone https://github.com/yourusername/edugrade.git
cd edugrade
pip install -r requirements.txt

# Run
python app.py
```

Open `http://localhost:1601` in your browser.

### Virtual Environment (Recommended)

```bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows
pip install -r requirements.txt
```

## Project Structure

```
edugrade/
├── app.py              # Main application, routes, auth, encryption
├── requirements.txt    # Python dependencies
├── static/
│   ├── css/            # Styles
│   ├── i18n/           # Internationalization files
│   ├── logo.svg        # Logo files
│   └── scripts/        # JavaScript modules
├── templates/
│   ├── index.html      # Main dashboard
│   ├── login.html      # Authentication page
│   └── student_grades.html # Student grade view
└── data/
    └── edugrade.json   # Encrypted user data (auto-created)
```

## Configuration

Edit `app.py` to customize:

| Setting          | Default | Description            |
|------------------|---------|------------------------|
| Port             | 1601    | Server port            |
| Session Duration | 1 hour  | Login timeout          |
| Debug Mode       | True    | Enable for development |
| Rate Limits      | Various | Configurable per endpoint |

For production, change `app.secret_key` to a secure random string.

## Production Deployment

1. Set `debug=False` in `app.run()`
2. Use HTTPS via reverse proxy (Nginx/Apache)
3. Set `secure=True` for cookies
4. Configure proper environment variables
5. Set up logging and monitoring

## Grade Sharing Feature

Teachers can create secure grade shares for students:
1. Select a class to share
2. Set expiration time (1 hour to 30 days)
3. Configure visibility options (grades, averages, final grades, etc.)
4. Generate unique PINs for each student
5. Students access grades using the share link and their PIN

Shared data includes:
- Individual grades
- Category breakdowns
- Class averages
- Subject information
- Teacher name

## License

**EduGrade** - Copyright (C) 2026 Fabian Murauer

Licensed under the [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html).

- Use, study, modify, and share freely
- Modified versions must provide source code
- Credit the original author
- Cannot be made proprietary

## Security Reporting

Report vulnerabilities via [GitHub Issues](https://github.com/rwolf2467/EduGrade/issues).