"""Pathwai — Layer 3: Community Operating System (memberships + applications).

Data model:
- `memberships`  { id, user_id, org_slug, status, joined_at, ... }
    status ∈ {approved, revoked}
- `applications` { id, user_id, org_slug, pitch, status, decided_at, ... }
    status ∈ {approved, pending, rejected}

Per user constraint: **applications auto-approve** for now. The flow still writes
an application record so we can gate + display it later; the corresponding
membership row is created in the same transaction.

Access model on a per-org community:
- Non-members: see basic member cards (name, avatar, headline, industry focus,
  product description brief). No PII (email/phone), no ventures/skills/vision.
- Approved members: full context (bio, skills, needs, traction, product,
  vision, contact, ventures).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---------- Pydantic models ----------
class ApplicationCreate(BaseModel):
    pitch: Optional[str] = Field(None, max_length=1200)
    why: Optional[str] = Field(None, max_length=600)


class ProgramApplicationCreate(BaseModel):
    """Universal Application: profile is auto-attached, extras answered inline."""
    extra_answers: Dict[str, Any] = Field(default_factory=dict)
    pitch: Optional[str] = Field(None, max_length=1200)
    why: Optional[str] = Field(None, max_length=600)


class ApplicationDecision(BaseModel):
    decision: str  # approved | rejected
    reviewer_note: Optional[str] = Field(None, max_length=600)


# ---------- helpers ----------
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not doc:
        return None
    doc.pop("_id", None)
    return doc


async def ensure_indexes(db) -> None:
    await db.memberships.create_index([("user_id", 1), ("org_slug", 1)], unique=True)
    await db.memberships.create_index("org_slug")
    await db.memberships.create_index("user_id")
    await db.applications.create_index([("user_id", 1), ("org_slug", 1)])
    await db.applications.create_index("status")


# ---------- membership state ----------
async def get_membership(db, user_id: str, org_slug: str) -> Optional[Dict[str, Any]]:
    return _strip(await db.memberships.find_one({"user_id": user_id, "org_slug": org_slug}))


async def is_member(db, user_id: Optional[str], org_slug: str) -> bool:
    if not user_id:
        return False
    m = await get_membership(db, user_id, org_slug)
    return bool(m and m.get("status") == "approved")


# ---------- profile snapshot ----------
# Fields from the Universal Innovation Profile that get frozen onto an
# application at submit-time — reviewers see exactly what the user submitted,
# not whatever the profile looks like today.
_PROFILE_SNAPSHOT_FIELDS: tuple = (
    # identity
    "name", "email", "avatar_url", "title", "company", "location", "linkedin",
    # startup
    "startup_name", "startup_one_liner", "startup_stage", "startup_sector",
    "startup_geography", "incorporation_date",
    # narrative
    "business_summary", "founder_bio", "vision", "product_description",
    "business_industry_focus", "traction",
    # depth
    "team_members", "advisors", "funding_history", "awards",
    "previous_programs", "milestones", "portfolio", "traction_metrics",
    # links
    "pitch_deck_url", "product_demo_url", "supporting_docs",
    # skills
    "skill_set", "needs_seeking", "expertise",
)


def build_profile_snapshot(user: Dict[str, Any]) -> Dict[str, Any]:
    """Freeze the fields the reviewer needs to evaluate this application."""
    snap: Dict[str, Any] = {}
    for k in _PROFILE_SNAPSHOT_FIELDS:
        v = user.get(k)
        if v not in (None, "", [], {}):
            snap[k] = v
    return snap


# ---------- apply flow ----------
async def apply_to_org(
    db,
    *,
    user: Dict[str, Any],
    org_slug: str,
    org_name: str,
    pitch: Optional[str],
    why: Optional[str],
    auto_approve: bool = True,
    program_id: Optional[str] = None,
    program_name: Optional[str] = None,
    program_stage: Optional[str] = None,
    extra_answers: Optional[Dict[str, Any]] = None,
    include_profile_snapshot: bool = False,
) -> Dict[str, Any]:
    """Create an application; if auto_approve, also create the membership.

    When `program_id` is provided this is a Universal Application (Phase B):
    a separate application row is created per program the user applies to
    within the same org, and the frozen `profile_snapshot` is attached so
    reviewers see exactly what was submitted.
    """
    # Universal Applications are per (user, org, program) — duplicate check
    # keys on program_id when set, otherwise legacy (user, org) key.
    dup_query: Dict[str, Any] = {"user_id": user["id"], "org_slug": org_slug}
    if program_id:
        dup_query["program_id"] = program_id
    else:
        dup_query["program_id"] = {"$in": [None, ""]}
    existing_app = await db.applications.find_one(
        dup_query, sort=[("created_at", -1)],
    )
    if existing_app and existing_app.get("status") in ("pending", "approved"):
        return {"application": _strip(existing_app), "membership": await get_membership(db, user["id"], org_slug), "already": True}

    app_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_snapshot": {
            "name": user.get("name"),
            "avatar_url": user.get("avatar_url"),
            "title": user.get("title"),
            "company": user.get("company"),
            "industry": user.get("industry"),
        },
        "org_slug": org_slug,
        "org_name": org_name,
        "program_id": program_id,
        "program_name": program_name,
        "program_stage": program_stage,
        "pitch": (pitch or "").strip() or None,
        "why": (why or "").strip() or None,
        "extra_answers": extra_answers or {},
        "profile_snapshot": build_profile_snapshot(user) if include_profile_snapshot else None,
        "status": "approved" if auto_approve else "pending",
        "created_at": _now(),
        "decided_at": _now() if auto_approve else None,
        "reviewer_note": None,
    }
    await db.applications.insert_one(dict(app_doc))

    membership_doc: Optional[Dict[str, Any]] = None
    if auto_approve:
        membership_doc = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "org_slug": org_slug,
            "org_name": org_name,
            "status": "approved",
            "joined_at": _now(),
            "application_id": app_doc["id"],
        }
        # upsert (unique index on (user_id,org_slug))
        await db.memberships.update_one(
            {"user_id": user["id"], "org_slug": org_slug},
            {"$setOnInsert": membership_doc},
            upsert=True,
        )
        membership_doc = await get_membership(db, user["id"], org_slug)

    return {"application": _strip(app_doc), "membership": membership_doc, "already": False}


async def decide_application(
    db,
    *,
    app_id: str,
    decision: str,
    reviewer_note: Optional[str] = None,
) -> Dict[str, Any]:
    if decision not in ("approved", "rejected"):
        raise ValueError("decision must be 'approved' or 'rejected'")
    app_doc = await db.applications.find_one({"id": app_id})
    if not app_doc:
        raise ValueError("Application not found")

    await db.applications.update_one(
        {"id": app_id},
        {"$set": {"status": decision, "decided_at": _now(), "reviewer_note": reviewer_note}},
    )

    if decision == "approved":
        membership = {
            "id": str(uuid.uuid4()),
            "user_id": app_doc["user_id"],
            "org_slug": app_doc["org_slug"],
            "org_name": app_doc.get("org_name"),
            "status": "approved",
            "joined_at": _now(),
            "application_id": app_id,
        }
        await db.memberships.update_one(
            {"user_id": app_doc["user_id"], "org_slug": app_doc["org_slug"]},
            {"$setOnInsert": membership},
            upsert=True,
        )
    else:
        # reject wipes any existing membership defensively
        await db.memberships.delete_one(
            {"user_id": app_doc["user_id"], "org_slug": app_doc["org_slug"]}
        )

    updated = await db.applications.find_one({"id": app_id})
    return _strip(updated)


# ---------- list queries ----------
async def list_my_applications(db, user_id: str) -> List[Dict[str, Any]]:
    cur = db.applications.find({"user_id": user_id}).sort("created_at", -1)
    return [_strip(d) async for d in cur]


async def list_my_memberships(db, user_id: str) -> List[Dict[str, Any]]:
    cur = db.memberships.find({"user_id": user_id, "status": "approved"}).sort("joined_at", -1)
    return [_strip(d) async for d in cur]


async def list_org_applications(
    db, org_slug: str, status: Optional[str] = None
) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {"org_slug": org_slug}
    if status and status != "all":
        q["status"] = status
    cur = db.applications.find(q).sort("created_at", -1)
    return [_strip(d) async for d in cur]


# ---------- member listing with privacy gate ----------
# Fields anyone (public / non-members) can see about members of an org.
_PUBLIC_MEMBER_FIELDS = (
    "id", "name", "avatar_url", "role", "title", "company",
    "industry", "business_industry_focus", "product_description",
)

# Extra fields approved members can see about each other.
_PRIVATE_MEMBER_FIELDS = _PUBLIC_MEMBER_FIELDS + (
    "bio", "expertise", "skill_set", "needs_seeking", "traction",
    "vision", "support_needs", "strengths", "growing_in", "open_to",
    "cohort", "location", "venture", "venture_tagline",
    "linkedin", "contact",
)


def _project_member(user: Dict[str, Any], fields: tuple) -> Dict[str, Any]:
    return {k: user.get(k) for k in fields if user.get(k) is not None}


async def list_org_members(
    db, *, org_slug: str, viewer_user_id: Optional[str], org_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Return the community's member list.

    - For every viewer we always return `basic[]` (name, avatar, headline,
      business focus, brief).
    - If the viewer is an approved member, we also return `full[]` with rich
      context per-member. Otherwise `full` is omitted and `gated=True`.
    """
    membership_cur = db.memberships.find({"org_slug": org_slug, "status": "approved"})
    member_ids: List[str] = []
    async for m in membership_cur:
        if m.get("user_id"):
            member_ids.append(m["user_id"])

    users: List[Dict[str, Any]] = []
    if member_ids:
        async for u in db.users.find({"id": {"$in": member_ids}}):
            u.pop("_id", None)
            u.pop("password_hash", None)
            users.append(u)

    viewer_is_member = False
    if viewer_user_id:
        viewer_is_member = await is_member(db, viewer_user_id, org_slug)

    basic = [_project_member(u, _PUBLIC_MEMBER_FIELDS) for u in users]
    payload: Dict[str, Any] = {
        "org_slug": org_slug,
        "org_name": org_name,
        "total": len(users),
        "gated": not viewer_is_member,
        "viewer_is_member": viewer_is_member,
        "members": basic,
    }
    if viewer_is_member:
        payload["members_full"] = [_project_member(u, _PRIVATE_MEMBER_FIELDS) for u in users]
    return payload
