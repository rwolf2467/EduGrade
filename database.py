"""
EduGrade Database Module
SQLite database schema and helper functions
"""

import aiosqlite
import os
from pathlib import Path

# Database path
DATA_DIR = Path(__file__).parent / "data"
DB_PATH = DATA_DIR / "edugrade.db"


async def get_db():
    """Get database connection"""
    DATA_DIR.mkdir(exist_ok=True)
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    return db


async def init_db():
    """Initialize database with schema"""
    DATA_DIR.mkdir(exist_ok=True)

    async with aiosqlite.connect(DB_PATH) as db:
        # Users table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Sessions table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Classes table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS classes (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Students table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS students (
                id TEXT PRIMARY KEY,
                class_id TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
            )
        """)

        # Categories table (global per user)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS categories (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                weight REAL NOT NULL DEFAULT 1.0,
                allow_plus_minus BOOLEAN DEFAULT 0,
                only_plus_minus BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Grades table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS grades (
                id TEXT PRIMARY KEY,
                student_id TEXT NOT NULL,
                category_id TEXT NOT NULL,
                value TEXT NOT NULL,
                weight REAL NOT NULL DEFAULT 1.0,
                is_plus_minus BOOLEAN DEFAULT 0,
                name TEXT,
                entered_as_percent BOOLEAN DEFAULT 0,
                percent_value REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
                FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
            )
        """)

        # User settings table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id INTEGER PRIMARY KEY,
                teacher_name TEXT,
                current_class_id TEXT,
                plus_value REAL DEFAULT 0.5,
                minus_value REAL DEFAULT 0.5,
                start_grade REAL DEFAULT 3.0,
                grade_ranges TEXT,
                tutorial_completed BOOLEAN DEFAULT 0,
                tutorial_never_show BOOLEAN DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Create indexes
        await db.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_classes_user ON classes(user_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id)")

        await db.commit()


async def cleanup_expired_sessions():
    """Remove expired sessions"""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "DELETE FROM sessions WHERE expires_at < datetime('now')"
        )
        await db.commit()
