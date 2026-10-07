"""Birthdays: stored on the profile, age is derived from them, and only the age is visible to others."""
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"

import pytest
from fastapi.testclient import TestClient

import server

from birthday import BirthdayError, age_from, age_on, clean_birthday, parse_date, refresh_all_ages


def _iso_years_ago(years, days_off=0):
    t = date.today()
    try:
        d = t.replace(year=t.year - years)
    except ValueError:
        d = t.replace(year=t.year - years, day=28)
    return (d + timedelta(days=days_off)).isoformat()


def test_age_ticks_over_on_the_birthday():
    born = date(1990, 4, 23)
    assert age_on(born, date(2026, 4, 22)) == 35
    assert age_on(born, date(2026, 4, 23)) == 36
    assert age_on(date(2000, 2, 29), date(2026, 2, 28)) == 25
    assert age_on(date(2000, 2, 29), date(2026, 3, 1)) == 26


def test_parses_common_formats():
    assert parse_date("1990-04-23") == date(1990, 4, 23)
    assert parse_date("1990/4/23") == date(1990, 4, 23)
    assert parse_date("04/23/1990") == date(1990, 4, 23)
    assert parse_date("23/04/1990") == date(1990, 4, 23)  # first number can't be a month
    assert parse_date("Apr 23, 1990") == date(1990, 4, 23)
    assert parse_date("23rd April 1990") == date(1990, 4, 23)
    assert parse_date("  ") is None
    for bad in ("soon", "1990-13-40", "02/30/1990"):
        with pytest.raises(BirthdayError):
            parse_date(bad)


def test_limits():
    assert clean_birthday("") is None
    with pytest.raises(BirthdayError):
        clean_birthday((date.today() + timedelta(days=3)).isoformat())
    with pytest.raises(BirthdayError):
        clean_birthday(_iso_years_ago(10))
    with pytest.raises(BirthdayError):
        clean_birthday("1850-01-01")
    assert clean_birthday(_iso_years_ago(13, -1)) is not None
    with pytest.raises(BirthdayError):
        clean_birthday(_iso_years_ago(13, 1))  # a day short of 13


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


def login(c, email, pw="Demo123!"):
    c.post("/api/auth/logout")
    assert c.post("/api/auth/login", json={"email": email, "password": pw}).status_code == 200


def test_member_saves_birthday_and_age_follows(c):
    login(c, "admin@yourcommunity.app")
    assert c.post("/api/admin/users", json={"name": "Birth Day", "email": "birth.day@example.com", "password": "Passw0rd-long-1"}).status_code == 201
    login(c, "birth.day@example.com", "Passw0rd-long-1")
    b = _iso_years_ago(29, -10)
    r = c.patch("/api/me/profile", json={"values": {"birthday": b}})
    assert r.status_code == 200, r.text
    me = r.json()["user"]
    assert me["birthday"] == b and me["age"] == 29
    # a typed-in age can't override the birthday
    r = c.patch("/api/me/profile", json={"values": {"birthday": b, "age": 50}})
    assert r.json()["user"]["age"] == 29
    # bad dates are refused with a readable message
    r = c.patch("/api/me/profile", json={"values": {"birthday": "not a date"}})
    assert r.status_code == 400 and "birthday" in r.json()["detail"].lower()
    r = c.patch("/api/me/profile", json={"values": {"birthday": _iso_years_ago(8)}})
    assert r.status_code == 400
    # clearing it clears the age
    r = c.patch("/api/me/profile", json={"values": {"birthday": ""}})
    assert r.json()["user"]["birthday"] is None and r.json()["user"]["age"] is None
    c.patch("/api/me/profile", json={"values": {"birthday": b}})
    uid = c.get("/api/auth/me").json()["id"]
    # other members see the age but never the birthday; admins can see it
    login(c, "demo@yourcommunity.app")
    seen = c.get(f"/api/users/{uid}").json()
    assert seen["age"] == 29 and "birthday" not in seen and b not in c.get("/api/users", params={"q": "Birth Day"}).text
    login(c, "admin@yourcommunity.app")
    assert c.get(f"/api/users/{uid}").json()["birthday"] == b


def test_daily_refresh_updates_stale_ages():
    import asyncio
    from birthday import _refresh_collection

    class Coll:
        def __init__(self, rows): self.rows, self.writes = rows, []
        def find(self, *_a, **_k):
            rows = self.rows
            class It:
                def __aiter__(self_): self_.i = iter(rows); return self_
                async def __anext__(self_):
                    try: return next(self_.i)
                    except StopIteration: raise StopAsyncIteration
            return It()
        async def update_one(self, q, u): self.writes.append((q["id"], u["$set"]["age"]))

    coll = Coll([{"id": "a", "birthday": _iso_years_ago(40, -5), "age": 12}, {"id": "b", "birthday": _iso_years_ago(22, -5), "age": 22}])
    assert asyncio.run(_refresh_collection(coll)) == 1
    assert coll.writes == [("a", 40)]  # only the stale one is rewritten


def test_account_profile_birthday(c):
    c.post("/api/auth/logout")
    r = c.post("/api/hub/signup", json={"name": "Acct Birth", "email": "acct.birth@example.com", "password": "Passw0rd-long-1", "accepted_terms": True})
    assert r.status_code == 201, r.text
    b = _iso_years_ago(31, -3)
    r = c.patch("/api/hub/profile", json={"birthday": b})
    assert r.status_code == 200, r.text
    assert r.json()["account"]["birthday"] == b and r.json()["account"]["age"] == 31
    assert c.patch("/api/hub/profile", json={"birthday": _iso_years_ago(9)}).status_code == 400


def test_csv_import_reads_birthdays(c):
    login(c, "admin@yourcommunity.app")
    csv_text = "name,email,date of birth\nDob One,dob.one@example.com,1990-04-23\nDob Two,dob.two@example.com,garbage\n"
    r = c.post("/api/admin/members/import", json={"csv": csv_text, "dry_run": False, "confirm_permission": True})
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 2
    assert any("birthday" in n for row in r.json()["rows"] for n in row.get("notes", []))
    login(c, "admin@yourcommunity.app")
    users = {u["email"]: u for u in c.get("/api/admin/users").json()}
    assert users["dob.one@example.com"].get("birthday") == "1990-04-23"
    assert users["dob.one@example.com"].get("age") == age_from("1990-04-23")
    assert not users["dob.two@example.com"].get("birthday")
