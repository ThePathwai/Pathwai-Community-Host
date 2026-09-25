"""Shared helpers for route modules."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request

from auth import get_current_user_optional
from database import db, strip_id


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
    if role:
        u = await db.users.find_one({"is_demo_me_for_role": role}) or await db.users.find_one({"role": role})
        return clean(u)
    return None


async def require_viewer(request: Request, role: Optional[str] = None) -> Dict[str, Any]:
    me = await viewer(request, role)
    if not me:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return me


async def audit(actor_id: Optional[str], action: str, target_type: Optional[str] = None,
                target_id: Optional[str] = None, meta: Optional[Dict[str, Any]] = None) -> None:
    try:
        await db.audit_log.insert_one({
            "actor_id": actor_id, "action": action, "target_type": target_type,
            "target_id": target_id, "meta": meta or {}, "created_at": datetime.now(timezone.utc),
        })
    except Exception:  # noqa: BLE001
        pass


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


PRIVATE_FIELDS = ("email", "phone", "settings", "admin_notes", "mentor_ids", "hidden_from_directory")
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
