# SOC 2 readiness — Pathwai

**Read this first.** SOC 2 is not a property of source code and no software can "be" SOC 2 compliant. It is a
report written by an independent CPA firm about *your organisation's* controls — people, policies and
processes as well as software — over a period of time. Type I says the controls are designed properly on one
date; Type II says they operated effectively over a window (typically 3–12 months).

What this repository can do is (1) implement the technical controls an auditor will test, (2) produce
evidence for them, and (3) be honest about what is left. That is what this document does. Last reviewed: 2026-10-06.

---

## 1. The path to an actual report

1. **Pick the scope.** Start with *Security* (the "Common Criteria"), the only mandatory category. Add
   Availability / Confidentiality / Privacy later if customers ask for them.
2. **Use a compliance platform** (Vanta, Drata, Secureframe, Sprinto…). They connect to GitHub, Railway/AWS,
   Google Workspace, MongoDB Atlas and HR tools, collect evidence automatically, and supply policy templates.
   Most also introduce you to auditors.
3. **Adopt the policies** (section 5) and run the processes they describe, so there is evidence.
4. **Readiness assessment → Type I audit → observation window → Type II audit.** Plan on months, not weeks.
5. Customers will ask for the report under NDA; until you have one, a short security overview plus this
   control list is what most early customers accept.

---

## 2. Technical controls in the code today

| Area (Trust Services Criteria) | Control | Where |
|---|---|---|
| **Logical access (CC6.1)** | Passwords hashed with bcrypt; 10+ chars with a letter and a number, enforced server-side on every path that sets one (signup, reset, change) | `auth.py`, `routes/hub.py`, `server.py`, `routes/portal.py` |
| | `HttpOnly`, `Secure`, `SameSite` auth cookies; one implementation for every login path | `auth.set_cookie / set_auth_cookies` |
| | Role checks on every admin route (`require_role`); membership is approval-gated; each community has its own database | `auth.py`, `database.py` |
| | Brute-force protection: per-IP+email lockout (5/15 min), per-email cap, rate limits on sign-up and forgot-password | `auth.check_lockout`, `auth.rate_limit` |
| | Platform-admin power is opt-in by email (`PLATFORM_ADMIN_EMAILS`); empty by default in production | `routes/hub.py` |
| **Session management (CC6.1)** | Short-lived access tokens, rotating refresh tokens. **Sign out everywhere**, and a **password change or reset revokes every older session** (millisecond-precision cutoff) | `auth.session_revoked`, `directory.revoke_sessions_for_email`, `routes/account.py` |
| **Provisioning / removal (CC6.2–6.3)** | Admin approval of members; admin actions audited; self-serve **account deletion** (re-authenticated; blocked for a community's only admin) | `routes/admin.py`, `routes/account.py` |
| **Boundary & transport (CC6.6–6.7)** | TLS at Railway's edge; HSTS in production; `nosniff`, clickjacking denial (`X-Frame-Options`, CSP `frame-ancestors`), referrer + permissions policy; `Cache-Control: no-store` on JSON; CORS allow-list (server refuses to start with `*`) | `security.py`, `server.validate_production_config` |
| | Third-party API keys saved by admins are encrypted at rest with `INTEGRATIONS_SECRET`; never returned to the browser | `routes/integrations.py` |
| | Server refuses to boot in production with a weak/missing `JWT_SECRET`, missing `INTEGRATIONS_SECRET`, wildcard CORS or a localhost database | `server.validate_production_config` |
| **Logging & monitoring (CC7.2)** | **Platform audit log** (sign-ups, sign-ins/failures, password resets & changes, session revocation, community creation, platform-admin entry into a community, data export, account deletion) plus a **per-community audit log** (admin actions, approvals, config/integration changes, blasts, moderation). Entries carry actor, action, target, IP and a **request id** that also appears on every log line and in the `X-Request-ID` response header | `routes/_common.audit / audit_platform`, `server.write_audit`, `security.py` |
| | Audit log readable by community admins (`/api/admin/audit-log`) and platform admins (`/api/hub/admin/audit-log`) | `routes/admin.py`, `routes/account.py` |
| **Vulnerability management (CC7.1, CC6.8)** | Dependencies pinned; `pip-audit` currently reports **no known vulnerabilities** (this review upgraded FastAPI/Starlette/pymongo/motor, which had 23 advisories, and removed unused `python-jose`); CI runs tests + `pip-audit` + `yarn audit` on every change; Dependabot opens update PRs | `backend/requirements.txt`, `ci-templates/` (copy into `.github/` — see below) |
| **Change management (CC8.1)** | Git history, automated test suite (105 tests including a production-mode boot test) run in CI | `ci-templates/github-ci.yml`, `backend/tests/` |
| **Privacy (P-series, optional)** | Terms + Privacy accepted at sign-up and recorded with version/date; **download my data**; **delete my account**; STOP/opt-out for text messages; email footer | `routes/account.py`, `lib/legal.js`, `routes/blasts.py` |
| **Availability (A1, optional)** | `/api/health` checks the database; Railway restarts on failure | `railway.json` |

---

**To switch the CI and Dependabot on:** copy `ci-templates/github-ci.yml` to `.github/workflows/ci.yml` and `ci-templates/github-dependabot.yml` to `.github/dependabot.yml`, commit and push. (They are kept outside `.github/` here only because that folder is write-protected for automated tools.)

---

## 3. Technical gaps — be aware, decide, then close

Ordered roughly by how likely an auditor or a security-minded customer is to raise them.

1. **No multi-factor authentication inside the app** (for community admins and platform admins). Auditors
   expect MFA for privileged access. The organisation-level MFA in section 4 is mandatory regardless; app-level
   TOTP for admins is the next feature to build.
2. **No email verification at sign-up.** Someone can register with an email they don't own ("pre-hijack"). Google/Apple sign-in is verified. Add a confirm-your-email step.
3. **No alerting or error tracking.** Logs exist (with request ids) but nobody is paged. Add uptime monitoring on `/api/health`, and an error tracker such as Sentry.
4. **Backups and restore are not proven.** Turn on Railway/Atlas backups and *test a restore*; keep the record — auditors ask for the test, not just the setting.
5. **Audit log is append-only by convention, not by enforcement.** The application never edits or deletes entries, but anyone with database access could. For stronger evidence, ship the logs to an external write-once store, or give the app's database user insert-only rights on `audit_log`. There is no automatic retention/archival; keep at least 12 months and decide who reviews them.
6. **Frontend build toolchain (react-scripts) carries 51 advisories** (2 critical, 22 high). All of them are build-time tools that are not shipped in the browser bundle, so the runtime risk is low, but the build environment is exposed. Plan a migration to Vite or Next; CI reports them in the meantime.
7. **Container runs as root** and the `Dockerfile` has not been build-tested in this review (no Docker available here). Non-root needs `RAILWAY_RUN_UID=0` workarounds for Volumes, so it was left as is.
8. **No general API rate limit / WAF / CAPTCHA** beyond login, sign-up and forgot-password. Cloudflare in front of the Railway domain is the usual fix.
9. **Data at rest** relies on the database host's disk encryption (MongoDB Atlas encrypts at rest; confirm Railway's MongoDB plan or use Atlas). Individual PII fields are not separately encrypted.
10. **Secrets rotation**: rotating `JWT_SECRET` logs everyone out (acceptable); rotating `INTEGRATIONS_SECRET` currently makes saved integration keys unreadable (admins would re-enter them). Document and schedule rotations.
11. **Single replica** by design: uploads live on one Railway Volume and per-community routing is cached in-process. That is an availability limit, not a security flaw.
12. **Existing members are not asked to re-accept** updated Terms/Privacy; `platform_reports` (message reports) has no admin screen yet; Airtable-imported members never accept the Terms in-app.
13. **What deletion leaves behind:** messages sent by a deleted member stay visible to recipients under a placeholder sender; payment records are retained on purpose (financial records).

---

## 4. Organisation-level controls — you must do these (the code cannot)

**Turn on multi-factor authentication everywhere**, and keep the proof: GitHub, Railway, MongoDB Atlas, Google
Workspace/Gmail, Stripe, Twilio, SendGrid, domain registrar and DNS, password manager.

- **Access control:** named accounts only (no shared logins); least privilege; remove access the day someone leaves; review who has access to production every quarter and keep the review.
- **Source control:** protect `main` (pull request + at least one review, passing CI required); no direct pushes; no secrets in the repo (`.env` is git-ignored).
- **Secrets:** keep them in Railway variables and a password manager; rotate on staff change or suspected leak.
- **Production data access:** nobody uses real member data in development; database access limited to named people.
- **Devices:** disk encryption, screen lock and OS updates on laptops that can reach production.
- **Incident response:** write down who is on call, how a suspected breach is declared, how members are notified (Canadian privacy law requires reporting breaches that pose a real risk of significant harm), and rehearse once a year.
- **Risk assessment:** an annual written review of what could go wrong and what you do about it.
- **Vendor management:** keep the list in section 6, collect each vendor's SOC 2 report annually, sign their data-processing terms.
- **Business continuity:** a one-page plan: where backups are, how long a restore takes, who does it.
- **People:** security-awareness training and (where lawful and appropriate) background checks for anyone with production access; confidentiality agreements.

### Policies an auditor will ask for (templates come with any compliance platform)

Information security policy · Access control · Acceptable use · Change management · Incident response ·
Risk assessment · Vendor management · Data classification & retention · Backup & disaster recovery ·
Encryption & key management · Secure development · Business continuity · Privacy / data subject requests.

Suggested retention defaults to adopt: audit logs 12+ months; deleted-account data removed immediately
(backups age out within 30 days); payment records per tax law (the CRA generally expects six years).

---

## 5. How to get evidence out of the app

| An auditor asks for… | You show… |
|---|---|
| Who accessed or changed what | `GET /api/hub/admin/audit-log` (platform) and `GET /api/admin/audit-log` (per community), filter by `action` and date |
| Log of failed sign-ins / lockouts | platform log, `auth.login_failed` |
| Proof sessions can be revoked | `POST /api/hub/account/sign-out-everywhere` (+ test `test_security_controls.py`) |
| Password policy | `auth.check_password_strength`, tests `test_smoke.py`, `test_security_controls.py` |
| Production configuration is enforced | `server.validate_production_config` + `tests/test_production.py` |
| Vulnerability scanning | the CI run history (`pip-audit`, `yarn audit`) and Dependabot PRs |
| Data-subject requests handled | `account.exported` and `account.deleted` audit entries |
| Change management | pull request history with reviews and green CI |

---

## 6. Vendors (subprocessors) and their SOC 2 status

Verified from the vendors' own documentation on 2026-10-06. "Request" means obtain the current report from
the vendor's trust portal and file it; reports expire, so refresh yearly.

| Vendor | Used for | SOC 2 | How to get it |
|---|---|---|---|
| **Railway** | Hosting | **Type II** and SOC 3; DPA available | Trust Center (trust.railway.com) |
| **MongoDB Atlas** | Database (if you use Atlas) | **Type II** | MongoDB Customer Trust Portal (customers) |
| **Stripe** | Payments | **SOC 1 and SOC 2 Type II** | Dashboard → Compliance & Documents (owner/admin) |
| **Airtable** | Optional member import | **Type II** (ISO 27001 too) | Airtable security / trust page |
| **Twilio** | SMS blasts | Twilio publishes SOC 2 Type 2 reports | Twilio Trust Center. *Confirm the report scope for your product.* |
| **SendGrid** | Email | Part of Twilio; **scope not confirmed in this review** | Ask Twilio/SendGrid trust center which report covers SendGrid |
| **Google** | Sign-in | Large providers publish SOC reports | Google Cloud/Workspace compliance pages; low data exposure (name, email, photo) |
| **Apple** | Sign-in | — | Same note; low data exposure |
| **Luma** | Optional event import | **Not found in this review** | Ask Luma; consider whether you need it before a first audit |

Note: using a SOC 2-certified vendor does **not** make you compliant (the vendors say so themselves); it lets
you rely on their controls for the parts they run, while you remain responsible for yours (shared responsibility).

---

## 7. Suggested order of work

1. This week: MFA on every account in section 4; branch protection; backups on and one restore tested; uptime monitoring.
2. Before onboarding paying communities: email verification, admin MFA, error tracking, Cloudflare/WAF, set `REACT_APP_LEGAL_EMAIL` / `REACT_APP_LEGAL_ENTITY` and have counsel review the Terms/Privacy.
3. Then: choose a compliance platform, adopt policies, start the Type I readiness assessment.
