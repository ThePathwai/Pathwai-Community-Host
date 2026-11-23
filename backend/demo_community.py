"""Pathwai's practice community: "Demo Innovation Hub".

A real community on the live site, with its own programs, events, resources and people, that ANY account can walk into at once
(config.open_demo; see routes/hub.py `_apply_to_community`). It exists so someone with a Pathwai account can see what a hub looks
like from the inside, using the same account and profile they already have, without waiting for a real community to confirm them.

Everything here is made up. It is written again on every start: programs, events, resources and people have fixed ids, and the
event dates are re-set relative to today so the events never go stale. Nothing here can touch a real community's data.
Real communities are never opened this way: they always wait for the Pathwai team to confirm a request.
"""
from __future__ import annotations

import copy
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

import navigator as nav
from database import dbfor, hub_db, register_community_slug
from routes.community_config import DEFAULT_CONFIG, THEME_PRESETS

SLUG = "demo-hub"
NAME = "Demo Innovation Hub"

# Ask, My plan, Programs & grants, People, Events and Resources: the places a founder uses inside a hub.
NAV = [
    {"key": "assistant", "label": "Ask", "enabled": True}, {"key": "plan", "label": "My plan", "enabled": True},
    {"key": "programs", "label": "Programs & grants", "enabled": True}, {"key": "members", "label": "People", "enabled": True},
    {"key": "events", "label": "Events", "enabled": True}, {"key": "resources", "label": "Resources", "enabled": True},
]

PROGRAMS: List[Dict[str, Any]] = [
    {"name": "Idea Lab", "type": "incubator", "summary": "Twelve weeks to turn an idea into something you can show customers, with a desk, weekly coaching and a demo night.",
     "amount": "Free desk and coaching", "stages": ["idea", "prototype"], "needs": ["space", "mentorship", "customers"], "audiences": ["student"],
     "requirements": ["Current student or recent graduate", "One founder who can attend weekly"], "status": "open"},
    {"name": "Pitch Day", "type": "competition", "summary": "Pitch five minutes to a room of investors and industry leaders. Winners share a prize pool and get a follow-up intro.",
     "amount": "Prize pool of $25,000", "stages": ["prototype", "launched"], "needs": ["funding", "network"], "audiences": [],
     "requirements": ["A working prototype or first users"], "status": "open"},
    {"name": "Mentor Match", "type": "mentorship", "summary": "Matched with an industry mentor for six months, based on your sector and what you need next.",
     "amount": "Free", "stages": ["idea", "prototype", "launched", "revenue"], "needs": ["mentorship", "network"], "audiences": [],
     "requirements": [], "status": "rolling"},
    {"name": "First Cheque Fund", "type": "grant", "summary": "A small grant to pay for your first prototype, legal set-up or user testing. Paid against receipts.",
     "amount": "Up to $5,000", "stages": ["idea", "prototype"], "needs": ["funding", "legal", "rd"], "audiences": ["student", "youth"],
     "requirements": ["Not yet incorporated, or incorporated less than a year", "Receipts for what the money paid for"], "status": "open"},
    {"name": "Customer Pilot Program", "type": "resource", "summary": "The hub's partner companies pilot early products and pay for the ones that work. Apply with a one-page brief.",
     "amount": "Paid pilots from $2,000", "stages": ["prototype", "launched", "revenue"], "needs": ["customers"], "audiences": [],
     "requirements": ["A product a company could try within a month"], "status": "rolling"},
    {"name": "Founder Legal Clinic", "type": "resource", "summary": "A free hour with a startup lawyer each month: incorporation, founder agreements, IP and contracts.",
     "amount": "Free", "stages": ["idea", "prototype", "launched"], "needs": ["legal", "ip"], "audiences": [],
     "requirements": [], "status": "rolling"},
]

# (title, days from today, Toronto hour, location, category, description, tags)
EVENTS: List[tuple] = [
    ("Founder Office Hours", 2, 16, "Innovation Centre, Room 214", "Office hours", "Drop in for fifteen minutes with a program lead. Bring one question about funding, customers or your next step.", ["advice"]),
    ("Idea Lab Demo Night", 6, 18, "Main auditorium", "Showcase", "Idea Lab teams show what they built in twelve weeks. Meet the founders, ask questions, and stay for the mixer.", ["showcase", "networking"]),
    ("How to Talk to Your First Ten Customers", 9, 17, "Online", "Workshop", "A practical workshop on finding, interviewing and learning from your first customers, with a template to take away.", ["customers", "workshop"]),
    ("Pitch Day", 16, 13, "Main auditorium", "Pitch", "Five minutes on stage, five minutes of questions. Investors, industry leaders and the whole founder community in the room.", ["pitch", "funding"]),
    ("Investor Coffee Chats", 21, 10, "Innovation Centre, lounge", "Networking", "Small-group coffee with three early-stage investors. Sign up with a one-line description of what you are building.", ["investors", "networking"]),
    ("Startup Legal Basics", 27, 12, "Online", "Workshop", "Founder agreements, equity, IP and contracts explained by a startup lawyer. Questions welcome.", ["legal", "workshop"]),
]

# (title, category, format, description, url, tags)
RESOURCES: List[tuple] = [
    ("Founder agreement template", "Template", "Doc", "A plain-language founder agreement covering roles, equity and what happens if someone leaves.", "https://example.com/demo-hub/founder-agreement", ["legal", "template"]),
    ("Customer interview guide", "Guide", "PDF", "Twelve questions that get honest answers from the people you hope will buy.", "https://example.com/demo-hub/customer-interviews", ["customers", "guide"]),
    ("Pitch deck starter", "Template", "Slides", "Ten slides, one idea per slide, with notes on what investors look for in each.", "https://example.com/demo-hub/pitch-deck", ["pitch", "template"]),
    ("Cloud credits for hub startups", "Perk", "Link", "Up to $5,000 of cloud credits from the hub's partners. Claim once your startup profile is complete.", "https://example.com/demo-hub/credits", ["tools", "perk"]),
    ("Grant writing checklist", "Guide", "Doc", "What every Canadian grant application asks for, and how to gather it in a week.", "https://example.com/demo-hub/grant-checklist", ["funding", "guide"]),
    ("Workspace booking", "Perk", "Link", "Book a desk or a meeting room at the Innovation Centre. Free for hub founders.", "https://example.com/demo-hub/workspace", ["space", "perk"]),
]

# (id, name, member_type, title, company, bio, skills, goals, needs, startup name, one-liner, stage, sector)
PEOPLE: List[tuple] = [
    ("dana", "Dana Whitfield", "alumni", "Entrepreneurship programs lead", "Sample College", "I run Pitch Day, Idea Lab and Mentor Match. I make sure every founder meets the right person and leaves with a next step.",
     ["Pitch coaching", "Mentor matching", "Program design"], ["Fill Pitch Day with the right judges"], ["Judges", "Mentors"], "", "", "", ""),
    ("amina", "Amina Yusuf", "founder", "Founder & CEO", "Tidewell", "Health technology student. I built Tidewell so no newcomer has to manage medication alone in a second language.",
     ["Health-tech product", "User research"], ["Pilot with ten community clinics"], ["Clinical advisors", "Pre-seed investors"], "Tidewell", "Medication reminders in the patient's own language, with a caregiver view.", "mvp", "health"),
    ("marcus", "Marcus Bell", "founder", "Co-founder", "Fieldnote", "Two engineers building notes software for site inspectors who work offline.",
     ["Software", "Field research"], ["Sign five paying inspection firms"], ["Customers", "Funding"], "Fieldnote", "Offline-first inspection notes that sync when the van gets signal.", "mvp", "tech"),
    ("priya", "Priya Raman", "mentor", "Operating partner", "Northbridge Ventures", "Twelve years in B2B software, six of them as a founder. I mentor founders on pricing and first sales.",
     ["Pricing", "Enterprise sales", "Fundraising"], ["Mentor four founders this term"], [], "", "", "", ""),
    ("jordan", "Jordan Okafor", "founder", "Founder", "Plated", "Ghost-kitchen software for small restaurant groups. Pre-revenue, thirty restaurants on the waitlist.",
     ["Operations", "Restaurant tech"], ["Launch the first paid pilot"], ["Pilot customers", "Legal"], "Plated", "Order routing for restaurants that run more than one brand from one kitchen.", "idea", "food"),
    ("lena", "Lena Hartmann", "partner", "Principal", "Harbourfront Angels", "I back pre-seed founders in health, climate and developer tools. I read every one-pager.",
     ["Angel investing", "Term sheets"], ["Back three new founders this year"], [], "", "", "", ""),
    ("sam", "Sam Chowdhury", "founder", "Founder", "Loop Climate", "Helping condo buildings cut energy use with low-cost sensors and a simple dashboard.",
     ["Hardware", "Energy data"], ["Install in twenty buildings"], ["Grants", "Pilot buildings"], "Loop Climate", "Low-cost energy sensors and a dashboard for condo boards.", "mvp", "cleantech"),
    ("ruth", "Ruth Mensah", "mentor", "Startup lawyer", "Mensah & Lee", "I run the monthly legal clinic. Incorporation, founder agreements, IP and contracts, in plain language.",
     ["Corporate law", "IP", "Contracts"], ["Help every hub founder get set up properly"], [], "", "", "", ""),
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def build_config(now: datetime | None = None) -> Dict[str, Any]:
    """The community's settings. Written on every start, so a change here reaches the live site on the next deploy."""
    now = now or _now()
    theme = next(t for t in THEME_PRESETS if t["preset"] == "pathwai")
    cfg = copy.deepcopy(DEFAULT_CONFIG)
    cfg.update({
        "community_name": NAME, "tagline": "Every program, grant, event, person and resource in one hub, ranked for your startup.",
        "community_kind": "Innovation hub", "community_type": "startup", "community_group": "innovation",
        "about": "Pathwai's practice community. It shows what a hub looks like from the inside: its own programs, events, resources and people, "
                 "reached with the same account and profile you already have. Everyone and everything here is made up.",
        "country": "Canada", "interest_tags": ["Entrepreneurship", "Startups", "Innovation"],
        "member_label_singular": "Founder", "member_label_plural": "Founders",
        "theme": {"preset": theme["preset"], "accent": theme["accent"]},
        "brand": {**DEFAULT_CONFIG["brand"], "preset": theme["preset"], "mode": theme["mode"], "colors": dict(theme["colors"]),
                  "font": "Inter", "heading_font": "Inter", "heading_style": "normal", "radius": "soft", "button_shape": "pill",
                  "login_headline": "Where founders meet capital.", "login_subhead": "Programs, events, people and resources in one hub.",
                  "welcome_message": f"Here is what to do next at {NAME}.", "footer_text": f"{NAME} · practice community", "support_email": ""},
        "nav": copy.deepcopy(NAV),
        "ecosystem": {"hub": NAME, "wider": "All of Canada", "city": "Toronto"},
        "navigator": {"public": False, "blurb": "Programs, events and people at the Demo Innovation Hub, for students and early-stage founders.",
                      "stages": ["idea", "prototype", "launched"], "provides": ["mentorship", "funding", "space", "customers", "network"],
                      "audiences": ["student"], "sectors": [], "city": "Toronto", "provinces": ["ON"]},
        "open_demo": True,                       # anyone with an account can enter at once; only this practice community has it
        "setup_completed": True, "_key": "singleton", "updated_at": now.isoformat(),
    })
    return cfg


def build_programs(now: datetime | None = None) -> List[Dict[str, Any]]:
    stamp = (now or _now()).isoformat()
    return [{"id": f"demo{i + 1}", **nav.clean_listing({**row, "org": NAME}), "created_at": stamp, "updated_at": stamp} for i, row in enumerate(PROGRAMS)]


def build_events(now: datetime | None = None) -> List[Dict[str, Any]]:
    now = now or _now()
    base = now.replace(minute=0, second=0, microsecond=0)
    out = []
    for i, (title, days, hour, where, cat, desc, tags) in enumerate(EVENTS):
        start = (base + timedelta(days=days)).replace(hour=hour + 4)  # Toronto time (EDT), stored in UTC
        end = start + timedelta(hours=1, minutes=30)
        out.append({"id": f"demo-ev-{i + 1}", "title": title, "description": desc, "starts_at": start.isoformat(), "ends_at": end.isoformat(), "location": where,
                    "virtual_url": None, "host": NAME, "category": cat, "tags": tags, "agenda": [], "prep": None, "audience": [], "image_url": None, "cover_url": None,
                    "capacity": None, "price_cents": None, "currency": None, "url": None, "ticket_tiers": [], "source": "community", "status": "approved",
                    "submitted_by": f"demo-{PEOPLE[0][0]}", "submitted_by_name": PEOPLE[0][1], "created_at": now.isoformat()})
    return out


def build_resources(now: datetime | None = None) -> List[Dict[str, Any]]:
    stamp = (now or _now()).isoformat()
    return [{"id": f"demo-res-{i + 1}", "title": t, "url": url, "category": cat, "format": fmt, "description": desc, "tags": tags, "audience": [],
             "perk_value": None, "how_to_claim": None, "image_url": None, "cover_url": None, "source": "community", "type": fmt.lower(),
             "author": PEOPLE[0][1], "status": "approved", "submitted_by": f"demo-{PEOPLE[0][0]}", "submitted_by_name": PEOPLE[0][1], "created_at": stamp}
            for i, (t, cat, fmt, desc, url, tags) in enumerate(RESOURCES)]


def build_people(now: datetime | None = None) -> List[Dict[str, Any]]:
    stamp = (now or _now()).isoformat()
    out = []
    for key, name, mtype, title, company, bio, skills, goals, needs, sname, sline, sstage, ssector in PEOPLE:
        email = f"{key}@demo-hub.pathwai.example"
        out.append({"id": f"demo-{key}", "name": name, "email": email, "password_hash": None, "role": "admin" if key == "dana" else "member", "member_type": mtype,
                    "tagline": "", "bio": bio, "title": title, "company": company, "location": "Toronto", "avatar_url": "", "cover_url": "",
                    "expertise": list(skills), "skill_set": list(skills), "focus_areas": [], "open_to": [], "services_offered": [], "topics_can_advise_on": [],
                    "interests_hobbies": [], "goals": list(goals), "support_needs": list(needs), "needs_seeking": [], "custom_fields": {},
                    "contact": {"email": email}, "contact_visibility": "members", "hidden_from_directory": False, "signup_source": "demo", "sample": True,
                    "created_at": stamp, "updated_at": stamp, "membership_status": "approved",
                    "startup_name": sname, "startup_one_liner": sline, "startup_stage": sstage, "startup_sector": ssector})
    return out


async def ensure_demo_community() -> None:
    """Create the practice community if it is missing, and bring its sample content up to date. Safe to run on every start."""
    d = dbfor(SLUG)
    now = _now()
    cfg = build_config(now)
    existing = await d.community_config.find_one({"_key": "singleton"})
    cfg["created_at"] = (existing or {}).get("created_at") or now.isoformat()
    await d.community_config.replace_one({"_key": "singleton"}, cfg, upsert=True)
    for coll, docs in (("navigator_programs", build_programs(now)), ("events", build_events(now)), ("resources", build_resources(now)), ("users", build_people(now))):
        for doc in docs:
            keep = {k: v for k, v in doc.items() if k not in ("id", "created_at")}
            await d[coll].update_one({"id": doc["id"]}, {"$set": keep, "$setOnInsert": {"id": doc["id"], "created_at": doc.get("created_at")}}, upsert=True)
    if not await hub_db().communities.find_one({"slug": SLUG}):
        await hub_db().communities.insert_one({"slug": SLUG, "name": NAME, "category": "other", "owner_id": None, "created_at": now.isoformat(), "demo": True})
    register_community_slug(SLUG)
