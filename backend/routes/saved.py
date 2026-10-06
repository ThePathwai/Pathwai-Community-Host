"""Aggregates a member's bookmarks across events, members and perks for the Saved section of their
profile (see ProfileEdit.jsx's "Saved" tab).

Bookmarking itself isn't new here -- it lives with each content type, the same on/off `saved_by`
array + `/{kind}/{id}/save` toggle that resources.py (perks) had first and events.py / server.py's
member directory now share. This module just gathers each type's saved items into one call, already
shaped for a simple card, so the Saved tab doesn't have to fan out three separate list requests (and
re-filter each to `saved=true` client-side) just to render one screen.
"""
from typing import Any, Dict, List

from fastapi import APIRouter, Depends

from auth import get_current_user
from database import db
from ._common import clean, public_view
from .events import _now

router = APIRouter(tags=["saved"])


@router.get("/me/saved")
async def my_saved(me: dict = Depends(get_current_user)):
    events: List[Dict[str, Any]] = []
    async for e in db.events.find({"saved_by": me["id"]}).sort("starts_at", -1):
        e = clean(e)
        events.append({
            "id": e["id"], "title": e.get("title"), "starts_at": e.get("starts_at"),
            "location": e.get("location"), "virtual_url": e.get("virtual_url"),
            "cover_url": e.get("cover_url"), "category": e.get("category"),
            "is_past": (e.get("starts_at") or "") < _now(),
        })

    members: List[Dict[str, Any]] = []
    async for u in db.users.find({"saved_by": me["id"]}).sort("name", 1):
        if u["id"] == me["id"]:
            continue
        pv = public_view(clean(u), me)
        members.append({
            "id": pv["id"], "name": pv.get("name"), "avatar_url": pv.get("avatar_url"),
            "title": pv.get("title"), "company": pv.get("company"),
        })

    resources: List[Dict[str, Any]] = []
    async for r in db.resources.find({"saved_by": me["id"]}).sort("published_at", -1):
        r = clean(r)
        resources.append({
            "id": r["id"], "title": r.get("title"), "category": r.get("category"),
            "perk_value": r.get("perk_value"), "url": r.get("url"), "cover_url": r.get("cover_url"),
        })

    return {"events": events, "members": members, "resources": resources}
