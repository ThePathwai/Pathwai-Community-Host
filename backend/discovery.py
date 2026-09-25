"""
Layer 2 — Innovation Discovery.

Unified public search across three surfaces:
  - Programs (denormalized from organizations[*].programs, joined w/ org meta)
  - Grants (reuses the existing `resources` collection where source=grants)
  - Mentors (a NEW opt-in public `mentors` collection, distinct from the private
    community-member data inside Layer 3 spaces — per user constraint that community
    members inside innovation spaces are NOT public.)

Everything here is PUBLIC (no auth required).
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase


# ---------- Mentors: PUBLIC opt-in directory ----------

def _mentor(slug: str, name: str, title: str, org_slug: Optional[str], region: str,
            expertise: List[str], focus_areas: List[str], stages: List[str],
            bio: str, linkedin: Optional[str] = None, avatar_url: Optional[str] = None,
            accepting_intros: bool = True, offered_via: Optional[str] = None) -> Dict[str, Any]:
    return {
        "slug": slug, "name": name, "title": title, "org_slug": org_slug,
        "region": region, "expertise": expertise, "focus_areas": focus_areas,
        "stages": stages, "bio": bio, "linkedin": linkedin, "avatar_url": avatar_url,
        "accepting_intros": accepting_intros,
        "offered_via": offered_via,  # e.g. "MaRS Mentor Network"
        "created_at": datetime.now(timezone.utc),
    }


def build_mentors_seed() -> List[Dict[str, Any]]:
    """~18 realistic (fictional) Canadian ecosystem mentors, spread across regions/expertise."""
    return [
        _mentor("amara-chen", "Amara Chen", "Growth advisor · fmr. VP Product, Shopify",
                "mars-discovery-district", "Ontario",
                ["Growth", "PMF", "B2B SaaS", "Product-led growth"],
                ["Enterprise SaaS", "Consumer"], ["seed", "series_a"],
                "12 yrs scaling B2B products from 0→$50M ARR. Advises 4-6 founders/quarter through MaRS mentor network.",
                offered_via="MaRS Mentor Network"),
        _mentor("liam-okonkwo", "Liam Okonkwo", "GP · early-stage climate",
                "bdc-capital", "Quebec",
                ["Fundraising", "CleanTech capital stack", "Grant + venture blending"],
                ["CleanTech", "ClimateTech", "Energy"], ["pre_seed", "seed"],
                "Ex-founder (acquired 2021). Now investing in Canadian climate tech, obsessed with SDTC-to-VC bridges.",
                offered_via="BDC Capital"),
        _mentor("priya-sharma", "Priya Sharma", "Chief Scientist · applied ML",
                "vector-institute", "Ontario",
                ["Applied ML", "Foundation models", "AI safety", "Research-to-product"],
                ["AI/ML", "Enterprise SaaS"], ["pre_seed", "seed"],
                "Vector Institute faculty. Helps ML-first founders translate research into shippable product.",
                offered_via="Vector Institute"),
        _mentor("jean-luc-tremblay", "Jean-Luc Tremblay", "Founder-in-residence",
                "cdl", "Quebec",
                ["Deep tech commercialization", "Board building", "Series A prep"],
                ["Quantum", "Robotics", "Deep Tech"], ["seed", "series_a"],
                "Third-time founder. Two exits ($120M + $340M). Sits on 4 boards, mentors CDL Quantum stream.",
                offered_via="Creative Destruction Lab"),
        _mentor("sarah-macdonald", "Sarah MacDonald", "Ocean tech operator",
                "volta", "Nova Scotia",
                ["Hardware ops", "Ocean/marine", "Federal grants (Ocean Supercluster)"],
                ["OceanTech", "Sustainability"], ["seed"],
                "Halifax-based hardware operator. Deep expertise in Ocean Supercluster funding + Atlantic ecosystems.",
                offered_via="Volta"),
        _mentor("darren-blackfoot", "Darren Blackfoot", "Indigenous innovation catalyst",
                None, "Alberta",
                ["Indigenous business", "Community-first fundraising", "Rural + remote"],
                ["Social Impact", "Consumer"], ["pre_seed"],
                "Blackfoot Nation. Runs an Indigenous founders program supporting community-led ventures across the Prairies.",
                offered_via="Indigenous Entrepreneurs Network"),
        _mentor("mei-lin-wu", "Mei-Lin Wu", "Chief medical officer · digital health",
                "mars-discovery-district", "Ontario",
                ["Regulatory (Health Canada, FDA)", "Clinical validation", "Payer strategy"],
                ["HealthTech", "MedTech"], ["seed", "series_a"],
                "MD + former MaRS EIR. Helps healthtech founders navigate regulation without stalling.",
                offered_via="MaRS Mentor Network"),
        _mentor("kwame-osei", "Kwame Osei", "Ex-founder · fintech + payments",
                "communitech", "Ontario",
                ["Fintech regulation", "Payments infrastructure", "Compliance"],
                ["FinTech", "Enterprise SaaS"], ["pre_seed", "seed"],
                "Sold his payments startup to a Big-5 bank. Now advises Waterloo-region fintech founders.",
                offered_via="Communitech"),
        _mentor("olivia-riel", "Olivia Riel", "Product design leader",
                "dmz", "Ontario",
                ["Design systems", "Consumer UX", "0-to-1 product"],
                ["Consumer", "Enterprise SaaS"], ["pre_seed", "seed"],
                "Fmr. Head of Design at three Canadian unicorns. Runs monthly office hours through DMZ.",
                offered_via="DMZ"),
        _mentor("ravi-patel", "Ravi Patel", "Enterprise sales coach",
                "invest-ottawa", "Ontario",
                ["Enterprise sales", "GTM", "First 10 customers"],
                ["Enterprise SaaS", "Cybersecurity"], ["seed", "series_a"],
                "Coaches early founders on complex enterprise sales cycles. Ex-VP Sales at two acquired startups.",
                offered_via="Invest Ottawa"),
        _mentor("emma-thompson", "Emma Thompson", "AgriTech operator",
                "platform-calgary", "Alberta",
                ["AgriTech", "Supply chain", "Prairie rural go-to-market"],
                ["AgriTech", "CleanTech"], ["pre_seed", "seed"],
                "Grew up on a Prairie farm, now leads AgriTech advisory across Alberta and Saskatchewan.",
                offered_via="Platform Calgary"),
        _mentor("noah-bergeron", "Noah Bergeron", "GTM · consumer apps",
                "mila", "Quebec",
                ["Consumer growth loops", "Freemium", "Localization"],
                ["Consumer", "AI/ML"], ["pre_seed", "seed"],
                "Bilingual GTM operator. Deep Quebec-market playbook. Runs Mila's consumer product mentor track.",
                offered_via="Mila"),
        _mentor("sana-al-hassan", "Sana Al-Hassan", "Impact & inclusion",
                None, "British Columbia",
                ["Impact metrics", "Diverse founder support", "Grant writing"],
                ["Social Impact", "HealthTech"], ["pre_seed"],
                "Vancouver-based. Helps underrepresented founders get their first non-dilutive dollars.",
                offered_via="Foresight (Impact stream)"),
        _mentor("marcus-lefebvre", "Marcus Lefebvre", "Founder ops · finance",
                None, "Quebec",
                ["Cap tables", "SAFE→priced", "Founder finances", "Down-round survival"],
                ["Enterprise SaaS", "FinTech"], ["seed", "series_a"],
                "CFO-for-hire. Cleaned up 20+ Canadian cap tables. Straight-talker about dilution.",
                offered_via=None),
        _mentor("jordan-tan", "Jordan Tan", "Cybersecurity go-to-market",
                "rogers-cybersecure-catalyst", "Ontario",
                ["Cyber GTM", "Federal buyers", "SOC 2 / ISO 27001"],
                ["Cybersecurity", "Enterprise SaaS"], ["seed", "series_a"],
                "10 yrs GTM at cyber startups; expert on selling to Canadian federal + provincial buyers.",
                offered_via="Rogers Cybersecure Catalyst"),
        _mentor("hannah-nguyen", "Hannah Nguyen", "Community-led growth",
                "next-canada", "Ontario",
                ["Community", "Content", "Founder-led sales"],
                ["Consumer", "Enterprise SaaS"], ["pre_seed", "seed"],
                "Built two 50K+ founder communities from scratch. NEXT Canada alum, now a mentor there.",
                offered_via="NEXT Canada"),
        _mentor("david-macleod", "David MacLeod", "Space tech advisor",
                None, "Newfoundland and Labrador",
                ["Space", "Aerospace", "Government contracts", "Federal RFP"],
                ["SpaceTech", "Aerospace"], ["seed", "series_a"],
                "St. John's-based. Runs space-tech mentorship for Atlantic founders. Ex-CSA program lead.",
                offered_via=None),
        _mentor("aisha-mohamed", "Aisha Mohamed", "Bio-manufacturing operator",
                "sdtc", "Ontario",
                ["Bio-manufacturing", "Scale-up capital", "SDTC applications"],
                ["BioTech", "CleanTech"], ["seed", "series_a"],
                "Helped 6 bio-manufacturing startups raise SDTC + strategic capital past $10M.",
                offered_via="Sustainable Development Technology Canada"),
    ]


async def ensure_mentor_indexes(db: AsyncIOMotorDatabase) -> None:
    await db.mentors.create_index("slug", unique=True)
    await db.mentors.create_index("region")
    await db.mentors.create_index("focus_areas")
    await db.mentors.create_index("expertise")


def _strip_id(doc: Dict[str, Any]) -> Dict[str, Any]:
    if not doc:
        return doc
    doc = {**doc}
    doc.pop("_id", None)
    return doc


# ---------- Unified discover ----------

def _rx(q: str) -> re.Pattern:
    return re.compile(re.escape(q), re.IGNORECASE)


async def list_mentors(
    db: AsyncIOMotorDatabase, *,
    q: Optional[str] = None,
    region: Optional[str] = None,
    focus_area: Optional[str] = None,
    stage: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {}
    if region and region != "all":
        query["region"] = region
    if focus_area and focus_area != "all":
        query["focus_areas"] = focus_area
    if stage and stage != "all":
        query["stages"] = stage
    if q:
        rx = _rx(q)
        query["$or"] = [
            {"name": rx}, {"title": rx}, {"bio": rx},
            {"expertise": rx}, {"focus_areas": rx},
        ]
    cursor = db.mentors.find(query).limit(limit)
    return [_strip_id(d) async for d in cursor]


async def list_programs(
    db: AsyncIOMotorDatabase, *,
    q: Optional[str] = None,
    region: Optional[str] = None,
    focus_area: Optional[str] = None,
    stage: Optional[str] = None,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    """Flatten organizations[*].programs and enrich with org metadata."""
    query: Dict[str, Any] = {}
    if region and region != "all":
        query["region"] = region
    if focus_area and focus_area != "all":
        query["focus_areas"] = focus_area

    out: List[Dict[str, Any]] = []
    rx = _rx(q) if q else None
    async for org in db.organizations.find(query):
        programs = org.get("programs") or []
        for p in programs:
            if stage and stage != "all" and p.get("stage") != stage:
                continue
            if rx and not (
                rx.search(p.get("name") or "")
                or rx.search(p.get("description") or "")
                or rx.search(org.get("name") or "")
                or any(rx.search(f or "") for f in (org.get("focus_areas") or []))
                or any(rx.search(t or "") for t in (org.get("tags") or []))
            ):
                continue
            out.append({
                "kind": "program",
                "id": f"{org['slug']}::{p.get('name','')}",
                "name": p.get("name"),
                "description": p.get("description"),
                "cta_url": p.get("cta_url"),
                "stage": p.get("stage"),
                "duration": p.get("duration"),
                "intake_status": p.get("intake_status"),
                "org_slug": org.get("slug"),
                "org_name": org.get("name"),
                "org_type": org.get("type"),
                "region": org.get("region"),
                "focus_areas": org.get("focus_areas") or [],
                "accent_color": org.get("accent_color") or "#0A0A0A",
            })
            if len(out) >= limit:
                return out
    return out


async def list_grants(
    db: AsyncIOMotorDatabase, *,
    q: Optional[str] = None,
    region: Optional[str] = None,
    focus_area: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """Grants from the resources collection where type=grant or source=grants."""
    query: Dict[str, Any] = {"$or": [{"type": "grant"}, {"source": "grants"}]}
    if q:
        rx = _rx(q)
        query["$and"] = [
            {"$or": [
                {"title": rx}, {"description": rx},
                {"tags": rx}, {"author": rx},
            ]}
        ]
    # region/focus_area currently not filter-mapped on resources; treated as pass-through
    cursor = db.resources.find(query).sort("published_at", -1).limit(limit)
    grants = []
    async for r in cursor:
        r = _strip_id(r)
        grants.append({
            "kind": "grant",
            "id": r.get("id"),
            "name": r.get("title"),
            "description": r.get("description"),
            "cta_url": r.get("url"),
            "amount": r.get("grant_amount"),
            "deadline": r.get("grant_deadline"),
            "deadline_label": r.get("grant_deadline_label"),
            "eligibility": r.get("grant_eligibility") or [],
            "author": r.get("author"),
            "tags": r.get("tags") or [],
            "cover_url": r.get("cover_url"),
        })
    # crude filter by focus/region via tags (best-effort)
    if focus_area and focus_area != "all":
        needle = focus_area.lower()
        grants = [g for g in grants if any(needle in (t or "").lower() for t in g.get("tags", []))]
    return grants


async def unified_discover(
    db: AsyncIOMotorDatabase, *,
    q: Optional[str] = None,
    kind: str = "all",
    region: Optional[str] = None,
    focus_area: Optional[str] = None,
    stage: Optional[str] = None,
    limit: int = 60,
) -> Dict[str, Any]:
    programs = grants = mentors = []
    if kind in ("all", "program"):
        programs = await list_programs(db, q=q, region=region, focus_area=focus_area, stage=stage, limit=limit)
    if kind in ("all", "grant"):
        grants = await list_grants(db, q=q, region=region, focus_area=focus_area, limit=limit)
    if kind in ("all", "mentor"):
        mentors = await list_mentors(db, q=q, region=region, focus_area=focus_area, stage=stage, limit=limit)
    return {
        "programs": programs,
        "grants": grants,
        "mentors": mentors,
        "counts": {
            "programs": len(programs),
            "grants": len(grants),
            "mentors": len(mentors),
            "total": len(programs) + len(grants) + len(mentors),
        },
    }
