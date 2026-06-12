"""migrate_json_to_db.py — One-shot migration from edugrade.json to SQLite.

Called automatically from app.py's before_serving hook, and also runnable
standalone:

    python migrate_json_to_db.py

The migration is idempotent: it only runs when the SQLite users table is empty
AND data/edugrade.json exists.  On success the JSON file is renamed to
edugrade.json.bak so it is not re-processed on subsequent boots.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

_DATA_DIR = Path(__file__).parent / "data"
_JSON_PATH = _DATA_DIR / "edugrade.json"
_JSON_BAK  = _DATA_DIR / "edugrade.json.bak"


def migrate_json_to_db() -> None:
    """Migrate edugrade.json into the SQLite DB if needed.

    Guards:
    - Skip if edugrade.json does not exist.
    - Skip if the SQLite users table is already populated (count_users() > 0).
    After a successful run, renames the JSON file to edugrade.json.bak.
    """
    import db as db_layer

    db_layer.init_schema()

    if not _JSON_PATH.exists():
        return

    if db_layer.count_users() > 0:
        logger.info("migrate_json_to_db: SQLite already populated, skipping.")
        return

    logger.info("migrate_json_to_db: loading %s …", _JSON_PATH)
    try:
        with open(_JSON_PATH, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception as exc:
        logger.error("migrate_json_to_db: cannot load JSON: %s", exc)
        return

    counts: dict[str, int] = {}

    # ── users ─────────────────────────────────────────────────────────────────
    for email, user_dict in (data.get("users") or {}).items():
        try:
            db_layer.put_user(email, user_dict)
            counts["users"] = counts.get("users", 0) + 1
        except Exception as exc:
            logger.warning("migrate users: skipping %s: %s", email, exc)

    # ── sessions ──────────────────────────────────────────────────────────────
    for token, sess_dict in (data.get("sessions") or {}).items():
        try:
            db_layer.put_session(token, sess_dict)
            counts["sessions"] = counts.get("sessions", 0) + 1
        except Exception as exc:
            logger.warning("migrate sessions: skipping token %s…: %s", token[:8], exc)

    # ── class_shares ──────────────────────────────────────────────────────────
    for token, share_dict in (data.get("class_shares") or {}).items():
        try:
            db_layer.put_share(token, share_dict)
            counts["class_shares"] = counts.get("class_shares", 0) + 1
        except Exception as exc:
            logger.warning("migrate shares: skipping token %s…: %s", token[:8], exc)

    # ── password_reset_tokens ─────────────────────────────────────────────────
    for token, tok_dict in (data.get("password_reset_tokens") or {}).items():
        try:
            db_layer.put_reset_token(token, tok_dict)
            counts["reset_tokens"] = counts.get("reset_tokens", 0) + 1
        except Exception as exc:
            logger.warning("migrate reset_tokens: skipping token %s…: %s", token[:8], exc)

    # ── user_data ─────────────────────────────────────────────────────────────
    for user_id, rec in (data.get("user_data") or {}).items():
        try:
            if not isinstance(rec, dict):
                logger.warning("migrate user_data: unexpected type for %s, skipping", user_id)
                continue

            if rec.get("version") == 2:
                # v2 split layout: meta + per-class blobs
                meta_ct = rec.get("meta")
                if meta_ct:
                    db_layer.put_meta_ct(user_id, meta_ct)
                for class_id, ct in (rec.get("classes") or {}).items():
                    db_layer.put_class_ct(user_id, str(class_id), ct)
                counts["user_data_v2"] = counts.get("user_data_v2", 0) + 1

            elif rec.get("encrypted"):
                # v1 single-blob: {"encrypted": True, "data": "<ciphertext>"}
                ct = rec.get("data")
                if ct:
                    db_layer.put_legacy_record(user_id, ct, encrypted=True)
                counts["user_data_v1"] = counts.get("user_data_v1", 0) + 1

            else:
                # Plaintext record — the server has no key so it CANNOT re-encrypt
                # during migration.  Store the raw dict as JSON with encrypted=False
                # so get_user_data can return it as-is, and migrate_user_to_v2 can
                # properly encrypt it into v2 the next time the user logs in (when
                # their key is available in memory).
                logger.warning(
                    "migrate user_data: user %s has plaintext/unknown record — storing as "
                    "unencrypted legacy blob.  Will be encrypted to v2 on next login.",
                    user_id,
                )
                db_layer.put_legacy_record(
                    user_id, json.dumps(rec, ensure_ascii=False), encrypted=False
                )
                counts["user_data_plain"] = counts.get("user_data_plain", 0) + 1

        except Exception as exc:
            logger.warning("migrate user_data: skipping user %s: %s", user_id, exc)

    logger.info("migrate_json_to_db: done. counts=%s", counts)

    # Rename JSON file so the migration is not re-run
    try:
        os.replace(str(_JSON_PATH), str(_JSON_BAK))
        logger.info("migrate_json_to_db: renamed %s -> %s", _JSON_PATH.name, _JSON_BAK.name)
    except OSError as exc:
        logger.warning("migrate_json_to_db: could not rename JSON file: %s", exc)


if __name__ == "__main__":
    logging.basicConfig(
        level="INFO",
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    migrate_json_to_db()
