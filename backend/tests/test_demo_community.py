"""The practice community is removed from a real deployment, and only when this feature created it."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"

import database
import demo_community as dc


def run(coro):
    return asyncio.run(coro)


def test_removes_a_seeded_practice_community():
    async def go():
        await database.hub_db().communities.insert_one({"slug": dc.SLUG, "name": "Demo Innovation Hub", "demo": True})
        await database.dbfor(dc.SLUG).events.insert_one({"id": "e1", "title": "x"})
        database.register_community_slug(dc.SLUG)
        assert await dc.remove_practice_community() is True
        assert await database.hub_db().communities.find_one({"slug": dc.SLUG}) is None
        assert await database.dbfor(dc.SLUG).events.count_documents({}) == 0
        assert dc.SLUG not in database.COMMUNITY_SLUGS
        assert await dc.remove_practice_community() is False      # nothing left: a no-op
    run(go())


def test_never_touches_a_real_community_with_the_same_slug():
    async def go():
        await database.hub_db().communities.insert_one({"slug": dc.SLUG, "name": "A real hub"})          # no demo flag
        await database.dbfor(dc.SLUG).events.insert_one({"id": "e2", "title": "real"})
        assert await dc.remove_practice_community() is False
        assert await database.dbfor(dc.SLUG).events.count_documents({}) == 1
        await database.hub_db().communities.delete_many({"slug": dc.SLUG})
        await database.client.drop_database(database.dbfor(dc.SLUG).name)
    run(go())
