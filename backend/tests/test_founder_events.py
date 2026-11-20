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


def test_the_source_list_is_clean_and_covers_every_kind_of_page_and_city():
    srcs = job.load_sources()
    ids = [s["id"] for s in srcs]
    assert len(ids) == len(set(ids)), "two sources share an id"
    assert len({s["url"] for s in srcs}) == len(srcs), "two sources read the same page"
    assert {s["group"] for s in srcs} == {"organizer", "luma", "meetup", "eventbrite"}
    for s in srcs:
        assert s["group"] in ("organizer", "luma", "meetup", "eventbrite") and isinstance(s.get("priority"), int)
        assert set(s.get("audiences", [])) <= set(ef.AUDIENCE_STRICT), s["id"]
    cities = {s.get("city") for s in srcs}
    assert {"Toronto", "Ottawa", "Hamilton", "London", "Waterloo", "Windsor", "Kingston", "Sudbury", "Thunder Bay"} <= cities
    # Each kind of listing is read politely: a few seconds apart, so the whole round must stay under ten minutes.
    assert len(srcs) * 3 / 60 < 10


def test_a_groups_own_page_can_say_who_its_events_are_made_for():
    src = {**ORG, "id": "mg", "audiences": ["women", "not-a-group"]}
    e = clean(ev("Fireside chat with a founder", 5), src)
    assert e and e["audiences"] == ["women"]
    both = clean(ev("Black Founders Mixer", 5), {**ORG, "id": "x", "audiences": ["women"]})
    assert both["audiences"] == ["black", "women"]
    plain = clean(ev("Fireside chat with a founder", 5), ORG)
    assert plain["audiences"] == []
    # and such an event goes to "others" for a founder who did not say they belong to that group
    out = ef.rank_events([e], {"stage": "launched", "province": "ON", "needs": [], "audiences": []}, TODAY)
    assert out["events"] == [] and out["others"][0]["fit"] == "skip"
    mine = ef.rank_events([e], {"stage": "launched", "province": "ON", "needs": [], "audiences": ["women"]}, TODAY)
    assert len(mine["events"]) == 1


# ---------------------------------------------------------------------------------------------------- the endpoints
def test_the_endpoint_ranks_for_the_signed_in_founder_and_hides_admin_tools():
    with TestClient(server.app) as c:
        c.cookies.clear()
        db = server.hub_db()
        events = [e for e in (ef.normalize(r, ORG, datetime.now(timezone.utc)) for r in ef.parse_jsonld(ld(
            {**ev("Founder funding mixer", 0), "startDate": (datetime.now(timezone.utc) + timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%S+00:00"), "endDate": (datetime.now(timezone.utc) + timedelta(days=3, hours=2)).strftime("%Y-%m-%dT%H:%M:%S+00:00")},
            {**ev("Startup pitch night in Calgary", 0, city="Calgary", region="AB"), "startDate": (datetime.now(timezone.utc) + timedelta(days=4)).strftime("%Y-%m-%dT%H:%M:%S+00:00"), "endDate": (datetime.now(timezone.utc) + timedelta(days=4, hours=2)).strftime("%Y-%m-%dT%H:%M:%S+00:00")}), "https://example.org")) if e]
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


# ---------------------------------------------------------------------------------------------------- relevance and the fit notes
MEETUP = {**SRC, "id": "mu", "name": "Founders Toronto (Meetup)", "kind": "meetup", "group": "meetup", "priority": 3, "founder": True}


def test_a_founder_group_page_does_not_let_everyday_events_through():
    for title, desc in [("Free Spanish Conversation Practice", "Practise Spanish with other members, all levels."),
                        ("Sunday yoga in the park", "Bring a mat."), ("Board games night", "Come play."), ("Salsa social", "Beginner lesson at 8"),
                        ("Kids coding club", "Ages 6 to 10")]:
        assert clean(ev(title, 3, online=True, city="", region="", country="", desc=desc), MEETUP) is None, title
    keep = clean(ev("Small business owners networking night", 3), MEETUP)
    assert keep and "network" in keep["topics"]
    assert clean(ev("How to price your services", 3, desc="A workshop for freelancers and consultants."), MEETUP)
    # an organizer page that is all about founders is still trusted for ordinary titles
    assert clean(ev("Community breakfast", 3), ORG)
    # but not for a hobby event
    assert clean(ev("Pottery night for kids", 3), ORG) is None


def test_every_event_says_why_it_may_fit_and_why_it_may_not():
    mixer = clean(ev("Founder networking mixer", 5, price=25), ORG)
    funding = clean(ev("Seed funding office hours with investors", 6, price=0), ORG)
    out = ef.rank_events([mixer, funding], {"stage": "launched", "province": "ON", "city": "Ottawa", "needs": ["funding"], "audiences": []}, TODAY)
    rows = {e["title"]: e for e in out["events"] + out["others"]}
    for e in rows.values():
        assert e["reasons"] and e["cautions"], e["title"]
    m, f = rows["Founder networking mixer"], rows["Seed funding office hours with investors"]
    assert any("Not about what you asked for" in c for c in m["cautions"]) and any("Paid" in c for c in m["cautions"]) and any("not Ottawa" in c for c in m["cautions"])
    assert any("meeting other founders" in r for r in m["reasons"])
    assert any("funding" in r for r in f["reasons"]) and any("Free" in r for r in f["reasons"])
    # a visitor with no startup is told the match is general
    anon = ef.rank_events([mixer], None, TODAY)["events"][0]
    assert any("do not know your startup" in c for c in anon["cautions"])


# Real listings found on the live site on 2026-11-20 (title, description, source). The first group must go, the second must stay.
LIVE_BAD = [
    ("meetup", "💃 Free Spanish Conversation Practice", "¡Hola! Looking for a friendly place to practise speaking Spanish and meet new people? Join us for free Spanish conversation practice."),
    ("meetup", "🌍 English Practice | Meet Friends (Professional Host)", "Practice English online in a fun, supportive space, for free! Get real-time speaking experience, meet new people."),
    ("luma", "Free GPU Workshop: Fine-Tune Your Own Text-to-SQL Model on an Nvidia H100 GPU", ""),
    ("eventbrite", "Copy of Investor Connect: Pitch & Networking — Toronto", "Evening designed specifically for investors, scouts and founders"),
    ("eventbrite", "16th Global Conf. on Entrepreneurship, Startups, Investment, & Inter Trade", "An in-person global conference on entrepreneurship, startups, investment, and international trade."),
]
LIVE_GOOD = [
    ("meetup", "🚀Toronto Founder Walk Entrepreneurs, Startups & Business Owners", "What if networking was just going for a walk with interesting people? founders and business owners"),
    ("meetup", "Transitioning from Founder-Led Sales to a Repeatable Revenue Engine", "If your leads live in spreadsheets, your startup has a bottleneck: the founder."),
    ("eventbrite", "Toronto's Networking Night for Entrepreneurs", "A monthly in person networking event focused on marketing and sales, where business owners and entrepreneurs connect."),
    ("luma", "AI Builder Café: Build Your AI Revenue & Operations Team", ""),
    ("meetup", "🚀Meetup for Entrepreneurs by F4F", "Founders for Founders brings you Real conversations for Entrepreneurs building Startups around the world."),
    ("eventbrite", "Toronto Mom Networking Group | Women Entrepreneurs + Baby-Friendly Meetup", "Toronto mompreneur networking event for women in business."),
]


def test_real_off_topic_listings_are_dropped_and_real_founder_listings_stay():
    for kind, title, desc in LIVE_BAD:
        src = {**SRC, "id": "x", "kind": kind, "group": kind, "founder": True}
        assert clean(ev(title, 5, online=True, city="", region="", country="", desc=desc), src) is None, title
    for kind, title, desc in LIVE_GOOD:
        src = {**SRC, "id": "x", "kind": kind, "group": kind, "founder": True}
        assert clean(ev(title, 5, desc=desc), src), title


def test_a_weekly_event_is_listed_a_few_times_not_sixteen():
    evs = [clean(ev("Founder Coffee", d, url=f"https://example.org/fc{d}"), {**ORG, "id": "s1"}) for d in range(1, 12)]
    evs += [clean(ev("Pitch night", 4), {**ORG, "id": "s1"}), clean(ev("Founder Coffee", 2, url="https://example.org/other"), {**ORG, "id": "s2"})]
    kept = ef.cap_series([e for e in evs if e])
    assert sum(1 for e in kept if e["source_id"] == "s1" and e["title"] == "Founder Coffee") == 3
    assert any(e["title"] == "Pitch night" for e in kept) and any(e["source_id"] == "s2" for e in kept)


def test_old_off_topic_events_leave_when_the_page_is_read_again(one_source):
    db = fake_db()
    bad = ld(ev("Free Spanish Conversation Practice", 3, online=True, city="", region="", country="", desc="Practise speaking Spanish"))
    good = ld(ev("Founder funding mixer", 4))
    run(job.refresh_all(db, fetch=make_fetch({"https://org.example/events": good}), delay=0, now=NOW))
    assert run(db.founder_events.count_documents({})) == 1
    # the source later lists only the off-topic event: the stored founder event goes, and nothing off-topic is stored
    run(job.refresh_all(db, fetch=make_fetch({"https://org.example/events": bad}), delay=0, now=NOW))
    assert run(db.founder_events.count_documents({})) == 0


def test_a_deploy_clears_stored_events_the_rules_no_longer_keep(monkeypatch):
    db = fake_db()
    srcs = [{"id": "meetup-founders-toronto", "name": "Founders Toronto", "group": "meetup", "kind": "meetup", "url": "https://www.meetup.com/founders-toronto/events/", "province": "ON", "city": "Toronto", "priority": 3, "founder": True},
            {"id": "dmz", "name": "DMZ", "group": "organizer", "kind": "auto", "url": "https://dmz.example/events", "province": "ON", "city": "Toronto", "priority": 1, "founder": True}]
    def row(i, title, sid, summary=""):
        return {"id": i, "title": title, "summary": summary, "source_id": sid, "date": "2026-12-01", "start": "2026-12-01T18:00:00+00:00", "end": "2026-12-01T20:00:00+00:00"}
    for r in [row("1", "Free Spanish Conversation Practice", "meetup-founders-toronto", "Practise Spanish"), row("2", "Startup pitch night", "meetup-founders-toronto", "Founders pitch to investors"),
              row("3", "Community breakfast", "dmz"), row("4", "Old event from a source we removed", "removed-source", "Founders")]:
        run(db.founder_events.insert_one(r))
    import json as _json
    from pathlib import Path
    tmp = Path(__file__).parent / "_tmp_sources.json"
    tmp.write_text(_json.dumps({"sources": srcs}))
    try:
        monkeypatch.setattr(job, "SOURCES_FILE", tmp)
        assert run(job.purge_irrelevant(db)) == 2
    finally:
        tmp.unlink()
    assert sorted(e["id"] for e in run(job.load_events(db))) == ["2", "3"]


def test_the_reader_runs_again_after_a_rules_change_not_only_after_eleven_hours():
    now = datetime.now(timezone.utc)
    fresh = {"at": (now - timedelta(hours=1)).isoformat(), "rules": job.RULES_VERSION}
    assert job.is_due(fresh, now) is False
    assert job.is_due({**fresh, "rules": "older"}, now) is True and job.is_due({"at": fresh["at"]}, now) is True
    assert job.is_due({"at": (now - timedelta(hours=12)).isoformat(), "rules": job.RULES_VERSION}, now) is True
    assert job.is_due(None, now) is True
