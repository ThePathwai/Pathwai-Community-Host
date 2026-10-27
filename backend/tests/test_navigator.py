"""Navigator: the program catalog, the matching rules (reasons, cautions, hard exclusions), the public API,
and the community admin's own programs and opt-in profile."""
import json
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"
os.environ.pop("EMERGENT_LLM_KEY", None)

import pytest
from fastapi.testclient import TestClient

import navigator as nav
import server

TODAY = date(2026, 10, 27)
PROGRAMS = nav.load_catalog()["programs"]


def by_id(pid):
    return next(p for p in PROGRAMS if p["id"] == pid)


# --------------------------------------------------------------------------- catalog hygiene
def test_every_catalog_entry_is_complete_and_honest():
    ids = set()
    for p in PROGRAMS:
        assert p["id"] not in ids
        ids.add(p["id"])
        assert p["name"] and p["org"] and p["summary"] and p["apply_url"].startswith("https://")
        assert p["source_url"].startswith("https://")
        assert p["type"] in nav.TYPES and p["status"] in nav.STATUSES and p["phase"] in nav.PHASE_ORDER
        assert p["verified"] in ("official", "third_party", "unconfirmed") and p["last_checked"]
        assert set(p["stages"]) <= set(nav.STAGES) and set(p["needs"]) <= set(nav.NEEDS) and set(p["audiences"]) <= set(nav.AUDIENCES)
        assert set(p["restricted_to"]) <= set(nav.AUDIENCES)
        assert p["deadline"]["kind"] in ("fixed", "rolling", "annual", "none_published", "closed")
        if p["deadline"]["kind"] == "fixed":
            date.fromisoformat(p["deadline"]["date"])
        # a closed or paused program must never read as open
        if p["status"] in ("closed", "paused"):
            assert p["deadline"]["kind"] in ("closed", "none_published")


def test_a_passed_fixed_deadline_counts_as_closed():
    p = by_id("ovin-rd")
    assert nav.effective_status(p, date(2026, 10, 27)) == "open"
    assert nav.effective_status(p, date(2026, 11, 5)) == "closed"


# --------------------------------------------------------------------------- matching rules
def test_group_specific_programs_are_skipped_unless_you_are_in_the_group():
    plain = nav.normalize_profile({"stage": "launched", "needs": ["funding"]})
    assert nav.evaluate(by_id("belf"), plain, TODAY)["fit"] == "skip"
    black = nav.normalize_profile({"stage": "launched", "needs": ["funding"], "audiences": ["black"]})
    ev = nav.evaluate(by_id("belf"), black, TODAY)
    assert ev["fit"] in ("strong", "possible") and any("funding" in r for r in ev["reasons"])


def test_province_age_and_student_limits_are_hard_rules():
    bc = nav.normalize_profile({"stage": "idea", "province": "BC", "age": 20, "student": True})
    assert nav.evaluate(by_id("summer-company"), bc, TODAY)["fit"] == "skip"  # Ontario only
    old = nav.normalize_profile({"stage": "idea", "age": 41})
    assert nav.evaluate(by_id("futurpreneur-core"), old, TODAY)["fit"] == "skip"
    not_student = nav.normalize_profile({"stage": "idea", "age": 20})
    assert nav.evaluate(by_id("summer-company"), not_student, TODAY)["fit"] == "skip"
    ok = nav.normalize_profile({"stage": "idea", "age": 20, "student": True, "needs": ["funding"]})
    assert nav.evaluate(by_id("summer-company"), ok, TODAY)["fit"] in ("strong", "possible")


def test_not_incorporated_means_later_not_never():
    p = nav.normalize_profile({"stage": "prototype", "incorporated": "no", "needs": ["funding", "rd"]})
    ev = nav.evaluate(by_id("irap"), p, TODAY)
    assert ev["fit"] == "later" and "incorporated" in ev["cautions"][0].lower()


def test_closed_and_paused_programs_carry_a_warning_and_rank_below_open_ones():
    p = nav.normalize_profile({"stage": "idea", "audiences": ["newcomer"], "needs": ["visa"]})
    ev = nav.evaluate(by_id("startup-visa"), p, TODAY)
    assert any("Paused" in c for c in ev["cautions"])
    women = nav.normalize_profile({"stage": "revenue", "audiences": ["women"], "needs": ["funding"], "employees": 8})
    wef = nav.evaluate(by_id("wef"), women, TODAY)
    csb = nav.evaluate(by_id("csbfp"), women, TODAY)
    assert wef["score"] < csb["score"] and any("Closed" in c for c in wef["cautions"])


def test_no_published_deadline_is_said_out_loud_not_invented():
    p = nav.normalize_profile({"stage": "revenue", "needs": ["export"], "incorporated": "yes", "employees": 10})
    ev = nav.evaluate(by_id("canexport-smes"), p, TODAY)
    assert any("No deadline was published" in c for c in ev["cautions"])


def test_a_near_fixed_deadline_is_called_out():
    p = nav.normalize_profile({"stage": "launched", "needs": ["funding"], "sectors": ["mobility"], "incorporated": "yes", "employees": 5})
    ev = nav.evaluate(by_id("ovin-rd"), p, TODAY)
    assert any("Closes in 8 days" in r for r in ev["reasons"])


def test_sector_specific_programs_need_a_sector_match():
    food = nav.normalize_profile({"stage": "prototype", "sectors": ["food"], "needs": ["rd"], "incorporated": "yes"})
    assert nav.evaluate(by_id("venturelab-hci"), food, TODAY)["fit"] == "skip"


def test_suggest_returns_reasons_a_path_and_counts_what_it_left_out():
    res = nav.suggest(PROGRAMS, {"stage": "prototype", "needs": ["funding", "mentorship"], "audiences": ["black"], "age": 27, "sectors": ["tech"], "incorporated": "no"}, TODAY)
    assert res["matches"] and res["skipped"] > 0
    for m in res["matches"]:
        assert m["reasons"], m["name"]
    assert [m["score"] for m in res["matches"]] == sorted((m["score"] for m in res["matches"]), reverse=True)
    assert res["path"] and res["path"][0]["why"]
    assert res["summary"].startswith("You're at the prototype stage")
    assert {x["name"] for x in res["later"]} >= {"NRC IRAP"}  # needs incorporating first


def test_garbage_profile_is_clamped_not_trusted():
    p = nav.normalize_profile({"stage": "wizard", "audiences": ["x", "black", "black"], "age": "banana", "province": "ZZ", "needs": ["funding", "bogus"], "goal": "g" * 900})
    assert p["stage"] == "idea" and p["audiences"] == ["black"] and p["age"] is None and p["province"] == "ON"
    assert p["needs"] == ["funding"] and len(p["goal"]) == 500


def test_young_age_adds_the_youth_audience_automatically():
    assert "youth" in nav.normalize_profile({"age": 24})["audiences"]


def test_community_listings_are_validated():
    with pytest.raises(ValueError):
        nav.clean_listing({"name": "x"})
    with pytest.raises(ValueError):
        nav.clean_listing({"name": "Pitch night", "apply_url": "javascript:alert(1)"})
    with pytest.raises(ValueError):
        nav.clean_listing({"name": "Pitch night", "deadline_kind": "fixed", "deadline_date": "soon"})
    ok = nav.clean_listing({"name": "Pitch night", "stages": ["idea", "nope"], "needs": ["funding"], "deadline_date": "2026-12-01", "apply_url": "https://example.com/pitch"})
    assert ok["stages"] == ["idea"] and ok["deadline"] == {"kind": "fixed", "date": "2026-12-01", "note": ""}


# --------------------------------------------------------------------------- the API
@pytest.fixture(scope="module")
def club():
    with TestClient(server.app) as client:
        r = client.post("/api/hub/signup", json={"accepted_terms": True, "email": "nav.admin@example.com", "password": "NavPass12345", "name": "Nav Admin"})
        assert r.status_code == 201, r.text
        r = client.post("/api/hub/communities", json={"name": "Nav Hub", "category": "professional"})
        assert r.status_code == 201, r.text
        client.headers.update({"X-Community": r.json()["slug"]})
        yield {"c": client, "slug": r.json()["slug"]}


def test_public_directory_needs_no_login():
    with TestClient(server.app) as c:
        meta = c.get("/api/navigator/meta").json()
        assert meta["count"] == len(PROGRAMS) and [s["key"] for s in meta["stages"]] == nav.STAGES
        live = c.get("/api/navigator/programs", params={"status": "live"}).json()
        assert live["count"] and all(p["status"] in ("open", "rolling") for p in live["programs"])
        assert c.get("/api/navigator/programs", params={"q": "tax credit"}).json()["count"] >= 2
        assert c.get("/api/navigator/programs/irap").json()["name"] == "NRC IRAP"
        assert c.get("/api/navigator/programs/nope").status_code == 404


def test_suggest_over_the_api():
    with TestClient(server.app) as c:
        r = c.post("/api/navigator/suggest", json={"profile": {"stage": "revenue", "needs": ["export"], "incorporated": "yes", "employees": 10}})
        assert r.status_code == 200
        body = r.json()
        assert body["matches"][0]["id"] == "canexport-smes"
        assert body["narrative"] and body["narrative_by"] == "rules"  # no model key in tests
        assert c.post("/api/navigator/suggest", json={"profile": {"stage": "idea", "age": "oops"}}).status_code in (200, 422)


def test_admin_routes_need_an_admin_login():
    with TestClient(server.app) as c:
        assert c.get("/api/navigator/admin").status_code in (401, 403)
        assert c.post("/api/navigator/admin/programs", json={"name": "Nope nope"}).status_code in (401, 403)


def test_a_community_stays_out_of_the_directory_until_the_admin_opts_in(club):
    c, slug = club["c"], club["slug"]
    add = c.post("/api/navigator/admin/programs", json={"name": "Founders Friday", "org": "Nav Hub", "type": "mentorship", "stages": ["idea", "prototype"], "needs": ["mentorship", "network"], "summary": "Weekly office hours."})
    assert add.status_code == 201, add.text
    pid = add.json()["id"]

    with TestClient(server.app) as anon:
        assert not any(p.get("community") for p in anon.get("/api/navigator/programs").json()["programs"])  # not opted in yet

    prof = c.put("/api/navigator/admin/profile", json={"public": True, "blurb": "Peer founders in Toronto.", "stages": ["idea", "prototype"], "provides": ["mentorship", "network"], "city": "Toronto", "provinces": ["ON"]})
    assert prof.status_code == 200 and prof.json()["public"] is True

    with TestClient(server.app) as anon:
        listed = [p for p in anon.get("/api/navigator/programs").json()["programs"] if p.get("community")]
        assert listed and listed[0]["community"]["slug"] == slug and listed[0]["name"] == "Founders Friday"
        res = anon.post("/api/navigator/suggest", json={"profile": {"stage": "idea", "needs": ["mentorship"], "city": "Toronto"}}).json()
        assert any(m["name"] == "Founders Friday" for m in res["matches"])
        com = next(x for x in res["communities"] if x["slug"] == slug)
        assert com["reasons"] and com["score"] > 0

    # edit, then remove
    up = c.patch(f"/api/navigator/admin/programs/{pid}", json={"status": "closed", "amount": "Free"})
    assert up.status_code == 200 and up.json()["status"] == "closed"
    assert c.delete(f"/api/navigator/admin/programs/{pid}").status_code == 200
    assert c.delete(f"/api/navigator/admin/programs/{pid}").status_code == 404

    # opting back out removes the community again
    c.put("/api/navigator/admin/profile", json={"public": False})
    with TestClient(server.app) as anon:
        assert not any(x["slug"] == slug for x in anon.post("/api/navigator/suggest", json={"profile": {"stage": "idea", "needs": ["mentorship"]}}).json()["communities"])


def test_admin_overview_reports_what_members_said_they_need(club):
    c, slug = club["c"], club["slug"]
    import asyncio, uuid
    from routes.hub import in_community

    async def seed():
        for i, needs in enumerate([["Need a grant for my prototype"], ["looking for a mentor and funding"]]):
            await server.db.users.insert_one({"id": str(uuid.uuid4()), "name": f"M{i}", "email": f"m{i}@nav.example", "role": "member", "membership_status": "approved", "support_needs": needs, "password_hash": "!"})

    with in_community(slug):
        asyncio.run(seed())
    ov = c.get("/api/navigator/admin").json()
    got = {r["key"]: r["members"] for r in ov["member_needs"]}
    assert got["funding"] == 2 and got["mentorship"] == 1 and got["rd"] == 1


# --------------------------------------------------------------------------- the startup side of the account profile
def test_clean_startup_clamps_to_the_navigator_vocabulary():
    s = nav.clean_startup({"name": "  Lumen  ", "one_liner": "x" * 500, "stage": "nonsense", "sectors": ["tech", "bogus"],
                           "needs": ["funding", "nope"], "audiences": ["black", "alien"], "incorporated": "yes", "employees": "3", "goal": "g" * 900})
    assert s["name"] == "Lumen" and len(s["one_liner"]) == 200 and len(s["goal"]) == 500
    assert s["stage"] == "idea" and s["sectors"] == ["tech"] and s["needs"] == ["funding"] and s["audiences"] == ["black"]
    assert s["incorporated"] is True and s["employees"] == 3 and "age" not in s


def test_navigator_profile_merges_age_and_city_back_in():
    acc = {"age": 24, "location": "Scarborough, ON", "startup": nav.clean_startup({"stage": "prototype", "needs": ["funding"]})}
    p = nav.navigator_profile(acc)
    assert p["age"] == 24 and p["city"] == "Scarborough" and p["stage"] == "prototype"
    assert nav.navigator_profile({"age": 24}) == {} and nav.navigator_profile(None) == {}


def test_account_startup_profile_round_trips_and_prefills_the_navigator():
    with TestClient(server.app) as c:
        assert c.get("/api/navigator/me").json() == {"signed_in": False, "profile": {}, "startup": {}}
        r = c.post("/api/hub/signup", json={"accepted_terms": True, "email": "founder-nav@example.com", "password": "Sup3rSecret!", "name": "Ada Founder"})
        assert r.status_code == 201, r.text
        r = c.patch("/api/hub/profile", json={"location": "Toronto, ON", "startup": {"name": "Lumen", "one_liner": "Solar for condos", "stage": "revenue", "sectors": ["cleantech", "zzz"],
                                                                                    "needs": ["funding", "export"], "incorporated": True, "audiences": ["women"]}})
        assert r.status_code == 200, r.text
        assert r.json()["account"]["startup"]["sectors"] == ["cleantech"]
        me = c.get("/api/navigator/me").json()
        assert me["signed_in"] and me["profile"]["city"] == "Toronto" and me["profile"]["stage"] == "revenue"
        # the saved profile is exactly what the suggest endpoint accepts
        out = c.post("/api/navigator/suggest", json={"profile": me["profile"]}).json()
        assert out["profile"]["stage"] == "revenue" and out["matches"]
        # saving other fields later does not wipe it
        c.patch("/api/hub/profile", json={"bio": "hi"})
        assert c.get("/api/navigator/me").json()["startup"]["name"] == "Lumen"


def test_startup_pitch_and_documents_are_cleaned():
    s = nav.clean_startup({"stage": "idea", "pitch": {"problem": "  a   b ", "ask": "x" * 900, "nope": "y", "market": ""},
                           "documents": [{"title": "Deck", "url": "https://x.example/d"}, {"title": "bad", "url": "javascript:alert(1)"}, {"url": "http://ok.example"}] + [{"url": "https://e.example"}] * 9})
    assert s["pitch"] == {"problem": "a b", "ask": "x" * 600}
    assert s["documents"][0] == {"title": "Deck", "url": "https://x.example/d"} and len(s["documents"]) == 6
    assert all(d["url"].startswith("http") for d in s["documents"])
    assert nav.clean_startup({})["pitch"] == {} and nav.clean_startup({})["documents"] == []


def test_joining_a_community_carries_the_startup_name_across_but_not_the_private_parts():
    import routes.hub as hub
    card = hub._startup_card(nav.clean_startup({"name": "Lumen", "one_liner": "Solar", "stage": "prototype", "sectors": ["cleantech"], "needs": ["funding"], "goal": "secret"}))
    assert card == {"startup_name": "Lumen", "startup_one_liner": "Solar", "startup_stage": "mvp", "startup_sector": "cleantech"}
    assert hub._startup_card({}) == {}
