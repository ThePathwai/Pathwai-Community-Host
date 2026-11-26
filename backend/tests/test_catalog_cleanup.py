"""The catalog's `requirements` hold only what a founder must meet. How to apply, what the program offers, and what we could not
confirm live in their own lists (backend/catalog_clean.py)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import catalog_clean as cc  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "data" / "programs_ca.json"


def _programs():
    return json.loads(DATA.read_text(encoding="utf-8"))["programs"]


def test_every_line_is_sorted_into_one_place():
    for k, examples in {
        "requirements": ["Incorporated in Canada", "At least 2 years in operation", "Under $1 million raised from third parties", "Commit to the full 10 weeks",
                          "$300,000 to $100M annual revenue in Canada", "Registered not-for-profit in Brampton"],
        "how_to_apply": ["Apply through the online form", "Talk to an Industrial Technology Advisor first", "Book a consultation online", "Contact the team to join the waitlist"],
        "about": ["Mentoring and business strategy support", "Free; no equity taken", "Top two teams get $15,000 and $10,000", "Hybrid 12-week format", "Cohorts start in late March and September"],
        "unconfirmed": ["Page does not state country limits", "Eligibility is not listed on the page", "Canada eligibility not verified", "Check the site for intake; its footer is dated 2021"],
    }.items():
        for line in examples:
            assert cc.classify(line) == k, (line, cc.classify(line), k)


def test_the_catalog_is_already_sorted_and_stays_sorted():
    for p in _programs():
        assert cc.clean_entry(p) == p, f"{p['id']}: run python3 backend/scripts/clean_requirements.py"


def test_requirements_hold_no_how_to_apply_or_page_notes():
    for p in _programs():
        for r in p.get("requirements", []):
            assert cc.classify(r) == "requirements", (p["id"], r)


def test_sorting_loses_and_repeats_nothing():
    lines = ["Incorporated", "Apply through the form", "Free; no equity taken", "Page does not state country limits", "Incorporated", "  Apply   through the form "]
    out = cc.split_lines(lines)
    assert out == {"requirements": ["Incorporated"], "how_to_apply": ["Apply through the form"], "about": ["Free; no equity taken"], "unconfirmed": ["Page does not state country limits"]}
    p = {"id": "x", "requirements": lines, "about": ["Already here"]}
    c = cc.clean_entry(p)
    assert c["about"] == ["Already here", "Free; no equity taken"]
    assert cc.clean_entry(c) == c
    assert "how_to_apply" not in cc.clean_entry({"id": "y", "requirements": ["Incorporated"]})


def test_the_card_checklist_no_longer_lists_benefits():
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    import navigator as nav
    utest = next(p for p in _programs() if p["id"] == "utest")
    left = nav.unchecked_requirements(utest)
    assert "Mentoring and business strategy support" not in left
    assert "Incubation space at the St. George campus" not in left
    assert not any(x.startswith("Check the site") for x in left)
    assert "Company based on U of T research" in left
