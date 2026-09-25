from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from database import db
from ._common import clean, now_iso

router = APIRouter(tags=["workspace"])


class ActiveIn(BaseModel):
    space_slug: Optional[str] = None


@router.get("/workspace/spaces")
async def spaces(me: dict = Depends(get_current_user)):
    slugs = [m["org_slug"] async for m in db.memberships.find({"user_id": me["id"], "status": "approved"})]
    orgs = [clean(o) async for o in db.organizations.find({"slug": {"$in": slugs}}, {"slug": 1, "name": 1, "logo_url": 1, "accent_color": 1, "type": 1, "region": 1})]
    active = me.get("active_space_slug")
    return {"spaces": [{**o, "is_active": o["slug"] == active} for o in orgs], "active": active}


@router.post("/workspace/active")
async def set_active(body: ActiveIn, me: dict = Depends(get_current_user)):
    if body.space_slug:
        m = await db.memberships.find_one({"user_id": me["id"], "org_slug": body.space_slug, "status": "approved"})
        if not m:
            raise HTTPException(status_code=403, detail="You are not a member of that space")
    await db.users.update_one({"id": me["id"]}, {"$set": {"active_space_slug": body.space_slug, "updated_at": now_iso()}})
    return {"ok": True, "active": body.space_slug}


@router.get("/workspace/{slug}/summary")
async def summary(slug: str):
    org = await db.organizations.find_one({"slug": slug})
    if not org:
        raise HTTPException(status_code=404, detail="Space not found")
    return {
        "space": clean(org),
        "members": await db.memberships.count_documents({"org_slug": slug, "status": "approved"}),
        "events": await db.events.count_documents({"space_slug": slug}),
        "resources": await db.resources.count_documents({"space_slug": slug}),
        "open_requests": await db.support_requests.count_documents({"space_slug": slug, "status": "open"}),
    }
