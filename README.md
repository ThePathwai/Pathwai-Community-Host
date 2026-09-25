# Pathwai

FastAPI + MongoDB backend, Create React App (craco + Tailwind) frontend.

## Run locally

    # backend (no MongoDB needed with USE_MOCK_DB=true)
    cd backend && pip install -r requirements.txt mongomock-motor
    cp .env.example .env   # set USE_MOCK_DB=true, COOKIE_SECURE=false for quick start
    uvicorn server:app --port 8001 --reload

    # frontend (proxies /api to :8001)
    cd frontend && yarn install && yarn start

Demo logins (password `Demo123!`): `demo@yourcommunity.app` (member), `admin@yourcommunity.app` (admin).

## What was regenerated

Rebuilt from `server.py`, the pytest reports and seed modules because the originals weren't available:
`backend/auth.py`, `backend/database.py`, `backend/seed_fake_members.py`, all of `backend/routes/`,
`backend/_shims/emergentintegrations` (stand-in used only if the real package isn't installed),
and the whole `frontend/src`. If you have the originals, drop them over these.

`seed_data.pyc` and `audits.pyc` are the compiled originals (Python 3.11 only) - their `.py` sources weren't provided.

Tests: `cd backend && pytest tests/test_smoke.py`

## Community portal workflows (per the Portal Workflow brief)

Member side: Home (completion, attention list, RSVPs, recommendations), Directory (role/stage/location filters), Matches (why + save/dismiss/intro), Events (yes/maybe/no, detail, .ics, feedback, suggest), Resources (open tracking, share, request), Updates, Requests (admin forms incl. external Typeform/Airtable links), Support (ask the team + community board), Ask (concierge with action buttons), Settings, sectioned Profile.

Admin side: Action center, Requests (create for everyone/role, review, ask for changes), Approvals (member-submitted events/resources/updates), Support queue (assign/status/reply), connected tools in Community config.

New API: `routes/portal.py` (+ `seed_portal.py` demo data, `tests/test_portal.py`). External form tools can mark a request complete via `POST /api/webhooks/requests/{token}`.

## White-label branding and integrations
- **Admin → Branding**: presets, colours, light/dark, font, headings, corners, logo, login/welcome/footer text, menu rename/reorder/hide, custom links. Members see changes immediately.
- **Admin → Integrations**: Airtable (import members, write back), Luma (events + guests as RSVPs), Stripe (membership plans, paid tickets; point the Stripe webhook at `/api/webhooks/stripe`). Credentials are encrypted with `INTEGRATIONS_SECRET`. Use the key `demo` to try each with sample data.

## Admin = the member portal, editable
Admins sign in to the same portal members see. The **Edit site** switch in the top bar makes text (welcome line, page titles/subtitles, footer), the menu and logo (via the Branding drawer), and content (events, resources, updates, member profiles) editable in place. Endpoints: `PATCH/DELETE /api/admin/content/{events|resources|announcements}/{id}`, `PATCH /api/admin/users/{id}/profile`, `PATCH /api/community/config` (incl. `page_text`).
