"""Project teams: small groups inside a community that members start themselves ("Spring shoot crew", "Sunday livestream").

Anyone in the community can start a team and becomes its lead; anyone can join an active team. The lead (or an admin)
edits the team, adds or removes people and can close or delete it. A team says which skills it is still looking for, so
people can see where their own skills would help.
"""
from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from database import db
from ._common import audit, clean, now_iso
from .notifications import notify

router = APIRouter(tags=["teams"])

SNAP = ("id", "name", "avatar_url", "title", "company", "member_type")


async def ensure_indexes() -> None:
    await db.teams.create_index("id", unique=True)
    await db.teams.create_index([("created_at", -1)])


def _tags(v: Optional[List[str]]) -> List[str]:
    out: List[str] = []
    for t in v or []:
        t = str(t).strip()[:40]
        if t and t.lower() not in [x.lower() for x in out]:
            out.append(t)
    return out[:12]


class TeamIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: Optional[str] = Field(default=None, max_length=1500)
    looking_for: List[str] = []


class TeamPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    description: Optional[str] = Field(default=None, max_length=1500)
    looking_for: Optional[List[str]] = None
    status: Optional[str] = None
    lead_id: Optional[str] = None


class MemberIn(BaseModel):
    user_id: str


async def _people(ids: List[str]) -> dict:
    out = {}
    if ids:
        async for u in db.users.find({"id": {"$in": ids}}):
            out[u["id"]] = {**{k: u.get(k) for k in SNAP}, "skill_set": u.get("skill_set") or [], "goals": u.get("goals") or []}
    return out


def _shape(t: dict, me: dict, people: dict, detail: bool = False) -> dict:
    t = clean(dict(t))
    ids = t.get("member_ids") or []
    t["member_count"] = len(ids)
    t["is_member"] = me["id"] in ids
    t["is_lead"] = t.get("lead_id") == me["id"]
    t["can_manage"] = t["is_lead"] or me.get("role") == "admin"
    t["lead"] = people.get(t.get("lead_id"))
    t["member_preview"] = [people[i] for i in ids[:5] if i in people]
    if detail:
        t["members"] = [people[i] for i in ids if i in people]
    return t


async def _load(team_id: str) -> dict:
    t = await db.teams.find_one({"id": team_id})
    if not t:
        raise HTTPException(status_code=404, detail="That team doesn't exist.")
    return t


def _guard(t: dict, me: dict) -> None:
    if t.get("lead_id") != me["id"] and me.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the team lead or an admin can do that.")


@router.get("/teams")
async def list_teams(mine: bool = False, status: Optional[str] = None, q: Optional[str] = None, me: dict = Depends(get_current_user)):
    query: dict = {}
    if status in ("active", "done"):
        query["status"] = status
    if mine:
        query["member_ids"] = me["id"]
    if q:
        rx = {"$regex": q, "$options": "i"}
        query["$or"] = [{"name": rx}, {"description": rx}, {"looking_for": rx}]
    rows = [r async for r in db.teams.find(query).sort("created_at", -1).limit(200)]
    people = await _people(list({i for r in rows for i in [r.get("lead_id"), *(r.get("member_ids") or [])[:5]] if i}))
    return [_shape(r, me, people) for r in rows]


@router.post("/teams", status_code=201)
async def create_team(body: TeamIn, me: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "name": body.name.strip(), "description": (body.description or "").strip(), "looking_for": _tags(body.looking_for),
           "status": "active", "lead_id": me["id"], "member_ids": [me["id"]], "created_by": me["id"], "created_at": now_iso(), "updated_at": now_iso()}
    await db.teams.insert_one(dict(doc))
    await audit(me["id"], "team.created", "team", doc["id"], {"name": doc["name"]})
    return _shape(doc, me, await _people([me["id"]]), detail=True)


@router.get("/teams/{team_id}")
async def get_team(team_id: str, me: dict = Depends(get_current_user)):
    t = await _load(team_id)
    return _shape(t, me, await _people(list({t.get("lead_id"), *(t.get("member_ids") or [])} - {None})), detail=True)


@router.patch("/teams/{team_id}")
async def patch_team(team_id: str, body: TeamPatch, me: dict = Depends(get_current_user)):
    t = await _load(team_id)
    _guard(t, me)
    upd: dict = {}
    if body.name is not None:
        upd["name"] = body.name.strip()
    if body.description is not None:
        upd["description"] = body.description.strip()
    if body.looking_for is not None:
        upd["looking_for"] = _tags(body.looking_for)
    if body.status is not None:
        if body.status not in ("active", "done"):
            raise HTTPException(status_code=400, detail="Status must be active or done.")
        upd["status"] = body.status
    if body.lead_id is not None:
        if body.lead_id not in (t.get("member_ids") or []):
            raise HTTPException(status_code=400, detail="The new lead has to be on the team first.")
        upd["lead_id"] = body.lead_id
    if upd:
        upd["updated_at"] = now_iso()
        await db.teams.update_one({"id": team_id}, {"$set": upd})
    return await get_team(team_id, me)


@router.delete("/teams/{team_id}")
async def delete_team(team_id: str, me: dict = Depends(get_current_user)):
    t = await _load(team_id)
    _guard(t, me)
    await db.teams.delete_one({"id": team_id})
    await audit(me["id"], "team.deleted", "team", team_id, {"name": t.get("name")})
    return {"ok": True}


@router.post("/teams/{team_id}/join")
async def join_team(team_id: str, me: dict = Depends(get_current_user)):
    t = await _load(team_id)
    if t.get("status") == "done":
        raise HTTPException(status_code=400, detail="This team has finished, so it isn't taking new people.")
    if me["id"] not in (t.get("member_ids") or []):
        await db.teams.update_one({"id": team_id}, {"$addToSet": {"member_ids": me["id"]}, "$set": {"updated_at": now_iso()}})
        if t.get("lead_id") and t["lead_id"] != me["id"]:
            await notify(t["lead_id"], "team", f"{me.get('name', 'Someone')} joined {t['name']}", "", f"/teams/{team_id}")
    return await get_team(team_id, me)


@router.post("/teams/{team_id}/leave")
async def leave_team(team_id: str, me: dict = Depends(get_current_user)):
    t = await _load(team_id)
    ids = [i for i in (t.get("member_ids") or []) if i != me["id"]]
    upd = {"member_ids": ids, "updated_at": now_iso()}
    if t.get("lead_id") == me["id"]:
        upd["lead_id"] = ids[0] if ids else None  # the longest-standing member takes over
        if ids:
            await notify(ids[0], "team", f"You're now leading {t['name']}", "", f"/teams/{team_id}")
    await db.teams.update_one({"id": team_id}, {"$set": upd})
    if not ids:
        await db.teams.delete_one({"id": team_id})  # nobody left: the team closes itself
        return {"ok": True, "deleted": True}
    return await get_team(team_id, me)


@router.post("/teams/{team_id}/members")
async def add_member(team_id: str, body: MemberIn, me: dict = Depends(get_current_user)):
    t = await _load(team_id)
    _guard(t, me)
    u = await db.users.find_one({"id": body.user_id, "membership_status": {"$nin": ["pending", "rejected"]}})
    if not u:
        raise HTTPException(status_code=404, detail="That person isn't a member of this community.")
    if body.user_id not in (t.get("member_ids") or []):
        await db.teams.update_one({"id": team_id}, {"$addToSet": {"member_ids": body.user_id}, "$set": {"updated_at": now_iso()}})
        if body.user_id != me["id"]:
            await notify(body.user_id, "team", f"You were added to {t['name']}", "", f"/teams/{team_id}")
    return await get_team(team_id, me)


@router.delete("/teams/{team_id}/members/{user_id}")
async def remove_member(team_id: str, user_id: str, me: dict = Depends(get_current_user)):
    t = await _load(team_id)
    _guard(t, me)
    if user_id == t.get("lead_id"):
        raise HTTPException(status_code=400, detail="Hand the lead to someone else first.")
    await db.teams.update_one({"id": team_id}, {"$pull": {"member_ids": user_id}, "$set": {"updated_at": now_iso()}})
    return await get_team(team_id, me)
