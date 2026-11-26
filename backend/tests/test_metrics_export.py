"""The hub metrics export: every number in the reports as rows (JSON) or a CSV. Totals only, never people."""
import csv
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import impact
import server


def client(email):
    c = TestClient(server.app)
    c.__enter__()
    r = c.post("/api/auth/login", json={"email": email, "password": "Demo123!"})
    assert r.status_code == 200, r.text
    return c


@pytest.fixture(scope="module")
def member():
    c = client("demo@yourcommunity.app")
    yield c
    c.__exit__(None, None, None)


@pytest.fixture(scope="module")
def admin():
    c = client("admin@yourcommunity.app")
    yield c
    c.__exit__(None, None, None)


NOW = datetime(2026, 11, 20, tzinfo=timezone.utc)


def _world():
    iso = lambda days: (NOW - timedelta(days=days)).isoformat()
    users = [{"id": "a", "role": "member", "name": "Zelda Quincy", "email": "zelda@example.org", "joined_at": iso(300)},
             {"id": "b", "role": "member", "name": "Bram Okafor", "email": "bram@example.org", "joined_at": iso(300)},
             {"id": "c", "role": "member", "name": "Cleo Tran", "email": "cleo@example.org", "joined_at": iso(20)}]
    events = [{"id": "e1", "title": "=HYPERLINK(\"http://evil.example\",\"x\")", "starts_at": iso(10), "attendee_ids": ["a", "b", "c"], "rsvps": {"a": "yes", "b": "yes", "c": "yes"}, "attended_ids": ["a", "b"]}]
    return {"now": NOW, "users": users, "events": events, "resources": [], "engagement": [], "connects": [], "rsvp_log": [],
            "acts": [("a", NOW - timedelta(days=2)), ("c", NOW - timedelta(days=1))], "support": [], "nudges": [], "pending_apps": 0}


def _by(rows, section, metric):
    return next(r for r in rows if r["section"] == section and r["metric"] == metric)


def test_rows_carry_value_previous_period_and_change():
    t = impact.metrics_table(_world(), 30, "Test Hub")
    assert t["community"] == "Test Hub" and t["period_start"] == "2026-10-21" and t["period_end"] == "2026-11-20"
    members = _by(t["rows"], "Membership", "Members")
    assert members["value"] == 3 and members["previous"] == 2 and members["change"] == 1  # Cleo joined in the window
    assert _by(t["rows"], "Events", "Events held")["value"] == 1
    assert _by(t["rows"], "Events", "Checked in at events")["value"] == 2
    assert t["compared_with_previous"] is True


def test_a_number_that_does_not_exist_yet_is_left_out_not_invented():
    d = _world()
    d["events"][0]["attended_ids"] = []
    metrics = {r["metric"] for r in impact.metrics_table(d, 30, "Test Hub")["rows"]}
    assert "Checked in at events" not in metrics and "Turnout of those who signed up" not in metrics


def test_no_comparison_for_a_hub_that_did_not_exist_yet():
    d = _world()
    d["users"] = [u for u in d["users"] if u["id"] == "c"]
    t = impact.metrics_table(d, 30, "Test Hub")
    assert t["compared_with_previous"] is False
    assert all(r["previous"] is None and r["change"] is None for r in t["rows"] if r["section"] == "Membership")


def test_small_groups_show_as_under_five():
    t = impact.metrics_table(_world(), 30, "Test Hub", {"Funding": 3, "Mentorship": 7, "Legal help": 0})
    needs = {r["metric"]: r["value"] for r in t["rows"] if r["section"] == "What members said they need"}
    assert needs == {"Mentorship": 7, "Funding": "<5"}  # zero is left out; the order is biggest first


def test_csv_has_the_columns_no_people_and_defuses_formulas():
    t = impact.metrics_table(_world(), 30, "Test Hub", {"Funding": 3})
    text = impact.metrics_csv(t)
    assert text.startswith("﻿")
    rows = list(csv.reader(io.StringIO(text.lstrip("﻿"))))
    assert rows[0] == impact.CSV_COLUMNS
    assert all(len(r) == len(impact.CSV_COLUMNS) for r in rows)
    for private in ("Zelda", "Quincy", "Bram", "Okafor", "Cleo", "zelda@", "bram@", "cleo@", "@example.org"):
        assert private not in text
    title = next(r for r in rows if r[4] == "Events held" and "HYPERLINK" in r[5])
    assert title[5].startswith("'=")  # a sheet would otherwise run it as a formula


def test_members_cannot_export(member):
    assert member.get("/api/admin/metrics").status_code == 403
    assert member.get("/api/admin/metrics.csv").status_code == 403
    assert TestClient(server.app).get("/api/admin/metrics.csv").status_code in (401, 403)


def test_admin_downloads_the_csv(admin):
    r = admin.get("/api/admin/metrics.csv", params={"days": 30})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"] and r.headers["content-disposition"].endswith('.csv"')
    assert r.headers["cache-control"] == "no-store"
    rows = list(csv.reader(io.StringIO(r.text.lstrip("﻿"))))
    assert rows[0] == impact.CSV_COLUMNS and len(rows) > 5
    assert "@" not in r.text  # no member emails, ever


def test_admin_json_matches_the_csv(admin):
    j = admin.get("/api/admin/metrics", params={"days": 365}).json()
    assert j["period_days"] == 365 and j["rows"] and "No names" in j["note"]
    assert {"section", "metric", "value", "previous", "change", "unit", "note"} <= set(j["rows"][0])
    assert admin.get("/api/admin/metrics", params={"days": 7}).json()["period_days"] == 90  # an unknown period falls back to 90, like the reports
