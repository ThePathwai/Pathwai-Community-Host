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

One sharp edge this design has to guard against: `find_all_for_email`'s fast path trusts *any*
non-empty index as complete, so it only ever falls back to a full scan when the index has *zero*
entries for that email. That's safe as long as every doc for an email is indexed all-or-nothing --
but an email can have a users doc in a community that predates this module (seeded directly, never
routed through `record_membership`) at the same time as a doc in a community that *was* indexed (a
membership created after this module existed). In that mixed case the index is non-empty but
incomplete, and the fast path would silently under-return forever. `reindex_email()` exists for
exactly that moment: call it (not the plain `record_membership()`) whenever code creates a new
membership for an email, and it does a full authoritative scan-and-reconcile rather than a single
upsert, so a previously-unindexed sibling doc gets picked up in the same pass. Insert-time events are
rare compared to logins, so paying for one full scan there is the right trade.
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


async def reindex_email(email: str) -> List[Tuple[str, dict]]:
    """Full, authoritative reconciliation for one email: scans every community and makes the index
    exactly match what's found there (backfills anything missing, drops anything stale). Call this
    -- instead of the plain record_membership() -- at every point where code just created a new
    membership doc for an email, so a mix of old unindexed docs and newly-recorded ones can't leave
    the index permanently incomplete (see the module docstring)."""
    email = (email or "").strip().lower()
    if not email:
        return []
    hits = await _scan_for_email(email)  # scans + backfills every doc it finds
    found = {slug for slug, _ in hits}
    async for entry in hub_db().member_directory.find({"email": email}):
        if entry["slug"] not in found:
            await _forget_membership(entry["slug"], email)
    return hits


async def person_by_email(email: str) -> Optional[dict]:
    """One platform-wide identity for an email, for the Hub's cross-community people features
    (follow, profile, platform messaging -- see routes/hub.py). Email, not any one `id`, is the only
    stable key here: most members never went through /hub/signup (they joined straight into a
    community), so they have no hub_db().accounts row at all, and even their *per-community* `id`
    differs from one community to the next (each community's `users` doc is its own independent
    insert). Merges the hub account (if any -- the self-maintained, most-authoritative copy) with
    whichever community membership doc has the richest profile, and returns every (slug, doc)
    membership alongside so callers can derive which communities to show publicly without a second
    round of lookups."""
    email = (email or "").strip().lower()
    if not email:
        return None
    acc = await hub_db().accounts.find_one({"email": email}, {"_id": 0, "password_hash": 0})
    hits = await find_all_for_email(email)
    if not acc and not hits:
        return None
    best = max((d for _, d in hits), key=lambda d: len(d.get("bio") or ""), default={})
    return {
        "email": email,
        "name": (acc or {}).get("name") or best.get("name") or email,
        "avatar_url": (acc or {}).get("avatar_url") or best.get("avatar_url"),
        "title": (acc or {}).get("title") or best.get("title") or "",
        "company": (acc or {}).get("company") or best.get("company") or "",
        "bio": (acc or {}).get("bio") or best.get("bio") or "",
        # The account's own gallery (self-maintained via PATCH /hub/profile) wins -- a community
        # `users` doc has no photos field today, but falling back to one costs nothing if that ever
        # changes, same precedence every other field here already uses.
        "photos": (acc or {}).get("photos") or best.get("photos") or [],
        "memberships": hits,
    }


async def list_all_people() -> List[dict]:
    """Every distinct person on the platform, by email -- the pool routes/hub.py's people search
    draws from. A platform-wide directory can't just read hub_db().accounts (see person_by_email's
    docstring: most members have no accounts row at all) or just the member_directory index (it's
    warmed lazily, on logins and a handful of membership-creating call sites -- see this module's
    own docstring -- so plenty of real, seeded memberships are never indexed until someone actually
    signs in with that email). So this does a direct `users.distinct("email")` across every
    community in parallel -- cheap, since `distinct` only touches that one indexed field -- unioned
    with every accounts-row email, then resolves each one the way person_by_email does. Cheap at
    today's scale (a few dozen distinct people); if the platform grows into the thousands this is
    the first place to add paging/an index-backed search instead of resolving everyone up front."""
    per_community = await asyncio.gather(*(dbfor(slug).users.distinct("email") for slug in COMMUNITY_SLUGS))
    emails = {e.strip().lower() for sub in per_community for e in sub if e}
    async for acc in hub_db().accounts.find({}, {"_id": 0, "email": 1}):
        if acc.get("email"):
            emails.add(acc["email"].strip().lower())
    people = await asyncio.gather(*(person_by_email(e) for e in emails))
    return [p for p in people if p]


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


async def revoke_sessions_for_email(email: str, new_password_hash: Optional[str] = None) -> bool:
    """Invalidate every session issued before now for this person -- on the platform account and on each
    community profile -- and, if given, set the new password hash on all of them in the same pass (they
    must never drift apart: login accepts any one of them). Returns False if the email matches nothing."""
    from auth import revocation_cutoff  # local: auth imports database, not directory

    email = email.strip().lower()
    upd = {"sessions_valid_after": revocation_cutoff()}
    if new_password_hash is not None:
        upd["password_hash"] = new_password_hash
    found = False
    hub = await hub_db().accounts.find_one({"email": email}, {"id": 1})
    if hub:
        await hub_db().accounts.update_one({"id": hub["id"]}, {"$set": upd})
        found = True
    for slug, rec in await find_all_for_email(email):
        await dbfor(slug).users.update_one({"id": rec["id"]}, {"$set": upd})
        found = True
    return found
