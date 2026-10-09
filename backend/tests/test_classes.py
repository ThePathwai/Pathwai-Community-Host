"""Classes: bookable schedule with waitlists, instructors, ratings and reviews."""
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"

import pytest
from fastapi.testclient import TestClient

import server

PW = "Passw0rd-long-1"


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


def login(c, email, pw="Demo123!"):
    c.post("/api/auth/logout")
    assert c.post("/api/auth/login", json={"email": email, "password": pw}).status_code == 200


def iso(delta):
    return (datetime.now(timezone.utc) + delta).isoformat().replace("+00:00", "Z")


def admin(c):
    login(c, "admin@yourcommunity.app")


def member(c, name, email):
    admin(c)
    assert c.post("/api/admin/users", json={"name": name, "email": email, "password": PW}).status_code == 201
    login(c, email, PW)


def new_class(c, **kw):
    admin(c)
    body = {"title": "Strength 45", "starts_at": iso(timedelta(days=2)), "duration_min": 45, "capacity": 2, **kw}
    r = c.post("/api/classes", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_admin_builds_the_schedule_and_members_see_it(c):
    admin(c)
    inst = c.post("/api/classes/instructors", json={"name": "Marcus Reid", "bio": "Coach", "specialties": ["Strength", "HIIT"]})
    assert inst.status_code == 201
    made = new_class(c, instructor_id=inst.json()["id"], repeat_weeks=2, tz="America/Toronto", title="Rise & Lift")
    assert made["created"] == 3
    member(c, "Kai Member", "kai.member@example.com")
    rows = c.get("/api/classes", params={"days": 30}).json()["classes"]
    mine = [r for r in rows if r["title"] == "Rise & Lift"]
    assert len(mine) == 3 and len({r["series_id"] for r in mine}) == 1
    assert mine[0]["instructor"]["name"] == "Marcus Reid" and mine[0]["spots_left"] == 2 and mine[0]["my_status"] is None
    # a weekly repeat keeps the same Toronto clock time even across a daylight-saving change
    t = [datetime.fromisoformat(r["starts_at"].replace("Z", "+00:00")) for r in mine]
    assert (t[1] - t[0]).days == 7 or abs((t[1] - t[0]) - timedelta(days=7)) <= timedelta(hours=1)


def test_only_admins_manage_classes_and_instructors(c):
    member(c, "Plain Member", "plain.member@example.com")
    assert c.post("/api/classes", json={"title": "Nope", "starts_at": iso(timedelta(days=1))}).status_code == 403
    assert c.post("/api/classes/instructors", json={"name": "Nope Nope"}).status_code == 403
    assert c.get("/api/classes/reviews").status_code == 403


def test_booking_waitlist_and_promotion(c):
    cid = new_class(c, capacity=1, title="Tiny Class")["class"]["id"]
    member(c, "First Booker", "first.booker@example.com")
    assert c.post(f"/api/classes/{cid}/book").json()["status"] == "booked"
    assert c.post(f"/api/classes/{cid}/book").json()["status"] == "booked"  # booking twice changes nothing
    member(c, "Second Booker", "second.booker@example.com")
    assert c.post(f"/api/classes/{cid}/book").json()["status"] == "waitlist"
    d = c.get(f"/api/classes/{cid}").json()
    assert d["is_full"] and d["my_status"] == "waitlist" and d["my_waitlist_position"] == 1 and d["booked_count"] == 1
    # the first person cancels: the waitlisted person is booked in and told
    login(c, "first.booker@example.com", PW)
    assert c.delete(f"/api/classes/{cid}/book").status_code == 200
    login(c, "second.booker@example.com", PW)
    assert c.get(f"/api/classes/{cid}").json()["my_status"] == "booked"
    assert any("You're in" in n["title"] for n in c.get("/api/notifications").json()["notifications"])
    mine = c.get("/api/classes/mine").json()
    assert [x["id"] for x in mine["upcoming"]] == [cid] and mine["past"] == []


def seed_booking(cid, uid):
    """The API won't let anyone book a class that has already started, so a past booking goes straight into the (process-wide, in-memory) database."""
    import asyncio
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(server.db.class_bookings.insert_one(
            {"id": "b-" + cid, "class_id": cid, "series_id": "x", "user_id": uid, "status": "booked", "created_at": iso(timedelta(days=-2))}))
    finally:
        loop.close()


def test_reviews_need_a_finished_class_you_booked(c):
    admin(c)
    past = new_class(c, title="Yesterday Flow", starts_at=iso(timedelta(days=-1)), capacity=None)["class"]["id"]
    future = new_class(c, title="Tomorrow Flow", capacity=None)["class"]["id"]
    member(c, "Rev Iewer", "rev.iewer@example.com")
    assert c.post(f"/api/classes/{past}/book").status_code == 409            # already started
    assert c.post(f"/api/classes/{past}/review", json={"rating": 5}).status_code == 403   # never booked it
    c.post(f"/api/classes/{future}/book")
    assert c.post(f"/api/classes/{future}/review", json={"rating": 5}).status_code == 409  # hasn't happened yet


def test_review_flow_with_a_class_that_has_ended(c):
    admin(c)
    inst = c.post("/api/classes/instructors", json={"name": "Priya Nair"}).json()["id"]
    cid = new_class(c, title="Last Night Burn", starts_at=iso(timedelta(days=-1)), instructor_id=inst, capacity=None)["class"]["id"]
    member(c, "Real Reviewer", "real.reviewer@example.com")
    seed_booking(cid, c.get("/api/auth/me").json()["id"])
    d = c.get(f"/api/classes/{cid}").json()
    assert d["can_review"] is True and d["is_past"] is True
    assert c.post(f"/api/classes/{cid}/review", json={"rating": 9}).status_code == 400
    assert c.post(f"/api/classes/{cid}/review", json={"rating": 5, "instructor_rating": 4, "text": "Loved it"}).json()["updated"] is False
    assert c.post(f"/api/classes/{cid}/review", json={"rating": 4, "instructor_rating": 5, "text": "Still great"}).json()["updated"] is True
    d = c.get(f"/api/classes/{cid}").json()
    assert d["my_review"]["rating"] == 4 and d["rating"] == {"avg": 4.0, "count": 1} and d["reviews"][0]["text"] == "Still great"
    assert c.get("/api/classes/mine").json()["past"][0]["my_review"]["rating"] == 4
    insts = {i["name"]: i for i in c.get("/api/classes/instructors").json()["instructors"]}
    assert insts["Priya Nair"]["rating"] == {"avg": 5.0, "count": 1}
    admin(c)
    revs = c.get("/api/classes/reviews").json()["reviews"]
    assert revs[0]["class_title"] == "Last Night Burn" and revs[0]["instructor_name"] == "Priya Nair"
    assert c.delete(f"/api/classes/{cid}/reviews/{revs[0]['id']}").status_code == 200
    assert c.get(f"/api/classes/{cid}").json()["rating"]["count"] == 0


def test_cancelling_a_class_clears_bookings_and_tells_people(c):
    cid = new_class(c, title="Doomed Class", capacity=5)["class"]["id"]
    member(c, "Booked Person", "booked.person@example.com")
    c.post(f"/api/classes/{cid}/book")
    admin(c)
    assert c.delete(f"/api/classes/{cid}").json()["cancelled"] == 1
    login(c, "booked.person@example.com", PW)
    assert c.post(f"/api/classes/{cid}/book").status_code == 409
    assert all(x["id"] != cid for x in c.get("/api/classes/mine").json()["upcoming"])
    assert any("Cancelled" in n["title"] for n in c.get("/api/notifications").json()["notifications"])


def test_capacity_cannot_drop_below_whats_booked_and_checks_inputs(c):
    cid = new_class(c, title="Edit Me", capacity=3)["class"]["id"]
    member(c, "Edit Booker", "edit.booker@example.com")
    c.post(f"/api/classes/{cid}/book")
    admin(c)
    ok = {"title": "Edit Me", "starts_at": iso(timedelta(days=2)), "capacity": 1}
    assert c.patch(f"/api/classes/{cid}", json=ok).status_code == 200
    assert c.patch(f"/api/classes/{cid}", json={**ok, "capacity": 0}).status_code == 400
    assert c.post("/api/classes", json={"title": "x", "starts_at": iso(timedelta(days=1))}).status_code == 400
    assert c.post("/api/classes", json={"title": "Bad time", "starts_at": "tomorrow-ish"}).status_code == 400
    assert c.post("/api/classes", json={"title": "Too long", "starts_at": iso(timedelta(days=1)), "repeat_weeks": 99}).status_code == 400
