"""Founder events: reading event data from public pages, keeping what a founder needs, ranking it for one startup profile, and the polite reader."""
import asyncio
import json
import os
import sys
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"

import pytest
from fastapi.testclient import TestClient

import events_feed as ef
import events_job as job
import server
from safe_fetch import FetchError

NOW = datetime(2026, 10, 29, 15, 0, tzinfo=timezone.utc)
TODAY = NOW.date()


def iso(days, hour=18):
    return (NOW + timedelta(days=days)).replace(hour=hour, minute=0).strftime("%Y-%m-%dT%H:%M:%S-04:00")


def ld(*events):
    return "<html><head><script type=\"application/ld+json\">" + json.dumps({"@context": "https://schema.org", "@type": "ItemList", "itemListElement": [{"@type": "ListItem", "item": e} for e in events]}) + "</script></head></html>"


def ev(name, days, city="Toronto", region="ON", desc="", price=None, online=False, country="CA", url=None):
    d = {"@type": "Event", "name": name, "startDate": iso(days), "endDate": iso(days, 20), "url": url or f"https://example.org/e/{abs(hash(name)) % 10**6}", "description": desc,
         "location": {"@type": "Place", "name": "MaRS Discovery District", "address": {"@type": "PostalAddress", "addressLocality": city, "addressRegion": region, "addressCountry": country}}}
    if online:
        d["eventAttendanceMode"] = "https://schema.org/OnlineEventAttendanceMode"
        d["location"] = {"@type": "VirtualLocation", "url": "https://example.org/join"}
    if price is not None:
        d["offers"] = {"@type": "Offer", "price": price, "priceCurrency": "CAD"}
    return d


SRC = {"id": "t", "name": "Test source", "kind": "eventbrite", "province": "ON", "city": "Toronto", "priority": 4, "founder": False}
ORG = {**SRC, "id": "org", "name": "DMZ", "kind": "auto", "priority": 1, "founder": True}


# ---------------------------------------------------------------------------------------------------- readers
def test_jsonld_reads_events_inside_an_item_list_and_standalone():
    html = ld(ev("Founder Mixer", 3, price=0)) + "<script type=\"application/ld+json\">" + json.dumps(ev("Pitch Night", 5)) + "</script>"
    rows = ef.parse_jsonld(html, "https://example.org")
    assert [r["title"] for r in rows] == ["Founder Mixer", "Pitch Night"]
    assert rows[0]["price"] == 0 and rows[0]["city"] == "Toronto" and rows[0]["region"] == "ON"


def test_jsonld_ignores_broken_blocks_and_non_events():
    html = "<script type='application/ld+json'>{not json</script><script type='application/ld+json'>{\"@type\":\"Organization\",\"name\":\"x\"}</script>"
    assert ef.parse_jsonld(html) == []


def test_next_data_reads_a_luma_style_page():
    page = {"props": {"pageProps": {"initialData": {"featured_items": [{"event": {"name": "Toronto Founders Dinner", "start_at": iso(4), "url": "founders-dinner", "geo_address_info": {"city": "Toronto", "region": "Ontario"}}}]}}}}
    html = f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(page)}</script>'
    rows = ef.parse_events("luma", html, "https://luma.com/thetorontotechscene")
    assert rows and rows[0]["title"] == "Toronto Founders Dinner" and rows[0]["url"] == "https://luma.com/founders-dinner"


def test_ics_feed_is_read_with_folded_lines():
    ics = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Startup office hours\nDTSTART:20261105T180000Z\nLOCATION:100 King St\\, Toronto\nDESCRIPTION:Meet a mentor\n and ask anything\nURL:https://example.org/oh\nEND:VEVENT\nEND:VCALENDAR"
    rows = ef.parse_events("ics", ics)
    assert rows[0]["title"] == "Startup office hours" and "ask anything" in rows[0]["summary"] and rows[0]["url"] == "https://example.org/oh"


# ---------------------------------------------------------------------------------------------------- cleaning
def clean(raw, src=SRC):
    return ef.normalize(ef.parse_jsonld(ld(raw), "https://example.org")[0], src, NOW)


def test_a_founder_event_is_kept_with_where_when_and_what_it_is_good_for():
    e = clean(ev("Startup Founders Networking Mixer", 3, desc="Meet other founders and investors over drinks.", price=0))
    assert e["province"] == "ON" and e["price"] == "free" and e["date"] == (TODAY + timedelta(days=3)).isoformat()
    assert "network" in e["topics"] and e["online"] is False and e["url"].startswith("https://")


def test_events_that_are_past_far_off_abroad_or_off_topic_are_dropped():
    assert clean(ev("Startup Mixer", -5)) is None
    assert clean(ev("Startup Mixer", 400)) is None
    assert clean(ev("Startup Mixer", 3, city="Austin", region="TX", country="US")) is None
    assert clean(ev("Salsa night for everyone", 3)) is None                       # broad listing and nothing founder about it
    assert clean(ev("Founder speed dating and passive income secrets", 3)) is None  # noise


def test_a_trusted_organizer_page_keeps_events_without_founder_words():
    e = clean(ev("Office hours with an IP lawyer", 6), ORG)
    assert e and "mentorship" in e["topics"]


def test_online_events_have_no_province_requirement():
    e = clean(ev("Founders webinar: raising a seed round", 8, online=True, city="", region="", country=""))
    assert e and e["online"] is True and e["topics"]


def test_group_events_are_tagged_but_a_venue_name_is_not_a_group():
    assert ef.classify("Black Founders Mixer", "")["audiences"] == ["black"]
    assert ef.classify("Women in Startups breakfast", "")["audiences"] == ["women"]
    assert ef.classify("Startup mixer at the Black Hole Cafe", "")["audiences"] == []


def test_the_same_event_on_two_sites_keeps_the_organizers_page():
    a = clean(ev("Startup Pitch Night", 5, url="https://eventbrite.ca/e/1"))
    b = clean(ev("Startup Pitch Night", 5, url="https://dmz.torontomu.ca/e/1"), ORG)
    kept = ef.dedupe([a, b])
    assert len(kept) == 1 and kept[0]["source_id"] == "org"


# ---------------------------------------------------------------------------------------------------- ranking
def make(*specs):
    out = []
    for name, days, kw in specs:
        e = clean(ev(name, days, **kw), ORG)
        assert e, name
        out.append(e)
    return out


def test_ranking_puts_provincial_and_online_events_first_and_says_why():
    events = make(("Seed investor mixer for founders", 2, {}), ("Founder webinar on pricing", 3, {"online": True, "city": "", "region": "", "country": ""}),
                  ("Calgary startup pitch night", 4, {"city": "Calgary", "region": "AB"}))
    r = ef.rank_events(events, {"stage": "launched", "province": "ON", "needs": ["funding"]}, TODAY)
    assert [e["title"] for e in r["events"]] == ["Seed investor mixer for founders", "Founder webinar on pricing"]
    mixer = r["events"][0]
    assert mixer["fit"] == "strong" and any("funding" in x for x in mixer["reasons"]) and any("ON" in x for x in mixer["reasons"])
    assert r["others"][0]["title"].startswith("Calgary") and "outside your province" in r["others"][0]["cautions"][0]
    assert r["totals"] == {"fit": 2, "others": 1, "all": 3}


def test_events_made_for_a_group_only_go_to_that_group():
    events = make(("Black Founders Mixer", 2, {}), ("Startup meetup", 3, {}))
    plain = ef.rank_events(events, {"stage": "launched", "province": "ON", "needs": ["network"]}, TODAY)
    assert [e["title"] for e in plain["events"]] == ["Startup meetup"]
    assert "Made for Black founders" in plain["others"][0]["cautions"][0]
    mine = ef.rank_events(events, {"stage": "launched", "province": "ON", "needs": ["network"], "audiences": ["black"]}, TODAY)
    assert {e["title"] for e in mine["events"]} == {"Black Founders Mixer", "Startup meetup"}
    assert any("which you are" in x for x in next(e for e in mine["events"] if e["title"].startswith("Black"))["reasons"])


def test_filters_narrow_the_list():
    events = make(("Startup mixer free", 2, {"price": 0}), ("Founder workshop paid", 3, {"price": 40}), ("Founder webinar online", 4, {"online": True, "city": "", "region": "", "country": ""}))
    prof = {"stage": "launched", "province": "ON", "needs": []}
    assert [e["title"] for e in ef.rank_events(events, prof, TODAY, {"free": True})["events"]] == ["Startup mixer free"]
    assert [e["title"] for e in ef.rank_events(events, prof, TODAY, {"online": True})["events"]] == ["Founder webinar online"]
    assert len(ef.rank_events(events, prof, TODAY, {"q": "workshop"})["events"]) == 1
    assert ef.rank_events(events, prof, TODAY, {"days": 1})["events"] == []


def test_week_labels():
    assert ef.week_label(TODAY, TODAY) == "This week"
    assert ef.week_label(TODAY + timedelta(days=8), TODAY) == "Next week"
    assert ef.week_label(TODAY + timedelta(days=40), TODAY).endswith("2026")


# ---------------------------------------------------------------------------------------------------- the reader
def run(coro):
    return asyncio.get_event_loop_policy().new_event_loop().run_until_complete(coro)


def fake_db():
    from mongomock_motor import AsyncMongoMockClient
    return AsyncMongoMockClient()["events_test"]


def make_fetch(pages, robots="User-agent: *\nAllow: /"):
    calls = []

    async def fetch(url, **_):
        calls.append(url)
        if url.endswith("/robots.txt"):
            if robots is None:
                raise FetchError("That page does not exist (HTTP 404). The address may have changed.")
            if robots == "ERR":
                raise FetchError("The site answered with an error (HTTP 500).")
            return robots
        if url not in pages:
            raise FetchError("That page does not exist (HTTP 404). The address may have changed.")
        v = pages[url]
        if isinstance(v, Exception):
            raise v
        return v

    fetch.calls = calls
    return fetch


@pytest.fixture
def one_source(monkeypatch):
    monkeypatch.setattr(job, "load_sources", lambda: [{"id": "s1", "name": "Org", "group": "organizer", "kind": "auto", "url": "https://org.example/events", "province": "ON", "city": "Toronto", "priority": 1, "founder": True}])


def test_the_reader_stores_events_and_records_the_run(one_source):
    db = fake_db()
    page = ld(ev("Founder office hours", 4), ev("Startup pitch night", 6))
    res = run(job.refresh_all(db, fetch=make_fetch({"https://org.example/events": page}), delay=0, now=NOW))
    assert res["ok"] == 1 and res["runs"][0]["kept"] == 2
    assert len(run(job.load_events(db))) == 2
    assert run(db.founder_event_runs.find_one({"source_id": "s1"}))["ok"] is True


def test_the_reader_obeys_robots_txt(one_source):
    db = fake_db()
    fetch = make_fetch({"https://org.example/events": ld(ev("Startup mixer", 4))}, robots="User-agent: *\nDisallow: /events")
    res = run(job.refresh_all(db, fetch=fetch, delay=0, now=NOW))
    assert res["runs"][0]["ok"] is False and "robots.txt" in res["runs"][0]["error"]
    assert "https://org.example/events" not in fetch.calls
    # a broken robots.txt is not guessed at either
    res2 = run(job.refresh_all(fake_db(), fetch=make_fetch({"https://org.example/events": ld(ev("Startup mixer", 4))}, robots="ERR"), delay=0, now=NOW))
    assert res2["runs"][0]["ok"] is False
    # no robots.txt at all means no restrictions
    res3 = run(job.refresh_all(fake_db(), fetch=make_fetch({"https://org.example/events": ld(ev("Startup mixer", 4))}, robots=None), delay=0, now=NOW))
    assert res3["runs"][0]["ok"] is True


def test_a_page_that_changes_shape_never_wipes_good_events(one_source):
    db = fake_db()
    run(job.refresh_all(db, fetch=make_fetch({"https://org.example/events": ld(ev("Founder office hours", 4))}), delay=0, now=NOW))
    res = run(job.refresh_all(db, fetch=make_fetch({"https://org.example/events": "<html>new design, no data</html>"}), delay=0, now=NOW))
    assert res["runs"][0]["found"] == 0 and "no events were found" in res["runs"][0]["error"]
    assert len(run(job.load_events(db))) == 1
    # and a failing page keeps them too
    run(job.refresh_all(db, fetch=make_fetch({"https://org.example/events": FetchError("The site refused the request (HTTP 403).")}), delay=0, now=NOW))
    assert len(run(job.load_events(db))) == 1


def test_an_event_that_disappears_from_a_working_page_is_removed(one_source):
    db = fake_db()
    run(job.refresh_all(db, fetch=make_fetch({"https://org.example/events": ld(ev("Founder office hours", 4), ev("Startup pitch night", 6))}), delay=0, now=NOW))
    run(job.refresh_all(db, fetch=make_fetch({"https://org.example/events": ld(ev("Startup pitch night", 6))}), delay=0, now=NOW))
    assert [e["title"] for e in run(job.load_events(db))] == ["Startup pitch night"]


def test_groups_can_be_switched_off(monkeypatch):
    monkeypatch.setenv("EVENTS_GROUPS_OFF", "eventbrite,meetup")
    groups = {s["group"] for s in job.load_sources()}
    assert "eventbrite" not in groups and "meetup" not in groups and "organizer" in groups
    monkeypatch.delenv("EVENTS_GROUPS_OFF")
    assert {"eventbrite", "meetup", "luma", "organizer"} <= {s["group"] for s in job.load_sources()}


def test_every_source_is_https_and_has_a_name():
    for s in job.load_sources():
        assert s["url"].startswith("https://") and s["name"] and s["kind"] in ("auto", "ics", "luma", "meetup", "eventbrite") and s["id"]


# ---------------------------------------------------------------------------------------------------- the endpoints
def test_the_endpoint_ranks_for_the_signed_in_founder_and_hides_admin_tools():
    with TestClient(server.app) as c:
        c.cookies.clear()
        db = server.hub_db()
        events = [e for e in (ef.normalize(r, ORG, datetime.now(timezone.utc)) for r in ef.parse_jsonld(ld(
            {**ev("Founder funding mixer", 0), "startDate": (datetime.now(timezone.utc) + timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%S+00:00")},
            {**ev("Startup pitch night in Calgary", 0, city="Calgary", region="AB"), "startDate": (datetime.now(timezone.utc) + timedelta(days=4)).strftime("%Y-%m-%dT%H:%M:%S+00:00")}), "https://example.org")) if e]
        assert len(events) == 2
        run(db.founder_events.delete_many({}))
        for e in events:
            run(db.founder_events.insert_one(dict(e)))
        r = c.get("/api/founder-events")
        assert r.status_code == 200 and r.json()["signed_in"] is False
        assert [e["title"] for e in r.json()["events"]] == ["Founder funding mixer"] and r.json()["others"][0]["title"].startswith("Startup pitch night in Calgary")
        assert c.get("/api/founder-events/status").status_code in (401, 403)
        assert c.post("/api/hub/signup", json={"accepted_terms": True, "email": "events-founder@example.com", "password": "Sup3rSecret!", "name": "Evie"}).status_code == 201
        c.patch("/api/hub/profile", json={"startup": {"name": "E", "stage": "launched", "needs": ["funding"], "province": "ON"}})
        mine = c.get("/api/founder-events").json()
        assert mine["signed_in"] and mine["has_profile"] and mine["events"][0]["fit"] == "strong"
        assert mine["events"][0]["week"] in ("This week", "Next week") and mine["events"][0]["topic_labels"]
        assert c.get("/api/founder-events/status").status_code == 403
        assert c.post("/api/founder-events/refresh").status_code == 403
        assert c.get("/api/founder-events?free=true").json()["events"] == []


def test_a_late_evening_event_stays_on_its_own_day_with_its_own_clock_time():
    raw = ev("Startup founders night", 3)
    raw["startDate"] = (NOW + timedelta(days=3)).strftime("%Y-%m-%dT21:30:00-04:00")   # 01:30 UTC the next day
    e = clean(raw)
    assert e["date"] == (TODAY + timedelta(days=3)).isoformat() and e["time"] == "21:30"
    assert clean(ev("Startup meetup", 3))["time"] == "18:00"
