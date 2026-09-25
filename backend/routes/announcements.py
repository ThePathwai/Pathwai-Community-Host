import uuid
from typing import Optional

from typing import List
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from auth import get_current_user, get_current_user_optional
from database import db
from ._common import check_image, approved_q, audience_ok, audit, clean, now_iso

router = APIRouter(tags=["announcements"])


class AnnouncementIn(BaseModel):
    title: str
    body: str
    priority: Optional[str] = "normal"
    cta_label: Optional[str] = None
    cta_url: Optional[str] = None
    space_slug: Optional[str] = None
    category: str = "Community news"
    audience: List[str] = []
    related_url: Optional[str] = None
    image_url: Optional[str] = None


@router.get("/announcements")
async def list_announcements(request: Request, space: Optional[str] = None, limit: int = 50):
    q = approved_q({"space_slug": space} if space and space != "all" else {})
    me = await get_current_user_optional(request)
    out = [clean(a) async for a in db.announcements.find(q).sort("published_at", -1).limit(limit)]
    return [a for a in out if audience_ok(a, me)]


@router.post("/announcements", status_code=201)
async def create_announcement(body: AnnouncementIn, me: dict = Depends(get_current_user)):
    is_admin = me.get("role") == "admin"
    img = check_image(body.image_url)
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "image_url": img, "source": "community", "author": me.get("name"),
           "author_id": me["id"], "published_at": now_iso(), "status": "approved" if is_admin else "pending",
           "submitted_by": me["id"], "submitted_by_name": me.get("name")}
    await db.announcements.insert_one(dict(doc))
    await audit(me["id"], "announcement.created" if is_admin else "announcement.submitted", "announcement", doc["id"])
    return doc
