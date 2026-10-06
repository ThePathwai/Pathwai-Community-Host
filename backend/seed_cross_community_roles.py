"""Demonstrates that a person's role is independent per community: the same login can be an admin
in one community and a plain member in another, in either direction.

This isn't a capability that needs building — routes/hub.py stores one `users` doc per community per
person, each with its own `role`, and auth.require_role() always re-derives the role from whichever
community is currently active (see database.py's `_CommunityDB`/`_current` contextvar), never from a
cached or global value. This module just makes it a clear, deliberate demonstration:

  - demo@yourcommunity.app (the "member" demo persona — a member of playr, grace and club-pto,
    nowhere an admin) is also the founding *admin* of Toronto Tech Collective, one of the empty demo
    communities from seed_empty_communities.py.
  - pastor@c3.example (grace's actual admin — role="admin" there, an ordinary named persona, not the
    demo login) is also a plain member of Toronto Tech Collective. Admin somewhere, member elsewhere.

Both land in the same community on purpose, so entering Toronto Tech Collective as either login shows
the other side of the story on the member list.

Deliberately NOT admin@yourcommunity.app for the "admin somewhere, member somewhere else" half: that
email is a platform admin by default (auth.PLATFORM_ADMIN_EMAILS via routes/hub.py's
is_platform_admin), and hub_enter() force-promotes a platform admin to role="admin" in whatever
community they enter — so a "member" doc seeded for it would just flip to admin the moment someone
clicked Enter, which demonstrates the opposite of the intended point.

Idempotent (checks for an existing doc by email before inserting) and safe to call on every startup,
same as the rest of the startup seeding.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

from auth import hash_password
from database import dbfor, hub_db
from directory import reindex_email

DEMO_MEMBER_EMAIL = "demo@yourcommunity.app"
GRACE_ADMIN_EMAIL = "pastor@c3.example"
CROSS_ROLE_SLUG = "toronto-tech-collective"  # where both demonstrations live


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _minimal_user(user_id: str, name: str, email: str, role: str, title: str, company: str) -> dict:
    now = _now()
    return {
        "id": user_id, "name": name, "email": email, "password_hash": hash_password(os.environ.get("DEMO_PASSWORD") or "Demo123!"),
        "role": role, "member_type": "admin" if role == "admin" else "member",
        "tagline": "", "bio": "", "title": title, "company": company, "location": "", "avatar_url": "", "cover_url": "",
        "expertise": [], "skill_set": [], "focus_areas": [], "open_to": [], "services_offered": [], "topics_can_advise_on": [],
        "interests_hobbies": [], "goals": [], "support_needs": [], "needs_seeking": [], "custom_fields": {},
        "contact": {"email": email}, "contact_visibility": "members", "hidden_from_directory": False,
        "signup_source": "demo_cross_role", "created_at": now, "updated_at": now, "membership_status": "approved",
    }


async def _ensure_member(slug: str, user_id: str, name: str, email: str, role: str, title: str, company: str) -> None:
    d = dbfor(slug)
    if await d.users.find_one({"email": email}):
        return
    await d.users.insert_one(_minimal_user(user_id, name, email, role, title, company))
    # Full reconciliation, not a single upsert: these emails also have pre-existing docs (in playr,
    # grace) that were seeded long before directory.py existed and were never indexed. A plain
    # record_membership() here would leave the index non-empty-but-incomplete for the email, and
    # find_all_for_email()'s fast path trusts any non-empty index as complete -- so the only way to
    # pick up those older docs is a full scan-and-reconcile, which reindex_email() does.
    await reindex_email(email)


async def ensure_cross_community_roles() -> None:
    if not await hub_db().communities.find_one({"slug": CROSS_ROLE_SLUG}):
        return  # only once seed_empty_communities.py has created it
    # member elsewhere (playr/grace/club-pto) -> admin here
    await _ensure_member(CROSS_ROLE_SLUG, "u-founder-me", "Fife Ashley-Dejo", DEMO_MEMBER_EMAIL, "admin", "Founder", "Toronto Tech Collective")
    # admin elsewhere (grace) -> plain member here
    await _ensure_member(CROSS_ROLE_SLUG, "u-g-admin", "Pastor Jonathan Martin", GRACE_ADMIN_EMAIL, "member", "Member", "Toronto Tech Collective")
