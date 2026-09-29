"""Empty demo communities — no members, no events, just a name, a look and a country/interest tag.

The four fully-seeded communities (playr, grace, the-village, club-pto) show what a *lived-in*
community looks like. These exist to show the other half of the story: what it looks like when the
"Discover communities" browse page on the hub (routes/hub.py:hub_communities, Hub.jsx) has dozens of
communities in it instead of four — real Black-entrepreneurship and wellness/faith/social-club
communities across several countries, filterable by country and interest tag, with zero seeded
content so it's obvious at a glance which ones are "real" demo data and which are just placeholders
communicating scale.

Registered the same way a self-serve community is (`register_community_slug` + a row in
`hub_db().communities`) rather than added to database.py's static COMMUNITY_SLUGS list, so this
doubles as a real (if lightweight) exercise of that same at-scale path. Idempotent: skips any slug
already present in hub_db().communities, so it's safe to call on every startup.
"""
from __future__ import annotations

import copy
from datetime import datetime, timezone
from typing import Any, Dict, List

from database import dbfor, hub_db, register_community_slug

# (slug, name, tagline, kind, about, country, interest_tags, theme preset key)
EMPTY_COMMUNITIES: List[Dict[str, Any]] = [
    {"slug": "bea-atlanta", "name": "BEA Atlanta", "tagline": "Black Entrepreneurship Alliance — Atlanta chapter.",
     "kind": "Professional network", "about": "A gathering place for Black founders and operators building in Atlanta.",
     "country": "United States", "interest_tags": ["Entrepreneurship", "Professional Networking"], "theme": "playr-pro"},
    {"slug": "bea-london", "name": "BEA London", "tagline": "Black Entrepreneurship Alliance — London chapter.",
     "kind": "Professional network", "about": "Founders, investors and operators across London's Black business community.",
     "country": "United Kingdom", "interest_tags": ["Entrepreneurship", "Professional Networking"], "theme": "ocean"},
    {"slug": "bea-lagos", "name": "BEA Lagos", "tagline": "Black Entrepreneurship Alliance — Lagos chapter.",
     "kind": "Professional network", "about": "Connecting Lagos's startup and small-business founders with mentors and capital.",
     "country": "Nigeria", "interest_tags": ["Entrepreneurship", "Tech"], "theme": "sunset"},
    {"slug": "bea-johannesburg", "name": "BEA Johannesburg", "tagline": "Black Entrepreneurship Alliance — Johannesburg chapter.",
     "kind": "Professional network", "about": "A network for Johannesburg founders navigating growth and funding.",
     "country": "South Africa", "interest_tags": ["Entrepreneurship"], "theme": "forest"},
    {"slug": "accra-founders", "name": "Accra Founders Circle", "tagline": "Weekly meetups for early-stage founders in Accra.",
     "kind": "Founders circle", "about": "A small, hands-on circle of first-time founders trading notes on fundraising and hiring.",
     "country": "Ghana", "interest_tags": ["Entrepreneurship", "Tech"], "theme": "playr-pro"},
    {"slug": "sao-paulo-empreendedores", "name": "São Paulo Empreendedores", "tagline": "Rede de empreendedores em São Paulo.",
     "kind": "Founders circle", "about": "A founders' network for São Paulo's growing startup scene.",
     "country": "Brazil", "interest_tags": ["Entrepreneurship"], "theme": "sunset"},
    {"slug": "mumbai-founders-table", "name": "Mumbai Founders Table", "tagline": "Monthly dinners for Mumbai's startup founders.",
     "kind": "Founders circle", "about": "Founders comparing notes over dinner once a month, no pitches allowed.",
     "country": "India", "interest_tags": ["Entrepreneurship", "Tech"], "theme": "forest"},
    {"slug": "paris-noir-professionals", "name": "Paris Noir Professionals", "tagline": "Réseau professionnel pour la communauté noire de Paris.",
     "kind": "Professional network", "about": "A professional network connecting Black professionals across industries in Paris.",
     "country": "France", "interest_tags": ["Professional Networking"], "theme": "pathwai"},
    {"slug": "toronto-tech-collective", "name": "Toronto Tech Collective", "tagline": "Toronto's Black tech community, on and off Slack.",
     "kind": "Tech community", "about": "Engineers, designers and PMs in Toronto's tech scene meeting up and helping each other get hired.",
     "country": "Canada", "interest_tags": ["Tech", "Professional Networking"], "theme": "playr-modern-light"},
    {"slug": "tpl-nyc", "name": "TPL New York", "tagline": "Play. Connect. Grow. The Playr League, New York.",
     "kind": "Wellness & events", "about": "Networking nights and wellness events for New York members.",
     "country": "United States", "interest_tags": ["Wellness", "Sports"], "theme": "playr-modern"},
    {"slug": "tpl-la", "name": "TPL Los Angeles", "tagline": "Play. Connect. Grow. The Playr League, Los Angeles.",
     "kind": "Wellness & events", "about": "Networking nights and wellness events for Los Angeles members.",
     "country": "United States", "interest_tags": ["Wellness", "Sports"], "theme": "playr-cream"},
    {"slug": "houston-wellness-hub", "name": "Houston Wellness Hub", "tagline": "A wellness community for Houston professionals.",
     "kind": "Wellness & events", "about": "Fitness meetups, workshops and socials for Houston members.",
     "country": "United States", "interest_tags": ["Wellness"], "theme": "playr-cream"},
    {"slug": "riverside-run-club", "name": "Riverside Run Club", "tagline": "Weeknight runs along the river, all paces welcome.",
     "kind": "Run club", "about": "A casual running club with weeknight group runs and a Saturday long run.",
     "country": "Canada", "interest_tags": ["Sports", "Wellness"], "theme": "paper"},
    {"slug": "north-star-fellowship", "name": "North Star Fellowship", "tagline": "A small, welcoming congregation in the east end.",
     "kind": "Faith community", "about": "Sunday gatherings, small groups and community meals.",
     "country": "Canada", "interest_tags": ["Faith"], "theme": "forest"},
    {"slug": "harbor-parents", "name": "Harbor Parents Collective", "tagline": "A support network for parents raising kids in the city.",
     "kind": "Parent network", "about": "Playdates, swap meets and a help board for parents in the neighbourhood.",
     "country": "Canada", "interest_tags": ["Parenting"], "theme": "violet"},
    {"slug": "kingston-supper-club", "name": "Kingston Supper Club", "tagline": "Chef-led dinners around one long table in Kingston.",
     "kind": "Dinner club", "about": "An invite-only supper club with rotating guest chefs.",
     "country": "Jamaica", "interest_tags": ["Food & Dining"], "theme": "sunset"},
    {"slug": "cape-town-creatives", "name": "Cape Town Creatives Guild", "tagline": "A guild for Cape Town's designers, artists and makers.",
     "kind": "Creative guild", "about": "Studio visits, critique nights and a shared show once a year.",
     "country": "South Africa", "interest_tags": ["Arts & Culture"], "theme": "ocean"},
    {"slug": "melbourne-mixer", "name": "Melbourne Mixer", "tagline": "A social and professional mixer for Melbourne's creative industries.",
     "kind": "Social club", "about": "Monthly mixers bringing together Melbourne's creative and business communities.",
     "country": "Australia", "interest_tags": ["Professional Networking", "Arts & Culture"], "theme": "violet"},
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def ensure_empty_demo_communities() -> None:
    from routes.community_config import DEFAULT_CONFIG, THEME_PRESETS

    presets = {p["preset"]: p for p in THEME_PRESETS}
    now = _now()
    for spec in EMPTY_COMMUNITIES:
        slug = spec["slug"]
        if await hub_db().communities.find_one({"slug": slug}):
            register_community_slug(slug)  # COMMUNITY_SLUGS is in-process state; re-registering is a cheap no-op
            continue
        theme = presets.get(spec["theme"], THEME_PRESETS[0])
        cfg = copy.deepcopy(DEFAULT_CONFIG)
        cfg.update(
            community_name=spec["name"], tagline=spec["tagline"], community_kind=spec["kind"], about=spec["about"],
            country=spec["country"], interest_tags=list(spec["interest_tags"]),
            theme={"preset": theme["preset"], "accent": theme["accent"]}, require_approval=True,
            _key="singleton", created_at=now, updated_at=now,
        )
        brand = dict(cfg["brand"])
        brand.update(
            preset=theme["preset"], mode=theme["mode"], colors=dict(theme["colors"]),
            font=theme.get("font", brand["font"]), heading_font=theme.get("heading_font", brand["heading_font"]),
            heading_style=theme.get("heading_style", brand["heading_style"]), radius=theme.get("radius", brand["radius"]),
            button_shape=theme.get("button_shape", brand["button_shape"]),
            login_headline=f"Welcome to {spec['name']}.", login_subhead="Sign in to find events and people.",
            welcome_message=f"Welcome to {spec['name']}.", footer_text=spec["name"], support_email="",
        )
        cfg["brand"] = brand
        await dbfor(slug).community_config.insert_one(cfg)
        register_community_slug(slug)
        await hub_db().communities.insert_one({"slug": slug, "name": spec["name"], "category": "other", "owner_id": None, "created_at": now, "seed": True})
