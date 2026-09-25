"""Pathwai hub: one login, many communities.

Every community has its own database (members, events, branding). This router is the platform layer on top:
account signup, the "My communities" list, applying to join a community, and entering one.
"""
from __future__ import annotations

import contextlib
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from auth import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from database import COMMUNITY_SLUGS, current_community, db, dbfor, hub_db, register_community_slug, set_community, _current
from .community_config import DEFAULT_CONFIG, THEME_PRESETS

router = APIRouter(tags=["hub"])
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"

_SLUG_RE = re.compile(r"[^a-z0-9]+")

# What a brand-new admin is choosing between on "I'm starting a new community" — each maps to a
# starting theme (from community_config.THEME_PRESETS) and a few sane defaults they can rename in
# the setup wizard immediately after. Kept short on purpose: this is a starting point, not a form.
CATEGORY_PRESETS: Dict[str, Dict[str, Any]] = {
    "church": {"label": "Church / faith community", "kind": "Faith community", "theme_preset": "forest", "member_plural": "Congregation",
               "event_types": ["Sunday Gathering", "Community Meal", "Connect Group", "Volunteer Day", "Youth Night", "Prayer Evening"]},
    "wellness": {"label": "Wellness / fitness brand", "kind": "Wellness & events community", "theme_preset": "playr-modern", "member_plural": "Members",
                 "event_types": ["Networking", "Workshop", "Wellness", "Social", "Summit"]},
    "dinner_club": {"label": "Private club / dinner series", "kind": "Private club", "theme_preset": "sunset", "member_plural": "Guests",
                    "event_types": ["Dinner", "Wine Salon", "Market Morning", "Members' Supper"]},
    "professional": {"label": "Professional network", "kind": "Professional network", "theme_preset": "ocean", "member_plural": "Members",
                      "event_types": ["Networking", "Workshop", "Panel", "Mixer"]},
    "other": {"label": "Something else", "kind": "Community", "theme_preset": "pathwai", "member_plural": "Members",
              "event_types": ["Gathering", "Meetup", "Workshop", "Social"]},
}


def _slugify(name: str) -> str:
    base = _SLUG_RE.sub("-", name.strip().lower()).strip("-") or "community"
    slug, i = base, 2
    while slug in COMMUNITY_SLUGS:
        slug = f"{base}-{i}"
        i += 1
    return slug


PLATFORM_ADMINS = {e.strip().lower() for e in os.environ.get("PLATFORM_ADMIN_EMAILS", "admin@yourcommunity.app").split(",") if e.strip()}


def is_platform_admin(email: Optional[str]) -> bool:
    """Pathwai-level administrators can enter and edit every community."""
    return bool(email) and email.strip().lower() in PLATFORM_ADMINS


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextlib.contextmanager
def in_community(slug: str):
    tok = _current.set(slug)
    try:
        yield
    finally:
        _current.reset(tok)


async def records_for(email: str):
    """The platform account (if any) plus this person's profile in every community, matched on email."""
    hub = await hub_db().accounts.find_one({"email": email})
    recs = []
    for slug in COMMUNITY_SLUGS:
        d = await dbfor(slug).users.find_one({"email": email})
        if d:
            recs.append((slug, d))
    return hub, recs


def set_community_cookie(response: Response, slug: str) -> None:
    response.set_cookie("pw_community", slug, httponly=False, samesite="lax", secure=COOKIE_SECURE, max_age=60 * 86400, path="/")


async def account_from_request(request: Request) -> Optional[dict]:
    """Signed-in Pathwai person (works without membership in the active community)."""
    tok = request.cookies.get("access_token")
    if not tok:
        auth = request.headers.get("authorization", "")
        tok = auth[7:].strip() if auth.lower().startswith("bearer ") else None
    if not tok:
        return None
    try:
        payload = decode_token(tok)
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "access":
        return None
    uid = payload["sub"]
    acc = await hub_db().accounts.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if acc:
        return acc
    for slug in COMMUNITY_SLUGS:
        d = await dbfor(slug).users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
        if d:
            return {"id": d["id"], "name": d.get("name"), "email": d.get("email"), "avatar_url": d.get("avatar_url"), "title": d.get("title")}
    return None


async def require_account(request: Request) -> dict:
    a = await account_from_request(request)
    if not a:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return a


async def _summary(slug: str) -> Dict[str, Any]:
    d = dbfor(slug)
    cfg = await d.community_config.find_one({"_key": "singleton"}) or {}
    brand = cfg.get("brand") or {}
    now = _now()
    return {
        "slug": slug, "name": cfg.get("community_name") or slug, "tagline": cfg.get("tagline"), "kind": cfg.get("community_kind") or "Community",
        "about": cfg.get("about") or cfg.get("tagline"), "cover": cfg.get("hub_cover"), "apply_questions": cfg.get("apply_questions") or [],
        "require_approval": cfg.get("require_approval", True),
        "brand": {"colors": brand.get("colors"), "mode": brand.get("mode"), "font": brand.get("font"), "heading_font": brand.get("heading_font"),
                  "radius": brand.get("radius"), "button_shape": brand.get("button_shape"), "logo_url": brand.get("logo_url")},
        "members": await d.users.count_documents({"hidden_from_directory": {"$ne": True}, "membership_status": {"$ne": "rejected"}}),
        "upcoming_events": await d.events.count_documents({"starts_at": {"$gte": now}}),
    }


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    name: str = Field(min_length=2, max_length=120)


# Someone's public/contact channels — kept as a nested object (mirrors how each community's own
# `users.contact` is shaped) so it can be merged into a community doc's `contact` field wholesale.
class ContactIn(BaseModel):
    phone: Optional[str] = Field(default="", max_length=40)
    linkedin: Optional[str] = Field(default="", max_length=200)
    instagram: Optional[str] = Field(default="", max_length=80)
    website: Optional[str] = Field(default="", max_length=200)


# The standard Pathwai profile, collected once on the account (not per community) right after signup,
# so every community application starts pre-filled instead of asking the same questions again. Mirrors
# the "profile.fields" a community can show on a member card (community_config.DEFAULT_PROFILE).
class AccountProfileIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    age: Optional[int] = Field(default=None, ge=13, le=120)
    avatar_url: Optional[str] = None
    title: Optional[str] = Field(default="", max_length=120)
    company: Optional[str] = Field(default="", max_length=120)
    location: Optional[str] = Field(default="", max_length=120)
    bio: Optional[str] = Field(default="", max_length=1000)
    skill_set: Optional[List[str]] = None
    interests_hobbies: Optional[List[str]] = None
    goals: Optional[List[str]] = None
    support_needs: Optional[List[str]] = None
    contact: Optional[ContactIn] = None


@router.post("/hub/signup", status_code=201)
async def hub_signup(body: SignupIn, response: Response):
    email = body.email.strip().lower()
    hub, recs = await records_for(email)
    if hub or recs:
        raise HTTPException(status_code=409, detail="An account with that email already exists. Sign in instead.")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid, "name": body.name.strip(), "email": email, "password_hash": hash_password(body.password), "avatar_url": None, "age": None,
        "title": "", "company": "", "location": "", "bio": "", "skill_set": [], "interests_hobbies": [], "goals": [], "support_needs": [],
        "contact": {"phone": "", "linkedin": "", "instagram": "", "website": ""}, "profile_completed": False, "created_at": _now(),
    }
    await hub_db().accounts.insert_one(dict(doc))
    response.set_cookie("access_token", create_access_token(uid, "member"), httponly=True, samesite="lax", secure=COOKIE_SECURE, max_age=3600 * 8, path="/")
    response.set_cookie("refresh_token", create_refresh_token(uid), httponly=True, samesite="lax", secure=COOKIE_SECURE, max_age=86400 * 14, path="/")
    return {"ok": True, "account": {k: v for k, v in doc.items() if k != "password_hash"}}


@router.patch("/hub/profile")
async def hub_update_profile(body: AccountProfileIn, acc: dict = Depends(require_account)):
    """Saves the standard Pathwai profile onto the account itself (platform-wide, not any one
    community's `users` doc). Asked once, right after signup — see AccountProfileIn above — and
    from then on used to pre-fill every `POST /hub/communities/{slug}/apply`."""
    values = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "name" in values:
        values["name"] = values["name"].strip()
    if "contact" in values:
        values["contact"] = {**(acc.get("contact") or {}), **values["contact"]}
    for k in ("title", "company", "location", "bio"):
        if k in values:
            values[k] = values[k].strip()
    values["profile_completed"] = True
    values["updated_at"] = _now()
    await hub_db().accounts.update_one({"id": acc["id"]}, {"$set": values})
    updated = await hub_db().accounts.find_one({"id": acc["id"]}, {"_id": 0, "password_hash": 0})
    return {"ok": True, "account": updated}


@router.get("/hub/community-categories")
async def community_categories():
    """Starting points offered on the admin onboarding step — see CATEGORY_PRESETS above."""
    return {"categories": [{"key": k, "label": v["label"]} for k, v in CATEGORY_PRESETS.items()]}


class CreateCommunityIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    category: str = Field(default="other")
    tagline: Optional[str] = Field(default="", max_length=200)


@router.post("/hub/communities", status_code=201)
async def create_community(body: CreateCommunityIn, response: Response, acc: dict = Depends(require_account)):
    """Admin onboarding, step 2: turns a brand-new Pathwai account into the founding admin of a
    brand-new community. The person lands in /setup right after to pick branding and content —
    this just needs to exist first so that page has somewhere to save to."""
    preset = CATEGORY_PRESETS.get(body.category) or CATEGORY_PRESETS["other"]
    theme = next((t for t in THEME_PRESETS if t["preset"] == preset["theme_preset"]), THEME_PRESETS[0])
    name = body.name.strip()
    slug = _slugify(name)
    now = _now()

    cfg = {
        **DEFAULT_CONFIG,
        "community_name": name,
        "tagline": (body.tagline or "").strip() or f"Welcome to {name}.",
        "community_kind": preset["kind"],
        "community_type": "social",
        "member_label_plural": preset["member_plural"],
        "member_label_singular": preset["member_plural"][:-1] if preset["member_plural"].endswith("s") else preset["member_plural"],
        "event_types": list(preset["event_types"]),
        "theme": {"preset": theme["preset"], "accent": theme["accent"]},
        "brand": {
            **DEFAULT_CONFIG["brand"], "preset": theme["preset"], "mode": theme["mode"], "colors": dict(theme["colors"]),
            "font": theme.get("font", DEFAULT_CONFIG["brand"]["font"]), "heading_font": theme.get("heading_font", DEFAULT_CONFIG["brand"]["heading_font"]),
            "heading_style": theme.get("heading_style", DEFAULT_CONFIG["brand"]["heading_style"]), "radius": theme.get("radius", DEFAULT_CONFIG["brand"]["radius"]),
            "button_shape": theme.get("button_shape", DEFAULT_CONFIG["brand"]["button_shape"]),
            "login_headline": f"Welcome to {name}.", "login_subhead": "Sign in to find events and people.",
            "welcome_message": f"Welcome to {name}. Here's what's happening this week.", "footer_text": name, "support_email": "",
        },
        "setup_completed": False,
        "_key": "singleton", "created_at": now, "updated_at": now,
    }
    d = dbfor(slug)
    await d.community_config.insert_one(dict(cfg))

    src = await hub_db().accounts.find_one({"id": acc["id"]}) or {}
    # "Founder" and the community's own name stay as the role label / employer here rather than
    # whatever the account profile says (that's what makes this THEIR founding entry) — everything
    # personal (bio, location, skills, interests, goals, support needs) still carries over.
    contact = {"email": acc["email"], **{k: v for k, v in (src.get("contact") or {}).items() if v}}
    await d.users.insert_one({
        "id": acc["id"], "name": acc["name"], "email": acc["email"], "password_hash": src.get("password_hash"), "role": "admin", "member_type": "founder",
        "tagline": "", "bio": src.get("bio") or "", "title": "Founder", "company": name, "location": src.get("location") or "", "age": src.get("age"),
        "avatar_url": acc.get("avatar_url") or "", "cover_url": "",
        "expertise": [], "skill_set": list(src.get("skill_set") or []), "focus_areas": [], "open_to": [], "services_offered": [], "topics_can_advise_on": [],
        "interests_hobbies": list(src.get("interests_hobbies") or []), "goals": list(src.get("goals") or []), "support_needs": list(src.get("support_needs") or []),
        "needs_seeking": [], "custom_fields": {}, "contact": contact, "contact_visibility": "members",
        "hidden_from_directory": False, "signup_source": "hub_create", "created_at": now, "updated_at": now, "membership_status": "approved",
    })

    register_community_slug(slug)
    await hub_db().communities.insert_one({"slug": slug, "name": name, "category": body.category, "owner_id": acc["id"], "created_at": now})
    set_community_cookie(response, slug)
    return {"ok": True, "slug": slug}


@router.get("/hub/me")
async def hub_me(request: Request):
    acc = await account_from_request(request)
    return {"account": acc, "active": current_community() if acc else None}


@router.get("/hub/communities")
async def hub_communities(acc: dict = Depends(require_account)):
    out: List[Dict[str, Any]] = []
    for slug in COMMUNITY_SLUGS:
        s = await _summary(slug)
        u = await dbfor(slug).users.find_one({"email": acc["email"]})
        st = None
        if u:
            st = u.get("membership_status") or "approved"
        if is_platform_admin(acc["email"]):
            st = "approved"
            u = {**(u or {}), "role": "admin"}
        s["my"] = {"status": st or "none", "role": (u or {}).get("role") if st == "approved" else None,
                   "requested_at": (u or {}).get("created_at") if st == "pending" else None, "note": (u or {}).get("membership_note")}
        if is_platform_admin(acc["email"]):
            s["my"]["platform_admin"] = True
        if st == "approved" and u.get("role") == "admin":
            s["pending_requests"] = await dbfor(slug).users.count_documents({"membership_status": "pending"})
        out.append(s)
    return {"communities": out, "active": current_community()}


class ApplyIn(BaseModel):
    title: Optional[str] = Field(default="", max_length=120)
    message: Optional[str] = Field(default="", max_length=600)
    answers: Optional[Dict[str, str]] = None


@router.post("/hub/communities/{slug}/apply", status_code=201)
async def hub_apply(slug: str, body: ApplyIn, acc: dict = Depends(require_account)):
    if slug not in COMMUNITY_SLUGS:
        raise HTTPException(status_code=404, detail="Community not found")
    d = dbfor(slug)
    existing = await d.users.find_one({"email": acc["email"]})
    if existing:
        return {"ok": True, "status": existing.get("membership_status") or "approved"}
    src = await hub_db().accounts.find_one({"id": acc["id"]}) or {}
    cfg = await d.community_config.find_one({"_key": "singleton"}) or {}
    needs = cfg.get("require_approval", True)
    now = _now()
    reason = (body.message or "").strip()
    if body.answers:
        reason = (reason + "\n" + "\n".join(f"{k}: {v}" for k, v in body.answers.items() if v)).strip()
    # Pre-fill from the standard Pathwai profile saved on the account (see AccountProfileIn / hub_update_profile)
    # so applying to a community doesn't mean retyping a bio, skills and interests from scratch every time.
    # Anything the applicant typed into this specific apply form (title) wins over the account default.
    contact = {"email": acc["email"], **{k: v for k, v in (src.get("contact") or {}).items() if v}}
    doc = {
        "id": acc["id"], "name": acc["name"], "email": acc["email"], "password_hash": src.get("password_hash"), "role": "member", "member_type": "founder",
        "tagline": "", "bio": src.get("bio") or "", "title": (body.title or "").strip() or src.get("title") or "", "company": src.get("company") or "",
        "location": src.get("location") or "", "age": src.get("age"), "avatar_url": acc.get("avatar_url") or "", "cover_url": "",
        "expertise": [], "skill_set": list(src.get("skill_set") or []), "focus_areas": [], "open_to": [], "services_offered": [], "topics_can_advise_on": [],
        "interests_hobbies": list(src.get("interests_hobbies") or []), "goals": list(src.get("goals") or []),
        "support_needs": list(src.get("support_needs") or []), "needs_seeking": [], "custom_fields": {}, "contact": contact, "contact_visibility": "members",
        "hidden_from_directory": bool(needs), "join_reason": reason, "signup_source": "hub", "created_at": now, "updated_at": now,
        "membership_status": "pending" if needs else "approved",
    }
    await d.users.insert_one(doc)
    if needs:
        async for a in d.users.find({"role": "admin"}):
            await d.notifications.insert_one({"id": str(uuid.uuid4()), "user_id": a["id"], "kind": "membership_request", "title": "New membership request",
                                              "body": f'{acc["name"]} wants to join {cfg.get("community_name") or slug}.', "link": "/admin", "meta": {}, "read": False, "created_at": now})
    return {"ok": True, "status": doc["membership_status"]}


class EnterIn(BaseModel):
    slug: str


@router.post("/hub/enter")
async def hub_enter(body: EnterIn, response: Response, acc: dict = Depends(require_account)):
    if body.slug not in COMMUNITY_SLUGS:
        raise HTTPException(status_code=404, detail="Community not found")
    d = dbfor(body.slug)
    u = await d.users.find_one({"email": acc["email"]})
    if is_platform_admin(acc["email"]):
        now = _now()
        if u:
            await d.users.update_one({"id": u["id"]}, {"$set": {"role": "admin", "membership_status": "approved", "platform_admin": True}})
        else:
            src = await hub_db().accounts.find_one({"id": acc["id"]}) or {}
            if not src.get("password_hash"):
                for sl in COMMUNITY_SLUGS:
                    o = await dbfor(sl).users.find_one({"email": acc["email"]})
                    if o:
                        src = o
                        break
            await d.users.insert_one({
                "id": acc["id"], "name": acc["name"], "email": acc["email"], "password_hash": src.get("password_hash"), "role": "admin", "member_type": "founder",
                "tagline": "Pathwai platform admin", "bio": "", "title": "Platform admin", "company": "Pathwai", "location": "", "avatar_url": acc.get("avatar_url") or "",
                "cover_url": "", "expertise": [], "skill_set": [], "focus_areas": [], "open_to": [], "services_offered": [], "topics_can_advise_on": [],
                "interests_hobbies": [], "goals": [], "support_needs": [], "needs_seeking": [], "custom_fields": {}, "contact": {"email": acc["email"]},
                "contact_visibility": "members", "hidden_from_directory": True, "platform_admin": True, "signup_source": "platform",
                "created_at": now, "updated_at": now, "membership_status": "approved"})
        set_community_cookie(response, body.slug)
        return {"ok": True, "slug": body.slug}
    if not u or (u.get("membership_status") or "approved") != "approved":
        raise HTTPException(status_code=403, detail="You're not a member of this community yet.")
    set_community_cookie(response, body.slug)
    return {"ok": True, "slug": body.slug}


@router.post("/hub/leave-community")
async def hub_leave(response: Response, acc: dict = Depends(require_account)):
    response.delete_cookie("pw_community", path="/")
    return {"ok": True}
