"""Classes: a bookable schedule for gyms, studios and clubs.

Members browse upcoming classes, book a spot (or join the waitlist when it's full), cancel, and -- once a class
they booked has finished -- rate it and its instructor and leave a review. Admins manage instructors and classes
(including weekly repeats). Everything lives in the community's own database: `instructors`, `classes`,
`class_bookings`, `class_reviews`.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel

from auth import get_current_user
from database import db
from ._common import audit, check_image, clean, now_iso

router = APIRouter(tags=["classes"])

MAX_SERIES_WEEKS = 26
LEVELS = ["All levels", "Beginner", "Intermediate", "Advanced"]


# --------------------------------------------------------------------------- helpers
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse(s: Optional[str]) -> datetime:
    try:
        d = datetime.fromisoformat((s or "").replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="That date and time isn't valid.")
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _iso(d: datetime) -> str:
    return d.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _ends(c: Dict[str, Any]) -> datetime:
    return _parse(c["starts_at"]) + timedelta(minutes=int(c.get("duration_min") or 45))


def _is_admin(me: dict) -> bool:
    return me.get("role") == "admin"


def _need_admin(me: dict) -> None:
    if not _is_admin(me):
        raise HTTPException(status_code=403, detail="Only admins can do that.")


async def _class_or_404(cid: str) -> Dict[str, Any]:
    c = await db.classes.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Class not found.")
    return c


def _stars(rows: List[Dict[str, Any]], key: str) -> Dict[str, Dict[str, Any]]:
    """{id: {avg, count}} over review rows, grouped by `key` (series_id or instructor_id)."""
    acc: Dict[str, List[int]] = {}
    for r in rows:
        k = r.get(key)
        v = r.get("rating") if key == "series_id" else r.get("instructor_rating")
        if k and v:
            acc.setdefault(k, []).append(int(v))
    return {k: {"avg": round(sum(v) / len(v), 1), "count": len(v)} for k, v in acc.items()}


NO_RATING = {"avg": None, "count": 0}


async def _decorate(classes: List[Dict[str, Any]], me: dict) -> List[Dict[str, Any]]:
    """Adds who teaches it, how full it is, my booking and its rating to each class."""
    if not classes:
        return []
    ids = [c["id"] for c in classes]
    series = list({c["series_id"] for c in classes})
    inst_ids = list({c["instructor_id"] for c in classes if c.get("instructor_id")})
    insts = {i["id"]: i async for i in db.instructors.find({"id": {"$in": inst_ids}})} if inst_ids else {}
    by_class: Dict[str, List[Dict[str, Any]]] = {}
    async for b in db.class_bookings.find({"class_id": {"$in": ids}}).sort("created_at", 1):
        by_class.setdefault(b["class_id"], []).append(b)
    ratings = _stars([r async for r in db.class_reviews.find({"series_id": {"$in": series}})], "series_id")
    now = _now()
    out = []
    for c in classes:
        c = clean(c)
        rows = by_class.get(c["id"], [])
        booked = [b for b in rows if b["status"] == "booked"]
        wait = [b for b in rows if b["status"] == "waitlist"]
        mine = next((b for b in rows if b["user_id"] == me["id"]), None)
        cap = c.get("capacity")
        inst = insts.get(c.get("instructor_id"))
        end = _ends(c)
        preview = []
        for b in booked[:4]:
            u = await db.users.find_one({"id": b["user_id"]}, {"_id": 0, "id": 1, "name": 1, "avatar_url": 1, "hidden_from_directory": 1})
            if u and not u.get("hidden_from_directory"):
                preview.append({"id": u["id"], "name": u.get("name"), "avatar_url": u.get("avatar_url")})
        out.append({
            **c, "ends_at": _iso(end),
            "instructor": {"id": inst["id"], "name": inst["name"], "avatar_url": inst.get("avatar_url")} if inst else None,
            "booked_count": len(booked), "waitlist_count": len(wait),
            "spots_left": None if cap is None else max(0, cap - len(booked)),
            "is_full": cap is not None and len(booked) >= cap,
            "my_status": mine["status"] if mine else None,
            "my_waitlist_position": (wait.index(mine) + 1) if mine and mine["status"] == "waitlist" else None,
            "rating": ratings.get(c["series_id"], NO_RATING),
            "attendee_preview": preview,
            "is_past": end <= now, "has_started": _parse(c["starts_at"]) <= now,
        })
    return out


async def _notify(user_id: str, title: str, body: str, cid: str) -> None:
    from .notifications import notify
    try:
        await notify(user_id, "class", title, body, f"/classes?open={cid}", {"class_id": cid})
    except Exception:  # noqa: BLE001 -- a notification problem must never break a booking
        pass


async def _promote(c: Dict[str, Any]) -> None:
    """Fills any free spots from the waitlist, first come first served, and tells the people who got in."""
    cap = c.get("capacity")
    while True:
        booked = await db.class_bookings.count_documents({"class_id": c["id"], "status": "booked"})
        if cap is not None and booked >= cap:
            return
        nxt = await db.class_bookings.find_one({"class_id": c["id"], "status": "waitlist"}, sort=[("created_at", 1)])
        if not nxt:
            return
        await db.class_bookings.update_one({"id": nxt["id"]}, {"$set": {"status": "booked", "promoted_at": now_iso()}})
        await _notify(nxt["user_id"], f"You're in: {c['title']}", "A spot opened up and you're booked in. Open the class for the time.", c["id"])


# --------------------------------------------------------------------------- instructors
class InstructorIn(BaseModel):
    name: str
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    specialties: List[str] = []


def _inst_doc(body: InstructorIn) -> Dict[str, Any]:
    name = (body.name or "").strip()
    if len(name) < 2 or len(name) > 80:
        raise HTTPException(status_code=400, detail="Give the instructor a name.")
    return {"name": name, "bio": (body.bio or "").strip()[:800], "avatar_url": check_image(body.avatar_url),
            "specialties": [s.strip()[:30] for s in body.specialties if s.strip()][:6]}


@router.get("/classes/instructors")
async def list_instructors(me: dict = Depends(get_current_user)):
    rows = [clean(i) async for i in db.instructors.find({}).sort("name", 1)]
    ratings = _stars([r async for r in db.class_reviews.find({})], "instructor_id")
    now = _iso(_now())
    for i in rows:
        i["rating"] = ratings.get(i["id"], NO_RATING)
        i["upcoming_classes"] = await db.classes.count_documents({"instructor_id": i["id"], "status": {"$ne": "cancelled"}, "starts_at": {"$gte": now}})
    return {"instructors": rows}


@router.post("/classes/instructors", status_code=201)
async def create_instructor(body: InstructorIn, me: dict = Depends(get_current_user)):
    _need_admin(me)
    doc = {"id": str(uuid.uuid4()), **_inst_doc(body), "created_at": now_iso()}
    await db.instructors.insert_one(dict(doc))
    await audit(me["id"], "instructor.created", "instructor", doc["id"])
    return doc


@router.patch("/classes/instructors/{iid}")
async def update_instructor(iid: str, body: InstructorIn, me: dict = Depends(get_current_user)):
    _need_admin(me)
    if not await db.instructors.find_one({"id": iid}):
        raise HTTPException(status_code=404, detail="Instructor not found.")
    await db.instructors.update_one({"id": iid}, {"$set": {**_inst_doc(body), "updated_at": now_iso()}})
    await audit(me["id"], "instructor.updated", "instructor", iid)
    return clean(await db.instructors.find_one({"id": iid}))


@router.delete("/classes/instructors/{iid}")
async def delete_instructor(iid: str, me: dict = Depends(get_current_user)):
    """Removes the instructor. Their classes stay on the schedule, with no instructor named."""
    _need_admin(me)
    if not await db.instructors.find_one({"id": iid}):
        raise HTTPException(status_code=404, detail="Instructor not found.")
    await db.instructors.delete_one({"id": iid})
    await db.classes.update_many({"instructor_id": iid}, {"$set": {"instructor_id": None}})
    await audit(me["id"], "instructor.deleted", "instructor", iid)
    return {"ok": True}


# --------------------------------------------------------------------------- classes
class ClassIn(BaseModel):
    title: str
    description: Optional[str] = None
    instructor_id: Optional[str] = None
    starts_at: str
    duration_min: int = 45
    location: Optional[str] = None
    capacity: Optional[int] = None
    level: str = "All levels"
    category: Optional[str] = None
    repeat_weeks: int = 0          # also add the same class on each of the next N weeks
    tz: Optional[str] = None       # the admin's time zone, so a weekly repeat keeps the same clock time across daylight saving


async def _check_class(body: ClassIn) -> Dict[str, Any]:
    title = (body.title or "").strip()
    if len(title) < 2 or len(title) > 80:
        raise HTTPException(status_code=400, detail="Give the class a name.")
    if not 10 <= body.duration_min <= 240:
        raise HTTPException(status_code=400, detail="A class runs between 10 and 240 minutes.")
    if body.capacity is not None and not 1 <= body.capacity <= 500:
        raise HTTPException(status_code=400, detail="Spots must be between 1 and 500, or leave it blank for no limit.")
    if body.level not in LEVELS:
        raise HTTPException(status_code=400, detail="Pick a level from the list.")
    if body.instructor_id and not await db.instructors.find_one({"id": body.instructor_id}):
        raise HTTPException(status_code=400, detail="That instructor doesn't exist.")
    return {"title": title, "description": (body.description or "").strip()[:2000], "instructor_id": body.instructor_id or None,
            "duration_min": body.duration_min, "location": (body.location or "").strip()[:120], "capacity": body.capacity,
            "level": body.level, "category": (body.category or "").strip()[:40] or None}


@router.get("/classes")
async def list_classes(days: int = Query(14, ge=1, le=60), start: Optional[str] = None, instructor: Optional[str] = None,
                       category: Optional[str] = None, me: dict = Depends(get_current_user)):
    """Upcoming classes (default: the next two weeks), soonest first."""
    since = _parse(start) if start else _now() - timedelta(minutes=30)  # a class that just started can still show up
    q: Dict[str, Any] = {"starts_at": {"$gte": _iso(since), "$lt": _iso(since + timedelta(days=days))}, "status": {"$ne": "cancelled"}}
    if instructor:
        q["instructor_id"] = instructor
    if category:
        q["category"] = category
    rows = [c async for c in db.classes.find(q).sort("starts_at", 1)]
    cats = sorted({c for c in await db.classes.distinct("category") if c})
    return {"classes": await _decorate(rows, me), "categories": cats, "levels": LEVELS}


@router.get("/classes/mine")
async def my_classes(me: dict = Depends(get_current_user)):
    """My bookings and waitlist spots (upcoming) and the classes I've been to (past), with my review of each."""
    bookings = [b async for b in db.class_bookings.find({"user_id": me["id"]})]
    if not bookings:
        return {"upcoming": [], "past": []}
    by_id = {b["class_id"]: b for b in bookings}
    rows = [c async for c in db.classes.find({"id": {"$in": list(by_id)}}).sort("starts_at", 1)]
    dec = await _decorate(rows, me)
    reviews = {r["class_id"]: clean(r) async for r in db.class_reviews.find({"user_id": me["id"]})}
    upcoming, past = [], []
    for c in dec:
        if c["status"] == "cancelled":
            continue
        if c["is_past"]:
            if by_id[c["id"]]["status"] == "booked":
                past.append({**c, "my_review": reviews.get(c["id"])})
        else:
            upcoming.append(c)
    past.sort(key=lambda c: c["starts_at"], reverse=True)
    return {"upcoming": upcoming, "past": past[:60]}


@router.get("/classes/reviews")
async def recent_reviews(limit: int = Query(30, ge=1, le=100), me: dict = Depends(get_current_user)):
    """Admins: the latest reviews across every class, to see what members think."""
    _need_admin(me)
    rows = [clean(r) async for r in db.class_reviews.find({}).sort("created_at", -1).limit(limit)]
    for r in rows:
        c = await db.classes.find_one({"id": r["class_id"]}, {"title": 1, "starts_at": 1})
        i = await db.instructors.find_one({"id": r.get("instructor_id")}, {"name": 1}) if r.get("instructor_id") else None
        r["class_title"] = c.get("title") if c else "A class"
        r["class_starts_at"] = c.get("starts_at") if c else None
        r["instructor_name"] = i.get("name") if i else None
    return {"reviews": rows}


@router.post("/classes", status_code=201)
async def create_class(body: ClassIn, me: dict = Depends(get_current_user)):
    _need_admin(me)
    base = await _check_class(body)
    if not 0 <= body.repeat_weeks <= MAX_SERIES_WEEKS:
        raise HTTPException(status_code=400, detail=f"A class can repeat for up to {MAX_SERIES_WEEKS} more weeks.")
    first = _parse(body.starts_at)
    try:
        zone = ZoneInfo(body.tz) if body.tz else timezone.utc
    except Exception:  # noqa: BLE001
        zone = timezone.utc
    local = first.astimezone(zone)
    series_id = str(uuid.uuid4())
    made = []
    for n in range(body.repeat_weeks + 1):
        when = (local + timedelta(weeks=n)) if zone is timezone.utc else (local.replace(tzinfo=None) + timedelta(weeks=n)).replace(tzinfo=zone)
        made.append({"id": str(uuid.uuid4()), "series_id": series_id, **base, "starts_at": _iso(when), "status": "scheduled",
                     "created_by": me["id"], "created_at": now_iso()})
    await db.classes.insert_many([dict(c) for c in made])
    await audit(me["id"], "class.created", "class", made[0]["id"], {"weeks": body.repeat_weeks + 1})
    return {"ok": True, "created": len(made), "class": clean(made[0])}


@router.get("/classes/{cid}")
async def get_class(cid: str, me: dict = Depends(get_current_user)):
    c = await _class_or_404(cid)
    (dec,) = await _decorate([c], me)
    reviews = []
    async for r in db.class_reviews.find({"series_id": c["series_id"]}).sort("created_at", -1).limit(20):
        r = clean(r)
        u = await db.users.find_one({"id": r["user_id"]}, {"_id": 0, "name": 1, "avatar_url": 1})
        reviews.append({"id": r["id"], "rating": r["rating"], "instructor_rating": r.get("instructor_rating"), "text": r.get("text"),
                        "created_at": r["created_at"], "mine": r["user_id"] == me["id"],
                        "name": (u or {}).get("name") or "A member", "avatar_url": (u or {}).get("avatar_url")})
    mine = await db.class_reviews.find_one({"class_id": cid, "user_id": me["id"]})
    booked = await db.class_bookings.find_one({"class_id": cid, "user_id": me["id"], "status": "booked"})
    dec["reviews"] = reviews
    dec["my_review"] = clean(mine)
    dec["can_review"] = bool(booked and dec["is_past"] and c.get("status") != "cancelled")
    if _is_admin(me):
        roster = []
        async for b in db.class_bookings.find({"class_id": cid}).sort("created_at", 1):
            u = await db.users.find_one({"id": b["user_id"]}, {"_id": 0, "name": 1, "avatar_url": 1})
            roster.append({"user_id": b["user_id"], "status": b["status"], "name": (u or {}).get("name") or "A member", "avatar_url": (u or {}).get("avatar_url")})
        dec["roster"] = roster
    return dec


@router.patch("/classes/{cid}")
async def update_class(cid: str, body: ClassIn, me: dict = Depends(get_current_user)):
    """Edits this one class (not the whole series). Booked members are told if the time changes."""
    _need_admin(me)
    c = await _class_or_404(cid)
    patch = await _check_class(body)
    new_start = _iso(_parse(body.starts_at))
    moved = new_start != c["starts_at"]
    booked = await db.class_bookings.count_documents({"class_id": cid, "status": "booked"})
    if body.capacity is not None and body.capacity < booked:
        raise HTTPException(status_code=409, detail=f"{booked} people are already booked, so it can't go below {booked} spots.")
    await db.classes.update_one({"id": cid}, {"$set": {**patch, "starts_at": new_start, "updated_at": now_iso()}})
    c = await db.classes.find_one({"id": cid})
    if moved:
        async for b in db.class_bookings.find({"class_id": cid}):
            await _notify(b["user_id"], f"Time changed: {c['title']}", "Open the class to see the new time.", cid)
    await _promote(c)
    await audit(me["id"], "class.updated", "class", cid)
    return clean(c)


@router.delete("/classes/{cid}")
async def cancel_class(cid: str, series: bool = False, me: dict = Depends(get_current_user)):
    """Cancels this class (or, with ?series=true, it and every later class in its series) and tells everyone booked."""
    _need_admin(me)
    c = await _class_or_404(cid)
    q: Dict[str, Any] = {"series_id": c["series_id"], "starts_at": {"$gte": c["starts_at"]}} if series else {"id": cid}
    q["status"] = {"$ne": "cancelled"}
    targets = [x async for x in db.classes.find(q)]
    for t in targets:
        await db.classes.update_one({"id": t["id"]}, {"$set": {"status": "cancelled", "cancelled_at": now_iso()}})
        async for b in db.class_bookings.find({"class_id": t["id"]}):
            await _notify(b["user_id"], f"Cancelled: {t['title']}", "This class has been cancelled and your booking was removed.", t["id"])
        await db.class_bookings.delete_many({"class_id": t["id"]})
    await audit(me["id"], "class.cancelled", "class", cid, {"count": len(targets)})
    return {"ok": True, "cancelled": len(targets)}


# --------------------------------------------------------------------------- booking
@router.post("/classes/{cid}/book")
async def book(cid: str, me: dict = Depends(get_current_user)):
    c = await _class_or_404(cid)
    if c.get("status") == "cancelled":
        raise HTTPException(status_code=409, detail="This class was cancelled.")
    if _parse(c["starts_at"]) <= _now():
        raise HTTPException(status_code=409, detail="This class has already started.")
    have = await db.class_bookings.find_one({"class_id": cid, "user_id": me["id"]})
    if have:
        return {"ok": True, "status": have["status"]}
    booked = await db.class_bookings.count_documents({"class_id": cid, "status": "booked"})
    cap = c.get("capacity")
    status = "waitlist" if cap is not None and booked >= cap else "booked"
    await db.class_bookings.insert_one({"id": str(uuid.uuid4()), "class_id": cid, "series_id": c["series_id"], "user_id": me["id"],
                                        "status": status, "created_at": now_iso()})
    await audit(me["id"], "class.booked" if status == "booked" else "class.waitlisted", "class", cid)
    return {"ok": True, "status": status}


@router.delete("/classes/{cid}/book")
async def cancel_booking(cid: str, me: dict = Depends(get_current_user)):
    c = await _class_or_404(cid)
    mine = await db.class_bookings.find_one({"class_id": cid, "user_id": me["id"]})
    if not mine:
        return {"ok": True}
    if _parse(c["starts_at"]) <= _now():
        raise HTTPException(status_code=409, detail="This class has already started, so it can't be cancelled.")
    await db.class_bookings.delete_one({"id": mine["id"]})
    if mine["status"] == "booked":
        await _promote(c)
    await audit(me["id"], "class.booking_cancelled", "class", cid)
    return {"ok": True}


# --------------------------------------------------------------------------- reviews
class ReviewIn(BaseModel):
    rating: int
    instructor_rating: Optional[int] = None
    text: Optional[str] = None


@router.post("/classes/{cid}/review")
async def review(cid: str, body: ReviewIn, me: dict = Depends(get_current_user)):
    """Rate a class you went to (1-5 stars, plus the instructor if you like) and say a few words. One review per class;
    sending it again edits it."""
    c = await _class_or_404(cid)
    if c.get("status") == "cancelled" or _ends(c) > _now():
        raise HTTPException(status_code=409, detail="You can review a class once it has finished.")
    if not await db.class_bookings.find_one({"class_id": cid, "user_id": me["id"], "status": "booked"}):
        raise HTTPException(status_code=403, detail="Only people who booked this class can review it.")
    if not 1 <= body.rating <= 5 or (body.instructor_rating is not None and not 1 <= body.instructor_rating <= 5):
        raise HTTPException(status_code=400, detail="Ratings are 1 to 5 stars.")
    stamp = now_iso()
    fields = {"class_id": cid, "series_id": c["series_id"], "instructor_id": c.get("instructor_id"), "rating": body.rating,
              "instructor_rating": body.instructor_rating if c.get("instructor_id") else None,
              "text": (body.text or "").strip()[:1000] or None, "updated_at": stamp}
    existing = await db.class_reviews.find_one({"class_id": cid, "user_id": me["id"]})
    if existing:
        await db.class_reviews.update_one({"id": existing["id"]}, {"$set": fields})
    else:
        await db.class_reviews.insert_one({"id": str(uuid.uuid4()), "user_id": me["id"], **fields, "created_at": stamp})
    await audit(me["id"], "class.reviewed", "class", cid, {"rating": body.rating})
    return {"ok": True, "updated": bool(existing)}


@router.delete("/classes/{cid}/review")
async def delete_review(cid: str, me: dict = Depends(get_current_user)):
    await db.class_reviews.delete_one({"class_id": cid, "user_id": me["id"]})
    return {"ok": True}


@router.delete("/classes/{cid}/reviews/{rid}")
async def remove_review(cid: str, rid: str, me: dict = Depends(get_current_user)):
    """Admins can take down a review that breaks the community's rules."""
    _need_admin(me)
    await db.class_reviews.delete_one({"id": rid, "class_id": cid})
    await audit(me["id"], "class.review_removed", "class", cid, {"review": rid})
    return {"ok": True}


# --------------------------------------------------------------------------- calendar
@router.get("/classes/{cid}/ics")
async def class_ics(cid: str):
    c = await _class_or_404(cid)

    def fmt(d: datetime) -> str:
        return d.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Pathwai//Classes//EN", "BEGIN:VEVENT", f"UID:{cid}@pathwai",
             f"DTSTAMP:{fmt(_now())}", f"DTSTART:{fmt(_parse(c['starts_at']))}", f"DTEND:{fmt(_ends(c))}", f"SUMMARY:{c.get('title', '')}",
             f"LOCATION:{c.get('location') or ''}", "DESCRIPTION:" + (c.get("description") or "").replace("\n", " ")[:500], "END:VEVENT", "END:VCALENDAR"]
    return Response("\r\n".join(lines), media_type="text/calendar", headers={"Content-Disposition": f'attachment; filename="{cid}.ics"'})
