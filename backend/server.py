"""Pathwai member-facing backend API."""
import sys, pathlib
try:
    import emergentintegrations  # noqa: F401
except ImportError:  # private package unavailable -> local stand-in
    sys.path.insert(0, str(pathlib.Path(__file__).parent / "_shims"))
from fastapi import FastAPI, APIRouter, HTTPException, Query, Depends, Request, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone, timedelta
import uuid

from seed_data import build_seed_data
from seed_fake_members import seed_fake_community_members
from discovery import (
    build_mentors_seed,
    ensure_mentor_indexes,
    list_mentors as list_mentors_docs,
    unified_discover,
)
from organizations import (
    ORG_TYPES,
    REGIONS,
    STAGES,
    OrganizationUpdate,
    build_organizations_seed,
    ensure_indexes as ensure_org_indexes,
    find_program as find_org_program,
    get_organization as get_organization_doc,
    list_organizations as list_organizations_docs,
    organization_filters as organization_filter_meta,
    program_id_for,
    update_organization as update_organization_doc,
)
from memberships import (
    ApplicationCreate,
    ApplicationDecision,
    ProgramApplicationCreate,
    apply_to_org,
    decide_application,
    ensure_indexes as ensure_membership_indexes,
    get_membership as get_membership_doc,
    is_member as is_org_member,
    list_my_applications,
    list_my_memberships,
    list_org_applications,
    list_org_members,
)
from auth import (
    create_access_token,
    create_refresh_token,
    create_reset_token,
    decode_reset_token,
    decode_token,
    verify_password,
    hash_password,
    get_current_user,
    get_current_user_optional,
    require_role,
    check_lockout,
    record_failed_login,
    clear_failed_logins,
    seed_demo_credentials,
    ensure_indexes,
    client_ip,
    ACCESS_MIN,
    REFRESH_DAYS,
    DEMO_ROLE_TO_EMAIL,
)
import emailer
import jwt as pyjwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Shared Mongo client + strip_id helper live in database.py so route modules
# can import them without a circular dependency on server.py.
from database import client, db, strip_id, COMMUNITY_SLUGS, dbfor, hub_db, register_community_slug, set_community  # noqa: E402
from routes.hub import router as hub_router, records_for, set_community_cookie  # noqa: E402

app = FastAPI(title="Pathwai API")
app.state.db = db
api_router = APIRouter(prefix="/api")

# Route modules — each owns its own APIRouter and gets mounted under /api.
from routes.matches import router as matches_router  # noqa: E402
from routes.events import router as events_router  # noqa: E402
from routes.resources import router as resources_router  # noqa: E402
from routes.feeds import router as feeds_router  # noqa: E402
from routes.announcements import router as announcements_router  # noqa: E402
from routes.dashboard import router as dashboard_router  # noqa: E402
from routes.chat import router as chat_router  # noqa: E402
from routes.admin import router as admin_router  # noqa: E402
from routes.profile_requests import router as profile_requests_router  # noqa: E402
from routes.connect_requests import router as connect_requests_router  # noqa: E402
from routes.workspace import router as workspace_router  # noqa: E402
from routes.support_requests import router as support_requests_router, ensure_indexes as ensure_support_indexes  # noqa: E402
from routes.community_config import router as community_config_router  # noqa: E402
from routes.notifications import router as notifications_router, ensure_indexes as ensure_notification_indexes  # noqa: E402
from routes.uploads import router as uploads_router, init_storage as init_object_storage  # noqa: E402
from routes.invites import router as invites_router  # noqa: E402
from routes.portal import router as portal_router  # noqa: E402
from routes.admin_edit import router as admin_edit_router  # noqa: E402
from routes.integrations import router as integrations_router  # noqa: E402
from routes.blasts import router as blasts_router  # noqa: E402
from routes.oauth import router as oauth_router  # noqa: E402
from routes._common import public_view, member_type as _member_type  # noqa: E402
from seed_portal import seed_portal_demo  # noqa: E402
from seed_playr import seed_playr  # noqa: E402


def use_playr() -> bool:
    return (os.environ.get("DEMO_DATASET") or "playr").lower() != "legacy"

from backfill_spaces import backfill_content_spaces  # noqa: E402
from seed_program_extras import ensure_program_extras  # noqa: E402
from seed_support_requests import ensure_support_requests_seed  # noqa: E402


logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ---------- helpers ----------
async def ensure_seeded():
    """Idempotent seeding — fills collections only if empty."""
    if use_playr():
        await seed_playr(db)
        from seed_communities import seed_community, COMMUNITY_SLUGS_NEW
        for _slug in COMMUNITY_SLUGS_NEW:
            await seed_community(dbfor(_slug), _slug)
        return
    # Seed the Pathwai Layer 1 directory independently — always safe to call.
    if await db.organizations.count_documents({}) == 0:
        org_docs = build_organizations_seed()
        if org_docs:
            await db.organizations.insert_many([dict(d) for d in org_docs])

    # Seed the Pathwai Layer 2 public mentor directory.
    if await db.mentors.count_documents({}) == 0:
        mentor_docs = build_mentors_seed()
        if mentor_docs:
            await db.mentors.insert_many([dict(d) for d in mentor_docs])

    # Seed the simulated community — fake founders/mentors/investors across
    # every innovation space. Idempotent (only runs when no is_simulated users).
    # Runs before the users guard so it triggers on already-provisioned DBs.
    if await db.users.count_documents({}) > 0:
        await seed_fake_community_members(db)
        await seed_portal_demo(db)
        return
    seed = build_seed_data()
    for collection_name, docs in [
        ("users", seed["users"]),
        ("events", seed["events"]),
        ("resources", seed["resources"]),
        ("announcements", seed["announcements"]),
        ("slack_signals", seed["slack_signals"]),
        ("email_updates", seed["email_updates"]),
        ("profile_requests", seed.get("profile_requests", [])),
        ("connect_requests", seed.get("connect_requests", [])),
    ]:
        if docs:
            await db[collection_name].insert_many([dict(d) for d in docs])
    # Fake community needs the base users to exist first.
    await seed_fake_community_members(db)
    await seed_portal_demo(db)


async def _playr_startup_tail() -> None:
    await ensure_support_indexes()
    await ensure_notification_indexes()
    await _sync_admin_company_with_community(db)
    try:
        init_object_storage()
    except Exception as exc:  # noqa: BLE001
        logger.warning("object storage init at startup failed: %s", exc)


@app.on_event("startup")
async def on_startup():
    # Self-serve communities created via POST /hub/communities (see routes/hub.py) are registered
    # into COMMUNITY_SLUGS in-process at creation time; reload them here too so a restarted worker
    # still recognizes them instead of 404-ing every request into that community.
    async for doc in hub_db().communities.find({}):
        if doc.get("slug"):
            register_community_slug(doc["slug"])
    await ensure_seeded()
    await ensure_indexes(db)
    await ensure_org_indexes(db)
    await ensure_mentor_indexes(db)
    await ensure_membership_indexes(db)
    await seed_demo_credentials(db)
    if use_playr():
        await _playr_startup_tail()
        return
    await seed_default_memberships(db)
    # Assign a space_slug to every event / resource / announcement / signal so
    # the Slack-style workspace switcher can scope content per community.
    await backfill_content_spaces(db)
    # Phase B — attach `extra_questions` to a curated set of programs so the
    # Universal Application intake form has believable per-program questions.
    await ensure_program_extras(db)
    # Spec v2 — Community Value Exchange: Support Requests module.
    await ensure_support_indexes()
    await ensure_support_requests_seed(db)
    # In-app notifications (value-match pings, future channels).
    await ensure_notification_indexes()
    # Keep the admin persona's `company` in sync with the current community
    # name so a fresh deploy doesn't show stale UofT branding in the top chip
    # or member cards. Runs on every boot so admins renaming the community
    # via /config see the change reflected everywhere.
    await _sync_admin_company_with_community(db)
    # P4 · Object Storage — init once so uploads don't cold-start.
    try:
        init_object_storage()
    except Exception as exc:  # noqa: BLE001
        logger.warning("object storage init at startup failed: %s", exc)
    # P1 · Data Hygiene — sweep known QA/test rows on every boot.
    try:
        from data_hygiene import purge_qa_fixtures
        await purge_qa_fixtures(db)
    except Exception as exc:  # noqa: BLE001
        logger.warning("data hygiene sweep failed: %s", exc)


async def _sync_admin_company_with_community(db) -> None:
    cfg = await db.community_config.find_one({"_key": "singleton"})
    community_name = (cfg or {}).get("community_name") or "Pathwai"
    await db.users.update_many(
        {"role": "admin"},
        {"$set": {"company": community_name}},
    )


UOFT_ORG_SLUG = "university-of-toronto-entrepreneurship"

# Extra orgs the founder-demo has already applied to — so /applications and
# /me/memberships aren't empty on first load. Slugs must exist in the seeded
# organizations catalog (see organizations.py). Second value = application state.
SIMULATED_FOUNDER_APPLICATIONS = [
    ("mars-discovery-district",   "approved"),
    ("creative-destruction-lab",  "approved"),
    ("mitacs",                    "pending"),
    ("highline-beta",             "pending"),
    ("startup-tnt",               "rejected"),
]

SIMULATED_MENTOR_APPLICATIONS = [
    ("mars-discovery-district", "approved"),
    ("communitech",             "approved"),
]


async def _get_demo_user_by_role(db, role_key: str) -> Optional[Dict[str, Any]]:
    """Find the seeded demo user for a given role.

    Looks up via `is_demo_me_for_role` (source-of-truth flag) rather than the
    email map so that renaming/reducing the surfaced demo accounts doesn't
    break the seeding logic that still needs the underlying founder/mentor
    personas for cross-community data.
    """
    return await db.users.find_one({"is_demo_me_for_role": role_key})


async def seed_default_memberships(db) -> None:
    """Seed the ecosystem so demos are meaningful out-of-the-box:
      · Every seeded user is approved into the UofT community (drives the members list).
      · Founder-demo has a spread of applications (approved / pending / rejected)
        so the tracker page and the memberships rail on /me look real.
      · Mentor-demo has cross-community memberships to demo multi-community reach.
      · Founder-demo also has multi-hat: ["founder", "business_owner"] so the
        hat switcher and Ecosystem view are immediately relevant.

    Idempotent — only runs when memberships collection is empty.
    """
    if await db.memberships.count_documents({"simulated": {"$ne": True}}) > 0:
        return
    org = await db.organizations.find_one({"slug": UOFT_ORG_SLUG})
    if not org:
        return

    # 1) UofT membership for everyone we have seeded.
    now_iso = datetime.now(timezone.utc).isoformat()
    docs: List[Dict[str, Any]] = []
    already = {m["user_id"] async for m in db.memberships.find({"org_slug": UOFT_ORG_SLUG}, {"user_id": 1})}
    async for u in db.users.find({}, {"id": 1, "role": 1, "_id": 0}):
        if u["id"] in already:
            continue
        docs.append({
            "id": os.urandom(8).hex(),
            "user_id": u["id"],
            "org_slug": UOFT_ORG_SLUG,
            "org_name": org.get("name"),
            "status": "approved",
            "joined_at": now_iso,
            "application_id": None,
        })
    if docs:
        await db.memberships.insert_many(docs)

    # 2) Simulated applications + cross-community memberships for demo users.
    #    Build application docs so the tracker page renders varied statuses.
    def _make_app(user_id: str, slug: str, org_name: str, status: str, days_ago: int, pitch: str, why: str) -> Dict[str, Any]:
        created = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
        decided = created if status != "pending" else None
        return {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "user_snapshot": None,
            "org_slug": slug,
            "org_name": org_name,
            "pitch": pitch,
            "why": why,
            "status": status,
            "created_at": created,
            "decided_at": decided,
            "reviewer_note": None,
        }

    orgs_by_slug: Dict[str, Dict[str, Any]] = {}
    async for o in db.organizations.find({}, {"slug": 1, "name": 1, "_id": 0}):
        orgs_by_slug[o["slug"]] = o

    founder = await _get_demo_user_by_role(db, "founder")
    mentor = await _get_demo_user_by_role(db, "mentor")

    app_docs: List[Dict[str, Any]] = []
    membership_docs: List[Dict[str, Any]] = []

    if founder:
        # Give the founder demo two hats out-of-the-box + populated unified profile.
        await db.users.update_one(
            {"id": founder["id"]},
            {"$set": {
                "hats": ["founder", "business_owner"],
                "active_hat": "founder",
                "business_industry_focus": founder.get("business_industry_focus") or "Climate tech · Industrial decarbonisation",
                "product_description": founder.get("product_description")
                    or "OS for industrial plants to measure and cut Scope-1 emissions from day one — sensors + software that route to the highest-impact retrofit.",
                "traction": founder.get("traction")
                    or "3 paid pilots (mid-market manufacturers, ON + QC). $180K ARR run-rate. Backed by MaRS Cleantech + Mitacs Accelerate.",
                "vision": founder.get("vision")
                    or "By 2030, every industrial site in Canada should have real-time carbon accounting the same way it has real-time cost accounting.",
                "skill_set": founder.get("skill_set") or ["Product strategy", "IoT hardware", "Enterprise GTM", "Fundraising"],
                "needs_seeking": founder.get("needs_seeking") or ["Pilot customers in QC + AB", "Series-A investors", "Technical co-founder"],
                "updated_at": now_iso,
            }}
        )
        days_ago = 2
        for slug, status in SIMULATED_FOUNDER_APPLICATIONS:
            oref = orgs_by_slug.get(slug)
            if not oref:
                continue
            oname = oref["name"]
            app_docs.append(_make_app(
                founder["id"], slug, oname, status, days_ago,
                pitch="Building the OS for industrial decarbonisation — sensors + software cutting Scope-1 emissions from day one.",
                why=f"{oname} is the anchor community for founders shipping climate infra in Canada.",
            ))
            if status == "approved":
                membership_docs.append({
                    "id": os.urandom(8).hex(),
                    "user_id": founder["id"],
                    "org_slug": slug,
                    "org_name": oname,
                    "status": "approved",
                    "joined_at": (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat(),
                    "application_id": app_docs[-1]["id"],
                })
            days_ago += 4

    if mentor:
        days_ago = 5
        for slug, status in SIMULATED_MENTOR_APPLICATIONS:
            oref = orgs_by_slug.get(slug)
            if not oref:
                continue
            oname = oref["name"]
            app_docs.append(_make_app(
                mentor["id"], slug, oname, status, days_ago,
                pitch="Bringing 10+ years of climate-tech operating experience to mentor founders in your portfolio.",
                why=f"Would love to give back through {oname}'s mentor bench.",
            ))
            if status == "approved":
                membership_docs.append({
                    "id": os.urandom(8).hex(),
                    "user_id": mentor["id"],
                    "org_slug": slug,
                    "org_name": oname,
                    "status": "approved",
                    "joined_at": (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat(),
                    "application_id": app_docs[-1]["id"],
                })
            days_ago += 3

    if app_docs:
        await db.applications.insert_many(app_docs)
    if membership_docs:
        await db.memberships.insert_many(membership_docs)


# ---------- audit log ----------
async def write_audit(actor_id: Optional[str], action: str, target_type: Optional[str] = None, target_id: Optional[str] = None, meta: Optional[Dict[str, Any]] = None, request: Optional[Request] = None) -> None:
    """Append an immutable audit entry for any sensitive write."""
    try:
        ip = client_ip(request) if request is not None else None
        entry = {
            "actor_id": actor_id,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "meta": meta or {},
            "ip": ip,
            "created_at": datetime.now(timezone.utc),
        }
        await db.audit_log.insert_one(entry)
    except Exception as exc:  # noqa
        logger.warning("audit log failed for %s: %s", action, exc)


# ---------- auth cookie helpers ----------
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() == "true"
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "lax").lower()


def _set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie(
        key="access_token", value=access, httponly=True,
        secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE,
        max_age=ACCESS_MIN * 60, path="/",
    )
    response.set_cookie(
        key="refresh_token", value=refresh, httponly=True,
        secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE,
        max_age=REFRESH_DAYS * 86400, path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


# ---------- request models ----------
class UserContactUpdate(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin: Optional[str] = None
    calendly: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    industry: Optional[str] = None
    avatar_url: Optional[str] = None
    venture_tagline: Optional[str] = None
    current_focus: Optional[str] = None
    working_style: Optional[str] = None
    biggest_hurdle: Optional[str] = None
    strengths: Optional[List[str]] = None
    growing_in: Optional[List[str]] = None
    expertise: Optional[List[str]] = None
    support_needs: Optional[List[str]] = None
    open_to: Optional[List[str]] = None
    goals: Optional[List[str]] = None
    achievements: Optional[List[str]] = None
    header_stats: Optional[List[Dict[str, Any]]] = None
    program_goals: Optional[List[Dict[str, Any]]] = None
    program_history: Optional[List[Dict[str, Any]]] = None
    recent_activity: Optional[List[Dict[str, Any]]] = None
    education: Optional[List[Dict[str, Any]]] = None
    venture: Optional[Dict[str, Any]] = None
    want_to_connect: Optional[Dict[str, Any]] = None
    peer_exchange: Optional[Dict[str, Any]] = None
    deeper_look: Optional[Dict[str, Any]] = None
    contact: Optional[UserContactUpdate] = None
    # ---- Unified Pathwai profile (Layer 3): fields the user carries to every community they apply to
    business_industry_focus: Optional[str] = None
    age: Optional[int] = None
    height: Optional[str] = None
    position: Optional[str] = None
    stage: Optional[str] = None
    cohort: Optional[str] = None
    skill_set: Optional[List[str]] = None
    needs_seeking: Optional[List[str]] = None
    traction: Optional[str] = None
    product_description: Optional[str] = None
    vision: Optional[str] = None
    # ---- Multi-hat persona (one account, multiple roles/hats)
    hats: Optional[List[str]] = None
    active_hat: Optional[str] = None
    # ---- Phase A: Universal Innovation Profile (Feb 2026)
    # Extended startup + team + funding + program history + supporting docs so
    # the user carries a full application-ready portfolio across every community.
    startup_name: Optional[str] = None
    startup_one_liner: Optional[str] = None
    startup_stage: Optional[str] = None  # idea | mvp | early_revenue | scaling | growth
    startup_sector: Optional[str] = None
    startup_geography: Optional[str] = None
    incorporation_date: Optional[str] = None  # ISO date string
    business_summary: Optional[str] = None
    founder_bio: Optional[str] = None
    # Repeaters — each is a list of small dicts
    team_members: Optional[List[Dict[str, Any]]] = None  # {name, role, linkedin}
    advisors: Optional[List[Dict[str, Any]]] = None  # {name, expertise, linkedin}
    funding_history: Optional[List[Dict[str, Any]]] = None  # {round, amount, date, investors}
    awards: Optional[List[Dict[str, Any]]] = None  # {name, org, year}
    previous_programs: Optional[List[Dict[str, Any]]] = None  # {program, org, year, outcome}
    milestones: Optional[List[Dict[str, Any]]] = None  # {date, milestone}
    portfolio: Optional[List[Dict[str, Any]]] = None  # {title, link, description}
    traction_metrics: Optional[Dict[str, Any]] = None  # {arr, users, growth_rate, key_metrics}
    # Supporting documents — URLs only (per user constraint)
    pitch_deck_url: Optional[str] = None
    product_demo_url: Optional[str] = None
    supporting_docs: Optional[List[Dict[str, Any]]] = None  # {label, url}
    # ---- Community Value Exchange (spec v2 · Feb 2026)
    # These are the *cross-community* value fields that turn a static member
    # list into a discoverable value-exchange network. Deliberately generic so
    # any community type (startup / sports / social / professional) can use them.
    services_offered: Optional[List[str]] = None  # e.g. "photography", "code review"
    topics_can_advise_on: Optional[List[str]] = None  # e.g. "seed fundraising", "hiring VP eng"
    interests_hobbies: Optional[List[str]] = None  # e.g. "climbing", "vinyl", "chess"
    side_projects: Optional[List[Dict[str, Any]]] = None  # {name, description, link}
    resources_to_share: Optional[List[Dict[str, Any]]] = None  # {label, description, link}
    preferred_contact: Optional[str] = None  # "linkedin dm" | "email" | "in-app messages"
    # Admin-defined custom profile fields — free-form dict, keys must match
    # `community_config.custom_profile_fields[].key`. Values may be str or list[str].
    custom_fields: Optional[Dict[str, Any]] = None


# ---------- root ----------
@api_router.get("/")
async def root():
    return {"app": "Pathwai", "status": "ok"}


# ===========================
# AUTH
# ===========================
class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    name: str = Field(min_length=2, max_length=120)
    tagline: Optional[str] = Field(default="", max_length=280)
    title: Optional[str] = Field(default="", max_length=120)
    join_reason: Optional[str] = Field(default="", max_length=600)


@api_router.post("/auth/signup", status_code=201)
async def auth_signup(body: SignupRequest, request: Request, response: Response):
    """Public self-service signup — anyone with an email can create a
    community profile and sign in immediately. Members show up in the
    directory by default; admin can hide them later via the profile edit.

    Iter 36 · Public signup for real (non-demo) users.
    """
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="An account with that email already exists")

    now_iso = datetime.now(timezone.utc).isoformat()
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "name": body.name.strip(),
        "email": email,
        "password_hash": hash_password(body.password),
        "role": "member",
        "tagline": (body.tagline or "").strip(),
        "bio": "",
        "title": (body.title or "").strip(),
        "company": "",
        "location": "",
        "avatar_url": "",
        "cover_url": "",
        "expertise": [],
        "focus_areas": [],
        "open_to": [],
        "services_offered": [],
        "topics_can_advise_on": [],
        "interests_hobbies": [],
        "needs_seeking": [],
        "custom_fields": {},
        "hidden_from_directory": False,
        "join_reason": (body.join_reason or "").strip(),
        "signup_source": "self",
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    cfg = await db.community_config.find_one({"_key": "singleton"}) or {}
    needs_approval = cfg.get("require_approval", True)
    if needs_approval:
        doc["membership_status"] = "pending"
        doc["hidden_from_directory"] = True
    await db.users.insert_one(doc)
    if needs_approval:
        await write_audit(user_id, "membership.requested", "user", user_id, meta={"email": email}, request=request)
        try:
            from routes.notifications import notify
            async for a in db.users.find({"role": "admin"}):
                await notify(a["id"], "membership_request", "New membership request", f'{doc.get("name")} wants to join the community.', "/admin?tab=members")
        except Exception:
            pass
        return {"ok": True, "pending": True, "message": "Thanks. Your request has been sent to the team. You'll be able to sign in once it's approved."}

    # Auto-join every new signup into the UofT community so /members isn't
    # empty for them out of the box. Same idempotent shape used elsewhere.
    try:
        org = await db.organizations.find_one({"slug": UOFT_ORG_SLUG})
        if org:
            await db.memberships.insert_one({
                "id": os.urandom(8).hex(),
                "user_id": user_id,
                "org_slug": UOFT_ORG_SLUG,
                "org_name": org.get("name"),
                "status": "approved",
                "joined_at": now_iso,
                "application_id": None,
            })
    except Exception as exc:  # noqa: BLE001
        logger.warning("signup auto-membership failed: %s", exc)

    # Sign the user in immediately (same cookie treatment as /auth/login).
    access = create_access_token(user_id, "member")
    refresh = create_refresh_token(user_id)
    _set_auth_cookies(response, access, refresh)

    await write_audit(user_id, "auth.signup", "user", user_id, meta={"email": email}, request=request)
    await write_audit(user_id, "auth.login_success", "user", user_id, request=request)

    safe_user = {k: v for k, v in doc.items() if k not in ("_id", "password_hash")}
    return {"ok": True, "user": safe_user, "access_token": access}


@api_router.post("/auth/login")
async def auth_login(body: LoginRequest, request: Request, response: Response):
    email = body.email.strip().lower()
    ip = client_ip(request)
    identifier = f"{ip}:{email}"

    await check_lockout(db, identifier)

    hub, recs = await records_for(email)
    ok_recs = [(sl, d) for sl, d in recs if verify_password(body.password, d.get("password_hash") or "")]
    hub_ok = bool(hub and verify_password(body.password, hub.get("password_hash") or ""))
    if not hub_ok and not ok_recs:
        await record_failed_login(db, identifier)
        await write_audit(None, "auth.login_failed", "user", email, request=request)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    approved = [(sl, d) for sl, d in ok_recs if (d.get("membership_status") or "approved") == "approved"]
    if not hub_ok and not approved:
        if any(d.get("membership_status") == "pending" for _, d in ok_recs):
            raise HTTPException(status_code=403, detail="Your membership request is still awaiting approval. We'll let you know as soon as it's reviewed.")
        raise HTTPException(status_code=403, detail="Your membership request was not approved. Contact the team if you think this is a mistake.")
    await clear_failed_logins(db, identifier)
    uid = hub["id"] if hub_ok else ok_recs[0][1]["id"]
    from database import current_community
    cur = current_community()
    pick = next(((sl, d) for sl, d in approved if sl == cur), approved[0] if approved else None)
    role = (pick[1].get("role") if pick else None) or "member"
    access = create_access_token(uid, role)
    refresh = create_refresh_token(uid)
    _set_auth_cookies(response, access, refresh)
    if pick:
        set_community_cookie(response, pick[0])
    user = pick[1] if pick else {"id": uid, "name": hub.get("name"), "email": email}
    await write_audit(uid, "auth.login_success", "user", uid, request=request)

    safe_user = {k: v for k, v in user.items() if k not in ("_id", "password_hash")}
    return {"ok": True, "user": safe_user if pick else None, "account": {"id": uid, "name": safe_user.get("name"), "email": email}, "access_token": access}


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=200)


@api_router.post("/auth/forgot-password")
async def auth_forgot_password(body: ForgotPasswordRequest, request: Request):
    """Always returns the same generic message whether or not the email is registered, so this
    endpoint can't be used to check which emails have accounts."""
    email = body.email.strip().lower()
    hub, recs = await records_for(email)
    if hub or recs:
        token = create_reset_token(email)
        base = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")
        link = f"{base}/reset-password?token={token}"
        name = (hub or (recs[0][1] if recs else {})).get("name") or "there"
        text = f"Hi {name},\n\nSomeone requested a password reset for your Pathwai account. This link is valid for {os.environ.get('RESET_TOKEN_MIN', '30')} minutes:\n\n{link}\n\nIf you didn't request this, you can ignore this email."
        try:
            await emailer.send_email(email, "Reset your Pathwai password", text)
        except Exception as exc:  # noqa: BLE001 — never let a mail-provider outage leak whether the account exists
            logger.warning("password reset email failed for %s: %s", email, exc)
        await write_audit(hub["id"] if hub else (recs[0][1]["id"] if recs else None), "auth.password_reset_requested", "user", email, request=request)
    return {"ok": True, "message": "If an account exists for that email, we've sent a reset link."}


@api_router.post("/auth/reset-password")
async def auth_reset_password(body: ResetPasswordRequest, request: Request):
    try:
        email = decode_reset_token(body.token)
    except (pyjwt.PyJWTError, ValueError):
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired. Request a new one.")
    new_hash = hash_password(body.password)
    hub = await hub_db().accounts.find_one({"email": email})
    updated_any = False
    if hub:
        await hub_db().accounts.update_one({"id": hub["id"]}, {"$set": {"password_hash": new_hash}})
        updated_any = True
    updated_id = hub["id"] if hub else None
    for slug in COMMUNITY_SLUGS:
        d = dbfor(slug)
        rec = await d.users.find_one({"email": email})
        if rec:
            await d.users.update_one({"id": rec["id"]}, {"$set": {"password_hash": new_hash}})
            updated_any = True
            updated_id = updated_id or rec["id"]
    if not updated_any:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired. Request a new one.")
    await write_audit(updated_id, "auth.password_reset", "user", email, request=request)
    return {"ok": True}


@api_router.post("/auth/logout")
async def auth_logout(response: Response, request: Request):
    me = await get_current_user_optional(request)
    _clear_auth_cookies(response)
    response.delete_cookie("pw_community", path="/")
    if me:
        await write_audit(me["id"], "auth.logout", "user", me["id"], request=request)
    return {"ok": True}


@api_router.post("/auth/refresh")
async def auth_refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Missing refresh token")
    try:
        payload = decode_token(token)
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    access = create_access_token(user["id"], user.get("role", "member"))
    new_refresh = create_refresh_token(user["id"])
    _set_auth_cookies(response, access, new_refresh)
    return {"ok": True, "user": user}


@api_router.get("/auth/me")
async def auth_me(me: dict = Depends(get_current_user)):
    return me


@api_router.get("/auth/demo-accounts")
async def auth_demo_accounts():
    """Lists the demo personas a tester can quick-login as.

    We surface exactly two: one generic *member* demo (whose label adapts to
    the community's configured `member_label_singular`) and the *admin* who
    can reconfigure the community.
    """
    demo_pw = os.environ.get("DEMO_PASSWORD") or "Demo123!"

    # Pull the current community label so the "member" demo reads as
    # "Athlete demo" / "Founder demo" / etc. based on the admin's config.
    config = await db.community_config.find_one({"_key": "singleton"}) or {}
    member_singular = config.get("member_label_singular") or "Member"

    role_meta = {
        "member": {
            "label": f"{member_singular} demo",
            "description": (
                "Explore the community as a member: browse profiles, "
                "events, the perks and your recommended connections."
            ),
        },
        "admin": {
            "label": "Admin demo",
            "description": (
                "Sign in as the commissioner: edit the site in place, change the "
                "colours and logo, and manage members."
            ),
        },
    }

    accounts = []
    for demo_role, email in DEMO_ROLE_TO_EMAIL.items():
        u = await db.users.find_one(
            {"email": email},
            {"_id": 0, "id": 1, "name": 1, "role": 1, "title": 1, "avatar_url": 1, "email": 1},
        )
        if not u:
            continue
        meta = role_meta.get(demo_role, {"label": demo_role, "description": ""})
        u["demo_role"] = demo_role
        u["label"] = meta["label"]
        u["description"] = meta["description"]
        # Keep the frontend's existing `role` key so old data-testids like
        # `demo-login-member` and `demo-login-admin` continue to work.
        u["role"] = demo_role
        accounts.append(u)

    # Stable ordering: member first, admin second.
    order = {"member": 0, "admin": 1}
    accounts.sort(key=lambda a: order.get(a.get("demo_role"), 99))
    return {"accounts": accounts, "password": demo_pw}


@api_router.post("/seed")
async def reseed(_: dict = Depends(require_role("admin"))):
    """Re-seed by clearing then refilling. Useful for demos. Admin-only."""
    for c in ["users", "events", "resources", "announcements", "slack_signals", "email_updates", "profile_requests", "connect_requests", "organizations", "mentors", "memberships", "applications"]:
        await db[c].delete_many({})
    if use_playr():
        await seed_playr(db, force=True)
        await seed_demo_credentials(db)
        return {"ok": True, "seeded_at": datetime.now(timezone.utc).isoformat()}
    await ensure_seeded()
    await seed_demo_credentials(db)
    await seed_default_memberships(db)
    return {"ok": True, "seeded_at": datetime.now(timezone.utc).isoformat()}


@api_router.post("/seed/public")
async def reseed_public():
    """Public reseed for the demo environment. Disabled when DEMO_PUBLIC_SEED is unset."""
    if os.environ.get("DEMO_PUBLIC_SEED", "true").lower() != "true":
        raise HTTPException(status_code=404, detail="Not found")
    for c in ["users", "events", "resources", "announcements", "slack_signals", "email_updates", "profile_requests", "connect_requests", "organizations", "mentors", "memberships", "applications"]:
        await db[c].delete_many({})
    if use_playr():
        await seed_playr(db, force=True)
        await seed_demo_credentials(db)
        return {"ok": True, "seeded_at": datetime.now(timezone.utc).isoformat()}
    await ensure_seeded()
    await seed_demo_credentials(db)
    await seed_default_memberships(db)
    return {"ok": True, "seeded_at": datetime.now(timezone.utc).isoformat()}


# ===========================
# ORGANIZATIONS — Layer 1: National Innovation Directory (PUBLIC)
# ===========================
@api_router.get("/organizations")
async def list_organizations_route(
    q: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    focus_area: Optional[str] = Query(None),
    verified_only: bool = Query(False),
    limit: int = Query(120, ge=1, le=500),
):
    items = await list_organizations_docs(
        db, q=q, type_=type, region=region, stage=stage,
        focus_area=focus_area, verified_only=verified_only, limit=limit,
    )
    return {"organizations": items, "total": len(items)}


@api_router.get("/organizations/meta/filters")
async def organizations_filters_route():
    filters = await organization_filter_meta(db)
    return {**filters, "all_types": ORG_TYPES, "all_regions": REGIONS, "all_stages": STAGES}


@api_router.get("/organizations/{slug}")
async def get_organization_route(slug: str):
    doc = await get_organization_doc(db, slug)
    if not doc:
        raise HTTPException(status_code=404, detail="Organization not found")
    return doc


@api_router.patch("/organizations/{slug}")
async def update_organization_route(
    slug: str,
    body: OrganizationUpdate,
    request: Request,
    _: dict = Depends(require_role("admin")),
):
    doc = await update_organization_doc(db, slug, body.model_dump(exclude_unset=True))
    if not doc:
        raise HTTPException(status_code=404, detail="Organization not found")
    await write_audit(
        None, "organization.updated", "organization", slug,
        meta={"fields": list(body.model_dump(exclude_unset=True).keys())}, request=request,
    )
    return doc


# ===========================
# MEMBERSHIPS + APPLICATIONS — Layer 3 unified profile access flows
# ===========================
@api_router.get("/organizations/{slug}/members")
async def list_org_members_route(slug: str, request: Request):
    """Public: everyone sees a basic member list. Approved members also receive `members_full`."""
    org = await get_organization_doc(db, slug)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    viewer = await get_current_user_optional(request)
    viewer_id = viewer["id"] if viewer else None
    return await list_org_members(db, org_slug=slug, viewer_user_id=viewer_id, org_name=org.get("name"))


@api_router.get("/organizations/{slug}/membership")
async def my_membership_for_org(slug: str, me: dict = Depends(get_current_user)):
    org = await get_organization_doc(db, slug)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    membership = await get_membership_doc(db, me["id"], slug)
    latest_app = await db.applications.find_one(
        {"user_id": me["id"], "org_slug": slug}, sort=[("created_at", -1)]
    )
    if latest_app:
        latest_app.pop("_id", None)
    return {
        "org_slug": slug,
        "is_member": bool(membership and membership.get("status") == "approved"),
        "membership": membership,
        "application": latest_app,
    }


@api_router.post("/organizations/{slug}/apply")
async def apply_to_org_route(
    slug: str,
    body: ApplicationCreate,
    request: Request,
    me: dict = Depends(get_current_user),
):
    """Auto-approve join flow (per user constraint: 'auto-approve for now, gate later')."""
    org = await get_organization_doc(db, slug)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    result = await apply_to_org(
        db,
        user=me,
        org_slug=slug,
        org_name=org.get("name"),
        pitch=body.pitch,
        why=body.why,
        auto_approve=True,
    )
    await write_audit(
        me["id"], "membership.applied", "organization", slug,
        meta={"already": result.get("already"), "auto_approved": True}, request=request,
    )
    return result


@api_router.get("/organizations/{slug}/programs/{program_id}")
async def get_program_route(slug: str, program_id: str):
    """Fetch one program + its extras — used by the Universal Application page."""
    org = await get_organization_doc(db, slug)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    program = find_org_program(org, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    # Ensure the returned program always carries the canonical id (older seed
    # data may not have it stored).
    program = {**program, "id": program_id_for(program)}
    return {
        "org": {
            "slug": org["slug"],
            "name": org.get("name"),
            "type": org.get("type"),
            "tagline": org.get("tagline"),
            "logo_url": org.get("logo_url"),
            "cover_url": org.get("cover_url"),
            "accent_color": org.get("accent_color"),
            "region": org.get("region"),
            "verified": org.get("verified"),
            "focus_areas": org.get("focus_areas") or [],
        },
        "program": program,
    }


@api_router.post("/organizations/{slug}/programs/{program_id}/apply")
async def apply_to_program_route(
    slug: str,
    program_id: str,
    body: ProgramApplicationCreate,
    request: Request,
    me: dict = Depends(get_current_user),
):
    """Phase B — Universal Application System.

    Auto-fills the Universal Innovation Profile onto the application row,
    stores the org-specific extra_answers, and (per current beta constraint)
    auto-approves the applicant into the community.
    """
    org = await get_organization_doc(db, slug)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    program = find_org_program(org, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    canonical_pid = program_id_for(program)

    # Validate required extras — fail fast so the UI can flag the field.
    missing = []
    for q in program.get("extra_questions") or []:
        if q.get("required") and not (body.extra_answers or {}).get(q["key"]):
            missing.append(q["key"])
    if missing:
        raise HTTPException(
            status_code=400,
            detail={"error": "missing_required", "missing": missing},
        )

    result = await apply_to_org(
        db,
        user=me,
        org_slug=slug,
        org_name=org.get("name"),
        pitch=body.pitch,
        why=body.why,
        auto_approve=True,
        program_id=canonical_pid,
        program_name=program.get("name"),
        program_stage=program.get("stage"),
        extra_answers=body.extra_answers or {},
        include_profile_snapshot=True,
    )
    await write_audit(
        me["id"], "program.applied", "program", f"{slug}::{canonical_pid}",
        meta={"already": result.get("already"), "auto_approved": True}, request=request,
    )
    return result


@api_router.get("/organizations/{slug}/applications")
async def list_org_applications_route(
    slug: str,
    status: Optional[str] = Query("all"),
    _: dict = Depends(require_role("admin")),
):
    org = await get_organization_doc(db, slug)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    items = await list_org_applications(db, org_slug=slug, status=status)
    return {"org_slug": slug, "applications": items, "total": len(items)}


@api_router.post("/organizations/{slug}/applications/{app_id}/decision")
async def decide_org_application_route(
    slug: str,
    app_id: str,
    body: ApplicationDecision,
    request: Request,
    _: dict = Depends(require_role("admin")),
):
    try:
        doc = await decide_application(
            db, app_id=app_id, decision=body.decision, reviewer_note=body.reviewer_note
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await write_audit(
        None, f"membership.{body.decision}", "application", app_id,
        meta={"org_slug": slug}, request=request,
    )
    return {"ok": True, "application": doc}


@api_router.get("/me/applications")
async def my_applications_route(me: dict = Depends(get_current_user)):
    items = await list_my_applications(db, me["id"])
    return {"applications": items, "total": len(items)}


@api_router.get("/me/memberships")
async def my_memberships_route(me: dict = Depends(get_current_user)):
    memberships = await list_my_memberships(db, me["id"])
    # hydrate with org name + accent color for the frontend rail
    slugs = [m["org_slug"] for m in memberships if m.get("org_slug")]
    orgs_by_slug: Dict[str, Dict[str, Any]] = {}
    if slugs:
        async for o in db.organizations.find(
            {"slug": {"$in": slugs}},
            {"_id": 0, "slug": 1, "name": 1, "logo_url": 1, "accent_color": 1, "type": 1, "region": 1, "headquarters": 1},
        ):
            orgs_by_slug[o["slug"]] = o
    for m in memberships:
        m["org"] = orgs_by_slug.get(m["org_slug"])
    return {"memberships": memberships, "total": len(memberships)}


# ===========================
# MULTI-HAT PERSONA — one account, several roles/hats (founder, business_owner, mentor, ...)
# ===========================
AVAILABLE_HATS = [
    {"key": "founder", "label": "Founder", "description": "Building a venture — apply to programs, find mentors, raise capital."},
    {"key": "business_owner", "label": "Business owner", "description": "Established business owner contextualising Canada's innovation economy."},
    {"key": "mentor", "label": "Mentor / Advisor", "description": "Sharing expertise with founders across communities."},
    {"key": "investor", "label": "Investor", "description": "Sourcing deal-flow across the ecosystem."},
    {"key": "ecosystem_partner", "label": "Ecosystem partner", "description": "Program leader or gov / academic partner."},
]


class HatsUpdate(BaseModel):
    hats: Optional[List[str]] = None
    active_hat: Optional[str] = None


@api_router.get("/hats/available")
async def list_available_hats():
    return {"hats": AVAILABLE_HATS}


@api_router.get("/me/hats")
async def get_my_hats(me: dict = Depends(get_current_user)):
    hats = me.get("hats")
    if not hats:
        # legacy accounts default to their base role as their only hat.
        hats = [me.get("role") or "founder"]
    active = me.get("active_hat") or (hats[0] if hats else "founder")
    return {"hats": hats, "active_hat": active, "available": AVAILABLE_HATS}


@api_router.patch("/me/hats")
async def update_my_hats(
    body: HatsUpdate,
    request: Request,
    me: dict = Depends(get_current_user),
):
    patch: Dict[str, Any] = {}
    valid_keys = {h["key"] for h in AVAILABLE_HATS}
    if body.hats is not None:
        cleaned = [h for h in body.hats if h in valid_keys]
        if not cleaned:
            raise HTTPException(status_code=400, detail="At least one valid hat is required.")
        patch["hats"] = cleaned
    if body.active_hat is not None:
        if body.active_hat not in valid_keys:
            raise HTTPException(status_code=400, detail=f"Unknown hat: {body.active_hat}")
        patch["active_hat"] = body.active_hat
    if patch:
        patch["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.users.update_one({"id": me["id"]}, {"$set": patch})
        await write_audit(
            me["id"], "hats.updated", "user", me["id"], meta=patch, request=request,
        )
    updated = await db.users.find_one({"id": me["id"]})
    if updated:
        updated.pop("_id", None)
        updated.pop("password_hash", None)
    return {
        "hats": updated.get("hats", [me.get("role") or "founder"]),
        "active_hat": updated.get("active_hat") or (updated.get("hats") or [me.get("role")])[0],
    }


# ===========================
# DISCOVER — Layer 2: Innovation Discovery (PUBLIC)
# ===========================
@api_router.get("/discover")
async def discover_route(
    q: Optional[str] = Query(None),
    kind: str = Query("all", pattern="^(all|program|grant|mentor)$"),
    region: Optional[str] = Query(None),
    focus_area: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    limit: int = Query(60, ge=1, le=200),
):
    return await unified_discover(
        db, q=q, kind=kind, region=region, focus_area=focus_area, stage=stage, limit=limit
    )


@api_router.get("/mentors")
async def list_mentors_route(
    q: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    focus_area: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=200),
):
    items = await list_mentors_docs(db, q=q, region=region, focus_area=focus_area, stage=stage, limit=limit)
    return {"mentors": items, "total": len(items)}


# ---------- users / me ----------
@api_router.get("/me")
async def get_me(role: str = Query("founder")):
    """Return the demo 'me' user for a given role."""
    user = await db.users.find_one({"is_demo_me_for_role": role})
    if not user:
        # fallback to first user with the requested role
        user = await db.users.find_one({"role": role})
    if not user:
        raise HTTPException(status_code=404, detail=f"No demo user for role '{role}'")
    return strip_id(user)


@api_router.get("/users")
async def list_users(
    role: Optional[str] = None,
    cohort: Optional[str] = None,
    expertise: Optional[str] = None,
    industry: Optional[str] = None,
    space: Optional[str] = None,
    offer: Optional[str] = None,          # value-exchange: services / topics they can help with
    looking_for: Optional[str] = None,    # value-exchange: what they're seeking
    interest: Optional[str] = None,       # value-exchange: hobbies / interests
    q: Optional[str] = None,
    stage: Optional[str] = None,
    location: Optional[str] = None,
    member_kind: Optional[str] = None,    # founder | mentor | alumni | partner | guest
    request: Request = None,
):
    """Community directory search.

    In addition to the classic filters, this now supports the Community Value
    Exchange axes: `offer` (things a member can help with), `looking_for`
    (what they're seeking), and `interest` (hobbies). Free-text `q` also
    searches across those value-exchange fields so a query like `photographer`
    surfaces anyone whose services / expertise include it.
    """
    query: Dict[str, Any] = {}
    # Respect the admin toggle to keep an account out of the members directory.
    # (Iter 34 — admins can create linked users and choose to hide themselves.)
    query["hidden_from_directory"] = {"$ne": True}
    if role and role != "all":
        query["role"] = role
    if cohort and cohort != "all":
        query["cohort"] = cohort
    if expertise and expertise != "all":
        query["expertise"] = {"$in": [expertise]}
    if industry and industry != "all":
        query["industry"] = industry
    if space and space != "all":
        # Members who list this space as their active workspace OR carry it in
        # `memberships_space_slugs` if that array field exists.
        query["$or"] = [
            {"active_space_slug": space},
            {"memberships_space_slugs": space},
        ]
    if offer and offer != "all":
        rx = {"$regex": offer, "$options": "i"}
        query.setdefault("$and", []).append({
            "$or": [
                {"services_offered": rx},
                {"topics_can_advise_on": rx},
                {"open_to": rx},
                {"expertise": rx},
            ]
        })
    if looking_for and looking_for != "all":
        rx = {"$regex": looking_for, "$options": "i"}
        query.setdefault("$and", []).append({
            "$or": [
                {"needs_seeking": rx},
                {"growing_in": rx},
                {"goals": rx},
            ]
        })
    if interest and interest != "all":
        rx = {"$regex": interest, "$options": "i"}
        query.setdefault("$and", []).append({
            "$or": [
                {"interests_hobbies": rx},
                {"interests": rx},
            ]
        })
    if q:
        rx = {"$regex": q, "$options": "i"}
        query.setdefault("$and", []).append({
            "$or": [
                {"name": rx},
                {"company": rx},
                {"bio": rx},
                {"expertise": rx},
                # Value-exchange free-text
                {"services_offered": rx},
                {"topics_can_advise_on": rx},
                {"interests_hobbies": rx},
                {"needs_seeking": rx},
                {"open_to": rx},
                {"startup_name": rx},
                {"startup_one_liner": rx},
            ]
        })
    if stage and stage != "all":
        query["stage"] = {"$regex": f"^{stage}$", "$options": "i"}
    if location and location != "all":
        query.setdefault("$and", []).append({"location": {"$regex": location, "$options": "i"}})
    me_v = await get_current_user_optional(request) if request else None
    users = [public_view(strip_id(u), me_v) async for u in db.users.find(query)]
    if member_kind and member_kind != "all":
        users = [u for u in users if _member_type(u) == member_kind]
    for u in users:
        u["member_type"] = _member_type(u)
    return users


@api_router.get("/users/filters")
async def get_user_filters():
    """Return distinct values for the directory filter dropdowns."""
    roles = await db.users.distinct("role")
    cohorts = await db.users.distinct("cohort")
    industries = await db.users.distinct("industry")

    async def unwind_distinct(field: str) -> List[str]:
        pipeline = [{"$unwind": f"${field}"}, {"$group": {"_id": f"${field}"}}]
        return [doc["_id"] async for doc in db.users.aggregate(pipeline) if doc["_id"]]

    expertise = await unwind_distinct("expertise")
    # Value Exchange facets (spec v2)
    services_offered = await unwind_distinct("services_offered")
    topics_can_advise_on = await unwind_distinct("topics_can_advise_on")
    open_to = await unwind_distinct("open_to")
    needs_seeking = await unwind_distinct("needs_seeking")
    interests_hobbies = await unwind_distinct("interests_hobbies")

    # `offers_pool` = things a member could plausibly help with — the union of
    # services they offer, topics they advise on, ways they're open to help,
    # and their expertise tags. Deduped + sorted for the filter dropdown.
    offers_pool = sorted(
        {v for v in (*services_offered, *topics_can_advise_on, *open_to, *expertise) if v}
    )
    looking_for_pool = sorted({v for v in needs_seeking if v})
    interests_pool = sorted({v for v in interests_hobbies if v})

    return {
        "roles": sorted([r for r in roles if r]),
        "cohorts": sorted([c for c in cohorts if c]),
        "industries": sorted([i for i in industries if i]),
        "expertise": sorted([e for e in expertise if e]),
        "offers": offers_pool,
        "looking_for": looking_for_pool,
        "interests": interests_pool,
    }


@api_router.get("/users/{user_id}")
async def get_user(user_id: str, request: Request):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    out = public_view(strip_id(user), await get_current_user_optional(request))
    out["member_type"] = _member_type(user)
    return out


@api_router.patch("/users/{user_id}")
async def update_user(user_id: str, body: UserUpdate, request: Request, me: dict = Depends(get_current_user)):
    """Update a user's editable profile fields. Owner or admin only."""
    if me["id"] != user_id and me.get("role") != "admin":
        raise HTTPException(status_code=403, detail="You can only edit your own profile")
    existing = await db.users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    patch = body.model_dump(exclude_unset=True, exclude_none=False)
    update_set = {}
    # Merge nested contact dict so partial updates don't wipe other fields
    if "contact" in patch and patch["contact"] is not None:
        merged_contact = dict(existing.get("contact") or {})
        for k, v in patch["contact"].items():
            if v is None:
                continue
            merged_contact[k] = v
        update_set["contact"] = merged_contact
        patch.pop("contact")
    # Same treatment for the admin-defined custom_fields bag.
    if "custom_fields" in patch and patch["custom_fields"] is not None:
        merged_custom = dict(existing.get("custom_fields") or {})
        for k, v in patch["custom_fields"].items():
            if isinstance(v, str):
                merged_custom[k] = v.strip()
            else:
                merged_custom[k] = v
        update_set["custom_fields"] = merged_custom
        patch.pop("custom_fields")
    for k, v in patch.items():
        if v is None:
            continue
        # For list fields, normalise: strip empties + dedupe (preserve order)
        if isinstance(v, list):
            if v and isinstance(v[0], dict):
                # List of objects (e.g. education, program_goals) — drop empty dicts only
                cleaned = [item for item in v if isinstance(item, dict) and any(
                    (str(val).strip() if val is not None else "") for val in item.values()
                )]
                update_set[k] = cleaned
            else:
                seen = set()
                cleaned = []
                for item in v:
                    s = (item or "").strip() if isinstance(item, str) else item
                    if not s:
                        continue
                    if isinstance(s, str):
                        if s.lower() in seen:
                            continue
                        seen.add(s.lower())
                    cleaned.append(s)
                update_set[k] = cleaned
        elif isinstance(v, str):
            update_set[k] = v.strip()
        else:
            update_set[k] = v
    if update_set:
        update_set["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.users.update_one({"id": user_id}, {"$set": update_set})
        await write_audit(
            me["id"], "user.profile_updated", "user", user_id,
            meta={"fields": list(update_set.keys())}, request=request,
        )
    user = await db.users.find_one({"id": user_id})
    return strip_id(user)



# Mount all per-domain routers under /api
api_router.include_router(events_router)
api_router.include_router(resources_router)
api_router.include_router(announcements_router)
api_router.include_router(matches_router)
api_router.include_router(feeds_router)
api_router.include_router(dashboard_router)
if os.environ.get("ENABLE_AI_CHAT", "false").lower() == "true":
    api_router.include_router(chat_router)
api_router.include_router(admin_router)
api_router.include_router(profile_requests_router)
api_router.include_router(connect_requests_router)
api_router.include_router(workspace_router)
api_router.include_router(support_requests_router)
api_router.include_router(community_config_router)
api_router.include_router(notifications_router)
api_router.include_router(uploads_router)
api_router.include_router(invites_router)
api_router.include_router(portal_router)
api_router.include_router(admin_edit_router)
api_router.include_router(integrations_router)
api_router.include_router(blasts_router)
api_router.include_router(oauth_router)
api_router.include_router(hub_router)

# Register router
app.include_router(api_router)

class CommunityMiddleware:
    """Pins each request to one community's database (cookie `pw_community` or header `X-Community`)."""

    def __init__(self, app):
        self.inner = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            hdrs = {k.decode().lower(): v.decode() for k, v in scope["headers"]}
            slug = hdrs.get("x-community")
            if not slug:
                for part in (hdrs.get("cookie") or "").split(";"):
                    k, _, v = part.strip().partition("=")
                    if k == "pw_community":
                        slug = v
            if not slug:  # webhooks (Stripe, Twilio) can't send headers or cookies: /api/webhooks/x?community=<slug>
                for part in (scope.get("query_string") or b"").decode().split("&"):
                    k, _, v = part.partition("=")
                    if k == "community":
                        slug = v
            set_community(slug or "")
        await self.inner(scope, receive, send)


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(CommunityMiddleware)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
