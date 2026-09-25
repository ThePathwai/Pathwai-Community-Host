"""Pathwai — Layer 1: National Innovation Directory.

Models + async helpers + seed data for Canada's innovation ecosystem organizations
(incubators, VCs, accelerators, universities, government programs, non-profits, ...).

The directory is public (no auth required for reads). Writes require admin.
"""
from __future__ import annotations
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---------- taxonomy ----------
ORG_TYPES: List[Dict[str, str]] = [
    {"value": "incubator", "label": "Incubator"},
    {"value": "accelerator", "label": "Accelerator"},
    {"value": "vc", "label": "Venture Capital"},
    {"value": "angel_group", "label": "Angel Group"},
    {"value": "university", "label": "University Program"},
    {"value": "government", "label": "Government Program"},
    {"value": "nonprofit", "label": "Non-profit / Community"},
    {"value": "corporate", "label": "Corporate Innovation"},
    {"value": "coworking", "label": "Coworking / Hub"},
]

REGIONS: List[str] = [
    "British Columbia", "Alberta", "Saskatchewan", "Manitoba",
    "Ontario", "Quebec", "New Brunswick", "Nova Scotia",
    "Prince Edward Island", "Newfoundland and Labrador",
    "Yukon", "Northwest Territories", "Nunavut", "National",
]

STAGES: List[Dict[str, str]] = [
    {"value": "idea", "label": "Idea"},
    {"value": "pre_seed", "label": "Pre-seed"},
    {"value": "seed", "label": "Seed"},
    {"value": "series_a", "label": "Series A"},
    {"value": "series_b_plus", "label": "Series B+"},
    {"value": "growth", "label": "Growth"},
    {"value": "all_stages", "label": "All stages"},
]


# ---------- models ----------
class ProgramQuestion(BaseModel):
    key: str  # short slug used to key the answers dict
    label: str  # display label
    type: str = "text"  # text | textarea | select | url
    required: bool = False
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    options: Optional[List[str]] = None  # for type=select
    max_length: Optional[int] = None


class OrganizationProgram(BaseModel):
    id: Optional[str] = None  # stable slug — derived from name if omitted
    name: str
    description: Optional[str] = None
    cta_url: Optional[str] = None
    duration: Optional[str] = None  # "12 weeks", "Rolling", ...
    stage: Optional[str] = None
    intake_status: Optional[str] = None  # "Open", "Closed", "Cohort 12 (Fall 2026)"
    extra_questions: List[ProgramQuestion] = Field(default_factory=list)


def program_id_for(program: Dict[str, Any]) -> str:
    """Stable, url-safe id for a program. Uses `id` if present, else slugified name."""
    return (program.get("id") or slugify(program.get("name") or "program")).lower()


def find_program(org: Dict[str, Any], program_id: str) -> Optional[Dict[str, Any]]:
    """Find a program in an org's programs[] by id (or slugified name fallback)."""
    for p in org.get("programs") or []:
        if program_id_for(p) == program_id.lower():
            return p
    return None


class OrganizationContact(BaseModel):
    email: Optional[str] = None
    website: Optional[str] = None
    twitter: Optional[str] = None
    linkedin: Optional[str] = None


class Organization(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    slug: str  # url-safe unique identifier
    name: str
    type: str  # one of ORG_TYPES
    tagline: str
    overview: str
    logo_url: Optional[str] = None
    cover_url: Optional[str] = None
    accent_color: Optional[str] = None  # hex, drives profile hero
    headquarters: Optional[str] = None  # "Toronto, ON"
    region: str = "National"
    founded_year: Optional[int] = None
    focus_areas: List[str] = Field(default_factory=list)  # ["AI/ML", "CleanTech", ...]
    stages: List[str] = Field(default_factory=list)  # stage values
    community_size: Optional[int] = None  # founders / alumni / members served
    portfolio_size: Optional[int] = None  # for VCs / accelerators
    verified: bool = False
    programs: List[OrganizationProgram] = Field(default_factory=list)
    key_people: List[Dict[str, Any]] = Field(default_factory=list)  # {name,title,avatar_url,linkedin}
    notable_alumni: List[Dict[str, Any]] = Field(default_factory=list)  # {name,venture,exit}
    partners: List[str] = Field(default_factory=list)
    contact: OrganizationContact = Field(default_factory=OrganizationContact)
    tags: List[str] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    tagline: Optional[str] = None
    overview: Optional[str] = None
    logo_url: Optional[str] = None
    cover_url: Optional[str] = None
    accent_color: Optional[str] = None
    headquarters: Optional[str] = None
    region: Optional[str] = None
    founded_year: Optional[int] = None
    focus_areas: Optional[List[str]] = None
    stages: Optional[List[str]] = None
    community_size: Optional[int] = None
    portfolio_size: Optional[int] = None
    verified: Optional[bool] = None
    programs: Optional[List[OrganizationProgram]] = None
    key_people: Optional[List[Dict[str, Any]]] = None
    notable_alumni: Optional[List[Dict[str, Any]]] = None
    partners: Optional[List[str]] = None
    contact: Optional[OrganizationContact] = None
    tags: Optional[List[str]] = None


# ---------- helpers ----------
def slugify(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", name.lower()).strip("-")
    return re.sub(r"-+", "-", s)


def strip_org(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc


async def ensure_indexes(db) -> None:
    await db.organizations.create_index("slug", unique=True)
    await db.organizations.create_index("type")
    await db.organizations.create_index("region")
    await db.organizations.create_index("focus_areas")


async def list_organizations(
    db,
    q: Optional[str] = None,
    type_: Optional[str] = None,
    region: Optional[str] = None,
    stage: Optional[str] = None,
    focus_area: Optional[str] = None,
    verified_only: bool = False,
    limit: int = 60,
) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {}
    if type_ and type_ != "all":
        query["type"] = type_
    if region and region != "all":
        query["region"] = region
    if stage and stage != "all":
        query["stages"] = stage
    if focus_area and focus_area != "all":
        query["focus_areas"] = focus_area
    if verified_only:
        query["verified"] = True
    if q:
        rx = {"$regex": q, "$options": "i"}
        query["$or"] = [
            {"name": rx}, {"tagline": rx}, {"overview": rx},
            {"focus_areas": rx}, {"tags": rx}, {"headquarters": rx},
        ]
    cursor = db.organizations.find(query).sort([("verified", -1), ("name", 1)]).limit(limit)
    return [strip_org(d) async for d in cursor]


async def get_organization(db, slug: str) -> Optional[Dict[str, Any]]:
    return strip_org(await db.organizations.find_one({"slug": slug}))


async def update_organization(db, slug: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    patch = {k: v for k, v in patch.items() if v is not None}
    if not patch:
        return await get_organization(db, slug)
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.organizations.update_one({"slug": slug}, {"$set": patch})
    return await get_organization(db, slug)


async def organization_filters(db) -> Dict[str, List[Any]]:
    types = await db.organizations.distinct("type")
    regions = await db.organizations.distinct("region")
    fa_pipeline = [{"$unwind": "$focus_areas"}, {"$group": {"_id": "$focus_areas"}}]
    focus_areas = [d["_id"] async for d in db.organizations.aggregate(fa_pipeline)]
    stage_pipeline = [{"$unwind": "$stages"}, {"$group": {"_id": "$stages"}}]
    stages_seen = [d["_id"] async for d in db.organizations.aggregate(stage_pipeline)]
    return {
        "types": [t for t in ORG_TYPES if t["value"] in types] or ORG_TYPES,
        "regions": sorted([r for r in regions if r]) or REGIONS,
        "focus_areas": sorted([f for f in focus_areas if f]),
        "stages": [s for s in STAGES if s["value"] in stages_seen] or STAGES,
    }


# ---------- seed ----------
def _org(**kwargs) -> Dict[str, Any]:
    """Build a full org doc from partial kwargs, filling defaults."""
    kwargs.setdefault("id", str(uuid.uuid4()))
    kwargs["slug"] = kwargs.get("slug") or slugify(kwargs["name"])
    kwargs.setdefault("verified", True)
    kwargs.setdefault("focus_areas", [])
    kwargs.setdefault("stages", ["all_stages"])
    kwargs.setdefault("programs", [])
    kwargs.setdefault("key_people", [])
    kwargs.setdefault("notable_alumni", [])
    kwargs.setdefault("partners", [])
    kwargs.setdefault("tags", [])
    kwargs.setdefault("contact", {})
    kwargs.setdefault("created_at", datetime.now(timezone.utc).isoformat())
    kwargs.setdefault("updated_at", datetime.now(timezone.utc).isoformat())
    return kwargs


def build_organizations_seed() -> List[Dict[str, Any]]:
    return [
        _org(
            name="MaRS Discovery District",
            type="incubator",
            tagline="North America's largest urban innovation hub.",
            overview="MaRS supports Canadian entrepreneurs building high-impact ventures in cleantech, health, fintech and enterprise. Advisory, capital, talent and market access under one roof.",
            headquarters="Toronto, ON",
            region="Ontario",
            founded_year=2000,
            focus_areas=["CleanTech", "Health", "FinTech", "Enterprise SaaS"],
            stages=["pre_seed", "seed", "series_a", "growth"],
            community_size=1400, portfolio_size=1400,
            accent_color="#D93B3B",
            logo_url="https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=200&h=200&fit=crop",
            cover_url="https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=1200&h=400&fit=crop",
            programs=[
                {"name": "Growth Program", "description": "Advisory + capital access for scaling ventures.", "cta_url": "https://marsdd.com", "stage": "growth", "intake_status": "Rolling"},
                {"name": "Momentum", "description": "Founder-led sales acceleration for B2B software.", "duration": "12 weeks", "stage": "series_a", "intake_status": "Cohort 08 · Winter 2026"},
            ],
            key_people=[{"name": "Alison Nankivell", "title": "President & CEO"}],
            partners=["BDC", "Ontario Government", "RBC Ventures"],
            contact={"website": "https://marsdd.com", "linkedin": "https://linkedin.com/company/mars-discovery-district"},
            tags=["ecosystem-anchor", "toronto"],
        ),
        _org(
            name="Communitech",
            type="incubator",
            tagline="Helping tech founders start, grow and succeed.",
            overview="Waterloo Region's tech accelerator, running peer networks, capital connections, talent pipelines and executive coaching for 1,200+ member companies.",
            headquarters="Kitchener, ON",
            region="Ontario",
            founded_year=1997,
            focus_areas=["Enterprise SaaS", "AI/ML", "Manufacturing Tech", "Digital Media"],
            stages=["seed", "series_a", "series_b_plus"],
            community_size=1200, portfolio_size=1200,
            accent_color="#0066CC",
            cover_url="https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&h=400&fit=crop",
            programs=[
                {"name": "Team True North", "description": "Peer group for CEOs of $10M+ revenue companies.", "stage": "growth", "intake_status": "By invitation"},
                {"name": "Fierce Founders", "description": "Bootcamp for women+ founders across Canada.", "duration": "12 weeks", "stage": "pre_seed", "intake_status": "Applications open"},
            ],
            partners=["BDC", "OCE", "Government of Canada"],
            contact={"website": "https://communitech.ca"},
            tags=["waterloo-region", "ecosystem-anchor"],
        ),
        _org(
            name="DMZ",
            type="accelerator",
            tagline="The world's leading university-based tech incubator.",
            overview="DMZ at Toronto Metropolitan University supports early-stage tech founders with mentorship, capital access, and workspace in downtown Toronto.",
            headquarters="Toronto, ON",
            region="Ontario",
            founded_year=2010,
            focus_areas=["FinTech", "HealthTech", "AI/ML", "Web3"],
            stages=["idea", "pre_seed", "seed"],
            community_size=520,
            accent_color="#F5A623",
            cover_url="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1200&h=400&fit=crop",
            programs=[
                {"name": "Incubator", "description": "6-month program with $10K in-kind + investor intros.", "duration": "6 months", "stage": "pre_seed", "intake_status": "Cohort · Spring 2026 open"},
                {"name": "Basecamp", "description": "10-week pre-incubator for validating your idea.", "duration": "10 weeks", "stage": "idea", "intake_status": "Rolling"},
            ],
            contact={"website": "https://dmz.torontomu.ca"},
            tags=["university-linked", "toronto"],
        ),
        _org(
            name="Creative Destruction Lab",
            type="accelerator",
            tagline="Objectives-based seed-stage program for science-based ventures.",
            overview="CDL runs a structured 9-month program pairing scientific ventures with world-class mentors across AI, health, quantum, space, energy and more.",
            headquarters="Toronto, ON",
            region="National",
            founded_year=2012,
            focus_areas=["AI/ML", "Quantum", "Space", "HealthTech", "Energy"],
            stages=["pre_seed", "seed"],
            community_size=2200, portfolio_size=2200,
            accent_color="#0A0A0A",
            cover_url="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&h=400&fit=crop",
            programs=[
                {"name": "CDL Program", "description": "9-month objectives-based mentorship for deep-tech ventures.", "duration": "9 months", "stage": "seed", "intake_status": "Applications close June"},
            ],
            key_people=[{"name": "Ajay Agrawal", "title": "Founder"}],
            partners=["Rotman School of Management", "University of Toronto"],
            contact={"website": "https://creativedestructionlab.com"},
            tags=["deep-tech", "science-based"],
        ),
        _org(
            name="BDC Capital",
            type="vc",
            tagline="Canada's investment bank for entrepreneurs.",
            overview="Business Development Bank of Canada's investment arm — deploying $3B+ across venture, growth equity, and specialized funds for cleantech, women in tech, and deep tech.",
            headquarters="Montreal, QC",
            region="National",
            founded_year=1975,
            focus_areas=["CleanTech", "DeepTech", "Women-led", "Industrial"],
            stages=["seed", "series_a", "series_b_plus", "growth"],
            portfolio_size=800, community_size=800,
            accent_color="#003C71",
            cover_url="https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=1200&h=400&fit=crop",
            programs=[
                {"name": "Deep Tech Fund", "description": "$200M fund investing in Canadian deep-tech companies.", "stage": "series_a"},
                {"name": "Thrive Platform for Women", "description": "$500M platform backing women-led ventures.", "stage": "seed"},
            ],
            contact={"website": "https://bdc.ca/en/bdc-capital"},
            tags=["gov-backed", "national"],
        ),
        _org(
            name="Real Ventures",
            type="vc",
            tagline="Backing bold Canadian founders at the earliest stages.",
            overview="Montreal-based seed fund with 200+ investments across SaaS, AI, and consumer. Home of FounderFuel accelerator.",
            headquarters="Montreal, QC",
            region="Quebec",
            founded_year=2007,
            focus_areas=["AI/ML", "Enterprise SaaS", "Consumer", "Web3"],
            stages=["pre_seed", "seed"],
            portfolio_size=210,
            accent_color="#FF3366",
            cover_url="https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200&h=400&fit=crop",
            notable_alumni=[
                {"name": "Element AI", "venture": "Acquired by ServiceNow"},
                {"name": "Frank & Oak", "venture": "Consumer brand"},
            ],
            contact={"website": "https://realventures.com"},
            tags=["seed-stage", "montreal"],
        ),
        _org(
            name="Golden Ventures",
            type="vc",
            tagline="Seed-stage venture capital for the ambitious.",
            overview="A Toronto-based seed fund partnering with technical founders building infrastructure, developer tools, and consumer platforms across North America.",
            headquarters="Toronto, ON",
            region="Ontario",
            founded_year=2011,
            focus_areas=["Developer Tools", "Infrastructure", "Consumer", "AI/ML"],
            stages=["pre_seed", "seed"],
            portfolio_size=140,
            accent_color="#EFB410",
            cover_url="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&h=400&fit=crop",
            notable_alumni=[
                {"name": "Wattpad", "venture": "Acquired by Naver"},
                {"name": "Wave", "venture": "Acquired by H&R Block"},
                {"name": "Top Hat", "venture": "EdTech"},
            ],
            contact={"website": "https://golden.ventures"},
            tags=["seed-stage", "toronto"],
        ),
        _org(
            name="Inovia Capital",
            type="vc",
            tagline="Partnering with visionary founders shaping the future.",
            overview="One of Canada's largest venture funds, deploying seed to growth capital across North America and Europe. $1.7B+ under management.",
            headquarters="Montreal, QC",
            region="Quebec",
            founded_year=2007,
            focus_areas=["Enterprise SaaS", "AI/ML", "FinTech", "Marketplaces"],
            stages=["seed", "series_a", "series_b_plus", "growth"],
            portfolio_size=90,
            accent_color="#7B2CBF",
            cover_url="https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1200&h=400&fit=crop",
            notable_alumni=[
                {"name": "Lightspeed", "venture": "IPO NYSE:LSPD"},
                {"name": "AppDirect", "venture": "Unicorn"},
                {"name": "Sonder", "venture": "IPO"},
            ],
            contact={"website": "https://inovia.vc"},
            tags=["growth-stage", "large-fund"],
        ),
        _org(
            name="University of Toronto Entrepreneurship",
            type="university",
            tagline="Canada's #1 university entrepreneurship ecosystem.",
            overview="U of T Entrepreneurship connects a network of 12 accelerators supporting 1,200+ ventures from ideation through Series A across every campus and department.",
            headquarters="Toronto, ON",
            region="Ontario",
            founded_year=2011,
            focus_areas=["DeepTech", "HealthTech", "AI/ML", "CleanTech", "Social Impact"],
            stages=["idea", "pre_seed", "seed"],
            community_size=1200,
            accent_color="#1E3765",
            cover_url="https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1200&h=400&fit=crop",
            programs=[
                {"name": "The Entrepreneurship Hatchery", "description": "Engineering-led ideation to launch program.", "duration": "6 months", "stage": "idea"},
                {"name": "H2i (Health Innovation Hub)", "description": "Health-focused venture accelerator.", "duration": "12 months", "stage": "pre_seed"},
                {"name": "Creative Destruction Lab (Toronto)", "description": "See CDL profile.", "stage": "seed"},
            ],
            partners=["Rotman", "Faculty of Applied Science & Engineering", "Temerty Faculty of Medicine"],
            contact={"website": "https://entrepreneurs.utoronto.ca"},
            tags=["university-linked", "flagship"],
        ),
        _org(
            name="Velocity (University of Waterloo)",
            type="university",
            tagline="Canada's most productive startup incubator.",
            overview="Velocity at the University of Waterloo has produced 400+ ventures worth $30B+ combined, including Kik, Vidyard, ApplyBoard and Faire.",
            headquarters="Waterloo, ON",
            region="Ontario",
            founded_year=2008,
            focus_areas=["Hardware", "Enterprise SaaS", "AI/ML", "HealthTech"],
            stages=["idea", "pre_seed"],
            community_size=400,
            accent_color="#FFD100",
            cover_url="https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1200&h=400&fit=crop",
            notable_alumni=[
                {"name": "Faire", "venture": "Unicorn wholesale marketplace"},
                {"name": "ApplyBoard", "venture": "EdTech unicorn"},
                {"name": "Vidyard", "venture": "Video-for-business"},
            ],
            contact={"website": "https://velocityincubator.com"},
            tags=["university-linked", "waterloo"],
        ),
        _org(
            name="entrepreneurship@UBC",
            type="university",
            tagline="Turning research into ventures on Canada's Pacific coast.",
            overview="UBC's entrepreneurship arm supports faculty, students and alumni with pre-accelerator, accelerator and venture creation programs.",
            headquarters="Vancouver, BC",
            region="British Columbia",
            founded_year=2013,
            focus_areas=["CleanTech", "LifeSciences", "AI/ML", "DeepTech"],
            stages=["idea", "pre_seed", "seed"],
            community_size=350,
            accent_color="#002145",
            cover_url="https://images.unsplash.com/photo-1500673922987-e212871fec22?w=1200&h=400&fit=crop",
            programs=[
                {"name": "Lab2Launch", "description": "For faculty/researcher-founders commercializing IP.", "stage": "pre_seed"},
                {"name": "HATCH", "description": "Pre-accelerator for validating early ideas.", "stage": "idea"},
            ],
            contact={"website": "https://entrepreneurship.ubc.ca"},
            tags=["university-linked", "west-coast"],
        ),
        _org(
            name="Volta",
            type="incubator",
            tagline="Atlantic Canada's home for high-growth tech companies.",
            overview="Halifax-based innovation hub serving Atlantic Canada with programming, capital access, and community across Nova Scotia, New Brunswick, PEI and Newfoundland.",
            headquarters="Halifax, NS",
            region="Nova Scotia",
            founded_year=2013,
            focus_areas=["Ocean Tech", "Enterprise SaaS", "CleanTech"],
            stages=["pre_seed", "seed", "series_a"],
            community_size=180,
            accent_color="#FF6633",
            cover_url="https://images.unsplash.com/photo-1519452575417-564c1401ecc0?w=1200&h=400&fit=crop",
            programs=[
                {"name": "Volta Cohort", "description": "$25K + advisory for Atlantic startups.", "stage": "pre_seed", "intake_status": "Twice yearly"},
            ],
            contact={"website": "https://voltaeffect.com"},
            tags=["atlantic-canada", "regional-anchor"],
        ),
        _org(
            name="Platform Calgary",
            type="incubator",
            tagline="Calgary's tech community, connected.",
            overview="Central hub for Calgary's tech ecosystem — programs across every stage, TC Central innovation building, and access to $200M+ in capital partners.",
            headquarters="Calgary, AB",
            region="Alberta",
            founded_year=2020,
            focus_areas=["Energy Tech", "AgTech", "Enterprise SaaS", "AI/ML"],
            stages=["idea", "pre_seed", "seed", "series_a"],
            community_size=650,
            accent_color="#E01F32",
            cover_url="https://images.unsplash.com/photo-1449034446853-66c86144b0ad?w=1200&h=400&fit=crop",
            programs=[
                {"name": "Junction", "description": "Pre-seed accelerator with $150K non-dilutive.", "stage": "pre_seed"},
                {"name": "Scale Up", "description": "For growth-stage companies raising Series A.", "stage": "series_a"},
            ],
            contact={"website": "https://platformcalgary.com"},
            tags=["prairies", "energy-adjacent"],
        ),
        _org(
            name="Innovate Edmonton",
            type="incubator",
            tagline="Building Edmonton's future economy.",
            overview="Edmonton's tech and innovation catalyst — capital connections, ecosystem building, and Health City programming.",
            headquarters="Edmonton, AB",
            region="Alberta",
            founded_year=2020,
            focus_areas=["HealthTech", "AgTech", "AI/ML"],
            stages=["pre_seed", "seed"],
            community_size=220,
            accent_color="#0F6E38",
            cover_url="https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1200&h=400&fit=crop",
            contact={"website": "https://innovateedmonton.com"},
            tags=["prairies"],
        ),
        _org(
            name="Innovation Saskatchewan",
            type="government",
            tagline="Catalyzing Saskatchewan's innovation economy.",
            overview="The provincial crown corporation supporting innovation across ag, mining, and tech — home to the Innovation Place research parks in Saskatoon and Regina.",
            headquarters="Regina, SK",
            region="Saskatchewan",
            founded_year=2010,
            focus_areas=["AgTech", "Mining Tech", "CleanTech"],
            stages=["all_stages"],
            community_size=340,
            accent_color="#006747",
            cover_url="https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&h=400&fit=crop",
            contact={"website": "https://innovationsask.ca"},
            tags=["gov-backed", "prairies"],
        ),
        _org(
            name="North Forge Technology Exchange",
            type="incubator",
            tagline="Manitoba's home for hardware and software startups.",
            overview="Winnipeg-based non-profit accelerating tech founders with programming, fabrication lab (FabLab), and capital access.",
            headquarters="Winnipeg, MB",
            region="Manitoba",
            founded_year=2015,
            focus_areas=["Hardware", "AgTech", "Enterprise SaaS"],
            stages=["idea", "pre_seed", "seed"],
            community_size=175,
            accent_color="#F5B841",
            cover_url="https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&h=400&fit=crop",
            programs=[
                {"name": "FastTrack", "description": "12-week validation program for founders.", "duration": "12 weeks", "stage": "idea"},
            ],
            contact={"website": "https://northforge.ca"},
            tags=["prairies", "hardware-friendly"],
        ),
        _org(
            name="Ventures Lab (McMaster Innovation Park)",
            type="university",
            tagline="Turning Hamilton research into ventures.",
            overview="Hamilton-based incubator inside McMaster Innovation Park, serving startups across health, industrial and materials science.",
            headquarters="Hamilton, ON",
            region="Ontario",
            founded_year=2011,
            focus_areas=["HealthTech", "Advanced Materials", "MedTech"],
            stages=["pre_seed", "seed"],
            community_size=110,
            accent_color="#7A003C",
            cover_url="https://images.unsplash.com/photo-1531482615713-2afd69097998?w=1200&h=400&fit=crop",
            contact={"website": "https://mcmasterinnovationpark.ca/ventures-lab"},
            tags=["university-linked"],
        ),
        _org(
            name="Foresight",
            type="accelerator",
            tagline="Canada's largest cleantech accelerator.",
            overview="Foresight accelerates cleantech ventures across Canada with growth programming, ecosystem infrastructure, and pilot pathways to industrial partners.",
            headquarters="Vancouver, BC",
            region="National",
            founded_year=2013,
            focus_areas=["CleanTech", "Energy Transition", "Circular Economy"],
            stages=["pre_seed", "seed", "series_a"],
            community_size=520,
            accent_color="#00A651",
            cover_url="https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=1200&h=400&fit=crop",
            programs=[
                {"name": "Foresight Launch", "description": "12-week program for early-stage cleantech.", "duration": "12 weeks", "stage": "pre_seed"},
                {"name": "Deep Green Capital", "description": "Investor pathway for scale-ups.", "stage": "series_a"},
            ],
            partners=["Government of Canada", "BDC", "Export Development Canada"],
            contact={"website": "https://foresightcac.com"},
            tags=["cleantech", "national"],
        ),
        _org(
            name="Vector Institute",
            type="nonprofit",
            tagline="Advancing AI research and application in Canada.",
            overview="Independent AI research institute based in Toronto, connecting industry sponsors with world-class faculty, PhDs, and 400+ industrial AI projects.",
            headquarters="Toronto, ON",
            region="Ontario",
            founded_year=2017,
            focus_areas=["AI/ML", "Deep Learning", "Applied AI"],
            stages=["all_stages"],
            community_size=1500,
            accent_color="#762F8E",
            cover_url="https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?w=1200&h=400&fit=crop",
            partners=["Government of Ontario", "Government of Canada"],
            contact={"website": "https://vectorinstitute.ai"},
            tags=["ai", "research-institute"],
        ),
        _org(
            name="Mila — Quebec AI Institute",
            type="nonprofit",
            tagline="World-leading AI research and innovation.",
            overview="Founded by Yoshua Bengio, Mila is the largest academic AI research community globally with 1,000+ researchers driving AI in health, climate, and social impact.",
            headquarters="Montreal, QC",
            region="Quebec",
            founded_year=1993,
            focus_areas=["AI/ML", "Health AI", "Climate AI"],
            stages=["all_stages"],
            community_size=1000,
            accent_color="#FF4E00",
            cover_url="https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&h=400&fit=crop",
            key_people=[{"name": "Yoshua Bengio", "title": "Founder & Scientific Director"}],
            contact={"website": "https://mila.quebec"},
            tags=["ai", "research-institute"],
        ),
        _org(
            name="NEXT Canada",
            type="nonprofit",
            tagline="Investing in Canada's most talented entrepreneurs.",
            overview="Toronto-based non-profit running the elite Next 36 (undergrad), NextAI (AI-focused), and Next Founders (scaleup) programs.",
            headquarters="Toronto, ON",
            region="National",
            founded_year=2010,
            focus_areas=["AI/ML", "Consumer", "Enterprise SaaS"],
            stages=["idea", "pre_seed", "seed"],
            community_size=800,
            accent_color="#0033A0",
            cover_url="https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&h=400&fit=crop",
            programs=[
                {"name": "Next 36", "description": "Elite undergraduate founders program.", "stage": "idea"},
                {"name": "NextAI", "description": "AI-first accelerator for early-stage ventures.", "stage": "pre_seed"},
                {"name": "Next Founders", "description": "For scale-up CEOs.", "stage": "seed"},
            ],
            contact={"website": "https://nextcanada.com"},
            tags=["national", "talent-first"],
        ),
        _org(
            name="Sustainable Development Technology Canada (SDTC)",
            type="government",
            tagline="Funding Canada's cleantech innovators.",
            overview="Federal foundation deploying non-dilutive capital to Canadian cleantech ventures — $1.4B invested to date across 500+ companies.",
            headquarters="Ottawa, ON",
            region="National",
            founded_year=2001,
            focus_areas=["CleanTech", "Circular Economy", "AgTech", "Water Tech"],
            stages=["seed", "series_a", "series_b_plus"],
            community_size=500,
            accent_color="#007A33",
            cover_url="https://images.unsplash.com/photo-1497436072909-60f360e1d4b1?w=1200&h=400&fit=crop",
            programs=[
                {"name": "Seed Fund", "description": "Up to $100K non-dilutive.", "stage": "seed"},
                {"name": "Startup Fund", "description": "Up to $2M non-dilutive.", "stage": "series_a"},
            ],
            contact={"website": "https://sdtc.ca"},
            tags=["gov-backed", "non-dilutive"],
        ),
        _org(
            name="Mitacs",
            type="nonprofit",
            tagline="Connecting Canadian innovation to global research talent.",
            overview="National research organization pairing companies with graduate students / postdocs through Accelerate and Elevate internship funding programs.",
            headquarters="Vancouver, BC",
            region="National",
            founded_year=1999,
            focus_areas=["Research Partnerships", "R&D Talent"],
            stages=["all_stages"],
            community_size=5000,
            accent_color="#F58021",
            cover_url="https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&h=400&fit=crop",
            contact={"website": "https://mitacs.ca"},
            tags=["r&d", "gov-backed"],
        ),
        _org(
            name="Invest Ottawa",
            type="incubator",
            tagline="Ottawa's leading economic development agency.",
            overview="Programming, workspace, and capital connections for founders in the National Capital Region, with strengths in cyber, telecom, and health.",
            headquarters="Ottawa, ON",
            region="Ontario",
            founded_year=2012,
            focus_areas=["Cybersecurity", "Telecom", "HealthTech", "CleanTech"],
            stages=["pre_seed", "seed"],
            community_size=430,
            accent_color="#C8102E",
            cover_url="https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200&h=400&fit=crop",
            contact={"website": "https://investottawa.ca"},
            tags=["ottawa", "regional-anchor"],
        ),
        _org(
            name="Genesis (Memorial University)",
            type="university",
            tagline="Growing Newfoundland and Labrador's innovation economy.",
            overview="Memorial University's startup accelerator in St. John's, supporting ventures across ocean tech, health, and enterprise software.",
            headquarters="St. John's, NL",
            region="Newfoundland and Labrador",
            founded_year=1997,
            focus_areas=["Ocean Tech", "HealthTech", "Enterprise SaaS"],
            stages=["idea", "pre_seed", "seed"],
            community_size=85,
            accent_color="#8B1D2E",
            cover_url="https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=1200&h=400&fit=crop",
            contact={"website": "https://genesiscentre.ca"},
            tags=["atlantic-canada", "university-linked"],
        ),
        _org(
            name="Invest Nova Scotia",
            type="government",
            tagline="Growing Nova Scotia's economy through smart investment.",
            overview="Provincial agency partnering with startups and scale-ups across the province, from Halifax to rural coastal communities.",
            headquarters="Halifax, NS",
            region="Nova Scotia",
            founded_year=2023,
            focus_areas=["Ocean Tech", "CleanTech", "Digital Media"],
            stages=["all_stages"],
            community_size=210,
            accent_color="#003DA5",
            cover_url="https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1200&h=400&fit=crop",
            contact={"website": "https://investnovascotia.ca"},
            tags=["atlantic-canada", "gov-backed"],
        ),
        _org(
            name="Startup Yukon",
            type="nonprofit",
            tagline="Fuelling entrepreneurship across the North.",
            overview="Whitehorse-based non-profit supporting Northern founders with programming, capital access, and community — the innovation anchor for the Yukon.",
            headquarters="Whitehorse, YT",
            region="Yukon",
            founded_year=2016,
            focus_areas=["Tourism Tech", "CleanTech", "Digital Nomad"],
            stages=["idea", "pre_seed"],
            community_size=48,
            accent_color="#2E5E3D",
            cover_url="https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?w=1200&h=400&fit=crop",
            contact={"website": "https://startupyukon.com"},
            tags=["north", "regional-anchor"],
        ),
        _org(
            name="Angel Investors Ontario",
            type="angel_group",
            tagline="Ontario's angel investor network.",
            overview="Umbrella organization representing 15+ regional angel groups across Ontario, deploying ~$100M annually into local seed-stage companies.",
            headquarters="Toronto, ON",
            region="Ontario",
            founded_year=2007,
            focus_areas=["Enterprise SaaS", "HealthTech", "Consumer", "CleanTech"],
            stages=["pre_seed", "seed"],
            community_size=800,
            accent_color="#003C8F",
            cover_url="https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1200&h=400&fit=crop",
            contact={"website": "https://angelinvestorsontario.ca"},
            tags=["angel-capital", "seed"],
        ),
        _org(
            name="OneEleven",
            type="coworking",
            tagline="Where Canada's next-generation tech companies scale.",
            overview="Toronto-based hub for high-growth scale-ups, offering flexible workspace, community, and connections to talent, capital, and enterprise partners.",
            headquarters="Toronto, ON",
            region="Ontario",
            founded_year=2013,
            focus_areas=["Enterprise SaaS", "AI/ML", "FinTech"],
            stages=["series_a", "series_b_plus", "growth"],
            community_size=160,
            accent_color="#111111",
            cover_url="https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=1200&h=400&fit=crop",
            contact={"website": "https://oneeleven.com"},
            tags=["scale-up", "toronto"],
        ),
        _org(
            name="Rogers Cybersecure Catalyst",
            type="corporate",
            tagline="Canada's national cybersecurity centre.",
            overview="Toronto Metropolitan University-run cybersecurity ecosystem — accelerator, applied research, and workforce development.",
            headquarters="Brampton, ON",
            region="Ontario",
            founded_year=2019,
            focus_areas=["Cybersecurity", "Privacy", "Critical Infrastructure"],
            stages=["seed", "series_a"],
            community_size=90,
            accent_color="#DA291C",
            cover_url="https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200&h=400&fit=crop",
            programs=[
                {"name": "Catalyst Cyber Accelerator", "description": "6-month program for growth-stage cybersecurity ventures.", "duration": "6 months", "stage": "series_a"},
            ],
            contact={"website": "https://cybersecurecatalyst.ca"},
            tags=["cyber", "corporate-linked"],
        ),
    ]


async def seed_organizations(db) -> None:
    if await db.organizations.count_documents({}) > 0:
        return
    docs = build_organizations_seed()
    if docs:
        await db.organizations.insert_many([dict(d) for d in docs])
