"""db.py — Synchronous SQLite storage layer for EduGrade.

Replaces the single-JSON-file backend (data/edugrade.json).  All functions are
intentionally synchronous (no async/await) so existing call sites in app.py
need no changes.  Encryption is the caller's responsibility; this module stores
and returns opaque ciphertext strings and plain dicts as JSON.

Connection is shared at module level with check_same_thread=False and WAL mode.
A threading.Lock guards every write so the module is safe under Quart's
thread-pool executor.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# DB path — mirrors app.py's DATA_DIR resolution (Path(__file__).parent / "data")
# ---------------------------------------------------------------------------
DATA_DIR: Path = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_FILE: Path = DATA_DIR / "edugrade.db"

# ---------------------------------------------------------------------------
# Module-level connection + write lock
# ---------------------------------------------------------------------------
_conn: sqlite3.Connection = sqlite3.connect(
    str(DB_FILE),
    check_same_thread=False,
    isolation_level=None,   # autocommit — we manage transactions ourselves
)
_conn.row_factory = sqlite3.Row
_conn.execute("PRAGMA journal_mode=WAL;")
_conn.execute("PRAGMA synchronous=NORMAL;")
_conn.execute("PRAGMA foreign_keys=ON;")

_write_lock = threading.Lock()

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _dumps(obj: Any) -> str:
    """Serialise a dict to a compact JSON string."""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def _loads(text: str | None) -> dict:
    """Deserialise a JSON string; returns {} on None/empty."""
    if not text:
        return {}
    return json.loads(text)


def _execute_write(sql: str, params: tuple = ()) -> sqlite3.Cursor:
    """Execute a write statement under the write lock."""
    with _write_lock:
        return _conn.execute(sql, params)


def _executemany_write(sql: str, param_list: list[tuple]) -> None:
    """Execute a batch write under the write lock."""
    with _write_lock:
        _conn.executemany(sql, param_list)


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_CREATE_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS users (
        email   TEXT PRIMARY KEY,
        id      TEXT NOT NULL UNIQUE,
        doc     TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_users_id ON users(id)",
    """
    CREATE TABLE IF NOT EXISTS sessions (
        token       TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL,
        expires_at  TEXT NOT NULL,
        doc         TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)",
    """
    CREATE TABLE IF NOT EXISTS user_meta (
        user_id     TEXT PRIMARY KEY,
        version     INTEGER DEFAULT 2,
        encrypted   INTEGER DEFAULT 1,
        meta_ct     TEXT,
        legacy_ct   TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS user_classes (
        user_id   TEXT NOT NULL,
        class_id  TEXT NOT NULL,
        ct        TEXT NOT NULL,
        PRIMARY KEY (user_id, class_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS class_shares (
        token          TEXT PRIMARY KEY,
        class_id       TEXT,
        active         INTEGER,
        expires_at     TEXT,
        encrypted_data TEXT,
        doc            TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token       TEXT PRIMARY KEY,
        user_id     TEXT,
        expires_at  TEXT,
        doc         TEXT NOT NULL
    )
    """,
]


def init_schema() -> None:
    """Create all tables and indices if they do not exist yet.

    Safe to call multiple times (uses IF NOT EXISTS).  Called once at app
    startup before any other db.py function is used.
    """
    with _write_lock:
        with _conn:
            for stmt in _CREATE_STATEMENTS:
                _conn.execute(stmt)
    logger.info("db.py: SQLite schema ready (%s)", DB_FILE)


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

def get_user_by_email(email: str) -> dict | None:
    """Return the user dict for *email*, or None if not found."""
    row = _conn.execute(
        "SELECT doc FROM users WHERE email = ?", (email,)
    ).fetchone()
    return _loads(row["doc"]) if row else None


def get_user_by_id(user_id: str) -> dict | None:
    """Return the user dict for *user_id*, or None if not found."""
    row = _conn.execute(
        "SELECT doc FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    return _loads(row["doc"]) if row else None


def get_email_by_id(user_id: str) -> str | None:
    """Return the email address for *user_id*, or None if not found."""
    row = _conn.execute(
        "SELECT email FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    return row["email"] if row else None


def put_user(email: str, user_dict: dict) -> None:
    """Insert or replace the user record for *email*.

    Extracts the ``id`` field from *user_dict* into the indexed ``id`` column.
    """
    user_id = user_dict.get("id", "")
    _execute_write(
        "INSERT OR REPLACE INTO users (email, id, doc) VALUES (?, ?, ?)",
        (email, user_id, _dumps(user_dict)),
    )


def delete_user(email: str) -> None:
    """Delete the user record for *email* (no-op if absent)."""
    _execute_write("DELETE FROM users WHERE email = ?", (email,))


def iter_users() -> list[tuple[str, dict]]:
    """Return all users as a list of (email, user_dict) pairs."""
    rows = _conn.execute("SELECT email, doc FROM users").fetchall()
    return [(row["email"], _loads(row["doc"])) for row in rows]


def count_users() -> int:
    """Return the total number of registered users.

    Used by the boot-time migration to detect an empty database.
    """
    row = _conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()
    return row["n"] if row else 0


def increment_failed_login(email: str) -> int:
    """Atomically increment failed_login_count for *email* and return the new value.

    Uses SQLite's json_set/json_extract so the whole read-modify-write happens in
    one SQL statement under _write_lock, preventing lost updates under concurrency.
    Returns 0 if the user is not found.
    """
    with _write_lock:
        _conn.execute(
            """
            UPDATE users
               SET doc = json_set(
                             doc,
                             '$.failed_login_count',
                             COALESCE(json_extract(doc, '$.failed_login_count'), 0) + 1
                         )
             WHERE email = ?
            """,
            (email,),
        )
        row = _conn.execute(
            "SELECT json_extract(doc, '$.failed_login_count') AS n FROM users WHERE email = ?",
            (email,),
        ).fetchone()
    return int(row["n"]) if row and row["n"] is not None else 0


def set_lockout(email: str, locked_until_ts: int) -> None:
    """Atomically set locked_until_ts and reset failed_login_count to 0 for *email*."""
    with _write_lock:
        _conn.execute(
            """
            UPDATE users
               SET doc = json_set(
                             json_set(doc, '$.locked_until_ts', ?),
                             '$.failed_login_count', 0
                         )
             WHERE email = ?
            """,
            (locked_until_ts, email),
        )


def reset_failed_login(email: str) -> None:
    """Atomically reset failed_login_count and locked_until_ts to 0 for *email*."""
    with _write_lock:
        _conn.execute(
            """
            UPDATE users
               SET doc = json_set(
                             json_set(doc, '$.failed_login_count', 0),
                             '$.locked_until_ts', 0
                         )
             WHERE email = ?
            """,
            (email,),
        )


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

def get_session(token: str) -> dict | None:
    """Return the session dict for *token*, or None if not found."""
    row = _conn.execute(
        "SELECT doc FROM sessions WHERE token = ?", (token,)
    ).fetchone()
    return _loads(row["doc"]) if row else None


def put_session(token: str, session_dict: dict) -> None:
    """Insert or replace a session record.

    Extracts ``user_id`` and ``expires_at`` into indexed columns.
    """
    user_id = session_dict.get("user_id", "")
    expires_at = session_dict.get("expires_at", "")
    _execute_write(
        "INSERT OR REPLACE INTO sessions (token, user_id, expires_at, doc) VALUES (?, ?, ?, ?)",
        (token, user_id, expires_at, _dumps(session_dict)),
    )


def delete_session(token: str) -> None:
    """Delete a single session by token (no-op if absent)."""
    _execute_write("DELETE FROM sessions WHERE token = ?", (token,))


def delete_sessions_for_user(user_id: str) -> None:
    """Delete all sessions belonging to *user_id*."""
    _execute_write("DELETE FROM sessions WHERE user_id = ?", (user_id,))


def delete_expired_sessions(now_iso: str) -> list[str]:
    """Delete all sessions whose ``expires_at`` is before *now_iso*.

    Returns the list of deleted tokens so the caller can purge in-memory
    caches (encryption_keys, user_data_cache).
    """
    rows = _conn.execute(
        "SELECT token FROM sessions WHERE expires_at < ?", (now_iso,)
    ).fetchall()
    tokens = [row["token"] for row in rows]
    if tokens:
        placeholders = ",".join("?" * len(tokens))
        _execute_write(
            f"DELETE FROM sessions WHERE token IN ({placeholders})", tuple(tokens)
        )
    return tokens


def iter_sessions() -> list[tuple[str, dict]]:
    """Return all sessions as a list of (token, session_dict) pairs."""
    rows = _conn.execute("SELECT token, doc FROM sessions").fetchall()
    return [(row["token"], _loads(row["doc"])) for row in rows]


# ---------------------------------------------------------------------------
# User meta / classes (v2 split layout)
#
# v2 layout stored across two tables:
#   user_meta  — version, encrypted flag, meta ciphertext, optional legacy blob
#   user_classes — one row per class (user_id, class_id, ciphertext)
#
# Legacy v1 single-blob: {"encrypted": True, "data": "<ciphertext>"}
#   stored with version=1 and the blob in legacy_ct.
# ---------------------------------------------------------------------------

def get_meta_record(user_id: str) -> dict | None:
    """Return the meta record dict for *user_id*, or None if no row exists.

    Returned dict keys: ``version``, ``encrypted``, ``meta_ct``, ``legacy_ct``.
    ``meta_ct`` and ``legacy_ct`` may be None.
    """
    row = _conn.execute(
        "SELECT version, encrypted, meta_ct, legacy_ct FROM user_meta WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    if row is None:
        return None
    return {
        "version": row["version"],
        "encrypted": bool(row["encrypted"]),
        "meta_ct": row["meta_ct"],
        "legacy_ct": row["legacy_ct"],
    }


def put_meta_ct(user_id: str, meta_ct: str) -> None:
    """Upsert the v2 meta ciphertext for *user_id*.

    Sets version=2, encrypted=1, clears legacy_ct.  Creates the row if absent.
    """
    _execute_write(
        """
        INSERT INTO user_meta (user_id, version, encrypted, meta_ct, legacy_ct)
            VALUES (?, 2, 1, ?, NULL)
        ON CONFLICT(user_id) DO UPDATE SET
            version   = 2,
            encrypted = 1,
            meta_ct   = excluded.meta_ct,
            legacy_ct = NULL
        """,
        (user_id, meta_ct),
    )


def get_legacy_ct(user_id: str) -> str | None:
    """Return the legacy v1 single-blob ciphertext for *user_id*, or None."""
    row = _conn.execute(
        "SELECT legacy_ct FROM user_meta WHERE user_id = ?", (user_id,)
    ).fetchone()
    return row["legacy_ct"] if row else None


def put_legacy_record(user_id: str, legacy_ct: str, encrypted: bool = True) -> None:
    """Store a legacy v1 single-blob record.

    When ``encrypted=True`` (default) the caller passes a ciphertext string
    (the value of the ``data`` key from the old JSON layout).  When
    ``encrypted=False`` the caller passes a plaintext JSON string — this
    preserves zero-knowledge records that the server cannot re-encrypt during
    migration because it has no user key.

    The row is written with version=1 so app.py's _ensure_v2/migrate_user_to_v2
    can detect and migrate it on the next login.
    """
    enc_flag = 1 if encrypted else 0
    _execute_write(
        """
        INSERT INTO user_meta (user_id, version, encrypted, meta_ct, legacy_ct)
            VALUES (?, 1, ?, NULL, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            version   = 1,
            encrypted = excluded.encrypted,
            meta_ct   = NULL,
            legacy_ct = excluded.legacy_ct
        """,
        (user_id, enc_flag, legacy_ct),
    )


def get_class_ct(user_id: str, class_id: str) -> str | None:
    """Return the ciphertext for a single class, or None if not found."""
    row = _conn.execute(
        "SELECT ct FROM user_classes WHERE user_id = ? AND class_id = ?",
        (user_id, str(class_id)),
    ).fetchone()
    return row["ct"] if row else None


def put_class_ct(user_id: str, class_id: str, ct: str) -> None:
    """Insert or replace the ciphertext for a single class."""
    _execute_write(
        "INSERT OR REPLACE INTO user_classes (user_id, class_id, ct) VALUES (?, ?, ?)",
        (user_id, str(class_id), ct),
    )


def delete_class(user_id: str, class_id: str) -> bool:
    """Delete a single class blob.  Returns True if a row was actually deleted."""
    cur = _execute_write(
        "DELETE FROM user_classes WHERE user_id = ? AND class_id = ?",
        (user_id, str(class_id)),
    )
    return cur.rowcount > 0


def list_class_ids(user_id: str) -> list[str]:
    """Return all class_id values stored for *user_id*."""
    rows = _conn.execute(
        "SELECT class_id FROM user_classes WHERE user_id = ?", (user_id,)
    ).fetchall()
    return [row["class_id"] for row in rows]


def delete_user_data(user_id: str) -> None:
    """Remove all user_meta and user_classes rows for *user_id* atomically."""
    with _write_lock:
        with _conn:
            _conn.execute("DELETE FROM user_meta WHERE user_id = ?", (user_id,))
            _conn.execute("DELETE FROM user_classes WHERE user_id = ?", (user_id,))


def user_data_exists(user_id: str) -> bool:
    """Return True if any user_meta or user_classes row exists for *user_id*."""
    row = _conn.execute(
        "SELECT 1 FROM user_meta WHERE user_id = ? LIMIT 1", (user_id,)
    ).fetchone()
    if row:
        return True
    row = _conn.execute(
        "SELECT 1 FROM user_classes WHERE user_id = ? LIMIT 1", (user_id,)
    ).fetchone()
    return row is not None


# ---------------------------------------------------------------------------
# Class shares
# ---------------------------------------------------------------------------

def get_share(token: str) -> dict | None:
    """Return the share dict for *token*, or None if not found."""
    row = _conn.execute(
        "SELECT doc FROM class_shares WHERE token = ?", (token,)
    ).fetchone()
    return _loads(row["doc"]) if row else None


def put_share(token: str, share_dict: dict) -> None:
    """Insert or replace a class share record.

    Extracts ``class_id``, ``active``, ``expires_at``, and ``encrypted_data``
    into dedicated columns for query use; stores full dict in ``doc``.
    """
    class_id = share_dict.get("class_id")
    active = 1 if share_dict.get("active", True) else 0
    expires_at = share_dict.get("expires_at")
    encrypted_data = share_dict.get("encrypted_data")
    _execute_write(
        """
        INSERT OR REPLACE INTO class_shares
            (token, class_id, active, expires_at, encrypted_data, doc)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (token, class_id, active, expires_at, encrypted_data, _dumps(share_dict)),
    )


def delete_share(token: str) -> None:
    """Delete a share by token (no-op if absent)."""
    _execute_write("DELETE FROM class_shares WHERE token = ?", (token,))


def iter_shares() -> list[tuple[str, dict]]:
    """Return all shares as a list of (token, share_dict) pairs."""
    rows = _conn.execute("SELECT token, doc FROM class_shares").fetchall()
    return [(row["token"], _loads(row["doc"])) for row in rows]


# ---------------------------------------------------------------------------
# Password reset tokens
# ---------------------------------------------------------------------------

def get_reset_token(token: str) -> dict | None:
    """Return the reset-token dict for *token*, or None if not found."""
    row = _conn.execute(
        "SELECT doc FROM password_reset_tokens WHERE token = ?", (token,)
    ).fetchone()
    return _loads(row["doc"]) if row else None


def put_reset_token(token: str, token_dict: dict) -> None:
    """Insert or replace a password reset token record.

    Extracts ``user_id`` (derived from ``user_email`` for the email-flow tokens
    which store the raw email, not a user_id — stored as-is) and ``expires_at``
    into dedicated columns.

    Note: the JSON field for the user identifier is ``user_email`` in the
    email-reset flow; this function stores whatever is in the dict verbatim and
    puts ``token_dict.get("user_id") or token_dict.get("user_email")`` into the
    indexed ``user_id`` column so queries by either key still work.
    """
    user_ref = token_dict.get("user_id") or token_dict.get("user_email")
    expires_at = token_dict.get("expires_at")
    _execute_write(
        """
        INSERT OR REPLACE INTO password_reset_tokens (token, user_id, expires_at, doc)
        VALUES (?, ?, ?, ?)
        """,
        (token, user_ref, expires_at, _dumps(token_dict)),
    )


def delete_reset_token(token: str) -> None:
    """Delete a reset token by value (no-op if absent)."""
    _execute_write("DELETE FROM password_reset_tokens WHERE token = ?", (token,))


def delete_expired_reset_tokens(now_iso: str) -> None:
    """Delete all reset tokens whose ``expires_at`` is before *now_iso*."""
    _execute_write(
        "DELETE FROM password_reset_tokens WHERE expires_at < ?", (now_iso,)
    )


def iter_reset_tokens() -> list[tuple[str, dict]]:
    """Return all reset tokens as a list of (token, token_dict) pairs."""
    rows = _conn.execute(
        "SELECT token, doc FROM password_reset_tokens"
    ).fetchall()
    return [(row["token"], _loads(row["doc"])) for row in rows]
