"""Simulated community: fake founders / mentors across every key innovation space.

Idempotent — only runs when no `is_simulated` users exist. Each fake user gets a
rich profile (startup + value-exchange fields) and an approved membership in
their home space (membership docs are tagged `simulated: True`).
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

_FIRST = ["Aiden", "Bianca", "Callum", "Dalia", "Emeka", "Farah", "Gabriel", "Hana", "Isaac", "Jia",
          "Kofi", "Leila", "Mateo", "Nadia", "Owen", "Priya", "Quinn", "Rosa", "Sam", "Tara",
          "Uma", "Victor", "Wren", "Xavier", "Yara", "Zane", "Amira", "Bruno", "Chloe", "Dev",
          "Elise", "Felix", "Gia", "Hugo", "Ines", "Jamal", "Kira", "Luca", "Maya", "Nico",
          "Odette", "Pablo", "Rhea", "Soren"]
_LAST = ["Abara", "Bouchard", "Chowdhury", "Dubois", "Eze", "Fontaine", "Gill", "Haddad", "Ito", "Jensen",
         "Kaur", "Lavoie", "Morin", "Nwosu", "Okoye", "Petrov", "Quach", "Roy", "Singh", "Tremblay",
         "Uddin", "Vasquez", "Wong", "Xu", "Young", "Zhang", "Adeyemi", "Barros", "Cote", "Diallo",
         "Espinoza", "Fraser", "Gagnon", "Hossain", "Ibrahim", "Joshi", "Khan", "Leung", "Mbeki", "Nguyen",
         "Osei", "Patel", "Rahman", "Sato"]

_SPACES = [
    "creative-destruction-lab", "mars-discovery-district", "platform-calgary", "communitech", "foresight",
    "volta", "invest-ottawa", "dmz", "university-of-toronto-entrepreneurship",
    "velocity-university-of-waterloo", "mila-quebec-ai-institute",
]

_SECTORS = [
    ("CleanTech", "Carbon accounting for mid-market manufacturers", ["Climate", "Hardware", "Grants"], ["Pilot customers", "Series A investors"]),
    ("HealthTech", "Remote monitoring for chronic-care clinics", ["Regulatory", "Clinical validation"], ["Clinical advisors", "Hospital pilots"]),
    ("AI/ML", "Foundation-model tooling for legal teams", ["Applied ML", "Product"], ["ML engineers", "Design partners"]),
    ("FinTech", "Embedded payments for freelancers", ["Compliance", "Payments"], ["Bank partnerships", "Compliance counsel"]),
    ("Enterprise SaaS", "Workflow automation for procurement teams", ["GTM", "Sales"], ["First 10 customers", "Sales lead"]),
    ("AgTech", "Precision irrigation sensors for prairie farms", ["Hardware", "Ops"], ["Distribution partners", "Field pilots"]),
    ("Consumer", "Community-led wellness app for new parents", ["Growth", "Community"], ["Growth marketer", "Seed investors"]),
    ("Cybersecurity", "SOC automation for small hospitals", ["Security", "Federal buyers"], ["CISO advisors", "Federal intros"]),
]

_ROLES = ["founder", "founder", "founder", "mentor"]


def _h(s: str) -> int:
    return int(hashlib.md5(s.encode()).hexdigest(), 16)


def _build(i: int, space: str) -> Dict[str, Any]:
    first, last = _FIRST[i % len(_FIRST)], _LAST[(i * 7) % len(_LAST)]
    sector, oneliner, expertise, seeking = _SECTORS[i % len(_SECTORS)]
    role = _ROLES[i % len(_ROLES)]
    name = f"{first} {last}"
    uid = f"u-sim-{i:03d}"
    startup = f"{last} {['Labs', 'Systems', 'Works', 'Robotics', 'Health', 'Cloud'][i % 6]}"
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": uid,
        "name": name,
        "email": f"{first.lower()}.{last.lower()}.{i}@sim.yourcommunity.app",
        "role": role,
        "title": "Founder & CEO" if role == "founder" else "Mentor · Operator",
        "company": startup if role == "founder" else "Independent",
        "startup_name": startup,
        "startup_one_liner": oneliner,
        "startup_stage": ["idea", "mvp", "early_revenue", "scaling"][i % 4],
        "startup_sector": sector,
        "business_industry_focus": sector,
        "product_description": oneliner + ".",
        "industry": sector,
        "location": ["Toronto, ON", "Montreal, QC", "Calgary, AB", "Waterloo, ON", "Halifax, NS", "Ottawa, ON"][i % 6],
        "avatar_url": f"https://i.pravatar.cc/200?u={uid}",
        "bio": f"{name} is building {startup}: {oneliner.lower()}. Active in the {space.replace('-', ' ')} community.",
        "expertise": expertise,
        "skill_set": expertise,
        "needs_seeking": seeking,
        "open_to": ["Mentoring", "Intros"] if role == "mentor" else ["Peer feedback"],
        "strengths": expertise[:2],
        "growing_in": ["Fundraising"],
        "support_needs": seeking,
        "cohort": f"Cohort {10 + (i % 4)}",
        "active_space_slug": space,
        "memberships_space_slugs": [space],
        "is_simulated": True,
        "hidden_from_directory": False,
        "created_at": (datetime.now(timezone.utc) - timedelta(days=(_h(uid) % 90))).isoformat(),
        "updated_at": now,
    }


async def seed_fake_community_members(db) -> Dict[str, int]:
    if await db.users.count_documents({"is_simulated": True}) > 0:
        return {"created": 0}
    if await db.users.count_documents({}) == 0:
        return {"created": 0, "waiting_for_base_seed": True}
    orgs = {o["slug"]: o async for o in db.organizations.find({}, {"slug": 1, "name": 1})}
    users: List[Dict[str, Any]] = []
    memberships: List[Dict[str, Any]] = []
    i = 0
    for space in _SPACES:
        if space not in orgs:
            continue
        for _ in range(4):
            u = _build(i, space)
            users.append(u)
            memberships.append({
                "id": uuid.uuid4().hex[:16], "user_id": u["id"], "org_slug": space,
                "org_name": orgs[space].get("name"), "status": "approved",
                "joined_at": u["created_at"], "application_id": None, "simulated": True,
            })
            i += 1
    if users:
        await db.users.insert_many(users)
        await db.memberships.insert_many(memberships)
    return {"created": len(users)}
