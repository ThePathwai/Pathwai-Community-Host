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

def demo_mode() -> bool:
    """True for the throwaway demo/dev/test environment, False for a real deployment.

    Demo mode is what seeds fake communities and members, creates the public "Try the demo" logins,
    exposes the reseed endpoints and makes demo@/admin@yourcommunity.app a platform admin. A real
    launch must have none of that, so it is OFF whenever the app talks to a real MongoDB
    (USE_MOCK_DB unset/false) and only turns on there if DEMO_MODE=true is set explicitly -- e.g.
    for a separate, public "poke around" instance. With the in-memory mock DB (local dev, tests,
    the static preview) it defaults to on."""
    v = os.environ.get("DEMO_MODE")
    if v is not None and v.strip() != "":
        return v.strip().lower() == "true"
    return os.environ.get("USE_MOCK_DB", "false").lower() == "true"


if os.environ.get("USE_MOCK_DB", "false").lower() == "true":
    from mongomock_motor import AsyncMongoMockClient

    client = AsyncMongoMockClient()
else:
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])

_BASE = os.environ.get("DB_NAME", "test_database")
DEFAULT_COMMUNITY = "playr"
# The four built-ins only exist (and are only routable) in demo mode. A real deployment starts with no
# communities at all: each one is created self-serve and registered from hub_db().communities at boot.
COMMUNITY_SLUGS = ["playr", "grace", "the-village", "club-pto"] if demo_mode() else []
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
