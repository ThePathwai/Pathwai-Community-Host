"""One-shot migration: assign each shared-content doc (events, resources,
announcements, slack signals) to an innovation space so the workspace
switcher shows visibly different content per space.

Idempotent — only writes to docs that don't yet have `space_slug`.
"""
from __future__ import annotations

import hashlib
from typing import List

# A curated list of Pathwai's most visible innovation spaces. Content that
# lives in these spaces feels believable across founder personas. Every slug
# MUST exist in the seeded organizations collection.
KEY_SPACES: List[str] = [
    "creative-destruction-lab",
    "mars-discovery-district",
    "platform-calgary",
    "communitech",
    "foresight",
    "volta",
    "invest-ottawa",
    "dmz",
    "university-of-toronto-entrepreneurship",
    "velocity-university-of-waterloo",
    "mila-quebec-ai-institute",
]


def _pick_space(doc_id: str, available: List[str]) -> str:
    """Deterministically pick a space based on the doc's id so re-runs stay stable."""
    h = int(hashlib.md5(doc_id.encode()).hexdigest(), 16)
    return available[h % len(available)]


async def backfill_content_spaces(db) -> dict:
    """Assign `space_slug` to any content doc that lacks it. Returns counts."""
    # Only assign spaces that actually exist in the seeded orgs collection —
    # otherwise switching would show a broken slug.
    existing_org_slugs = set()
    async for o in db.organizations.find({}, {"_id": 0, "slug": 1}):
        existing_org_slugs.add(o["slug"])
    available = [s for s in KEY_SPACES if s in existing_org_slugs]
    if not available:
        return {"skipped": True}

    counts = {}
    for collection in ("events", "resources", "announcements", "slack_signals", "email_updates"):
        n = 0
        async for doc in db[collection].find({"space_slug": {"$exists": False}}, {"_id": 1, "id": 1}):
            slug = _pick_space(str(doc.get("id") or doc.get("_id")), available)
            await db[collection].update_one({"_id": doc["_id"]}, {"$set": {"space_slug": slug}})
            n += 1
        counts[collection] = n
    return counts
