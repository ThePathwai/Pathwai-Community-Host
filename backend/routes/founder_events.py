"""Upcoming events for founders: read from public event pages (see events_job.py), ranked for the signed-in founder's startup profile.

Open to anyone (a signed-out visitor sees Ontario examples); a signed-in founder gets their own province, what they asked for and the
groups they said they belong to. A Pathwai platform admin can see which sources worked and run the reader on demand."""
from __future__ import annotations

import asyncio
import logging
from datetime import date
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

import events_feed as ef
import events_job as job
import navigator as nav
from auth import client_ip, rate_limit
from database import hub_db
from .hub import account_from_request, is_platform_admin, require_account

router = APIRouter(tags=["founder-events"])
log = logging.getLogger(__name__)
_RUNNING: Dict[str, bool] = {"on": False}


def _label(e: Dict[str, Any], today: date) -> Dict[str, Any]:
    return {**e, "week": ef.week_label(date.fromisoformat(e["date"]), today), "topic_labels": [ef.TOPIC_LABEL[t] for t in e["topics"] if t in ef.TOPIC_LABEL]}


@router.get("/founder-events")
async def founder_events(request: Request, q: str = Query("", max_length=80), topic: str = Query("", max_length=20), online: Optional[bool] = None,
                         free: bool = False, days: int = Query(ef.HORIZON_DAYS, ge=1, le=ef.HORIZON_DAYS)) -> Dict[str, Any]:
    await rate_limit("founder_events", client_ip(request), 240, 3600, "That's a lot of searches for now. Try again in a little while.")
    acc = await account_from_request(request)
    db = hub_db()
    today = date.today()
    raw = nav.navigator_profile(acc) if acc else {}
    res = ef.rank_events(await job.load_events(db), raw, today, {"q": q, "topic": topic if topic in ef.TOPIC_LABEL else "", "online": online, "free": free, "days": days})
    meta = await db.founder_event_meta.find_one({"id": "last_run"}) or {}
    return {**res, "events": [_label(e, today) for e in res["events"]], "others": [_label(e, today) for e in res["others"]],
            "signed_in": bool(acc), "has_profile": bool(raw.get("stage")), "updated_at": meta.get("at"),
            "topics": [{"key": k, "label": v} for k, v in ef.TOPIC_LABEL.items()]}


@router.get("/founder-events/status")
async def founder_events_status(acc: dict = Depends(require_account)) -> Dict[str, Any]:
    if not is_platform_admin(acc.get("email")):
        raise HTTPException(status_code=403, detail="Only Pathwai administrators can see this.")
    db = hub_db()
    runs = {r["source_id"]: {k: v for k, v in r.items() if k != "_id"} async for r in db.founder_event_runs.find({})}
    meta = await db.founder_event_meta.find_one({"id": "last_run"}) or {}
    rows = []
    for s in job.load_sources():
        rows.append({"id": s["id"], "name": s["name"], "group": s.get("group", ""), "url": s["url"], "confirmed": s.get("confirmed", True), **(runs.get(s["id"]) or {"ok": None})})
    return {"enabled": job.scraper_enabled(), "last_run": meta.get("at"), "total_events": await db.founder_events.count_documents({}), "sources": rows, "running": _RUNNING["on"]}


@router.post("/founder-events/refresh")
async def founder_events_refresh(source: str = Query("", max_length=60), acc: dict = Depends(require_account)) -> Dict[str, Any]:
    if not is_platform_admin(acc.get("email")):
        raise HTTPException(status_code=403, detail="Only Pathwai administrators can run this.")
    if _RUNNING["on"]:
        return {"started": False, "message": "It is already running. Check back in a minute."}
    _RUNNING["on"] = True

    async def go() -> None:
        try:
            await job.refresh_all(hub_db(), only=source or None)
        except Exception:  # noqa: BLE001
            log.exception("Manual event refresh failed")
        finally:
            _RUNNING["on"] = False

    asyncio.create_task(go())
    return {"started": True, "message": "Started. It takes a minute or two; reload to see the results."}
