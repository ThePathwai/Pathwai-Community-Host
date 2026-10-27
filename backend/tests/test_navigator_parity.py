"""The Navigator's matching rules exist twice: backend/navigator.py (the real site) and
frontend/src/lib/navigator.js (the in-browser demo). They must give the same answers. This runs both on the same
profiles and compares everything a person sees. Skipped when node is not installed."""
import itertools
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest

import navigator as nav

ROOT = Path(__file__).resolve().parents[2]
JS = ROOT / "frontend" / "src" / "lib" / "navigator.js"
TODAY = "2026-10-27"


def cases():
    out = []
    stages = nav.STAGES
    needs = [[], ["funding"], ["mentorship", "network"], ["export", "customers", "funding"], ["rd", "ip", "tax", "talent"]]
    auds = [[], ["women"], ["black"], ["indigenous", "student"], ["newcomer"]]
    for i, (st, nd, au) in enumerate(itertools.product(stages, needs, auds)):
        out.append({
            "stage": st, "needs": nd, "audiences": au,
            "age": [None, 19, 27, 35, 44][i % 5], "province": ["ON", "BC", "ON", "QC", "ON"][i % 5],
            "sectors": [[], ["tech"], ["hardware", "mobility"], ["food"], ["health", "cleantech"]][(i // 3) % 5],
            "incorporated": ["yes", "no", None, "unsure", "yes"][i % 5], "employees": [None, 1, 8, 120, 600][(i // 2) % 5],
            "city": ["", "Toronto", "toronto", "Ottawa", ""][i % 5], "student": i % 7 == 0,
        })
    out += [{}, {"stage": "wizard", "age": "x"}, {"stage": "growth", "employees": "12", "age": "30"}]
    return out


COMMUNITIES = [
    {"slug": "a", "name": "A Hub", "kind": "k", "tagline": "t", "members": 10, "program_count": 2, "navigator": {"stages": ["idea", "prototype"], "provides": ["mentorship", "network"], "audiences": ["black"], "sectors": ["tech"], "city": "Toronto", "provinces": ["ON"], "blurb": "b"}},
    {"slug": "b", "name": "B Hub", "kind": "k", "tagline": "t", "members": 5, "program_count": 0, "navigator": {"stages": ["revenue"], "provides": ["funding"], "audiences": [], "sectors": [], "city": "", "provinces": ["BC"]}},
]


@pytest.mark.skipif(not shutil.which("node"), reason="node is not installed")
def test_python_and_javascript_rules_agree():
    programs = nav.load_catalog()["programs"]
    cs = cases()
    with tempfile.TemporaryDirectory() as tmp:
        mjs = Path(tmp) / "navigator.mjs"
        shutil.copy(JS, mjs)
        runner = Path(tmp) / "run.mjs"
        runner.write_text(
            "import * as n from './navigator.mjs';\nimport fs from 'fs';\n"
            "const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));\n"
            "const out = d.cases.map(c => ({ s: n.suggest(d.programs, c, d.today), c: n.rankCommunities(d.communities, c) }));\n"
            "process.stdout.write(JSON.stringify(out));\n"
        )
        data = Path(tmp) / "in.json"
        data.write_text(json.dumps({"cases": cs, "programs": programs, "communities": COMMUNITIES, "today": TODAY}))
        res = subprocess.run(["node", str(runner), str(data)], capture_output=True, text=True, timeout=120)
        assert res.returncode == 0, res.stderr
        js = json.loads(res.stdout)

    def shape(r):
        rows = lambda xs: [(x["id"], x["fit"], x["score"], x["status"], x["reasons"], x["cautions"]) for x in xs]
        return {"matches": rows(r["matches"]), "more": rows(r["more"]), "later": rows(r["later"]), "skipped": r["skipped"], "path": r["path"], "summary": r["summary"], "profile": r["profile"]}

    today = date.fromisoformat(TODAY)
    assert len(js) == len(cs) > 100
    for case, got in zip(cs, js):
        want = nav.suggest(programs, case, today)
        want = json.loads(json.dumps(want))
        assert shape(got["s"]) == shape(want), f"rules differ for {case}"
        wc = [(x["slug"], x["score"], x["reasons"]) for x in nav.rank_communities(COMMUNITIES, case)]
        gc = [(x["slug"], x["score"], x["reasons"]) for x in got["c"]]
        assert gc == wc, f"community ranking differs for {case}"


def test_the_demo_catalog_copy_matches_the_real_one():
    real = (ROOT / "backend" / "data" / "programs_ca.json").read_text(encoding="utf-8")
    demo = (ROOT / "frontend" / "src" / "preview" / "programs_ca.json").read_text(encoding="utf-8")
    assert json.loads(real) == json.loads(demo), "copy backend/data/programs_ca.json to frontend/src/preview/programs_ca.json"
