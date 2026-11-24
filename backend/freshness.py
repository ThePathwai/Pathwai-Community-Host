"""Is the product still keeping itself up to date? One answer for an uptime monitor.

Two background jobs keep Pathwai current: the event reader (about every 11 hours) and the program page reader (every program about once a day).
If either goes quiet for more than STALE_AFTER_HOURS, /api/health/freshness answers 503 so a monitor can email you. It carries no program names or
personal data, only times. A job that is switched off on purpose (EVENTS_SCRAPER=false, PROGRAM_CHECKS=false) is reported as "off", not stale.
Just after a restart with nothing recorded yet, it says "starting" for a few hours instead of raising a false alarm."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

STALE_AFTER_HOURS = 48
STARTUP_GRACE_HOURS = 6


def _parse(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _one(last: Optional[datetime], on: bool, now: datetime, started_at: datetime) -> Dict[str, Any]:
    if not on:
        return {"state": "off", "fresh": True, "last": None, "hours_ago": None}
    if last is None:
        starting = now - started_at < timedelta(hours=STARTUP_GRACE_HOURS)
        return {"state": "starting" if starting else "never_ran", "fresh": starting, "last": None, "hours_ago": None}
    hours = round((now - last).total_seconds() / 3600, 1)
    fresh = hours <= STALE_AFTER_HOURS
    return {"state": "fresh" if fresh else "stale", "fresh": fresh, "last": last.isoformat(), "hours_ago": hours}


async def report(db, now: datetime, started_at: datetime, events_on: bool, programs_on: bool) -> Dict[str, Any]:
    """`db` is the platform database. Returns {ok, checked_at, events, programs}."""
    meta = await db.founder_event_meta.find_one({"id": "last_run"})
    ev_last = _parse((meta or {}).get("at"))
    pr_last: Optional[datetime] = None
    async for d in db.program_checks.find({}):
        t = _parse(d.get("checked_at"))
        if t and (pr_last is None or t > pr_last):
            pr_last = t
    events = _one(ev_last, events_on, now, started_at)
    programs = _one(pr_last, programs_on, now, started_at)
    return {"ok": events["fresh"] and programs["fresh"], "checked_at": now.isoformat(), "stale_after_hours": STALE_AFTER_HOURS, "events": events, "programs": programs}
