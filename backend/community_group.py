"""Which of Pathwai's two spaces a community belongs to: "innovation" (founders, mentors, programs, professional networks) or "leisure"
(fitness, faith, food, clubs, social). The two are never mixed in a list. An admin can set `community_group` on the community config to
override; otherwise it is worked out from the community's kind, interest tags and type. Mirrored by frontend/src/lib/communityGroup.js."""
import re
from typing import Any, Dict

GROUPS = ("innovation", "leisure")
_KIND = re.compile(r"innovation|entrepreneur|startup|founder|incubator|accelerator|tech|professional network|alumni", re.I)
_TAGS = {"entrepreneurship", "startups", "innovation", "tech"}
_TYPES = {"startup", "professional", "alumni"}


def community_group(cfg: Dict[str, Any]) -> str:
    cfg = cfg or {}
    explicit = cfg.get("community_group")
    if explicit in GROUPS:
        return explicit
    if _KIND.search(str(cfg.get("community_kind") or "")):
        return "innovation"
    if any(str(t).lower() in _TAGS for t in (cfg.get("interest_tags") or [])):
        return "innovation"
    if cfg.get("community_type") in _TYPES:
        return "innovation"
    return "leisure"
