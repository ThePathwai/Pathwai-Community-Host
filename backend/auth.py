"""Auth: JWT cookies, bcrypt passwords, role guards, login lockout, demo credentials."""
from __future__ import annotations

import os
import random
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request

from database import db, demo_mode, hub_db

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


# ---------- cookies (single source of truth: server.py, routes/hub.py, oauth.py, invites.py) ----------
def cookie_secure() -> bool:
    """Secure cookies by default on a real deployment; plain-http dev/test (demo mode) defaults to off.
    COOKIE_SECURE=true/false always wins."""
    v = os.environ.get("COOKIE_SECURE")
    if v is not None and v.strip() != "":
        return v.strip().lower() == "true"
    return not demo_mode()


def cookie_samesite() -> str:
    v = (os.environ.get("COOKIE_SAMESITE") or "lax").strip().lower()
    return v if v in ("lax", "strict", "none") else "lax"


def set_cookie(response, key: str, value: str, max_age: int, httponly: bool = True) -> None:
    secure = cookie_secure()
    samesite = cookie_samesite()
    if samesite == "none":
        secure = True  # browsers reject SameSite=None cookies that aren't Secure
    response.set_cookie(key=key, value=value, httponly=httponly, secure=secure, samesite=samesite, max_age=max_age, path="/")


def set_auth_cookies(response, access: str, refresh: str) -> None:
    set_cookie(response, "access_token", access, ACCESS_MIN * 60)
    set_cookie(response, "refresh_token", refresh, REFRESH_DAYS * 86400)


def check_password_strength(pw: str) -> str:
    """The one password rule (10+ characters with a letter and a number), enforced server-side so it
    can't be sidestepped by calling the API directly instead of using the signup form."""
    if len(pw) < 10 or not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw):
        raise ValueError("Password needs 10+ characters with a letter and a number.")
    return pw


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
    # iat_ms: millisecond issue time, so "sign out everywhere" can tell a token issued a moment BEFORE the
    # revocation (rejected) from one issued right AFTER it in the same second (accepted).
    payload = {"sub": sub, "type": kind, "iat": now, "iat_ms": int(time.time() * 1000), "exp": now + delta}
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


# ---------- session revocation ----------
# Access/refresh tokens are stateless JWTs, so "sign out everywhere" and "a password change kills old
# sessions" work with a cutoff instead of a token list: the person's record(s) carry
# `sessions_valid_after` (epoch milliseconds) and any token issued before it is rejected.
def session_revoked(payload: dict, doc: Optional[dict]) -> bool:
    cut = (doc or {}).get("sessions_valid_after")
    issued_ms = payload.get("iat_ms") or int(payload.get("iat") or 0) * 1000
    return bool(cut) and int(issued_ms) < int(cut)


def revocation_cutoff() -> int:
    return int(time.time() * 1000)


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
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if user and session_revoked(payload, user):
        return None
    if user:
        user.pop("sessions_valid_after", None)
    # Membership is approval-gated: someone whose request is still pending (or was declined) has a valid
    # platform login, and their application row lives in this community's `users` collection under the
    # same id -- but they must not be treated as a member of it until an admin approves them.
    if user and (user.get("membership_status") or "approved") != "approved":
        return None
    return user


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
# A client can spoof X-Forwarded-For to dodge the per-(ip, email) counter, so every email also gets a
# looser counter that ignores the IP: at most EMAIL_LOCKOUT_MAX failures per window from anywhere.
EMAIL_LOCKOUT_MAX = 20


async def check_lockout(_db, identifier: str) -> None:
    since = datetime.now(timezone.utc) - timedelta(minutes=LOCKOUT_WINDOW_MIN)
    n = await _db.login_attempts.count_documents({"identifier": identifier, "at": {"$gte": since}})
    if n >= LOCKOUT_MAX:
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")
    email = identifier.rsplit(":", 1)[-1]  # identifier is "<ip>:<email>"; the ip may itself contain colons (IPv6)
    if email and await _db.login_attempts.count_documents({"identifier": {"$regex": ":" + re.escape(email) + "$"}, "at": {"$gte": since}}) >= EMAIL_LOCKOUT_MAX:
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")


async def rate_limit(bucket: str, key: str, limit: int, window_s: int, detail: str = "Too many requests. Please try again in a little while.") -> None:
    """Fixed-window throttle kept in the platform database (so it holds across communities and
    restarts). Records this hit, then rejects with 429 once `limit` hits land inside the window."""
    flag = (os.environ.get("RATE_LIMITS") or "").strip().lower()
    if flag == "off" or (flag != "on" and os.environ.get("USE_MOCK_DB", "false").lower() == "true"):
        return  # in-memory dev/test runs (shared client IP, hundreds of signups) -- RATE_LIMITS=on forces it
    now = datetime.now(timezone.utc)
    col = hub_db().rate_events
    since = now - timedelta(seconds=window_s)
    if await col.count_documents({"bucket": bucket, "key": key, "at": {"$gte": since}}) >= limit:
        raise HTTPException(status_code=429, detail=detail)
    await col.insert_one({"bucket": bucket, "key": key, "at": now})
    if random.random() < 0.02:  # housekeeping: nothing here is useful after a day
        await col.delete_many({"at": {"$lt": now - timedelta(days=1)}})


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
