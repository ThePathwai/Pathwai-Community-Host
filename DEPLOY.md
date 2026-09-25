# Deploying Pathwai to Railway

This walks through taking Pathwai from "runs on my machine" to a real URL people can sign up on.
It assumes Railway (railway.app) — Render and Fly work too, since both services ship as plain
Dockerfiles (`backend/Dockerfile`, `frontend/Dockerfile`), but the click-by-click steps below are
Railway's.

Budget about 20–30 minutes for the first deploy, most of it waiting for builds.

## 0. What you'll end up with

Two Railway services in one project — `backend` (FastAPI) and `frontend` (the React build, served
as static files) — plus a MongoDB database. Each service gets its own `*.up.railway.app` URL for
free; a custom domain is a later, optional step (see the bottom of this doc).

## 1. Push this code to GitHub

Railway deploys from a GitHub repo. This folder is already a git repository with one commit.

1. Create a new empty repo on GitHub (no README/license — this folder already has one).
2. `git remote add origin <your-repo-url>`
3. `git push -u origin main`

## 2. Create the Railway project + database

1. Sign up at railway.app (GitHub login is easiest, since you'll be connecting a repo anyway).
2. **New Project → Deploy from GitHub repo** → pick the repo you just pushed.
3. Railway will try to auto-detect a service from the repo root and likely get it wrong (there
   are two apps in one repo). Delete whatever it creates automatically — you'll add the two
   services by hand in the next step, so this one doesn't matter.
4. In the project, **+ New → Database → Add MongoDB**. Railway provisions it and gives it a
   `MONGO_URL`-shaped connection variable automatically.

## 3. Deploy the backend

1. **+ New → GitHub Repo** → same repo again.
2. Open the new service's **Settings**:
   - **Root Directory**: `backend`
   - Railway will detect the `Dockerfile` there automatically — leave the builder as Dockerfile.
3. **Variables** tab — add these (copy the shape from `backend/.env.example`):

   | Variable | Value |
   |---|---|
   | `MONGO_URL` | Click "Add Reference" → pick the Mongo service's connection variable, instead of typing it by hand |
   | `DB_NAME` | `pathwai` |
   | `USE_MOCK_DB` | `false` |
   | `JWT_SECRET` | a long random string — generate one with `openssl rand -hex 32` |
   | `COOKIE_SECURE` | `true` |
   | `COOKIE_SAMESITE` | `lax` |
   | `CORS_ORIGINS` | leave as `*` for now — you'll come back and lock this to the frontend's real URL in step 5 |
   | `FRONTEND_URL` | same — placeholder for now, fixed in step 5 |
   | `DEMO_PASSWORD` | `Demo123!` (or change it — this only matters if you keep the demo logins enabled) |
   | `DEMO_PUBLIC_SEED` | `true` while you're still testing; consider `false` once real users start signing up, so the seeded demo communities don't show up next to real ones |
   | `ENABLE_AI_CHAT` | `false` — leave off until you wire up a real OpenAI/Anthropic key (see "AI chat" below) |
   | `INTEGRATIONS_SECRET` | another random string (`openssl rand -hex 32`) — encrypts any Stripe/Airtable/Luma keys a community admin adds later |

   Leave `SENDGRID_API_KEY` unset for now — see "Email" below.

4. **Deploy**. Once it's live, open the service's **Settings → Networking** and click **Generate
   Domain** to get its public URL (something like `pathwai-backend-production.up.railway.app`).
   Copy this URL — the frontend needs it next.

## 4. Deploy the frontend

1. **+ New → GitHub Repo** → same repo again.
2. **Settings → Root Directory**: `frontend`. Dockerfile builder again.
3. **Variables** — these get baked into the JS bundle at *build* time, so Railway needs them as
   **Build Variables** (there's a separate toggle/tab from the runtime Variables — look for
   "Build Args" or a checkbox next to each variable marking it available at build time):
   - `REACT_APP_BACKEND_URL` = `https://<your-backend-domain-from-step-3>` (include `https://`)
   - `REACT_APP_AI_CHAT_ENABLED` = `false`
4. **Deploy**. Once live, **Settings → Networking → Generate Domain** for this service too. This
   is the URL you'll actually give people.

## 5. Close the loop: point the backend at the real frontend URL

Now that both URLs exist, go back to the **backend** service's Variables and update:

- `CORS_ORIGINS` → `https://<your-frontend-domain>` (exact, no trailing slash — this is what
  makes cookie-based login work cross-origin; leaving it as `*` will silently break login once a
  real browser enforces CORS)
- `FRONTEND_URL` → same value — this is what gets used to build the link inside password-reset
  emails

Both services redeploy automatically when you save a variable.

## 6. Verify it actually works

Open the frontend URL and walk through: sign up a new account → create a community (or apply to
one) → log out → forgot password → (see "Email" below for where the link goes) → log back in.
This exercises the real backend + real Mongo, not the mock preview you've been testing against —
worth doing once, carefully, before telling anyone the link.

## Things that are stubbed until you connect a real provider

**Email** (password reset links, eventually welcome mail). Nothing bounces or hangs without a
provider — every outgoing email is just logged to the backend's console instead of sent
(`backend/emailer.py`). That's fine for you to test with (Railway's **Deployments → logs** tab
shows it), but a real user who clicks "forgot password" gets nothing. To send for real: create a
SendGrid account (or swap in another provider — the send function is one small file), verify a
sender identity, and set `SENDGRID_API_KEY` (plus optionally `MAIL_FROM_EMAIL` /
`MAIL_FROM_NAME`) on the backend service.

**AI chat** ("Ask the League"). Off by default (`ENABLE_AI_CHAT=false`) per your call — it's built
and tested, just hidden from the nav, header, and dashboard, and the backend won't mount its
routes. To turn it on: get an OpenAI (or Anthropic) API key, set `OPENAI_API_KEY` on the backend
service, set `ENABLE_AI_CHAT=true` there, and set `REACT_APP_AI_CHAT_ENABLED=true` as a **build**
variable on the frontend (then redeploy the frontend so the flag gets baked into the bundle).
`backend/chatbot.py` currently calls a model named `gpt-5.2` — check that name is still current
before flipping this on, or point it at whichever model you want.

**File uploads** (`backend/uploads_data/`). These write to local disk on the backend container.
Railway containers are ephemeral by default — a redeploy wipes this directory. Two options:
add a Railway **Volume** mounted at `/app/uploads_data` on the backend service (simplest, keeps
the current code as-is), or move to S3-compatible object storage (Cloudflare R2, AWS S3) if you
expect enough upload volume that a single-container disk won't keep up. A volume is the right
call to start.

**Stripe / Twilio / SendGrid for a specific community.** These are already built as a
per-community, admin-configured integration (Admin → Integrations) — a community's own admin adds
their own keys whenever they want payments or texting for their members. Nothing you need to set
up platform-wide.

## Custom domain (optional, once the above is solid)

Railway → service → **Settings → Networking → Custom Domain**, then add the CNAME record it gives
you at your domain registrar. Do this for the frontend service; the backend can stay on its
Railway subdomain since users never see that URL directly (the frontend calls it via
`REACT_APP_BACKEND_URL`). If you move the frontend to a custom domain, update the backend's
`CORS_ORIGINS` / `FRONTEND_URL` to match, same as step 5.

## If you'd rather I drive this myself

I can run the Railway CLI directly from here instead of you clicking through the dashboard: create
a Railway account, generate a project API token (Railway → Account Settings → Tokens), and paste
it into the chat. I'll treat it like any other credential — used only for this deploy, not stored
anywhere beyond this session. Same offer applies to a SendGrid API key once you're ready to make
password reset emails real.
