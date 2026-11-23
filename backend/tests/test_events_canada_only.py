"""Founder events stay Canadian and correctly placed: no foreign listings, no made-up cities, no wrong provinces."""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"

import events_feed as ef
import events_job as job

NOW = datetime(2026, 11, 23, 15, 0, tzinfo=timezone.utc)
SRC = {"id": "t", "name": "Test source", "group": "organizer", "kind": "auto", "province": "ON", "city": "Toronto", "founder": True, "priority": 1}


def raw(**kw):
    start = (NOW + timedelta(days=5)).strftime("%Y-%m-%dT18:00:00-05:00")
    d = {"title": "Founder networking night", "start": start, "end": start, "url": "https://example.org/e/1", "venue": "", "city": "", "region": "", "country": "", "online": False}
    d.update(kw)
    return d


def test_a_wrong_region_code_does_not_beat_the_address():
    # Eventbrite sent a Nunavut code for a cafe in North York, Ontario.
    e = ef.normalize(raw(venue="Cafe Landwer, 1912 Avenue Road, North York, ON M5M 4A1, Canada", city="Toronto", region="NU"), SRC, NOW)
    assert e["province"] == "ON"
    e = ef.normalize(raw(city="Toronto", region="NU"), SRC, NOW)
    assert e["province"] == "ON"       # a well-known city also beats a bad region code


def test_a_real_region_is_still_used_when_nothing_else_says_where():
    assert ef._province("BC", "Kelowna", "", "ON") == "BC"
    assert ef._province("Alberta", "", "", "ON") == "AB"
    assert ef._province("", "", "", "ON") == "ON"


def test_listings_with_a_foreign_address_are_dropped():
    assert ef.normalize(raw(venue="Hotel Hyatt, 100 Main St, Houston, TX 77002"), SRC, NOW) is None
    assert ef.normalize(raw(venue="WeWork, London, United Kingdom"), SRC, NOW) is None
    assert ef.normalize(raw(venue="MaRS, 101 College St, Toronto, ON M5G 1L7"), SRC, NOW) is not None


def test_an_aggregator_without_a_city_does_not_invent_one():
    src = {**SRC, "city": ""}
    e = ef.normalize(raw(venue=""), src, NOW)
    assert e["city"] == "" and e["province"] == "ON"


def test_a_meeting_link_venue_is_online_and_has_no_city():
    for v in ("MS Teams", "Zoom", "Microsoft Teams meeting"):
        e = ef.normalize(raw(venue=v), SRC, NOW)
        assert e["online"] is True and e["city"] == ""


def test_the_global_strive_calendar_is_not_a_source_and_no_source_invents_a_city():
    sources = job.load_sources()
    ids = {s["id"] for s in sources}
    assert "meetup-strive-networking" not in ids
    sbec = next(s for s in sources if s["id"] == "southgeorgianbay-sbec")
    assert sbec["city"] == ""


class FakeColl:
    def __init__(self, rows):
        self.rows = rows
        self.gone = []

    def find(self, *_a, **_k):
        rows = self.rows

        class It:
            def __aiter__(s):
                s.i = iter(rows)
                return s

            async def __anext__(s):
                try:
                    return dict(next(s.i))
                except StopIteration:
                    raise StopAsyncIteration
        return It()

    async def delete_one(self, q):
        self.gone.append(q["id"])


class FakeDb:
    def __init__(self, rows):
        self.founder_events = FakeColl(rows)


def test_a_deploy_clears_stored_foreign_events_and_events_of_removed_sources():
    rows = [
        {"id": "a", "source_id": "meetup-strive-networking", "title": "General Business Networking - Berlin", "summary": "", "venue": "", "city": "Ottawa", "online": False},
        {"id": "b", "source_id": "dmz", "title": "Founder networking night", "summary": "", "venue": "Hotel, Houston, TX 77002", "city": "Houston", "online": False},
        {"id": "c", "source_id": "dmz", "title": "Founder networking night", "summary": "", "venue": "MaRS, Toronto, ON", "city": "Toronto", "online": False},
    ]
    db = FakeDb(rows)
    n = asyncio.run(job.purge_irrelevant(db))
    assert n == 2 and sorted(db.founder_events.gone) == ["a", "b"]
