"""Apply a reviewed set of timing facts (status and deadline) read from programs' own pages, to both copies of the catalog.

Run from the repo root:  python3 backend/scripts/apply_timing_review.py backend/data/timing_review_2026-11-26.json
Each entry in the review file says what the page stated (`evidence`, a short phrase) and where (`page`). Nothing here guesses a date: an
entry is only in the file when the page said it plainly. The daily page reader (program_check.py) keeps these fresh afterwards, and a
later reading from the page wins over what is written here."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FILES = [ROOT / "backend" / "data" / "programs_ca.json", ROOT / "frontend" / "src" / "preview" / "programs_ca.json"]


def apply(review: dict) -> int:
    changed = 0
    for f in FILES:
        raw = f.read_text(encoding="utf-8")
        data = json.loads(raw)
        by_id = {p["id"]: p for p in data["programs"]}
        for ch in review["changes"]:
            p = by_id[ch["id"]]
            kind = ch["kind"]
            p["status"] = {"fixed": "open", "rolling": "rolling", "closed": "closed", "open": "open"}[kind]
            if kind == "open":
                p["deadline"] = {**p["deadline"], "note": ch.get("note") or p["deadline"].get("note", "")}
            else:
                p["deadline"] = {"kind": kind, "date": ch.get("date"), "note": ch.get("note", "")}
            p["last_checked"] = review["checked"]
            for drop in ch.get("drop_unconfirmed", []):
                p["unconfirmed"] = [x for x in p.get("unconfirmed", []) if x != drop]
                if not p["unconfirmed"]:
                    p.pop("unconfirmed", None)
            changed += 1
        f.write_text(json.dumps(data, indent=1, ensure_ascii=False) + ("\n" if raw.endswith("\n") else ""), encoding="utf-8")
    return changed // len(FILES)


if __name__ == "__main__":
    print("updated", apply(json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))), "programs")
