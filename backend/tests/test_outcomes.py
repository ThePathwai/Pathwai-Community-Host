"""How it went: what founders report after they apply, and the totals a hub can export from it (only for founders who chose to share)."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import database
import impact
import navigator as nav
import server

TODAY = date(2026, 11, 26)


# ---- the record --------------------------------------------------------------------------------------------------------
def test_an_outcome_is_added_updated_and_removed():
    a = nav.update_outcome([], {"id": "irap", "name": "NRC IRAP", "type": "grant", "status": "applied"}, TODAY)
    assert a == [{"id": "irap", "name": "NRC IRAP", "org": "", "type": "grant", "status": "applied", "funding": "", "at": "2026-11-26", "updated_at": "2026-11-26"}]
    b = nav.update_outcome(a, {"id": "irap", "name": "NRC IRAP", "status": "accepted", "funding": "25k_100k"}, date(2026, 12, 20))
    assert len(b) == 1 and b[0]["status"] == "accepted" and b[0]["funding"] == "25k_100k"
    assert b[0]["at"] == "2026-11-26" and b[0]["updated_at"] == "2026-12-20"  # the first time it was logged is kept
    assert nav.update_outcome(b, {"id": "irap", "status": "none"}, TODAY) == []


def test_funding_is_kept_only_when_the_founder_got_in():
    for status in ("applied", "not_selected", "withdrew"):
        assert nav.update_outcome([], {"id": "x", "name": "Program X", "status": status, "funding": "over_500k"}, TODAY)[0]["funding"] == ""
    assert nav.update_outcome([], {"id": "x", "name": "Program X", "status": "completed", "funding": "under_25k"}, TODAY)[0]["funding"] == "under_25k"


def test_bad_outcomes_are_refused_with_a_readable_message():
    for body, word in (({"id": "x", "name": "Program X", "status": "won"}, "Choose"), ({"id": "", "name": "Program X", "status": "applied"}, "Which program"),
                       ({"id": "x", "name": "P", "status": "applied"}, "name"), ({"id": "x", "name": "Program X", "status": "accepted", "funding": "a lot"}, "funding")):
        with pytest.raises(ValueError, match=word):
            nav.update_outcome([], body, TODAY)
    many = [{"id": f"p{i}", "name": f"Program {i}", "status": "applied"} for i in range(nav.MAX_OUTCOMES)]
    with pytest.raises(ValueError, match="up to"):
        nav.update_outcome(many, {"id": "one-more", "name": "One more", "status": "applied"}, TODAY)


# ---- the API ----------------------------------------------------------------------------------------------------------
def test_a_founder_logs_outcomes_and_chooses_whether_to_share():
    with TestClient(server.app) as c:
        assert c.post("/api/navigator/outcomes", json={"id": "irap", "name": "NRC IRAP", "status": "applied"}).status_code in (401, 403)
        r = c.post("/api/hub/signup", json={"accepted_terms": True, "email": "outcomes-nav@example.com", "password": "Sup3rSecret!", "name": "Outcome Founder"})
        assert r.status_code == 201, r.text
        j = c.get("/api/navigator/outcomes").json()
        assert j["applications"] == [] and j["share"] is False  # nothing is shared until the founder says so
        assert [s["key"] for s in j["statuses"]] == ["applied", "accepted", "not_selected", "withdrew", "completed"]
        r = c.post("/api/navigator/outcomes", json={"id": "irap", "name": "NRC IRAP", "type": "grant", "status": "accepted", "funding": "100k_500k"})
        assert r.status_code == 200 and r.json()["applications"][0]["funding"] == "100k_500k"
        assert c.post("/api/navigator/outcomes", json={"id": "irap", "name": "NRC IRAP", "status": "wat"}).status_code == 400
        assert c.get("/api/navigator/outcomes").json()["applications"][0]["status"] == "accepted"
        assert c.put("/api/navigator/outcomes/sharing", json={"share": True}).json()["share"] is True
        assert c.get("/api/navigator/outcomes").json()["share"] is True
        assert c.put("/api/navigator/outcomes/sharing", json={"share": False}).json()["share"] is False
        assert c.post("/api/navigator/outcomes", json={"id": "irap", "status": "none"}).json()["applications"] == []


def test_the_founders_own_export_includes_their_outcomes():
    with TestClient(server.app) as c:
        assert c.post("/api/hub/signup", json={"accepted_terms": True, "email": "outcomes-export@example.com", "password": "Sup3rSecret!", "name": "Export Founder"}).status_code == 201
        c.post("/api/navigator/outcomes", json={"id": "sred", "name": "SR&ED", "status": "applied"})
        out = c.get("/api/hub/account/export").json()
        assert out["account"]["applications"][0]["id"] == "sred"


# ---- what a hub sees ---------------------------------------------------------------------------------------------------
NOW = datetime(2026, 11, 26, tzinfo=timezone.utc)
SINCE = NOW - timedelta(days=90)


def _acct(i, *recs):
    return {"id": f"a{i}", "applications": [{"id": f"p{i}-{k}", "name": "Program", "type": t, "status": s, "funding": f, "updated_at": (NOW - timedelta(days=d)).isoformat()} for k, (t, s, f, d) in enumerate(recs)]}


def _rows(accounts, members=20):
    return {m: (v, note) for m, v, _u, note in impact.outcome_rows(accounts, members, SINCE, NOW)}


def test_nothing_is_shown_until_five_founders_share():
    four = [_acct(i, ("grant", "accepted", "25k_100k", 5)) for i in range(4)]
    rows = _rows(four)
    assert list(rows) == ["Founders sharing their progress"] and rows["Founders sharing their progress"][0] == "<5"
    assert _rows([])["Founders sharing their progress"][0] == "<5"


def test_totals_hide_small_groups_and_say_who_they_describe():
    accts = [_acct(i, ("grant", "accepted", "100k_500k", 5), ("accelerator", "not_selected", "", 10)) for i in range(5)] + [_acct(5, ("grant", "accepted", "25k_100k", 3), ("loan", "applied", "", 2)), _acct(6, ("grant", "applied", "", 400))]
    rows = _rows(accts, members=20)
    assert rows["Founders sharing their progress"][0] == 7 and "35%" in rows["Founders sharing their progress"][1] and "not every member" in rows["Founders sharing their progress"][1]
    assert rows["Applications logged"][0] == 12  # ten from the first five founders and two from the sixth; the record from 400 days ago is outside the period
    assert rows["Got in"][0] == 6 and rows["Not selected"][0] == 5
    assert rows["Applied, waiting to hear"][0] == "<5" and rows["Withdrew"][0] == "<5" and rows["Completed"][0] == "<5"
    assert rows["Share of decided applications that got in"][0] == 55  # 6 of 11 decisions
    assert rows["Programs that led to funding"][0] == 6
    assert rows["Funding received: $100,000 to $500,000"][0] == 5 and rows["Funding received: $25,000 to $100,000"][0] == "<5"
    assert rows["Applications to grant programs"][0] == 6 and rows["Applications to loan programs"][0] == "<5"


def test_the_decided_share_is_left_out_when_too_few_decisions_exist():
    accts = [_acct(i, ("grant", "applied", "", 3)) for i in range(5)] + [_acct(5, ("grant", "accepted", "", 3))]
    assert "Share of decided applications that got in" not in _rows(accts)


@pytest.fixture(scope="module")
def admin():
    c = TestClient(server.app)
    c.__enter__()
    assert c.post("/api/auth/login", json={"email": "admin@yourcommunity.app", "password": "Demo123!"}).status_code == 200
    yield c
    c.__exit__(None, None, None)


def test_the_hub_export_counts_only_members_who_shared_and_never_names_them(admin):
    iso = lambda d: (datetime.now(timezone.utc) - timedelta(days=d)).isoformat()
    ids = [f"outcome-test-{i}" for i in range(6)]
    users = [{"id": i, "role": "member", "name": f"Secret Person {k}", "email": f"secret{k}@example.org", "membership_status": "approved", "joined_at": iso(200)} for k, i in enumerate(ids)]
    accounts = [{"id": i, "email": f"secret{k}@example.org", "share_outcome_totals": k != 5,  # the sixth member did NOT choose to share
                 "applications": [{"id": "p", "name": "Hidden Program Name", "type": "grant", "status": "accepted", "funding": "25k_100k", "updated_at": iso(5)}]} for k, i in enumerate(ids)]
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(server.db.users.insert_many([dict(u) for u in users]))
        loop.run_until_complete(database.hub_db().accounts.insert_many([dict(a) for a in accounts]))
        j = admin.get("/api/admin/metrics", params={"days": 90}).json()
        csv_text = admin.get("/api/admin/metrics.csv", params={"days": 90}).text
    finally:
        loop.run_until_complete(server.db.users.delete_many({"id": {"$in": ids}}))
        loop.run_until_complete(database.hub_db().accounts.delete_many({"id": {"$in": ids}}))
        loop.close()
    out = {r["metric"]: r["value"] for r in j["rows"] if r["section"] == impact.OUTCOMES_SECTION}
    assert out["Founders sharing their progress"] == 5 and out["Applications logged"] == 5 and out["Got in"] == 5  # the one who did not share is not counted
    for private in ("Secret Person", "secret0@", "Hidden Program Name", "outcome-test-"):
        assert private not in csv_text
