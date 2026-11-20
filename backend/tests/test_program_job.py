"""The polite page reader: what it stores, what it keeps when a page breaks, and that it obeys robots.txt. No network, no server import."""
import asyncio
from datetime import datetime, timedelta, timezone

import program_job as job
from program_check import merge_check
from safe_fetch import FetchError

NOW = datetime(2026, 11, 20, 12, 0, tzinfo=timezone.utc)
PROG = {"id": "p1", "name": "Acme Grant", "apply_url": "https://acme.example.ca/grant#old", "link_kind": "program", "status": "check", "deadline": {"kind": "none_published", "date": None, "note": ""},
        "requirements": ["Incorporated company in Canada", "Fewer than 50 employees"]}
OTHER = {**PROG, "id": "p2", "name": "Beta Fund", "apply_url": "https://beta.example.ca/fund"}
PAGE = ("<html><head><title>Acme Grant</title></head><body><h1>Acme Grant</h1><h2 id='eligible'>Eligibility</h2><ul><li>Your company must be incorporated in Canada.</li>"
        "<li>You have fewer than 50 employees.</li></ul><p>Applications are accepted on a rolling basis.</p><p>" + "Details about the grant. " * 40 + "</p></body></html>")


class Coll:
    def __init__(self): self.d = {}
    async def find_one(self, q): return dict(self.d[q["id"]]) if q.get("id") in self.d else None
    async def update_one(self, q, u, upsert=False): self.d[q["id"]] = {**self.d.get(q["id"], {}), **u["$set"]}
    async def delete_many(self, q):
        keep = set(q["id"]["$nin"]); self.d = {k: v for k, v in self.d.items() if k in keep}
    def find(self, q):
        rows = list(self.d.values())
        class It:
            def __aiter__(s): s.i = iter(rows); return s
            async def __anext__(s):
                try: return dict(next(s.i))
                except StopIteration: raise StopAsyncIteration
        return It()


class DB:
    def __init__(self): self.program_checks = Coll()


def run(c): return asyncio.run(c)
async def nosleep(_): return None


def fetcher(pages, calls=None):
    async def f(url):
        if calls is not None: calls.append(url)
        v = pages.get(url)
        if isinstance(v, Exception): raise v
        if v is None: raise FetchError("That page does not exist (HTTP 404). The address may have changed.")
        return v
    return f


def test_reads_page_stores_and_merges():
    db, calls = DB(), []
    f = fetcher({"https://acme.example.ca/robots.txt": "User-agent: *\nAllow: /", "https://acme.example.ca/grant": PAGE}, calls)
    res = run(job.refresh_all(db, programs=[PROG], fetch=f, now=NOW, sleep=nosleep))
    assert res == {"checked": 1, "ok": 1}
    assert "https://acme.example.ca/grant" in calls            # the old #fragment is never sent
    chk = db.program_checks.d["p1"]
    m = merge_check(PROG, chk)
    assert m["apply_url"] == "https://acme.example.ca/grant#eligible" and m["status"] == "rolling" and len(m["page_check"]["confirmed"]) == 2


def test_robots_disallow_is_obeyed_and_reported():
    db, calls = DB(), []
    f = fetcher({"https://acme.example.ca/robots.txt": "User-agent: PathwaiProgramBot\nDisallow: /", "https://acme.example.ca/grant": PAGE}, calls)
    run(job.refresh_all(db, programs=[PROG], fetch=f, now=NOW, sleep=nosleep))
    assert "https://acme.example.ca/grant" not in calls
    c = db.program_checks.d["p1"]
    assert c["ok"] is False and "robots" in c["problem"]
    assert merge_check(PROG, c)["apply_url"] == PROG["apply_url"]        # entry left as written


def test_a_broken_page_keeps_the_last_good_reading_then_gives_up():
    db = DB()
    good = fetcher({"https://acme.example.ca/robots.txt": "", "https://acme.example.ca/grant": PAGE})
    run(job.refresh_all(db, programs=[PROG], fetch=good, now=NOW, sleep=nosleep))
    bad = fetcher({"https://acme.example.ca/robots.txt": "", "https://acme.example.ca/grant": FetchError("The site answered with an error (HTTP 500).")})
    t = NOW
    for n in (1, 2):
        t += timedelta(days=2)
        run(job.refresh_all(db, programs=[PROG], fetch=bad, now=t, sleep=nosleep))
        c = db.program_checks.d["p1"]
        assert c["ok"] and c["stale"] and c["fail_count"] == n          # still shows what we last read, marked old
    t += timedelta(days=2)
    run(job.refresh_all(db, programs=[PROG], fetch=bad, now=t, sleep=nosleep))
    assert db.program_checks.d["p1"]["ok"] is False


def test_only_due_pages_are_read_and_the_limit_spreads_the_work():
    db, calls = DB(), []
    pages = {"https://acme.example.ca/robots.txt": "", "https://beta.example.ca/robots.txt": "", "https://acme.example.ca/grant": PAGE, "https://beta.example.ca/fund": PAGE.replace("Acme", "Beta")}
    f = fetcher(pages, calls)
    assert run(job.refresh_all(db, programs=[PROG, OTHER], fetch=f, now=NOW, limit=1, sleep=nosleep))["checked"] == 1
    assert run(job.refresh_all(db, programs=[PROG, OTHER], fetch=f, now=NOW + timedelta(hours=1), limit=1, sleep=nosleep))["checked"] == 1   # the other one
    n = len(calls)
    assert run(job.refresh_all(db, programs=[PROG, OTHER], fetch=f, now=NOW + timedelta(hours=2), sleep=nosleep))["checked"] == 0           # both fresh
    assert len(calls) == n
    assert run(job.refresh_all(db, programs=[PROG, OTHER], fetch=f, now=NOW + timedelta(hours=30), sleep=nosleep))["checked"] == 2           # a day later


def test_summary_lists_what_could_not_be_read():
    db = DB()
    f = fetcher({"https://acme.example.ca/robots.txt": "", "https://acme.example.ca/grant": PAGE})   # beta 404s
    run(job.refresh_all(db, programs=[PROG, OTHER], fetch=f, now=NOW, sleep=nosleep))
    s = job.summarize(run(job.load_checks(db)), [PROG, OTHER])
    assert s["read"] == 1 and s["requirements_confirmed"] == 2 and [p["id"] for p in s["problems"]] == ["p2"]
