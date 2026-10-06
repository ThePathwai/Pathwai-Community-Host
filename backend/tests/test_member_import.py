"""CSV member import: incomplete rows still become members, duplicates are skipped, dry runs write nothing,
and imported people can claim their account only through a set-password link."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"

import pytest
from fastapi.testclient import TestClient

import server


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


def login(c, email, pw="Demo123!"):
    c.post("/api/auth/logout")
    assert c.post("/api/auth/login", json={"email": email, "password": pw}).status_code == 200


CSV = """Full Name,E-mail,Mobile,Job Title,Skills,Favourite colour
Ada Okafor,ada.import@example.com,+1 416 555 0101,Founder,Product; Fundraising,blue
,sam.lee.import@example.com,,,,
Priya N.,,,Designer,,
Marcus Bell,not-an-email,,,,
ADA OKAFOR,ADA.IMPORT@example.com,,,,
,,,,,
demo@yourcommunity.app,demo@yourcommunity.app,,,,
"""


def test_only_admins_can_import(c):
    login(c, "demo@yourcommunity.app")
    assert c.post("/api/admin/members/import", json={"csv": CSV}).status_code == 403


def test_dry_run_previews_without_writing(c):
    login(c, "admin@yourcommunity.app")
    r = c.post("/api/admin/members/import", json={"csv": CSV, "dry_run": True})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["dry_run"] and d["created"] == 4 and d["skipped"] == 2 and d["without_email"] == 2
    assert "Favourite colour" in d["columns_ignored"]
    by = {x["line"]: x for x in d["rows"]}
    assert by[3]["name"] == "Sam Lee Import" and any("made from the email" in n for n in by[3]["notes"])  # name taken from the email
    assert by[4]["email"] == "" and any("no email" in n for n in by[4]["notes"])
    assert by[5]["email"] == "" and any("valid email" in n for n in by[5]["notes"])
    assert by[6]["status"] == "skipped" and "twice" in by[6]["reason"]
    assert by[8]["status"] == "skipped" and "already" in by[8]["reason"]
    assert all("link" not in x for x in d["rows"])
    # nothing was written
    assert not [u for u in c.get("/api/users", params={"q": "Okafor"}).json()]


def test_import_needs_permission_tick(c):
    login(c, "admin@yourcommunity.app")
    r = c.post("/api/admin/members/import", json={"csv": CSV, "dry_run": False})
    assert r.status_code == 400 and "permission" in r.json()["detail"]


def test_import_creates_incomplete_profiles_and_claim_links_work(c):
    login(c, "admin@yourcommunity.app")
    r = c.post("/api/admin/members/import", json={"csv": CSV, "dry_run": False, "confirm_permission": True})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["created"] == 4 and d["skipped"] == 2 and d["emailed"] == 0 and d["email_configured"] is False
    ada = next(x for x in d["rows"] if x["email"] == "ada.import@example.com")
    assert ada["link"].startswith("http") and "/reset-password?token=" in ada["link"]
    assert not any("link" in x for x in d["rows"] if not x["email"])  # no email, no link
    # they're in the directory with whatever data the file had
    found = c.get("/api/users", params={"q": "Okafor"}).json()
    assert found and found[0]["title"] == "Founder" and found[0]["skill_set"] == ["Product", "Fundraising"]
    assert found[0].get("password_hash") is None
    assert any(u["name"] == "Priya N." for u in c.get("/api/users", params={"q": "Priya"}).json())
    assert any(u["name"] == "Unnamed member" or u["name"] == "Marcus Bell" for u in c.get("/api/users", params={"q": "Marcus"}).json())
    # running it again skips everyone with an email (no duplicates)
    again = c.post("/api/admin/members/import", json={"csv": CSV, "dry_run": False, "confirm_permission": True}).json()
    assert again["created"] == 2 and again["without_email"] == 2  # only the two email-less rows are new people each time
    # the imported member can't sign in with a guess, but the link lets them set a password and sign in
    c.post("/api/auth/logout")
    assert c.post("/api/auth/login", json={"email": "ada.import@example.com", "password": "Whatever-123456"}).status_code == 401
    token = ada["link"].split("token=")[1]
    assert c.post("/api/auth/reset-password", json={"token": token, "password": "Brand-New-Pass-77"}).status_code == 200
    r = c.post("/api/auth/login", json={"email": "ada.import@example.com", "password": "Brand-New-Pass-77"})
    assert r.status_code == 200 and r.json()["user"]["name"] == "Ada Okafor"


def test_headerless_and_semicolon_files(c):
    login(c, "admin@yourcommunity.app")
    r = c.post("/api/admin/members/import", json={"csv": "Zed Zulu,zed.zulu@example.com\nYan Yu,yan.yu@example.com\n"})
    assert r.json()["created"] == 2
    r = c.post("/api/admin/members/import", json={"csv": "nom;courriel;ville\nx;;\n"})
    assert r.status_code == 400  # no recognisable name/email column
    r = c.post("/api/admin/members/import", json={"csv": "name;email;city\nSemi Colon;semi.colon@example.com;Ottawa\n"})
    assert r.json()["created"] == 1 and r.json()["rows"][0]["status"] == "will_create"


def test_empty_and_oversized_files_are_refused(c):
    login(c, "admin@yourcommunity.app")
    assert c.post("/api/admin/members/import", json={"csv": "   \n"}).status_code == 400
    assert c.post("/api/admin/members/import", json={"csv": "name,email\n"}).status_code == 400
    big = "name,email\n" + "\n".join(f"P{i},p{i}@big.example.com" for i in range(1001))
    assert c.post("/api/admin/members/import", json={"csv": big}).status_code == 413


def test_placeholder_emails_stay_out_of_admin_lists_and_blasts(c):
    login(c, "admin@yourcommunity.app")
    rows = c.get("/api/admin/membership-requests", params={"status": "approved"}).json()["requests"]
    assert not any("no-email.invalid" in (r["email"] or "") for r in rows)
    assert any(r["name"] == "Priya N." and r["email"] is None for r in rows)
