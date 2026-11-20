"""The suggestions must follow the person's profile. Each test changes ONE thing about a founder and checks the list moves the way a
human advisor would expect, using the real catalog. (Engine only; the routes feed it the profile saved on the account.)"""
from datetime import date

import navigator as nav

PROGS = nav.load_catalog()["programs"]
BY = {p["id"]: p for p in PROGS}
TODAY = date(2026, 10, 6)
BASE = {"stage": "launched", "province": "ON", "city": "Toronto", "needs": ["funding"], "sectors": ["tech"], "incorporated": True,
        "employees": 2, "age": 34, "gender": "male", "audiences": []}


def fit_ids(**kw):
    r = nav.suggest(PROGS, {**BASE, **kw}, TODAY, limit=500)
    return [x["id"] for x in r["matches"] + r["more"]], r


def only(ids, aud):
    return [i for i in ids if aud in (BY[i].get("restricted_to") or [])]


def test_group_programs_appear_only_for_that_group():
    base, _ = fit_ids()
    for aud, kw in [("women", {"gender": "female"}), ("black", {"audiences": ["black"]}), ("indigenous", {"audiences": ["indigenous"]}), ("newcomer", {"audiences": ["newcomer"]})]:
        ids, _ = fit_ids(**kw)
        assert only(base, aud) == [], aud
        assert len(only(ids, aud)) > 0, aud


def test_province_changes_the_list():
    on, _ = fit_ids()
    ab, _ = fit_ids(province="AB", city="Calgary")
    assert any(BY[i].get("provinces") == ["ON"] for i in on)
    assert not any(BY[i].get("provinces") == ["ON"] for i in ab)


def test_stage_changes_the_leaders():
    idea = [x["id"] for x in nav.suggest(PROGS, {**BASE, "stage": "idea"}, TODAY)["matches"]]
    growth = [x["id"] for x in nav.suggest(PROGS, {**BASE, "stage": "growth"}, TODAY)["matches"]]
    assert idea != growth


def test_needs_lead_the_list():
    for need in ["funding", "mentorship", "customers"]:
        top = nav.suggest(PROGS, {**BASE, "needs": [need]}, TODAY)["matches"][:6]
        assert sum(1 for x in top if need in (BY[x["id"]].get("needs") or [])) >= 5, need


def test_sector_changes_the_list():
    tech, _ = fit_ids()
    health, _ = fit_ids(sectors=["health"])
    assert set(tech) != set(health)
    hits = [i for i in health if "health" in (BY[i].get("sectors") or [])]
    assert hits and not [i for i in tech if "health" in (BY[i].get("sectors") or []) and "tech" not in (BY[i].get("sectors") or [])]


def test_not_incorporated_moves_programs_to_not_yet():
    inc, r1 = fit_ids()
    no, r2 = fit_ids(incorporated=False)
    assert r2["totals"]["later"] > r1["totals"]["later"] and len(no) < len(inc)


def test_two_different_founders_get_different_top_lists():
    a = {x["id"] for x in nav.suggest(PROGS, {**BASE, "stage": "idea", "needs": ["mentorship"], "sectors": ["health"]}, TODAY)["matches"][:8]}
    b = {x["id"] for x in nav.suggest(PROGS, {**BASE, "stage": "revenue", "needs": ["funding"], "sectors": ["tech"], "employees": 15}, TODAY)["matches"][:8]}
    assert len(a & b) <= 2
