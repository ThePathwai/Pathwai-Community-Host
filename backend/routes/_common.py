"""Shared helpers for route modules."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request

from auth import client_ip, get_current_user_optional
from database import db, demo_mode, hub_db, strip_id


def check_image(url: Optional[str]) -> Optional[str]:
    """Accept a small in-app photo (data URI) or an uploaded file path; reject anything else."""
    if not url:
        return None
    if url.startswith("/api/uploads/") and len(url) < 200:
        return url
    import re
    if len(url) > 900_000 or not re.match(r"^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$", url):
        raise HTTPException(status_code=400, detail="Photos must be JPG, PNG or WebP and under about 600 KB")
    return url


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    return strip_id(doc) if doc else doc


async def viewer(request: Request, role: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Signed-in user, else the demo persona for `role` (public preview mode)."""
    me = await get_current_user_optional(request)
    if me:
        return me
    # Public "preview as <role>" browsing is a demo-site feature only. On a real deployment this would
    # hand any signed-out visitor the dashboard of the first real member (or admin) with that role.
    if role and demo_mode():
        u = await db.users.find_one({"is_demo_me_for_role": role}) or await db.users.find_one({"role": role})
        return clean(u)
    return None


async def require_viewer(request: Request, role: Optional[str] = None) -> Dict[str, Any]:
    me = await viewer(request, role)
    if not me:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return me


def _audit_entry(actor_id, action, target_type, target_id, meta, ip=None) -> Dict[str, Any]:
    from security import request_id  # local: security imports auth, which imports database
    return {
        "actor_id": actor_id, "action": action, "target_type": target_type, "target_id": target_id,
        "meta": meta or {}, "ip": ip, "request_id": request_id(), "created_at": datetime.now(timezone.utc),
    }


async def audit(actor_id: Optional[str], action: str, target_type: Optional[str] = None,
                target_id: Optional[str] = None, meta: Optional[Dict[str, Any]] = None) -> None:
    """Append-only entry in the ACTIVE COMMUNITY's audit log (what that community's admins see)."""
    try:
        await db.audit_log.insert_one(_audit_entry(actor_id, action, target_type, target_id, meta))
    except Exception as exc:  # noqa: BLE001 -- auditing must never break the request it describes
        logging.getLogger(__name__).error("audit write failed for %s: %s", action, exc)


async def audit_platform(actor_id: Optional[str], action: str, target_type: Optional[str] = None,
                         target_id: Optional[str] = None, meta: Optional[Dict[str, Any]] = None,
                         request: Optional[Request] = None) -> None:
    """Append-only entry in the PLATFORM audit log (hub database): sign-ins, account lifecycle, community
    creation, platform-admin access, data export/deletion. This is the log an auditor asks for -- it
    exists even when no community is selected (e.g. a login before any community is pinned)."""
    try:
        ip = client_ip(request) if request is not None else None
        await hub_db().audit_log.insert_one(_audit_entry(actor_id, action, target_type, target_id, meta, ip))
    except Exception as exc:  # noqa: BLE001
        logging.getLogger(__name__).error("platform audit write failed for %s: %s", action, exc)


def lower_set(*lists: Any) -> set:
    out = set()
    for l in lists:
        if isinstance(l, str):
            l = [l]
        for x in l or []:
            if isinstance(x, str) and x.strip():
                out.add(x.strip().lower())
    return out


# ---- Portal helpers -------------------------------------------------------
HIDDEN_STATUSES = ["pending", "rejected", "changes_requested"]
MEMBER_TYPES = ["founder", "mentor", "alumni", "partner", "guest"]


def member_type(u: Optional[Dict[str, Any]]) -> str:
    if not u:
        return "guest"
    if u.get("member_type") in MEMBER_TYPES:
        return u["member_type"]
    return "mentor" if u.get("role") == "mentor" else "founder"


def approved_q(q: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Add 'only approved content' filter (docs without a status count as approved)."""
    q = dict(q or {})
    q["status"] = {"$nin": HIDDEN_STATUSES}
    return q


def audience_ok(doc: Dict[str, Any], me: Optional[Dict[str, Any]]) -> bool:
    aud = doc.get("audience") or []
    if not aud or (me and me.get("role") == "admin"):
        return True
    return member_type(me) in aud


PRIVATE_FIELDS = ("email", "phone", "birthday", "settings", "admin_notes", "mentor_ids", "hidden_from_directory", "saved_by")
SENSITIVE_FOR_OUTSIDERS = ("traction", "revenue_funding_status")


def public_view(u: Dict[str, Any], viewer_user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Community-facing version of a profile: no admin notes, respects the member's privacy settings,
    and mentors/partners/guests only see traction & revenue when it's shared with them or they're assigned."""
    if not u:
        return u
    if viewer_user and (viewer_user.get("id") == u.get("id") or viewer_user.get("role") == "admin"):
        return u
    out = dict(u)
    priv = ((u.get("settings") or {}).get("privacy")) or {}
    for f in PRIVATE_FIELDS:
        if f == "email" and priv.get("show_email"):
            continue
        if f == "phone" and priv.get("show_phone"):
            continue
        out.pop(f, None)
    if u.get("contact_visibility") == "hidden" or not viewer_user:
        out.pop("contact", None)
    vt = member_type(viewer_user) if viewer_user else "guest"
    if vt in ("mentor", "partner", "guest") and member_type(u) == "founder":
        vid = viewer_user.get("id") if viewer_user else None
        if vid not in (u.get("mentor_ids") or []) and vid not in (u.get("shared_with") or []):
            for f in SENSITIVE_FOR_OUTSIDERS:
                out.pop(f, None)
    return out


def public_base_url(request: Request) -> str:
    """The externally visible origin of THIS API (scheme://host), for building webhook URLs and
    verifying signed webhooks behind Railway's proxy. PUBLIC_API_URL wins; otherwise X-Forwarded-*
    headers; otherwise whatever the request itself says."""
    import os
    env = (os.environ.get("PUBLIC_API_URL") or "").strip().rstrip("/")
    if env:
        return env
    proto = (request.headers.get("x-forwarded-proto") or request.url.scheme).split(",")[0].strip()
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc).split(",")[0].strip()
    return f"{proto}://{host}"


def return_base_url(request: Request) -> str:
    """Where the browser should land after leaving for a third party (e.g. Stripe Checkout) and coming
    back: the page's own Origin when it is one of our allowed frontend origins (so a custom domain and
    the default one both work), else the configured FRONTEND_URL, else this server."""
    import os
    allowed = {o.strip().rstrip("/") for o in (os.environ.get("CORS_ORIGINS") or "").split(",") if o.strip()}
    origin = (request.headers.get("origin") or "").rstrip("/")
    if origin and (origin in allowed or not allowed or "*" in allowed):
        return origin
    return ((os.environ.get("FRONTEND_URL") or "").strip() or str(request.base_url)).rstrip("/")


# ---------- legal consent ----------
# Bump when the Terms or Privacy Policy change materially (frontend/src/lib/legal.js carries the same
# value). Every new account records which version it accepted and when.
LEGAL_VERSION = "2026-10-06"
TERMS_REQUIRED_MSG = "You need to accept the Terms of Service and Privacy Policy to create an account."


def terms_stamp() -> Dict[str, Any]:
    return {"terms_accepted_at": now_iso(), "terms_version": LEGAL_VERSION}
