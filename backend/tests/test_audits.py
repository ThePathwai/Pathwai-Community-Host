import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
import pytest
from fastapi.testclient import TestClient
import server
import audit_report

KINDS = ["community_pulse", "cohort_progress", "founder_needs", "hiring_signals", "upcoming_moments", "directory_snapshot"]


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


def admin(c):
    r = c.post("/api/auth/login", json={"email": "admin@yourcommunity.app", "password": "Demo123!"})
    assert r.status_code == 200, r.text


def test_catalogue_matches_kinds(c):
    assert [a["kind"] for a in c.get("/api/admin/audits").json()["audits"]] == KINDS


def test_each_audit_returns_real_numbers_without_an_ai_key(c, monkeypatch):
    for k in ("OPENAI_API_KEY", "EMERGENT_LLM_KEY", "LLM_BASE_URL"):
        monkeypatch.delenv(k, raising=False)
    admin(c)
    for kind in KINDS:
        r = c.post(f"/api/admin/audits/{kind}", json={})
        assert r.status_code == 200, (kind, r.text)
        d = r.json()
        assert d["kind"] == kind and d["tiles"] and d["insights"], kind
        assert d["stats"] == d["tiles"] and d["narrative"] is None
        assert all(t["value"] != "" for t in d["tiles"])


def test_numbers_match_the_database(c):
    admin(c)
    pulse = c.post("/api/admin/audits/community_pulse", json={}).json()
    members = next(t for t in pulse["tiles"] if t["label"] == "Members")["value"]
    assert int(members) == c.get("/api/admin/overview").json()["members"]


def test_pdf_download_all_and_single(c):
    admin(c)
    r = c.get("/api/admin/audits-report.pdf")
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert r.content[:5] == b"%PDF-" and len(r.content) > 8000
    assert "attachment" in r.headers["content-disposition"] and r.headers["content-disposition"].endswith('.pdf"')
    one = c.get("/api/admin/audits-report.pdf?kind=founder_needs")
    assert one.status_code == 200 and one.content[:5] == b"%PDF-" and len(one.content) < len(r.content)


def test_unknown_kind_and_permissions(c):
    admin(c)
    assert c.post("/api/admin/audits/nope", json={}).status_code == 400
    assert c.get("/api/admin/audits-report.pdf?kind=nope").status_code == 400
    c.post("/api/auth/logout")
    assert c.get("/api/admin/audits-report.pdf").status_code == 401
    r = c.post("/api/auth/login", json={"email": "demo@yourcommunity.app", "password": "Demo123!"})
    assert r.status_code == 200
    assert c.get("/api/admin/audits-report.pdf").status_code == 403
    assert c.post("/api/admin/audits/community_pulse", json={}).status_code == 403


def test_non_latin_names_do_not_break_the_pdf():
    import asyncio, audit_pdf
    sec = {"kind": "community_pulse", "title": "Community pulse", "subtitle": "x", "tiles": [{"label": "Members", "value": "2", "note": "", "accent": True}],
           "charts": [{"type": "hbar", "title": "Chart", "items": [{"label": "Ọláwálé 王 Émilie", "value": 2}]}, {"type": "table", "title": "T", "columns": ["A", "B"], "rows": [["<b>&", "名前"]]}], "insights": ["Ünïcode ✓ ok"]}
    pdf = audit_pdf.build_pdf({"community": "Ìlú 王", "generated_at": "2026-10-14T10:00:00+00:00", "headline": [{"label": "Members", "value": "2"}], "sections": [sec]}, {})
    assert pdf[:5] == b"%PDF-"


def test_empty_community_still_renders():
    import audit_pdf
    d = {"now": __import__("datetime").datetime.now(__import__("datetime").timezone.utc), "users": [], "events": [], "support": [], "pending_apps": 0, "config": {}}
    secs = [audit_report._section(k, d) for k in KINDS]
    pdf = audit_pdf.build_pdf({"community": "Empty", "generated_at": d["now"].isoformat(), "headline": [{"label": "Members", "value": "0"}], "sections": secs}, {})
    assert pdf[:5] == b"%PDF-"
