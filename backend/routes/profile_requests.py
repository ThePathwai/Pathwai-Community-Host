import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

import profile_requests as pr
from auth import get_current_user, require_role
from database import db
from ._common import audit, now_iso

router = APIRouter(tags=["profile-requests"])


class CreateIn(BaseModel):
    user_id: str
    kind: str


class SubmitIn(BaseModel):
    response: Dict[str, Any]


async def _own(request_id: str, me: dict):
    req = await db.profile_requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req["user_id"] != me["id"] and me.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not your request")
    return req


@router.get("/profile-requests/kinds")
async def kinds():
    return {"kinds": pr.list_request_kinds()}


@router.get("/me/profile-requests")
async def mine(status: Optional[str] = "pending", me: dict = Depends(get_current_user)):
    st = None if status in (None, "", "all") else status
    items = await pr.list_for_user(db, me["id"], status=st)
    return {"requests": items, "total": len(items)}


@router.get("/me/profile-requests/count")
async def count(me: dict = Depends(get_current_user)):
    return {"pending": await pr.count_pending(db, me["id"])}


@router.post("/profile-requests", status_code=201)
async def create(body: CreateIn, me: dict = Depends(require_role("admin"))):
    if body.kind not in pr.REQUEST_KINDS:
        raise HTTPException(status_code=400, detail="Unknown request kind")
    doc = {"id": f"pr-{body.user_id}-{body.kind}-{uuid.uuid4().hex[:6]}", "user_id": body.user_id, "kind": body.kind,
           "created_by": me["id"], "created_by_label": "Community team", "status": "pending",
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.profile_requests.insert_one(dict(doc))
    await audit(me["id"], "profile_request.created", "profile_request", doc["id"])
    return pr._serialize(doc)


@router.post("/profile-requests/{request_id}/submit")
async def submit(request_id: str, body: SubmitIn, me: dict = Depends(get_current_user)):
    await _own(request_id, me)
    try:
        out = await pr.submit(db, request_id, body.response)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await audit(me["id"], "profile_request.submitted", "profile_request", request_id, {"fields": out["applied_fields"]})
    return out


@router.post("/profile-requests/{request_id}/dismiss")
async def dismiss(request_id: str, me: dict = Depends(get_current_user)):
    await _own(request_id, me)
    try:
        return await pr.dismiss(db, request_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/profile-requests/{request_id}/extract-pdf")
async def extract_pdf(request_id: str, file: UploadFile = File(...), me: dict = Depends(get_current_user)):
    await _own(request_id, me)
    if not (file.filename or "").lower().endswith(".pdf") and file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Please upload a PDF file.")
    content = await file.read()
    try:
        return await pr.extract_from_pdf(db, request_id, content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
