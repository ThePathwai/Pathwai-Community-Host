"""The practice community's sample content is well formed and stays inside the rules the rest of Pathwai enforces."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"

from datetime import datetime, timezone

import demo_community as dc
import navigator as nav
from community_group import community_group


def test_config_is_open_innovation_hub():
    cfg = dc.build_config()
    assert cfg["open_demo"] is True
    assert community_group(cfg) == "innovation"
    assert {n["key"] for n in cfg["nav"]} == {"assistant", "plan", "programs", "members", "events", "resources"}
    assert cfg["navigator"]["public"] is False          # its programs never appear in the national list


def test_programs_pass_the_same_check_an_admin_listing_does():
    rows = dc.build_programs()
    assert len(rows) == len({r["id"] for r in rows}) >= 5
    for r in rows:
        assert r["type"] in nav.TYPES and r["status"] in nav.STATUSES
        nav.community_program(r, dc.SLUG, dc.NAME)       # shapes into a catalog entry without error


def test_events_are_all_upcoming_and_ids_are_stable():
    now = datetime(2026, 11, 23, 12, tzinfo=timezone.utc)
    a = dc.build_events(now); b = dc.build_events(now)
    assert [e["id"] for e in a] == [e["id"] for e in b]
    assert all(e["starts_at"] > now.isoformat() for e in a)


def test_people_are_sample_members_that_cannot_sign_in():
    people = dc.build_people()
    assert len({p["email"] for p in people}) == len(people)
    assert all(p["password_hash"] is None and p["sample"] and p["email"].endswith(".example") for p in people)
    assert sum(1 for p in people if p["role"] == "admin") == 1
