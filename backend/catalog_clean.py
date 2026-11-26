"""Sorts the loose lines in a catalog entry's `requirements` into where a founder needs to see them.

The catalog was written by hand and `requirements` ended up holding four kinds of line:
  requirements    what you must be, have or do to qualify ("Incorporated in Canada", "At least 2 years in operation")
  how_to_apply    the steps ("Apply through the online form", "Talk to an advisor first")
  about           what the program is like: what you get, what it costs, how long it runs, when the cohorts start
  unconfirmed     what we could not confirm from the program's page ("Page does not state country limits")
Only the first kind is something a founder has to meet, so only that stays in `requirements`; the card that says "check these
before you apply" lists nothing else. Nothing is dropped: every line moves to the list where it belongs.

Pure and repeatable: running it on an already sorted entry changes nothing. The rules are plain patterns, checked in this order
(unconfirmed, how to apply, about, otherwise a requirement), with OVERRIDES for the few lines a pattern gets wrong."""
from __future__ import annotations

import re
from typing import Any, Dict, List

KINDS = ("requirements", "how_to_apply", "about", "unconfirmed")

_UNCONFIRMED = [
    r"\b(page|pages|site|programme page|sign-up page|contact page|programmes page)\b.{0,60}\b(not|no|does not|doesn't|lists no|gives no|says|banner|shows|inconsistent|newest|publish|labels|appears|we read)\b",
    r"\b(is|are|was|were)? ?not (stated|listed|verified|confirmed|published|shown|set|named|available)\b",
    r"^(described from|check the|confirm |programme details|program details|eligibility (is|and|for)|canada eligibility|grant availability|cost to take part|the only current action|the last run|the directory is|the join form|the page|a page banner|page does not|no (dates|date|deadline|city|cold|warm|join|separate))",
    r"\bnot confirmed\b|\bis inconsistent\b|\bfooter\b",
]
_HOW = [
    r"^(apply|submit|register (to|for|a|online)|contact|book|request|use the|use its|create |call or email|call |send |talk to|meet an|buy tickets|entry is through|formally apply|start with|rsvp|pitch form|contact page|contact form|direct applications|site invites|referral preferred|full proposals by|mandatory pre-application|you apply at|you send your|applications go directly|the form (asks|takes)|complete the (information|become|.* form)|follow |email )",
    r"\b(apply|apply and|apply through|apply with|apply at)\b.{0,40}\b(form|page|partner|office|bank|portal|site)\b",
]
_ABOUT = [
    r"^(mentor(ing|ship)?\b|mentor and|coaching|incubation space|free\b|builds |networking events|business programs|trade missions|top (two|10|ten)|finalists get|\$[0-9,]+ (in|per)\b|up to \$|forum lists|self-paced|business valuation|advisor network|audience votes|private labs|cohort-based|partners include|members invest|follow-on|membership option|individual, corporate|virtual events are free|capped at|loans go to|funding is (for|matched)|principal is repayable|the credit goes|investments are subject|rise does not|atlas files|government funding stacking|projects run up to|[0-9] to [0-9] hours|up to [0-9] hours|about [0-9] to [0-9] weeks|accessed through|prime runs|two streams|assessed on|the equity-match|prices (are|exclude)|[0-9]+% registration fee|pay \$|over [0-9,]+ |cohorts start|review takes|present in person|virtual pitch round|four months|hybrid|two intakes|first come, first served|current memberships|expressions of interest are open|early applications are encouraged|applications? (are )?(closed|paused)|intake paused|the 20[0-9]{2} (run|cycle)|cohort-based|limited spots|not cohort-based|the programme runs in french|directory:|hours vary|toll-free|registration help|rsvp runs)",
    r"\b(2027|2026) (waitlist|cohort|start)\b|\bwaitlist\b",
]
# Lines a pattern gets wrong, sorted by hand. Exact text -> kind.
OVERRIDES: Dict[str, str] = {
    "Commit to the full 10 weeks": "requirements",
    "Commit to assignments and growth milestones": "requirements",
    "Attend in-person workshops and virtual meetings": "requirements",
    "Complete U of T IP Education Level 1 or an approved Level 2 topic": "requirements",
    "Complete U of T's IP Education Level 1 course before a final interview": "requirements",
    "Submit a written business plan with the appointment request": "requirements",
    "Register as an Altitude client": "requirements",
    "Register as a Spark Centre or Launch Lab client": "requirements",
    "Mandatory pre-application consultation with SIF officials": "requirements",
    "Mentor and advisor access": "about",
    "Pay $1,000 per position requested": "requirements",
    "2% registration fee": "about",
    "Matching share paid in cash": "requirements",
    "Cost to take part is not stated": "unconfirmed",
    "Pitch form on the site; says it is always open to meeting founders": "how_to_apply",
    "No separate application: opt in when applying to the Desjardins prize": "how_to_apply",
    "Complete the information form on the page; dates are not shown": "how_to_apply",
    "Registered not-for-profit in Brampton": "requirements",
    "$300,000 to $100M annual revenue in Canada": "requirements",
    "$6 to $50 million in annual recurring revenue": "requirements",
    "The equity-match grant must be paired with a business loan": "requirements",
    "Full-time or part-time option": "about",
    "Membership is a paid tier": "about",
    "Membership is paid, not a grant": "about",
    "Toronto and GTA events plus online sessions": "about",
    "In-person events in Toronto, Leaside, Port Credit, Thornhill and Toronto West": "about",
    "Offices and events in Toronto, New York, Vancouver and other cities": "about",
    "Sharing platform requires registration": "how_to_apply",
    "Join through the form on the site": "how_to_apply",
    "A warm introduction is preferred, but the form is open to submissions": "how_to_apply",
    "Pilot phase ended in June 2023; check the BACEL site for current workshops": "unconfirmed",
    "The sign-up page lists tracks by season; confirm which is open": "unconfirmed",
    "Ottawa-based national non-profit; the application steps are on the for-founders page": "about",
}


def classify(line: str) -> str:
    s = " ".join(str(line or "").split())
    if s in OVERRIDES:
        return OVERRIDES[s]
    low = s.lower()
    for kind, pats in (("unconfirmed", _UNCONFIRMED), ("how_to_apply", _HOW), ("about", _ABOUT)):
        if any(re.search(p, low) for p in pats):
            return kind
    return "requirements"


def split_lines(lines: List[str]) -> Dict[str, List[str]]:
    out: Dict[str, List[str]] = {k: [] for k in KINDS}
    for ln in lines or []:
        s = " ".join(str(ln or "").split())
        if s and s not in out[classify(s)]:
            out[classify(s)].append(s)
    return out


def clean_entry(p: Dict[str, Any]) -> Dict[str, Any]:
    """The same entry with its lines sorted. Lines already in the other lists stay there; nothing is lost or repeated."""
    out = dict(p)
    sorted_ = split_lines(p.get("requirements") or [])
    for k in ("how_to_apply", "about", "unconfirmed"):
        merged = list(p.get(k) or [])
        for s in sorted_[k]:
            if s not in merged:
                merged.append(s)
        if merged:
            out[k] = merged
        else:
            out.pop(k, None)
    out["requirements"] = sorted_["requirements"]
    return out
