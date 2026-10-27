"""Navigator: a directory of Canadian innovation programs, and a mentor that says which fit you and why.

Public on purpose (no login): someone can work out their next step before they join any community. Two sources
feed it: a hand-checked national catalog (data/programs_ca.json), and the programs and profile that community
admins add for their own community (Admin -> Programs). A community only shows up here once its admin opts in.
The matching rules live in navigator.py; this file is the plumbing around them."""
from __future__ import annotations

import logging
import os
import uuid
from typing import Any, Dict, List, Optional

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

import navigator as nav
from auth import client_ip, rate_limit, require_role
from database import COMMUNITY_SLUGS, db, dbfor
from ._common import audit, now_iso
from .hub import _summary, account_from_request

router = APIRouter(tags=["navigator"])
log = logging.getLogger(__name__)
MAX_COMMUNITY_PROGRAMS = 40


class ProfileIn(BaseModel):
    stage: Optional[str] = None
    audiences: Optional[List[str]] = None
    age: Optional[int] = None
    province: Optional[str] = None
    city: Optional[str] = None
    sectors: Optional[List[str]] = None
    incorporated: Optional[Any] = None
    employees: Optional[int] = None
    student: Optional[bool] = None
    needs: Optional[List[str]] = None
    goal: Optional[str] = Field(default=None, max_length=500)


class SuggestIn(BaseModel):
    profile: ProfileIn = ProfileIn()


# ---------- reading every opted-in community ----------
async def _opted_in() -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for slug in list(COMMUNITY_SLUGS):
        try:
            d = dbfor(slug)
            cfg = await d.community_config.find_one({"_key": "singleton"}) or {}
            n = cfg.get("navigator") or {}
            if not n.get("public"):
                continue
            summ = await _summary(slug)
            rows = await d.navigator_programs.find({}, {"_id": 0}).to_list(MAX_COMMUNITY_PROGRAMS)
            out.append({**summ, "navigator": n, "program_count": len(rows),
                        "programs": [nav.community_program(r, slug, summ["name"]) for r in rows]})
        except Exception as exc:  # noqa: BLE001 -- one broken community must not take the directory down
            log.warning("navigator: skipped community %s: %s", slug, exc)
    return out


async def _all_programs() -> List[Dict[str, Any]]:
    progs = list(nav.load_catalog()["programs"])
    for c in await _opted_in():
        progs.extend(c["programs"])
    return progs


@router.get("/navigator/meta")
async def navigator_meta() -> Dict[str, Any]:
    cat = nav.load_catalog()
    return {
        "version": cat.get("version"), "notes": cat.get("notes"), "count": len(cat["programs"]),
        "stages": [{"key": k, "label": nav.STAGE_LABEL[k], "hint": nav.STAGE_HINT[k]} for k in nav.STAGES],
        "needs": [{"key": k, "label": nav.NEED_LABEL[k]} for k in nav.NEEDS],
        "audiences": [{"key": k, "label": nav.AUDIENCE_LABEL[k]} for k in nav.AUDIENCES],
        "sectors": nav.SECTORS, "provinces": nav.PROVINCES,
        "types": [{"key": k, "label": nav.TYPE_LABEL[k]} for k in nav.TYPES],
        "statuses": [{"key": k, "label": nav.STATUS_LABEL[k]} for k in nav.STATUSES],
    }


@router.get("/navigator/programs")
async def navigator_programs(q: str = "", type: str = "", province: str = "", stage: str = "", audience: str = "", status: str = "", need: str = "") -> Dict[str, Any]:
    rows = nav.filter_programs(await _all_programs(), q=q[:80], ptype=type, province=province, stage=stage, audience=audience, status=status, need=need)
    return {"programs": rows, "count": len(rows)}


@router.get("/navigator/programs/{program_id}")
async def navigator_program(program_id: str) -> Dict[str, Any]:
    for p in await _all_programs():
        if p["id"] == program_id:
            return {**{k: v for k, v in p.items()}, "status": nav.effective_status(p, date.today())}
    raise HTTPException(status_code=404, detail="Program not found")


async def _polish(summary: str, result: Dict[str, Any]) -> Optional[str]:
    """Optionally rewrite the rule-based summary in a warmer voice. The model only sees the matched facts,
    never the whole directory, and any failure just means the plain summary is used."""
    if os.environ.get("ENABLE_AI_CHAT", "false").lower() != "true" or not os.environ.get("EMERGENT_LLM_KEY"):
        return None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # lazy: not needed when the feature is off

        facts = "\n".join(f"- {m['name']} ({m['status']}): {' '.join(m['reasons'][:2])} {' '.join(m['cautions'][:1])}" for m in result["matches"][:4])
        goal = result["profile"].get("goal") or ""
        chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"nav-{uuid.uuid4().hex[:8]}",
                       system_message="You are a friendly Canadian startup mentor. Using ONLY the facts given, write 2 to 3 short sentences telling the founder what to do first and why. "
                                      "Never add programs, amounts or dates that are not in the facts. No lists, no markdown, no greeting.").with_model("openai", "gpt-5.2")
        text = await chat.send_message(UserMessage(text=f"Founder stage: {result['profile']['stage']}. Goal: {goal or 'not given'}.\nMatches:\n{facts}\nBase summary: {summary}"))
        text = " ".join(str(text).split())
        return text[:600] if text else None
    except Exception as exc:  # noqa: BLE001
        log.info("navigator: model polish skipped: %s", exc)
        return None


@router.get("/navigator/me")
async def navigator_me(request: Request) -> Dict[str, Any]:
    """The signed-in person's startup profile, shaped for the Navigator form. Signed out (or nothing filled in yet)
    returns an empty profile -- the Navigator works the same either way, this only saves them retyping."""
    acc = await account_from_request(request)
    return {"signed_in": bool(acc), "profile": nav.navigator_profile(acc), "startup": (acc or {}).get("startup") or {}}


@router.post("/navigator/suggest")
async def navigator_suggest(body: SuggestIn, request: Request) -> Dict[str, Any]:
    await rate_limit("navigator_suggest", client_ip(request), 120, 3600, "That's a lot of searches for now. Try again in a little while.")
    raw = body.profile.model_dump()
    result = nav.suggest(await _all_programs(), raw)
    result["communities"] = nav.rank_communities(await _opted_in(), raw)
    polished = await _polish(result["summary"], result)
    result["narrative"] = polished or result["summary"]
    result["narrative_by"] = "model" if polished else "rules"
    return result


# ---------- community admin: profile + own programs ----------
class NavProfileIn(BaseModel):
    public: bool = False
    blurb: str = Field(default="", max_length=300)
    stages: List[str] = []
    provides: List[str] = []
    audiences: List[str] = []
    sectors: List[str] = []
    city: str = Field(default="", max_length=80)
    provinces: List[str] = []


def _clean_profile(p: NavProfileIn) -> Dict[str, Any]:
    return {
        "public": bool(p.public), "blurb": p.blurb.strip()[:300],
        "stages": nav._list(p.stages, nav.STAGES), "provides": nav._list(p.provides, nav.NEEDS),
        "audiences": nav._list(p.audiences, nav.AUDIENCES), "sectors": nav._list(p.sectors, nav.SECTORS),
        "city": p.city.strip()[:80], "provinces": [x.upper() for x in nav._list([v.lower() for v in p.provinces], [v.lower() for v in nav.PROVINCES])],
    }


_KEYWORDS = {
    "funding": ("fund", "grant", "loan", "capital", "invest", "money", "raise"), "mentorship": ("mentor", "advice", "coach", "guidance", "advis"),
    "space": ("space", "office", "lab", "studio"), "customers": ("customer", "client", "sales", "market", "pilot"), "export": ("export", "international", "global", "abroad"),
    "rd": ("r&d", "research", "prototype", "develop"), "ip": ("patent", "trademark", "legal", "intellectual"), "talent": ("hire", "talent", "intern", "recruit", "developer"),
    "network": ("network", "intro", "connect", "community"), "tax": ("tax", "sr&ed"), "training": ("train", "learn", "course", "workshop", "skill"), "visa": ("visa", "immigra", "work permit"),
}


def needs_from_text(text: str) -> List[str]:
    t = text.lower()
    return [k for k, words in _KEYWORDS.items() if any(w in t for w in words)]


@router.get("/navigator/admin")
async def navigator_admin(me: dict = Depends(require_role("admin"))) -> Dict[str, Any]:
    cfg = await db.community_config.find_one({"_key": "singleton"}) or {}
    rows = await db.navigator_programs.find({}, {"_id": 0}).sort("created_at", 1).to_list(MAX_COMMUNITY_PROGRAMS)
    # What the community's own members said they need: the profile data that feeds the Navigator.
    counts: Dict[str, int] = {}
    async for u in db.users.find({"hidden_from_directory": {"$ne": True}}, {"support_needs": 1, "needs_seeking": 1, "goals": 1}):
        seen = set()
        for field in ("support_needs", "needs_seeking", "goals"):
            v = u.get(field)
            for item in (v if isinstance(v, list) else [v] if v else []):
                seen.update(needs_from_text(str(item)))
        for k in seen:
            counts[k] = counts.get(k, 0) + 1
    tags = [str(t).lower() for t in (cfg.get("interest_tags") or [])]
    return {
        "profile": cfg.get("navigator") or {"public": False, "blurb": "", "stages": [], "provides": [], "audiences": [], "sectors": [t for t in tags if t in nav.SECTORS], "city": "", "provinces": []},
        "programs": rows,
        "member_needs": sorted(({"key": k, "label": nav.NEED_LABEL[k], "members": n} for k, n in counts.items()), key=lambda r: -r["members"])[:6],
        "limit": MAX_COMMUNITY_PROGRAMS,
    }


@router.put("/navigator/admin/profile")
async def navigator_admin_profile(body: NavProfileIn, me: dict = Depends(require_role("admin"))) -> Dict[str, Any]:
    prof = _clean_profile(body)
    await db.community_config.update_one({"_key": "singleton"}, {"$set": {"navigator": prof, "updated_at": now_iso()}}, upsert=True)
    await audit(me["id"], "navigator.profile_updated", "community", None, meta={"public": prof["public"]})
    return prof


def _listing_or_400(body: Dict[str, Any]) -> Dict[str, Any]:
    try:
        return nav.clean_listing(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/navigator/admin/programs", status_code=201)
async def navigator_add_program(body: Dict[str, Any], me: dict = Depends(require_role("admin"))) -> Dict[str, Any]:
    if await db.navigator_programs.count_documents({}) >= MAX_COMMUNITY_PROGRAMS:
        raise HTTPException(status_code=400, detail=f"You can list up to {MAX_COMMUNITY_PROGRAMS} programs")
    doc = {"id": uuid.uuid4().hex[:10], **_listing_or_400(body), "created_at": now_iso(), "updated_at": now_iso()}
    await db.navigator_programs.insert_one(dict(doc))
    await audit(me["id"], "navigator.program_added", "navigator_program", doc["id"], meta={"name": doc["name"]})
    return doc


@router.patch("/navigator/admin/programs/{program_id}")
async def navigator_edit_program(program_id: str, body: Dict[str, Any], me: dict = Depends(require_role("admin"))) -> Dict[str, Any]:
    cur = await db.navigator_programs.find_one({"id": program_id}, {"_id": 0})
    if not cur:
        raise HTTPException(status_code=404, detail="Program not found")
    merged = {**cur, **{k: v for k, v in body.items() if k not in ("id", "created_at")}}
    # the stored shape nests the deadline; clean_listing reads it flat
    merged.setdefault("deadline_kind", (cur.get("deadline") or {}).get("kind"))
    merged.setdefault("deadline_date", (cur.get("deadline") or {}).get("date"))
    merged.setdefault("deadline_note", (cur.get("deadline") or {}).get("note"))
    upd = {**_listing_or_400(merged), "updated_at": now_iso()}
    await db.navigator_programs.update_one({"id": program_id}, {"$set": upd})
    await audit(me["id"], "navigator.program_edited", "navigator_program", program_id)
    return {**cur, **upd}


@router.delete("/navigator/admin/programs/{program_id}")
async def navigator_delete_program(program_id: str, me: dict = Depends(require_role("admin"))) -> Dict[str, Any]:
    res = await db.navigator_programs.delete_one({"id": program_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Program not found")
    await audit(me["id"], "navigator.program_removed", "navigator_program", program_id)
    return {"ok": True}
