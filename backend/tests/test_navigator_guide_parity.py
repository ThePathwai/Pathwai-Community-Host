"""The guide exists twice: backend/navigator_guide.py (the real site) and frontend/src/lib/navigatorGuide.js (the in-browser
demo). Same questions, same profiles, same words out. Skipped when node is not installed."""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest

import navigator as nav
import navigator_guide as g
from tests.test_navigator_parity import COMMUNITIES

ROOT = Path(__file__).resolve().parents[2]
LIB = ROOT / "frontend" / "src" / "lib"
TODAY = "2026-10-27"

QUESTIONS = [
    "What should I do next?", "When does IRAP close?", "Am I eligible for belf?", "compare sred and irap", "what's closing soon", "grants for me", "any mentors?",
    "which communities fit me", "what do you know about me", "tell me about the startup visa", "how much is canexport", "hello", "blah blah", "what about it?",
    "when does ovin close", "what's the deadline?", "am I eligible?", "I need export help", "loans", "accelerators in toronto", "how much?", "hiring and talent",
    "tax credits", "how do I introduce my product", "Futurpreneur newcomer requirements", "mitacs vs velocity", "do I qualify for the women entrepreneurship fund",
    "immigration help", "where do I start", "what can you do", "R&D money", "pitch competitions",
]
PROFILES = [
    {"stage": "launched", "needs": ["funding", "customers"], "sectors": ["tech"], "incorporated": True, "province": "ON", "city": "Toronto", "age": 31},
    {"stage": "idea", "needs": [], "audiences": ["black", "student"], "age": 22, "incorporated": False, "province": "ON"},
    {"stage": "growth", "needs": ["export", "talent", "rd"], "sectors": ["cleantech"], "incorporated": True, "province": "BC", "employees": 30},
    {},
]
FOCI = [None, "ovin-rd", "belf", "irap"]
STARTUPS = [{"name": "Bright Court", "stage": "launched"}, {}, {"stage": "idea", "needs": ["funding"], "sectors": ["tech"], "incorporated": False, "goal": "x"}]
ACCOUNTS = [{"age": 31, "location": "Toronto, ON"}, {}, None]


@pytest.mark.skipif(not shutil.which("node"), reason="node is not installed")
def test_python_and_javascript_guides_agree():
    programs = nav.load_catalog()["programs"]
    combos = []
    for i, q in enumerate(QUESTIONS):
        for j, prof in enumerate(PROFILES):
            combos.append({"q": q, "profile": prof, "focus": FOCI[(i + j) % 4], "startup": STARTUPS[(i + j) % 3], "account": ACCOUNTS[(i + j) % 3]})
    accounts = [
        {"age": 31, "location": "Toronto, ON", "startup": nav.clean_startup({"name": "Lumen", "stage": "launched", "needs": ["funding", "rd"], "sectors": ["cleantech"], "incorporated": True})},
        {"startup": nav.clean_startup({"stage": "idea", "needs": ["funding"]}), "nav_seen": ["irap"]},
        {"startup": {}}, None,
    ]
    with tempfile.TemporaryDirectory() as tmp:
        shutil.copy(LIB / "navigator.js", Path(tmp) / "navigator.mjs")
        guide = (LIB / "navigatorGuide.js").read_text().replace('from "./navigator"', 'from "./navigator.mjs"')
        (Path(tmp) / "guide.mjs").write_text(guide)
        (Path(tmp) / "run.mjs").write_text(
            "import * as G from './guide.mjs';\nimport fs from 'fs';\n"
            "const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));\n"
            "const ans = d.combos.map(c => { const r = G.answer(c.q, d.programs, d.communities, c.profile, d.today, c.focus, c.startup, c.account); return { reply: r.reply, intent: r.intent, focus: r.focus, cards: r.cards.map(x => x.id) }; });\n"
            "const homes = d.accounts.map(a => G.homeFeed(d.programs, d.communities, a, d.today));\n"
            "process.stdout.write(JSON.stringify({ ans, homes }));\n")
        (Path(tmp) / "in.json").write_text(json.dumps({"combos": combos, "programs": programs, "communities": COMMUNITIES, "today": TODAY, "accounts": accounts}))
        res = subprocess.run(["node", str(Path(tmp) / "run.mjs"), str(Path(tmp) / "in.json")], capture_output=True, text=True, timeout=120)
        assert res.returncode == 0, res.stderr
        js = json.loads(res.stdout)

    today = date.fromisoformat(TODAY)
    assert len(js["ans"]) == len(combos) > 100
    for c, got in zip(combos, js["ans"]):
        want = g.answer(c["q"], programs, COMMUNITIES, c["profile"], today, focus=c["focus"], startup=c["startup"], account=c["account"])
        assert got["reply"] == want["reply"], f"reply differs for {c}\n js: {got['reply']}\n py: {want['reply']}"
        assert (got["intent"], got["focus"], got["cards"]) == (want["intent"], want["focus"], [x["id"] for x in want["cards"]]), f"shape differs for {c}"
    for a, got in zip(accounts, js["homes"]):
        want = json.loads(json.dumps(g.home_feed(programs, COMMUNITIES, a, today)))
        assert got["has_profile"] == want["has_profile"] and got["completeness"] == want["completeness"], a
        if want["has_profile"]:
            ids = lambda xs: [x["id"] for x in xs]
            assert (got["summary"], ids(got["top"]), ids(got["closing_soon"]), got["new_ids"], got["live_ids"], got["startup"]) == (want["summary"], ids(want["top"]), ids(want["closing_soon"]), want["new_ids"], want["live_ids"], want["startup"])
            assert [c["slug"] for c in got["communities"]] == [c["slug"] for c in want["communities"]]
