"""Sort the loose lines in every catalog entry's `requirements` (see backend/catalog_clean.py), in both copies of the catalog.

Run from the repo root:  python3 backend/scripts/clean_requirements.py          (writes both files)
                         python3 backend/scripts/clean_requirements.py --check  (changes nothing; exits 1 if a file is not sorted yet)
Safe to run any time, including after merge_programs_candidates.py: an already sorted catalog comes out unchanged."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
import catalog_clean as cc  # noqa: E402

FILES = [ROOT / "backend" / "data" / "programs_ca.json", ROOT / "frontend" / "src" / "preview" / "programs_ca.json"]


def main(check: bool = False) -> int:
    dirty = 0
    for f in FILES:
        raw = f.read_text(encoding="utf-8")
        data = json.loads(raw)
        data["programs"] = [cc.clean_entry(p) for p in data["programs"]]
        out = json.dumps(data, indent=1, ensure_ascii=False) + ("\n" if raw.endswith("\n") else "")
        if out != raw:
            dirty += 1
            print(("needs sorting: " if check else "sorted: ") + str(f.relative_to(ROOT)))
            if not check:
                f.write_text(out, encoding="utf-8")
    return 1 if (check and dirty) else 0


if __name__ == "__main__":
    sys.exit(main("--check" in sys.argv))
