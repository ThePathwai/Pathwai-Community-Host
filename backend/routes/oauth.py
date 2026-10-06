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

from auth import create_access_token, create_refresh_token, set_auth_cookies
from database import COMMUNITY_SLUGS, current_community, hub_db
from ._common import TERMS_REQUIRED_MSG, terms_stamp, audit_platform
from .hub import _apply_to_community, records_for, set_community_cookie

router = APIRouter(tags=["oauth"])

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
    # Same purpose as SignupIn.join_slug (routes/hub.py) -- came from a community's own external
    # share link (frontend CommunityLanding.jsx, via Signup.jsx/Login.jsx's ?join=<slug>) and chose
    # a social sign-in instead of the email form. Without this, that context was silently dropped.
    join_slug: Optional[str] = None
    # Only needed when this sign-in would CREATE an account: the client sets it once the person has ticked
    # "I agree to the Terms and Privacy Policy". Without it a brand-new person gets HTTP 428 (see below)
    # and the client asks for the agreement and retries with the same credential.
    accepted_terms: bool = False


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
    if str(claims.get("email_verified", "true")).lower() != "true":
        raise HTTPException(status_code=400, detail=f"Your {cfg['label']} email address isn't verified, so we can't sign you in with it.")
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

    if is_new_account and not body.accepted_terms:
        raise HTTPException(status_code=428, detail={"error": TERMS_REQUIRED_MSG, "code": "terms_required"})
    if is_new_account:
        # Brand-new person, verified by the provider instead of a password — same shape /hub/signup
        # creates, just without a password hash (there's nothing to check it against).
        uid = str(uuid.uuid4())
        hub = {
            "id": uid, "name": name, "email": email, "password_hash": None, "avatar_url": picture or None,
            "title": "", "oauth_provider": provider, "oauth_sub": sub,
            "created_at": datetime.now(timezone.utc).isoformat(), **terms_stamp(),
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
    set_auth_cookies(response, access, refresh)
    if pick:
        set_community_cookie(response, pick[0])
    await audit_platform(uid, "auth.signup" if is_new_account else "auth.login_success", "user", uid, {"provider": provider}, request=request)

    user = pick[1] if pick else {"id": uid, "name": hub.get("name") if hub else name, "email": email}
    safe_user = {k: v for k, v in user.items() if k not in ("_id", "password_hash")}

    # Same share-link join as /hub/signup's join_slug (routes/hub.py) -- every community requires
    # admin approval, so this never seats the person immediately; it just makes sure a request is
    # actually filed instead of silently dropping the "I'm here to join X" context from the share
    # link just because they chose Google/Apple over the email form.
    joined = None
    if body.join_slug and body.join_slug in COMMUNITY_SLUGS:
        result = await _apply_to_community(body.join_slug, {"id": uid, "name": safe_user.get("name") or name, "email": email, "avatar_url": picture})
        joined = {"slug": body.join_slug, "status": result["status"]}
        if result["status"] == "approved":
            set_community_cookie(response, body.join_slug)

    return {
        "ok": True,
        "user": safe_user if pick else None,
        "account": {"id": uid, "name": safe_user.get("name"), "email": email},
        "access_token": access,
        "new_account": is_new_account,
        "joined": joined,
    }
