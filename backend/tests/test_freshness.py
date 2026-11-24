"""The freshness check: quiet readers turn it red, running or deliberately-off ones keep it green."""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"

from database import hub_db
import freshness as fr

NOW = datetime(2026, 11, 25, 12, 0, tzinfo=timezone.utc)
LONG_AGO = NOW - timedelta(days=3)


def _run(coro):
    return asyncio.run(coro)


def _set(events_hours=None, program_hours=None):
    async def go():
        db = hub_db()
        await db.founder_event_meta.delete_many({})
        await db.program_checks.delete_many({})
        if events_hours is not None:
            await db.founder_event_meta.insert_one({"id": "last_run", "at": (NOW - timedelta(hours=events_hours)).isoformat()})
        if program_hours is not None:
            await db.program_checks.insert_one({"id": "p1", "checked_at": (NOW - timedelta(hours=program_hours)).isoformat()})
        return db
    return _run(go())


def test_green_when_both_readers_ran_recently():
    db = _set(events_hours=5, program_hours=1)
    out = _run(fr.report(db, NOW, LONG_AGO, True, True))
    assert out["ok"] and out["events"]["state"] == "fresh" and out["programs"]["hours_ago"] == 1.0


def test_red_when_the_program_reader_goes_quiet():
    db = _set(events_hours=5, program_hours=80)
    out = _run(fr.report(db, NOW, LONG_AGO, True, True))
    assert not out["ok"] and out["programs"]["state"] == "stale" and out["events"]["state"] == "fresh"


def test_red_when_the_event_reader_goes_quiet():
    db = _set(events_hours=60, program_hours=2)
    out = _run(fr.report(db, NOW, LONG_AGO, True, True))
    assert not out["ok"] and out["events"]["state"] == "stale"


def test_a_reader_that_never_ran_is_red_unless_the_server_just_started():
    db = _set()
    assert not _run(fr.report(db, NOW, LONG_AGO, True, True))["ok"]
    assert _run(fr.report(db, NOW, NOW - timedelta(hours=1), True, True))["events"]["state"] == "starting"
    assert _run(fr.report(db, NOW, NOW - timedelta(hours=1), True, True))["ok"]


def test_a_reader_switched_off_on_purpose_is_not_a_problem():
    db = _set(events_hours=5)
    out = _run(fr.report(db, NOW, LONG_AGO, True, False))
    assert out["ok"] and out["programs"]["state"] == "off"


def test_the_endpoint_answers_503_when_quiet_and_200_when_fresh(monkeypatch):
    import events_job
    import program_job
    import server
    from fastapi.testclient import TestClient
    monkeypatch.setattr(events_job, "scraper_enabled", lambda: True)
    monkeypatch.setattr(program_job, "enabled", lambda: True)
    monkeypatch.setattr(server, "_STARTED_AT", datetime.now(timezone.utc) - timedelta(days=3))
    with TestClient(server.app) as c:
        async def setup(ev, pr):
            db = hub_db()
            await db.founder_event_meta.delete_many({})
            await db.program_checks.delete_many({})
            now = datetime.now(timezone.utc)
            await db.founder_event_meta.insert_one({"id": "last_run", "at": (now - timedelta(hours=ev)).isoformat()})
            await db.program_checks.insert_one({"id": "p1", "checked_at": (now - timedelta(hours=pr)).isoformat()})
        _run(setup(3, 2))
        r = c.get("/api/health/freshness")
        assert r.status_code == 200 and r.json()["ok"]
        _run(setup(3, 100))
        r = c.get("/api/health/freshness")
        assert r.status_code == 503 and r.json()["programs"]["state"] == "stale"
        assert c.get("/api/health").status_code == 200   # liveness is unaffected
