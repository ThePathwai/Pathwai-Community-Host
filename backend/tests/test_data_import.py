"""Import your data: events (CSV, calendar file, link), guest lists, members from a link, and the safe link fetcher."""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"

import httpx
import pytest
from fastapi.testclient import TestClient

import safe_fetch
import server
from routes import data_import as di
from routes.hub import in_community
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Toronto")


@pytest.fixture
def mock_http(monkeypatch):
    real = httpx.AsyncClient
    state = {"handler": lambda req: httpx.Response(500), "calls": []}

    def factory(*a, **kw):
        def h(req):
            state["calls"].append(req)
            return state["handler"](req)
        kw["transport"] = httpx.MockTransport(h)
        return real(*a, **kw)

    monkeypatch.setattr(httpx, "AsyncClient", factory)
    return state


@pytest.fixture(scope="module")
def club():
    with TestClient(server.app) as client:
        r = client.post("/api/hub/signup", json={"accepted_terms": True, "email": "founder@imp.example.com", "password": "ImpPass12345", "name": "Imp Founder"})
        assert r.status_code == 201, r.text
        r = client.post("/api/hub/communities", json={"name": "Import Club", "category": "other"})
        assert r.status_code == 201, r.text
        slug = r.json()["slug"]
        client.headers.update({"X-Community": slug})
        yield {"c": client, "slug": slug}


def run_in(slug, make_coro):
    with in_community(slug):
        return asyncio.run(make_coro())


def add_member(slug, name, email):
    doc = {"id": str(uuid.uuid4()), "name": name, "email": email, "role": "member", "member_type": "member", "membership_status": "approved",
           "password_hash": "!", "created_at": "2026-01-01T00:00:00+00:00"}
    run_in(slug, lambda: server.db.users.insert_one(dict(doc)))
    return doc


def events_of(slug):
    async def go():
        return [e async for e in server.db.events.find({"source": "import"})]
    return run_in(slug, go)


def future(days, hour=19, minute=0):
    d = (datetime.now(TZ) + timedelta(days=days)).replace(hour=hour, minute=minute, second=0, microsecond=0)
    return d


# --------------------------------------------------------------------------- dates
def test_date_parsing_in_the_admins_timezone():
    p = lambda s: di.parse_when(s, TZ)  # noqa: E731
    d, t = p("2026-11-12 18:00")
    assert t and d.isoformat() == "2026-11-12T23:00:00+00:00"          # Toronto is UTC-5 in November
    assert p("Nov 12, 2026 6:00 PM")[0] == d and p("November 12th, 2026 at 6pm")[0] == d and p("Thu, Nov 12, 2026 6:00 p.m.")[0] == d
    assert p("11/12/2026 6:00 PM")[0] == d and p("12/11/2026 18:00")[0] is not None
    assert p("2026-11-12T23:00:00Z") == (d, True)
    nd, has_time = p("2026-11-12")
    assert not has_time and nd.astimezone(TZ).hour == di.DEFAULT_HOUR
    assert p("sometime soon")[0] is None and p("")[0] is None


# --------------------------------------------------------------------------- events from a spreadsheet
def test_events_csv_preview_then_import(club):
    c, slug = club["c"], club["slug"]
    f1, f2 = future(10), future(20)
    csv_text = (f"Event Name,Date,Time,End Time,Venue,Details,Type,Spots,Ticket Price,Link\n"
                f"Founders Coffee,{f1:%Y-%m-%d},{f1:%H:%M},21:00,MaRS Toronto,Casual check-in,Meetup,40,Free,\n"
                f"Pitch Night,\"{f2:%b} {f2.day}, {f2.year}\",7:00 PM,,Online,Five pitches,Workshop,,$15.50,https://example.com/t\n"
                f"Old Party,2020-01-01,18:00,,Somewhere,,,,,\n"
                f"No date,,,,,,,,,\n"
                f",{f1:%Y-%m-%d},,,,,,,,\n"
                f"Founders Coffee,{f1:%Y-%m-%d},{f1:%H:%M},,,,,,,\n")
    pre = c.post("/api/admin/import/events", json={"csv": csv_text, "timezone": "America/Toronto"}).json()
    assert pre["dry_run"] and pre["source"] == "spreadsheet" and pre["created"] == 2 and pre["skipped"] == 4
    reasons = [r.get("reason", "") for r in pre["rows"]]
    assert "already happened" in reasons and any("date" in x for x in reasons) and "no title" in reasons and "appears twice" in reasons
    assert events_of(slug) == []                                       # a preview writes nothing
    done = c.post("/api/admin/import/events", json={"csv": csv_text, "timezone": "America/Toronto", "dry_run": False}).json()
    assert done["created"] == 2
    evs = {e["title"]: e for e in events_of(slug)}
    fc, pn = evs["Founders Coffee"], evs["Pitch Night"]
    assert fc["starts_at"] == f1.astimezone(timezone.utc).replace(microsecond=0).isoformat() and fc["location"] == "MaRS Toronto" and fc["capacity"] == 40
    assert fc["ends_at"] and fc["price_cents"] is None and pn["price_cents"] == 1550 and pn["url"] == "https://example.com/t"
    assert fc["source"] == "import" and fc["status"] == "approved" and fc["attendee_ids"] == []
    # shows up for members like any other event, and nobody was notified about the import
    assert any(e["title"] == "Pitch Night" for e in c.get("/api/events").json())
    again = c.post("/api/admin/import/events", json={"csv": csv_text, "timezone": "America/Toronto"}).json()
    assert again["created"] == 0 and "already in your events" in [r.get("reason") for r in again["rows"]]


def test_events_template_and_admin_only(club):
    c = club["c"]
    t = c.get("/api/admin/import/template/events").json()
    assert t["header"][0] == "title" and len(t["rows"]) == 2
    with TestClient(server.app) as anon:
        assert anon.post("/api/admin/import/events", json={"csv": "title,date\nx,2030-01-01"}).status_code in (401, 403)
    assert c.post("/api/admin/import/events", json={}).status_code == 400
    assert c.post("/api/admin/import/events", json={"csv": "foo,bar\n1,2"}).status_code == 400


# --------------------------------------------------------------------------- events from a calendar file
def _ics(start, uid="evt-1", title="Calendar Meetup", extra="", end=None):
    z = start.astimezone(timezone.utc)
    return ("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\n"
            f"UID:{uid}\r\nSUMMARY:{title}\r\nDTSTART:{z:%Y%m%dT%H%M%SZ}\r\n" + (f"DTEND:{(z + timedelta(hours=2)):%Y%m%dT%H%M%SZ}\r\n" if end is None else "") +
            "LOCATION:123 Queen St\\, Toronto\r\nDESCRIPTION:Bring a friend. Register: https://lu.ma/abc\r\n"
            "  more text folded\r\n" + extra + "END:VEVENT\r\nEND:VCALENDAR\r\n")


def test_calendar_file_import_and_refresh(club):
    c, slug = club["c"], club["slug"]
    start = future(15)
    r = c.post("/api/admin/import/events", json={"ics": _ics(start), "dry_run": False}).json()
    assert r["source"] == "calendar" and r["created"] == 1
    e = next(x for x in events_of(slug) if x["title"] == "Calendar Meetup")
    assert e["location"] == "123 Queen St, Toronto" and e["url"] == "https://lu.ma/abc" and e["import_uid"] == "evt-1" and e["ends_at"]
    assert "more text folded" in e["description"]
    # same calendar, the host moved it and renamed it: the event is updated, not duplicated
    moved = c.post("/api/admin/import/events", json={"ics": _ics(start + timedelta(days=1), title="Calendar Meetup (new room)"), "dry_run": False}).json()
    assert moved["created"] == 0 and moved["updated"] == 1
    es = [x for x in events_of(slug) if x.get("import_uid") == "evt-1"]
    assert len(es) == 1 and es[0]["title"] == "Calendar Meetup (new room)" and es[0]["starts_at"].startswith((start + timedelta(days=1)).astimezone(timezone.utc).strftime("%Y-%m-%d"))


def test_calendar_zones_all_day_cancelled_and_repeating(club):
    c = club["c"]
    d = future(25)
    text = ("BEGIN:VCALENDAR\r\n"
            f"BEGIN:VEVENT\r\nUID:z1\r\nSUMMARY:Local time\r\nDTSTART;TZID=America/Toronto:{d:%Y%m%dT190000}\r\nEND:VEVENT\r\n"
            f"BEGIN:VEVENT\r\nUID:z2\r\nSUMMARY:All day\r\nDTSTART;VALUE=DATE:{d:%Y%m%d}\r\nEND:VEVENT\r\n"
            f"BEGIN:VEVENT\r\nUID:z3\r\nSUMMARY:Cancelled one\r\nSTATUS:CANCELLED\r\nDTSTART:{d:%Y%m%dT190000}Z\r\nEND:VEVENT\r\n"
            f"BEGIN:VEVENT\r\nUID:z4\r\nSUMMARY:Weekly yoga\r\nRRULE:FREQ=WEEKLY\r\nDTSTART:{d:%Y%m%dT190000}Z\r\nEND:VEVENT\r\n"
            "END:VCALENDAR\r\n")
    pre = c.post("/api/admin/import/events", json={"ics": text, "timezone": "America/Toronto"}).json()
    by = {r["title"]: r for r in pre["rows"]}
    assert by["Local time"]["starts_at"] == d.replace(hour=19, minute=0).astimezone(timezone.utc).replace(microsecond=0).isoformat()
    assert any("no time" in n for n in by["All day"]["notes"])
    assert by["Cancelled one"]["status"] == "skipped" and by["Cancelled one"]["reason"] == "cancelled"
    assert any("repeats" in n for n in by["Weekly yoga"]["notes"])


# --------------------------------------------------------------------------- links
def _public_dns(monkeypatch, seen=None):
    async def fake(host):
        if seen is not None:
            seen.append(host)
        return ["93.184.216.34"]
    monkeypatch.setattr(safe_fetch, "resolve_public", fake)


def test_link_import_connects_to_the_checked_address(club, mock_http, monkeypatch):
    c, slug = club["c"], club["slug"]
    _public_dns(monkeypatch)
    f = future(30)
    sheet = f"title,date,time\nSheet Event,{f:%Y-%m-%d},{f:%H:%M}\n"

    def handler(req):
        # we dial the address that was checked, but ask for (and verify) the name the admin gave
        assert req.url.host == "93.184.216.34" and req.headers["host"] == "docs.google.com"
        assert req.url.path == "/spreadsheets/d/SHEETID123/export" and req.url.params["format"] == "csv" and req.url.params["gid"] == "7"
        return httpx.Response(200, text=sheet, headers={"content-type": "text/csv"})

    mock_http["handler"] = handler
    r = c.post("/api/admin/import/events", json={"url": "https://docs.google.com/spreadsheets/d/SHEETID123/edit#gid=7", "dry_run": False, "timezone": "America/Toronto"})
    assert r.status_code == 200 and r.json()["created"] == 1
    assert any(e["title"] == "Sheet Event" for e in events_of(slug))


def test_link_can_be_a_calendar_feed_and_follows_safe_redirects(club, mock_http, monkeypatch):
    c = club["c"]
    seen = []
    _public_dns(monkeypatch, seen)
    start = future(40)

    def handler(req):
        if req.headers["host"] == "cal.example.com":
            return httpx.Response(302, headers={"location": "https://feeds.example.org/cal.ics"})
        assert req.headers["host"] == "feeds.example.org"
        return httpx.Response(200, text=_ics(start, uid="feed-1", title="Feed event"))

    mock_http["handler"] = handler
    r = c.post("/api/admin/import/events", json={"url": "webcal://cal.example.com/me.ics"}).json()
    assert r["source"] == "calendar" and r["created"] == 1 and seen == ["cal.example.com", "feeds.example.org"]


@pytest.mark.parametrize("link", ["http://169.254.169.254/latest/meta-data", "https://localhost/x.csv", "https://127.0.0.1:8000/api/admin/users",
                                   "https://10.0.0.5/data.csv", "https://[::1]/x", "https://192.168.1.1/x.csv"])
def test_links_into_our_own_network_are_refused(club, mock_http, link):
    r = club["c"].post("/api/admin/import/events", json={"url": link})
    assert r.status_code == 400 and not mock_http["calls"]


def test_redirect_to_an_internal_address_is_refused(club, mock_http, monkeypatch):
    async def fake(host):
        if host == "evil.example.com":
            return ["93.184.216.34"]
        return ["10.0.0.9"]  # the redirect target resolves inside the network
    monkeypatch.setattr(safe_fetch, "resolve_public", lambda h: _resolve_like(fake, h))
    mock_http["handler"] = lambda req: httpx.Response(302, headers={"location": "https://inner.example.com/secret.csv"})
    r = club["c"].post("/api/admin/import/events", json={"url": "https://evil.example.com/a.csv"})
    assert r.status_code == 400 and len(mock_http["calls"]) == 1


async def _resolve_like(fake, host):
    addrs = await fake(host)
    if not all(safe_fetch._public(a) for a in addrs):
        raise safe_fetch.FetchError("That link points somewhere I'm not allowed to read.")
    return addrs


def test_friendly_explanations_for_links_that_cannot_be_read(club, mock_http, monkeypatch):
    c = club["c"]
    _public_dns(monkeypatch)
    air = c.post("/api/admin/import/events", json={"url": "https://airtable.com/shrABC123"})
    assert air.status_code == 400 and "Download CSV" in air.json()["detail"] and not mock_http["calls"]
    mock_http["handler"] = lambda req: httpx.Response(200, text="<!DOCTYPE html><html><head><title>Sign in</title></head></html>")
    page = c.post("/api/admin/import/events", json={"url": "https://example.com/sheet"})
    assert page.status_code == 400 and "web page" in page.json()["detail"]
    mock_http["handler"] = lambda req: httpx.Response(403)
    assert "isn't public" in c.post("/api/admin/import/events", json={"url": "https://example.com/private.csv"}).json()["detail"]
    mock_http["handler"] = lambda req: httpx.Response(200, content=b"a,b\n" + b"x" * 5_100_000)
    assert "too big" in c.post("/api/admin/import/events", json={"url": "https://example.com/huge.csv"}).json()["detail"]


def test_google_sheet_links_are_turned_into_csv_links():
    f = safe_fetch.friendly_url
    assert f("https://docs.google.com/spreadsheets/d/AbC_1-2/edit?usp=sharing") == "https://docs.google.com/spreadsheets/d/AbC_1-2/export?format=csv&gid=0"
    assert f("https://docs.google.com/spreadsheets/d/e/2PACX-xyz/pub?gid=0&single=true") .endswith("&output=csv")
    assert f("https://docs.google.com/spreadsheets/d/e/2PACX-xyz/pub?output=csv") == "https://docs.google.com/spreadsheets/d/e/2PACX-xyz/pub?output=csv"
    assert f("webcal://x.example.com/a.ics") == "https://x.example.com/a.ics"


# --------------------------------------------------------------------------- guest lists
def test_guest_list_marks_members_as_going(club):
    c, slug = club["c"], club["slug"]
    ann = add_member(slug, "Ann Guest", "ann@guests.example.com")
    bob = add_member(slug, "Bob Guest", "bob@guests.example.com")
    cy = add_member(slug, "Cy Guest", "cy@guests.example.com")
    ev = c.post("/api/events", json={"title": "Guest night", "starts_at": future(5).astimezone(timezone.utc).isoformat()}).json()
    csv_text = ("Name,Email,Approval Status\n"
                "Ann Guest,ANN@guests.example.com,approved\nBob Guest,bob@guests.example.com,declined\nCy Guest,cy@guests.example.com,\n"
                "Dan Outsider,dan@nowhere.example.com,approved\nnot an email,oops,approved\nAnn Guest,ann@guests.example.com,approved\n")
    pre = c.post("/api/admin/import/guests", json={"event_id": ev["id"], "csv": csv_text}).json()
    assert pre["dry_run"] and pre["added"] == 2 and pre["not_members"] == 1 and pre["skipped"] == 3
    assert c.get(f"/api/events/{ev['id']}").json()["attendee_count"] == 0
    done = c.post("/api/admin/import/guests", json={"event_id": ev["id"], "csv": csv_text, "dry_run": False}).json()
    assert done["added"] == 2
    e = run_in(slug, lambda: server.db.events.find_one({"id": ev["id"]}))
    assert set(e["attendee_ids"]) == {ann["id"], cy["id"]} and e["rsvps"][ann["id"]] == "yes" and bob["id"] not in e["attendee_ids"]
    again = c.post("/api/admin/import/guests", json={"event_id": ev["id"], "csv": csv_text}).json()
    assert again["added"] == 0
    assert c.post("/api/admin/import/guests", json={"event_id": "nope", "csv": csv_text}).status_code == 404
    assert c.post("/api/admin/import/guests", json={"event_id": ev["id"], "csv": "Name\nAnn"}).status_code == 400


# --------------------------------------------------------------------------- members from a link
def test_members_can_be_imported_from_a_link(club, mock_http, monkeypatch):
    c = club["c"]
    _public_dns(monkeypatch)
    mock_http["handler"] = lambda req: httpx.Response(200, text="name,email\nLinked Lou,lou@linked.example.com\nLinked Mae,mae@linked.example.com\n")
    url = "https://docs.google.com/spreadsheets/d/e/2PACX-abc/pub?output=csv"
    pre = c.post("/api/admin/members/import", json={"url": url, "dry_run": True}).json()
    assert pre["created"] == 2 and pre["rows"][0]["name"] == "Linked Lou"
    done = c.post("/api/admin/members/import", json={"url": url, "dry_run": False, "confirm_permission": True}).json()
    assert done["created"] == 2
    assert c.post("/api/admin/members/import", json={}).status_code == 400
