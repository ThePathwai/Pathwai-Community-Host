# Launching Pathwai

This is the checklist for putting Pathwai on the internet so real people can sign up, and for connecting
the integrations (Stripe, Twilio, SendGrid, Airtable, Luma, Google sign-in) to real accounts.

**What you end up with:** one Railway project containing three things — the Pathwai service (API + web app
together, from the `Dockerfile` in the repo root), a MongoDB database, and a Volume for uploaded photos.
One service means one web address, which is what makes login work on iPhones/Safari and keeps webhooks
simple. Budget roughly 45–60 minutes the first time.

Anything marked **(you)** needs your own account or a secret that only you should hold.

For the security posture and what a SOC 2 audit would ask of you, see [`SOC2_READINESS.md`](SOC2_READINESS.md).

---

## 0. What's different in production

The code runs in one of two modes, decided by whether it is talking to a real MongoDB:

| | Demo / dev (`USE_MOCK_DB=true`, or `DEMO_MODE=true`) | **Production (default with a real `MONGO_URL`)** |
|---|---|---|
| Fake communities and members | seeded on boot | **none** — you start empty |
| "Try the demo" logins (`Demo123!`) | shown on the login page | **gone** |
| `/api/seed`, `/api/seed/public` (wipe + reseed) | available | **404** |
| Anonymous "preview as admin/founder" dashboards | on | **off** |
| `admin@yourcommunity.app` is a platform admin | yes | **no** — only emails you list in `PLATFORM_ADMIN_EMAILS` |
| Cookies | `Secure` optional | **`Secure` by default** |
| Weak/missing secrets | tolerated | **the server refuses to start** |
| HSTS (browsers insist on HTTPS) | off | **on** (other hardening headers are always on) |

Never set `DEMO_MODE=true` on the instance real people use.

---

## 1. Put the code on GitHub (you)

Commit and push this repository to GitHub (a private repo is fine). Railway deploys from it.

## 2. Create the Railway project (you)

1. <https://railway.com> → **New Project → Deploy from GitHub repo** → pick the repo.
2. Railway reads `railway.json` and builds the root `Dockerfile` (React build + Python API in one image).
   The first build takes a few minutes. It will fail to *start* until you add the variables below — that is expected.
3. In the project, **+ New → Database → MongoDB** (Railway's own MongoDB is fine to start; you can move to
   MongoDB Atlas later). Turn on backups for it if your plan offers them.
4. On the Pathwai service: **Settings → Volumes → Add Volume**, mount path `/data`. Uploaded profile photos and
   covers are stored here; without a volume they are erased on every deploy.

## 3. Variables on the Pathwai service (you)

Service → **Variables**. Generate secrets with `openssl rand -hex 32` (or any password manager).

| Variable | Value | Notes |
|---|---|---|
| `MONGO_URL` | `${{MongoDB.MONGO_URL}}` | Railway "reference" to the database you added. For Atlas paste its connection string. |
| `DB_NAME` | `pathwai` | |
| `JWT_SECRET` | *random, 32+ chars* | **Required.** Signs login sessions. Changing it logs everyone out. |
| `INTEGRATIONS_SECRET` | *a different random string* | **Required.** Encrypts the Stripe/Twilio/SendGrid/Airtable/Luma keys your admins save. **Changing or losing it makes every saved key unreadable** — store it in your password manager. |
| `PLATFORM_ADMIN_EMAILS` | `you@yourdomain.com` | Comma-separated. These accounts can enter and edit *every* community. Sign up with this email first (step 7). |
| `FRONTEND_URL` | `https://<your-domain>` | Used in password-reset emails and as the Stripe return address. No trailing slash. |
| `CORS_ORIGINS` | `https://<your-domain>` | Same value. The server refuses to start with `*`. |
| `PUBLIC_API_URL` | `https://<your-domain>` | Same value. Used to show the correct webhook URLs to admins and to verify Twilio's signature behind Railway's proxy. |
| `UPLOADS_DIR` | `/data/uploads` | Must be inside the volume from step 2. |
| `SENDGRID_API_KEY` | *(step 5)* | Without it, password-reset emails are only written to the log. **Required for real signups.** |
| `MAIL_FROM_EMAIL` | an address you verified in SendGrid | e.g. `no-reply@yourdomain.com` |
| `MAIL_FROM_NAME` | `Pathwai` (or your brand) | |
| `GOOGLE_CLIENT_ID` | *(step 6, optional)* | Shows the "Continue with Google" button. |
| `APPLE_CLIENT_ID` | *(optional)* | Same for Apple. Leave blank to hide it. |
| `REACT_APP_LEGAL_EMAIL` | `privacy@yourdomain.com` | **Build-time** variable (Railway passes it to the build). The contact address printed on the Terms and Privacy pages. Defaults to a placeholder — set it. |
| `REACT_APP_LEGAL_ENTITY` | `Your Company Inc.` | **Build-time.** The legal name that operates the service, printed on both pages. |
| `ENABLE_AI_CHAT` | `false` | Leave off unless you add an `OPENAI_API_KEY`. |

Do **not** set: `USE_MOCK_DB`, `DEMO_MODE`, `DEMO_PASSWORD`, `DEMO_PUBLIC_SEED`, `COOKIE_SECURE`, `COOKIE_SAMESITE`
(the production defaults are the safe ones).

Keep the service at **1 replica** (it is set that way in `railway.json`).

## 4. Domain (you)

Service → **Settings → Networking**:

* **Quick start:** *Generate Domain* gives you `something.up.railway.app`. Use that for `FRONTEND_URL`,
  `CORS_ORIGINS` and `PUBLIC_API_URL`, then redeploy. This is enough to launch and test.
* **Your own domain:** *Custom Domain* → add `app.yourdomain.com` (or the bare domain), create the CNAME record
  Railway shows at your DNS provider, wait for the green tick, then change the three variables to the new
  address. Do this before you share the link widely: Stripe/Twilio webhook URLs and Google sign-in origins
  contain the domain, so changing it later means re-entering them.

## 5. Email — SendGrid (you)

Password resets, and everything an admin sends as an "email blast", go through SendGrid.

1. <https://sendgrid.com> → create an account.
2. **Settings → Sender Authentication**: either *Authenticate your domain* (best — add the DNS records it shows) or
   *Single Sender Verification* for one address (quick start; click the email it sends you).
3. **Settings → API Keys → Create** with "Mail Send" permission (full access is not needed). Copy it once.
4. Set `SENDGRID_API_KEY` and `MAIL_FROM_EMAIL` (must be the verified sender/domain — otherwise SendGrid answers
   403 "does not match a verified Sender Identity" and resets silently fail; the error is in the Railway logs).
5. Test: *Forgot password* with your own address.

Each community can also connect **its own** SendGrid account in Admin → Integrations for member blasts (below).

## 6. Google sign-in (you, optional but recommended)

1. <https://console.cloud.google.com> → project menu (top left) → **New project** → name it Pathwai → **Create**.
2. Left menu → **APIs & Services → OAuth consent screen** (Google may call this **Google Auth Platform**) → **Get started**:
   app name Pathwai, your support email, audience **External**, your contact email, agree → **Create**.
   Add your site's `/privacy` and `/terms` links on the **Branding** page if it asks.
3. **Audience → Publish app** (so it says *In production*, not *Testing*). Left in Testing, only people you list by hand can sign in.
   Pathwai only asks for name, email and picture, which don't need Google's extra review.
4. **Clients → Create client → Web application**. Under *Authorized JavaScript origins* add
   `https://<your-domain>` exactly (no trailing slash, no path). Leave *Authorized redirect URIs* empty.
   Pathwai uses Google's ID-token flow, so there is no redirect URI and no client secret. **Create**, then copy the **Client ID**
   (ends in `.apps.googleusercontent.com`).
5. Railway → Pathwai → **Variables** → set `GOOGLE_CLIENT_ID` to that Client ID → **Deploy**. The button appears on the login and
   signup pages (a provider's button only shows once its ID is set). Change of domain later? Add the new origin in step 4 too.

Apple works the same way with a Services ID (`APPLE_CLIENT_ID`) and needs a paid Apple Developer account —
skip it for launch.

## 7. First launch checks

1. Open `https://<your-domain>/api/health` → should show `{"ok":true,"mode":"production"}`.
   If the service won't start, open **Deployments → View logs**: it prints exactly which setting is wrong.
2. Open the site. The login page should **not** offer demo accounts.
3. **Sign up with the email you put in `PLATFORM_ADMIN_EMAILS` — before you share the link with anyone.**
4. On signup choose *I'm starting a community* and create **Toronto Player League** (or whichever community
   you're launching). You land in its setup wizard (branding, event types, questions for applicants).
5. Share the link from **Admin → Invites → Share your community** (it looks like `https://<your-domain>/c/<slug>`).
6. Test the whole path with a second email address: open that link in a private window → sign up → "Request sent"
   → in your admin tab, **Admin → Members** → approve → sign in with the second account.

Everything someone does to join a community needs an admin's approval — that is enforced by the server.

## 8. Integrations — connecting real accounts

Admins do this per community under **Admin → Integrations**. Each tile has *Save*, *Test connection* and (where
relevant) *Sync now*. Always press **Test connection** first; the message tells you what's wrong in plain words.
(Typing `demo` as the key still switches a tile into a simulated sandbox — fine for rehearsing, never for real use.)

### Stripe — membership dues and paid event tickets
1. Use **test mode** first: <https://dashboard.stripe.com/test/apikeys> → copy the *Secret key* (`sk_test_…`).
2. In Pathwai → Stripe: paste the key, set currency (`cad`) and add your plans (name, amount, monthly/yearly/once). Save. *Test connection*.
3. In Stripe → **Developers → Webhooks → Add endpoint**. Paste the **Webhook endpoint** URL shown on the Pathwai tile
   (it ends in `?community=<slug>` — keep that part, it tells Pathwai which community the event belongs to).
   Select events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
4. Copy the endpoint's **Signing secret** (`whsec_…`) back into the Pathwai tile and Save.
5. Test as a member: Settings → pick a plan → pay with card `4242 4242 4242 4242`, any future date/CVC.
   Their status should flip to **active** within seconds. Create a paid event and buy a ticket the same way.
6. Go live: repeat with live keys (`sk_live_…`) and a *live-mode* webhook endpoint (live and test have separate
   endpoints and signing secrets).

*One Stripe account can serve several communities* — add one webhook endpoint per community (each has its own `?community=`).

### Twilio — text-message blasts
1. <https://console.twilio.com> → copy **Account SID** and **Auth token**; buy/verify a sending number.
2. Pathwai → Twilio: paste both, enter the number (`+1416…`) or a Messaging Service SID. Save → *Test connection*.
3. In Twilio, open the number → *Messaging* → "A message comes in" → **Webhook, HTTP POST** → paste the **Webhook
   endpoint** URL shown on the Pathwai tile. This is what makes a member's `STOP` reply switch their texts off.
4. Members only receive texts if they turned on SMS in Settings → Notifications and gave a phone number.
5. **Carrier registration:** US numbers must complete A2P 10DLC registration, and toll-free numbers need
   verification, or carriers block the messages. Canadian numbers: you need express consent (CASL) — Pathwai's opt-in
   toggle and the "Reply STOP" line cover the mechanics, but keep your own record of consent.
   Twilio's console walks you through registration; allow a few days.

### SendGrid — community email blasts
Same SendGrid account as step 5 (or the community's own). In Pathwai → SendGrid: paste an API key (Mail Send), set
**From email** to a *verified* sender/domain, optionally From name. Save → *Test connection*. Every blast
email carries a footer explaining how to turn emails off.

### Airtable — member import and write-back
1. <https://airtable.com/create/tokens> → create a **Personal access token** with scopes `data.records:read` and
   `data.records:write`, granted on the one base you want to use.
2. Pathwai → Airtable: token, **Base ID** (starts `app…`, in the base's URL), **Table name**. Save → *Test connection*.
3. Columns are matched by name: `Name`, `Email`, `Company`, `Title`, `Stage`, `Industry`, `Bio`. *Sync now* imports
   people (new people are created, existing ones only get *empty* fields filled — nothing a member typed is overwritten).
4. Tick *Write changes back to Airtable* to push member profile edits and request answers back to the matching row.

### Luma — events
1. A Luma **Plus** calendar is required for API access. In Luma: calendar → **Settings → Developer → API keys**.
2. Pathwai → Luma: paste the key. Save → *Test connection* → *Sync now*. Upcoming events are imported into Events and
   guests whose Luma email matches a member are marked as going.

### Typeform / Google Forms / Jotform
Link-only: an admin pastes a form link into a member request. No keys.

### Pop-up alerts (new events, new members, approvals)

Members can turn on pop-up alerts in **Settings → Notifications** (or from the banner on the Notifications page). On a phone or computer it works even when Pathwai isn't open (browser push); on an iPhone or iPad the person first has to **Share → Add to Home Screen** and open Pathwai from that icon (Apple's rule). It needs HTTPS, which Railway provides.

There is nothing to set up: Pathwai creates its own push key the first time it's needed and stores it encrypted in the platform database. Optional variables if you ever want to control it: `VAPID_PRIVATE_KEY` (a PEM key, to keep the same key across a database reset) and `VAPID_SUBJECT` (a `mailto:` address, defaults to your legal email). If the key is lost, people just tap **Turn on** again.

## 9. Operating it

* **Backups:** turn on automatic backups on the database (Railway plan feature or Atlas). Do a restore drill once.
* **Uptime:** point UptimeRobot (free) at `https://<your-domain>/api/health` — it also checks the database.
* **Logs:** Railway → Deployments → View logs. Failed emails, failed payments webhooks and integration errors show up here
  and, per integration, in the admin tile's log.
* **Reports:** a member reporting a platform message is stored in the `platform_reports` collection of the `…__hub`
  database; there is no admin screen for them yet — check it (Railway's database → Data tab) until one exists.
* **Updating:** push to GitHub; Railway rebuilds and redeploys. Existing data is untouched. Brief downtime during a deploy.
* **Audit logs:** platform admins (emails in `PLATFORM_ADMIN_EMAILS`) can read the platform log at `/api/hub/admin/audit-log` (sign-ins, failures,
  resets, account deletions, community creation, platform-admin access); each community's admins see theirs under Audit log. Every entry has a
  request id matching the `X-Request-ID` response header and the server log line. Keep logs at least 12 months.
* **Member data requests:** members can download or delete their own data and sign out of every device from **Settings → Your data and security**
  (API: `/api/hub/account/export`, `/delete`, `/sign-out-everywhere`). Changing or resetting a password signs out all other devices.
* **Dependencies:** `ci-templates/github-ci.yml` runs the tests and vulnerability scans on every push, and `github-dependabot.yml` proposes updates weekly — copy them to `.github/workflows/ci.yml` and `.github/dependabot.yml` to switch them on, then review and merge the update PRs.
* **Scaling:** stay at one replica — uploaded files live on a single Volume, which can only attach to one instance.

## 10. Known gaps to be aware of before a big public launch

* **No email verification at signup.** Anyone can create an account with someone else's email address; a member
  approval is by email, so admins should still eyeball applicants. Google sign-in *is* verified. Adding a
  "confirm your email" step is the next hardening item.
* **The Terms of Service and Privacy Policy are a starting draft, not legal advice.** They are live at `/terms` and
  `/privacy`, and every new account must tick agreement (email signup, invite links, first-time Google/Apple); the
  server records the version and date. You collect names, emails, phone numbers, photos and messages from people in
  Canada — have a lawyer review the wording (it lives in `frontend/src/lib/legal.js`). When it changes materially, bump
  `LEGAL_VERSION` there **and** in `backend/routes/_common.py`. Existing members are not asked to re-accept yet.
* **No multi-factor authentication in the app** for admins yet. Turn on MFA for your GitHub, Railway, database, email and Stripe accounts now (see `SOC2_READINESS.md`).
* **Reports have no admin screen** (see above).
* **Rate limits** exist for login, signup and password-reset; there is no general API throttle or CAPTCHA yet.

## 11. Optional: two services instead of one

If you want the frontend and API on separate services, `backend/Dockerfile` and `frontend/Dockerfile` still work, but
login cookies then cross sites: you **must** put both on subdomains of the **same** custom domain
(`app.yourdomain.com` and `api.yourdomain.com`), set `REACT_APP_BACKEND_URL=https://api.yourdomain.com` as a *build*
variable on the frontend, and set `CORS_ORIGINS` to the app origin on the API. Using the two default
`*.up.railway.app` domains will not work in Safari/iPhone. The single-service setup above avoids all of this.

## 12. Optional: a separate public demo instance

To let people poke around with fake data, deploy a **second, independent** project with its own database and set
`DEMO_MODE=true` and `DEMO_PASSWORD=<something>`. It seeds sample communities and shows "Try the demo" logins
(`demo@yourcommunity.app` / `admin@yourcommunity.app`). Never point it at the real database.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Service crashes on start, log says *Unsafe production configuration* | A required variable is missing/weak — the message lists which. |
| You can sign in but are logged out on refresh | `FRONTEND_URL`/domain mismatch, or two-service setup on `*.up.railway.app` (see 11). |
| Password-reset email never arrives | `SENDGRID_API_KEY` unset, or `MAIL_FROM_EMAIL` not a verified sender. Check logs for `SendGrid send … failed`. |
| Photos disappear after a deploy | No Volume, or `UPLOADS_DIR` isn't inside it. |
| Stripe tile says "Invalid signature" in the webhook log | Wrong signing secret, or the webhook was added for a different community/mode (test vs live). |
| STOP replies don't turn texts off | Twilio webhook URL missing/typo, or `PUBLIC_API_URL` isn't your real public address. |
| Google button missing | `GOOGLE_CLIENT_ID` unset, or the page origin isn't in the OAuth client's *Authorized JavaScript origins*. |
| Saved integration keys stopped working | `INTEGRATIONS_SECRET` was changed. Restore the old value, or re-enter the keys. |
