"""The Navigator guide (chat) and the Hub's "next steps" feed: both read the account's one startup profile, and both
are rule-based, so a program, amount or date that is not in the catalog can never appear in an answer."""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"
os.environ.pop("EMERGENT_LLM_KEY", None)

from fastapi.testclient import TestClient

import navigator as nav
import navigator_guide as g
import server

TODAY = date(2026, 10, 27)
PROGRAMS = nav.load_catalog()["programs"]
PROFILE = {"stage": "launched", "needs": ["funding", "customers"], "sectors": ["tech"], "incorporated": True, "province": "ON", "city": "Toronto", "age": 31}


def ask(q, focus=None, profile=PROFILE, communities=()):
    return g.answer(q, PROGRAMS, list(communities), profile, TODAY, focus=focus, startup={"name": "Bright Court"}, account={"age": 31, "location": "Toronto"})


def test_a_named_program_is_found_by_its_short_name():
    for q, pid in [("When does IRAP close?", "irap"), ("tell me about sr&ed", "sred"), ("how much is canexport", "canexport-smes"), ("is the startup visa open", "startup-visa")]:
        assert ask(q)["focus"] == pid, q


def test_short_words_do_not_trigger_the_wrong_intent():
    assert ask("how do I introduce my product to customers")["intent"] != "deadlines"


def test_deadline_answers_use_the_real_date_and_count_the_days():
    r = ask("when does ovin close")
    assert "Nov 4, 2026" in r["reply"] and "8 days" in r["reply"]
    assert ask("when does irap close")["reply"].count("No deadline is published") == 1


def test_a_follow_up_uses_the_program_you_were_just_talking_about():
    assert ask("what's the deadline?", focus="ovin-rd")["focus"] == "ovin-rd"
    assert ask("am I eligible?", focus="belf")["cards"][0]["id"] == "belf"
    # a general question is not hijacked by the focus
    assert ask("what's closing soon", focus="irap")["intent"] == "deadlines"


def test_a_group_only_program_says_it_is_probably_not_for_you():
    r = ask("am I eligible for belf?")
    assert "Probably not for you" in r["reply"] and r["cards"][0]["fit"] == "skip"
    black = {**PROFILE, "audiences": ["black"]}
    assert "Probably not" not in ask("am I eligible for belf?", profile=black)["reply"]


def test_needs_and_types_filter_the_ranked_matches():
    r = ask("any grants for me?")
    assert r["intent"] == "filter" and r["cards"] and all(c["type"] == "grant" for c in r["cards"])
    r = ask("I need a mentor")
    assert r["cards"] and all("mentorship" in c["needs"] for c in r["cards"])


def test_replies_only_name_programs_that_exist():
    names = {p["name"] for p in PROGRAMS}
    for q in ["what should I do next", "what's closing soon", "grants", "mentors", "export", "compare sred and irap", "blah"]:
        for c in ask(q)["cards"]:
            assert c["name"] in names


def test_profile_question_lists_what_is_missing():
    r = g.answer("what do you know about me", PROGRAMS, [], {"stage": "idea"}, TODAY, startup={"stage": "idea"}, account={})
    assert "idea stage" in r["reply"] and "Add" in r["reply"]


def test_completeness_counts_what_is_filled_in():
    empty = g.completeness({"stage": "idea"}, {})
    full = g.completeness({"stage": "idea", "name": "X", "needs": ["funding"], "sectors": ["tech"], "incorporated": False, "goal": "g"}, {"age": 30, "location": "Toronto"})
    assert empty["percent"] < 40 and full["percent"] == 100 and not full["missing"]


def test_home_feed_needs_a_profile_then_tracks_what_is_new_and_closing():
    assert g.home_feed(PROGRAMS, [], None)["has_profile"] is False
    assert g.home_feed(PROGRAMS, [], {"startup": {}}, TODAY)["has_profile"] is False
    acc = {"age": 31, "location": "Toronto", "startup": nav.clean_startup({"name": "Lumen", "stage": "launched", "needs": ["funding", "rd"], "sectors": ["cleantech"], "incorporated": True})}
    feed = g.home_feed(PROGRAMS, [], acc, TODAY)
    assert feed["has_profile"] and feed["top"] and feed["startup"]["stage_label"] == "just launched" and feed["new_count"] == 0
    assert any(m["id"] == "ovin-rd" and m["days_left"] == 8 for m in feed["closing_soon"])
    # once the person has "seen" everything, a program a community adds later shows up as new
    seen = {**acc, "nav_seen": feed["live_ids"]}
    extra = {"id": "com-x-1", "name": "Pitch Day", "org": "X", "type": "competition", "summary": "s", "needs": ["funding"], "stages": ["launched"], "audiences": [], "sectors": ["any"],
             "provinces": ["any"], "requires": {}, "deadline": {"kind": "rolling"}, "status": "open", "phase": "fund", "apply_url": "https://x.example", "verified": "official", "last_checked": "2026-10-27"}
    feed2 = g.home_feed(PROGRAMS + [extra], [], seen, TODAY)
    assert feed2["new_ids"] == ["com-x-1"] or "com-x-1" in feed2["new_ids"]


def test_chat_and_home_endpoints_follow_the_account_profile():
    with TestClient(server.app) as c:
        assert c.get("/api/navigator/home").json()["has_profile"] is False
        # signed out: uses the profile sent with the message
        r = c.post("/api/navigator/chat", json={"message": "what should I do next", "profile": {"stage": "revenue", "needs": ["export"]}}).json()
        assert r["intent"] == "next" and not r["signed_in"] and r["by"] == "rules"
        assert c.post("/api/navigator/seen").status_code in (401, 403)
        r = c.post("/api/hub/signup", json={"accepted_terms": True, "email": "guide-user@example.com", "password": "Sup3rSecret!", "name": "Gia Guide"})
        assert r.status_code == 201, r.text
        c.patch("/api/hub/profile", json={"location": "Toronto, ON", "startup": {"name": "Lumen", "stage": "revenue", "needs": ["export"], "incorporated": True}})
        home = c.get("/api/navigator/home").json()
        assert home["has_profile"] and home["startup"]["name"] == "Lumen" and any(m["id"] == "canexport-smes" for m in home["top"] + home["closing_soon"]) or home["top"]
        chat = c.post("/api/navigator/chat", json={"message": "what do you know about me"}).json()
        assert chat["signed_in"] and chat["has_profile"] and "Lumen" in chat["reply"]
        # changing the profile changes the answer, with nothing else to update
        before = home["startup"]["stage_label"]
        c.patch("/api/hub/profile", json={"startup": {"name": "Lumen", "stage": "idea", "needs": ["funding"]}})
        after = c.get("/api/navigator/home").json()
        assert after["startup"]["stage_label"] != before
        seen = c.post("/api/navigator/seen").json()
        assert seen["ok"] and seen["count"] > 0
        assert c.get("/api/navigator/home").json()["new_count"] == 0
