from datetime import datetime, timezone
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel

from auth import get_current_user, get_current_user_optional
from database import db
from ._common import check_image, HIDDEN_STATUSES, approved_q, audience_ok, audit, clean, now_iso

router = APIRouter(tags=["events"])


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _tier_sold(event_id: str) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    async for p in db.payments.find({"kind": "ticket", "event_id": event_id}):
        tid = p.get("tier_id") or "_general"
        counts[tid] = counts.get(tid, 0) + 1
    return counts


async def _tier_summary(e: Dict[str, Any]) -> Dict[str, Any]:
    tiers = e.get("ticket_tiers") or []
    if not tiers:
        return {"has_tiers": False}
    sold = await _tier_sold(e["id"])
    out = []
    for t in tiers:
        n = sold.get(t["id"], 0)
        out.append({**t, "sold": n, "sold_out": t.get("capacity") is not None and n >= t["capacity"]})
    prices = [t["price_cents"] for t in tiers]
    return {"has_tiers": True, "min_price_cents": min(prices), "max_price_cents": max(prices),
            "tiers": out, "all_sold_out": all(t["sold_out"] for t in out)}


@router.get("/events")
async def list_events(
    request: Request,
    upcoming: Optional[bool] = None,
    space: Optional[str] = None,
    source: Optional[str] = None,
    category: Optional[str] = None,
    q: Optional[str] = None,
    saved: Optional[bool] = None,
):
    query = approved_q()
    if upcoming is True:
        query["starts_at"] = {"$gte": _now()}
    elif upcoming is False:
        query["starts_at"] = {"$lt": _now()}
    if space and space != "all":
        query["space_slug"] = space
    if source and source != "all":
        query["source"] = source
    if category and category != "all":
        query["category"] = category
    if q:
        rx = {"$regex": q, "$options": "i"}
        query["$or"] = [{"title": rx}, {"description": rx}, {"host": rx}, {"tags": rx}]
    me = await get_current_user_optional(request)
    if saved and me:
        query["saved_by"] = me["id"]
    out = []
    async for e in db.events.find(query).sort("starts_at", 1):
        e = clean(e)
        if not audience_ok(e, me):
            continue
        prev = []
        for uid in (e.get("attendee_ids") or [])[:4]:
            u = await db.users.find_one({"id": uid})
            if u and not u.get("hidden_from_directory"):
                prev.append({"id": uid, "name": u.get("name"), "avatar_url": u.get("avatar_url")})
        e["attendee_preview"] = prev
        e["tier_summary"] = await _tier_summary(e)
        e["my_rsvp"] = (e.get("rsvps") or {}).get(me["id"]) if me else None
        e["attendee_count"] = len(e.get("attendee_ids") or [])
        e["is_attending"] = bool(me and me["id"] in (e.get("attendee_ids") or []))
        e["is_past"] = (e.get("starts_at") or "") < _now()
        e["is_saved"] = bool(me and me["id"] in (e.get("saved_by") or []))
        e["save_count"] = len(e.get("saved_by") or [])
        out.append(e)
    return out


class TicketTier(BaseModel):
    id: Optional[str] = None
    name: str
    price_cents: int = 0
    capacity: Optional[int] = None  # None = unlimited


class EventIn(BaseModel):
    title: str
    description: Optional[str] = None
    starts_at: str
    ends_at: Optional[str] = None
    location: Optional[str] = None
    virtual_url: Optional[str] = None
    host: Optional[str] = None
    category: str = "Meetup"
    tags: List[str] = []
    agenda: List[str] = []
    prep: Optional[str] = None
    audience: List[str] = []
    image_url: Optional[str] = None
    capacity: Optional[int] = None
    price_cents: Optional[int] = None
    currency: Optional[str] = None
    url: Optional[str] = None
    ticket_tiers: List[TicketTier] = []


def _norm_tiers(tiers: List["TicketTier"]) -> List[Dict[str, Any]]:
    out = []
    for t in tiers:
        d = t.model_dump()
        d["id"] = d.get("id") or str(uuid.uuid4())
        d["name"] = (d.get("name") or "General admission").strip()[:60]
        d["price_cents"] = max(0, int(d.get("price_cents") or 0))
        if d.get("capacity") is not None:
            d["capacity"] = max(0, int(d["capacity"]))
        out.append(d)
    return out


class RsvpIn(BaseModel):
    status: Optional[str] = None  # yes | maybe | no ; omitted = toggle yes


class FeedbackIn(BaseModel):
    rating: int
    note: Optional[str] = None


@router.post("/events", status_code=201)
async def create_event(body: EventIn, me: dict = Depends(get_current_user)):
    """Admin-only: members no longer suggest events for review (see Events.jsx/EventDetail.jsx --
    the "Suggest an event" entry point was removed for members, and this enforces that server-side
    too, not just in the UI)."""
    if me.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can add events")
    tiers = _norm_tiers(body.ticket_tiers)
    payload = body.model_dump()
    payload["ticket_tiers"] = tiers
    if tiers:
        prices = [t["price_cents"] for t in tiers]
        caps = [t["capacity"] for t in tiers]
        payload["price_cents"] = min(prices) if prices else None
        payload["capacity"] = None if any(c is None for c in caps) else sum(caps)
    doc = {"id": str(uuid.uuid4()), **payload, "cover_url": check_image(body.image_url), "source": "community", "attendee_ids": [], "rsvps": {}, "saved_by": [],
           "status": "approved", "submitted_by": me["id"], "submitted_by_name": me.get("name"), "created_at": now_iso()}
    await db.events.insert_one(dict(doc))
    await audit(me["id"], "event.created", "event", doc["id"])
    return doc


@router.get("/events/{event_id}")
async def get_event(event_id: str, request: Request):
    e = await db.events.find_one({"id": event_id})
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    me = await get_current_user_optional(request)
    e = clean(e)
    if e.get("status") in HIDDEN_STATUSES and not (me and (me.get("role") == "admin" or me["id"] == e.get("submitted_by"))):
        raise HTTPException(status_code=404, detail="Event not found")
    ids = e.get("attendee_ids") or []
    attendees = []
    if ids:
        async for u in db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "avatar_url": 1, "role": 1, "title": 1, "company": 1}):
            attendees.append(u)
    e["attendees"] = attendees
    e["attendee_count"] = len(ids)
    e["tier_summary"] = await _tier_summary(e)
    e["maybe_count"] = sum(1 for v in (e.get("rsvps") or {}).values() if v == "maybe")
    e["is_attending"] = bool(me and me["id"] in ids)
    e["my_rsvp"] = (e.get("rsvps") or {}).get(me["id"]) if me else None
    e["is_past"] = (e.get("starts_at") or "") < _now()
    e["attended"] = bool(me and me["id"] in (e.get("attended_ids") or []))
    e["is_saved"] = bool(me and me["id"] in (e.get("saved_by") or []))
    e["save_count"] = len(e.get("saved_by") or [])
    tags = {t.lower() for t in (e.get("tags") or [])} | {(e.get("category") or "").lower()}
    related = []
    async for r in db.resources.find(approved_q()).limit(60):
        if r.get("id") in (e.get("related_resource_ids") or []) or tags & {t.lower() for t in (r.get("tags") or [])}:
            related.append({k: r.get(k) for k in ("id", "title", "category", "url", "format", "type")})
    e["related_resources"] = related[:4]
    if me:
        e["feedback_given"] = bool(await db.event_feedback.find_one({"event_id": event_id, "user_id": me["id"]}))
    return e


@router.post("/events/{event_id}/rsvp")
async def rsvp(event_id: str, body: RsvpIn = RsvpIn(), me: dict = Depends(get_current_user)):
    e = await db.events.find_one({"id": event_id})
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    rsvps = dict(e.get("rsvps") or {})
    ids = list(e.get("attendee_ids") or [])
    status = body.status
    if status is None:  # legacy toggle
        status = None if me["id"] in ids else "yes"
    if status not in (None, "yes", "no", "maybe"):
        raise HTTPException(status_code=400, detail="RSVP must be yes, maybe or no")
    if status == "yes" and me["id"] not in ids and e.get("price_cents") and me.get("role") != "admin":
        if not await db.payments.find_one({"kind": "ticket", "event_id": event_id, "user_id": me["id"]}):
            raise HTTPException(status_code=402, detail="This event needs a ticket. Buy one to reserve your spot.")
    if status == "yes" and me["id"] not in ids:
        cap = e.get("capacity")
        if cap is not None and len(ids) >= cap:
            raise HTTPException(status_code=409, detail="Event is full")
        ids.append(me["id"])
    if status != "yes" and me["id"] in ids:
        ids.remove(me["id"])
    if status is None:
        rsvps.pop(me["id"], None)
    else:
        rsvps[me["id"]] = status
    await db.events.update_one({"id": event_id}, {"$set": {"attendee_ids": ids, "rsvps": rsvps}})
    await audit(me["id"], "event.rsvp", "event", event_id, {"status": status})
    return {"ok": True, "is_attending": status == "yes", "my_rsvp": status, "attendee_count": len(ids), "event_id": event_id}


@router.post("/events/{event_id}/save")
async def toggle_save(event_id: str, me: dict = Depends(get_current_user)):
    """Bookmark an event, same on/off toggle as a perk's save button (see resources.py) -- feeds the
    Saved section of /profile alongside saved perks and saved members."""
    e = await db.events.find_one({"id": event_id})
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    saved_by = list(e.get("saved_by") or [])
    if me["id"] in saved_by:
        saved_by.remove(me["id"])
        saved = False
    else:
        saved_by.append(me["id"])
        saved = True
    await db.events.update_one({"id": event_id}, {"$set": {"saved_by": saved_by}})
    return {"ok": True, "is_saved": saved, "save_count": len(saved_by)}


@router.get("/events/{event_id}/ics")
async def event_ics(event_id: str):
    e = await db.events.find_one({"id": event_id})
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")

    def fmt(iso):
        try:
            return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        except Exception:  # noqa: BLE001
            return None
    start = fmt(e.get("starts_at") or "")
    end = fmt(e.get("ends_at") or "") or start
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Pathwai//Community//EN", "BEGIN:VEVENT", f"UID:{event_id}@pathwai",
             f"DTSTAMP:{fmt(_now())}", f"DTSTART:{start}", f"DTEND:{end}", f"SUMMARY:{e.get('title', '')}",
             f"LOCATION:{e.get('virtual_url') or e.get('location') or ''}",
             "DESCRIPTION:" + (e.get("description") or "").replace("\n", " ")[:500], "END:VEVENT", "END:VCALENDAR"]
    return Response("\r\n".join(lines), media_type="text/calendar",
                    headers={"Content-Disposition": f'attachment; filename="{event_id}.ics"'})


@router.post("/events/{event_id}/view", status_code=201)
async def track_view(event_id: str, request: Request):
    """One row per page load, used only to gauge interest vs ticket sales. Not gated on auth."""
    if not await db.events.find_one({"id": event_id}):
        raise HTTPException(status_code=404, detail="Event not found")
    me = await get_current_user_optional(request)
    await db.event_views.insert_one({"id": str(uuid.uuid4()), "event_id": event_id, "user_id": me["id"] if me else None, "at": _now()})
    return {"ok": True}


@router.post("/events/{event_id}/feedback")
async def event_feedback(event_id: str, body: FeedbackIn, me: dict = Depends(get_current_user)):
    if not await db.events.find_one({"id": event_id}):
        raise HTTPException(status_code=404, detail="Event not found")
    await db.event_feedback.update_one({"event_id": event_id, "user_id": me["id"]},
                                       {"$set": {"rating": body.rating, "note": body.note, "created_at": now_iso()}}, upsert=True)
    await audit(me["id"], "event.feedback", "event", event_id, {"rating": body.rating})
    return {"ok": True}
