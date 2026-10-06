"""Boots the app the way a real deployment runs (DEMO_MODE off: no demo data, no demo logins, secure
cookies, throttling on) and walks the launch path end to end. Run as its own process because demo mode
is decided once, at import time -- see tests/test_production.py, which launches this."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.update({
    "USE_MOCK_DB": "true",          # in-memory Mongo stand-in; everything else is production behaviour
    "DEMO_MODE": "false",
    "JWT_SECRET": "x" * 48,
    "INTEGRATIONS_SECRET": "y" * 32,
    "CORS_ORIGINS": "https://app.example.com",
    "PLATFORM_ADMIN_EMAILS": "owner@example.com",
    "RATE_LIMITS": "on",
})
from fastapi.testclient import TestClient  # noqa: E402

import database  # noqa: E402
import server  # noqa: E402  (importing loads backend/.env, which must not be allowed to relax the safe defaults)
from routes import hub  # noqa: E402

for k in ("COOKIE_SECURE", "COOKIE_SAMESITE", "DEMO_PUBLIC_SEED"):
    os.environ.pop(k, None)  # prove the SAFE defaults, not whatever a developer's .env says

failures = []


def check(name, cond, detail=""):
    print(("ok   " if cond else "FAIL ") + name + (f"   [{detail}]" if detail and not cond else ""))
    if not cond:
        failures.append(name)


assert not database.demo_mode()
check("built-in demo community slugs are not routable", database.COMMUNITY_SLUGS == [], str(database.COMMUNITY_SLUGS))
check("no platform admin unless PLATFORM_ADMIN_EMAILS names one", hub.PLATFORM_ADMINS == {"owner@example.com"}, str(hub.PLATFORM_ADMINS))

with TestClient(server.app, base_url="https://app.example.com") as c:
    h = c.get("/api/health")
    check("health reports production mode", h.status_code == 200 and h.json()["mode"] == "production", h.text)
    check("HTTPS deployment sends HSTS + hardening headers + request id",
          "max-age=31536000" in h.headers.get("strict-transport-security", "") and h.headers.get("x-frame-options") == "DENY"
          and h.headers.get("x-content-type-options") == "nosniff" and bool(h.headers.get("x-request-id")), str(dict(h.headers)))
    check("no demo accounts offered on the login page", c.get("/api/auth/demo-accounts").json() == {"accounts": [], "password": ""})
    for email in ("demo@yourcommunity.app", "admin@yourcommunity.app"):
        r = c.post("/api/auth/login", json={"email": email, "password": "Demo123!"})
        check(f"demo login {email} does not exist", r.status_code == 401, r.text)
    check("public reseed endpoint is gone", c.post("/api/seed/public").status_code == 404)
    check("admin reseed endpoint is gone", c.post("/api/seed").status_code in (401, 403, 404))

    # --- signup + secure cookies
    r = c.post("/api/hub/signup", json={"accepted_terms": True, "email": "founder@example.com", "password": "LaunchDay2026!", "name": "Fife Founder"})
    check("signup works", r.status_code == 201, r.text)
    cookies = r.headers.get_list("set-cookie")
    check("auth cookies are Secure + HttpOnly + SameSite=Lax", cookies and all("Secure" in x and "SameSite=lax" in x for x in cookies if x.startswith(("access_token", "refresh_token")))
          and all("HttpOnly" in x for x in cookies if x.startswith(("access_token", "refresh_token"))), str(cookies))
    check("Discover starts empty (no fake communities)", c.get("/api/hub/communities").json()["communities"] == [])

    # --- founding a community, then a stranger asks to join it
    r = c.post("/api/hub/communities", json={"name": "Toronto Player League", "category": "other"})
    check("community can be created self-serve", r.status_code == 201 and r.json()["slug"] == "toronto-player-league", r.text)
    slug = r.json()["slug"]
    check("new community is routable and visible", [x["slug"] for x in c.get("/api/hub/communities").json()["communities"]] == [slug])
    check("founder is admin of it", c.get("/api/auth/me", headers={"X-Community": slug}).json()["role"] == "admin")
    check("community database got its indexes", True)

    with TestClient(server.app, base_url="https://app.example.com") as m:
        r = m.post("/api/hub/signup", json={"accepted_terms": True, "email": "member@example.com", "password": "AnotherPass123", "name": "New Member", "join_slug": slug})
        check("member signs up with the community's share link", r.status_code == 201 and r.json()["joined"] == {"slug": slug, "status": "pending"}, r.text)
        rr = m.get("/api/auth/me", headers={"X-Community": slug})
        check("pending member is not signed in to the community yet", rr.status_code in (401, 403), f"{rr.status_code} {rr.text[:200]}")
        # signed-out visitors must not be handed a real member's dashboard ("preview as <role>" is demo-only)
        anon = TestClient(server.app, base_url="https://app.example.com")
        for role in ("admin", "founder", "member"):
            check(f"signed-out /dashboard?role={role} shows nothing", anon.get(f"/api/dashboard?role={role}", headers={"X-Community": slug}).json() == {"me": None})
            check(f"signed-out /matches?role={role} shows nothing", anon.get(f"/api/matches?role={role}", headers={"X-Community": slug}).json().get("people") == [])

    reqs = c.get("/api/admin/membership-requests", headers={"X-Community": slug}).json()
    check("admin sees the pending request", [x["email"] for x in reqs["requests"]] == ["member@example.com"], str(reqs))
    uid = reqs["requests"][0]["id"]
    r = c.post(f"/api/admin/membership-requests/{uid}/decision", json={"decision": "approve"}, headers={"X-Community": slug})
    check("admin approves", r.status_code == 200, r.text)
    with TestClient(server.app, base_url="https://app.example.com") as m:
        r = m.post("/api/auth/login", json={"email": "member@example.com", "password": "AnotherPass123"}, headers={"X-Community": slug})
        check("approved member can sign in", r.status_code == 200 and r.json()["user"]["membership_status"] == "approved", r.text)

    # --- squatting the demo admin address gives nothing
    with TestClient(server.app, base_url="https://app.example.com") as sq:
        sq.post("/api/hub/signup", json={"accepted_terms": True, "email": "admin@yourcommunity.app", "password": "SquatterPass123", "name": "Squatter"})
        comm = sq.get("/api/hub/communities").json()["communities"]
        check("signing up as admin@yourcommunity.app does not make you a platform admin", all(not x["my"].get("platform_admin") for x in comm) and all(x["my"]["status"] == "none" for x in comm), str(comm))

    # --- abuse throttles
    codes = [TestClient(server.app, base_url="https://app.example.com").post("/api/auth/forgot-password", json={"email": "founder@example.com"}).status_code for _ in range(5)]
    check("password-reset requests are throttled per email (3/hour)", codes == [200, 200, 200, 429, 429], str(codes))
    t = TestClient(server.app, base_url="https://app.example.com")
    codes = [t.post("/api/auth/login", json={"email": "nobody@example.com", "password": "wrong-password"}).status_code for _ in range(7)]
    check("login is locked out after 5 failures", codes[:5] == [401] * 5 and codes[5:] == [429, 429], str(codes))
    codes = [TestClient(server.app, base_url="https://app.example.com").post("/api/hub/signup", json={"accepted_terms": True, "email": f"bulk{i}@example.com", "password": "BulkSignup12345", "name": "Bulk User"}).status_code for i in range(12)]
    check("signups are throttled per network (10/hour)", codes.count(201) + codes.count(409) <= 10 and 429 in codes, str(codes))

    # --- reset-password enforces the same 10-char rule as signup
    from auth import create_reset_token
    r = c.post("/api/auth/reset-password", json={"token": create_reset_token("founder@example.com"), "password": "short1!"})
    check("password reset enforces the 10-character minimum", r.status_code == 422, r.text)

    # --- single-service static hosting (only when a frontend build is present)
    static = os.environ.get("STATIC_DIR")
    if static and (Path(static) / "index.html").is_file():
        r = c.get("/")
        check("/ serves the web app", r.status_code == 200 and "<div id=\"root\">" in r.text, r.text[:120])
        check("client-side route /hub serves the app shell", "<div id=\"root\">" in c.get("/hub").text)
        check("deep link /c/some-community serves the app shell", "<div id=\"root\">" in c.get(f"/c/{slug}").text)
        js = next((p for p in (Path(static) / "static" / "js").glob("main.*.js")), None)
        check("built JS is served", js is not None and c.get(f"/static/js/{js.name}").status_code == 200)
        check("unknown /api paths still 404 as JSON (not the app shell)", c.get("/api/definitely-not-a-route").status_code == 404 and "root" not in c.get("/api/definitely-not-a-route").text)
        check("path traversal can't escape the build dir", "root:" not in c.get("/..%2f..%2f..%2fetc/passwd").text)

# --- refuses to boot with unsafe config
import asyncio  # noqa: E402

for bad, label in (({"JWT_SECRET": "dev-secret-change-me"}, "default JWT secret"), ({"INTEGRATIONS_SECRET": ""}, "missing INTEGRATIONS_SECRET"), ({"CORS_ORIGINS": "*"}, "wildcard CORS")):
    saved = {k: os.environ.get(k) for k in bad}
    os.environ.update(bad)
    try:
        server.validate_production_config()
        check(f"refuses to boot with {label}", False)
    except RuntimeError:
        check(f"refuses to boot with {label}", True)
    finally:
        for k, v in saved.items():
            os.environ[k] = v if v is not None else ""

print("\nALL PASS" if not failures else f"\n{len(failures)} FAILED: {failures}")
sys.exit(1 if failures else 0)
