"""The talent pool: opt-in listing, search and ranking, what a card may reveal, and message requests (accept / decline)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"

from fastapi.testclient import TestClient

import server
import talent as tl

PW = "Sup3rSecret!"


def signup(c, email, name):
    r = c.post("/api/hub/signup", json={"accepted_terms": True, "email": email, "password": PW, "name": name})
    assert r.status_code in (200, 201), r.text
    return r.json()["account"]["id"]


def login(c, email):
    c.post("/api/auth/logout")
    assert c.post("/api/auth/login", json={"email": email, "password": PW}).status_code == 200


DEV = {"listed": True, "headline": "Full-stack developer, React and Python", "categories": ["engineering"], "skills": ["Frontend", "Backend", "react"],
       "open_to": ["contract", "full_time"], "availability": "now", "work_mode": ["remote", "hybrid"], "experience": "senior", "province": "ON", "city": "Toronto"}


# ---- rules (no database) ----
def test_clean_profile_keeps_only_known_values_and_trims():
    p = tl.clean_profile({"listed": 1, "headline": "  Dev   in   Toronto ", "categories": ["engineering", "nonsense", "engineering"], "skills": ["frontend", "Underwater Basket Weaving", "<script>"],
                          "open_to": ["contract", "free_pizza"], "availability": "soon", "work_mode": ["remote", "moon"], "experience": "wizard", "province": "on", "hiring_for": ["sales", "x"]})
    assert p["headline"] == "Dev in Toronto" and p["categories"] == ["engineering"]
    assert p["skills"] == ["Frontend", "Underwater Basket Weaving"]          # known skill gets its proper spelling; markup is dropped
    assert p["open_to"] == ["contract"] and p["work_mode"] == ["remote"] and p["experience"] == "" and p["province"] == "ON" and p["hiring_for"] == ["sales"]


def test_is_complete_needs_headline_area_and_open_to():
    assert not tl.is_complete({"headline": "x", "categories": ["sales"]})
    assert tl.is_complete({"headline": "x", "categories": ["sales"], "open_to": ["contract"]})


def test_ranking_puts_what_the_founder_is_hiring_for_first_with_reasons():
    mk = lambda id_, cat, prov="ON", mode=("hybrid",), avail="exploring": {"id": id_, "name": id_, "categories": [cat], "skills": [], "open_to": ["contract"], "availability": avail, "work_mode": list(mode),
                                                                       "province": prov, "city": "", "headline": "", "about": "", "company": "", "experience": ""}
    cards = [mk("designer", "design"), mk("marketer-bc", "marketing", prov="BC"), mk("marketer-on", "marketing")]
    out = tl.rank_people(cards, {"province": "ON", "hiring_for": ["marketing"]}, {})
    assert [c["id"] for c in out][:2] == ["marketer-on", "marketer-bc"]
    assert any("looking for" in r for r in out[0]["reasons"]) and any("your province" in r for r in out[0]["reasons"])


def test_province_filter_keeps_remote_workers_from_elsewhere():
    mk = lambda id_, prov, mode: {"id": id_, "name": id_, "categories": ["sales"], "skills": [], "open_to": ["contract"], "availability": "now", "work_mode": mode, "province": prov, "city": "",
                                  "headline": "", "about": "", "company": "", "experience": ""}
    out = tl.rank_people([mk("a", "ON", ["onsite"]), mk("b", "BC", ["remote"]), mk("c", "BC", ["onsite"])], {}, {"province": "ON"})
    assert sorted(c["id"] for c in out) == ["a", "b"]


# ---- the API ----
def test_must_be_signed_in_and_nobody_is_listed_by_default():
    with TestClient(server.app) as c:
        assert c.get("/api/talent").status_code == 401
        signup(c, "tal-plain@example.com", "Plain Person")
        assert c.get("/api/talent").json()["total"] == 0
        assert c.get("/api/talent/options").json()["categories"]


def test_listing_requires_a_complete_profile_and_cards_never_show_email():
    with TestClient(server.app) as c:
        signup(c, "tal-dev1@example.com", "Dana Dev")
        assert c.put("/api/talent/me", json={"listed": True, "headline": "Dev"}).status_code == 400
        r = c.put("/api/talent/me", json=DEV)
        assert r.status_code == 200 and r.json()["complete"] and r.json()["talent"]["skills"] == ["Frontend", "Backend", "react"]
        c.post("/api/auth/logout")
        signup(c, "tal-founder1@example.com", "Fran Founder")
        res = c.get("/api/talent").json()
        card = next(p for p in res["results"] if p["name"] == "Dana Dev")
        assert "email" not in card and "tal-dev1@example.com" not in str(res)
        assert card["headline"].startswith("Full-stack") and card["province"] == "ON"
        # yourself never appears
        c.put("/api/talent/me", json={**DEV, "headline": "Founder who codes"})
        assert all(p["name"] != "Fran Founder" for p in c.get("/api/talent").json()["results"])


def test_unlisting_removes_you_and_filters_work():
    with TestClient(server.app) as c:
        signup(c, "tal-mkt1@example.com", "Mo Marketer")
        c.put("/api/talent/me", json={"listed": True, "headline": "Growth marketer", "categories": ["marketing"], "skills": ["SEO and content"], "open_to": ["contract"], "province": "BC", "work_mode": ["onsite"]})
        c.post("/api/auth/logout")
        signup(c, "tal-acct1@example.com", "Ana Accountant")
        c.put("/api/talent/me", json={"listed": True, "headline": "Startup accountant", "categories": ["finance"], "skills": ["SR&ED claims"], "open_to": ["part_time"], "province": "ON", "work_mode": ["remote"]})
        c.post("/api/auth/logout")
        signup(c, "tal-founder2@example.com", "Finn Founder")
        names = lambda **p: sorted(x["name"] for x in c.get("/api/talent", params=p).json()["results"] if x["name"] in ("Mo Marketer", "Ana Accountant"))
        assert names() == ["Ana Accountant", "Mo Marketer"]
        assert names(category="finance") == ["Ana Accountant"]
        assert names(skill="SR&ED claims") == ["Ana Accountant"]
        assert names(open_to="contract") == ["Mo Marketer"]
        assert names(q="growth") == ["Mo Marketer"]
        assert names(province="ON") == ["Ana Accountant"]            # the BC marketer is on site, so not an Ontario fit
        assert names(remote="true") == ["Ana Accountant"]
        login(c, "tal-mkt1@example.com")
        c.put("/api/talent/me", json={"listed": False})
        login(c, "tal-founder2@example.com")
        assert names() == ["Ana Accountant"]


def test_startups_are_listed_only_when_the_founder_chooses():
    with TestClient(server.app) as c:
        signup(c, "tal-f3@example.com", "Gus Founder")
        assert c.put("/api/talent/me", json={"startup_listed": True}).status_code == 400     # no startup on the profile yet
        c.patch("/api/hub/profile", json={"startup": {"name": "Bright Court", "one_liner": "Legal tools for small clinics", "stage": "launched", "province": "ON", "needs": ["talent"]}})
        r = c.put("/api/talent/me", json={"startup_listed": True, "hiring_for": ["engineering", "sales"], "hiring_note": "A first engineer"})
        assert r.status_code == 200
        c.post("/api/auth/logout")
        signup(c, "tal-dev3@example.com", "Dev Three")
        res = c.get("/api/talent", params={"kind": "startups"}).json()
        s = next(x for x in res["results"] if x["name"] == "Bright Court")
        assert s["hiring_for"] == ["engineering", "sales"] and s["founder"]["name"] == "Gus Founder" and "email" not in str(s)


def test_message_request_accept_and_decline_flow():
    with TestClient(server.app) as c:
        dev_id = None
        signup(c, "tal-dev4@example.com", "Dee Dev")
        c.put("/api/talent/me", json=DEV)
        c.post("/api/auth/logout")
        signup(c, "tal-f4@example.com", "Fay Founder")
        res = c.get("/api/talent").json()
        dev_id = next(p["id"] for p in res["results"] if p["name"] == "Dee Dev")
        assert c.post(f"/api/talent/{dev_id}/message", json={"message": "hi"}).status_code == 400          # too short to be a real note
        r = c.post(f"/api/talent/{dev_id}/message", json={"message": "We need a React developer for a 3 month contract. Interested?"})
        assert r.status_code == 201 and r.json()["request"] == {"state": "pending", "from_email": "tal-f4@example.com", "you_are_recipient": False, "kind": "talent"}
        tid = r.json()["thread_id"]
        # the sender cannot send more until accepted, and cannot answer their own request
        assert c.post(f"/api/hub/messages/threads/{tid}/reply", json={"body": "ping?"}).status_code == 403
        assert c.post(f"/api/hub/messages/threads/{tid}/respond", json={"accept": True}).status_code == 403
        assert c.post(f"/api/talent/{dev_id}/message", json={"message": "Sending it again just in case."}).status_code == 403
        # the recipient sees it as a request in their inbox, then accepts
        login(c, "tal-dev4@example.com")
        inbox = c.get("/api/hub/messages").json()
        t = next(x for x in inbox["threads"] if x["id"] == tid)
        assert t["unread"] and t["request"]["state"] == "pending" and t["request"]["you_are_recipient"]
        out = c.post(f"/api/hub/messages/threads/{tid}/respond", json={"accept": True}).json()
        assert out["request"]["state"] == "accepted"
        assert c.post(f"/api/hub/messages/threads/{tid}/reply", json={"body": "Yes, tell me more."}).status_code == 201
        login(c, "tal-f4@example.com")
        assert c.post(f"/api/hub/messages/threads/{tid}/reply", json={"body": "Great, the brief is attached."}).status_code == 201


def test_declined_request_stays_closed_and_replying_counts_as_accepting():
    with TestClient(server.app) as c:
        signup(c, "tal-dev5@example.com", "Dev Five")
        c.put("/api/talent/me", json=DEV)
        dev_id = c.get("/api/talent/me").json()
        c.post("/api/auth/logout")
        signup(c, "tal-f5@example.com", "Fred Founder")
        res = c.get("/api/talent").json()
        dev_id = next(p["id"] for p in res["results"] if p["name"] == "Dev Five")
        tid = c.post(f"/api/talent/{dev_id}/message", json={"message": "Would you like to help with our launch?"}).json()["thread_id"]
        login(c, "tal-dev5@example.com")
        assert c.post(f"/api/hub/messages/threads/{tid}/respond", json={"accept": False}).json()["request"]["state"] == "declined"
        assert c.post(f"/api/hub/messages/threads/{tid}/reply", json={"body": "no thanks"}).status_code == 403
        login(c, "tal-f5@example.com")
        assert c.post(f"/api/hub/messages/threads/{tid}/reply", json={"body": "ok?"}).status_code == 403
        assert c.post(f"/api/talent/{dev_id}/message", json={"message": "Trying again with a longer note."}).status_code == 403
        # a second person: replying (rather than pressing Accept) opens the conversation
        c.post("/api/auth/logout")
        signup(c, "tal-f6@example.com", "Fiona Founder")
        tid2 = c.post(f"/api/talent/{dev_id}/message", json={"message": "Hello, we are hiring a developer."}).json()["thread_id"]
        login(c, "tal-dev5@example.com")
        assert c.post(f"/api/hub/messages/threads/{tid2}/reply", json={"body": "Sure, happy to chat."}).status_code == 201
        assert c.get(f"/api/hub/messages/threads/{tid2}").json()["request"]["state"] == "accepted"


def test_cannot_message_yourself_or_someone_who_is_not_listed():
    with TestClient(server.app) as c:
        me_id = signup(c, "tal-f7@example.com", "Fern Founder")
        assert c.post(f"/api/talent/{me_id}/message", json={"message": "Talking to myself here."}).status_code == 400
        assert c.post("/api/talent/not-a-real-id/message", json={"message": "Anyone home out there?"}).status_code == 404


def test_listed_people_are_addressed_by_id_and_emails_stay_private_until_accepted():
    with TestClient(server.app) as c:
        signup(c, "tal-priv1@example.com", "Pia Private")
        c.put("/api/talent/me", json=DEV)
        c.post("/api/auth/logout")
        fid = signup(c, "tal-priv2@example.com", "Rex Requester")
        found = c.get("/api/hub/people", params={"q": "Pia Private"}).json()["people"][0]
        assert found["email"] is None and found["id"] and found["talent"]["headline"].startswith("Full-stack")
        prof = c.get(f"/api/hub/people/{found['id']}").json()                 # by id, no email in the address
        assert prof["name"] == "Pia Private" and prof["talent"]["skills"] and "tal-priv1@example.com" not in str(prof)
        tid = c.post(f"/api/talent/{found['id']}/message", json={"message": "Would love your help with our MVP."}).json()["thread_id"]
        t = c.get(f"/api/hub/messages/threads/{tid}").json()
        assert t["other"]["email"] is None and "tal-priv1@example.com" not in str(t)
        # following works by id too
        assert c.post(f"/api/hub/people/{found['id']}/follow").status_code == 201
        assert c.get(f"/api/hub/people/{found['id']}").json()["is_following"] is True
        # once accepted, the thread works normally and my own messages are marked as mine
        login(c, "tal-priv1@example.com")
        c.post(f"/api/hub/messages/threads/{tid}/respond", json={"accept": True})
        t2 = c.get(f"/api/hub/messages/threads/{tid}").json()
        assert t2["request"]["state"] == "accepted" and t2["messages"][0]["mine"] is False and t2["messages"][0]["sender_email"] == "tal-priv2@example.com"
        assert fid
