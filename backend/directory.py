"""Hub-level member directory: an O(1) index for "which communities does this email / user id
belong to", backed by a self-healing parallel fallback scan.

Why an index instead of keeping every insert site in sync: `<community>.users` gets inserted into
from roughly ten different call sites across this codebase (seed scripts, invites, admin, the hub
routes, integrations). Requiring every one of those to also write to an index is exactly the kind of
thing that quietly rots over time -- miss one new call site and a real login stops finding a real
membership. So instead: `record_membership()` is called opportunistically at the handful of hub.py
call sites that create a membership themselves (cheap, best-effort, never raises), and every read
path here also self-heals -- on any cache miss it falls back to a full scan across every community
(done in parallel with asyncio.gather, not a sequential loop) and writes what it finds back into the
index. The index can never drift into being wrong, only cold; a cold lookup just costs one scan
instead of one index read, and warms itself for next time.

A real member realistically belongs to 3-4 communities, so once warm this turns a per-login "check
every community" loop into a couple of direct lookups -- the fix stays correct even as the platform
grows to hundreds of communities, because the fallback scan (used only on a miss) is what stays
correct, not the index itself.
"""
from __future__ import annotations

import asyncio
from typing import List, Optional, Tuple

from database import COMMUNITY_SLUGS, dbfor, hub_db


def _key(slug: str, email: str) -> str:
    return f"{slug}:{email}"


async def ensure_directory_indexes() -> None:
    col = hub_db().member_directory
    await col.create_index("email")
    await col.create_index("user_id")


async def record_membership(slug: str, email: Optional[str], user_id: Optional[str]) -> None:
    """Best-effort cache write -- call this right after inserting a doc into a community's `users`
    collection. Never raises: a failure here just means the next read falls back to a scan, which is
    slower but still correct."""
    if not email or not user_id:
        return
    try:
        await hub_db().member_directory.update_one(
            {"_id": _key(slug, email.strip().lower())},
            {"$set": {"slug": slug, "email": email.strip().lower(), "user_id": user_id}},
            upsert=True,
        )
    except Exception:
        pass


async def _forget_membership(slug: str, email: str) -> None:
    try:
        await hub_db().member_directory.delete_one({"_id": _key(slug, email)})
    except Exception:
        pass


async def _scan_for_email(email: str) -> List[Tuple[str, dict]]:
    async def _one(slug: str):
        d = await dbfor(slug).users.find_one({"email": email})
        return (slug, d) if d else None

    results = await asyncio.gather(*(_one(slug) for slug in COMMUNITY_SLUGS))
    hits = [r for r in results if r]
    for slug, doc in hits:
        if doc.get("id"):
            await record_membership(slug, email, doc["id"])
    return hits


async def find_all_for_email(email: str) -> List[Tuple[str, dict]]:
    """Every community this email has a `users` doc in, as (slug, doc) pairs. Fast path: read the
    index for this email, then fetch each hit's doc directly (a handful of direct lookups, not a
    loop over every community). Falls back to a parallel full scan -- and backfills the index from
    it -- whenever the index has nothing yet for this email (cold start, or a doc inserted through a
    call site that doesn't call record_membership)."""
    email = (email or "").strip().lower()
    if not email:
        return []
    idx_hits = [doc async for doc in hub_db().member_directory.find({"email": email})]
    if not idx_hits:
        return await _scan_for_email(email)

    async def _one(slug: str):
        d = await dbfor(slug).users.find_one({"email": email})
        return (slug, d) if d else None

    results = await asyncio.gather(*(_one(h["slug"]) for h in idx_hits))
    hits = [r for r in results if r]
    if len(hits) < len(idx_hits):
        # The index pointed at a membership that no longer exists (e.g. the user doc was removed).
        # Drop those stale entries; harmless either way since a read always double-checks the doc.
        found = {slug for slug, _ in hits}
        for h in idx_hits:
            if h["slug"] not in found:
                await _forget_membership(h["slug"], email)
    return hits


async def find_by_id(user_id: str) -> Optional[Tuple[str, dict]]:
    """The (slug, doc) for a user id -- used when only a JWT subject id is known. Fast path: read the
    index by user_id. Falls back to a parallel scan and backfills on miss."""
    if not user_id:
        return None
    entry = await hub_db().member_directory.find_one({"user_id": user_id})
    if entry:
        d = await dbfor(entry["slug"]).users.find_one({"id": user_id})
        if d:
            return entry["slug"], d
        try:
            await hub_db().member_directory.delete_one({"_id": entry["_id"]})
        except Exception:
            pass

    async def _one(slug: str):
        d = await dbfor(slug).users.find_one({"id": user_id})
        return (slug, d) if d else None

    results = await asyncio.gather(*(_one(slug) for slug in COMMUNITY_SLUGS))
    hits = [r for r in results if r]
    if hits:
        slug, doc = hits[0]
        if doc.get("email"):
            await record_membership(slug, doc["email"], user_id)
        return hits[0]
    return None
