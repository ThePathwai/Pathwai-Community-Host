"""Reads the public event pages listed in data/event_sources.json and keeps the upcoming founder events in the platform database.

Polite by design: it says who it is (PathwaiEventsBot), obeys each site's robots.txt, makes one request every few seconds, runs at most
twice a day, keeps only a title, a date, a place, a short summary and the link back, and never wipes good data when a page changes shape.
Turn a whole kind of source off with EVENTS_GROUPS_OFF (for example "eventbrite,meetup"), or all of it with EVENTS_SCRAPER=false."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import urllib.robotparser
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional
from urllib.parse import urlparse

import events_feed as ef
from safe_fetch import FetchError, fetch_page

log = logging.getLogger(__name__)
SOURCES_FILE = Path(__file__).parent / "data" / "event_sources.json"
REFRESH_EVERY = timedelta(hours=11)
BOT_NAME = "PathwaiEventsBot"
MAX_PER_SOURCE = 60


def load_sources() -> List[Dict[str, Any]]:
    data = json.loads(SOURCES_FILE.read_text(encoding="utf-8"))
    off = {g.strip().lower() for g in os.environ.get("EVENTS_GROUPS_OFF", "").split(",") if g.strip()}
    return [s for s in data["sources"] if s.get("group", "").lower() not in off and s.get("enabled", True)]


def scraper_enabled() -> bool:
    v = os.environ.get("EVENTS_SCRAPER", "").strip().lower()
    if v:
        return v in ("1", "true", "yes", "on")
    return os.environ.get("USE_MOCK_DB", "").lower() != "true"   # on in production, off in tests unless asked for


async def _robots_allows(url: str, cache: Dict[str, Any], fetch: Callable[..., Awaitable[str]]) -> Optional[str]:
    """None when we may fetch the page, otherwise the plain reason we may not."""
    p = urlparse(url)
    host = f"{p.scheme}://{p.netloc}"
    if host not in cache:
        try:
            rp = urllib.robotparser.RobotFileParser()
            rp.parse((await fetch(host + "/robots.txt")).splitlines())
            cache[host] = ("ok", rp)
        except FetchError as e:
            # No robots.txt (404) means no restrictions. Any other failure: do not guess, skip this site this time.
            cache[host] = ("none", None) if "404" in str(e) else ("error", str(e))
    state, rp = cache[host]
    if state == "error":
        return f"Could not read the site's robots.txt ({rp}), so we skipped it this time."
    if state == "none":
        return None
    return None if rp.can_fetch(BOT_NAME, url) else "The site's robots.txt does not allow it, so we skipped it."


async def refresh_source(db, src: Dict[str, Any], *, fetch: Callable[..., Awaitable[str]], robots: Dict[str, Any], now: datetime) -> Dict[str, Any]:
    run = {"source_id": src["id"], "name": src["name"], "group": src.get("group", ""), "url": src["url"], "ran_at": now.isoformat(), "ok": False, "found": 0, "kept": 0, "error": ""}
    why = await _robots_allows(src["url"], robots, fetch)
    if why:
        run["error"] = why
        return run
    try:
        body = await fetch(src["url"])
    except FetchError as e:
        run["error"] = str(e)
        return run
    except Exception as e:  # noqa: BLE001 - one bad site must never stop the rest
        log.warning("events source %s failed: %s", src["id"], e)
        run["error"] = "Something went wrong reading this page."
        return run
    raw = ef.parse_events(src.get("kind", "auto"), body, src["url"])
    run["found"] = len(raw)
    events = ef.dedupe([e for e in (ef.normalize(r, src, now) for r in raw) if e])[:MAX_PER_SOURCE]
    run["kept"] = len(events)
    run["ok"] = True
    if not raw:
        run["error"] = "The page loaded but no events were found in it (the site may have changed how it publishes them). Existing events were kept."
        return run
    seen = []
    for e in events:
        seen.append(e["id"])
        await db.founder_events.update_one({"id": e["id"]}, {"$set": {**e, "fetched_at": now.isoformat()}}, upsert=True)
    # Events this page used to list and no longer does were cancelled or moved: drop them, but only when the page clearly still works.
    if events:
        await db.founder_events.delete_many({"source_id": src["id"], "id": {"$nin": seen}, "start": {"$gte": now.isoformat()}})
    return run


async def refresh_all(db, *, fetch: Callable[..., Awaitable[str]] = fetch_page, only: Optional[str] = None, delay: float = 3.0,
                      now: Optional[datetime] = None, sleep: Callable[[float], Awaitable[Any]] = asyncio.sleep) -> Dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    robots: Dict[str, Any] = {}
    runs = []
    for i, src in enumerate(load_sources()):
        if only and src["id"] != only:
            continue
        if i and delay:
            await sleep(delay)
        run = await refresh_source(db, src, fetch=fetch, robots=robots, now=now)
        runs.append(run)
        await db.founder_event_runs.update_one({"source_id": src["id"]}, {"$set": run}, upsert=True)
    await db.founder_events.delete_many({"end": {"$lt": (now - timedelta(days=1)).isoformat()}})
    await db.founder_event_meta.update_one({"id": "last_run"}, {"$set": {"id": "last_run", "at": now.isoformat(), "sources": len(runs), "ok": sum(1 for r in runs if r["ok"]),
                                                                           "events": await db.founder_events.count_documents({})}}, upsert=True)
    return {"ran": len(runs), "ok": sum(1 for r in runs if r["ok"]), "runs": runs}


async def load_events(db) -> List[Dict[str, Any]]:
    return [{k: v for k, v in d.items() if k != "_id"} async for d in db.founder_events.find({})]


async def events_loop(get_db: Callable[[], Any]) -> None:
    """Background loop started with the server: a first look shortly after startup, then whenever the last good run is over eleven hours old."""
    if not scraper_enabled():
        log.info("Event reader is off (EVENTS_SCRAPER).")
        return
    await asyncio.sleep(90)
    while True:
        try:
            db = get_db()
            last = await db.founder_event_meta.find_one({"id": "last_run"})
            due = not last or datetime.fromisoformat(last["at"]) < datetime.now(timezone.utc) - REFRESH_EVERY
            if due:
                res = await refresh_all(db)
                log.info("Event reader: %s of %s sources worked.", res["ok"], res["ran"])
        except Exception:  # noqa: BLE001
            log.exception("Event reader failed; it will try again later.")
        await asyncio.sleep(3600)
