"""Calendar subscribe link: a member adds ONE link to Google Calendar (or Apple/Outlook) and every
community event shows up there and stays up to date.

Calendar apps can't sign in, so the link carries a private token that belongs to the member
(`users.calendar_token`). It only ever exposes events that member may already see, only works while they
are an approved member, and can be replaced at any time with POST /me/calendar/reset (the old link stops
working). The community is pinned with `?community=<slug>` because calendar apps send no cookies.
Google refreshes subscribed calendars on its own schedule (roughly every 12-24 hours), so a brand-new
event can take a while to appear there; Apple and Outlook refresh sooner.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from auth import client_ip, get_current_user, rate_limit
from database import current_community, db
from ._common import approved_q, audience_ok, now_iso, public_base_url

router = APIRouter(tags=["calendar"])

LOOKBACK_DAYS = 30


def _utc(iso: Optional[str]) -> Optional[datetime]:
    try:
        return datetime.fromisoformat((iso or "").replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:  # noqa: BLE001
        return None


def _stamp(d: datetime) -> str:
    return d.strftime("%Y%m%dT%H%M%SZ")


def _esc(s: Any) -> str:
    """RFC 5545 TEXT escaping (backslash, comma, semicolon, newline)."""
    return str(s or "").replace("\\", "\\\\").replace(";", "\;").replace(",", "\\,").replace("\r\n", "\\n").replace("\n", "\\n").replace("\r", "")


def _fold(line: str) -> str:
    """Lines longer than 75 octets are folded (RFC 5545 3.1); calendar apps are strict about this."""
    raw = line.encode("utf-8")
    if len(raw) <= 75:
        return line
    parts, cur, size = [], "", 0
    for ch in line:
        n = len(ch.encode("utf-8"))
        if size + n > (75 if not parts else 74):
            parts.append(cur)
            cur, size = ch, n
        else:
            cur += ch
            size += n
    parts.append(cur)
    return "\r\n ".join(parts)


def event_lines(e: Dict[str, Any], page_url: str, stamp: str) -> list:
    start = _utc(e.get("starts_at"))
    if not start:
        return []
    end = _utc(e.get("ends_at")) or (start + timedelta(hours=1))
    if end <= start:
        end = start + timedelta(hours=1)
    where = e.get("location") or e.get("virtual_url") or ""
    desc = (e.get("description") or "").strip()[:600]
    if e.get("virtual_url") and e.get("location"):
        desc = (desc + "\n\nJoin: " + e["virtual_url"]).strip()
    desc = (desc + "\n\n" + page_url).strip()
    lines = ["BEGIN:VEVENT", f"UID:{e['id']}@pathwai", f"DTSTAMP:{stamp}", f"DTSTART:{_stamp(start)}", f"DTEND:{_stamp(end)}",
             f"SUMMARY:{_esc(e.get('title'))}", f"DESCRIPTION:{_esc(desc)}", f"URL:{page_url}"]
    if where:
        lines.append(f"LOCATION:{_esc(where)}")
    lines.append("END:VEVENT")
    return lines


def build_feed(name: str, events: list, base: str) -> str:
    stamp = _stamp(datetime.now(timezone.utc))
    out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Pathwai//Community//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
           f"X-WR-CALNAME:{_esc(name)}", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"]
    for e in events:
        out += event_lines(e, f"{base}/events/{e['id']}", stamp)
    out.append("END:VCALENDAR")
    return "\r\n".join(_fold(x) for x in out) + "\r\n"


async def _urls(request: Request, token: str) -> Dict[str, str]:
    base = public_base_url(request)
    feed = f"{base}/api/calendar/feed/{token}.ics?community={quote(current_community() or '')}"
    webcal = "webcal://" + feed.split("://", 1)[1]
    return {"feed_url": feed, "webcal_url": webcal, "google_url": "https://calendar.google.com/calendar/r?cid=" + quote(webcal, safe="")}


@router.get("/me/calendar")
async def my_calendar(request: Request, me: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": me["id"]}, {"calendar_token": 1})
    token = (u or {}).get("calendar_token")
    if not token:
        token = secrets.token_urlsafe(24)
        await db.users.update_one({"id": me["id"]}, {"$set": {"calendar_token": token}})
    return await _urls(request, token)


@router.post("/me/calendar/reset")
async def reset_calendar(request: Request, me: dict = Depends(get_current_user)):
    """New link; anything subscribed to the old one stops updating."""
    await rate_limit("calendar_reset", me["id"], 10, 3600, "That's plenty of resets for now. Try again in a little while.")
    token = secrets.token_urlsafe(24)
    await db.users.update_one({"id": me["id"]}, {"$set": {"calendar_token": token, "calendar_token_reset_at": now_iso()}})
    return await _urls(request, token)


@router.get("/calendar/feed/{filename}")
async def calendar_feed(filename: str, request: Request):
    await rate_limit("calendar_feed", client_ip(request), 120, 3600, "Too many calendar requests from this network.")
    token = filename[:-4] if filename.endswith(".ics") else filename
    u = await db.users.find_one({"calendar_token": token}) if len(token) >= 20 else None
    if not u or (u.get("membership_status") or "approved") != "approved":
        raise HTTPException(status_code=404, detail="This calendar link isn't valid any more. Get a new one from the Events page.")
    since = (datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)).isoformat()
    q = approved_q({"starts_at": {"$gte": since}})
    events = [e async for e in db.events.find(q).sort("starts_at", 1)]
    events = [e for e in events if audience_ok(e, u)][:500]
    cfg = (await db.community_config.find_one({"_key": "singleton"})) or {}
    name = f"{cfg.get('community_name') or 'Community'} events"
    body = build_feed(name, events, public_base_url(request))
    return Response(body, media_type="text/calendar; charset=utf-8", headers={"Cache-Control": "private, max-age=900", "Content-Disposition": 'inline; filename="events.ics"'})
