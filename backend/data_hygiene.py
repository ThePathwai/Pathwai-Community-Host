"""Data hygiene · P1.

Idempotent sweep to keep the demo database looking professional:
- Purge obvious QA/test users (any account whose email matches
  common test patterns like `testmember+*@…` or `qa+*@…`).
- Purge their submissions (events / resources / announcements).
- Purge fixture rows with obvious QA titles ("Test ", "QA ", "Fixture ").

Safe to run on every startup — everything is a no-op when nothing matches.
"""
from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# Emails a real end-user would never pick. Kept generous on purpose so we
# don't need to chase individual QA rows one at a time.
QA_EMAIL_PATTERNS = [
    r"^testmember[+\-].*@",
    r"^qa[+\-].*@",
    r"^test[+\-].*@",
    r"^selenium[+\-].*@",
    r"^playwright[+\-].*@",
    r"^(auto|automation)[+\-].*@",
    r".*@test\.(test|local|invalid)$",
    r".*@example\.(test|invalid)$",
]

# Content titles that scream "QA fixture".
QA_TITLE_PATTERNS = [
    r"^\s*Test\s+",
    r"^\s*QA\s+",
    r"^\s*Fixture\s+",
    r"\btest submission\b",
    r"\bneeds\s+changes\b.*\btest\b",
    r"\bqa\s+event\b",
]


def _compile(patterns: list[str]) -> list[re.Pattern[str]]:
    return [re.compile(p, re.IGNORECASE) for p in patterns]


def _matches_any(value: str | None, compiled: list[re.Pattern[str]]) -> bool:
    if not value:
        return False
    return any(rx.search(value) for rx in compiled)


async def purge_qa_fixtures(db: Any) -> dict[str, int]:
    """Delete QA users + their content. Returns a small stats dict."""
    email_rx = _compile(QA_EMAIL_PATTERNS)
    title_rx = _compile(QA_TITLE_PATTERNS)

    # 1) Collect QA user IDs by scanning emails.
    qa_user_ids: list[str] = []
    async for u in db.users.find({}, {"id": 1, "email": 1, "_id": 0}):
        if _matches_any(u.get("email"), email_rx):
            qa_user_ids.append(u["id"])

    stats = {
        "users_deleted": 0,
        "events_deleted": 0,
        "resources_deleted": 0,
        "announcements_deleted": 0,
    }

    if qa_user_ids:
        for collection, key in [
            ("events", "events_deleted"),
            ("resources", "resources_deleted"),
            ("announcements", "announcements_deleted"),
        ]:
            r = await db[collection].delete_many({
                "$or": [
                    {"created_by": {"$in": qa_user_ids}},
                    {"author_id": {"$in": qa_user_ids}},
                    {"host_id": {"$in": qa_user_ids}},
                    {"submitted_by": {"$in": qa_user_ids}},
                ]
            })
            stats[key] += r.deleted_count
        # Now delete the users themselves.
        r = await db.users.delete_many({"id": {"$in": qa_user_ids}})
        stats["users_deleted"] = r.deleted_count
        # Also clean orphan memberships / applications / notifications.
        for c in ["memberships", "applications", "notifications", "profile_requests", "connect_requests"]:
            try:
                await db[c].delete_many({"user_id": {"$in": qa_user_ids}})
            except Exception:  # noqa: BLE001
                pass

    # 2) Kill any content row whose title matches a QA pattern
    #    (covers admin-submitted "Test Event" style rows too).
    for collection, key in [
        ("events", "events_deleted"),
        ("resources", "resources_deleted"),
        ("announcements", "announcements_deleted"),
    ]:
        async for doc in db[collection].find({}, {"_id": 1, "title": 1}):
            if _matches_any(doc.get("title"), title_rx):
                await db[collection].delete_one({"_id": doc["_id"]})
                stats[key] += 1

    if any(v > 0 for v in stats.values()):
        logger.info("data_hygiene purge: %s", stats)
    return stats
