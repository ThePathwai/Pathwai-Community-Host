"""Pathwai hub: one login, many communities.

Every community has its own database (members, events, branding). This router is the platform layer on top:
account signup, the "My communities" list, applying to join a community, and entering one.
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field, field_validator

from auth import check_password_strength, client_ip, create_access_token, create_refresh_token, decode_token, hash_password, rate_limit, session_revoked, set_auth_cookies, set_cookie, verify_password
from database import COMMUNITY_SLUGS, current_community, db, dbfor, demo_mode, hub_db, register_community_slug, set_community, _current
from directory import find_all_for_email, find_by_id, list_all_people, person_by_email, reindex_email
from .community_config import DEFAULT_CONFIG, THEME_PRESETS
from .messages import _preview, _thread_out
from birthday import BirthdayError, age_from, clean_birthday
from ._common import TERMS_REQUIRED_MSG, audit, audit_platform, terms_stamp

router = APIRouter(tags=["hub"])

_SLUG_RE = re.compile(r"[^a-z0-9]+")
MAX_PROFILE_PHOTOS = 9  # a 3x3 grid, same idea as an Instagram-style profile -- see AccountProfileIn.photos

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


# Async callables(slug) run right after a new community is created -- server.py registers the one that
# builds that community database's indexes (kept out of this module to avoid a circular import).
COMMUNITY_CREATED_HOOKS: list = []


def _slugify(name: str) -> str:
    base = _SLUG_RE.sub("-", name.strip().lower()).strip("-") or "community"
    slug, i = base, 2
    while slug in COMMUNITY_SLUGS:
        slug = f"{base}-{i}"
        i += 1
    return slug


# Platform admins can enter and edit EVERY community, so a real deployment must name them explicitly
# (PLATFORM_ADMIN_EMAILS=you@example.com). The demo admin login is only a platform admin in demo mode --
# otherwise anyone could sign up as admin@yourcommunity.app and walk into every community.
PLATFORM_ADMINS = {e.strip().lower() for e in os.environ.get("PLATFORM_ADMIN_EMAILS", "admin@yourcommunity.app" if demo_mode() else "").split(",") if e.strip()}


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
    recs = await find_all_for_email(email)
    return hub, recs


def set_community_cookie(response: Response, slug: str) -> None:
    set_cookie(response, "pw_community", slug, 60 * 86400, httponly=False)


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
        if session_revoked(payload, acc):
            return None
        acc.pop("sessions_valid_after", None)
        return acc
    hit = await find_by_id(uid)
    if hit:
        _, d = hit
        if session_revoked(payload, d):
            return None
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
        # Always true -- see _apply_to_community's "Policy" comment. Not read from cfg: a stale
        # community_config doc from before this policy existed could still say False.
        "require_approval": True,
        "country": cfg.get("country") or "", "interest_tags": cfg.get("interest_tags") or [],
        "brand": {"colors": brand.get("colors"), "mode": brand.get("mode"), "font": brand.get("font"), "heading_font": brand.get("heading_font"),
                  "radius": brand.get("radius"), "button_shape": brand.get("button_shape"), "logo_url": brand.get("logo_url")},
        "members": await d.users.count_documents({"hidden_from_directory": {"$ne": True}, "membership_status": {"$ne": "rejected"}}),
        "upcoming_events": await d.events.count_documents({"starts_at": {"$gte": now}}),
    }


@router.get("/hub/communities/{slug}/public")
async def hub_community_public(slug: str) -> Dict[str, Any]:
    """The external share-link landing page's one call (frontend CommunityLanding.jsx, reached at
    /c/:slug with no login) -- an admin's "Copy invite link" on their own community hands this URL
    to anyone, logged in or not. Deliberately no Depends(require_account): the whole point is that
    someone who has never heard of Pathwai can open it. _summary() is already exactly this shape --
    name/tagline/brand/counts, nothing that identifies a member -- so this just makes it reachable
    before an account exists instead of only from the authenticated Discover list."""
    if slug not in COMMUNITY_SLUGS:
        raise HTTPException(status_code=404, detail="Community not found")
    return await _summary(slug)


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    name: str = Field(min_length=2, max_length=120)
    # Set when this signup came from a community's own external share link (see
    # GET /hub/communities/{slug}/public and frontend CommunityLanding.jsx) -- joins that specific
    # community in the same request instead of dropping a brand-new person onto the generic Hub to
    # go find it again. Silently ignored if the slug doesn't exist, so a stale/mistyped link just
    # falls back to a normal signup rather than failing it.
    join_slug: Optional[str] = None
    # Ticked "I agree to the Terms of Service and Privacy Policy" on the signup form. Required: the API
    # refuses to create an account without it, so it can't be skipped by calling the endpoint directly.
    accepted_terms: bool = Field(default=False, validate_default=True)  # validate_default: an OMITTED field must fail too

    @field_validator("accepted_terms")
    @classmethod
    def _accepted(cls, v: bool) -> bool:
        if v is not True:
            raise ValueError(TERMS_REQUIRED_MSG)
        return v

    @field_validator("password")
    @classmethod
    def _strong(cls, v: str) -> str:
        return check_password_strength(v)


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
    birthday: Optional[str] = Field(default=None, max_length=40)  # age is worked out from this
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
    # A small photo gallery on the account itself -- what turns a profile into something people
    # actually browse (see hub_person/the People panel), the same way a social profile shows photos
    # rather than just a bio. Capped hard in hub_update_profile, not just here, since model validation
    # on length doesn't catch someone PATCHing with 50 photos one at a time via repeated calls.
    photos: Optional[List[str]] = None


@router.post("/hub/signup", status_code=201)
async def hub_signup(body: SignupIn, request: Request, response: Response):
    await rate_limit("signup_ip", client_ip(request), 10, 3600, "Too many sign-ups from this network. Please try again later.")
    email = body.email.strip().lower()
    hub, recs = await records_for(email)
    if hub or recs:
        raise HTTPException(status_code=409, detail="An account with that email already exists. Sign in instead.")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid, "name": body.name.strip(), "email": email, "password_hash": hash_password(body.password), "avatar_url": None, "age": None,
        "title": "", "company": "", "location": "", "bio": "", "skill_set": [], "interests_hobbies": [], "goals": [], "support_needs": [],
        "contact": {"phone": "", "linkedin": "", "instagram": "", "website": ""}, "photos": [], "profile_completed": False, "created_at": _now(),
        **terms_stamp(),
    }
    await hub_db().accounts.insert_one(dict(doc))
    await audit_platform(uid, "auth.signup", "user", uid, {"terms_version": doc.get("terms_version")}, request=request)
    set_auth_cookies(response, create_access_token(uid, "member"), create_refresh_token(uid))
    joined = None
    if body.join_slug and body.join_slug in COMMUNITY_SLUGS:
        result = await _apply_to_community(body.join_slug, {"id": uid, "name": doc["name"], "email": email, "avatar_url": None})
        joined = {"slug": body.join_slug, "status": result["status"]}
        if result["status"] == "approved":
            # Unreachable today -- every community requires approval (_apply_to_community always
            # returns "pending" for a brand-new signup) -- kept so this path is still correct if that
            # policy is ever relaxed again.
            set_community_cookie(response, body.join_slug)
    return {"ok": True, "account": {k: v for k, v in doc.items() if k != "password_hash"}, "joined": joined}


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
    if "birthday" in values:
        try:
            values["birthday"] = clean_birthday(values["birthday"])
        except BirthdayError as e:
            raise HTTPException(status_code=400, detail=str(e))
        values["age"] = age_from(values["birthday"])  # a cleared birthday clears the age too
    if "photos" in values:
        values["photos"] = [p for p in values["photos"] if p][:MAX_PROFILE_PHOTOS]
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
async def create_community(body: CreateCommunityIn, request: Request, response: Response, acc: dict = Depends(require_account)):
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
        "tagline": "", "bio": src.get("bio") or "", "title": "Founder", "company": name, "location": src.get("location") or "", "age": age_from(src.get("birthday")) or src.get("age"), "birthday": src.get("birthday"),
        "avatar_url": acc.get("avatar_url") or "", "cover_url": "",
        "expertise": [], "skill_set": list(src.get("skill_set") or []), "focus_areas": [], "open_to": [], "services_offered": [], "topics_can_advise_on": [],
        "interests_hobbies": list(src.get("interests_hobbies") or []), "goals": list(src.get("goals") or []), "support_needs": list(src.get("support_needs") or []),
        "needs_seeking": [], "custom_fields": {}, "contact": contact, "contact_visibility": "members",
        "hidden_from_directory": False, "signup_source": "hub_create", "created_at": now, "updated_at": now, "membership_status": "approved",
    })
    await reindex_email(acc["email"])

    register_community_slug(slug)
    await hub_db().communities.insert_one({"slug": slug, "name": name, "category": body.category, "owner_id": acc["id"], "created_at": now})
    await audit_platform(acc["id"], "community.created", "community", slug, {"name": name, "category": body.category}, request=request)
    with in_community(slug):
        await audit(acc["id"], "community.created", "community", slug, {"name": name})
    for hook in COMMUNITY_CREATED_HOOKS:
        try:
            await hook(slug)
        except Exception as exc:  # noqa: BLE001 -- indexes are an optimisation; never fail creating the community over them
            logging.getLogger(__name__).warning("post-create hook failed for %s: %s", slug, exc)
    set_community_cookie(response, slug)
    return {"ok": True, "slug": slug}


@router.get("/hub/me")
async def hub_me(request: Request):
    acc = await account_from_request(request)
    return {"account": acc, "active": current_community() if acc else None}


@router.get("/hub/communities")
async def hub_communities(acc: dict = Depends(require_account)):
    # Fans every community's lookup out in parallel (asyncio.gather preserves COMMUNITY_SLUGS'
    # order in the result) instead of awaiting each one in turn -- same fix as find_all_for_email's
    # own fan-out (directory.py), applied here because this is the other place that otherwise pays
    # one full round trip per community, back to back, on every Hub page load.
    platform_admin = is_platform_admin(acc["email"])

    async def _one(slug: str) -> Dict[str, Any]:
        s, u = await asyncio.gather(_summary(slug), dbfor(slug).users.find_one({"email": acc["email"]}))
        st = None
        if u:
            st = u.get("membership_status") or "approved"
        if platform_admin:
            st = "approved"
            u = {**(u or {}), "role": "admin"}
        s["my"] = {"status": st or "none", "role": (u or {}).get("role") if st == "approved" else None,
                   "requested_at": (u or {}).get("created_at") if st == "pending" else None, "note": (u or {}).get("membership_note")}
        if platform_admin:
            s["my"]["platform_admin"] = True
        if st == "approved" and u.get("role") == "admin":
            s["pending_requests"] = await dbfor(slug).users.count_documents({"membership_status": "pending"})
        return s

    out = list(await asyncio.gather(*(_one(slug) for slug in COMMUNITY_SLUGS)))
    return {"communities": out, "active": current_community()}


@router.get("/hub/messages")
async def hub_messages(acc: dict = Depends(require_account)):
    """A unified inbox merging every joined community's message threads into one list, tagged by
    which community each thread belongs to -- the pre-community-entry "Messages centre" on the Hub
    page (Hub.jsx's HubInbox panel). Opening a thread still happens inside that community (hub_enter
    + /inbox/{id}): replying, deleting and reporting all depend on the community-scoped session
    (get_current_user), which this platform-level account endpoint deliberately doesn't carry.

    find_all_for_email already gives every (slug, users-doc) pair for this email in one shot (an
    index read plus a handful of direct lookups, not a loop over every community -- see
    directory.py); this just fans out one more read per membership, in parallel, to pull that
    community's own threads for that specific per-community user id."""
    hits = await find_all_for_email(acc["email"])

    async def _one(slug: str, u: dict):
        if (u.get("membership_status") or "approved") != "approved":
            return []
        with in_community(slug):
            raw = [t async for t in db.message_threads.find({"participant_ids": u["id"]}).sort("last_message_at", -1)]
            out = [await _thread_out(t, u["id"]) for t in raw]
        for t in out:
            t["community_slug"] = slug
        return out

    me_email = acc["email"].strip().lower()
    results = await asyncio.gather(*(_one(slug, u) for slug, u in hits))
    threads = [t for sub in results for t in sub]
    # Platform-level DMs (no community needed -- see the "platform-level messaging" section below)
    # merge into the same list, tagged community_slug: None, so the Hub inbox shows one feed
    # regardless of whether a conversation happened inside a community or directly between accounts.
    platform_raw = [t async for t in hub_db().platform_threads.find({"participant_emails": me_email}).sort("last_message_at", -1)]
    threads += [await _platform_thread_out(t, me_email) for t in platform_raw]
    threads.sort(key=lambda t: t.get("last_message_at") or "", reverse=True)
    return {"threads": threads, "unread": sum(1 for t in threads if t["unread"])}


async def ensure_hub_social_indexes() -> None:
    await hub_db().follows.create_index([("follower_email", 1), ("followee_email", 1)], unique=True)
    await hub_db().follows.create_index("followee_email")
    await hub_db().platform_threads.create_index("participant_emails")
    await hub_db().platform_threads.create_index([("last_message_at", -1)])
    await hub_db().platform_messages.create_index([("thread_id", 1), ("created_at", 1)])
    await hub_db().audit_log.create_index([("created_at", -1)])
    await hub_db().audit_log.create_index([("action", 1), ("created_at", -1)])
    await hub_db().audit_log.create_index("actor_id")


def _public_person(p: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    p = p or {}
    # `photos` rides along on every shape this feeds (search, following/followers, a platform
    # thread's "other") so the People panel can render a feed/profile of actual photos instead of
    # just a name and a bio -- not just on the full profile detail, which would mean a second round
    # trip per card.
    return {"email": p.get("email"), "name": p.get("name"), "avatar_url": p.get("avatar_url"), "title": p.get("title"), "company": p.get("company"),
            "photos": (p.get("photos") or [])[:MAX_PROFILE_PHOTOS]}


async def _public_communities(memberships) -> List[Dict[str, Any]]:
    """The subset of a person's community memberships that are safe to show on their platform-wide
    profile: approved, and not hidden_from_directory (the same flag a community already uses to keep
    someone out of *its own* member list -- reused here rather than inventing a second opt-out)."""
    approved = [(slug, u) for slug, u in memberships if (u.get("membership_status") or "approved") == "approved" and not u.get("hidden_from_directory")]

    async def _one(slug: str) -> Dict[str, Any]:
        cfg = await dbfor(slug).community_config.find_one({"_key": "singleton"}) or {}
        brand = cfg.get("brand") or {}
        return {"slug": slug, "name": cfg.get("community_name") or slug, "logo_url": brand.get("logo_url"), "colors": brand.get("colors") or {}}

    return list(await asyncio.gather(*(_one(slug) for slug, _ in approved)))


@router.get("/hub/people")
async def hub_people(q: str = "", acc: dict = Depends(require_account)):
    """Platform-wide people search for following -- not any one community's member list. Most
    members never signed up through /hub/signup (they joined straight into a community), so this
    draws from every community's own users docs too, merged by email (see directory.list_all_people)."""
    me_email = acc["email"].strip().lower()
    people = await list_all_people()
    following = {f["followee_email"] async for f in hub_db().follows.find({"follower_email": me_email}, {"followee_email": 1})}
    s = q.strip().lower()
    out = []
    for p in people:
        if p["email"] == me_email:
            continue
        if s and not any(s in (p.get(k) or "").lower() for k in ("name", "title", "company")):
            continue
        out.append({**_public_person(p), "is_following": p["email"] in following})
    out.sort(key=lambda p: (p["name"] or "").lower())
    return {"people": out[:50]}


@router.get("/hub/people/{email}")
async def hub_person(email: str, acc: dict = Depends(require_account)):
    email = email.strip().lower()
    p = await person_by_email(email)
    if not p:
        raise HTTPException(status_code=404, detail="Person not found")
    me_email = acc["email"].strip().lower()
    communities = await _public_communities(p["memberships"])
    is_following = bool(await hub_db().follows.find_one({"follower_email": me_email, "followee_email": email}))
    is_followed_by = bool(await hub_db().follows.find_one({"follower_email": email, "followee_email": me_email}))
    followers = await hub_db().follows.count_documents({"followee_email": email})
    following_count = await hub_db().follows.count_documents({"follower_email": email})
    return {**_public_person(p), "bio": p.get("bio"), "communities": communities, "is_self": email == me_email,
            "is_following": is_following, "is_followed_by": is_followed_by, "followers": followers, "following": following_count}


@router.post("/hub/people/{email}/follow", status_code=201)
async def follow_person(email: str, acc: dict = Depends(require_account)):
    email = email.strip().lower()
    me_email = acc["email"].strip().lower()
    if email == me_email:
        raise HTTPException(status_code=400, detail="You can't follow yourself")
    if not await person_by_email(email):
        raise HTTPException(status_code=404, detail="Person not found")
    if not await hub_db().follows.find_one({"follower_email": me_email, "followee_email": email}):
        await hub_db().follows.insert_one({"id": str(uuid.uuid4()), "follower_email": me_email, "followee_email": email, "created_at": _now()})
    return {"ok": True, "is_following": True}


@router.delete("/hub/people/{email}/follow")
async def unfollow_person(email: str, acc: dict = Depends(require_account)):
    await hub_db().follows.delete_one({"follower_email": acc["email"].strip().lower(), "followee_email": email.strip().lower()})
    return {"ok": True, "is_following": False}


@router.get("/hub/following")
async def hub_following(acc: dict = Depends(require_account)):
    emails = [f["followee_email"] async for f in hub_db().follows.find({"follower_email": acc["email"].strip().lower()})]
    people = await asyncio.gather(*(person_by_email(e) for e in emails))
    return {"people": [_public_person(p) for p in people if p]}


@router.get("/hub/followers")
async def hub_followers(acc: dict = Depends(require_account)):
    emails = [f["follower_email"] async for f in hub_db().follows.find({"followee_email": acc["email"].strip().lower()})]
    people = await asyncio.gather(*(person_by_email(e) for e in emails))
    return {"people": [_public_person(p) for p in people if p]}


# ---- platform-level messaging: DMs that don't need a shared community ----
# Mirrors routes/messages.py's thread/message split (same shape, same "address the exact same set of
# people again and it continues the thread" rule) but lives in hub_db() instead of any one
# community's database, and is keyed by participant *email* rather than a community-scoped user id --
# the only identifier that's actually stable across every community someone might belong to (see
# directory.person_by_email). Covers both plain DMs and the "invite/share" cases: a thread can carry
# a `context` card ({"type": "event"|"community", "slug": ..., "event_id": ..., "title": ...}) that
# the composer attached, same optional-context idea as a community thread's `context`.
async def _platform_thread_out(t: Dict[str, Any], me_email: str) -> Dict[str, Any]:
    other_emails = [e for e in t["participant_emails"] if e != me_email]
    others = []
    for e in other_emails:
        p = await person_by_email(e)
        others.append(_public_person(p) if p else {"email": e, "name": e, "avatar_url": None, "title": None, "company": None})
    my_read_at = (t.get("read_at") or {}).get(me_email)
    unread = bool(t.get("last_message_at") and t.get("last_sender_email") != me_email and (not my_read_at or my_read_at < t["last_message_at"]))
    return {
        "id": t["id"], "subject": t.get("subject"), "context": t.get("context"), "created_at": t["created_at"],
        "last_message_at": t.get("last_message_at") or t["created_at"], "last_message_preview": t.get("last_message_preview") or "",
        "last_sender_email": t.get("last_sender_email"), "others": others, "other": others[0] if others else None,
        "unread": unread, "community_slug": None,
    }


class PlatformThreadIn(BaseModel):
    recipient_emails: List[EmailStr] = Field(min_length=1)
    subject: str = ""
    body: str
    context: Optional[Dict[str, Any]] = None


class PlatformReplyIn(BaseModel):
    body: str


async def _mark_platform_read(t: Dict[str, Any], email: str, at: str) -> None:
    """Sets read_at[email] by replacing the whole subdocument rather than a dotted `$set` path --
    unlike a community message thread's read_at (keyed by a plain user id), this one is keyed by
    email, and Mongo's dot-notation splits on *every* dot in a field path, so `$set` on
    `read_at.<email>` silently nests "name"/"example"/"com" instead of setting one "name@example.com"
    key. Rewriting the full subdocument sidesteps that regardless of how many dots an email has."""
    read_at = dict(t.get("read_at") or {})
    read_at[email] = at
    await hub_db().platform_threads.update_one({"id": t["id"]}, {"$set": {"read_at": read_at}})


@router.get("/hub/messages/threads/{thread_id}")
async def hub_platform_thread_detail(thread_id: str, acc: dict = Depends(require_account)):
    me_email = acc["email"].strip().lower()
    t = await hub_db().platform_threads.find_one({"id": thread_id})
    if not t or me_email not in t["participant_emails"]:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await _mark_platform_read(t, me_email, _now())
    t = await hub_db().platform_threads.find_one({"id": thread_id})
    out = await _platform_thread_out(t, me_email)
    out["messages"] = [{"id": m["id"], "sender_email": m["sender_email"], "body": m["body"], "created_at": m["created_at"]}
                        async for m in hub_db().platform_messages.find({"thread_id": thread_id}, {"_id": 0}).sort("created_at", 1)]
    return out


@router.post("/hub/messages/threads", status_code=201)
async def start_platform_thread(body: PlatformThreadIn, acc: dict = Depends(require_account)):
    if not body.body.strip():
        raise HTTPException(status_code=400, detail="Write a message")
    me_email = acc["email"].strip().lower()
    recipients = sorted({str(r).strip().lower() for r in body.recipient_emails if str(r).strip().lower() != me_email})
    if not recipients:
        raise HTTPException(status_code=400, detail="Add at least one recipient")
    for r in recipients:
        if not await person_by_email(r):
            raise HTTPException(status_code=404, detail="One of the people you added isn't on Pathwai")
    participant_emails = sorted({me_email, *recipients})
    now = _now()
    existing = await hub_db().platform_threads.find_one({"participant_emails": participant_emails})
    if existing:
        thread_id = existing["id"]
    else:
        thread_id = str(uuid.uuid4())
        await hub_db().platform_threads.insert_one({
            "id": thread_id, "participant_emails": participant_emails, "subject": body.subject.strip()[:140] or "New message",
            "context": body.context, "created_at": now, "read_at": {me_email: now},
        })
    await hub_db().platform_messages.insert_one({"id": str(uuid.uuid4()), "thread_id": thread_id, "sender_email": me_email, "body": body.body.strip(), "created_at": now})
    await hub_db().platform_threads.update_one({"id": thread_id}, {"$set": {
        "last_message_at": now, "last_message_preview": _preview(body.body), "last_sender_email": me_email,
    }})
    t = await hub_db().platform_threads.find_one({"id": thread_id})
    await _mark_platform_read(t, me_email, now)
    t = await hub_db().platform_threads.find_one({"id": thread_id})
    return await _platform_thread_out(t, me_email)


@router.post("/hub/messages/threads/{thread_id}/reply", status_code=201)
async def reply_platform_thread(thread_id: str, body: PlatformReplyIn, acc: dict = Depends(require_account)):
    if not body.body.strip():
        raise HTTPException(status_code=400, detail="Write a message")
    me_email = acc["email"].strip().lower()
    t = await hub_db().platform_threads.find_one({"id": thread_id})
    if not t or me_email not in t["participant_emails"]:
        raise HTTPException(status_code=404, detail="Conversation not found")
    now = _now()
    await hub_db().platform_messages.insert_one({"id": str(uuid.uuid4()), "thread_id": thread_id, "sender_email": me_email, "body": body.body.strip(), "created_at": now})
    await hub_db().platform_threads.update_one({"id": thread_id}, {"$set": {
        "last_message_at": now, "last_message_preview": _preview(body.body), "last_sender_email": me_email,
    }})
    t = await hub_db().platform_threads.find_one({"id": thread_id})
    await _mark_platform_read(t, me_email, now)
    return {"ok": True}


async def _resync_platform_thread_summary(thread_id: str) -> None:
    """Mirrors routes/messages.py's _resync_thread_summary for a community thread: after a platform
    message is deleted, the thread-list row (last_message_at/preview/sender) has to point at whatever
    is now actually the newest message, or a deleted message's text would keep showing in the Hub
    inbox even though opening the thread no longer has it."""
    last = await hub_db().platform_messages.find({"thread_id": thread_id}).sort("created_at", -1).limit(1).to_list(1)
    if last:
        m = last[0]
        await hub_db().platform_threads.update_one({"id": thread_id}, {"$set": {
            "last_message_at": m["created_at"], "last_message_preview": _preview(m["body"]), "last_sender_email": m["sender_email"],
        }})
    else:
        t = await hub_db().platform_threads.find_one({"id": thread_id})
        await hub_db().platform_threads.update_one({"id": thread_id}, {"$set": {
            "last_message_at": t["created_at"], "last_message_preview": "", "last_sender_email": None,
        }})


@router.delete("/hub/messages/threads/{thread_id}/messages/{message_id}")
async def delete_platform_message(thread_id: str, message_id: str, acc: dict = Depends(require_account)):
    """Same delete-your-own-message affordance routes/messages.py gives a community thread -- a
    platform DM (no community, no community admin) had no way to take back a message at all."""
    me_email = acc["email"].strip().lower()
    t = await hub_db().platform_threads.find_one({"id": thread_id})
    if not t or me_email not in t["participant_emails"]:
        raise HTTPException(status_code=404, detail="Conversation not found")
    m = await hub_db().platform_messages.find_one({"id": message_id, "thread_id": thread_id})
    if not m:
        raise HTTPException(status_code=404, detail="Message not found")
    if m["sender_email"] != me_email:
        raise HTTPException(status_code=403, detail="Only the sender can delete this message")
    await hub_db().platform_messages.delete_one({"id": message_id})
    await _resync_platform_thread_summary(thread_id)
    return {"ok": True}


class PlatformReportIn(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


@router.post("/hub/messages/threads/{thread_id}/messages/{message_id}/report", status_code=201)
async def report_platform_message(thread_id: str, message_id: str, body: PlatformReportIn, acc: dict = Depends(require_account)):
    """Flags a platform DM for review, same "doesn't remove anything, just puts it in front of
    someone" shape as a community message's report (routes/messages.py's report_message) -- but a
    platform-level DM has no community admin to notify, so this records to hub_db() for Pathwai's own
    trust & safety review instead of a per-community audit log."""
    me_email = acc["email"].strip().lower()
    t = await hub_db().platform_threads.find_one({"id": thread_id})
    if not t or me_email not in t["participant_emails"]:
        raise HTTPException(status_code=404, detail="Conversation not found")
    m = await hub_db().platform_messages.find_one({"id": message_id, "thread_id": thread_id})
    if not m:
        raise HTTPException(status_code=404, detail="Message not found")
    await hub_db().platform_reports.insert_one({
        "id": str(uuid.uuid4()), "thread_id": thread_id, "message_id": message_id, "reported_by": me_email,
        "reported_user_email": m["sender_email"], "reason": body.reason.strip(), "message_preview": _preview(m["body"]),
        "created_at": _now(),
    })
    return {"ok": True}


@router.get("/hub/communities/{slug}/events")
async def hub_community_events(slug: str, acc: dict = Depends(require_account)):
    """Upcoming events for one of YOUR OWN communities, read straight off that community's own
    database without switching the active community context (dbfor(slug), not the `db` contextvar
    proxy) -- lets the platform message composer's invite/share attach-picker list real events to
    attach to a DM without "entering" anywhere first. Scoped to communities you're actually an
    approved member of, same guard hub_enter uses, so this can't be used to probe a community you
    have no relationship with."""
    if slug not in COMMUNITY_SLUGS:
        raise HTTPException(status_code=404, detail="Community not found")
    u = await dbfor(slug).users.find_one({"email": acc["email"].strip().lower()})
    if not u or (u.get("membership_status") or "approved") != "approved":
        raise HTTPException(status_code=403, detail="You're not a member of this community")
    now = _now()
    events = [{"id": e["id"], "title": e["title"], "starts_at": e["starts_at"]}
              async for e in dbfor(slug).events.find({"starts_at": {"$gte": now}}, {"_id": 0, "id": 1, "title": 1, "starts_at": 1}).sort("starts_at", 1).limit(20)]
    return {"events": events}


class ApplyIn(BaseModel):
    title: Optional[str] = Field(default="", max_length=120)
    message: Optional[str] = Field(default="", max_length=600)
    answers: Optional[Dict[str, str]] = None


async def _apply_to_community(slug: str, acc: Dict[str, Any], title: str = "", message: str = "", answers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """Core of /hub/communities/{slug}/apply, factored out so a signup that already names its
    target community (SignupIn.join_slug -- the external share-link flow below) can join it in the
    same request instead of bouncing through a second call right after. `acc` only needs
    id/name/email/avatar_url; both callers already know `slug` is valid."""
    d = dbfor(slug)
    existing = await d.users.find_one({"email": acc["email"]})
    if existing:
        return {"ok": True, "status": existing.get("membership_status") or "approved"}
    src = await hub_db().accounts.find_one({"id": acc["id"]}) or {}
    cfg = await d.community_config.find_one({"_key": "singleton"}) or {}
    # Policy: every community requires admin approval, full stop -- no community can auto-approve a
    # join request, regardless of what its own `require_approval` config says. That field is kept
    # around purely for display (see _summary()) and is never allowed to skip this.
    needs = True
    now = _now()
    reason = (message or "").strip()
    if answers:
        reason = (reason + "\n" + "\n".join(f"{k}: {v}" for k, v in answers.items() if v)).strip()
    # Pre-fill from the standard Pathwai profile saved on the account (see AccountProfileIn / hub_update_profile)
    # so applying to a community doesn't mean retyping a bio, skills and interests from scratch every time.
    # Anything the applicant typed into this specific apply form (title) wins over the account default.
    contact = {"email": acc["email"], **{k: v for k, v in (src.get("contact") or {}).items() if v}}
    doc = {
        "id": acc["id"], "name": acc["name"], "email": acc["email"], "password_hash": src.get("password_hash"), "role": "member", "member_type": "founder",
        "tagline": "", "bio": src.get("bio") or "", "title": (title or "").strip() or src.get("title") or "", "company": src.get("company") or "",
        "location": src.get("location") or "", "age": age_from(src.get("birthday")) or src.get("age"), "birthday": src.get("birthday"), "avatar_url": acc.get("avatar_url") or "", "cover_url": "",
        "expertise": [], "skill_set": list(src.get("skill_set") or []), "focus_areas": [], "open_to": [], "services_offered": [], "topics_can_advise_on": [],
        "interests_hobbies": list(src.get("interests_hobbies") or []), "goals": list(src.get("goals") or []),
        "support_needs": list(src.get("support_needs") or []), "needs_seeking": [], "custom_fields": {}, "contact": contact, "contact_visibility": "members",
        "hidden_from_directory": bool(needs), "join_reason": reason, "signup_source": "hub", "created_at": now, "updated_at": now,
        "membership_status": "pending" if needs else "approved",
    }
    await d.users.insert_one(doc)
    await reindex_email(acc["email"])
    if needs:
        from .notifications import notify
        with in_community(slug):  # notify() writes to the pinned community, and sends the admins a push
            async for a in d.users.find({"role": "admin"}):
                await notify(a["id"], "membership_request", "New membership request",
                             f'{acc["name"]} wants to join {cfg.get("community_name") or slug}.', "/admin?tab=members")
    return {"ok": True, "status": doc["membership_status"]}


@router.post("/hub/communities/{slug}/apply", status_code=201)
async def hub_apply(slug: str, body: ApplyIn, acc: dict = Depends(require_account)):
    if slug not in COMMUNITY_SLUGS:
        raise HTTPException(status_code=404, detail="Community not found")
    return await _apply_to_community(slug, acc, title=body.title or "", message=body.message or "", answers=body.answers)


class EnterIn(BaseModel):
    slug: str


@router.post("/hub/enter")
async def hub_enter(body: EnterIn, request: Request, response: Response, acc: dict = Depends(require_account)):
    if body.slug not in COMMUNITY_SLUGS:
        raise HTTPException(status_code=404, detail="Community not found")
    d = dbfor(body.slug)
    u = await d.users.find_one({"email": acc["email"]})
    if is_platform_admin(acc["email"]):
        # Privileged cross-community access: recorded on the platform log AND in the community's own log.
        await audit_platform(acc["id"], "platform_admin.entered_community", "community", body.slug, request=request)
        with in_community(body.slug):
            await audit(acc["id"], "platform_admin.entered_community", "community", body.slug)
        now = _now()
        if u:
            await d.users.update_one({"id": u["id"]}, {"$set": {"role": "admin", "membership_status": "approved", "platform_admin": True}})
        else:
            src = await hub_db().accounts.find_one({"id": acc["id"]}) or {}
            if not src.get("password_hash"):
                for sl, o in await find_all_for_email(acc["email"]):
                    src = o
                    break
            await d.users.insert_one({
                "id": acc["id"], "name": acc["name"], "email": acc["email"], "password_hash": src.get("password_hash"), "role": "admin", "member_type": "founder",
                "tagline": "Pathwai platform admin", "bio": "", "title": "Platform admin", "company": "Pathwai", "location": "", "avatar_url": acc.get("avatar_url") or "",
                "cover_url": "", "expertise": [], "skill_set": [], "focus_areas": [], "open_to": [], "services_offered": [], "topics_can_advise_on": [],
                "interests_hobbies": [], "goals": [], "support_needs": [], "needs_seeking": [], "custom_fields": {}, "contact": {"email": acc["email"]},
                "contact_visibility": "members", "hidden_from_directory": True, "platform_admin": True, "signup_source": "platform",
                "created_at": now, "updated_at": now, "membership_status": "approved"})
            await reindex_email(acc["email"])
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
