"""Idempotent seed for Community Value Exchange demo content.

Two jobs:
  1. Attach *value-exchange* fields (services_offered, topics_can_advise_on,
     interests_hobbies, side_projects, resources_to_share, preferred_contact)
     to a handful of the fake platform users so the new Community filters
     have something meaningful to match on.
  2. Seed a small, believable set of open support requests across spaces so
     the Requests board is never empty on first login.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

# --- 1) Value-exchange enrichment for existing fake founders ---
# Batches of value-exchange payloads to spread across seeded rich-profile
# users. Assigned in order to any user with a `startup_name`, so we never
# have to guess at email addresses.
_VALUE_EXCHANGE_PAYLOADS: List[Dict[str, Any]] = [
    {
        "services_offered": ["Product strategy sessions", "Fundraising deck review", "Founder 1:1 coaching"],
        "topics_can_advise_on": ["Seed fundraising in Canada", "Toronto tech hiring", "Consumer AI wedges"],
        "interests_hobbies": ["Rock climbing", "Long-form journalism", "Home espresso"],
        "side_projects": [
            {"name": "UofT Founders Slack", "description": "Volunteer mod for the UofT alumni founders channel.", "link": ""},
        ],
        "resources_to_share": [
            {"label": "Seed pitch deck template", "description": "The template we used to close our pre-seed.", "link": "https://pitchdeck.example.com"},
        ],
        "preferred_contact": "in-app messages",
    },
    {
        "services_offered": ["Enterprise sales intros", "Customer discovery interviews"],
        "topics_can_advise_on": ["Selling to Canadian banks", "GTM for B2B SaaS", "Bootstrapping to $1M ARR"],
        "interests_hobbies": ["Ice hockey", "Bourbon", "Analog photography"],
        "resources_to_share": [
            {"label": "Sales one-pager template", "description": "The one-pager we hand to every new enterprise buyer.", "link": ""},
        ],
        "preferred_contact": "linkedin",
    },
    {
        "services_offered": ["Technical architecture review", "Hiring first eng team"],
        "topics_can_advise_on": ["Scaling backend systems", "Waterloo eng hiring", "Founder→CTO transition"],
        "interests_hobbies": ["Board games", "Trail running", "Homebrewing"],
        "preferred_contact": "in-app messages",
    },
    {
        "services_offered": ["AI model architecture review", "Research collaboration intros"],
        "topics_can_advise_on": ["Fine-tuning open models", "AI hiring in Montreal", "Publishing research alongside a startup"],
        "interests_hobbies": ["Jazz piano", "Kite surfing"],
        "resources_to_share": [
            {"label": "AI startup research reading list", "description": "The 12 papers we send to every new AI hire.", "link": ""},
        ],
        "preferred_contact": "email",
    },
    {
        "services_offered": ["Energy customer intros", "Calgary founder onboarding"],
        "topics_can_advise_on": ["Selling into energy incumbents", "Fundraising outside Toronto", "Alberta talent"],
        "interests_hobbies": ["Skiing", "Woodworking"],
        "preferred_contact": "in-app messages",
    },
    {
        "services_offered": ["Atlantic Canada intros", "First 10 customers strategy"],
        "topics_can_advise_on": ["Founding in Atlantic Canada", "Government funding", "Remote-first culture"],
        "interests_hobbies": ["Sailing", "Baking sourdough"],
        "preferred_contact": "linkedin",
    },
    {
        "services_offered": ["Diversity hiring playbook", "Panel moderating"],
        "topics_can_advise_on": ["Fierce Founders program", "Waterloo→Toronto move", "Female founder fundraising"],
        "interests_hobbies": ["Yoga", "Novel writing"],
        "preferred_contact": "email",
    },
]


async def ensure_value_exchange_enrichment(db) -> Dict[str, int]:
    """Attach value-exchange fields to seeded fake members. Only sets fields
    that are empty — never overwrites human edits.
    """
    touched = 0
    # Prefer real demo user (Faizah / u-founder-me) first so /me profile is rich.
    ordered_users: List[Dict[str, Any]] = []
    demo = await db.users.find_one({"id": "u-founder-me"})
    if demo:
        ordered_users.append(demo)
    async for u in db.users.find({"startup_name": {"$exists": True}}).limit(30):
        if u.get("id") == "u-founder-me":
            continue
        ordered_users.append(u)

    for user, patch in zip(ordered_users, _VALUE_EXCHANGE_PAYLOADS):
        set_ops: Dict[str, Any] = {}
        for k, v in patch.items():
            existing = user.get(k)
            has = existing and (
                len(existing) > 0 if isinstance(existing, (list, dict, str)) else True
            )
            if not has:
                set_ops[k] = v
        if set_ops:
            set_ops["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.users.update_one({"_id": user["_id"]}, {"$set": set_ops})
            touched += 1
    return {"users_enriched": touched}


# --- 2) Support requests demo seed ---
def _iso(delta_hours: int = 0) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=delta_hours)).isoformat()


# (space_slug, request dict). We pair each request to a user living in that
# space at seed time — see `ensure_support_requests_seed` for the lookup.
_REQUESTS_SEED: List[Dict[str, Any]] = [
    {
        "space_slug": "university-of-toronto-entrepreneurship",
        "title": "Looking for a fractional CFO who's raised seed in Canada",
        "description": "We're about to raise our seed round and want someone who's been through it — even 2 hrs / month to keep the model tight and investor updates crisp.",
        "category": "advice",
        "tags": ["fractional cfo", "seed fundraising", "canada"],
        "urgency": "urgent",
        "hours_ago": 3,
    },
    {
        "space_slug": "dmz",
        "title": "Need a photographer for our new brand shoot in Toronto",
        "description": "Booking a half-day shoot in the DMZ space next week. Portraits + product shots. Paid gig, we just need a great eye.",
        "category": "photographer / creative",
        "tags": ["photographer", "toronto", "half-day"],
        "urgency": "normal",
        "hours_ago": 11,
    },
    {
        "space_slug": "velocity-university-of-waterloo",
        "title": "Introducing an American design partner for our devtools product",
        "description": "Anyone here have warm intros into eng leadership at a mid-size US SaaS company (100-500 engineers)? We're looking for one design partner to close out Q1.",
        "category": "referral / intro",
        "tags": ["us design partner", "devtools", "eng leadership"],
        "urgency": "normal",
        "hours_ago": 26,
    },
    {
        "space_slug": "mila-quebec-ai-institute",
        "title": "First ML engineer hire — anyone open to a coffee about their comp package?",
        "description": "We're making our first proper ML hire and want to benchmark comp. Would love a chat with 2-3 founders who've hired at seed stage in Montreal or Toronto.",
        "category": "advice",
        "tags": ["hiring", "compensation", "ml eng"],
        "urgency": "normal",
        "hours_ago": 44,
    },
    {
        "space_slug": "platform-calgary",
        "title": "Anyone here understand federal Alberta energy grants?",
        "description": "We qualify for a SDTC grant but the paperwork is scaring us. Would pay for someone who's done this before to walk us through the checklist.",
        "category": "advice",
        "tags": ["grants", "sdtc", "alberta", "energy"],
        "urgency": "normal",
        "hours_ago": 62,
    },
    {
        "space_slug": "volta",
        "title": "Co-founder wanted — technical lead for an Atlantic remote-work HR tool",
        "description": "I've validated the problem with 30 HR leaders in Atlantic Canada and want a technical co-founder to build the MVP. Equity + salary once we close pre-seed.",
        "category": "co-founder",
        "tags": ["technical co-founder", "hr tech", "atlantic"],
        "urgency": "urgent",
        "hours_ago": 90,
    },
    {
        "space_slug": "communitech",
        "title": "Anyone want to swap Fierce Founders application feedback?",
        "description": "Drafting my Fierce Founders application this week — would love to exchange drafts with someone else applying, so we both get a fresh eye.",
        "category": "collaborator",
        "tags": ["fierce founders", "application", "peer review"],
        "urgency": "normal",
        "hours_ago": 5,
    },
    {
        "space_slug": "university-of-toronto-entrepreneurship",
        "title": "Looking for beta testers for a founder mental-health tool",
        "description": "Building a lightweight peer-support tool for founders. Would love 8-10 founders to try it for 2 weeks and give feedback.",
        "category": "customer / pilot",
        "tags": ["beta testers", "founder wellness"],
        "urgency": "normal",
        "hours_ago": 20,
    },
]


async def ensure_support_requests_seed(db) -> Dict[str, int]:
    """Seed a few open support requests if none exist yet."""
    await ensure_value_exchange_enrichment(db)

    existing = await db.support_requests.count_documents({})
    if existing > 0:
        return {"created": 0, "skipped": existing}

    # Build a pool of candidate authors up front — rich-profile users, real
    # demo user first, then any user with a `startup_name`. We then round-robin
    # assign each seeded request to a different author so demo doesn't look
    # like one person shouting into the void.
    candidates: List[Dict[str, Any]] = []
    demo = await db.users.find_one({"id": "u-founder-me"})
    if demo:
        candidates.append(demo)
    async for u in db.users.find({"startup_name": {"$exists": True}}).limit(30):
        if u.get("id") == "u-founder-me":
            continue
        candidates.append(u)
    if not candidates:
        return {"created": 0, "skipped": 0}

    created = 0
    for i, spec in enumerate(_REQUESTS_SEED):
        user = candidates[i % len(candidates)]
        now_iso = _iso(spec.get("hours_ago") or 0)
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "user_snapshot": {
                "id": user["id"],
                "name": user.get("name"),
                "avatar_url": user.get("avatar_url"),
                "title": user.get("title"),
                "company": user.get("company"),
            },
            "space_slug": spec["space_slug"],
            "title": spec["title"],
            "description": spec.get("description"),
            "category": spec.get("category") or "other",
            "tags": spec.get("tags") or [],
            "urgency": spec.get("urgency") or "normal",
            "status": "open",
            "is_featured": False,
            "created_at": now_iso,
            "updated_at": now_iso,
            "resolved_at": None,
        }
        await db.support_requests.insert_one(dict(doc))
        created += 1
    return {"created": created, "skipped": 0}
