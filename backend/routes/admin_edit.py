"""Admin in-place editing: the admin sees the member portal and edits content directly on the page."""
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import require_role
from database import db
from ._common import audit, now_iso
from .announcements import AnnouncementIn
from .events import EventIn, TicketTier, _norm_tiers
from .portal import _apply_profile_fields, mirror_fields
from .resources import ResourceIn

router = APIRouter(tags=["admin-edit"])

KINDS = {
    "events": ("events", EventIn, "event"),
    "resources": ("resources", ResourceIn, "resource"),
    "announcements": ("announcements", AnnouncementIn, "announcement"),
}
EXTRA = {"status", "is_featured"}


class Patch(BaseModel):
    values: Dict[str, Any]


@router.patch("/admin/content/{kind}/{item_id}")
async def edit_content(kind: str, item_id: str, body: Patch, me: dict = Depends(require_role("admin"))):
    if kind not in KINDS:
        raise HTTPException(status_code=404, detail="Unknown content type")
    cname, model, label = KINDS[kind]
    coll = getattr(db, cname)
    allowed = set(model.model_fields) | EXTRA
    patch = {k: v for k, v in body.values.items() if k in allowed}
    for k in ("tags", "agenda", "audience"):
        if isinstance(patch.get(k), str):
            patch[k] = [x.strip() for x in patch[k].replace("\n", ",").split(",") if x.strip()]
    for k in ("price_cents", "capacity"):
        if k in patch:
            try:
                patch[k] = int(patch[k]) if patch[k] not in (None, "") else None
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail=f"{k} must be a number")

    if kind == "events":
        existing = await coll.find_one({"id": item_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        if "ticket_tiers" in patch:
            # Price and capacity are always derived from the tiers themselves when tiers are
            # edited, so what an admin sets here can never drift from what attendees can buy.
            try:
                tiers = _norm_tiers([TicketTier(**t) for t in (patch.get("ticket_tiers") or [])])
            except (TypeError, ValueError) as exc:
                raise HTTPException(status_code=400, detail="Invalid ticket tiers") from exc
            patch["ticket_tiers"] = tiers
            if tiers:
                prices = [t["price_cents"] for t in tiers]
                caps = [t["capacity"] for t in tiers]
                patch["price_cents"] = min(prices)
                patch["capacity"] = None if any(c is None for c in caps) else sum(caps)
            else:
                patch["price_cents"] = None
                patch["capacity"] = None
        elif "capacity" in patch and (existing.get("ticket_tiers") or []):
            # Capacity is derived from tier capacities once an event has tiers; drop a stray
            # edit to the flat field so it can't quietly disagree with the tiers.
            patch.pop("capacity", None)

    if not patch:
        raise HTTPException(status_code=400, detail="Nothing to update")
    patch["updated_at"] = now_iso()
    res = await coll.update_one({"id": item_id}, {"$set": patch})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Not found")
    await audit(me["id"], f"{label}.edited", label, item_id, {"fields": [k for k in patch if k != "updated_at"]})
    return await coll.find_one({"id": item_id}, {"_id": 0})


@router.delete("/admin/content/{kind}/{item_id}")
async def delete_content(kind: str, item_id: str, me: dict = Depends(require_role("admin"))):
    if kind not in KINDS:
        raise HTTPException(status_code=404, detail="Unknown content type")
    cname, _, label = KINDS[kind]
    coll = getattr(db, cname)
    res = await coll.delete_one({"id": item_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Not found")
    await audit(me["id"], f"{label}.deleted", label, item_id)
    return {"ok": True}


@router.patch("/admin/users/{uid}/profile")
async def edit_member_profile(uid: str, body: Patch, me: dict = Depends(require_role("admin"))):
    patch = _apply_profile_fields(body.values)
    if not patch:
        raise HTTPException(status_code=400, detail="Nothing to update")
    mirror_fields(patch)
    patch["updated_at"] = now_iso()
    res = await db.users.update_one({"id": uid}, {"$set": patch})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Member not found")
    await audit(me["id"], "profile.edited_by_admin", "user", uid, {"fields": [k for k in patch if k != "updated_at"]})
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
