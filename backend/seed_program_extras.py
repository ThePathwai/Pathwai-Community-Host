"""One-shot seed: attach a small extra-questions block to a handful of the
most-visible programs so the Universal Application flow (Phase B) has
believable per-program intake forms out of the box.

Idempotent — programs that already carry `extra_questions` are left alone.
"""
from __future__ import annotations

from typing import Any, Dict, List

# (org_slug, program_name) → list of extra questions to attach.
_EXTRAS: Dict[tuple, List[Dict[str, Any]]] = {
    ("creative-destruction-lab", "CDL Program"): [
        {"key": "science_thesis", "label": "What's your scientific / technical thesis?",
         "type": "textarea", "required": True, "max_length": 800,
         "placeholder": "The novel insight that makes your venture defensible.",
         "help_text": "CDL is objectives-based — mentors will pressure-test this in Session 1."},
        {"key": "cdl_track", "label": "Which CDL track are you applying to?",
         "type": "select", "required": True,
         "options": ["AI", "HealthTech", "Quantum", "Space", "Energy", "Climate", "Matter"]},
        {"key": "objectives_completed", "label": "Objectives already completed",
         "type": "textarea", "required": False, "max_length": 600,
         "placeholder": "e.g. filed provisional patent, signed first LOI, hired co-founder."},
    ],
    ("mars-discovery-district", "Momentum"): [
        {"key": "arr_now", "label": "Current annual recurring revenue (CAD)",
         "type": "text", "required": True, "placeholder": "$500K"},
        {"key": "sales_bottleneck", "label": "Your biggest sales bottleneck right now",
         "type": "textarea", "required": True, "max_length": 500,
         "placeholder": "e.g. can't get past pilot phase, deal cycles > 6 months."},
        {"key": "ideal_customer", "label": "One-sentence ideal customer profile",
         "type": "text", "required": False},
    ],
    ("dmz", "Incubator"): [
        {"key": "product_stage", "label": "Where's your product today?",
         "type": "select", "required": True,
         "options": ["Idea validation", "Prototype", "MVP in market", "Early revenue", "Scaling"]},
        {"key": "paying_customers", "label": "Do you have paying customers?",
         "type": "select", "required": True, "options": ["No", "Design partners only", "1–5", "6–20", "20+"]},
        {"key": "team_commitment", "label": "Team commitment",
         "type": "textarea", "required": True, "max_length": 400,
         "placeholder": "Who's full-time, who's part-time, and any key hires planned."},
    ],
    ("communitech", "Fierce Founders"): [
        {"key": "founding_year", "label": "Year you incorporated (or plan to)",
         "type": "text", "required": True, "placeholder": "2024"},
        {"key": "market_size", "label": "Estimated market size (Canada + North America)",
         "type": "text", "required": False, "placeholder": "e.g. $1.2B annually"},
        {"key": "unique_lens", "label": "Which unique lens are you bringing to this problem?",
         "type": "textarea", "required": True, "max_length": 500},
    ],
    ("mila-quebec-ai-institute", "AI Startups"): [
        {"key": "ai_paper_or_ip", "label": "Any published AI research / IP tied to the venture?",
         "type": "url", "required": False, "placeholder": "arXiv / journal / patent URL"},
        {"key": "compute_needs", "label": "Compute + infra needs over the next 12 months",
         "type": "textarea", "required": True, "max_length": 500},
    ],
    ("platform-calgary", "Junction"): [
        {"key": "why_calgary", "label": "Why is your venture rooted in Alberta?",
         "type": "textarea", "required": True, "max_length": 400},
        {"key": "cohort_focus", "label": "Which cohort focus fits you?",
         "type": "select", "required": True,
         "options": ["Energy transition", "AgTech", "HealthTech", "Web3 / FinTech", "General"]},
    ],
    ("velocity-university-of-waterloo", "Velocity Incubator"): [
        {"key": "uw_affiliation", "label": "Are you a University of Waterloo student / alum?",
         "type": "select", "required": True,
         "options": ["Current student", "Alum (< 5 years)", "Alum (> 5 years)", "Not affiliated"]},
        {"key": "engineering_thesis", "label": "One-line engineering thesis of your product",
         "type": "text", "required": True, "placeholder": "The hard technical thing you're solving."},
    ],
    ("volta", "Cohort"): [
        {"key": "atlantic_tie", "label": "Your Atlantic Canada tie",
         "type": "textarea", "required": True, "max_length": 400,
         "placeholder": "Where the team lives, hires, or serves customers from."},
    ],
}


async def ensure_program_extras(db) -> Dict[str, int]:
    """Attach `extra_questions` to seeded programs. Idempotent."""
    touched = 0
    async for org in db.organizations.find({}):
        programs = org.get("programs") or []
        if not programs:
            continue
        dirty = False
        new_programs = []
        for p in programs:
            key = (org.get("slug"), p.get("name"))
            has_extras = bool(p.get("extra_questions"))
            if key in _EXTRAS and not has_extras:
                p = {**p, "extra_questions": _EXTRAS[key]}
                dirty = True
            new_programs.append(p)
        if dirty:
            await db.organizations.update_one(
                {"_id": org["_id"]}, {"$set": {"programs": new_programs}}
            )
            touched += 1
    return {"orgs_updated": touched}
