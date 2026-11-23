"""Retires the practice community ("demo-hub") from a REAL deployment.

An earlier version seeded a made-up "Demo Innovation Hub" into the live database so any account could walk into it. That was wrong:
the practice community belongs in the demo profile only (the in-browser demo, see frontend/src/lib/demoHubConfig.js), never in a real
account's list of communities. This runs on every start of a production server and is a no-op once the community is gone.

It only ever removes a community that this feature created: the platform row must carry `demo: True`, so a real community that
happens to share the slug is never touched.
"""
from __future__ import annotations

import logging

from database import COMMUNITY_SLUGS, client, dbfor, hub_db

SLUG = "demo-hub"
log = logging.getLogger(__name__)


async def remove_practice_community() -> bool:
    """Delete the seeded practice community, if one exists. Returns True when something was removed."""
    row = await hub_db().communities.find_one({"slug": SLUG})
    if not row or row.get("demo") is not True:
        return False
    await client.drop_database(dbfor(SLUG).name)
    await hub_db().communities.delete_one({"slug": SLUG, "demo": True})
    if SLUG in COMMUNITY_SLUGS:
        COMMUNITY_SLUGS.remove(SLUG)
    log.info("removed the practice community %s from this deployment", SLUG)
    return True
