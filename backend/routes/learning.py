"""Learning: the programs members are enrolled in elsewhere (e.g. a Disco academy), reflected inside the community.

Nothing here teaches anything. It is a mirror: each program (name, link, dates, number of modules) and each member's
progress in it (enrolled / completed, % done, current module, next live session, certificate). One ingest endpoint
(`PUT /admin/learning/sync`) takes the data in a neutral shape, so any source can fill it: the Disco connector, a
Zapier zap, a webhook receiver or a CSV someone turns into JSON. Members are matched to the source by email.
Collections: `learning_programs`, `learning_enrollments`.
"""
from __future__ import annotations

import re
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user, require_role
from database import db
from ._common import audit, clean, now_iso

router = APIRouter(tags=["learning"])

STATUSES = {"enrolled", "completed", "dropped"}
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class MemberProgress(BaseModel):
    email: str
    status: str = "enrolled"
    progress_pct: Optional[float] = None
    modules_done: Optional[int] = None
    current_module: Optional[str] = None
    next_session_at: Optional[str] = None
    completed_at: Optional[str] = None
    certificate_url: Optional[str] = None


class ProgramIn(BaseModel):
    external_id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    url: Optional[str] = None
    cover_url: Optional[str] = None
    status: str = "active"
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None
    modules_total: Optional[int] = None
    tags: List[str] = []
    members: List[MemberProgress] = []


class SyncIn(BaseModel):
    source: str = Field(default="disco", max_length=30)
    programs: List[ProgramIn] = Field(default_factory=list, max_length=60)


def _https(v: Optional[str], what: str) -> Optional[str]:
    v = (v or "").strip()
    if not v:
        return None
    if not v.startswith("https://"):
        raise HTTPException(status_code=400, detail=f"{what} must start with https://")
    return v[:500]


def _pct(v: Optional[float], done: Optional[int], total: Optional[int], status: str) -> int:
    if status == "completed":
        return 100
    if v is not None:
        return max(0, min(100, int(round(v))))
    if done is not None and total:
        return max(0, min(100, int(round(100 * done / total))))
    return 0


async def _upsert(source: str, programs: List[ProgramIn]) -> Dict[str, int]:
    users = {(u.get("email") or "").strip().lower(): u["id"] async for u in db.users.find({}, {"id": 1, "email": 1})}
    n_prog = n_enr = 0
    unmatched: set = set()
    for p in programs:
        pdoc = {
            "source": source, "external_id": p.external_id.strip(), "name": p.name.strip()[:120], "description": p.description.strip()[:600],
            "url": _https(p.url, "A program link"), "cover_url": _https(p.cover_url, "A cover image link"),
            "status": p.status if p.status in {"active", "archived"} else "active", "starts_at": p.starts_at, "ends_at": p.ends_at,
            "modules_total": max(0, int(p.modules_total)) if p.modules_total else None, "tags": [t.strip()[:30] for t in p.tags if t.strip()][:6], "synced_at": now_iso(),
        }
        existing = await db.learning_programs.find_one({"source": source, "external_id": pdoc["external_id"]})
        if existing:
            pid = existing["id"]
            await db.learning_programs.update_one({"id": pid}, {"$set": pdoc})
        else:
            pid = str(uuid.uuid4())
            await db.learning_programs.insert_one({"id": pid, **pdoc})
        n_prog += 1
        for m in p.members:
            email = m.email.strip().lower()
            uid = users.get(email) if EMAIL.match(email) else None
            if not uid:
                unmatched.add(email)
                continue
            status = m.status if m.status in STATUSES else "enrolled"
            edoc = {
                "program_id": pid, "user_id": uid, "status": status, "progress_pct": _pct(m.progress_pct, m.modules_done, pdoc["modules_total"], status),
                "modules_done": m.modules_done, "current_module": (m.current_module or "").strip()[:120] or None, "next_session_at": m.next_session_at,
                "completed_at": m.completed_at if status == "completed" else None, "certificate_url": _https(m.certificate_url, "A certificate link"), "synced_at": now_iso(),
            }
            await db.learning_enrollments.update_one({"program_id": pid, "user_id": uid}, {"$set": edoc}, upsert=True)
            n_enr += 1
    return {"programs": n_prog, "enrollments": n_enr, "unmatched_members": len(unmatched)}


def _mine(e: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not e:
        return None
    return {k: e.get(k) for k in ("status", "progress_pct", "modules_done", "current_module", "next_session_at", "completed_at", "certificate_url")}


async def _programs(viewer_id: str) -> List[Dict[str, Any]]:
    progs = [clean(p) async for p in db.learning_programs.find({"status": {"$ne": "archived"}})]
    enr = [e async for e in db.learning_enrollments.find({"status": {"$ne": "dropped"}})]
    people = {u["id"]: u async for u in db.users.find({}, {"id": 1, "name": 1, "avatar_url": 1, "hidden_from_directory": 1})}
    by_prog: Dict[str, List[Dict[str, Any]]] = {}
    for e in enr:
        by_prog.setdefault(e["program_id"], []).append(e)
    out = []
    for p in progs:
        es = by_prog.get(p["id"], [])
        mine = next((e for e in es if e["user_id"] == viewer_id), None)
        cohort = [people[e["user_id"]] for e in es if e["user_id"] in people and not people[e["user_id"]].get("hidden_from_directory")]
        out.append({**{k: v for k, v in p.items() if k not in ("synced_at",)}, "enrolled_count": len(es), "completed_count": sum(1 for e in es if e["status"] == "completed"),
                    "cohort_preview": [{"id": u["id"], "name": u.get("name"), "avatar_url": u.get("avatar_url")} for u in cohort[:5]], "my": _mine(mine)})
    out.sort(key=lambda p: (p["my"] is None, p.get("starts_at") or "", p["name"]))
    return out


@router.get("/learning/programs")
async def all_programs(me: dict = Depends(get_current_user)):
    progs = await _programs(me["id"])
    return {"programs": progs, "source": next(iter({p.get("source") for p in progs if p.get("source")}), None)}


@router.get("/learning/mine")
async def my_learning(me: dict = Depends(get_current_user)):
    mine = [p for p in await _programs(me["id"]) if p["my"]]
    done = sum(1 for p in mine if p["my"]["status"] == "completed")
    active = [p for p in mine if p["my"]["status"] == "enrolled"]
    nxt = sorted((p["my"]["next_session_at"] for p in active if p["my"].get("next_session_at")))
    return {"programs": mine, "summary": {"enrolled": len(active), "completed": done, "next_session_at": nxt[0] if nxt else None}}


@router.get("/learning/people/{uid}")
async def people_learning(uid: str, me: dict = Depends(get_current_user)):
    """The programs another member is in (name, status and % done only -- no scores or submissions)."""
    progs = {p["id"]: p async for p in db.learning_programs.find({"status": {"$ne": "archived"}})}
    out = []
    async for e in db.learning_enrollments.find({"user_id": uid, "status": {"$ne": "dropped"}}):
        p = progs.get(e["program_id"])
        if p:
            out.append({"program_id": p["id"], "name": p["name"], "url": p.get("url"), "status": e["status"], "progress_pct": e.get("progress_pct", 0), "completed_at": e.get("completed_at")})
    out.sort(key=lambda x: (x["status"] != "enrolled", x["name"]))
    return {"programs": out}


@router.put("/admin/learning/sync")
async def sync_learning(body: SyncIn, me: dict = Depends(require_role("admin"))):
    res = await _upsert(body.source, body.programs)
    await audit(me["id"], "learning.synced", "learning", body.source, res)
    return {"ok": True, "result": res}
