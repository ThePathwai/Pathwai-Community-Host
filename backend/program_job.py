"""Keeps every program's entry honest by reading its official page (see program_check.py for what is read and how).

Polite by design, like the events reader: it says who it is (PathwaiProgramBot), obeys each site's robots.txt, makes one request every few
seconds, re-reads a page at most once a day, keeps only short sentences from the page as evidence, and never throws away a good result because a
page was down for a day. PROGRAM_CHECKS=false turns it off."""
from __future__ import annotations

import asyncio
import logging
import os
import urllib.robotparser
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional
from urllib.parse import urldefrag, urlparse

import navigator as nav
import program_check as pc
from safe_fetch import FetchError, fetch_page

log = logging.getLogger(__name__)
BOT_NAME = "PathwaiProgramBot"
BOT_UA = "PathwaiProgramBot/1.0 (+https://pathwai-production-17f6.up.railway.app; checks public program pages so founders see current details)"
REFRESH_AFTER = timedelta(hours=20)
RETRY_AFTER = timedelta(hours=6)
PER_PASS = 70            # pages per hourly pass, so the whole list is covered in a few hours and each site is hit gently
KEEP_AFTER_FAILS = 3     # a page that fails this many times in a row stops being trusted
# Bump when the reading rules change: the next start then re-reads everything instead of waiting a day.
RULES_VERSION = "2026-11-20-pagecheck-1"


def enabled() -> bool:
    v = os.environ.get("PROGRAM_CHECKS", "").strip().lower()
    if v:
        return v in ("1", "true", "yes", "on")
    return os.environ.get("USE_MOCK_DB", "").lower() != "true"


def is_due(chk: Optional[Dict[str, Any]], now: datetime) -> bool:
    if not chk or chk.get("rules") != RULES_VERSION:
        return True
    try:
        at = datetime.fromisoformat(chk.get("tried_at") or chk["checked_at"])
    except (KeyError, ValueError):
        return True
    return now - at >= (REFRESH_AFTER if chk.get("ok") and not chk.get("stale") else RETRY_AFTER)


async def _robots_allows(url: str, cache: Dict[str, Any], fetch: Callable[..., Awaitable[str]]) -> Optional[str]:
    p = urlparse(url)
    host = f"{p.scheme}://{p.netloc}"
    if host not in cache:
        try:
            rp = urllib.robotparser.RobotFileParser()
            rp.parse((await fetch(host + "/robots.txt")).splitlines())
            cache[host] = ("ok", rp)
        except FetchError as e:
            cache[host] = ("none", None) if "404" in str(e) else ("error", str(e))
    state, rp = cache[host]
    if state == "error":
        return "Could not read the site's robots.txt, so we skipped it this time."
    if state == "none":
        return None
    return None if rp.can_fetch(BOT_NAME, url) else "The site's robots.txt does not allow it, so we left this page alone."


def _fetcher() -> Callable[..., Awaitable[str]]:
    async def f(url: str) -> str:
        return await fetch_page(url, ua=BOT_UA)
    return f


async def check_program(db, program: Dict[str, Any], *, fetch: Callable[..., Awaitable[str]], robots: Dict[str, Any], now: datetime) -> Dict[str, Any]:
    url = urldefrag(program.get("apply_url") or "")[0]
    prev = await db.program_checks.find_one({"id": program["id"]}) or None
    stamp = {"tried_at": now.isoformat(), "rules": RULES_VERSION}
    if not url.startswith("https://"):
        return {"id": program["id"], "ok": False, "problem": "This entry has no public web page to read.", "checked_at": now.isoformat(), **stamp}
    err = await _robots_allows(url, robots, fetch)
    html = ""
    if not err:
        try:
            html = await fetch(url)
        except FetchError as e:
            err = str(e)
        except Exception as e:  # noqa: BLE001 - one bad site must never stop the rest
            log.warning("program check %s failed: %s", program["id"], e)
            err = "Something went wrong reading this page."
    if err:
        fails = int((prev or {}).get("fail_count", 0)) + 1
        if prev and prev.get("ok") and fails < KEEP_AFTER_FAILS:   # keep what we last read, but say it is old
            return {**{k: v for k, v in prev.items() if k != "_id"}, "stale": True, "last_error": err, "fail_count": fails, **stamp}
        return {"id": program["id"], "ok": False, "problem": err, "last_error": err, "fail_count": fails, "checked_at": (prev or {}).get("checked_at") or now.isoformat(), **stamp}
    chk = pc.check_page(program, html, url, now)
    if prev and prev.get("hash") and prev["hash"] != chk["hash"]:
        chk["changed_at"] = now.isoformat()
    elif prev and prev.get("changed_at"):
        chk["changed_at"] = prev["changed_at"]
    if not chk["ok"] and prev and prev.get("ok") and int(prev.get("fail_count", 0)) + 1 < KEEP_AFTER_FAILS:
        return {**{k: v for k, v in prev.items() if k != "_id"}, "stale": True, "last_error": chk.get("problem", ""), "fail_count": int(prev.get("fail_count", 0)) + 1, **stamp}
    return {**chk, "fail_count": 0, "stale": False, **stamp}


async def refresh_all(db, *, programs: Optional[List[Dict[str, Any]]] = None, fetch: Optional[Callable[..., Awaitable[str]]] = None, only: Optional[str] = None,
                      delay: float = 3.0, limit: Optional[int] = None, now: Optional[datetime] = None,
                      sleep: Callable[[float], Awaitable[Any]] = asyncio.sleep) -> Dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    fetch = fetch or _fetcher()
    programs = programs if programs is not None else nav.load_catalog()["programs"]
    robots: Dict[str, Any] = {}
    done = ok = 0
    for p in programs:
        if only and p["id"] != only:
            continue
        cur = await db.program_checks.find_one({"id": p["id"]})
        if not only and not is_due(cur, now):
            continue
        if limit is not None and done >= limit:
            break
        if done and delay:
            await sleep(delay)
        chk = await check_program(db, p, fetch=fetch, robots=robots, now=now)
        await db.program_checks.update_one({"id": p["id"]}, {"$set": chk}, upsert=True)
        done += 1
        ok += 1 if chk.get("ok") and not chk.get("stale") else 0
    # entries for programs no longer in the catalog leave with them
    await db.program_checks.delete_many({"id": {"$nin": [p["id"] for p in programs]}})
    return {"checked": done, "ok": ok}


async def load_checks(db) -> Dict[str, Dict[str, Any]]:
    return {d["id"]: {k: v for k, v in d.items() if k != "_id"} async for d in db.program_checks.find({})}


def summarize(checks: Dict[str, Dict[str, Any]], programs: List[Dict[str, Any]]) -> Dict[str, Any]:
    ok = [c for c in checks.values() if c.get("ok") and not c.get("stale")]
    last = max((c.get("checked_at") or "" for c in checks.values()), default="")
    problems = [{"id": p["id"], "name": p["name"], "url": p.get("apply_url"), "problem": (checks.get(p["id"]) or {}).get("problem") or (checks.get(p["id"]) or {}).get("last_error") or "Not read yet"}
                for p in programs if not (checks.get(p["id"]) or {}).get("ok") or (checks.get(p["id"]) or {}).get("stale")]
    return {"programs": len(programs), "read": len(ok), "with_link_to_section": sum(1 for c in ok if c.get("section")),
            "requirements_confirmed": sum(1 for c in ok for r in c.get("requirements", []) if r.get("confirmed")),
            "requirements_total": sum(len(c.get("requirements", [])) for c in ok), "last_read": last[:10], "problems": problems}


async def program_checks_loop(get_db: Callable[[], Any]) -> None:
    if not enabled():
        log.info("Program page checks are off (PROGRAM_CHECKS).")
        return
    await asyncio.sleep(150)
    while True:
        try:
            res = await refresh_all(get_db(), limit=PER_PASS)
            if res["checked"]:
                log.info("Program page checks: read %s pages, %s good.", res["checked"], res["ok"])
        except Exception:  # noqa: BLE001
            log.exception("Program page checks failed; they will try again later.")
        await asyncio.sleep(3600)
