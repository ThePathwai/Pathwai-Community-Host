"""Shared Motor Mongo client — imported by server.py and every route module.

Set USE_MOCK_DB=true (or leave MONGO_URL unreachable in dev) to run against an
in-memory mongomock database. Production uses the real MONGO_URL.
"""
from __future__ import annotations

import contextvars
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

if os.environ.get("USE_MOCK_DB", "false").lower() == "true":
    from mongomock_motor import AsyncMongoMockClient

    client = AsyncMongoMockClient()
else:
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])

_BASE = os.environ.get("DB_NAME", "test_database")
DEFAULT_COMMUNITY = "playr"
COMMUNITY_SLUGS = ["playr", "grace", "the-village", "club-pto"]
_current: contextvars.ContextVar = contextvars.ContextVar("pathwai_community", default=DEFAULT_COMMUNITY)


def dbfor(slug: str):
    """Raw database for one community. Playr keeps the original DB name; the rest get `<name>__<slug>`."""
    return client[_BASE if slug == DEFAULT_COMMUNITY else f"{_BASE}__{slug}"]


def hub_db():
    """Platform-level database: Pathwai accounts that are not (yet) members of any community."""
    return client[f"{_BASE}__hub"]


def set_community(slug: str):
    return _current.set(slug if slug in COMMUNITY_SLUGS else DEFAULT_COMMUNITY)


def register_community_slug(slug: str) -> None:
    """Make a newly (self-serve) created community routable — CommunityMiddleware / set_community()
    only pin requests to slugs in this list. COMMUNITY_SLUGS is mutated in place (not reassigned) so
    every module that did `from database import COMMUNITY_SLUGS` sees the addition immediately."""
    if slug not in COMMUNITY_SLUGS:
        COMMUNITY_SLUGS.append(slug)


def current_community() -> str:
    return _current.get()


class _CommunityDB:
    """Every route imports `db`; this proxy points it at the active community's database for the current request."""

    def __getattr__(self, name):
        return getattr(dbfor(_current.get()), name)

    def __getitem__(self, name):
        return dbfor(_current.get())[name]


db = _CommunityDB()


def strip_id(doc):
    if doc is None:
        return None
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc
