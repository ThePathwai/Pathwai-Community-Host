"""Community portal workflows: admin->member requests/forms, moderation, profile sections,
settings, team support, match actions, engagement history, reminders and the admin Action Center."""
from __future__ import annotations

import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from birthday import BirthdayError, age_from, clean_birthday
from auth import check_password_strength, client_ip, create_access_token, create_refresh_token, get_current_user, hash_password, require_role, set_auth_cookies, verify_password
from directory import revoke_sessions_for_email
from database import db
from ._common import HIDDEN_STATUSES, MEMBER_TYPES, audit, audit_platform, clean, member_type, now_iso
from .notifications import notify
from .integrations import push_member

router = APIRouter(tags=["portal"])


# --------------------------------------------------------------------------- profile sections
PROFILE_SECTIONS: Dict[str, List[str]] = {
    "About you": ["name", "avatar_url", "birthday", "title", "location", "bio"],
    "Skills & interests": ["skill_set", "interests_hobbies"],
    "Goals & support": ["goals", "support_needs"],
}
FIELD_LABELS = {
    "name": "Name", "avatar_url": "Photo", "age": "Age", "birthday": "Birthday", "height": "Height", "title": "Profession", "location": "Neighbourhood / city",
    "bio": "Bio", "industry": "Main sport", "stage": "Level", "position": "Position / role", "cohort": "Division / team",
    "skill_set": "Skills", "interests_hobbies": "Interests", "goals": "Goals", "support_needs": "Support needed",
    "phone": "Phone number", "booking_link": "Booking link", "company": "Employer", "expertise": "Strengths",
    "mentor_needs": "Coaching needs", "resource_needs": "Resource needs", "social_links": "Social links", "documents": "Documents",
}
LIST_FIELDS = {"support_needs", "mentor_needs", "resource_needs", "expertise", "skill_set", "goals", "interests_hobbies"}
EDITABLE = set(FIELD_LABELS) | {"venture_tagline", "current_focus", "services_offered", "topics_can_advise_on", "needs_seeking", "startup_name", "startup_one_liner", "open_to"}


def _filled(v: Any) -> bool:
    if v is None:
        return False
    if isinstance(v, (list, dict, str)):
        return bool(v if not isinstance(v, str) else v.strip())
    return True


def completion(u: Dict[str, Any]) -> Dict[str, Any]:
    keys = [k for ks in PROFILE_SECTIONS.values() for k in ks]
    missing = [k for k in keys if not _filled(u.get(k))]
    pct = round(100 * (len(keys) - len(missing)) / len(keys))
    return {"percent": pct, "missing": [FIELD_LABELS.get(k, k) for k in missing], "missing_keys": missing,
            "sections": {name: {"done": sum(_filled(u.get(k)) for k in ks), "total": len(ks)} for name, ks in PROFILE_SECTIONS.items()}}


def mirror_fields(patch: Dict[str, Any]) -> None:
    """Keep the matching/filter fields in step with the player-facing ones."""
    for src, dst in (("support_needs", "needs_seeking"), ("skill_set", "expertise"), ("interests_hobbies", "interests")):
        if src in patch:
            patch[dst] = patch[src]


def _apply_profile_fields(values: Dict[str, Any]) -> Dict[str, Any]:
    out = {}
    for k, v in values.items():
        if k not in EDITABLE:
            continue
        if k in LIST_FIELDS or k in {"interests_hobbies", "services_offered", "topics_can_advise_on", "needs_seeking"}:
            if isinstance(v, str):
                v = [x.strip() for x in v.replace("\n", ",").split(",") if x.strip()]
            v = list(dict.fromkeys([x for x in (v or []) if isinstance(x, str) and x.strip()]))
        elif k == "avatar_url":
            v = (v or "").strip()
            if v and not (v.startswith("https://") or v.startswith("data:image/")):
                continue
            if len(v) > 400_000:
                raise HTTPException(status_code=400, detail="That photo is too large")
        elif k == "birthday":
            try:
                v = clean_birthday(v)
            except BirthdayError as e:
                raise HTTPException(status_code=400, detail=str(e))
            out["age"] = age_from(v)  # age always follows the birthday (a cleared birthday clears it)
        elif k == "age":
            try:
                v = int(v) if str(v).strip() else None
            except (TypeError, ValueError):
                continue
            if v is not None and not 5 <= v <= 110:
                continue
            if "birthday" in values:  # the birthday decides the age
                continue
        elif isinstance(v, str):
            v = v.strip()
        out[k] = v
    return out


class ProfilePatch(BaseModel):
    values: Dict[str, Any]


@router.get("/me/profile-completion")
async def my_completion(me: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": me["id"]}) or {}
    return completion(u)


@router.patch("/me/profile")
async def patch_profile(body: ProfilePatch, me: dict = Depends(get_current_user)):
    """Section-level profile edit (the full member-owned field set incl. traction, stage, documents)."""
    patch = _apply_profile_fields(body.values)
    if "documents" in body.values and isinstance(body.values["documents"], list):
        patch["documents"] = [d for d in body.values["documents"] if isinstance(d, dict) and (d.get("url") or d.get("title"))]
    if "social_links" in body.values and isinstance(body.values["social_links"], dict):
        patch["social_links"] = {k: v for k, v in body.values["social_links"].items() if isinstance(v, str) and v.strip()}
    if "contact" in body.values and isinstance(body.values["contact"], dict):
        old = (await db.users.find_one({"id": me["id"]}) or {}).get("contact") or {}
        keep = ("email", "phone", "linkedin", "instagram", "website")
        patch["contact"] = {**old, **{k: str(v).strip()[:200] for k, v in body.values["contact"].items() if k in keep and isinstance(v, str)}}
    if body.values.get("contact_visibility") in ("members", "hidden"):
        patch["contact_visibility"] = body.values["contact_visibility"]
    if not patch:
        raise HTTPException(status_code=400, detail="Nothing to update")
    mirror_fields(patch)
    patch["updated_at"] = now_iso()
    await db.users.update_one({"id": me["id"]}, {"$set": patch})
    await audit(me["id"], "profile.updated", "user", me["id"], {"fields": [k for k in patch if k != "updated_at"]})
    await push_member(me["id"])
    u = clean(await db.users.find_one({"id": me["id"]}))
    return {"user": u, "completion": completion(u)}


@router.get("/me/engagement")
async def engagement(me: dict = Depends(get_current_user)):
    """Events & engagement / resources received / support history / activity for the profile page."""
    now = now_iso()
    events = []
    async for e in db.events.find({f"rsvps.{me['id']}": {"$exists": True}}).sort("starts_at", -1).limit(30):
        events.append({"id": e["id"], "title": e.get("title"), "starts_at": e.get("starts_at"), "rsvp": (e.get("rsvps") or {}).get(me["id"]),
                       "attended": me["id"] in (e.get("attended_ids") or []), "is_past": (e.get("starts_at") or "") < now})
    saved = [{"id": r["id"], "title": r.get("title"), "category": r.get("category")}
             async for r in db.resources.find({"saved_by": me["id"]}).limit(30)]
    opened_ids = [x["resource_id"] async for x in db.resource_engagement.find({"user_id": me["id"]}).sort("at", -1).limit(30)]
    opened = []
    for rid in dict.fromkeys(opened_ids):
        r = await db.resources.find_one({"id": rid})
        if r:
            opened.append({"id": rid, "title": r.get("title"), "category": r.get("category")})
    support = [{"id": s["id"], "title": s.get("title"), "status": s.get("status"), "category": s.get("category"),
                "to_team": bool(s.get("to_team")), "created_at": s.get("created_at")}
               async for s in db.support_requests.find({"user_id": me["id"]}).sort("created_at", -1).limit(20)]
    reqs = [{"id": r["id"], "title": r.get("title"), "status": _effective(r), "submitted_at": r.get("submitted_at")}
            async for r in db.member_requests.find({"user_id": me["id"]}).sort("created_at", -1).limit(20)]
    mentors = []
    async for u in db.users.find({"id": {"$in": (await db.users.find_one({"id": me["id"]}) or {}).get("mentor_ids", [])}}):
        mentors.append({"id": u["id"], "name": u.get("name"), "title": u.get("title")})
    activity = [{"action": a["action"], "at": a["created_at"].isoformat() if hasattr(a["created_at"], "isoformat") else a["created_at"]}
                async for a in db.audit_log.find({"actor_id": me["id"]}).sort("created_at", -1).limit(12)]
    return {"events": events, "resources_saved": saved, "resources_opened": opened, "support_history": support,
            "request_history": reqs, "mentors": mentors, "activity": activity}


# --------------------------------------------------------------------------- settings
DEFAULT_SETTINGS = {
    "notifications": {"in_app": True, "email": True, "slack": False, "whatsapp": False, "sms": False,
                      "kinds": {"requests": True, "events": True, "matches": True, "announcements": True, "support": True, "members": True}},
    "privacy": {"visible_in_directory": True, "show_email": False, "show_phone": False},
    "calendar_link": None,
}


def _merge(base: dict, patch: dict) -> dict:
    out = dict(base)
    for k, v in (patch or {}).items():
        out[k] = _merge(base.get(k, {}), v) if isinstance(v, dict) and isinstance(base.get(k), dict) else v
    return out


class SettingsPatch(BaseModel):
    notifications: Optional[Dict[str, Any]] = None
    privacy: Optional[Dict[str, Any]] = None
    calendar_link: Optional[str] = None


class PasswordIn(BaseModel):
    current_password: str
    new_password: str


@router.get("/me/settings")
async def get_settings(me: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": me["id"]}) or {}
    s = _merge(DEFAULT_SETTINGS, u.get("settings") or {})
    s["privacy"]["visible_in_directory"] = not u.get("hidden_from_directory", False)
    integrations = [{"provider": i["provider"], "label": i.get("label") or i["provider"], "enabled": True}
                    async for i in db.integrations.find({"enabled": True})]
    return {"settings": s, "account": {"name": u.get("name"), "email": u.get("email"), "member_type": member_type(u)},
            "connected_accounts": integrations}


@router.patch("/me/settings")
async def patch_settings(body: SettingsPatch, me: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": me["id"]}) or {}
    cur = _merge(DEFAULT_SETTINGS, u.get("settings") or {})
    new = _merge(cur, body.model_dump(exclude_unset=True, exclude_none=True))
    upd = {"settings": new, "updated_at": now_iso()}
    upd["hidden_from_directory"] = not new["privacy"].get("visible_in_directory", True)
    await db.users.update_one({"id": me["id"]}, {"$set": upd})
    await audit(me["id"], "settings.updated", "user", me["id"])
    return {"settings": new}


@router.post("/me/change-password")
async def change_password(body: PasswordIn, request: Request, response: Response, me: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": me["id"]}) or {}
    if not verify_password(body.current_password, u.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Your current password is not correct.")
    try:
        check_password_strength(body.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    # One password for the person everywhere (platform account + every community profile), and every
    # session issued before now -- including a thief's -- stops working; this device is re-issued below.
    await revoke_sessions_for_email(u.get("email") or me["email"], hash_password(body.new_password))
    set_auth_cookies(response, create_access_token(me["id"], me.get("role") or "member"), create_refresh_token(me["id"]))
    await audit(me["id"], "auth.password_changed", "user", me["id"], {"sessions_revoked": True})
    await audit_platform(me["id"], "auth.password_changed", "user", me["id"], request=request)
    return {"ok": True}


# --------------------------------------------------------------------------- requests & forms
def _f(key, label, type="text", **kw):
    return {"key": key, "label": label, "type": type, **kw}


LEVELS = ["Beginner", "Intermediate", "Advanced", "Competitive"]
REQUEST_KINDS: Dict[str, Dict[str, Any]] = {
    "profile_update": {"label": "Profile refresh", "fields": [_f("bio", "Bio", "longtext"), _f("height", "Height", "text", placeholder="5'10\" / 178 cm"), _f("title", "Profession", "text")]},
    "availability": {"label": "Event availability", "fields": [_f("nights", "Which evenings can you attend events?", "tags"), _f("notes", "Anything we should know?", "longtext")]},
    "goals_update": {"label": "Goals check-in", "fields": [_f("goals", "What are you working toward in your work and career?", "tags")]},
    "support_need_update": {"label": "Support needed update", "fields": [_f("support_needs", "What support would help most?", "tags")]},
    "coach_need_update": {"label": "Mentorship needs", "fields": [_f("mentor_needs", "What kind of mentor would help?", "tags")]},
    "injury_status": {"label": "Wellness check-in", "fields": [_f("status", "How are you doing?", "select", options=["Doing well", "Busy but managing", "Need a break", "Could use support"]), _f("notes", "Notes for the team", "longtext")]},
    "event_followup": {"label": "Event follow-up", "fields": [_f("takeaway", "Highlight of the event", "longtext"), _f("next_step", "What are you working on next?", "text")]},
    "resource_feedback": {"label": "Perk feedback", "fields": [_f("useful", "Was it useful?", "select", options=["Very", "Somewhat", "Not really"]), _f("comments", "Comments", "longtext")]},
    "waiver": {"label": "Consent form / document upload", "fields": [_f("doc_title", "Document title", "text"), _f("doc_url", "Link to document", "url")]},
    "questionnaire": {"label": "Quarterly check-in", "fields": [_f("wins", "Wins this quarter", "longtext"), _f("blockers", "What's holding you back?", "longtext")]},
    "custom": {"label": "Custom request from the team", "fields": [_f("response", "Your response", "longtext")]},
}
STATUSES = ["not_started", "in_progress", "submitted", "overdue", "reviewed", "resolved"]


def _effective(r: Dict[str, Any]) -> str:
    st = r.get("status", "not_started")
    if st in ("not_started", "in_progress") and r.get("due_date") and r["due_date"] < now_iso()[:10]:
        return "overdue"
    return st


def normalize_link(u: Optional[str]) -> Optional[str]:
    """Trim a pasted link and add https:// when it was pasted without one (docs.google.com/forms/...).
    Anything that is not a web link (javascript:, mailto:, ...) comes back unchanged so callers can reject it."""
    u = (u or "").strip()
    if not u:
        return None
    if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", u) and not re.match(r"^[^/\s]+\.[^/\s]+:\d+", u):
        return u
    return "https://" + u.lstrip("/")


def _view(r: Dict[str, Any], admin: bool = False) -> Dict[str, Any]:
    r = clean(dict(r))
    if r.get("external_url"):
        r["external_url"] = normalize_link(r["external_url"])
    r["effective_status"] = _effective(r)
    r["kind_label"] = REQUEST_KINDS.get(r.get("kind"), {}).get("label", r.get("kind"))
    if not admin:
        r.pop("webhook_token", None)
    return r


class RequestCreate(BaseModel):
    user_ids: List[str] = []
    all_members: bool = False
    member_type: Optional[str] = None
    kind: str
    title: Optional[str] = None
    reason: Optional[str] = None
    due_date: Optional[str] = None  # YYYY-MM-DD
    fields: Optional[List[Dict[str, Any]]] = None
    external_url: Optional[str] = None
    external_provider: Optional[str] = None


class RespondIn(BaseModel):
    response: Dict[str, Any] = {}
    draft: bool = False


class ReviewIn(BaseModel):
    status: str
    note: Optional[str] = None


@router.get("/member-requests/kinds")
async def request_kinds():
    return {"kinds": [{"kind": k, "label": v["label"], "fields": v["fields"]} for k, v in REQUEST_KINDS.items()],
            "providers": ["Airtable", "Google Form", "Jotform", "Typeform", "Custom link"]}


@router.get("/me/requests")
async def my_requests(status: Optional[str] = None, me: dict = Depends(get_current_user)):
    items = [_view(r) async for r in db.member_requests.find({"user_id": me["id"]}).sort("created_at", -1)]
    if status and status != "all":
        items = [i for i in items if (i["effective_status"] in ("not_started", "in_progress", "overdue") if status == "open" else i["effective_status"] == status)]
    order = {"overdue": 0, "in_progress": 1, "not_started": 2, "submitted": 3, "reviewed": 4, "resolved": 5}
    items.sort(key=lambda r: (order.get(r["effective_status"], 9), r.get("due_date") or "9999"))
    return {"requests": items, "open": sum(1 for i in items if i["effective_status"] in ("not_started", "in_progress", "overdue"))}


async def _own_request(rid: str, me: dict):
    r = await db.member_requests.find_one({"id": rid})
    if not r:
        raise HTTPException(status_code=404, detail="This request is not available.")
    if r["user_id"] != me["id"] and me.get("role") != "admin":
        raise HTTPException(status_code=403, detail="This request is not available.")
    return r


@router.get("/member-requests/{rid}")
async def get_member_request(rid: str, me: dict = Depends(get_current_user)):
    r = await _own_request(rid, me)
    if r["status"] == "not_started" and r["user_id"] == me["id"]:
        await db.member_requests.update_one({"id": rid}, {"$set": {"status": "in_progress", "opened_at": now_iso(), "updated_at": now_iso()}})
        r = await db.member_requests.find_one({"id": rid})
    return _view(r, admin=me.get("role") == "admin")


async def _complete_notifications(rid: str, user_id: str):
    await db.notifications.update_many({"user_id": user_id, "meta.request_id": rid}, {"$set": {"read": True}})


async def _mark_submitted(r: Dict[str, Any], response: Dict[str, Any], actor: dict, via: str):
    applied: Dict[str, Any] = {}
    if r["kind"] != "document_upload":
        applied = _apply_profile_fields(response)
    elif response.get("doc_url") or response.get("doc_title"):
        u = await db.users.find_one({"id": r["user_id"]}) or {}
        docs = list(u.get("documents") or []) + [{"title": response.get("doc_title") or "Document", "url": response.get("doc_url")}]
        applied = {"documents": docs}
    if r["kind"] == "hiring_team" and response.get("team_size"):
        applied["team_size"] = str(response["team_size"])
    if applied:
        applied["updated_at"] = now_iso()
        await db.users.update_one({"id": r["user_id"]}, {"$set": applied})
    await db.member_requests.update_one({"id": r["id"]}, {"$set": {
        "status": "submitted", "response": response, "submitted_at": now_iso(), "updated_at": now_iso(),
        "applied_fields": [k for k in applied if k != "updated_at"], "submitted_via": via}})
    await _complete_notifications(r["id"], r["user_id"])
    who = (await db.users.find_one({"id": r["user_id"]}) or {}).get("name", "A member")
    async for a in db.users.find({"role": "admin"}):
        await notify(a["id"], "request_submitted", f"{who} responded: {r.get('title')}", "Ready for review", link="/admin", meta={"request_id": r["id"]})
    await audit(actor["id"], "member_request.submitted", "member_request", r["id"], {"fields": list(applied), "via": via})
    await push_member(r["user_id"], {"Last request": r.get("title"), **{k: v for k, v in response.items() if isinstance(k, str) and k != "external_payload"}})
    return [k for k in applied if k != "updated_at"]


@router.post("/member-requests/{rid}/save")
async def save_draft(rid: str, body: RespondIn, me: dict = Depends(get_current_user)):
    r = await _own_request(rid, me)
    await db.member_requests.update_one({"id": rid}, {"$set": {"draft": body.response, "status": "in_progress" if r["status"] in ("not_started", "in_progress") else r["status"], "updated_at": now_iso()}})
    return {"ok": True}


@router.post("/member-requests/{rid}/submit")
async def submit_request(rid: str, body: RespondIn, me: dict = Depends(get_current_user)):
    r = await _own_request(rid, me)
    if r["status"] in ("reviewed", "resolved"):
        raise HTTPException(status_code=400, detail="This request has already been closed.")
    if r.get("external_url") and not body.response:
        raise HTTPException(status_code=400, detail="Please open the form first, then confirm you've completed it.")
    fields = r.get("fields") or []
    missing = [f["label"] for f in fields if f.get("required") and not _filled(body.response.get(f["key"]))]
    if missing:
        raise HTTPException(status_code=400, detail="Please fill in: " + ", ".join(missing))
    applied = await _mark_submitted(r, body.response, me, "portal")
    return {"ok": True, "applied_fields": applied, "request": _view(await db.member_requests.find_one({"id": rid}))}


@router.post("/member-requests/{rid}/external-open")
async def external_open(rid: str, me: dict = Depends(get_current_user)):
    r = await _own_request(rid, me)
    if r["status"] == "not_started":
        await db.member_requests.update_one({"id": rid}, {"$set": {"status": "in_progress", "opened_at": now_iso(), "updated_at": now_iso()}})
    return {"ok": True, "url": normalize_link(r.get("external_url"))}


@router.post("/member-requests/{rid}/external-complete")
async def external_complete(rid: str, me: dict = Depends(get_current_user)):
    r = await _own_request(rid, me)
    await _mark_submitted(r, {"completed_external_form": True}, me, "external_confirmed")
    return {"ok": True}


@router.post("/webhooks/requests/{token}")
async def webhook_complete(token: str, payload: Dict[str, Any] = {}):
    """External form tools (Airtable/Typeform/Zapier...) call this with the request's secret token."""
    r = await db.member_requests.find_one({"webhook_token": token})
    if not r:
        raise HTTPException(status_code=404, detail="Unknown request")
    applied = await _mark_submitted(r, {"completed_external_form": True, "external_payload": payload}, {"id": r["user_id"]}, "webhook")
    return {"ok": True, "applied": applied}


# ---- admin side of requests
@router.post("/admin/member-requests", status_code=201)
async def admin_create_requests(body: RequestCreate, me: dict = Depends(require_role("admin"))):
    if body.kind not in REQUEST_KINDS:
        raise HTTPException(status_code=400, detail="Unknown request type")
    if not (body.user_ids or body.all_members or body.member_type):
        raise HTTPException(status_code=400, detail="Choose who this request is for.")
    q: Dict[str, Any] = {"role": {"$ne": "admin"}}
    if body.user_ids:
        q["id"] = {"$in": body.user_ids}
    targets = [u async for u in db.users.find(q)]
    if body.member_type:
        targets = [u for u in targets if member_type(u) == body.member_type]
    if not targets:
        raise HTTPException(status_code=400, detail="No members match that selection.")
    ext_url = normalize_link(body.external_url)
    if ext_url and not re.match(r"^https?://[^\s/]+\.[^\s/]+\S*$", ext_url, re.I):
        raise HTTPException(status_code=400, detail="That doesn't look like a web link. Paste the form's full link, e.g. https://forms.gle/...")
    meta = REQUEST_KINDS[body.kind]
    created = []
    for u in targets:
        doc = {"id": f"rq-{uuid.uuid4().hex[:10]}", "user_id": u["id"], "kind": body.kind,
               "title": body.title or meta["label"], "reason": body.reason, "due_date": body.due_date,
               "fields": body.fields or ([] if ext_url else meta["fields"]),
               "external_url": ext_url, "external_provider": body.external_provider,
               "webhook_token": secrets.token_urlsafe(16) if ext_url else None,
               "status": "not_started", "created_by": me["id"], "created_by_name": me.get("name"),
               "created_at": now_iso(), "updated_at": now_iso()}
        await db.member_requests.insert_one(dict(doc))
        await notify(u["id"], "admin_request", f"New request: {doc['title']}",
                     (f"Due {body.due_date}. " if body.due_date else "") + (body.reason or ""), link="/requests", meta={"request_id": doc["id"]})
        created.append(doc["id"])
    await audit(me["id"], "member_request.created", "member_request", created[0] if created else None, {"count": len(created), "kind": body.kind})
    return {"created": len(created), "ids": created}


@router.get("/admin/member-requests")
async def admin_list_requests(status: Optional[str] = None, kind: Optional[str] = None, me: dict = Depends(require_role("admin"))):
    q: Dict[str, Any] = {}
    if kind and kind != "all":
        q["kind"] = kind
    items = [_view(r, admin=True) async for r in db.member_requests.find(q).sort("created_at", -1).limit(300)]
    if status and status != "all":
        items = [i for i in items if i["effective_status"] == status]
    ids = {i["user_id"] for i in items}
    names = {u["id"]: u async for u in db.users.find({"id": {"$in": list(ids)}}, {"_id": 0, "id": 1, "name": 1, "company": 1})}
    for i in items:
        i["member"] = names.get(i["user_id"])
    counts: Dict[str, int] = {}
    for i in items:
        counts[i["effective_status"]] = counts.get(i["effective_status"], 0) + 1
    return {"requests": items, "counts": counts}


@router.post("/admin/member-requests/{rid}/review")
async def admin_review(rid: str, body: ReviewIn, me: dict = Depends(require_role("admin"))):
    if body.status not in ("reviewed", "resolved", "in_progress"):
        raise HTTPException(status_code=400, detail="Status must be reviewed, resolved or in_progress")
    r = await db.member_requests.find_one({"id": rid})
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    await db.member_requests.update_one({"id": rid}, {"$set": {"status": body.status, "review_note": body.note, "reviewed_by": me["id"], "reviewed_at": now_iso(), "updated_at": now_iso()}})
    label = {"reviewed": "reviewed", "resolved": "resolved", "in_progress": "sent back for changes"}[body.status]
    await notify(r["user_id"], "request_update", f"Your response was {label}: {r.get('title')}", body.note or "", link="/requests", meta={"request_id": rid})
    await audit(me["id"], f"member_request.{body.status}", "member_request", rid)
    return {"ok": True}


# --------------------------------------------------------------------------- moderation
COLLECTIONS = {"event": "events", "resource": "resources", "announcement": "announcements"}


class Decision(BaseModel):
    decision: str  # approve | reject | changes
    note: Optional[str] = None


@router.get("/submissions/mine")
async def my_submissions(me: dict = Depends(get_current_user)):
    out = []
    for kind, coll in COLLECTIONS.items():
        async for d in db[coll].find({"submitted_by": me["id"]}).sort("created_at" if kind == "event" else "published_at", -1):
            out.append({"kind": kind, "id": d["id"], "title": d.get("title"), "status": d.get("status", "approved"), "note": d.get("moderation_note")})
    return {"submissions": out}


@router.get("/admin/moderation")
async def moderation_queue(status: str = "pending", me: dict = Depends(require_role("admin"))):
    out = []
    for kind, coll in COLLECTIONS.items():
        async for d in db[coll].find({"status": status}):
            d = clean(d)
            out.append({"kind": kind, "id": d["id"], "title": d.get("title"), "summary": (d.get("description") or d.get("body") or "")[:220],
                        "submitted_by": d.get("submitted_by"), "submitted_by_name": d.get("submitted_by_name"),
                        "category": d.get("category"), "starts_at": d.get("starts_at"), "url": d.get("url"), "status": d.get("status")})
    return {"items": out}


@router.post("/admin/moderation/{kind}/{item_id}")
async def moderate(kind: str, item_id: str, body: Decision, me: dict = Depends(require_role("admin"))):
    coll = COLLECTIONS.get(kind)
    if not coll or body.decision not in ("approve", "reject", "changes"):
        raise HTTPException(status_code=400, detail="Unknown item type or decision")
    d = await db[coll].find_one({"id": item_id})
    if not d:
        raise HTTPException(status_code=404, detail="Item not found")
    status = {"approve": "approved", "reject": "rejected", "changes": "changes_requested"}[body.decision]
    await db[coll].update_one({"id": item_id}, {"$set": {"status": status, "moderation_note": body.note, "moderated_by": me["id"], "moderated_at": now_iso()}})
    if d.get("submitted_by"):
        msg = {"approved": "is now live in the community", "rejected": "was not approved", "changes_requested": "needs changes"}[status]
        await notify(d["submitted_by"], "moderation", f"Your {kind} \"{d.get('title')}\" {msg}", body.note or "", link="/updates" if kind == "announcement" else f"/{kind}s")
    await audit(me["id"], f"moderation.{status}", kind, item_id)
    return {"ok": True, "status": status}


# --------------------------------------------------------------------------- team support workflow
TEAM_STATUSES = ["submitted", "in_review", "assigned", "in_progress", "waiting_on_member", "resolved", "closed"]
SUPPORT_CATEGORIES = ["Career advice", "Business help", "Legal & finance", "Marketing & content", "Mentorship", "Wellness", "Introductions",
                      "Scheduling", "Events", "Volunteering", "Account help", "Other"]


class TeamSupportIn(BaseModel):
    category: str
    title: str
    description: Optional[str] = None
    urgency: str = "normal"
    deadline: Optional[str] = None
    attachment_url: Optional[str] = None


class SupportAdminIn(BaseModel):
    status: Optional[str] = None
    assignee_id: Optional[str] = None
    response: Optional[str] = None


@router.get("/support-categories")
async def support_categories():
    return {"categories": SUPPORT_CATEGORIES, "statuses": TEAM_STATUSES}


@router.post("/team-support", status_code=201)
async def create_team_support(body: TeamSupportIn, me: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "user_id": me["id"], "to_team": True,
           "user_snapshot": {k: me.get(k) for k in ("id", "name", "avatar_url", "title", "company")},
           "title": body.title.strip(), "description": body.description, "category": body.category.lower(),
           "category_label": body.category, "urgency": body.urgency, "deadline": body.deadline, "attachment_url": body.attachment_url,
           "status": "submitted", "tags": [], "helpers": [], "timeline": [{"status": "submitted", "at": now_iso(), "by": me.get("name")}],
           "created_at": now_iso(), "updated_at": now_iso(), "resolved_at": None}
    await db.support_requests.insert_one(dict(doc))
    async for a in db.users.find({"role": "admin"}):
        await notify(a["id"], "support_request", f"Support request from {me.get('name')}: {doc['title']}", body.category, link="/admin")
    await audit(me["id"], "support_request.submitted", "support_request", doc["id"], {"to_team": True, "category": body.category})
    return clean(doc)


@router.get("/me/team-support")
async def my_team_support(me: dict = Depends(get_current_user)):
    return {"requests": [clean(r) async for r in db.support_requests.find({"user_id": me["id"], "to_team": True}).sort("created_at", -1)]}


@router.get("/admin/team-support")
async def admin_team_support(status: Optional[str] = None, me: dict = Depends(require_role("admin"))):
    q: Dict[str, Any] = {"to_team": True}
    if status and status != "all":
        q["status"] = status
    items = [clean(r) async for r in db.support_requests.find(q).sort("created_at", -1).limit(200)]
    admins = {a["id"]: a.get("name") async for a in db.users.find({"role": "admin"})}
    for i in items:
        i["assignee_name"] = admins.get(i.get("assignee_id"))
    return {"requests": items, "admins": [{"id": k, "name": v} for k, v in admins.items()]}


@router.post("/admin/team-support/{rid}")
async def admin_update_support(rid: str, body: SupportAdminIn, me: dict = Depends(require_role("admin"))):
    r = await db.support_requests.find_one({"id": rid})
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    upd: Dict[str, Any] = {"updated_at": now_iso()}
    tl = list(r.get("timeline") or [])
    if body.assignee_id:
        upd["assignee_id"] = body.assignee_id
        if not body.status and r.get("status") in ("submitted", "in_review"):
            body.status = "assigned"
    if body.status:
        if body.status not in TEAM_STATUSES:
            raise HTTPException(status_code=400, detail="Unknown status")
        upd["status"] = body.status
        if body.status in ("resolved", "closed"):
            upd["resolved_at"] = now_iso()
        tl.append({"status": body.status, "at": now_iso(), "by": me.get("name"), "note": body.response})
    if body.response:
        upd["last_response"] = body.response
        if not body.status:
            tl.append({"status": r.get("status"), "at": now_iso(), "by": me.get("name"), "note": body.response})
    upd["timeline"] = tl
    await db.support_requests.update_one({"id": rid}, {"$set": upd})
    await notify(r["user_id"], "support_update", f"Update on your request: {r.get('title')}",
                 (body.response or f"Status: {(body.status or r.get('status')).replace('_', ' ')}"), link="/support")
    await audit(me["id"], "support_request.updated", "support_request", rid, {"status": body.status})
    return {"ok": True}


# --------------------------------------------------------------------------- match actions
class MatchAction(BaseModel):
    kind: str  # person | event | resource
    target_id: str
    action: str  # save | dismiss | intro | undo


@router.post("/matches/action")
async def match_action(body: MatchAction, me: dict = Depends(get_current_user)):
    key = {"user_id": me["id"], "kind": body.kind, "target_id": body.target_id}
    if body.action == "undo":
        await db.match_actions.delete_many(key)
    else:
        await db.match_actions.update_one(key, {"$set": {"action": body.action, "at": now_iso()}}, upsert=True)
    await audit(me["id"], f"match.{body.action}", body.kind, body.target_id)
    return {"ok": True}


# --------------------------------------------------------------------------- member type / integrations
class MemberTypeIn(BaseModel):
    member_type: str
    mentor_ids: Optional[List[str]] = None


@router.post("/admin/users/{uid}/member-type")
async def set_member_type(uid: str, body: MemberTypeIn, me: dict = Depends(require_role("admin"))):
    if body.member_type not in MEMBER_TYPES:
        raise HTTPException(status_code=400, detail="Unknown member type")
    upd: Dict[str, Any] = {"member_type": body.member_type}
    if body.mentor_ids is not None:
        upd["mentor_ids"] = body.mentor_ids
    await db.users.update_one({"id": uid}, {"$set": upd})
    await audit(me["id"], "user.member_type_set", "user", uid, {"member_type": body.member_type})
    return {"ok": True}


# --------------------------------------------------------------------------- action center + reminders
@router.get("/admin/action-center")
async def action_center(me: dict = Depends(require_role("admin"))):
    reqs = [_view(r, admin=True) async for r in db.member_requests.find({}).limit(500)]
    sup = [clean(s) async for s in db.support_requests.find({"to_team": True, "status": {"$in": ["submitted", "in_review", "waiting_on_member"]}}).limit(100)]
    pending = 0
    for coll in COLLECTIONS.values():
        pending += await db[coll].count_documents({"status": "pending"})
    profiles_incomplete = 0
    async for u in db.users.find({"role": {"$ne": "admin"}, "is_simulated": {"$ne": True}}):
        if completion(u)["percent"] < 60:
            profiles_incomplete += 1
    recent = [{"action": a["action"], "actor_id": a.get("actor_id"), "target_type": a.get("target_type"),
               "at": a["created_at"].isoformat() if hasattr(a["created_at"], "isoformat") else a["created_at"]}
              async for a in db.audit_log.find({"action": {"$regex": "^(profile|member_request|event.rsvp|resource|support_request|match|settings)"}}).sort("created_at", -1).limit(15)]
    return {"awaiting_review": sum(1 for r in reqs if r["effective_status"] == "submitted"),
            "overdue_requests": sum(1 for r in reqs if r["effective_status"] == "overdue"),
            "open_requests": sum(1 for r in reqs if r["effective_status"] in ("not_started", "in_progress")),
            "support_needing_action": len(sup), "pending_memberships": await db.users.count_documents({"membership_status": "pending"}), "pending_moderation": pending, "incomplete_profiles": profiles_incomplete,
            "recent_member_activity": recent}


async def sync_reminders(me: Dict[str, Any]) -> None:
    """Idempotent reminders: request due soon / overdue, event within 48h. Called lazily from dashboard/notifications."""
    today = now_iso()[:10]
    soon = (datetime.now(timezone.utc) + timedelta(days=3)).date().isoformat()
    async for r in db.member_requests.find({"user_id": me["id"], "status": {"$in": ["not_started", "in_progress"]}, "due_date": {"$ne": None}}):
        kind = "overdue" if r["due_date"] < today else ("due_soon" if r["due_date"] <= soon else None)
        if not kind:
            continue
        key = f"{r['id']}:{kind}"
        if await db.notifications.find_one({"user_id": me["id"], "meta.key": key}):
            continue
        await notify(me["id"], f"request_{kind}", ("Overdue: " if kind == "overdue" else "Due soon: ") + (r.get("title") or "request"),
                     f"Due {r['due_date']}", link="/requests", meta={"key": key, "request_id": r["id"]})
    horizon = (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat()
    async for e in db.events.find({f"rsvps.{me['id']}": "yes", "starts_at": {"$gte": now_iso(), "$lte": horizon}}):
        key = f"{e['id']}:reminder"
        if await db.notifications.find_one({"user_id": me["id"], "meta.key": key}):
            continue
        await notify(me["id"], "event_reminder", f"Coming up: {e.get('title')}", e.get("starts_at", ""), link=f"/events/{e['id']}", meta={"key": key})
