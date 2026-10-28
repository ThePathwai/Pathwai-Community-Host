"""Your path: the resources worth using for what a founder wants next. Rules in navigator.route_plan (twin: routePlan in navigator.js)."""
import json
import os
import random
import shutil
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"
os.environ.pop("EMERGENT_LLM_KEY", None)

import pytest
from fastapi.testclient import TestClient

import navigator as nav
import server

TODAY = date(2026, 10, 27)
ROOT = Path(__file__).resolve().parents[2]
PROGRAMS = nav.load_catalog()["programs"]
PROFILE = {"stage": "launched", "province": "ON", "needs": ["funding", "mentorship", "customers"], "sectors": ["tech"], "incorporated": True, "goal": "Land our first pilot sites"}


def test_one_step_per_thing_the_founder_wants_in_the_order_they_chose():
    r = nav.route_plan(PROGRAMS, PROFILE, [], TODAY)
    assert [s["need"] for s in r["steps"]] == ["funding", "mentorship", "customers"]
    assert r["goal"] == "Land our first pilot sites" and r["next"] == "revenue" and r["stage"] == "launched"
    assert all(s["title"].startswith("To get ") for s in r["steps"])


def test_every_resource_helps_with_what_it_is_listed_under_and_is_shown_once():
    r = nav.route_plan(PROGRAMS, PROFILE, [], TODAY)
    seen = []
    for s in r["steps"]:
        assert len(s["resources"]) <= nav.ROUTE_PER_GOAL + 1
        for x in s["resources"]:
            assert s["need"] in x["needs"] and x["fit"] in ("strong", "possible")
            assert x["apply_url"].startswith("https://") and x["link_note"] and x["checks"]
            seen.append(x["id"])
    assert len(seen) == len(set(seen)) and len(seen) >= 4


def test_nothing_the_founder_cannot_apply_to_is_suggested():
    r = nav.route_plan(PROGRAMS, {**PROFILE, "province": "BC", "age": 52}, [], TODAY)
    ids = {x["id"] for s in r["steps"] for x in s["resources"]} | {x["id"] for x in (r["coming_up"] or {"programs": []})["programs"]}
    assert "besp" not in ids and "dmz-bip" not in ids and "futurpreneur-core" not in ids and "alberta-catalyzer" not in ids


def test_open_resources_come_before_closed_ones():
    r = nav.route_plan(PROGRAMS, PROFILE, [], TODAY)
    for s in r["steps"]:
        states = [x["status"] in ("closed", "paused") for x in s["resources"]]
        assert states == sorted(states)


def test_what_you_are_in_comes_first_and_what_you_finished_is_left_out():
    base = nav.route_plan(PROGRAMS, PROFILE, [], TODAY)
    funding = base["steps"][0]["resources"]
    assert len(funding) >= 2
    last, first = funding[-1], funding[0]
    r = nav.route_plan(PROGRAMS, PROFILE, [{"id": last["id"], "state": "in"}, {"id": first["id"], "state": "done"}], TODAY)
    ids = [x["id"] for x in r["steps"][0]["resources"]]
    assert first["id"] not in ids
    if last["status"] in ("open", "rolling", "check"):
        assert ids[0] == last["id"] and r["steps"][0]["resources"][0]["mine"] == "in"


def test_the_next_stage_is_previewed_and_the_top_stage_has_none():
    r = nav.route_plan(PROGRAMS, PROFILE, [], TODAY)
    assert r["coming_up"]["stage"] == "revenue" and len(r["coming_up"]["programs"]) <= nav.ROUTE_COMING_UP
    used = {x["id"] for s in r["steps"] for x in s["resources"]}
    assert not used & {x["id"] for x in r["coming_up"]["programs"]}
    top = nav.route_plan(PROGRAMS, {**PROFILE, "stage": "growth"}, [], TODAY)
    assert top["coming_up"] is None and top["next"] is None


def test_without_choices_it_offers_the_likely_ones_for_the_stage():
    r = nav.route_plan(PROGRAMS, {"stage": "idea", "needs": []}, [], TODAY)
    assert r["steps"] == []
    common = [o["key"] for o in r["options"] if o["common"]]
    assert set(common) == set(nav.STAGE_GOALS["idea"]) and len(r["options"]) == len(nav.NEEDS)


def test_the_route_endpoint_follows_the_profile_and_tracking():
    with TestClient(server.app) as c:
        assert c.get("/api/navigator/route").status_code in (401, 403)
        assert c.post("/api/hub/signup", json={"accepted_terms": True, "email": "route-nav@example.com", "password": "Sup3rSecret!", "name": "Route"}).status_code == 201
        c.patch("/api/hub/profile", json={"startup": {"name": "R", "stage": "prototype", "needs": ["funding"], "incorporated": True}})
        r = c.get("/api/navigator/route").json()
        assert r["has_profile"] and [s["need"] for s in r["steps"]] == ["funding"] and r["steps"][0]["resources"]
        pick = r["steps"][0]["resources"][0]
        t = c.post("/api/navigator/track", json={"id": pick["id"], "name": pick["name"], "org": pick["org"], "type": pick["type"], "state": "done"}).json()
        assert t["tracked"]
        again = c.get("/api/navigator/route").json()
        assert pick["id"] not in [x["id"] for x in again["steps"][0]["resources"]] and again["tracked"][0]["id"] == pick["id"]
        c.patch("/api/hub/profile", json={"startup": {"name": "R", "stage": "prototype", "needs": ["funding", "space"], "incorporated": True}})
        assert [s["need"] for s in c.get("/api/navigator/route").json()["steps"]] == ["funding", "space"]


@pytest.mark.skipif(not shutil.which("node"), reason="node is not installed")
def test_python_and_javascript_routes_agree():
    rnd = random.Random(5)
    cases = []
    for stage in nav.STAGES:
        for k in range(8):
            needs = rnd.sample(nav.NEEDS, rnd.randint(0, 4))
            prof = {"stage": stage, "province": rnd.choice(["ON", "BC", "AB", "QC"]), "needs": needs, "sectors": rnd.sample(nav.SECTORS, rnd.randint(0, 2)),
                    "audiences": rnd.sample(["black", "women", "youth", "newcomer"], rnd.randint(0, 2)), "age": rnd.choice([None, 24, 41]),
                    "incorporated": rnd.choice([True, False, None]), "goal": rnd.choice(["", "Grow"])}
            tracked = [{"id": p["id"], "state": rnd.choice(["in", "done"])} for p in rnd.sample(PROGRAMS, rnd.randint(0, 5))]
            cases.append({"profile": prof, "tracked": tracked})
    js_dir = ROOT / "frontend" / "src" / "lib"
    with tempfile.TemporaryDirectory() as tmp:
        shutil.copy(js_dir / "navigator.js", Path(tmp) / "navigator.mjs")
        (Path(tmp) / "run.mjs").write_text(
            "import * as n from './navigator.mjs';\nimport fs from 'fs';\n"
            "const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));\n"
            "process.stdout.write(JSON.stringify(d.cases.map((c) => n.routePlan(d.programs, c.profile, c.tracked, d.today))));\n")
        (Path(tmp) / "in.json").write_text(json.dumps({"cases": cases, "programs": PROGRAMS, "today": TODAY.isoformat()}))
        res = subprocess.run(["node", str(Path(tmp) / "run.mjs"), str(Path(tmp) / "in.json")], capture_output=True, text=True, timeout=120)
        assert res.returncode == 0, res.stderr
        js = json.loads(res.stdout)
    assert len(js) == len(cases) == 40
    for case, got in zip(cases, js):
        want = json.loads(json.dumps(nav.route_plan(PROGRAMS, case["profile"], case["tracked"], TODAY)))
        assert got == want, f"route differs for {case['profile']}"
