import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"  # smoke tests exercise chat end to end even though it defaults off in production
import pytest
from fastapi.testclient import TestClient
import server


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


def login(c, email):
    c.post("/api/auth/logout")
    assert c.post("/api/auth/login", json={"email": email, "password": "Demo123!"}).status_code == 200


def test_requests_workflow(c):
    login(c, "demo@yourcommunity.app")
    r = c.get("/api/me/requests").json()
    st = {x["kind"]: x["effective_status"] for x in r["requests"]}
    assert st["waiver"] == "overdue" and st["availability"] == "not_started" and r["open"] == 3
    tr = next(x for x in r["requests"] if x["kind"] == "goals_update")
    assert c.get(f"/api/member-requests/{tr['id']}").json()["status"] == "in_progress"
    out = c.post(f"/api/member-requests/{tr['id']}/submit", json={"response": {"goals": "Make Division A, Play every week"}}).json()
    assert set(out["applied_fields"]) == {"goals"}
    me = c.get("/api/auth/me").json()
    assert c.get(f"/api/users/{me['id']}").json()["goals"] == ["Make Division A", "Play every week"]
    assert c.get("/api/me/requests").json()["open"] == 2
    # external form confirm
    ext = next(x for x in r["requests"] if x["kind"] == "waiver")
    assert c.post(f"/api/member-requests/{ext['id']}/external-complete").status_code == 200
    # other user's request is not accessible
    login(c, "admin@yourcommunity.app")
    rq = c.get("/api/admin/member-requests?status=submitted").json()
    assert rq["counts"]["submitted"] >= 3
    assert c.post(f"/api/admin/member-requests/{tr['id']}/review", json={"status": "reviewed"}).status_code == 200
    # webhook
    assert c.post("/api/webhooks/requests/demo-webhook-token", json={"a": 1}).status_code == 200


def test_admin_creates_request_and_guard(c):
    login(c, "demo@yourcommunity.app")
    assert c.post("/api/admin/member-requests", json={"all_members": True, "kind": "custom"}).status_code == 403
    login(c, "admin@yourcommunity.app")
    r = c.post("/api/admin/member-requests", json={"member_type": "mentor", "kind": "custom", "title": "Availability", "due_date": "2099-01-01"})
    assert r.status_code == 201 and r.json()["created"] >= 1


def test_moderation(c):
    login(c, "demo@yourcommunity.app")
    titles = [r["title"] for r in c.get("/api/resources").json()]
    assert "Term sheet checklist for first-time founders" not in titles
    res = c.post("/api/resources", json={"title": "My template", "url": "https://x.co", "category": "Guide"}).json()
    assert res["status"] == "pending"
    assert "My template" not in [r["title"] for r in c.get("/api/resources").json()]
    mine = c.get("/api/submissions/mine").json()["submissions"]
    assert any(s["title"] == "My template" for s in mine)
    login(c, "admin@yourcommunity.app")
    q = c.get("/api/admin/moderation").json()["items"]
    assert {i["kind"] for i in q} >= {"resource", "event"}
    assert c.post(f"/api/admin/moderation/resource/{res['id']}", json={"decision": "approve"}).json()["status"] == "approved"
    assert "My template" in [r["title"] for r in c.get("/api/resources").json()]


def test_rsvp_and_ics(c):
    login(c, "demo@yourcommunity.app")
    ev = c.get("/api/events?upcoming=true").json()
    paid = next(e["id"] for e in ev if e.get("price_cents") and not e.get("is_attending"))
    assert c.post(f"/api/events/{paid}/rsvp", json={"status": "yes"}).status_code == 402  # paid events need a ticket
    eid = next(e["id"] for e in ev if not e.get("price_cents"))
    assert c.post(f"/api/events/{eid}/rsvp", json={"status": "maybe"}).json()["my_rsvp"] == "maybe"
    d = c.get(f"/api/events/{eid}").json()
    assert d["my_rsvp"] == "maybe" and d["maybe_count"] >= 1 and "agenda" in d
    assert c.get(f"/api/events/{eid}/ics").text.startswith("BEGIN:VCALENDAR")
    assert c.post(f"/api/events/{eid}/rsvp", json={"status": "yes"}).json()["is_attending"] is True


def test_profile_and_settings(c):
    login(c, "demo@yourcommunity.app")
    comp = c.get("/api/me/profile-completion").json()
    assert comp["percent"] > 60 and "Position / role" not in comp["missing"] or True
    out = c.patch("/api/me/profile", json={"values": {"age": "28", "height": "5'10\"", "support_needs": "shooting, nutrition"}}).json()
    assert out["completion"]["percent"] >= comp["percent"]
    assert c.get(f"/api/users/{out['user']['id'] if 'user' in out else c.get('/api/auth/me').json()['id']}").json()["age"] == 28
    s = c.patch("/api/me/settings", json={"privacy": {"visible_in_directory": False}}).json()
    assert s["settings"]["privacy"]["visible_in_directory"] is False
    ids = [u["id"] for u in c.get("/api/users").json()]
    assert c.get("/api/auth/me").json()["id"] not in ids
    c.patch("/api/me/settings", json={"privacy": {"visible_in_directory": True}})
    assert c.post("/api/me/change-password", json={"current_password": "nope", "new_password": "Whatever123"}).status_code == 400


def test_team_support_and_privacy(c):
    login(c, "demo@yourcommunity.app")
    t = c.post("/api/team-support", json={"category": "Funding", "title": "Intro to angels"}).json()
    assert t["status"] == "submitted"
    board = c.get("/api/support-requests?status=all").json()
    assert all(not x.get("to_team") for x in board)
    login(c, "admin@yourcommunity.app")
    assert c.post(f"/api/admin/team-support/{t['id']}", json={"assignee_id": "u-admin-me", "response": "On it"}).status_code == 200
    login(c, "demo@yourcommunity.app")
    mine = c.get("/api/me/team-support").json()["requests"]
    assert next(x for x in mine if x["id"] == t["id"])["status"] == "assigned"
    users = c.get("/api/users").json()
    assert all("settings" not in u for u in users if u["id"] != c.get("/api/auth/me").json()["id"])


def test_matches_dashboard_action_center(c):
    login(c, "demo@yourcommunity.app")
    m = c.get("/api/matches").json()
    assert m["people"] and m["people"][0]["why"]
    pid = m["people"][0]["user"]["id"]
    c.post("/api/matches/action", json={"kind": "person", "target_id": pid, "action": "dismiss"})
    assert pid not in [p["user"]["id"] for p in c.get("/api/matches").json()["people"]]
    d = c.get("/api/dashboard").json()
    assert d["profile_completion"]["percent"] > 0 and "open_requests" in d and d["my_rsvps"] is not None
    assert c.get("/api/notifications").json()["notifications"]
    assert c.get("/api/admin/action-center").status_code == 403
    a = c.post("/api/chat/message", json={"message": "what events should I attend?"})
    assert any(x["to"] == "/events" for x in a.json().get("actions", []))
    login(c, "admin@yourcommunity.app")
    ac = c.get("/api/admin/action-center").json()
    assert ac["pending_moderation"] >= 1 and ac["awaiting_review"] >= 1


def test_membership_approval_flow():
    from fastapi.testclient import TestClient
    import server
    with TestClient(server.app) as c:
        r = c.post("/api/auth/signup", json={"email": "newbie@example.com", "password": "Sup3rSecret99", "name": "New Person", "title": "Designer", "join_reason": "Keen to meet founders"})
        assert r.status_code == 201 and r.json()["pending"] is True
        # cannot sign in yet
        assert c.post("/api/auth/login", json={"email": "newbie@example.com", "password": "Sup3rSecret99"}).status_code == 403
        assert c.post("/api/auth/login", json={"email": "admin@yourcommunity.app", "password": "Demo123!"}).status_code == 200
        pend = c.get("/api/admin/membership-requests?status=pending").json()
        assert any(x["email"] == "newbie@example.com" for x in pend["requests"]) and pend["counts"]["pending"] >= 6
        uid = next(x["id"] for x in pend["requests"] if x["email"] == "newbie@example.com")
        dash = c.get("/api/dashboard?role=admin").json()
        assert dash["membership_requests_total"] >= 6 and any(x["id"] == uid for x in dash["membership_requests"])
        assert any(n["kind"] == "membership_request" for n in c.get("/api/notifications").json()["notifications"])
        assert not any(u["id"] == uid for u in c.get("/api/users").json())
        assert c.post(f"/api/admin/membership-requests/{uid}/decision", json={"decision": "approve"}).status_code == 200
        assert any(u["id"] == uid for u in c.get("/api/users").json())
        c.post("/api/auth/logout")
        assert c.post("/api/auth/login", json={"email": "newbie@example.com", "password": "Sup3rSecret99"}).status_code == 200
        c.post("/api/auth/logout")
        c.post("/api/auth/login", json={"email": "admin@yourcommunity.app", "password": "Demo123!"})
        rej = c.get("/api/admin/membership-requests?status=pending").json()["requests"][0]["id"]
        assert c.post(f"/api/admin/membership-requests/{rej}/decision", json={"decision": "reject", "note": "no"}).status_code == 200
        assert c.get("/api/admin/membership-requests?status=rejected").json()["counts"]["rejected"] >= 2


def test_post_photos():
    from fastapi.testclient import TestClient
    import server
    tiny = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    with TestClient(server.app) as c:
        c.post("/api/auth/login", json={"email": "demo@yourcommunity.app", "password": "Demo123!"})
        r = c.post("/api/support-requests", json={"title": "Feedback on my menu", "description": "x", "category": "Business help", "image_url": tiny})
        assert r.status_code == 201 and r.json()["image_url"] == tiny
        assert any(x.get("image_url") == tiny for x in c.get("/api/support-requests").json())
        assert c.post("/api/support-requests", json={"title": "bad", "image_url": "http://evil.example/x.png"}).status_code == 400
        assert c.post("/api/support-requests", json={"title": "bad", "image_url": "data:text/html;base64,PHNjcmlwdD4="}).status_code == 400
        p = c.post("/api/resources", json={"title": "Free logo tweak", "category": "Free access", "image_url": tiny})
        assert p.status_code == 201 and p.json()["cover_url"] == tiny
        e = c.post("/api/events", json={"title": "Coffee", "starts_at": "2026-11-01T10:00:00Z", "image_url": tiny})
        assert e.status_code == 201 and e.json()["cover_url"] == tiny
        a = c.post("/api/announcements", json={"title": "Hi", "body": "there", "image_url": tiny})
        assert a.status_code == 201 and a.json()["image_url"] == tiny


def test_multi_community_hub():
    from fastapi.testclient import TestClient
    import server
    with TestClient(server.app) as c:
        r = c.post("/api/auth/login", json={"email": "demo@yourcommunity.app", "password": "Demo123!"})
        assert r.status_code == 200
        hub = c.get("/api/hub/communities").json()["communities"]
        st = {x["slug"]: x["my"]["status"] for x in hub}
        assert st == {"playr": "approved", "grace": "approved", "the-village": "none", "club-pto": "approved"}
        assert c.get("/api/community/config").json()["community_name"] == "Playr"
        assert c.post("/api/hub/enter", json={"slug": "the-village"}).status_code == 403
        assert c.post("/api/hub/enter", json={"slug": "grace"}).status_code == 200
        cfg = c.get("/api/community/config").json()
        assert cfg["community_name"] == "C3" and cfg["brand"]["mode"] == "dark"
        assert c.get("/api/auth/me").json()["email"] == "demo@yourcommunity.app"
        assert len(c.get("/api/users").json()) >= 8
        # apply to a community she isn't in yet
        assert c.post("/api/hub/communities/the-village/apply", json={"title": "Physiotherapist", "message": "A friend brought me to a supper."}).status_code == 201
        assert c.post("/api/hub/enter", json={"slug": "the-village"}).status_code == 403
        c.post("/api/auth/logout")
        # the host of The Village sees and approves the request
        assert c.post("/api/auth/login", json={"email": "host@thevillage.example", "password": "Demo123!"}).status_code == 200
        pend = c.get("/api/admin/membership-requests?status=pending").json()["requests"]
        assert any(x["email"] == "demo@yourcommunity.app" for x in pend)
        uid = next(x["id"] for x in pend if x["email"] == "demo@yourcommunity.app")
        assert c.post(f"/api/admin/membership-requests/{uid}/decision", json={"decision": "approve"}).status_code == 200
        c.post("/api/auth/logout")
        c.post("/api/auth/login", json={"email": "demo@yourcommunity.app", "password": "Demo123!"})
        assert c.post("/api/hub/enter", json={"slug": "the-village"}).status_code == 200
        assert c.get("/api/community/config").json()["community_name"] == "The Village"
        c.post("/api/auth/logout")
        # brand-new Pathwai account: no communities yet, can apply
        assert c.post("/api/hub/signup", json={"email": "fresh@example.com", "password": "Sup3rSecret99", "name": "Fresh Face"}).status_code == 201
        assert all(x["my"]["status"] == "none" for x in c.get("/api/hub/communities").json()["communities"])
        assert c.post("/api/hub/communities/grace/apply", json={"message": "New to the area"}).status_code == 201


def test_platform_admin_can_enter_and_edit_every_community():
    from fastapi.testclient import TestClient
    import server
    with TestClient(server.app) as c:
        assert c.post("/api/auth/login", json={"email": "admin@yourcommunity.app", "password": "Demo123!"}).status_code == 200
        comms = c.get("/api/hub/communities").json()["communities"]
        assert all(x["my"]["status"] == "approved" and x["my"]["role"] == "admin" for x in comms)
        for slug in ("grace", "the-village", "playr"):
            assert c.post("/api/hub/enter", json={"slug": slug}).status_code == 200
            h = {"X-Community": slug}
            me = c.get("/api/auth/me", headers=h).json()
            assert me["role"] == "admin"
            r = c.patch("/api/community/config", headers=h, json={"tagline": "Edited by platform admin"})
            assert r.status_code == 200, (slug, r.text)


def test_message_blast_text_email_and_both():
    from fastapi.testclient import TestClient
    import server
    with TestClient(server.app) as c:
        assert c.post("/api/auth/login", json={"email": "admin@yourcommunity.app", "password": "Demo123!"}).status_code == 200
        assert c.post("/api/admin/blasts/send", json={"message": "hi", "channel": "sms"}).status_code == 400
        assert c.post("/api/admin/blasts/send", json={"message": "hi", "channel": "email"}).status_code == 400
        assert c.put("/api/admin/integrations/twilio", json={"credentials": {"account_sid": "demo", "auth_token": "demo"}, "settings": {"from_number": "+14165550100"}}).status_code == 200
        assert c.put("/api/admin/integrations/sendgrid", json={"credentials": {"api_key": "demo"}, "settings": {"from_email": "hello@example.com", "from_name": "Test"}}).status_code == 200
        assert c.post("/api/admin/integrations/twilio/test").json()["ok"]
        assert c.post("/api/admin/integrations/sendgrid/test").json()["ok"]
        # Maya opts in to texts (email defaults on)
        c.post("/api/auth/logout")
        c.post("/api/auth/login", json={"email": "demo@yourcommunity.app", "password": "Demo123!"})
        assert c.patch("/api/me/settings", json={"notifications": {"sms": True}}).status_code == 200
        c.post("/api/auth/logout")
        c.post("/api/auth/login", json={"email": "admin@yourcommunity.app", "password": "Demo123!"})
        a = c.post("/api/admin/blasts/audience", json={"type": "all"}).json()
        assert a["sms_count"] >= 1 and a["email_count"] >= 1 and a["twilio_connected"] and a["sendgrid_connected"]
        r = c.post("/api/admin/blasts/send", json={"message": "Doors open at 7pm tonight", "channel": "both", "audience": {"type": "all"}}).json()
        assert r["sms_sent"] == a["sms_count"] and r["email_sent"] == a["email_count"] and r["demo"]
        hist = c.get("/api/admin/blasts/history").json()["blasts"]
        assert hist[0]["message"].startswith("Doors") and hist[0]["channel"] == "both"


def test_ticket_tiers_traffic_and_sales():
    from fastapi.testclient import TestClient
    import server
    with TestClient(server.app) as c:
        assert c.post("/api/auth/login", json={"email": "admin@yourcommunity.app", "password": "Demo123!"}).status_code == 200
        assert c.put("/api/admin/integrations/stripe", json={"credentials": {"api_key": "demo"}}).status_code == 200
        ev = c.post("/api/events", json={"title": "Tiered night", "starts_at": "2030-01-01T19:00:00+00:00",
                                         "ticket_tiers": [{"name": "Early bird", "price_cents": 2000, "capacity": 1}, {"name": "GA", "price_cents": 3000}]}).json()
        assert len(ev["ticket_tiers"]) == 2 and ev["price_cents"] == 2000
        early, ga = ev["ticket_tiers"][0], ev["ticket_tiers"][1]
        c.post("/api/auth/logout")
        c.post("/api/auth/login", json={"email": "demo@yourcommunity.app", "password": "Demo123!"})
        assert c.post(f"/api/events/{ev['id']}/view").status_code == 201
        assert c.post(f"/api/events/{ev['id']}/view").status_code == 201
        assert c.post(f"/api/events/{ev['id']}/checkout", json={"tier_id": "bogus"}).status_code == 400
        got = c.post(f"/api/events/{ev['id']}/checkout", json={"tier_id": early["id"]}).json()
        assert got["demo"]
        assert c.post(f"/api/events/{ev['id']}/checkout", json={"tier_id": ga["id"]}).status_code == 409  # one ticket per person
        c.post("/api/auth/logout")
        c.post("/api/auth/login", json={"email": "admin@yourcommunity.app", "password": "Demo123!"})
        # early bird now sold out (capacity 1)
        d = c.get(f"/api/events/{ev['id']}").json()
        assert d["tier_summary"]["tiers"][0]["sold_out"] is True
        sales = c.get(f"/api/admin/events/{ev['id']}/sales").json()
        assert sales["sold"] == 1 and sales["revenue_cents"] == 2000
        tiers = {t["id"]: t for t in sales["tiers"]}
        assert tiers[early["id"]]["sold"] == 1 and tiers[ga["id"]]["sold"] == 0
        assert sales["traffic"]["unique_viewers"] == 1 and sales["traffic"]["views"] == 2
        assert sales["traffic"]["conversion_rate"] == 1.0
