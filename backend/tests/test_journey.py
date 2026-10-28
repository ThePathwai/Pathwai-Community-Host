"""Journey: the startup plan. The rules in journey.py (and their twin in frontend/src/lib/journey.js), the starter milestones, and the API."""
import json
import os
import random
import shutil
import sys
import subprocess
import tempfile
from datetime import date
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"
os.environ.pop("EMERGENT_LLM_KEY", None)

import pytest
from fastapi.testclient import TestClient

import journey as jny
import navigator as nav
import server

TODAY = date(2026, 10, 27)
ROOT = Path(__file__).resolve().parents[2]
PROGRAMS = nav.load_catalog()["programs"]


def ids():
    n = {"i": 0}

    def make():
        n["i"] += 1
        return f"j-{n['i']}"
    return make


def plan(*specs, stage="launched"):
    """Build a plan from (title, stage, status, due) tuples."""
    items, nid = [], ids()
    for t, s, st, due in specs:
        items = jny.update_journey(items, {"op": "add", "title": t, "stage": s, "status": st, "due": due}, stage, TODAY, nid)
    return items


# ---- the starter milestones -------------------------------------------------------------------------------------------------

def test_starter_milestones_are_well_formed():
    tpls = jny.load_templates()
    assert len({t["key"] for t in tpls}) == len(tpls)
    for t in tpls:
        assert t["stage"] in nav.STAGES and 2 <= len(t["title"]) <= 120 and t["why"], t["key"]
        for k, vals in (t.get("when") or {}).items():
            assert k in ("incorporated", "needs_any", "sectors_any", "audiences_any"), t["key"]
            if k == "needs_any":
                assert all(v in nav.NEEDS for v in vals), t["key"]
            if k == "audiences_any":
                assert all(v in nav.AUDIENCES for v in vals), t["key"]
            if k == "sectors_any":
                assert all(v in nav.SECTORS for v in vals), t["key"]
    for s in nav.STAGES:
        assert sum(1 for t in tpls if t["stage"] == s and t.get("core")) >= 2, s  # every stage has a few that matter most


def test_the_demo_copy_of_the_templates_matches_the_real_one():
    real = (ROOT / "backend" / "data" / "journey_templates.json").read_text(encoding="utf-8")
    demo = (ROOT / "frontend" / "src" / "preview" / "journey_templates.json").read_text(encoding="utf-8")
    assert json.loads(real) == json.loads(demo), "copy backend/data/journey_templates.json to frontend/src/preview/journey_templates.json"


# ---- changing the plan ---------------------------------------------------------------------------------------------------------

def test_add_update_and_remove_a_milestone():
    nid = ids()
    items = jny.update_journey([], {"op": "add", "title": "  Talk to  ten   people ", "stage": "idea", "due": "2026-11-15", "note": "Start with the club owners"}, "launched", TODAY, nid)
    m = items[0]
    assert m == {"id": "j-1", "title": "Talk to ten people", "stage": "idea", "status": "todo", "due": "2026-11-15", "note": "Start with the club owners", "key": "",
                 "program_id": "", "program_name": "", "created_at": "2026-10-27", "done_at": ""}
    items = jny.update_journey(items, {"op": "update", "id": "j-1", "status": "doing"}, "launched", TODAY, nid)
    assert items[0]["status"] == "doing" and items[0]["done_at"] == ""
    items = jny.update_journey(items, {"op": "update", "id": "j-1", "status": "done", "note": "Did 12"}, "launched", date(2026, 10, 30), nid)
    assert items[0]["done_at"] == "2026-10-30" and items[0]["note"] == "Did 12"
    items = jny.update_journey(items, {"op": "update", "id": "j-1", "status": "todo"}, "launched", TODAY, nid)
    assert items[0]["done_at"] == ""  # taking a milestone back out of done forgets when it was done
    assert jny.update_journey(items, {"op": "remove", "id": "j-1"}, "launched", TODAY, nid) == []


def test_a_milestone_without_a_stage_goes_in_the_current_stage():
    items = jny.update_journey([], {"op": "add", "title": "Hire a designer"}, "revenue", TODAY, ids())
    assert items[0]["stage"] == "revenue"
    items = jny.update_journey([], {"op": "add", "title": "Hire a designer", "stage": "wizard"}, "growth", TODAY, ids())
    assert items[0]["stage"] == "growth"


def test_a_suggestion_is_only_added_once():
    nid = ids()
    body = {"op": "add", "title": "Incorporate your company", "stage": "prototype", "key": "proto-incorporate"}
    items = jny.update_journey([], body, "prototype", TODAY, nid)
    assert jny.update_journey(items, body, "prototype", TODAY, nid) == items
    many = jny.update_journey(items, {"op": "add_many", "items": [body, {"title": "Write a one-pager", "key": "proto-pitch"}]}, "prototype", TODAY, nid)
    assert [i["key"] for i in many] == ["proto-incorporate", "proto-pitch"]


def test_bad_changes_say_what_is_wrong():
    for body, msg in (({"op": "add", "title": " "}, "title"), ({"op": "add", "title": "ok ok", "due": "soon"}, "due date"), ({"op": "add", "title": "ok ok", "status": "maybe"}, "Status"),
                      ({"op": "update", "id": "nope", "status": "done"}, "not on your plan"), ({"op": "dance"}, "Unknown")):
        with pytest.raises(ValueError, match=msg):
            jny.update_journey([], body, "idea", TODAY, ids())
    full = [{"id": f"j-{i}", "title": "ab", "stage": "idea", "status": "todo", "due": "", "key": ""} for i in range(jny.MAX_MILESTONES)]
    with pytest.raises(ValueError, match="full"):
        jny.update_journey(full, {"op": "add", "title": "one more"}, "idea", TODAY, ids())


# ---- the counting ---------------------------------------------------------------------------------------------------------------

def test_progress_is_plain_counting():
    items = plan(("a1", "idea", "done", ""), ("a2", "idea", "done", ""), ("b1", "launched", "done", ""), ("b2", "launched", "doing", ""), ("b3", "launched", "todo", ""), ("b4", "launched", "todo", ""))
    s = jny.summary(items, "launched", TODAY)
    assert (s["total"], s["done"], s["percent"]) == (6, 3, 50)
    by = {x["stage"]: x for x in s["stages"]}
    assert (by["idea"]["done"], by["idea"]["total"]) == (2, 2) and (by["launched"]["done"], by["launched"]["doing"], by["launched"]["total"]) == (1, 1, 4)
    assert s["ready"] is None  # 1 of 4 is not enough


def test_ready_for_the_next_stage_needs_most_of_the_stage_done_and_enough_milestones():
    four_of_five = plan(*[(f"m{i}", "launched", "done" if i < 4 else "todo", "") for i in range(5)])
    r = jny.summary(four_of_five, "launched", TODAY)["ready"]
    assert r == {"to": "revenue", "to_name": "Revenue", "done": 4, "total": 5, "text": "You have finished 4 of 5 milestones in Launched."}
    assert jny.summary(plan(("only", "launched", "done", "")), "launched", TODAY)["ready"] is None  # one tick is not a stage
    assert jny.summary(plan(*[(f"m{i}", "growth", "done", "") for i in range(4)], stage="growth"), "growth", TODAY)["ready"] is None  # nothing after growth


def test_next_up_puts_overdue_first_then_what_is_due_then_what_you_started():
    items = plan(("later stage, far", "revenue", "todo", "2027-03-01"), ("plain todo", "launched", "todo", ""), ("in progress", "launched", "doing", ""),
                 ("due soon", "launched", "todo", "2026-11-03"), ("overdue", "launched", "todo", "2026-10-20"), ("done", "launched", "done", ""))
    s = jny.summary(items, "launched", TODAY)
    assert [m["title"] for m in s["next_up"]] == ["overdue", "due soon", "in progress"]
    assert s["next_up"][0]["overdue"] is True and s["next_up"][1]["days"] == 7 and s["overdue"] == 1
    # a later-stage milestone shows now only when it is due within a month
    soon = plan(("later stage, near", "revenue", "todo", "2026-11-20"), ("plain", "launched", "todo", ""))
    assert [m["title"] for m in jny.summary(soon, "launched", TODAY)["next_up"]] == ["later stage, near", "plain"]


def test_recent_and_this_week():
    nid = ids()
    items = []
    for n, day in enumerate(["2026-10-01", "2026-10-25", "2026-10-27"]):
        items = jny.update_journey(items, {"op": "add", "title": f"thing {n}", "stage": "launched"}, "launched", TODAY, nid)
        items = jny.update_journey(items, {"op": "update", "id": f"j-{n + 1}", "status": "done"}, "launched", date.fromisoformat(day), nid)
    s = jny.summary(items, "launched", TODAY)
    assert [r["title"] for r in s["recent"]] == ["thing 2", "thing 1", "thing 0"] and s["done_this_week"] == 2


# ---- the suggestions say why ----------------------------------------------------------------------------------------------------

def test_every_suggestion_says_why_and_the_stage_it_belongs_to():
    sug = jny.suggestions({"stage": "launched", "needs": ["funding", "mentorship"], "sectors": ["tech"], "incorporated": True}, [], PROGRAMS, TODAY)
    assert set(sug) == set(nav.STAGES)
    for stage, rows in sug.items():
        for r in rows:
            assert r["why"] and r["title"] and r["stage"] == stage and r["key"], r


def test_suggestions_follow_the_profile():
    base = {"stage": "prototype", "needs": [], "incorporated": True}
    keys = lambda p: {r["key"] for rows in jny.suggestions(p, [], PROGRAMS, TODAY).values() for r in rows}
    assert "proto-incorporate" not in keys(base)  # already incorporated
    assert "proto-incorporate" in keys({**base, "incorporated": False}) and "proto-incorporate" in keys({**base, "incorporated": None})
    assert "rev-sred" not in keys(base) and "rev-sred" in keys({**base, "needs": ["rd"]})
    assert "idea-youth" not in keys(base) and "idea-youth" in keys({**base, "age": 24})


def test_matching_programs_are_suggested_as_things_to_apply_to_in_the_current_stage():
    sug = jny.suggestions({"stage": "launched", "needs": ["funding"], "sectors": ["tech"], "incorporated": True, "province": "ON"}, [], PROGRAMS, TODAY)
    progs = [r for r in sug["launched"] if r["key"].startswith("prog:")]
    assert 1 <= len(progs) <= 3
    assert all(r["program_id"] and r["title"].split()[0] in ("Apply", "Explore") and r["why"] for r in progs)
    core = [i for i, r in enumerate(sug["launched"]) if r["core"]]
    first_prog = next(i for i, r in enumerate(sug["launched"]) if r["key"].startswith("prog:"))
    assert max(core) < first_prog  # the milestones that matter most come first, then the programs
    # once on the plan, a suggestion is not offered again
    have = [{"key": progs[0]["key"], "id": "j-1"}]
    again = jny.suggestions({"stage": "launched", "needs": ["funding"], "sectors": ["tech"], "incorporated": True, "province": "ON"}, have, PROGRAMS, TODAY)
    assert progs[0]["key"] not in {r["key"] for r in again["launched"]}


# ---- the API ------------------------------------------------------------------------------------------------------------------------

def test_the_journey_round_trips_on_the_account():
    with TestClient(server.app) as c:
        assert c.get("/api/navigator/journey").status_code in (401, 403)
        r = c.post("/api/hub/signup", json={"accepted_terms": True, "email": "journey-nav@example.com", "password": "Sup3rSecret!", "name": "Journey"})
        assert r.status_code == 201, r.text
        c.patch("/api/hub/profile", json={"startup": {"name": "J", "stage": "prototype", "needs": ["funding"], "incorporated": False}})
        j = c.get("/api/navigator/journey").json()
        assert j["current"] == "prototype" and j["milestones"] == [] and j["summary"]["total"] == 0
        keys = {s["key"] for s in j["suggestions"]["prototype"]}
        assert "proto-incorporate" in keys
        first = next(s for s in j["suggestions"]["prototype"] if s["key"] == "proto-incorporate")
        j = c.post("/api/navigator/journey", json={"op": "add", "title": first["title"], "stage": first["stage"], "key": first["key"]}).json()
        assert len(j["milestones"]) == 1 and "proto-incorporate" not in {s["key"] for s in j["suggestions"]["prototype"]}
        mid = j["milestones"][0]["id"]
        j = c.post("/api/navigator/journey", json={"op": "update", "id": mid, "status": "done"}).json()
        assert j["summary"]["done"] == 1 and j["summary"]["recent"][0]["id"] == mid
        assert c.post("/api/navigator/journey", json={"op": "update", "id": "nope", "status": "done"}).status_code == 400
        assert c.post("/api/navigator/journey", json={"op": "add", "title": "x"}).status_code == 400
        # it follows the person into Home
        home = c.get("/api/navigator/home").json()
        assert home["journey"]["done"] == 1 and home["journey"]["current"] == "prototype"
        j = c.post("/api/navigator/journey", json={"op": "remove", "id": mid}).json()
        assert j["milestones"] == []


# ---- the browser copy gives the same answers ------------------------------------------------------------------------------------------

def _cases():
    rnd = random.Random(11)
    out = []
    for stage in nav.STAGES:
        for inc in (True, False, None):
            profile = {"stage": stage, "province": "ON", "incorporated": inc, "needs": rnd.sample(nav.NEEDS, rnd.randint(0, 3)), "sectors": rnd.sample(nav.SECTORS, rnd.randint(0, 2)),
                       "audiences": rnd.sample(["black", "women", "youth"], rnd.randint(0, 2)), "age": rnd.choice([None, 24, 41])}
            ops = []
            for _ in range(rnd.randint(4, 12)):
                ops.append({"op": "add", "title": rnd.choice(["Ship it", "  Call  the bank ", "x", "Write the plan"]), "stage": rnd.choice(nav.STAGES + ["bogus"]),
                            "status": rnd.choice(["todo", "doing", "done", None]), "due": rnd.choice(["", "2026-10-01", "2026-10-30", "2026-12-15", "bad"]), "key": rnd.choice(["", "", "k1", "k2"])})
            for _ in range(rnd.randint(2, 6)):
                ops.append({"op": "update", "id": f"j-{rnd.randint(1, 9)}", **rnd.choice([{"status": "done"}, {"status": "doing"}, {"status": "todo"}, {"due": "2026-11-02"}, {"note": " a  note "}, {"stage": "growth"}, {"status": "nope"}])})
            ops.append({"op": "remove", "id": f"j-{rnd.randint(1, 9)}"})
            ops.append({"op": "add_many", "items": [{"title": "Alpha one", "key": "a1"}, {"title": "Beta two", "key": "a1"}, {"title": "Gamma", "stage": "revenue"}]})
            out.append({"profile": profile, "ops": ops})
    return out


@pytest.mark.skipif(not shutil.which("node"), reason="node is not installed")
def test_python_and_javascript_journeys_agree():
    cases = _cases()
    templates = jny.load_templates()
    js_dir = ROOT / "frontend" / "src" / "lib"
    with tempfile.TemporaryDirectory() as tmp:
        shutil.copy(js_dir / "navigator.js", Path(tmp) / "navigator.mjs")
        (Path(tmp) / "journey.mjs").write_text((js_dir / "journey.js").read_text().replace('from "./navigator"', 'from "./navigator.mjs"'))
        (Path(tmp) / "run.mjs").write_text(
            "import * as j from './journey.mjs';\nimport fs from 'fs';\n"
            "const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));\n"
            "const out = d.cases.map((c) => {\n"
            "  let n = 0; const nid = () => `j-${++n}`; let items = []; const errors = [];\n"
            "  for (const op of c.ops) { try { items = j.updateJourney(items, op, c.profile.stage, d.today, nid); } catch (e) { errors.push(e.message); } }\n"
            "  return { items, errors, summary: j.journeySummary(items, c.profile.stage, d.today), sug: j.journeySuggestions(c.profile, items, d.programs, d.today, d.templates) };\n"
            "});\nprocess.stdout.write(JSON.stringify(out));\n")
        (Path(tmp) / "in.json").write_text(json.dumps({"cases": cases, "programs": PROGRAMS, "templates": templates, "today": TODAY.isoformat()}))
        res = subprocess.run(["node", str(Path(tmp) / "run.mjs"), str(Path(tmp) / "in.json")], capture_output=True, text=True, timeout=120)
        assert res.returncode == 0, res.stderr
        js = json.loads(res.stdout)
    assert len(js) == len(cases)
    for case, got in zip(cases, js):
        nid = ids()
        items, errors = [], []
        for op in case["ops"]:
            body = {k: v for k, v in op.items() if v is not None}
            try:
                items = jny.update_journey(items, body, case["profile"]["stage"], TODAY, nid)
            except ValueError as exc:
                errors.append(str(exc))
        want = {"items": items, "errors": errors, "summary": jny.summary(items, case["profile"]["stage"], TODAY),
                "sug": jny.suggestions(case["profile"], items, PROGRAMS, TODAY, templates)}
        want = json.loads(json.dumps(want))
        assert got == want, f"journey differs for {case['profile']}"
