"""Merge backend/data/programs_candidates.json into the live catalog.

Run from the repo root:  python3 backend/scripts/merge_programs_candidates.py
Skips any candidate whose id or name is already in the catalog, drops the
internal import_notes field, and refreshes the demo copy the parity test checks.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LIVE = ROOT / "backend" / "data" / "programs_ca.json"
CAND = ROOT / "backend" / "data" / "programs_candidates.json"
DEMO = ROOT / "frontend" / "src" / "preview" / "programs_ca.json"

live = json.loads(LIVE.read_text(encoding="utf-8"))
cand = json.loads(CAND.read_text(encoding="utf-8"))
ids = {p["id"] for p in live["programs"]}
names = {p["name"].lower() for p in live["programs"]}
added = 0
for p in cand["programs"]:
    if p["id"] in ids or p["name"].lower() in names:
        print("skip (already there):", p["name"])
        continue
    p = {k: v for k, v in p.items() if k != "import_notes"}
    live["programs"].append(p)
    added += 1
text = json.dumps(live, indent=1, ensure_ascii=False) + "\n"
LIVE.write_text(text, encoding="utf-8")
DEMO.write_text(text, encoding="utf-8")
print(f"added {added}; catalog now has {len(live['programs'])} programs")
