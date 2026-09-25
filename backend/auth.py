"""Auth: JWT cookies, bcrypt passwords, role guards, login lockout, demo credentials."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request

from database import db

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
JWT_ALG = "HS256"
ACCESS_MIN = int(os.environ.get("ACCESS_TOKEN_MIN", "60"))
REFRESH_DAYS = int(os.environ.get("REFRESH_TOKEN_DAYS", "7"))
RESET_TOKEN_MIN = int(os.environ.get("RESET_TOKEN_MIN", "30"))
LOCKOUT_MAX = 5
LOCKOUT_WINDOW_MIN = 15

# demo role -> login email (see memory/test_credentials.md)
DEMO_ROLE_TO_EMAIL = {
    "member": "demo@yourcommunity.app",
    "admin": "admin@yourcommunity.app",
}
_DEMO_USER_IDS = {"member": "u-founder-me", "admin": "u-admin-me"}
_LEGACY = {
    "u-mentor-me": "mentor-legacy@yourcommunity.app",
    "u-alumni-me": "alumni-legacy@yourcommunity.app",
    "u-member-me": "member-legacy@yourcommunity.app",
}


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode()[:72], bcrypt.gensalt(rounds=10)).decode()


def verify_password(pw: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(pw.encode()[:72], hashed.encode())
    except ValueError:
        return False


def _token(sub: str, kind: str, delta: timedelta, role: Optional[str] = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": sub, "type": kind, "iat": now, "exp": now + delta}
    if role:
        payload["role"] = role
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def create_access_token(user_id: str, role: str) -> str:
    return _token(user_id, "access", timedelta(minutes=ACCESS_MIN), role)


def create_refresh_token(user_id: str) -> str:
    return _token(user_id, "refresh", timedelta(days=REFRESH_DAYS))


def create_reset_token(email: str) -> str:
    """Short-lived, single-purpose token for the forgot-password link — subject is the email
    itself (not a user id) since one email can map to a hub account and/or several per-community
    user records, and reset needs to update all of them together."""
    return _token(email, "reset", timedelta(minutes=RESET_TOKEN_MIN))


def decode_reset_token(token: str) -> str:
    """Returns the email a reset link was issued for. Raises jwt.PyJWTError if the token is
    missing, expired, or malformed, and ValueError if it's a token of the wrong kind."""
    payload = decode_token(token)
    if payload.get("type") != "reset":
        raise ValueError("Not a reset token")
    return payload["sub"]


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _extract_token(request: Request) -> Optional[str]:
    tok = request.cookies.get("access_token")
    if tok:
        return tok
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return None


async def _user_from_request(request: Request) -> Optional[dict]:
    tok = _extract_token(request)
    if not tok:
        return None
    try:
        payload = decode_token(tok)
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "access":
        return None
    return await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})


async def get_current_user_optional(request: Request) -> Optional[dict]:
    return await _user_from_request(request)


async def get_current_user(request: Request) -> dict:
    user = await _user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def require_role(*roles: str):
    async def dep(me: dict = Depends(get_current_user)) -> dict:
        if me.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return me

    return dep


# ---------- lockout (5 failures / 15 min -> 429) ----------
async def check_lockout(_db, identifier: str) -> None:
    since = datetime.now(timezone.utc) - timedelta(minutes=LOCKOUT_WINDOW_MIN)
    n = await _db.login_attempts.count_documents({"identifier": identifier, "at": {"$gte": since}})
    if n >= LOCKOUT_MAX:
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")


async def record_failed_login(_db, identifier: str) -> None:
    await _db.login_attempts.insert_one({"identifier": identifier, "at": datetime.now(timezone.utc)})


async def clear_failed_logins(_db, identifier: str) -> None:
    await _db.login_attempts.delete_many({"identifier": identifier})


async def ensure_indexes(_db) -> None:
    await _db.users.create_index("id", unique=True)
    await _db.users.create_index("email", sparse=True)
    await _db.login_attempts.create_index("identifier")


async def seed_demo_credentials(_db) -> None:
    """Give the two surfaced demo personas emails + password; deactivate legacy personas."""
    pw = os.environ.get("DEMO_PASSWORD") or "Demo123!"
    for role, email in DEMO_ROLE_TO_EMAIL.items():
        uid = _DEMO_USER_IDS[role]
        u = await _db.users.find_one({"id": uid})
        if not u:
            continue
        patch = {"email": email}
        if not verify_password(pw, u.get("password_hash", "")):
            patch["password_hash"] = hash_password(pw)
        await _db.users.update_one({"id": uid}, {"$set": patch})
    for uid, email in _LEGACY.items():
        await _db.users.update_one(
            {"id": uid},
            {"$set": {"email": email}, "$unset": {"password_hash": ""}},
        )
