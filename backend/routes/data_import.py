"""Import your data: bring events and guest lists in from a spreadsheet file or a link, so nobody retypes anything.

Pathwai does the whole job itself (members, events, tickets, texts), so there is nothing to connect. What an admin
may have is the old data: a spreadsheet of events, a guest list exported from wherever they ran the event, a Google
Calendar. This reads those and fills Pathwai in.

  * Events   -- a CSV, a calendar file (.ics) or a link to either (a Google Sheet shared for viewing, a published
                sheet, a Google/Apple/Outlook/Luma calendar feed). Re-importing a calendar link updates the events it
                already brought in rather than duplicating them.
  * Guests   -- a CSV with an email column (and optionally a status column). People who are already members are marked
                as going; the rest are listed so they can be imported as members first.
  * Members  -- see member_import.py, which also accepts a link now.

Every import starts as a preview (`dry_run`): the admin sees what will happen and confirms. Imported events do not
notify the community, so bringing in a year of history stays quiet."""
from __future__ import annotations

import csv
import io
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import rate_limit, require_role
from database import db
from safe_fetch import FetchError, fetch_text
from ._common import audit, now_iso

router = APIRouter(tags=["data-import"])

MAX_ROWS = 500
MAX_CHARS = 1_500_000
DEFAULT_TZ = "America/Toronto"
DEFAULT_HOUR = 18  # an event with a date but no time starts at 6 PM local

EVENT_ALIASES: Dict[str, List[str]] = {
    "title": ["title", "name", "event", "event name", "event title", "summary", "subject"],
    "start": ["start", "starts", "starts at", "start at", "datetime", "date time", "begins", "when", "start datetime", "start date time"],
    "date": ["date", "start date", "event date", "day"],
    "time": ["time", "start time"],
    "end": ["end", "ends", "ends at", "end at", "end datetime", "end date time"],
    "end_date": ["end date"],
    "end_time": ["end time"],
    "location": ["location", "venue", "address", "where", "place"],
    "description": ["description", "details", "about", "notes", "agenda"],
    "category": ["category", "type", "event type", "kind"],
    "capacity": ["capacity", "max", "limit", "spots", "max attendees", "seats"],
    "price": ["price", "ticket price", "cost", "fee"],
    "url": ["url", "link", "registration link", "ticket link", "register", "event link", "website"],
    "virtual_url": ["zoom", "meeting link", "online link", "virtual link", "video link", "virtual url"],
    "host": ["host", "organizer", "organiser", "hosted by", "presenter", "speaker"],
}
GUEST_ALIASES: Dict[str, List[str]] = {
    "email": ["email", "e mail", "email address", "mail", "guest email"],
    "name": ["name", "full name", "guest name", "attendee"],
    "status": ["status", "approval status", "rsvp", "registration status", "ticket status", "response"],
}
_YES = {"", "approved", "going", "yes", "y", "registered", "confirmed", "attending", "checked in", "attended", "paid", "accepted", "invited and going", "true", "1"}


def _norm(h: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", (h or "").lower().replace("﻿", ""))).strip()


def _lookup(aliases: Dict[str, List[str]]) -> Dict[str, str]:
    return {a: f for f, names in aliases.items() for a in names}


def read_table(text: str, aliases: Dict[str, List[str]]) -> Tuple[List[Dict[str, Any]], List[str], List[str]]:
    """CSV text -> (rows, columns used, columns ignored). Each row maps canonical field -> text plus `_line`."""
    text = (text or "").replace("﻿", "")
    if not text.strip():
        raise HTTPException(status_code=400, detail="That file is empty.")
    if len(text) > MAX_CHARS:
        raise HTTPException(status_code=413, detail="That file is too big. Split it into smaller files.")
    try:
        delim = csv.Sniffer().sniff(text[:4000], delimiters=",;\t|").delimiter
    except csv.Error:
        delim = ","
    reader = csv.reader(io.StringIO(text), delimiter=delim)
    try:
        header = next(reader)
    except StopIteration:
        raise HTTPException(status_code=400, detail="That file is empty.")
    look = _lookup(aliases)
    fields: List[Optional[str]] = [look.get(_norm(h)) for h in header]
    used = [h.strip() for h, f in zip(header, fields) if f]
    ignored = [h.strip() for h, f in zip(header, fields) if not f and h.strip()]
    if not any(fields):
        raise HTTPException(status_code=400, detail="I couldn't recognise any columns. Add a header row (the template shows the names).")
    rows: List[Dict[str, Any]] = []
    for i, raw in enumerate(reader, start=2):
        if not any((c or "").strip() for c in raw):
            continue
        row: Dict[str, Any] = {"_line": i}
        for f, cell in zip(fields, raw):
            if f and (cell or "").strip():
                row[f] = row.get(f) or cell.strip()
        rows.append(row)
        if len(rows) > MAX_ROWS:
            raise HTTPException(status_code=413, detail=f"That has more than {MAX_ROWS} rows. Split it into smaller files.")
    return rows, used, ignored


# --------------------------------------------------------------------------- dates
_FORMATS = ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d %I:%M %p", "%Y-%m-%d %I %p", "%Y/%m/%d %H:%M", "%Y/%m/%d",
            "%m/%d/%Y %H:%M", "%m/%d/%Y %I:%M %p", "%m/%d/%Y %I %p", "%m/%d/%y %I:%M %p", "%m/%d/%y %H:%M", "%m/%d/%Y", "%m/%d/%y",
            "%d/%m/%Y %H:%M", "%d/%m/%Y %I:%M %p", "%d/%m/%Y",
            "%b %d %Y %I:%M %p", "%B %d %Y %I:%M %p", "%b %d %Y %I %p", "%B %d %Y %I %p", "%b %d %Y %H:%M", "%B %d %Y %H:%M", "%b %d %Y", "%B %d %Y",
            "%d %b %Y %I:%M %p", "%d %B %Y %I:%M %p", "%d %b %Y %H:%M", "%d %B %Y %H:%M", "%d %b %Y", "%d %B %Y"]
_WEEKDAY = re.compile(r"^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?,?\s+", re.I)
_TZNAME = re.compile(r"\s+(EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT|ET|CT|MT|PT)\b", re.I)


def _tz(name: Optional[str]) -> ZoneInfo:
    try:
        return ZoneInfo(name or DEFAULT_TZ)
    except Exception:  # noqa: BLE001
        return ZoneInfo(DEFAULT_TZ)


def parse_when(raw: str, tz: ZoneInfo, default_hour: int = DEFAULT_HOUR) -> Tuple[Optional[datetime], bool]:
    """-> (UTC datetime or None, had_a_time). A date with no time becomes `default_hour` local."""
    t = (raw or "").strip()
    if not t:
        return None, False
    try:
        d = datetime.fromisoformat(t.replace("Z", "+00:00"))
        has_time = bool(re.search(r"\d{1,2}:\d{2}", t)) or "T" in t
        if d.tzinfo is None:
            d = d.replace(tzinfo=tz, hour=d.hour if has_time else default_hour)
        return d.astimezone(timezone.utc), has_time
    except ValueError:
        pass
    s = _WEEKDAY.sub("", t)
    s = _TZNAME.sub("", s)
    s = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", s, flags=re.I)
    s = re.sub(r"\s+(at|@)\s+", " ", s, flags=re.I)
    s = re.sub(r"([ap])\.m\.", r"\1m", s, flags=re.I)
    s = re.sub(r"(\d)([ap]m)\b", r"\1 \2", s, flags=re.I)
    s = re.sub(r"[,]", " ", s)
    s = re.sub(r"\s+", " ", s).strip().upper()
    for f in _FORMATS:
        try:
            d = datetime.strptime(s, f)
        except ValueError:
            continue
        has_time = "%H" in f or "%I" in f
        if not has_time:
            d = d.replace(hour=default_hour)
        return d.replace(tzinfo=tz).astimezone(timezone.utc), has_time
    return None, False


def _iso(d: datetime) -> str:
    return d.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def _money_cents(v: str) -> Optional[int]:
    t = (v or "").strip().lower()
    if not t or t in ("free", "0", "$0", "no charge"):
        return None
    m = re.search(r"\d+(?:[.,]\d{1,2})?", t.replace(",", ""))
    if not m:
        return None
    cents = int(round(float(m.group(0)) * 100))
    return cents or None


def _int(v: Optional[str]) -> Optional[int]:
    m = re.search(r"\d+", (v or "").replace(",", ""))
    return int(m.group(0)) if m else None


# --------------------------------------------------------------------------- calendar files (.ics)
def _unfold(text: str) -> List[str]:
    out: List[str] = []
    for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if line[:1] in (" ", "\t") and out:
            out[-1] += line[1:]
        else:
            out.append(line)
    return out


def _unescape(v: str) -> str:
    return v.replace("\\n", "\n").replace("\\N", "\n").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")


def _ics_when(params: Dict[str, str], value: str, tz: ZoneInfo) -> Tuple[Optional[datetime], bool]:
    v = value.strip()
    try:
        if params.get("VALUE") == "DATE" or re.fullmatch(r"\d{8}", v):
            d = datetime.strptime(v[:8], "%Y%m%d").replace(hour=DEFAULT_HOUR, tzinfo=tz)
            return d.astimezone(timezone.utc), False
        if v.endswith("Z"):
            return datetime.strptime(v, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc), True
        d = datetime.strptime(v[:15], "%Y%m%dT%H%M%S")
        zone = tz
        if params.get("TZID"):
            try:
                zone = ZoneInfo(params["TZID"])
            except Exception:  # noqa: BLE001
                zone = tz
        return d.replace(tzinfo=zone).astimezone(timezone.utc), True
    except ValueError:
        return None, False


def parse_ics(text: str, tz: ZoneInfo) -> List[Dict[str, Any]]:
    """VEVENTs from a calendar file -> rows shaped like the CSV ones (already resolved to dates)."""
    events: List[Dict[str, Any]] = []
    cur: Optional[Dict[str, Any]] = None
    n = 0
    for line in _unfold(text):
        n += 1
        if line.upper() == "BEGIN:VEVENT":
            cur = {"_line": n, "_params": {}}
        elif line.upper() == "END:VEVENT":
            if cur is not None:
                events.append(cur)
            cur = None
        elif cur is not None and ":" in line:
            head, _, value = line.partition(":")
            bits = head.split(";")
            name = bits[0].upper()
            params = {k.upper(): v for k, _, v in (b.partition("=") for b in bits[1:])}
            cur.setdefault(name, value)
            cur["_params"].setdefault(name, params)
    rows = []
    for e in events:
        start, has_time = _ics_when(e["_params"].get("DTSTART", {}), e.get("DTSTART", ""), tz)
        end, _ = _ics_when(e["_params"].get("DTEND", {}), e.get("DTEND", ""), tz) if e.get("DTEND") else (None, False)
        desc = _unescape(e.get("DESCRIPTION", "")).strip()
        url = (e.get("URL") or "").strip()
        if not url:
            m = re.search(r"https?://\S+", desc)
            url = m.group(0).rstrip(").,>") if m else ""
        rows.append({"_line": e["_line"], "title": _unescape(e.get("SUMMARY", "")).strip(), "_start": start, "_end": end, "_has_time": has_time,
                     "location": _unescape(e.get("LOCATION", "")).strip(), "description": desc, "url": url, "uid": (e.get("UID") or "").strip(),
                     "cancelled": (e.get("STATUS") or "").upper() == "CANCELLED", "repeats": bool(e.get("RRULE"))})
    return rows


# --------------------------------------------------------------------------- events
def csv_event_rows(text: str, tz: ZoneInfo) -> Tuple[List[Dict[str, Any]], List[str], List[str]]:
    rows, used, ignored = read_table(text, EVENT_ALIASES)
    out = []
    for r in rows:
        start_txt = r.get("start") or " ".join(x for x in (r.get("date"), r.get("time")) if x)
        end_txt = r.get("end") or ""
        if not end_txt and (r.get("end_time") or r.get("end_date")):
            end_txt = " ".join(x for x in (r.get("end_date") or r.get("date"), r.get("end_time")) if x)
        start, has_time = parse_when(start_txt, tz)
        end, _ = parse_when(end_txt, tz) if end_txt else (None, False)
        out.append({**r, "_start": start, "_end": end, "_has_time": has_time, "_start_text": start_txt})
    return out, used, ignored


class EventImportIn(BaseModel):
    csv: str = ""
    ics: str = ""
    url: str = ""
    dry_run: bool = True
    include_past: bool = False
    timezone: Optional[str] = None


async def _load_events_source(body: EventImportIn, tz: ZoneInfo):
    """-> (rows, used, ignored, source_kind). The pasted file wins; a link is fetched and sniffed (calendar or CSV)."""
    text, kind = "", "csv"
    if body.ics.strip():
        text, kind = body.ics, "ics"
    elif body.csv.strip():
        text = body.csv
    elif body.url.strip():
        try:
            text = await fetch_text(body.url)
        except FetchError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        kind = "ics" if "BEGIN:VCALENDAR" in text[:2000].upper() else "csv"
    else:
        raise HTTPException(status_code=400, detail="Choose a file or paste a link.")
    if kind == "ics" or "BEGIN:VCALENDAR" in text[:2000].upper():
        rows = parse_ics(text, tz)
        if not rows:
            raise HTTPException(status_code=400, detail="I couldn't find any events in that calendar.")
        if len(rows) > MAX_ROWS:
            raise HTTPException(status_code=413, detail=f"That calendar has more than {MAX_ROWS} events. Import it in smaller pieces.")
        return rows, ["Title", "Start", "End", "Location", "Description", "Link"], [], "calendar"
    rows, used, ignored = csv_event_rows(text, tz)
    return rows, used, ignored, "spreadsheet"


@router.get("/admin/import/template/events")
async def events_template(_: dict = Depends(require_role("admin"))):
    return {"header": ["title", "date", "time", "end time", "location", "description", "category", "capacity", "price", "link"],
            "rows": [["Founders Coffee", "2026-11-12", "18:00", "20:00", "MaRS, Toronto", "Casual check-in for founders", "Meetup", "40", "", ""],
                     ["Pitch Night", "Nov 19, 2026", "7:00 PM", "9:30 PM", "Online", "Five pitches, live feedback", "Workshop", "", "$15", "https://example.com/tickets"]],
            "tip": "Only title and date are needed. Times can be 18:00 or 6:00 PM."}


@router.post("/admin/import/events")
async def import_events(body: EventImportIn, me: dict = Depends(require_role("admin"))):
    await rate_limit("data_import", me["id"], 60, 3600, "That's a lot of imports for now. Try again in a little while.")
    tz = _tz(body.timezone)
    rows, used, ignored, kind = await _load_events_source(body, tz)
    now = datetime.now(timezone.utc)

    existing = [e async for e in db.events.find({}, {"id": 1, "title": 1, "starts_at": 1, "import_uid": 1})]
    by_uid = {e["import_uid"]: e for e in existing if e.get("import_uid")}
    by_key = {((e.get("title") or "").strip().lower(), (e.get("starts_at") or "")[:16]): e for e in existing}
    seen: set = set()
    results: List[Dict[str, Any]] = []
    to_insert: List[Dict[str, Any]] = []
    to_update: List[Tuple[str, Dict[str, Any]]] = []

    for r in rows:
        title = (r.get("title") or "").strip()[:140]
        start, end = r.get("_start"), r.get("_end")
        res: Dict[str, Any] = {"line": r["_line"], "title": title, "starts_at": _iso(start) if start else None, "notes": []}
        results.append(res)
        if not title:
            res.update(status="skipped", reason="no title")
            continue
        if not start:
            res.update(status="skipped", reason=f"couldn't read the date{(' “' + r['_start_text'][:30] + '”') if r.get('_start_text') else ''}")
            continue
        if r.get("cancelled"):
            res.update(status="skipped", reason="cancelled")
            continue
        if start < now - timedelta(hours=6) and not body.include_past:
            res.update(status="skipped", reason="already happened")
            continue
        if not r.get("_has_time"):
            res["notes"].append("no time given, set to 6:00 PM")
        if r.get("repeats"):
            res["notes"].append("repeats: only the first date was brought in")
        if end and end <= start:
            end = None
        key = (title.lower(), _iso(start)[:16])
        if key in seen:
            res.update(status="skipped", reason="appears twice")
            continue
        seen.add(key)
        fields = {"title": title, "starts_at": _iso(start), "ends_at": _iso(end) if end else None,
                  "location": (r.get("location") or "")[:200] or None, "description": (r.get("description") or "")[:4000] or None,
                  "url": (r.get("url") or "")[:300] or None, "virtual_url": (r.get("virtual_url") or "")[:300] or None,
                  "host": (r.get("host") or "")[:120] or None, "category": ((r.get("category") or "Meetup")[:40]),
                  "capacity": _int(r.get("capacity")), "price_cents": _money_cents(r.get("price") or "")}
        uid = (r.get("uid") or "").strip()
        match = by_uid.get(uid) if uid else None
        match = match or by_key.get(key)
        if match:
            if uid and match.get("import_uid") == uid:
                res.update(status="will_update" if body.dry_run else "updated", id=match["id"])
                to_update.append((match["id"], {k: v for k, v in fields.items() if v is not None}))
            else:
                res.update(status="skipped", reason="already in your events")
            continue
        doc = {"id": str(uuid.uuid4()), **fields, "tags": [], "agenda": [], "prep": None, "audience": [], "image_url": None, "currency": None, "ticket_tiers": [],
               "cover_url": None, "source": "import", "attendee_ids": [], "rsvps": {}, "saved_by": [], "status": "approved",
               "submitted_by": me["id"], "submitted_by_name": me.get("name"), "created_at": now_iso(), "imported_at": now_iso()}
        if uid:
            doc["import_uid"] = uid
        res.update(status="will_create" if body.dry_run else "created", id=doc["id"])
        to_insert.append(doc)

    if not body.dry_run:
        if to_insert:
            await db.events.insert_many([dict(d) for d in to_insert])
        for eid, patch in to_update:
            await db.events.update_one({"id": eid}, {"$set": patch})
        await audit(me["id"], "admin.events_imported", "community", None, {"created": len(to_insert), "updated": len(to_update), "source": kind})
    count = lambda *s: sum(1 for x in results if x.get("status") in s)  # noqa: E731
    return {"dry_run": body.dry_run, "source": kind, "total": len(results), "created": count("created", "will_create"), "updated": count("updated", "will_update"),
            "skipped": count("skipped"), "columns_used": used, "columns_ignored": ignored, "rows": results}


# --------------------------------------------------------------------------- guest lists
class GuestImportIn(BaseModel):
    event_id: str
    csv: str = ""
    url: str = ""
    dry_run: bool = True


@router.post("/admin/import/guests")
async def import_guests(body: GuestImportIn, me: dict = Depends(require_role("admin"))):
    await rate_limit("data_import", me["id"], 60, 3600, "That's a lot of imports for now. Try again in a little while.")
    e = await db.events.find_one({"id": body.event_id})
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    text = body.csv
    if not text.strip():
        if not body.url.strip():
            raise HTTPException(status_code=400, detail="Choose a file or paste a link.")
        try:
            text = await fetch_text(body.url)
        except FetchError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    rows, used, ignored = read_table(text, GUEST_ALIASES)
    if not any(r.get("email") for r in rows):
        raise HTTPException(status_code=400, detail="I couldn't find an email column. Guests are matched to members by email.")

    members = {u["email"].lower(): u async for u in db.users.find({"email": {"$exists": True}}, {"id": 1, "email": 1, "name": 1}) if u.get("email")}
    going = set(e.get("attendee_ids") or [])
    rsvps = dict(e.get("rsvps") or {})
    results: List[Dict[str, Any]] = []
    matched: List[str] = []
    seen: set = set()
    for r in rows:
        email = (r.get("email") or "").strip().lower()
        res: Dict[str, Any] = {"line": r["_line"], "email": email, "name": r.get("name") or ""}
        results.append(res)
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
            res.update(status="skipped", reason="no valid email")
            continue
        if email in seen:
            res.update(status="skipped", reason="appears twice")
            continue
        seen.add(email)
        if _norm(r.get("status") or "") not in _YES:
            res.update(status="skipped", reason=f"status is “{(r.get('status') or '')[:30]}”")
            continue
        m = members.get(email)
        if not m:
            res.update(status="not_member", reason="not a member yet")
            continue
        res["name"] = res["name"] or m.get("name") or ""
        if m["id"] in going:
            res.update(status="skipped", reason="already going")
            continue
        res.update(status="will_add" if body.dry_run else "added")
        matched.append(m["id"])
    if not body.dry_run and matched:
        for uid in matched:
            going.add(uid)
            rsvps[uid] = "yes"
        await db.events.update_one({"id": body.event_id}, {"$set": {"attendee_ids": sorted(going), "rsvps": rsvps}})
        await audit(me["id"], "admin.guests_imported", "event", body.event_id, {"added": len(matched)})
    count = lambda *s: sum(1 for x in results if x.get("status") in s)  # noqa: E731
    return {"dry_run": body.dry_run, "event_title": e.get("title"), "total": len(results), "added": count("added", "will_add"),
            "not_members": count("not_member"), "skipped": count("skipped"), "columns_used": used, "columns_ignored": ignored, "rows": results}
