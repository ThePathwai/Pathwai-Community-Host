"""Social sign-in: verifies a Google or Apple ID token and signs the person into Pathwai
using the same multi-community account model as email/password login (see routes/hub.py).

Configure with env vars:
  GOOGLE_CLIENT_ID   - OAuth 2.0 Web client ID, from Google Cloud Console -> Credentials.
  APPLE_CLIENT_ID    - the "Services ID" identifier, from Apple Developer -> Sign in with Apple.

Until a provider's client ID is set, GET /auth/oauth/providers reports it as unconfigured so the
login page can hide (or grey out) that button, and POST /auth/oauth/{provider} answers 501 instead
of trying to verify anything. Nothing else about the deployment needs to change once the env vars
are set — the frontend picks the client ID up from /auth/oauth/providers automatically.

Both providers hand back a signed JWT ("ID token") straight to the browser, so there's no server
side redirect/callback to host: the frontend posts that token here as `credential`, we verify its
signature against the provider's published public keys (fetched + cached via PyJWKClient) and trust
the email inside it exactly the way a verified email/password login trusts a correct password.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Dict, Optional

import jwt
from fastapi import APIRouter, HTTPException, Request, Response
from jwt import PyJWKClient
from pydantic import BaseModel, Field

from auth import ACCESS_MIN, REFRESH_DAYS, create_access_token, create_refresh_token
from database import current_community, hub_db
from .hub import records_for, set_community_cookie

router = APIRouter(tags=["oauth"])

COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "lax").lower()

_PROVIDERS: Dict[str, Dict[str, Any]] = {
    "google": {
        "label": "Google",
        "issuers": ("https://accounts.google.com", "accounts.google.com"),
        "jwks_uri": "https://www.googleapis.com/oauth2/v3/certs",
        "env": "GOOGLE_CLIENT_ID",
    },
    "apple": {
        "label": "Apple",
        "issuers": ("https://appleid.apple.com",),
        "jwks_uri": "https://appleid.apple.com/auth/keys",
        "env": "APPLE_CLIENT_ID",
    },
}


def _client_id(provider: str) -> str:
    return os.environ.get(_PROVIDERS[provider]["env"], "")


@lru_cache(maxsize=4)
def _jwk_client(provider: str) -> PyJWKClient:
    return PyJWKClient(_PROVIDERS[provider]["jwks_uri"])


@router.get("/auth/oauth/providers")
async def oauth_providers() -> Dict[str, Any]:
    """Which social sign-in buttons the login page should offer, and whether they're live yet."""
    out = {}
    for key, cfg in _PROVIDERS.items():
        client_id = _client_id(key)
        out[key] = {"label": cfg["label"], "client_id": client_id or None, "configured": bool(client_id)}
    return out


class OAuthIn(BaseModel):
    credential: str = Field(min_length=10, description="The provider's signed ID token (a JWT).")
    name: Optional[str] = Field(default=None, max_length=120, description="Apple only sends a name once, outside the token — the client forwards it here if it has it.")


def _verify_id_token(provider: str, credential: str) -> Dict[str, Any]:
    cfg = _PROVIDERS[provider]
    client_id = _client_id(provider)
    if not client_id:
        raise HTTPException(status_code=501, detail=f"{cfg['label']} sign-in isn't configured for this deployment yet.")
    try:
        signing_key = _jwk_client(provider).get_signing_key_from_jwt(credential)
        claims = jwt.decode(
            credential, signing_key.key, algorithms=["RS256"],
            audience=client_id, issuer=list(cfg["issuers"]),
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail=f"Couldn't verify that {cfg['label']} sign-in ({exc}). Please try again.")
    if not claims.get("email"):
        raise HTTPException(status_code=400, detail=f"Your {cfg['label']} account doesn't share an email address, so we can't sign you in with it.")
    return claims


@router.post("/auth/oauth/{provider}")
async def oauth_login(provider: str, body: OAuthIn, request: Request, response: Response):
    if provider not in _PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown sign-in provider")

    claims = _verify_id_token(provider, body.credential)
    email = claims["email"].strip().lower()
    sub = str(claims.get("sub") or "")
    name = (body.name or claims.get("name") or email.split("@")[0]).strip()
    picture = claims.get("picture")

    hub, recs = await records_for(email)
    approved = [(sl, d) for sl, d in recs if (d.get("membership_status") or "approved") == "approved"]
    is_new_account = not hub and not recs

    if is_new_account:
        # Brand-new person, verified by the provider instead of a password — same shape /hub/signup
        # creates, just without a password hash (there's nothing to check it against).
        uid = str(uuid.uuid4())
        hub = {
            "id": uid, "name": name, "email": email, "password_hash": None, "avatar_url": picture or None,
            "title": "", "oauth_provider": provider, "oauth_sub": sub,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await hub_db().accounts.insert_one(dict(hub))
    elif not hub and not approved:
        # Only unapproved (or rejected) community records exist for this email — same messaging as
        # the password login path.
        if any(d.get("membership_status") == "pending" for _, d in recs):
            raise HTTPException(status_code=403, detail="Your membership request is still awaiting approval. We'll let you know as soon as it's reviewed.")
        raise HTTPException(status_code=403, detail="Your membership request was not approved. Contact the team if you think this is a mistake.")
    elif hub:
        # Returning platform account — link this provider (and backfill an avatar) without touching
        # anything the person set themselves.
        patch: Dict[str, Any] = {"oauth_provider": provider, "oauth_sub": sub}
        if not hub.get("avatar_url") and picture:
            patch["avatar_url"] = picture
        await hub_db().accounts.update_one({"id": hub["id"]}, {"$set": patch})
        hub = {**hub, **patch}

    uid = hub["id"] if hub else approved[0][1]["id"]
    cur = current_community()
    pick = next(((sl, d) for sl, d in approved if sl == cur), approved[0] if approved else None)
    role = (pick[1].get("role") if pick else None) or "member"

    access = create_access_token(uid, role)
    refresh = create_refresh_token(uid)
    response.set_cookie("access_token", access, httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, max_age=ACCESS_MIN * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, max_age=REFRESH_DAYS * 86400, path="/")
    if pick:
        set_community_cookie(response, pick[0])

    user = pick[1] if pick else {"id": uid, "name": hub.get("name") if hub else name, "email": email}
    safe_user = {k: v for k, v in user.items() if k not in ("_id", "password_hash")}
    return {
        "ok": True,
        "user": safe_user if pick else None,
        "account": {"id": uid, "name": safe_user.get("name"), "email": email},
        "access_token": access,
        "new_account": is_new_account,
    }
