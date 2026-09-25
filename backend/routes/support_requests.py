import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from auth import get_current_user, get_current_user_optional
from database import db
from ._common import check_image, audit, clean, lower_set, now_iso
from .notifications import notify

router = APIRouter(tags=["support-requests"])


async def ensure_indexes() -> None:
    await db.support_requests.create_index("status")
    await db.support_requests.create_index([("space_slug", 1), ("created_at", -1)])


class RequestIn(BaseModel):
    title: str
    description: Optional[str] = None
    category: str = "other"
    tags: List[str] = []
    urgency: str = "normal"
    space_slug: Optional[str] = None
    image_url: Optional[str] = None


class RequestPatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    urgency: Optional[str] = None
    status: Optional[str] = None


@router.get("/support-requests")
async def list_requests(
    request: Request,
    space: Optional[str] = None,
    status: Optional[str] = "open",
    category: Optional[str] = None,
    urgency: Optional[str] = None,
    mine: bool = False,
    q: Optional[str] = None,
):
    me = await get_current_user_optional(request)
    query = {}
    if status and status != "all":
        query["status"] = status
    if space and space != "all":
        query["space_slug"] = space
    if category and category != "all":
        query["category"] = category
    if urgency and urgency != "all":
        query["urgency"] = urgency
    if mine and me:
        query["user_id"] = me["id"]
    else:
        query["to_team"] = {"$ne": True}
    if q:
        rx = {"$regex": q, "$options": "i"}
        query["$or"] = [{"title": rx}, {"description": rx}, {"tags": rx}]
    items = [clean(r) async for r in db.support_requests.find(query).sort("created_at", -1).limit(200)]
    for r in items:
        r["helper_count"] = len(r.get("helpers") or [])
        r["i_offered"] = bool(me and me["id"] in (r.get("helpers") or []))
    return items


@router.post("/support-requests", status_code=201)
async def create_request(body: RequestIn, me: dict = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()), "user_id": me["id"],
        "user_snapshot": {k: me.get(k) for k in ("id", "name", "avatar_url", "title", "company")},
        "space_slug": body.space_slug, "title": body.title.strip(), "description": body.description,
        "category": body.category, "tags": body.tags, "urgency": body.urgency, "image_url": check_image(body.image_url), "status": "open",
        "is_featured": False, "helpers": [], "created_at": now_iso(), "updated_at": now_iso(), "resolved_at": None,
    }
    await db.support_requests.insert_one(dict(doc))
    await audit(me["id"], "support_request.created", "support_request", doc["id"])
    # value-match: ping members whose offers overlap the request
    need = lower_set(body.tags, body.category, body.title.split())
    async for u in db.users.find({"id": {"$ne": me["id"]}}):
        offers = lower_set(u.get("services_offered"), u.get("topics_can_advise_on"), u.get("expertise"))
        hits = [o for o in offers if any(o == n or (len(o) > 3 and o in n) or (len(n) > 3 and n in o) for n in need)]
        if hits:
            await notify(u["id"], "value_match", f"You could help: {doc['title']}",
                         f"Matches your offer: {', '.join(hits[:3])}", link="/requests", meta={"request_id": doc["id"]})
    return doc


@router.get("/support-requests/{rid}")
async def get_request(rid: str):
    r = await db.support_requests.find_one({"id": rid})
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    return clean(r)


@router.patch("/support-requests/{rid}")
async def patch_request(rid: str, body: RequestPatch, me: dict = Depends(get_current_user)):
    r = await db.support_requests.find_one({"id": rid})
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    if r["user_id"] != me["id"] and me.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the author can edit")
    patch = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if patch.get("status") == "resolved":
        patch["resolved_at"] = now_iso()
    patch["updated_at"] = now_iso()
    await db.support_requests.update_one({"id": rid}, {"$set": patch})
    return clean(await db.support_requests.find_one({"id": rid}))


@router.post("/support-requests/{rid}/offer-help")
async def offer_help(rid: str, me: dict = Depends(get_current_user)):
    r = await db.support_requests.find_one({"id": rid})
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    if r["user_id"] == me["id"]:
        raise HTTPException(status_code=400, detail="You can't offer help on your own request")
    helpers = list(r.get("helpers") or [])
    if me["id"] not in helpers:
        helpers.append(me["id"])
        await db.support_requests.update_one({"id": rid}, {"$set": {"helpers": helpers}})
        await notify(r["user_id"], "help_offer", f"{me.get('name')} offered to help", r["title"], link="/requests")
    return {"ok": True, "helper_count": len(helpers)}


@router.delete("/support-requests/{rid}")
async def delete_request(rid: str, me: dict = Depends(get_current_user)):
    r = await db.support_requests.find_one({"id": rid})
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    if r["user_id"] != me["id"] and me.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the author can delete")
    await db.support_requests.delete_one({"id": rid})
    return {"ok": True}
