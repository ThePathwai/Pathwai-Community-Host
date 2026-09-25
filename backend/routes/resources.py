from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from auth import get_current_user, get_current_user_optional
from database import db
import uuid
from typing import List
from pydantic import BaseModel
from ._common import check_image, HIDDEN_STATUSES, approved_q, audience_ok, audit, clean, now_iso

router = APIRouter(tags=["resources"])


@router.get("/resources")
async def list_resources(
    request: Request,
    source: Optional[str] = None,
    category: Optional[str] = None,
    type: Optional[str] = None,
    space: Optional[str] = None,
    q: Optional[str] = None,
    featured: Optional[bool] = None,
    saved: Optional[bool] = None,
    limit: int = 200,
):
    query = approved_q()
    if source and source != "all":
        query["source"] = source
    if category and category != "all":
        query["category"] = category
    if type and type != "all":
        query["type"] = type
    if space and space != "all":
        query["space_slug"] = space
    if featured:
        query["is_featured"] = True
    me = await get_current_user_optional(request)
    if saved and me:
        query["saved_by"] = me["id"]
    if q:
        rx = {"$regex": q, "$options": "i"}
        query["$or"] = [{"title": rx}, {"description": rx}, {"tags": rx}, {"author": rx}]
    out = []
    async for r in db.resources.find(query).sort("published_at", -1).limit(limit):
        r = clean(r)
        if not audience_ok(r, me):
            continue
        r["is_saved"] = bool(me and me["id"] in (r.get("saved_by") or []))
        r["save_count"] = len(r.get("saved_by") or [])
        out.append(r)
    return out


@router.get("/resources/{rid}")
async def get_resource(rid: str, request: Request):
    r = await db.resources.find_one({"$or": [{"id": rid}, {"slug": rid}]})
    if not r:
        raise HTTPException(status_code=404, detail="Resource not found")
    me = await get_current_user_optional(request)
    r = clean(r)
    r["is_saved"] = bool(me and me["id"] in (r.get("saved_by") or []))
    return r


@router.post("/resources/{rid}/save")
async def toggle_save(rid: str, me: dict = Depends(get_current_user)):
    r = await db.resources.find_one({"id": rid})
    if not r:
        raise HTTPException(status_code=404, detail="Resource not found")
    saved_by = list(r.get("saved_by") or [])
    if me["id"] in saved_by:
        saved_by.remove(me["id"])
        saved = False
    else:
        saved_by.append(me["id"])
        saved = True
    await db.resources.update_one({"id": rid}, {"$set": {"saved_by": saved_by}})
    return {"ok": True, "is_saved": saved, "save_count": len(saved_by)}


class ResourceIn(BaseModel):
    title: str
    url: Optional[str] = None
    category: str = "Guide"
    format: Optional[str] = "Link"
    description: Optional[str] = None
    tags: List[str] = []
    audience: List[str] = []
    perk_value: Optional[str] = None
    how_to_claim: Optional[str] = None
    image_url: Optional[str] = None


@router.post("/resources", status_code=201)
async def submit_resource(body: ResourceIn, me: dict = Depends(get_current_user)):
    is_admin = me.get("role") == "admin"
    img = check_image(body.image_url)
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "cover_url": img, "source": "community", "type": (body.format or "link").lower(),
           "author": me.get("name"), "shared_by": {"id": me["id"], "name": me.get("name"), "avatar_url": me.get("avatar_url"), "title": me.get("title")}, "is_featured": False, "saved_by": [], "published_at": now_iso(),
           "status": "approved" if is_admin else "pending", "submitted_by": me["id"], "submitted_by_name": me.get("name")}
    await db.resources.insert_one(dict(doc))
    await audit(me["id"], "resource.created" if is_admin else "resource.submitted", "resource", doc["id"])
    return doc


@router.post("/resources/{rid}/open")
async def track_open(rid: str, me: dict = Depends(get_current_user)):
    """Engagement tracking: which members opened which resources (admin can see usage)."""
    if not await db.resources.find_one({"id": rid}):
        raise HTTPException(status_code=404, detail="Resource not found")
    await db.resources.update_one({"id": rid}, {"$inc": {"open_count": 1}})
    await db.resource_engagement.insert_one({"resource_id": rid, "user_id": me["id"], "at": now_iso()})
    return {"ok": True}
