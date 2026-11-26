"""Applications: which programs founders say they applied to (never how it went), and the totals a hub can export from it (only for founders who chose to share)."""
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
def test_an_application_is_marked_and_unmarked():
    a = nav.update_outcome([], {"id": "irap", "name": "NRC IRAP", "type": "grant", "status": "applied"}, TODAY)
    assert a == [{"id": "irap", "name": "NRC IRAP", "org": "", "type": "grant", "status": "applied", "at": "2026-11-26", "updated_at": "2026-11-26"}]
    b = nav.update_outcome(a, {"id": "irap", "name": "NRC IRAP", "status": "applied"}, date(2026, 12, 20))
    assert len(b) == 1 and b[0]["at"] == "2026-11-26" and b[0]["updated_at"] == "2026-12-20"  # the first time it was marked is kept
    assert nav.update_outcome(b, {"id": "irap", "status": "none"}, TODAY) == []


def test_how_it_went_is_never_stored():
    for status in ("accepted", "not_selected", "withdrew", "completed", "won"):
        with pytest.raises(ValueError, match="Choose"):
            nav.update_outcome([], {"id": "x", "name": "Program X", "status": status}, TODAY)
    assert "funding" not in nav.update_outcome([], {"id": "x", "name": "Program X", "status": "applied", "funding": "over_500k"}, TODAY)[0]


def test_bad_applications_are_refused_with_a_readable_message():
    for body, word in (({"id": "", "name": "Program X", "status": "applied"}, "Which program"), ({"id": "x", "name": "P", "status": "applied"}, "name")):
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
        r = c.post("/api/navigator/outcomes", json={"id": "irap", "name": "NRC IRAP", "type": "grant", "status": "applied"})
        assert r.status_code == 200 and r.json()["applications"][0]["status"] == "applied"
        assert c.post("/api/navigator/outcomes", json={"id": "irap", "name": "NRC IRAP", "status": "accepted"}).status_code == 400  # results are not collected
        assert c.get("/api/navigator/outcomes").json()["applications"][0]["status"] == "applied"
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
    return {"id": f"a{i}", "applications": [{"id": f"p{i}-{k}", "name": "Program", "type": t, "status": "applied", "updated_at": (NOW - timedelta(days=d)).isoformat()} for k, (t, d) in enumerate(recs)]}


def _rows(accounts, members=20):
    return {m: (v, note) for m, v, _u, note in impact.outcome_rows(accounts, members, SINCE, NOW)}


def test_nothing_is_shown_until_five_founders_share():
    four = [_acct(i, ("grant", 5)) for i in range(4)]
    rows = _rows(four)
    assert list(rows) == ["Founders sharing their applications"] and rows["Founders sharing their applications"][0] == "<5"
    assert _rows([])["Founders sharing their applications"][0] == "<5"


def test_totals_hide_small_groups_and_say_who_they_describe():
    accts = [_acct(i, ("grant", 5), ("accelerator", 10)) for i in range(5)] + [_acct(5, ("grant", 3), ("loan", 2)), _acct(6, ("grant", 400))]
    rows = _rows(accts, members=20)
    assert rows["Founders sharing their applications"][0] == 7 and "35%" in rows["Founders sharing their applications"][1] and "not every member" in rows["Founders sharing their applications"][1]
    assert rows["Applications reported"][0] == 12  # ten from the first five founders and two from the sixth; the record from 400 days ago is outside the period
    assert rows["Applications to grant programs"][0] == 6 and rows["Applications to loan programs"][0] == "<5"
    assert rows["Applications to accelerator programs"][0] == 5
    # nothing about results or funding is ever part of the export
    assert not [m for m in rows if "got in" in m.lower() or "funding" in m.lower() or "selected" in m.lower()]


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
                 "applications": [{"id": "p", "name": "Hidden Program Name", "type": "grant", "status": "applied", "updated_at": iso(5)}]} for k, i in enumerate(ids)]
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
    assert out["Founders sharing their applications"] == 5 and out["Applications reported"] == 5  # the one who did not share is not counted
    for private in ("Secret Person", "secret0@", "Hidden Program Name", "outcome-test-"):
        assert private not in csv_text
