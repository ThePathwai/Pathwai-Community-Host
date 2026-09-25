from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import connect_requests as cr
from auth import get_current_user
from database import db
from ._common import audit
from .notifications import notify

router = APIRouter(tags=["connect-requests"])


class ConnectIn(BaseModel):
    recipient_id: str
    kind: str = cr.DEFAULT_KIND
    topic: str
    note: Optional[str] = None


class RespondIn(BaseModel):
    status: str


@router.get("/connect-requests/kinds")
async def kinds():
    return {"kinds": [{"kind": k, **v} for k, v in cr.REQUEST_KINDS.items()], "default": cr.DEFAULT_KIND}


@router.post("/connect-requests", status_code=201)
async def create(body: ConnectIn, me: dict = Depends(get_current_user)):
    recipient = await db.users.find_one({"id": body.recipient_id})
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
    try:
        doc = await cr.create(db, sender=me, recipient=recipient, kind=body.kind, topic=body.topic, note=body.note)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await notify(recipient["id"], "connect_request", f"{me.get('name')} {cr.kind_meta(body.kind)['verb']}",
                 body.topic, link="/requests")
    await audit(me["id"], "connect_request.created", "connect_request", doc["id"])
    return doc


@router.get("/connect-requests")
async def list_mine(scope: str = "all", me: dict = Depends(get_current_user)):
    items = await cr.list_for_user(db, me["id"], scope=scope)
    return {"requests": items, "total": len(items)}


@router.post("/connect-requests/{request_id}/respond")
async def respond(request_id: str, body: RespondIn, me: dict = Depends(get_current_user)):
    existing = await db.connect_requests.find_one({"id": request_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Request not found")
    if existing["recipient_id"] != me["id"]:
        raise HTTPException(status_code=403, detail="Only the recipient can respond")
    try:
        return await cr.respond(db, request_id, body.status)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
