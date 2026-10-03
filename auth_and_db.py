import json
import logging
import os
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger("auth-db")

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "clinical_app.db")
JWT_SECRET = os.getenv("JWT_SECRET", "ai-clinical-documentation-jwt-secret-key-2026")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

security = HTTPBearer(auto_error=False)


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initializes SQLite schema for users and consultations."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT DEFAULT 'doctor',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS consultations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doctor_id INTEGER NOT NULL,
        patient_name TEXT NOT NULL,
        transcript TEXT NOT NULL,
        turns_json TEXT NOT NULL,
        note_json TEXT NOT NULL,
        translated_plan TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        share_token TEXT,
        share_token_expires_at TIMESTAMP,
        detected_language TEXT DEFAULT 'en-IN',
        FOREIGN KEY (doctor_id) REFERENCES users(id)
    );
    """)

    # Safe column migrations if database already existed
    for col_def in [
        "share_token TEXT",
        "share_token_expires_at TIMESTAMP",
        "detected_language TEXT DEFAULT 'en-IN'",
    ]:
        try:
            cursor.execute(f"ALTER TABLE consultations ADD COLUMN {col_def}")
        except Exception:
            pass

    conn.commit()
    conn.close()
    logger.info("Database initialized successfully at %s", DB_PATH)


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire, "iat": now})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.PyJWTError as e:
        logger.warning("JWT decode error: %s", e)
        return None


def get_user_by_username(username: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", (username.strip(),))
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return None


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return None


def create_user(username: str, password: str, full_name: str, role: str = "doctor") -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()
    pwd_hash = hash_password(password)
    cursor.execute(
        "INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)",
        (username.strip(), pwd_hash, full_name.strip(), "doctor"),
    )
    user_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {
        "id": user_id,
        "username": username.strip(),
        "full_name": full_name.strip(),
        "role": "doctor",
    }


def create_consultation(
    doctor_id: int,
    patient_name: str,
    transcript: str,
    turns: Any,
    note: Any,
    translated_plan: Optional[str] = None,
    detected_language: str = "en-IN",
) -> Tuple[int, str, str]:
    turns_str = json.dumps(turns) if not isinstance(turns, str) else turns
    note_str = json.dumps(note) if not isinstance(note, str) else note
    share_token = str(uuid.uuid4())
    share_token_expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO consultations (
            doctor_id, patient_name, transcript, turns_json, note_json, translated_plan,
            share_token, share_token_expires_at, detected_language
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            doctor_id,
            patient_name.strip(),
            transcript,
            turns_str,
            note_str,
            translated_plan,
            share_token,
            share_token_expires_at,
            detected_language,
        ),
    )
    cons_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return cons_id, share_token, share_token_expires_at


def get_consultation_by_share_token(share_token: str) -> Optional[Tuple[Dict[str, Any], bool]]:
    if not share_token:
        return None
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT c.*, u.full_name as doctor_name 
        FROM consultations c
        LEFT JOIN users u ON c.doctor_id = u.id
        WHERE LOWER(c.share_token) = LOWER(?)
        """,
        (share_token.strip(),),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None

    item = dict(row)
    try:
        item["turns"] = json.loads(item["turns_json"]) if item.get("turns_json") else []
    except Exception:
        item["turns"] = []
    try:
        item["note"] = json.loads(item["note_json"]) if item.get("note_json") else {}
    except Exception:
        item["note"] = {}

    is_expired = False
    if item.get("share_token_expires_at"):
        try:
            exp_str = item["share_token_expires_at"]
            exp = datetime.fromisoformat(exp_str.replace("Z", "+00:00"))
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            is_expired = datetime.now(timezone.utc) > exp
        except Exception:
            pass

    return item, is_expired


def get_consultations_for_user(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    user_id = user["id"]

    cursor.execute(
        """
        SELECT c.*, u.full_name as doctor_name 
        FROM consultations c
        LEFT JOIN users u ON c.doctor_id = u.id
        WHERE c.doctor_id = ?
        ORDER BY c.created_at DESC
        """,
        (user_id,),
    )

    rows = cursor.fetchall()
    conn.close()

    results = []
    for r in rows:
        item = dict(r)
        try:
            item["turns"] = json.loads(item["turns_json"]) if item.get("turns_json") else []
        except Exception:
            item["turns"] = []
        try:
            item["note"] = json.loads(item["note_json"]) if item.get("note_json") else {}
        except Exception:
            item["note"] = {}
        results.append(item)
    return results


def get_consultation_by_id(consultation_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT c.*, u.full_name as doctor_name 
        FROM consultations c
        LEFT JOIN users u ON c.doctor_id = u.id
        WHERE c.id = ?
        """,
        (consultation_id,),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None

    item = dict(row)
    try:
        item["turns"] = json.loads(item["turns_json"]) if item.get("turns_json") else []
    except Exception:
        item["turns"] = []
    try:
        item["note"] = json.loads(item["note_json"]) if item.get("note_json") else {}
    except Exception:
        item["note"] = {}
    return item


async def get_current_user(
    auth: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Dict[str, Any]:
    if not auth or not auth.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(auth.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    username = payload.get("sub")
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload invalid",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = get_user_by_username(username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
