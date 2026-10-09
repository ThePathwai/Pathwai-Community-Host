// Preview-only API layer: answers /api/* from responses recorded off the real backend.
// Loaded only when REACT_APP_PREVIEW=true (see lib/api.js). Not part of the normal build.
import axios from "axios";
import fixtures from "./fixtures.json";
import { buildYvetta, YVETTA_SLUG } from "./yvetta";

const S = { role: null, email: null, community: null, books: {}, extra: {} };
const book = () => { const k = S.community || "playr"; return (S.books[k] = S.books[k] || JSON.parse(JSON.stringify(fixtures.communities[k]))); };
const slugOf = () => S.community || "playr";
// The active community's recorded data. `member` and `admin` both point at the signed-in person's view, so shared helpers keep working.
Object.defineProperty(S, "data", { get() { const b = book(); const v = (S.email && b.logins[S.email]) || {}; return { public: b.public, member: v, admin: v }; } });
const ACCOUNTS = { "demo@yourcommunity.app": { name: "Fife Ashley-Dejo", role: "member" }, "admin@yourcommunity.app": { name: "Fife Ashley-Dejo", role: "admin" }, "host@thevillage.example": { name: "Camille Laurent", role: "host" } };
// A role is per-community, not global: admin@ is the actual admin of playr/the-village/club-pto/unity
// but just a plain member of grace (grace's real admin is a separate persona, pastor@c3.example, same
// as the real backend's seed_communities.py); demo@ is a plain member everywhere except Toronto Tech
// Collective, where it's the founding admin — the "vice versa" half. See ADMIN_OF below.
const BASE = { "demo@yourcommunity.app": { playr: "approved", grace: "approved", "club-pto": "approved", "toronto-tech-collective": "approved", [YVETTA_SLUG]: "approved" }, "admin@yourcommunity.app": { playr: "approved", grace: "approved", "the-village": "approved", "club-pto": "approved", unity: "approved", [YVETTA_SLUG]: "approved" }, "host@thevillage.example": { "the-village": "approved" } };
const ADMIN_OF = { "admin@yourcommunity.app": ["playr", "the-village", "club-pto", "unity", YVETTA_SLUG], "demo@yourcommunity.app": ["toronto-tech-collective"], "host@thevillage.example": ["the-village"] };
const memStatus = (email, slug) => (S.extra.join || {})[email + "|" + slug] || (BASE[email] || {})[slug] || "none";
const isAdminHere = () => (ADMIN_OF[S.email] || []).includes(slugOf());
const appsHere = () => ((S.extra.apps || {})[slugOf()] || []);
const clone = (x) => JSON.parse(JSON.stringify(x));
const q = (s) => (s || "").toLowerCase();
const has = (o, s) => JSON.stringify(o).toLowerCase().includes(s);

// ---- admin onboarding: self-serve "create a community" (mirrors routes/hub.py CATEGORY_PRESETS) ----
const CATEGORY_PRESETS = {
  church: { label: "Church / faith community", kind: "Faith community", theme_preset: "forest", member_plural: "Congregation",
    event_types: ["Sunday Gathering", "Community Meal", "Connect Group", "Volunteer Day", "Youth Night", "Prayer Evening"] },
  wellness: { label: "Wellness / fitness brand", kind: "Wellness & events community", theme_preset: "playr-modern", member_plural: "Members",
    event_types: ["Networking", "Workshop", "Wellness", "Social", "Summit"] },
  dinner_club: { label: "Private club / dinner series", kind: "Private club", theme_preset: "sunset", member_plural: "Guests",
    event_types: ["Dinner", "Wine Salon", "Market Morning", "Members' Supper"] },
  professional: { label: "Professional network", kind: "Professional network", theme_preset: "ocean", member_plural: "Members",
    event_types: ["Networking", "Workshop", "Panel", "Mixer"] },
  other: { label: "Something else", kind: "Community", theme_preset: "pathwai", member_plural: "Members",
    event_types: ["Gathering", "Meetup", "Workshop", "Social"] },
};
// Reference/schema data that describes the product, not any one community's content — carried over
// as-is onto a brand-new community's book. Everything else in `public` gets wiped to an empty state.
const REFERENCE_PUBLIC_KEYS = ["/member-requests/kinds", "/support-categories", "/community/presets", "/auth/demo-accounts", "/organizations/meta/filters", "/users/filters", "/chat/quick-starts", "/profile-requests/kinds", "/connect-requests/kinds", "/integrations/public"];
// Mirrors backend routes/community_config.py's DEFAULT_CONFIG — the shape a brand-new community's
// config starts from before the category preset below rebrands the name/theme/event-types on top.
// Kept generic on purpose (nav labels, member types, profile fields) rather than inheriting the
// flavour of whichever recorded community happens to be used as the structural template.
const DEFAULT_CONFIG = {
  community_name: "New Community", require_approval: true, community_kind: "Community", about: "", hub_cover: null, apply_questions: [],
  tagline: "", community_type: "social", theme: { preset: "pathwai", accent: "#F00F21" },
  member_label_singular: "Member", member_label_plural: "Members",
  member_types: { founder: "Member", mentor: "Host", alumni: "Alumni", partner: "Partner", guest: "Guest" },
  profile: { fields: [
    { key: "age", label: "Age", enabled: true }, { key: "height", label: "Height", enabled: true }, { key: "title", label: "Profession", enabled: true },
    { key: "skill_set", label: "Skills", enabled: true }, { key: "interests_hobbies", label: "Interests", enabled: true },
    { key: "goals", label: "Goals", enabled: true }, { key: "support_needs", label: "Support needed", enabled: true },
  ] },
  event_types: ["Gathering", "Meetup", "Workshop", "Social"],
  support_categories: ["Career advice", "Business help", "Legal & finance", "Marketing & content", "Mentorship", "Wellness", "Introductions", "Events", "Other"],
  signup_fields: [
    { key: "title", label: "Profession", type: "text", required: false },
    { key: "skill_set", label: "Skills", type: "tags", required: false },
    { key: "interests_hobbies", label: "Interests", type: "tags", required: false },
  ],
  custom_profile_fields: [], widgets: ["upcoming_events", "support_requests", "smart_matches", "announcements", "resources"], page_text: {},
  gallery_photos: [],
  allow_member_submissions: { events: true, resources: true, announcements: true },
  brand: {
    preset: "pathwai", mode: "light", colors: { accent: "#F00F21", on_accent: "#FFFFFF", background: "#FFFFFF", surface: "#F7F7F5", text: "#111111", muted: "#6B6B70", border: "#E5E5E0" },
    font: "Inter", heading_font: "Inter", heading_style: "normal", radius: "soft", button_shape: "rounded",
    logo_url: null, logo_mark_url: null, logo_adapts: true, show_name_with_logo: false,
    login_headline: "Meet your people.", login_subhead: "Find your next event and the members who can help you grow.",
    welcome_message: "Welcome to the community. Here's what's happening this week.", footer_text: "", support_email: "",
  },
  nav: [
    { key: "members", label: "Members", enabled: true }, { key: "matches", label: "Connections", enabled: true },
    { key: "events", label: "Events", enabled: true }, { key: "resources", label: "Perks", enabled: true },
    { key: "updates", label: "News", enabled: true }, { key: "requests", label: "To-do", enabled: true },
    { key: "support", label: "Help board", enabled: true },
  ],
  custom_links: [], setup_completed: true,
};
function slugify(name) {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "community";
  const taken = (s) => !!fixtures.communities[s] || !!S.books[s];
  let slug = base, i = 2;
  while (taken(slug)) { slug = `${base}-${i}`; i++; }
  return slug;
}
// Recursively wipes a fixture object down to its shape — arrays become [], numbers become 0,
// everything else (strings, booleans, null) passes through — so a page built for a data-rich
// community still finds every key it expects, just showing a fresh, empty state.
function blank(v) {
  if (Array.isArray(v)) return [];
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = typeof v[k] === "number" ? 0 : blank(v[k]); return o; }
  return v;
}

// The Yvettabetta Pilates demo community (see yvetta.js): added to the recorded data and the hub's list once, at load.
{ const yv = buildYvetta(fixtures, { blank, clone, DEFAULT_CONFIG, REFERENCE_PUBLIC_KEYS }); fixtures.communities[YVETTA_SLUG] = yv.book; fixtures.hub.splice(1, 0, yv.hub); }

// Unity Fitness was recorded with a copy of The Playr League's settings (name, colours, font, logo, text), so opening it
// from the hub looked like the wrong community. Where a community's settings don't match its own hub card, rebuild them from
// the card: name, look, story, questions. Anything else stays as recorded.
for (const hubCard of fixtures.hub) {
  const com = fixtures.communities[hubCard.slug]; const cfg = com?.public?.["/community/config"];
  if (!cfg || cfg.community_name === hubCard.name) continue;
  Object.assign(cfg, { community_name: hubCard.name, tagline: hubCard.tagline, about: hubCard.about, community_kind: hubCard.kind, hub_cover: hubCard.cover || null,
    apply_questions: hubCard.apply_questions || [], country: hubCard.country || cfg.country, interest_tags: hubCard.interest_tags || cfg.interest_tags,
    brand: clone(hubCard.brand), theme: { preset: "custom", accent: hubCard.brand?.colors?.accent || cfg.theme?.accent }, gallery_photos: [], dashboard_cover_url: null, custom_links: [] });
  if (hubCard.slug === "unity") cfg.nav = cfg.nav.map((n) => (n.key === "events" ? { ...n, label: "Classes" } : n));
}

const fail = (config, status, detail) => {
  const response = { status, data: { detail }, headers: {}, config, statusText: "" };
  return Promise.reject(new axios.AxiosError(detail, "ERR_BAD_REQUEST", config, null, response));
};
const ok = (config, data, status = 200) => Promise.resolve({ data, status, statusText: "OK", headers: {}, config });

const LABELS = { name: "Name", avatar_url: "Photo", age: "Age", height: "Height", title: "Profession", location: "Neighbourhood / city", bio: "Bio", industry: "Main sport", stage: "Level", position: "Position / role", cohort: "Division / team", skill_set: "Skills", interests_hobbies: "Interests", goals: "Goals", support_needs: "Support needed" };
const filled = (v) => (Array.isArray(v) ? v.length > 0 : v && typeof v === "object" ? Object.keys(v).length > 0 : !!(v && String(v).trim()));
const effective = (r) => (["not_started", "in_progress"].includes(r.status) && r.due_date && r.due_date < new Date().toISOString().slice(0, 10) ? "overdue" : r.status);
function reqList(d, p) {
  const live = S.extra.reqs || {};
  let items = d.requests.map((r) => { const m = { ...r, ...(live[r.id] || {}) }; m.effective_status = effective(m); return m; });
  const open = items.filter((r) => ["not_started", "in_progress", "overdue"].includes(r.effective_status)).length;
  if (p.status === "open") items = items.filter((r) => ["not_started", "in_progress", "overdue"].includes(r.effective_status));
  return { requests: items, open };
}
function completion() {
  const base = S.data.member["/me/profile-completion"];
  const patched = S.extra.profile || {};
  const keys = Object.keys(LABELS);
  const missing = (base.missing_keys || []).filter((k) => !filled(patched[k]));
  return { ...base, missing_keys: missing, missing: missing.map((k) => LABELS[k] || k), percent: Math.round((100 * (keys.length - missing.length)) / keys.length), sections: base.sections, _k: keys.length };
}
const view = () => (S.role ? S.data.member : {});
function lookup(path) {
  if (S.role && S.community && view()[path] !== undefined) return view()[path];
  if (S.data.public[path] !== undefined) return S.data.public[path];
  // A detail page for something created live this session (never "recorded" by a login) — surface it
  // from the shared overlay instead of 404ing, so a just-created event/member can be opened.
  const em = path.match(/^\/events\/([^/]+)$/);
  if (em) return sharedContent("events").created.find((x) => x.id === em[1]);
  const um = path.match(/^\/users\/([^/]+)$/);
  if (um) return sharedContent("users").created.find((x) => x.id === um[1]);
  return undefined;
}


// ---- integrations (demo-mode simulation) ----
// Shared per-community, not per-login: any member's purchase/opt-in checks need to see what the admin connected.
const integ = () => {
  const bk = book();
  if (!bk.integrations) {
    const seed = Object.values(bk.logins).find((l) => l["/admin/integrations"]);
    bk.integrations = clone((seed && seed["/admin/integrations"].integrations) || []);
  }
  return bk.integrations;
};
const stripeOn = () => integ().find((p) => p.provider === "stripe")?.enabled;
const PLANS = [{ key: "member", label: "Community member", amount_cents: 4900, interval: "month" }, { key: "founder", label: "Founder plan", amount_cents: 12900, interval: "month" }];
const SYNC = { airtable: { imported: 12, updated: 4, skipped: 1 }, luma: { events_imported: 5, rsvps_synced: 18 }, stripe: { plans: 2, payments: 3 } };
function integWrite(method, path, body, config) {
  const m = path.match(/^\/admin\/integrations\/(\w+)(?:\/(test|sync))?$/);
  if (!m) return null;
  const p = integ().find((x) => x.provider === m[1]);
  if (!p) return fail(config, 404, "Unknown integration");
  const now = new Date().toISOString();
  if (method === "delete") { Object.assign(p, { enabled: false, status: "disconnected", demo: false, masked: {}, last_result: null, last_error: null }); return ok(config, { ok: true }); }
  if (m[2] === "test") return ok(config, { ok: true, message: `Connected to ${p.label} (demo data)` });
  if (m[2] === "sync") {
    p.last_sync_at = now; p.last_result = SYNC[p.provider] || {};
    p.log = [{ at: now, ok: true, message: "Sync complete (demo)" }, ...(p.log || [])].slice(0, 10);
    return ok(config, { ok: true, result: p.last_result });
  }
  const key = (body.credentials || {}).api_key || (body.credentials || {}).account_sid;
  if (p.kind === "link") Object.assign(p, { enabled: true, status: "connected" });
  else {
    if (!key && !p.enabled) return fail(config, 400, "Enter your credentials first");
    p.enabled = true; p.status = "connected"; p.demo = !key || String(key).startsWith("demo") || p.demo;
    if (key) p.masked = { api_key: "••••" + String(key).slice(-4) };
    p.settings = { ...(p.settings || {}), ...(body.settings || {}) };
    if (p.provider === "stripe") p.settings.plans = (body.settings || {}).plans || p.settings.plans || PLANS;
  }
  return ok(config, p);
}

// ---- shared community content ----
// Fixtures are recorded per login (admin vs. member each got their own snapshot at record time), so
// without this, anything created/edited/RSVP'd during the live preview would only ever show up for
// whichever login made the change. These overlays live on the community's book (not per-login), so
// every login that visits the same community sees the same events/resources/announcements/members
// and the same attendee counts — admin actions show up for members and vice versa.
function sharedContent(kind) {
  const bk = book();
  bk.shared = bk.shared || {};
  bk.shared[kind] = bk.shared[kind] || { created: [], edits: {}, deleted: {} };
  return bk.shared[kind];
}
function sharedRsvp() {
  const bk = book();
  bk.shared = bk.shared || {};
  bk.shared.rsvp = bk.shared.rsvp || { byUser: {}, delta: {} }; // byUser: {eventId: {email: status}}, delta: {eventId: net change}
  return bk.shared.rsvp;
}
// A live stand-in for the real backend's db.audit_log -- mirrors routes/_common.py's audit() so
// anything created during the preview (right now: a deleted/reported message) shows up in Admin's
// Audit log tab (GET /admin/audit-log below) right alongside the recorded fixture entries, instead
// of only existing in this session's memory.
function auditLog() {
  const bk = book();
  bk.shared = bk.shared || {};
  bk.shared.auditLog = bk.shared.auditLog || [];
  return bk.shared.auditLog;
}
function addAudit(action, target_type, target_id, meta) {
  const me = view()["/auth/me"];
  auditLog().unshift({ actor_id: me?.id || null, action, target_type, target_id, meta: meta || {}, created_at: new Date().toISOString() });
}
const HIDDEN_STATUSES = ["pending", "rejected", "changes_requested"];
function applyEdit(item, kind) {
  if (!item) return item;
  const patch = sharedContent(kind).edits[item.id];
  return patch ? { ...item, ...patch } : item;
}
// Mirrors the real backend's tier handling (routes/events.py _norm_tiers/_tier_summary): price
// and capacity are always derived from the tiers themselves, never set independently, so an
// event's badge/ticket price can't drift from what its tiers actually charge. `orders` are this
// event's known ticket sales (S.extra.sales[eventId] || []), used for each tier's sold count.
function deriveEventPricing(tiers, orders) {
  const norm = (tiers || []).filter((t) => (t.name || "").trim()).map((t, i) => ({
    id: t.id || `tier-${Date.now()}-${i}`, name: (t.name || "General admission").trim().slice(0, 60),
    price_cents: Math.max(0, Math.round(Number(t.price_cents) || 0)),
    capacity: t.capacity != null && t.capacity !== "" ? Math.max(0, Math.round(Number(t.capacity))) : null,
  }));
  const out = { ticket_tiers: norm };
  if (norm.length) {
    const prices = norm.map((t) => t.price_cents);
    const caps = norm.map((t) => t.capacity);
    out.price_cents = Math.min(...prices);
    out.capacity = caps.some((c) => c == null) ? null : caps.reduce((a, c) => a + c, 0);
    const tiersSold = norm.map((t) => {
      const sold = (orders || []).filter((o) => o.tier_id === t.id).length;
      return { ...t, sold, sold_out: t.capacity != null && sold >= t.capacity };
    });
    out.tier_summary = { has_tiers: true, min_price_cents: Math.min(...prices), max_price_cents: Math.max(...prices), tiers: tiersSold, all_sold_out: tiersSold.every((t) => t.sold_out) };
  } else {
    out.price_cents = null;
    out.tier_summary = { has_tiers: false };
  }
  return out;
}
// Merges what was recorded for this login (`base`) with what was created/edited/deleted live during
// this preview session, community-wide. `filterPending` hides not-yet-approved submissions from the
// member-facing list (mirrors the real backend's approved_q, which hides them from everyone).
function mergedList(base, kind, filterPending = true) {
  const ov = sharedContent(kind);
  let created = ov.created.filter((x) => !ov.deleted[x.id]).map((x) => applyEdit(x, kind));
  if (filterPending) created = created.filter((x) => !HIDDEN_STATUSES.includes(x.status));
  const rest = (base || []).filter((x) => !ov.deleted[x.id]).map((x) => applyEdit(x, kind));
  return [...created, ...rest];
}
// Bookmarking is personal, not shared — keyed by the viewer, so it applies cleanly to both a
// recorded fixture item and one someone created live this session. Namespaced by `kind` (resources,
// events, users) since the three id spaces are independent and this feeds the Saved section of
// /profile split the same way (see routes/saved.py's /me/saved).
function savedSet(kind = "resources") {
  const bk = book();
  bk.shared = bk.shared || {};
  bk.shared.saved = bk.shared.saved || {};
  bk.shared.saved[kind] = bk.shared.saved[kind] || {};
  return (bk.shared.saved[kind][S.email] = bk.shared.saved[kind][S.email] || {});
}
function isSaved(kind, item) {
  const sv = savedSet(kind);
  return Object.prototype.hasOwnProperty.call(sv, item.id) ? sv[item.id] : !!item.is_saved;
}
function withRsvpFields(e) {
  if (!e || !e.id) return e;
  const rv = sharedRsvp();
  const mine = (rv.byUser[e.id] || {})[S.email];
  const my_rsvp = mine !== undefined ? mine : e.my_rsvp ?? null;
  const attendee_count = Math.max(0, (e.attendee_count || 0) + (rv.delta[e.id] || 0));
  return { ...e, my_rsvp, is_attending: my_rsvp === "yes", attendee_count };
}

// ---- messaging (email-style in-app threads; see routes/messages.py) ----
// Stored the same way as events/resources: one shared bucket per community book, so every login
// (member, admin, coach) that opens the same community sees the same threads and the same replies.
// Unlike those, a thread carries its own `messages` array right on the record (simpler than two
// linked collections for a mock), and there's no per-login recorded fixture for it at all — like
// /admin/blasts/history below, this is answered live rather than looked up from a captured snapshot.
function threadStore() { return sharedContent("message_threads"); }
function threadUserById(id) {
  const all = mergedList(view()["/users"] || [], "users", false);
  return all.find((u) => u.id === id) || { id, name: "Former member", avatar_url: null, title: null };
}
function threadOut(t) {
  const me = view()["/auth/me"];
  // `role` rides along so the inbox can filter "who's it with" by Members vs. Admin & team (see
  // Inbox.jsx's filter bar and RecipientPicker's contact filter, same as routes/messages.py's
  // _thread_out does for the real backend).
  const others = t.participant_ids.filter((pid) => pid !== me.id).map(threadUserById)
    .map((u) => ({ id: u.id, name: u.name, avatar_url: u.avatar_url || null, title: u.title || null, role: u.role || null }));
  const last = t.messages[t.messages.length - 1];
  const myReadAt = (t.read_at || {})[me.id];
  const unread = !!(last && last.sender_id !== me.id && (!myReadAt || myReadAt < last.created_at));
  return {
    id: t.id, participant_ids: t.participant_ids, subject: t.subject, context: t.context || null,
    created_at: t.created_at, last_message_at: last ? last.created_at : t.created_at,
    last_message_preview: last ? (last.body.length > 140 ? last.body.slice(0, 139) + "…" : last.body) : "",
    last_sender_id: last ? last.sender_id : null,
    others, other: others[0] || null, unread,
  };
}

// ---- platform-wide people: follow, public profiles, DMs that don't need a shared community ----
// Mirrors routes/hub.py's /hub/people*, /hub/following, /hub/followers and /hub/messages/threads*,
// which are all backed by directory.person_by_email/list_all_people (merge-by-email across every
// community) and hub_db()'s follows/platform_threads/platform_messages collections. The preview has
// no real per-community `users` collections to scan, so it approximates the same merge over the
// recorded fixtures: every one of the 5 fully-recorded communities' member roster (plus anyone a live
// admin approval added to it this session), plus every hub-signup account and its saved Pathwai
// profile. Only the 5 recorded slugs are scanned (not every card on the "Discover" grid) since those
// are the only ones with an actual member roster to merge — same as `memStatus`/`BASE` already
// assume throughout this file.
function realCommunitySlugs() { return Array.from(new Set([...Object.keys(fixtures.communities), ...Object.keys(S.books)])); }
function communityRoster(slug) {
  const tmpl = fixtures.communities[slug];
  const base = tmpl ? (Object.values(tmpl.logins).find((l) => l["/users"])?.["/users"] || []) : [];
  const live = (S.books[slug]?.shared?.users?.created) || [];
  const seen = new Set(); const out = [];
  for (const u of [...live, ...base]) {
    const email = (u.email || "").trim().toLowerCase();
    if (email && !seen.has(email)) { seen.add(email); out.push(u); }
  }
  return out;
}
// One platform-wide identity per email -- hub-signup accounts (and their saved Pathwai profile) are
// the most authoritative copy where they exist, same precedence directory.person_by_email gives
// hub_db().accounts over a community's own `users` doc.
function platformDirectory() {
  const byEmail = {};
  for (const slug of realCommunitySlugs()) {
    for (const u of communityRoster(slug)) {
      const email = (u.email || "").trim().toLowerCase();
      if (!byEmail[email]) byEmail[email] = { email, name: u.name, avatar_url: u.avatar_url || null, title: u.title || "", company: u.company || "", bio: u.bio || "", photos: u.photos || [] };
    }
  }
  for (const [email, acct] of Object.entries({ ...ACCOUNTS, ...(S.extra.accounts || {}) })) {
    const prof = (S.extra.acctProfile || {})[email] || {};
    const existing = byEmail[email] || {};
    byEmail[email] = { email, name: prof.name || acct.name || existing.name || email, avatar_url: prof.avatar_url || existing.avatar_url || null,
      title: prof.title || existing.title || "", company: prof.company || existing.company || "", bio: prof.bio || existing.bio || "",
      photos: (prof.photos || existing.photos || []).slice(0, 9) };
  }
  return byEmail;
}
function personByEmail(email) {
  email = (email || "").trim().toLowerCase();
  if (!email) return null;
  return platformDirectory()[email] || null;
}
// The public-profile shape of _public_communities: every community this email is an approved member
// of, by name/logo/colors (not the fuller fixtures.communities template, which only exists for the 5
// recorded slugs — fixtures.hub has the summary card for every slug, recorded or Discover-only).
function personCommunities(email) {
  const hubEntries = [...fixtures.hub, ...(S.extra.createdCommunities || [])];
  // Membership here is "this email has a `users` doc in this community" -- same test the real
  // backend's find_all_for_email makes. A seeded fixture persona (most of this directory) is a member
  // just by being in that community's recorded roster; memStatus/BASE only covers the handful of demo
  // personas whose join status can change live during the preview (and is still checked, so e.g.
  // demo@'s overlay-approved memberships show up too).
  return realCommunitySlugs()
    .filter((slug) => communityRoster(slug).some((u) => (u.email || "").trim().toLowerCase() === email) || memStatus(email, slug) === "approved")
    .map((slug) => {
      const h = hubEntries.find((c) => c.slug === slug);
      return { slug, name: h?.name || slug, logo_url: h?.brand?.logo_url || null, colors: h?.brand?.colors || {} };
    });
}
const followKey = (follower, followee) => `${follower}|${followee}`;
function platformThreadStore() { return (S.extra.platformThreads = S.extra.platformThreads || { created: [] }); }
function platformThreadOut(t, meEmail) {
  const others = t.participant_emails.filter((e) => e !== meEmail).map((e) => {
    const p = personByEmail(e);
    return p ? { email: p.email, name: p.name, avatar_url: p.avatar_url || null, title: p.title || null, company: p.company || null } : { email: e, name: e, avatar_url: null, title: null, company: null };
  });
  const last = t.messages[t.messages.length - 1];
  const myReadAt = (t.read_at || {})[meEmail];
  const unread = !!(last && last.sender_email !== meEmail && (!myReadAt || myReadAt < last.created_at));
  return {
    id: t.id, subject: t.subject, context: t.context || null, created_at: t.created_at,
    last_message_at: last ? last.created_at : t.created_at,
    last_message_preview: last ? (last.body.length > 140 ? last.body.slice(0, 139) + "…" : last.body) : "",
    last_sender_email: last ? last.sender_email : null,
    others, other: others[0] || null, unread, community_slug: null,
  };
}

function hubList() {
  const acct = S.email;
  const all = [...fixtures.hub, ...(S.extra.createdCommunities || [])];
  return clone(all).map((c) => {
    const st = memStatus(acct, c.slug);
    const mine = (S.extra.apps || {})[c.slug] || [];
    const out = { ...c, my: { status: st, role: st === "approved" && (ADMIN_OF[acct] || []).includes(c.slug) ? "admin" : st === "approved" ? "member" : null, platform_admin: acct === "admin@yourcommunity.app" || undefined, requested_at: st === "pending" ? ((mine.find((a) => a.email === acct) || {}).requested_at || new Date().toISOString()) : null, note: null } };
    out.members = (out.members || 0) + ((S.books[c.slug] && S.books[c.slug].shared && S.books[c.slug].shared.users && S.books[c.slug].shared.users.created.length) || 0);
    if (out.my.role === "admin") {
      const tmpl = fixtures.communities[c.slug];
      if (tmpl) {
        const ov = S.extra.mship || {};
        const seeded = (tmpl.logins[Object.keys(tmpl.logins).find((e) => (ADMIN_OF[e] || []).includes(c.slug)) || ""] || {})["/admin/membership-requests"];
        out.pending_requests = Math.max(0, ((seeded && seeded.counts && seeded.counts.pending) || 0) - Object.keys(ov).filter((k) => (seeded?.requests || []).some((r) => r.id === k)).length) + mine.filter((a) => memStatus(a.email, c.slug) === "pending").length;
      } else {
        out.pending_requests = mine.filter((a) => memStatus(a.email, c.slug) === "pending").length; // freshly created — no seeded requests
      }
    }
    return out;
  });
}

// GET /hub/communities/{slug}/public (no auth) -- mirrors the real backend's _summary(slug): the
// static Discover-grid fixture as the base (name/tagline/kind/brand/counts), overlaid with whatever
// an admin edited live this session in Config/Branding, which writes into that community's own book
// (S.books[slug]), the same per-community scoping book()/S.data already give the currently-entered
// community. Returns null for an unknown slug so the caller can 404, same as the real endpoint.
function communityPublicInfo(slug) {
  const hubEntries = [...fixtures.hub, ...(S.extra.createdCommunities || [])];
  const fixture = hubEntries.find((c) => c.slug === slug);
  if (!fixture) return null;
  let cfg = null;
  if (fixtures.communities[slug] || S.books[slug]) {
    const saved = S.community;
    S.community = slug;
    cfg = S.data.public["/community/config"];
    S.community = saved;
  }
  const liveMembers = (S.books[slug]?.shared?.users?.created?.length) || 0;
  return {
    slug, name: cfg?.community_name || fixture.name, tagline: cfg?.tagline ?? fixture.tagline ?? "",
    kind: cfg?.community_kind || fixture.kind || "Community", about: cfg?.about || fixture.about || cfg?.tagline || fixture.tagline || "", about_url: cfg?.about_url || "", about_cta: cfg?.about_cta || "",
    cover: cfg?.hub_cover ?? fixture.cover ?? null, apply_questions: cfg?.apply_questions || fixture.apply_questions || [],
    // Always true -- mirrors backend/routes/hub.py's _summary(), which hardcodes this rather than
    // reading it from config, since a stale config doc could otherwise claim otherwise.
    require_approval: true, brand: cfg?.brand || fixture.brand || {},
    members: (fixture.members || 0) + liveMembers, upcoming_events: fixture.upcoming_events || 0,
  };
}
// Shared by the standalone POST /hub/communities/{slug}/apply and a signup's join_slug (below) --
// mirrors the real backend factoring both hub_apply and hub_signup's join path through
// _apply_to_community. Always lands on "pending" here regardless of the community's require_approval
// flag, same simplification the plain apply handler already made before this -- every fixture and
// freshly-created community seeds require_approval: true, so this is never visibly inconsistent in
// the demo.
function applyToCommunity(slug, { title, message, answers } = {}) {
  const existing = memStatus(S.email, slug);
  if (existing !== "none") return { status: existing };
  const prof = (S.extra.acctProfile || {})[S.email] || {};
  const name = prof.name || (ACCOUNTS[S.email] || (S.extra.accounts || {})[S.email] || {}).name || S.email;
  const why = [message, ...Object.entries(answers || {}).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join("\n");
  ((S.extra.apps = S.extra.apps || {})[slug] = S.extra.apps[slug] || []).unshift({ id: "app-" + S.email, name, email: S.email, title: title || prof.title || null, company: prof.company || null, bio: prof.bio || null, tagline: null, join_reason: why || null, avatar_url: prof.avatar_url || null, location: prof.location || null, age: prof.age || null, status: "pending", requested_at: new Date().toISOString(), decided_at: null, decided_by_name: null, note: null, skill_set: prof.skill_set || [], interests_hobbies: prof.interests_hobbies || [], goals: prof.goals || [], support_needs: prof.support_needs || [], photos: prof.photos || [], linkedin: (prof.contact || {}).linkedin || null, phone: (prof.contact || {}).phone || null, instagram: (prof.contact || {}).instagram || null, website: (prof.contact || {}).website || null });
  (S.extra.join = S.extra.join || {})[S.email + "|" + slug] = "pending";
  return { status: "pending" };
}
const sum = (id) => String(id).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
const t_sold_out = (tier, orders) => tier.capacity != null && orders.filter((o) => o.tier_id === tier.id).length >= tier.capacity;
function get(path, p, config) {
  if (path === "/admin/blasts/history") {
    let blasts = S.extra.blasts || [];
    if (p.audience_type) blasts = blasts.filter((b) => b.audience?.type === p.audience_type);
    if (p.since) blasts = blasts.filter((b) => b.at >= p.since);
    if (p.until) blasts = blasts.filter((b) => b.at <= p.until);
    return ok(config, { blasts });
  }
  const sl = path.match(/^\/admin\/events\/([^/]+)\/sales$/);
  if (sl) {
    const ev = withRsvpFields(applyEdit([...sharedContent("events").created, ...((view()["/events"]) || [])].find((x) => x.id === sl[1]), "events")) || {};
    const orders = (S.extra.sales || {})[sl[1]] || [];
    const tiers = (ev.tier_summary?.tiers || []).map((t) => ({
      id: t.id, name: t.name, price_cents: t.price_cents, capacity: t.capacity,
      sold: orders.filter((o) => o.tier_id === t.id).length,
      revenue_cents: orders.filter((o) => o.tier_id === t.id).reduce((a, o) => a + (o.amount || 0), 0),
      sold_out: t.capacity != null && orders.filter((o) => o.tier_id === t.id).length >= t.capacity,
    }));
    const v = (S.extra.views || {})[sl[1]] || { total: 0, users: [] };
    const unique = v.users.length;
    return ok(config, {
      price_cents: ev.price_cents, capacity: ev.capacity, sold: orders.length, revenue_cents: orders.reduce((a, o) => a + (o.amount || 0), 0),
      currency: "cad", attending: ev.attendee_count, orders, stripe_connected: !!stripeOn(), tiers,
      traffic: { views: v.total, unique_viewers: unique, anonymous_views: v.total - v.users.filter((u) => u !== "anon").length, conversion_rate: unique ? orders.length / unique : v.total === 0 ? 0 : null },
    });
  }
  if (path === "/auth/oauth/providers") return ok(config, { google: { label: "Google", client_id: null, configured: false }, apple: { label: "Apple", client_id: null, configured: false } });
  if (path === "/hub/account/export") return ok(config, { exported_at: new Date().toISOString(), notes: "Preview: sample export", account: { email: S.email }, communities: [] });
  if (path === "/hub/community-categories") return ok(config, { categories: Object.entries(CATEGORY_PRESETS).map(([key, v]) => ({ key, label: v.label })) });
  if (path === "/hub/me") {
    const prof = (S.extra.acctProfile || {})[S.email] || {};
    const baseName = (ACCOUNTS[S.email] || (S.extra.accounts || {})[S.email] || {}).name;
    return ok(config, { account: S.role ? { id: "acct-" + S.email, name: baseName, email: S.email, avatar_url: null, age: null,
      title: "", company: "", location: "", bio: "", skill_set: [], interests_hobbies: [], goals: [], support_needs: [], photos: [],
      contact: { phone: "", linkedin: "", instagram: "", website: "" }, ...prof, name: prof.name || baseName } : null, active: S.community });
  }
  if (path === "/hub/communities") return S.role ? ok(config, { communities: hubList(), active: S.community }) : fail(config, 401, "Not authenticated");
  const invGet = path.match(/^\/invites\/([^/]+)$/);
  if (invGet) {
    // No-auth, same as the real backend's GET /invites/{code} (routes/invites.py) -- the admin's
    // single-use invite link (JoinCommunity.jsx) is followed by someone who has no account yet, so
    // this has to work before the blanket !S.role gate below. S.extra.invites (set when the admin
    // creates one, see the POST /invites handler in write()) is a plain session-level store rather
    // than view()["/invites"], since view() only resolves while S.role is truthy.
    const inv = (S.extra.invites || {})[invGet[1]];
    if (!inv || inv.status !== "pending") return fail(config, 404, "Invite not found or already used");
    const saved = S.community;
    S.community = inv.slug;
    const cfg = S.data.public["/community/config"];
    S.community = saved;
    return ok(config, { code: inv.code, email: inv.email, role: inv.role, community_name: cfg.community_name, signup_fields: cfg.signup_fields, member_label_singular: cfg.member_label_singular });
  }
  const cpub = path.match(/^\/hub\/communities\/([^/]+)\/public$/);
  if (cpub) {
    // The external share-link landing page's one call (CommunityLanding.jsx at /c/:slug) --
    // deliberately no S.role check, same as the real backend's hub_community_public having no
    // Depends(require_account): the whole point is that someone with no account can open it.
    const info = communityPublicInfo(decodeURIComponent(cpub[1]));
    return info ? ok(config, info) : fail(config, 404, "Community not found");
  }
  if (path === "/hub/messages") {
    // The Hub page's unified "Messages centre" (see Hub.jsx's HubInbox): one merged list of every
    // approved community's own message threads, tagged with community_slug. Each community keeps
    // its threads on its own book (threadStore() reads off S.community, same as a real per-community
    // database would), so this walks every community this login is approved in, switching S.community
    // just long enough to read that one book's threads and "me" id for it, then restores whichever
    // community was actually active -- mirroring routes/hub.py's hub_messages(), which does the same
    // fan-out across real per-community databases via in_community(slug).
    if (!S.role) return fail(config, 401, "Not authenticated");
    const savedCommunity = S.community;
    const candidates = Array.from(new Set([...Object.keys(fixtures.communities), ...Object.keys(S.books)]));
    const threads = [];
    candidates.filter((slug) => memStatus(S.email, slug) === "approved").forEach((slug) => {
      S.community = slug;
      const me = view()["/auth/me"];
      if (me) threadStore().created.filter((t) => t.participant_ids.includes(me.id)).forEach((t) => threads.push({ ...threadOut(t), community_slug: slug }));
    });
    S.community = savedCommunity;
    // Platform-level DMs (community_slug: null) merge into the same unified list -- see
    // platformThreadStore() above, mirroring routes/hub.py's hub_messages fan-out across both
    // per-community message_threads and hub_db().platform_threads.
    platformThreadStore().created.filter((t) => t.participant_emails.includes(S.email)).forEach((t) => threads.push(platformThreadOut(t, S.email)));
    threads.sort((a, b) => (b.last_message_at || "").localeCompare(a.last_message_at || ""));
    return ok(config, { threads, unread: threads.filter((t) => t.unread).length });
  }
  if (path === "/hub/admin/accounts") {
    if (S.email !== "admin@yourcommunity.app") return fail(config, 403, "Platform admins only.");
    const s = q(p.q); const gone = S.extra.goneAccts || {};
    let rows = Object.values(platformDirectory()).filter((x) => x.email !== S.email && !gone[x.email])
      .filter((x) => !s || x.email.includes(s) || (x.name || "").toLowerCase().includes(s))
      .map((x) => ({ email: x.email, name: x.name || x.email, communities: ["demo"], has_account: true, platform_admin: false }));
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return ok(config, { accounts: rows.slice(0, 50), total: rows.length });
  }
  if (path === "/hub/people") {
    // Platform-wide search for following -- not any one community's member list. See
    // platformDirectory() above for why this draws from every recorded community's roster, not just
    // hub-signup accounts.
    if (!S.role) return fail(config, 401, "Not authenticated");
    const meEmail = S.email;
    const follows = S.extra.follows || {};
    const s = q(p.q);
    let out = Object.values(platformDirectory()).filter((person) => person.email !== meEmail);
    if (s) out = out.filter((person) => [person.name, person.title, person.company].some((v) => (v || "").toLowerCase().includes(s)));
    out = out.map((person) => ({ email: person.email, name: person.name, avatar_url: person.avatar_url || null, title: person.title || null, company: person.company || null, photos: (person.photos || []).slice(0, 9), is_following: !!follows[followKey(meEmail, person.email)] }));
    out.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return ok(config, { people: out.slice(0, 50) });
  }
  if (path === "/hub/following" || path === "/hub/followers") {
    if (!S.role) return fail(config, 401, "Not authenticated");
    const meEmail = S.email;
    const follows = S.extra.follows || {};
    const emails = Object.keys(follows)
      .filter((k) => (path === "/hub/following" ? k.startsWith(meEmail + "|") : k.endsWith("|" + meEmail)))
      .map((k) => (path === "/hub/following" ? k.slice(meEmail.length + 1) : k.slice(0, k.length - meEmail.length - 1)));
    const people = emails.map(personByEmail).filter(Boolean).map((p) => ({ email: p.email, name: p.name, avatar_url: p.avatar_url || null, title: p.title || null, company: p.company || null, photos: (p.photos || []).slice(0, 9) }));
    return ok(config, { people });
  }
  const ppm = path.match(/^\/hub\/people\/([^/]+)$/);
  if (ppm) {
    if (!S.role) return fail(config, 401, "Not authenticated");
    const email = decodeURIComponent(ppm[1]).trim().toLowerCase();
    const p2 = personByEmail(email);
    if (!p2) return fail(config, 404, "Person not found");
    const meEmail = S.email;
    const follows = S.extra.follows || {};
    const followers = Object.keys(follows).filter((k) => k.endsWith("|" + email)).length;
    const following = Object.keys(follows).filter((k) => k.startsWith(email + "|")).length;
    return ok(config, {
      email: p2.email, name: p2.name, avatar_url: p2.avatar_url || null, title: p2.title || null, company: p2.company || null, bio: p2.bio || null,
      photos: (p2.photos || []).slice(0, 9), communities: personCommunities(email), is_self: email === meEmail,
      is_following: !!follows[followKey(meEmail, email)], is_followed_by: !!follows[followKey(email, meEmail)], followers, following,
    });
  }
  const pdm = path.match(/^\/hub\/messages\/threads\/([^/]+)$/);
  if (pdm) {
    if (!S.role) return fail(config, 401, "Not authenticated");
    const meEmail = S.email;
    const t = platformThreadStore().created.find((x) => x.id === pdm[1]);
    if (!t || !t.participant_emails.includes(meEmail)) return fail(config, 404, "Conversation not found");
    t.read_at = { ...(t.read_at || {}), [meEmail]: new Date().toISOString() };
    return ok(config, { ...platformThreadOut(t, meEmail), messages: clone(t.messages) });
  }
  const cev = path.match(/^\/hub\/communities\/([^/]+)\/events$/);
  if (cev) {
    // Scoped to communities you're actually approved in, same guard /hub/enter uses -- lets the
    // platform message composer's attach-picker list real events without "entering" anywhere first.
    if (!S.role) return fail(config, 401, "Not authenticated");
    const slug = cev[1];
    if (!fixtures.communities[slug] && !S.books[slug]) return fail(config, 404, "Community not found");
    if (memStatus(S.email, slug) !== "approved") return fail(config, 403, "You're not a member of this community");
    const savedCommunity = S.community;
    S.community = slug;
    const events = mergedList(view()["/events"] || [], "events").map(withRsvpFields).filter((e) => !e.is_past)
      .sort((a, b) => (a.starts_at || "").localeCompare(b.starts_at || "")).slice(0, 20)
      .map((e) => ({ id: e.id, title: e.title, starts_at: e.starts_at }));
    S.community = savedCommunity;
    return ok(config, { events });
  }
  if (path === "/auth/me") return S.role && S.community ? ok(config, view()["/auth/me"]) : fail(config, 401, "Not authenticated");
  if (!S.role && !path.startsWith("/community") && !path.startsWith("/auth") && !path.startsWith("/organizations") &&
      !path.startsWith("/discover") && !path.startsWith("/mentors") && !path.startsWith("/chat")) {
    return fail(config, 401, "Not authenticated");
  }
  if (path === "/me/billing") {
    const pay = S.extra.pay || [];
    const cur = pay.find((x) => x.kind === "plan");
    return ok(config, { enabled: !!stripeOn(), plans: stripeOn() ? PLANS : [], status: cur ? "active" : null, plan: cur ? cur.description : null, payments: pay, currency: "cad" });
  }
  if (path === "/admin/integrations") return ok(config, { integrations: integ() });
  if (path === "/messages/threads") {
    const me = view()["/auth/me"];
    if (!me) return fail(config, 401, "Not authenticated");
    const ts = threadStore().created.filter((t) => t.participant_ids.includes(me.id)).map(threadOut)
      .sort((a, b) => (b.last_message_at || "").localeCompare(a.last_message_at || ""));
    return ok(config, { threads: ts, unread: ts.filter((t) => t.unread).length });
  }
  const tdm = path.match(/^\/messages\/threads\/([^/]+)$/);
  if (tdm) {
    const me = view()["/auth/me"];
    const t = threadStore().created.find((x) => x.id === tdm[1]);
    if (!t || !me || !t.participant_ids.includes(me.id)) return fail(config, 404, "Conversation not found");
    t.read_at = { ...(t.read_at || {}), [me.id]: new Date().toISOString() };
    return ok(config, { ...threadOut(t), messages: clone(t.messages) });
  }
  if (path === "/me/saved") {
    // Gathers bookmarks across the three save-able content types for the Saved tab on /profile (see
    // routes/saved.py's /me/saved) -- answered live like the messaging endpoints above, since it's a
    // view over this session's savedSet() overlays rather than anything captured in a fixture.
    const me = view()["/auth/me"];
    const events = mergedList(view()["/events"] || [], "events").map(withRsvpFields).filter((e) => isSaved("events", e))
      .sort((a, b) => (b.starts_at || "").localeCompare(a.starts_at || ""))
      .map((e) => ({ id: e.id, title: e.title, starts_at: e.starts_at, location: e.location, virtual_url: e.virtual_url, cover_url: e.cover_url, category: e.category, is_past: e.is_past }));
    const members = mergedList(view()["/users"] || [], "users", false).filter((u) => u.id !== me.id && isSaved("users", u))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .map((u) => ({ id: u.id, name: u.name, avatar_url: u.avatar_url, title: u.title, company: u.company }));
    const resources = mergedList(view()["/resources"] || [], "resources").filter((r) => isSaved("resources", r))
      .sort((a, b) => (b.published_at || "").localeCompare(a.published_at || ""))
      .map((r) => ({ id: r.id, title: r.title, category: r.category, perk_value: r.perk_value, url: r.url, cover_url: r.cover_url }));
    return ok(config, { events, members, resources });
  }
  if (path === "/community/config") {
    // Not stored on the doc itself -- mirrors the real backend's get_config() adding
    // out["slug"] = current_community(): Admin's "Share your community" card needs it to build the
    // external /c/:slug link without a second round trip.
    if (!S.role || !S.community) return fail(config, 404, "This link is not available.");
    return ok(config, { ...clone(S.data.public["/community/config"]), slug: S.community });
  }
  let d = lookup(path);
  if (d === undefined) return fail(config, 404, "This link is not available.");
  d = clone(d);

  if (path === "/me/requests") return ok(config, reqList(d, p));
  if (path.startsWith("/member-requests/") && path !== "/member-requests/kinds") {
    const live = (S.extra.reqs || {})[path.split("/")[2]];
    if (live) d = { ...d, ...live };
    if (d.status === "not_started") d.status = "in_progress";
    d.effective_status = effective(d);
    return ok(config, d);
  }
  if (path === "/me/team-support") return ok(config, { requests: [...(S.extra.team || []), ...d.requests] });
  if (path === "/me/settings") return ok(config, { ...d, settings: S.extra.settings || d.settings });
  if (path === "/me/profile-completion") return ok(config, completion());
  if (path === "/matches") {
    const acts = S.extra.acts || {};
    d.people = d.people.filter((x) => acts["person:" + x.user.id] !== "dismiss").map((x) => ({ ...x, state: acts["person:" + x.user.id] || x.state }));
    d.events = d.events.filter((x) => acts["event:" + x.id] !== "dismiss").map((x) => ({ ...x, state: acts["event:" + x.id] || x.state }));
    d.resources = d.resources.filter((x) => acts["resource:" + x.id] !== "dismiss").map((x) => ({ ...x, state: acts["resource:" + x.id] || x.state }));
    return ok(config, d);
  }
  if (path === "/announcements") return ok(config, mergedList(d, "announcements"));
  if (path === "/admin/member-requests") {
    d.requests = d.requests.map((r) => { const l = (S.extra.reqs || {})[r.id]; return l ? { ...r, ...l, effective_status: effective({ ...r, ...l }) } : r; });
    if (p.status && p.status !== "all") d.requests = d.requests.filter((r) => r.effective_status === p.status);
    d.counts = d.requests.reduce((a, r) => ({ ...a, [r.effective_status]: (a[r.effective_status] || 0) + 1 }), {});
    return ok(config, d);
  }
  if (path === "/me/calendar") { const feed = "https://pathwai.example/api/calendar/feed/demo-token.ics?community=" + slugOf(); return ok(config, { feed_url: feed, webcal_url: feed.replace("https://", "webcal://"), google_url: "https://calendar.google.com/calendar/r?cid=" + encodeURIComponent(feed.replace("https://", "webcal://")) }); }
  if (path === "/admin/google-forms/setup") { const u = "https://pathwai.example/api/webhooks/google-forms/demo-secret?community=" + slugOf(); return ok(config, { webhook_url: u, script: "function onFormSubmit(e) {\n  UrlFetchApp.fetch(\"" + u + "\", { method: \"post\" });\n}\n" }); }
  if (path === "/admin/membership-requests") {
    const ov = S.extra.mship || {};
    let rows = [...appsHere(), ...d.requests].map((r) => (ov[r.id] ? { ...r, ...ov[r.id] } : r));
    // Everyone already in the community is an approved member too (same as the real list, which treats a missing
    // status as approved) -- that's who the admin's Delete / reset-link buttons act on.
    const listed = new Set(rows.map((r) => (r.email || "").toLowerCase()));
    for (const u of communityRoster(slugOf())) {
      const em = (u.email || "").trim().toLowerCase();
      if (!em || em === (S.email || "").toLowerCase() || listed.has(em)) continue;
      listed.add(em);
      const row = { id: u.id, name: u.name, email: u.email, title: u.title || "", company: u.company || "", bio: u.bio || "", avatar_url: u.avatar_url || null, location: u.location || "", status: "approved",
        requested_at: u.created_at || new Date().toISOString(), skill_set: u.skill_set || [], interests_hobbies: u.interests_hobbies || [], goals: u.goals || [], support_needs: u.support_needs || [] };
      rows.push(ov[u.id] ? { ...row, ...ov[u.id] } : row);
    }
    rows = rows.filter((r) => !r.removed);
    const counts = rows.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), { pending: 0, approved: 0, rejected: 0 });
    if (p.status && p.status !== "all") rows = rows.filter((r) => r.status === p.status);
    return ok(config, { requests: rows, counts });
  }
  if (path === "/admin/moderation") {
    const decided = S.extra.moderated || {};
    const dyn = [];
    for (const kind of ["events", "resources", "announcements"]) {
      for (const item of sharedContent(kind).created) {
        if (item.status === "pending" && !decided[item.id]) dyn.push({ kind: kind.slice(0, -1), id: item.id, title: item.title || item.name, status: "pending", note: null });
      }
    }
    d.items = [...dyn, ...d.items.filter((i) => !decided[i.id])];
    return ok(config, d);
  }
  if (path === "/admin/team-support") {
    d.requests = [...(S.extra.team || []), ...d.requests].map((r) => ({ ...r, ...((S.extra.teamUpd || {})[r.id] || {}) }));
    return ok(config, d);
  }
  if (path === "/admin/action-center") { { const ov = S.extra.mship || {}; const apps = appsHere(); d.pending_memberships = d.pending_memberships - Object.keys(ov).filter((k) => !apps.some((x) => x.id === k)).length + apps.filter((x) => !ov[x.id]).length; } d.pending_moderation = d.pending_moderation - Object.keys(S.extra.moderated || {}).length; return ok(config, d); }

  if (path === "/dashboard") {
    const ov = S.extra.mship || {};
    if (isAdminHere()) {
      const all = [...appsHere(), ...(d.membership_requests || [])].filter((r) => !ov[r.id]);
      d = { ...d, membership_requests: all.slice(0, 5), membership_requests_total: all.length + Math.max(0, (d.membership_requests_total || 0) - (d.membership_requests || []).length) };
    }
    return ok(config, d);
  }
  if (path === "/users") {
    d = mergedList(d, "users", false).map((u) => (u.id === (view()["/auth/me"] || {}).id ? u : { ...u, is_saved: isSaved("users", u) }));
    const s = q(p.q);
    if (s) d = d.filter((u) => has([u.name, u.company, u.bio, u.expertise, u.services_offered, u.startup_one_liner], s));
    for (const [k, fields] of [["offer", ["services_offered", "topics_can_advise_on", "expertise", "open_to"]], ["looking_for", ["needs_seeking", "growing_in", "goals"]], ["interest", ["interests_hobbies"]]]) {
      if (p[k] && p[k] !== "all") d = d.filter((u) => fields.some((f) => has(u[f] || [], q(p[k]))));
    }
    if (p.saved) d = d.filter((u) => u.is_saved);
    return ok(config, d);
  }
  if (path.match(/^\/users\/[^/]+$/)) { const u = applyEdit(d, "users"); return ok(config, { ...u, is_saved: isSaved("users", u) }); }
  if (path === "/events") {
    d = mergedList(d, "events").map(withRsvpFields).map((e) => ({ ...e, is_saved: isSaved("events", e) }));
    if (p.upcoming === true || p.upcoming === "true") d = d.filter((e) => !e.is_past);
    if (p.upcoming === false || p.upcoming === "false") d = d.filter((e) => e.is_past);
    if (p.saved) d = d.filter((e) => e.is_saved);
    return ok(config, d);
  }
  if (path.match(/^\/events\/[^/]+$/)) {
    if (sharedContent("events").deleted[d.id]) return fail(config, 404, "This event was removed.");
    const ev = withRsvpFields(applyEdit(d, "events"));
    // Defensive fallback: EventDetail.jsx reads e.attendees.length with no optional-chain guard, so
    // this can never come back undefined (see the matching comment on event creation above).
    return ok(config, { attendees: [], ...ev, is_saved: isSaved("events", ev) });
  }
  if (path === "/resources") {
    d = mergedList(d, "resources").map((r) => ({ ...r, is_saved: isSaved("resources", r) }));
    if (p.q) d = d.filter((r) => has([r.title, r.description, r.tags], q(p.q)));
    if (p.source && p.source !== "all") d = d.filter((r) => r.source === p.source);
    if (p.saved) d = d.filter((r) => r.is_saved);
    return ok(config, d);
  }
  if (path === "/support-requests") {
    const me = view()["/auth/me"];
    let r = mergedList(d, "support_requests", false);
    if (p.mine) r = r.filter((x) => x.user_id === me.id);
    else if (p.status && p.status !== "all") r = r.filter((x) => x.status === p.status);
    return ok(config, r);
  }
  if (path === "/discover") {
    const s = q(p.q);
    const f = (arr) => (s ? arr.filter((x) => has(x, s)) : arr);
    const r = { programs: [], grants: [], mentors: [] };
    if (!p.kind || p.kind === "all" || p.kind === "program") r.programs = f(d.programs);
    if (!p.kind || p.kind === "all" || p.kind === "grant") r.grants = f(d.grants);
    if (!p.kind || p.kind === "all" || p.kind === "mentor") r.mentors = f(d.mentors);
    r.counts = { programs: r.programs.length, grants: r.grants.length, mentors: r.mentors.length, total: r.programs.length + r.grants.length + r.mentors.length };
    return ok(config, r);
  }
  if (path === "/organizations") {
    let o = d.organizations;
    if (p.q) o = o.filter((x) => has([x.name, x.tagline, x.focus_areas], q(p.q)));
    if (p.type && p.type !== "all") o = o.filter((x) => x.type === p.type);
    if (p.region && p.region !== "all") o = o.filter((x) => x.region === p.region);
    return ok(config, { organizations: o, total: o.length });
  }
  if (path === "/admin/audit-log/actions") {
    const live = new Set(auditLog().map((e) => e.action));
    return ok(config, { actions: [...new Set([...(d.actions || []), ...live])].filter(Boolean).sort() });
  }
  if (path === "/admin/audit-log") {
    let entries = [...auditLog(), ...d.entries].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    if (p.action && p.action !== "all") entries = entries.filter((e) => e.action === p.action);
    const actors = { ...d.actors };
    const users = mergedList(view()["/users"] || [], "users", false);
    for (const e of entries) {
      if (e.actor_id && !actors[e.actor_id]) {
        const u = users.find((x) => x.id === e.actor_id);
        if (u) actors[e.actor_id] = { id: u.id, name: u.name, role: u.role };
      }
    }
    return ok(config, { entries, actors, total: entries.length });
  }
  return ok(config, d);
}

function write(method, path, body, config) {
  if (path === "/auth/login") {
    const acct = ACCOUNTS[body.email] ? { ...ACCOUNTS[body.email], pw: "Demo123!" } : (S.extra.accounts || {})[body.email];
    if (!acct) return fail(config, 401, "Invalid email or password");
    const override = (S.extra.pwOverrides || {})[body.email];
    const expectedPw = override !== undefined ? override : acct.pw;
    if (body.password !== expectedPw) return fail(config, 401, "Invalid email or password");
    S.role = acct.role; S.email = body.email;
    const first = ["playr", "grace", "the-village", "club-pto"].find((k) => memStatus(S.email, k) === "approved");
    S.community = first || null;
    return ok(config, { ok: true, user: S.community ? view()["/auth/me"] : null, account: { id: "acct-" + S.email, name: acct.name, email: S.email } });
  }
  if (path === "/auth/logout") { S.role = null; S.email = null; S.community = null; return ok(config, { ok: true }); }
  if (path === "/auth/forgot-password") {
    // Same shape as the real backend: always a generic response, so this can't be used to probe which emails exist.
    // There's no real inbox in this preview, so — unlike production, which only emails the link —
    // the response hands the link straight back for the UI to display; ForgotPassword.jsx shows it
    // behind an explicit "this is a demo" note rather than pretending an email was sent.
    const email = (body.email || "").trim().toLowerCase();
    let demo_reset_link = null;
    if (ACCOUNTS[email] || (S.extra.accounts || {})[email]) {
      const token = "demo-reset-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      (S.extra.resetTokens = S.extra.resetTokens || {})[token] = email;
      demo_reset_link = `#/reset-password?token=${token}`;
    }
    return ok(config, { ok: true, message: "If an account exists for that email, we've sent a reset link.", demo_reset_link });
  }
  if (path === "/auth/reset-password") {
    const email = (S.extra.resetTokens || {})[body.token];
    if (!email) return fail(config, 400, "This reset link is invalid or has expired. Request a new one.");
    (S.extra.pwOverrides = S.extra.pwOverrides || {})[email] = body.password;
    delete S.extra.resetTokens[body.token];
    return ok(config, { ok: true });
  }
  if (path === "/auth/oauth/google" || path === "/auth/oauth/apple") {
    // Real Google/Apple SDKs can't load inside this bundled preview, so both buttons simulate
    // signing in as the member demo persona — same account the "Try the demo" button uses.
    // The first social sign-in on a page load plays out as a brand-new person: like the real backend, it
    // answers 428 until the Terms/Privacy agreement is sent along, so the preview shows that step too.
    if (!S.extra.socialSeen) {
      if (!body.accepted_terms) return fail(config, 428, { error: "You need to accept the Terms of Service and Privacy Policy to create an account.", code: "terms_required" });
      S.extra.socialSeen = true;
    }
    const email = "demo@yourcommunity.app";
    const acct = ACCOUNTS[email];
    S.role = acct.role; S.email = email;
    const first = ["playr", "grace", "the-village", "club-pto"].find((k) => memStatus(email, k) === "approved");
    S.community = first || null;
    // Same share-link join as /hub/signup's join_slug -- carries a community's "I'm here to join
    // X" context through social sign-in instead of silently dropping it just because the person
    // chose Google/Apple over the email form. Mirrors backend/routes/oauth.py's oauth_login,
    // which added this for the same reason: every community requires approval, so this never
    // seats anyone immediately -- it just makes sure a request actually gets filed.
    let joined = null;
    if (body.join_slug && communityPublicInfo(body.join_slug)) {
      joined = { slug: body.join_slug, ...applyToCommunity(body.join_slug) };
    }
    return ok(config, { ok: true, user: S.community ? view()["/auth/me"] : null, account: { id: "acct-" + email, name: acct.name, email }, new_account: false, joined });
  }
  if (path === "/hub/signup") {
    if (body.accepted_terms !== true) return fail(config, 422, "You need to accept the Terms of Service and Privacy Policy to create an account.");
    if (ACCOUNTS[body.email] || (S.extra.accounts || {})[body.email]) return fail(config, 409, "An account with that email already exists. Sign in instead.");
    (S.extra.accounts = S.extra.accounts || {})[body.email] = { name: body.name, role: "member", pw: body.password };
    S.role = "member"; S.email = body.email; S.community = null;
    // Came from a community's external share link (/c/:slug -> "Request to join"/"Join") --
    // silently ignored, same as the real backend, if the slug is unknown or stale.
    let joined = null;
    if (body.join_slug && communityPublicInfo(body.join_slug)) {
      joined = { slug: body.join_slug, ...applyToCommunity(body.join_slug) };
    }
    return ok(config, { ok: true, account: { id: "acct-" + body.email, name: body.name, email: body.email }, joined }, 201);
  }
  if (path === "/hub/communities" && method === "post") {
    if (!S.role || !S.email) return fail(config, 401, "Not authenticated");
    const name = (body.name || "").trim();
    if (name.length < 2) return fail(config, 400, "Give your community a name.");
    const category = CATEGORY_PRESETS[body.category] ? body.category : "other";
    const preset = CATEGORY_PRESETS[category];
    const slug = slugify(name);
    const now = new Date().toISOString();
    const template = fixtures.communities.grace;
    const themes = template.public["/community/presets"].themes;
    const theme = themes.find((t) => t.preset === preset.theme_preset) || themes[0];
    const singular = preset.member_plural.endsWith("s") ? preset.member_plural.slice(0, -1) : preset.member_plural;

    const pub = blank(template.public);
    for (const k of REFERENCE_PUBLIC_KEYS) pub[k] = clone(template.public[k]);
    // Mirrors backend routes/hub.py's create_community: start from DEFAULT_CONFIG (generic nav,
    // member types, profile fields — not whichever recorded community's own flavour) and rebrand
    // just the bits the category preset and the admin's own input determine.
    pub["/community/config"] = {
      ...clone(DEFAULT_CONFIG),
      community_name: name, tagline: (body.tagline || "").trim() || `Welcome to ${name}.`,
      community_kind: preset.kind, community_type: "social",
      member_label_singular: singular, member_label_plural: preset.member_plural,
      event_types: [...preset.event_types],
      theme: { preset: theme.preset, accent: theme.accent },
      brand: {
        ...clone(DEFAULT_CONFIG.brand),
        preset: theme.preset, mode: theme.mode, colors: { ...theme.colors },
        font: theme.font, heading_font: theme.heading_font, heading_style: theme.heading_style,
        radius: theme.radius, button_shape: theme.button_shape,
        login_headline: `Welcome to ${name}.`, login_subhead: "Sign in to find events and people.",
        welcome_message: `Welcome to ${name}. Here's what's happening this week.`, footer_text: name,
      },
      setup_completed: false, updated_at: now,
    };

    const acct = ACCOUNTS[S.email] || (S.extra.accounts || {})[S.email] || { name: S.email };
    const prof = (S.extra.acctProfile || {})[S.email] || {};
    const login = blank(template.logins["admin@yourcommunity.app"]);
    // "Founder" and the community's own name stay fixed here (that's what makes this the founding
    // entry), but personal details still carry over from the standard Pathwai profile, same as the backend.
    const founderName = prof.name || acct.name;
    login["/auth/me"] = { ...login["/auth/me"], id: "u-" + slug + "-founder", name: founderName, email: S.email, role: "admin", member_type: "founder",
      company: name, title: "Founder", location: prof.location || "", bio: prof.bio || "", age: prof.age || null, skill_set: prof.skill_set || [], expertise: prof.skill_set || [],
      interests_hobbies: prof.interests_hobbies || [], interests: prof.interests_hobbies || [], goals: prof.goals || [], support_needs: prof.support_needs || [],
      needs_seeking: prof.support_needs || [], avatar_url: prof.avatar_url || null, photos: prof.photos || [], contact: { email: S.email, ...(prof.contact || {}) }, memberships_space_slugs: [slug],
      active_space_slug: null, platform_admin: false, header_stats: [], created_at: now, updated_at: now };
    login["/dashboard"] = { ...login["/dashboard"], me: login["/auth/me"], community_name: name };
    login["/admin/overview"] = { members: 1, events: 0, resources: 0, open_support_requests: 0, pending_applications: 0, invites: 0 };
    login["/me/settings"] = { ...login["/me/settings"], account: { name: founderName, email: S.email, member_type: "founder" } };

    S.books[slug] = { public: pub, logins: { [S.email]: login } };
    ADMIN_OF[S.email] = [...(ADMIN_OF[S.email] || []), slug];
    (S.extra.join = S.extra.join || {})[S.email + "|" + slug] = "approved";
    (S.extra.createdCommunities = S.extra.createdCommunities || []).push({
      slug, name, tagline: pub["/community/config"].tagline, kind: preset.kind, about: "", cover: null,
      apply_questions: [], require_approval: true, brand: pub["/community/config"].brand, members: 1, upcoming_events: 0,
    });
    S.community = slug;
    return ok(config, { ok: true, slug }, 201);
  }
  if (/^\/hub\/communities\/[^/]+\/apply$/.test(path)) {
    const slug = path.split("/")[3];
    // Pre-filled from the standard Pathwai profile saved via PATCH /hub/profile, same as the real
    // backend's hub_apply -- applyToCommunity() above is shared with a signup's join_slug path, same
    // reasoning as the real backend factoring both through _apply_to_community.
    const { status } = applyToCommunity(slug, { title: body.title, message: body.message, answers: body.answers });
    return ok(config, { ok: true, status }, 201);
  }
  if (path === "/hub/enter") {
    if (memStatus(S.email, body.slug) !== "approved") return fail(config, 403, "You're not a member of this community yet.");
    S.community = body.slug;
    return ok(config, { ok: true, slug: body.slug });
  }
  if (path === "/hub/leave-community") { S.community = null; return ok(config, { ok: true }); }
  if (path === "/hub/profile" && method === "patch") {
    if (!S.role || !S.email) return fail(config, 401, "Not authenticated");
    const prof = { ...((S.extra.acctProfile || {})[S.email] || {}), ...body, profile_completed: true };
    if ("birthday" in body) { // mirrors routes/hub.py: age follows the birthday
      const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(body.birthday || ""); const t = new Date();
      prof.age = b ? t.getFullYear() - +b[1] - ((t.getMonth() + 1 < +b[2] || (t.getMonth() + 1 === +b[2] && t.getDate() < +b[3])) ? 1 : 0) : null;
    }
    if (prof.photos) prof.photos = prof.photos.filter(Boolean).slice(0, 9); // mirrors routes/hub.py's MAX_PROFILE_PHOTOS
    (S.extra.acctProfile = S.extra.acctProfile || {})[S.email] = prof;
    return ok(config, { ok: true, account: { id: "acct-" + S.email, name: (ACCOUNTS[S.email] || (S.extra.accounts || {})[S.email] || {}).name, email: S.email, ...prof } });
  }
  const flw = path.match(/^\/hub\/people\/([^/]+)\/follow$/);
  if (flw && (method === "post" || method === "delete")) {
    if (!S.role) return fail(config, 401, "Not authenticated");
    const email = decodeURIComponent(flw[1]).trim().toLowerCase();
    const meEmail = S.email;
    S.extra.follows = S.extra.follows || {};
    if (method === "delete") { delete S.extra.follows[followKey(meEmail, email)]; return ok(config, { ok: true, is_following: false }); }
    if (email === meEmail) return fail(config, 400, "You can't follow yourself");
    if (!personByEmail(email)) return fail(config, 404, "Person not found");
    S.extra.follows[followKey(meEmail, email)] = true;
    return ok(config, { ok: true, is_following: true }, 201);
  }
  if (path === "/hub/messages/threads" && method === "post") {
    // Platform-level DM/invite/share -- doesn't need a shared community, unlike /messages/threads
    // below. See platformThreadStore() above.
    if (!S.role) return fail(config, 401, "Not authenticated");
    if (!(body.body || "").trim()) return fail(config, 400, "Write a message");
    const meEmail = S.email;
    const recipients = [...new Set((body.recipient_emails || []).map((e) => String(e).trim().toLowerCase()).filter((e) => e && e !== meEmail))];
    if (!recipients.length) return fail(config, 400, "Add at least one recipient");
    for (const r of recipients) if (!personByEmail(r)) return fail(config, 404, "One of the people you added isn't on Pathwai");
    const participants = [...new Set([meEmail, ...recipients])].sort();
    const store = platformThreadStore();
    let t = store.created.find((x) => { const ps = x.participant_emails.slice().sort(); return ps.length === participants.length && ps.every((v, i) => v === participants[i]); });
    const now = new Date().toISOString();
    if (!t) {
      t = { id: "pthread-" + Date.now(), participant_emails: participants, subject: (body.subject || "").trim().slice(0, 140) || "New message", context: body.context || null, created_at: now, read_at: { [meEmail]: now }, messages: [] };
      store.created.unshift(t);
    }
    t.messages.push({ id: "pmsg-" + Date.now(), sender_email: meEmail, body: body.body.trim(), created_at: now });
    t.read_at = { ...(t.read_at || {}), [meEmail]: now };
    return ok(config, platformThreadOut(t, meEmail), 201);
  }
  const ptrm = path.match(/^\/hub\/messages\/threads\/([^/]+)\/reply$/);
  if (ptrm && method === "post") {
    if (!S.role) return fail(config, 401, "Not authenticated");
    if (!(body.body || "").trim()) return fail(config, 400, "Write a message");
    const meEmail = S.email;
    const t = platformThreadStore().created.find((x) => x.id === ptrm[1]);
    if (!t || !t.participant_emails.includes(meEmail)) return fail(config, 404, "Conversation not found");
    const now = new Date().toISOString();
    t.messages.push({ id: "pmsg-" + Date.now(), sender_email: meEmail, body: body.body.trim(), created_at: now });
    t.read_at = { ...(t.read_at || {}), [meEmail]: now };
    return ok(config, { ok: true }, 201);
  }
  // Same delete/report pair the community thread handlers above have (delm/the message-report
  // match) -- mirrors routes/hub.py's delete_platform_message/report_platform_message, since a
  // platform DM had no equivalent until now.
  const pdelm = path.match(/^\/hub\/messages\/threads\/([^/]+)\/messages\/([^/]+)$/);
  if (pdelm && method === "delete") {
    if (!S.role) return fail(config, 401, "Not authenticated");
    const meEmail = S.email;
    const t = platformThreadStore().created.find((x) => x.id === pdelm[1]);
    if (!t || !t.participant_emails.includes(meEmail)) return fail(config, 404, "Conversation not found");
    const m = t.messages.find((x) => x.id === pdelm[2]);
    if (!m) return fail(config, 404, "Message not found");
    if (m.sender_email !== meEmail) return fail(config, 403, "Only the sender can delete this message");
    t.messages = t.messages.filter((x) => x.id !== pdelm[2]);
    return ok(config, { ok: true });
  }
  const prepm = path.match(/^\/hub\/messages\/threads\/([^/]+)\/messages\/([^/]+)\/report$/);
  if (prepm && method === "post") {
    if (!S.role) return fail(config, 401, "Not authenticated");
    const meEmail = S.email;
    const t = platformThreadStore().created.find((x) => x.id === prepm[1]);
    if (!t || !t.participant_emails.includes(meEmail)) return fail(config, 404, "Conversation not found");
    const m = t.messages.find((x) => x.id === prepm[2]);
    if (!m) return fail(config, 404, "Message not found");
    if (!(body.reason || "").trim()) return fail(config, 400, "Tell the team why you're reporting this message");
    (S.extra.platformReports = S.extra.platformReports || []).push({ id: "prep-" + Date.now(), thread_id: t.id, message_id: m.id, reported_by: meEmail, reported_user_email: m.sender_email, reason: body.reason.trim() });
    return ok(config, { ok: true }, 201);
  }
  if (path.endsWith("/rsvp")) {
    const id = path.split("/")[2];
    const ov = sharedContent("events");
    if (ov.deleted[id]) return fail(config, 404, "This event was removed.");
    const baseEvent = applyEdit([...ov.created, ...((view()["/events"]) || [])].find((x) => x.id === id), "events");
    const rv = sharedRsvp();
    rv.byUser[id] = rv.byUser[id] || {};
    const priorOverlay = rv.byUser[id][S.email];
    const baseline = priorOverlay !== undefined ? priorOverlay : (baseEvent?.my_rsvp ?? null);
    const status = body.status === undefined ? (baseline === "yes" ? null : "yes") : body.status;
    if (status === "yes" && baseEvent?.price_cents && baseline !== "yes" && !isAdminHere()) return fail(config, 402, "This event needs a ticket. Buy one to reserve your spot.");
    rv.delta[id] = (rv.delta[id] || 0) + ((status === "yes" ? 1 : 0) - (baseline === "yes" ? 1 : 0));
    rv.byUser[id][S.email] = status;
    const attendee_count = Math.max(0, (baseEvent?.attendee_count || 0) + rv.delta[id]);
    return ok(config, { ok: true, is_attending: status === "yes", my_rsvp: status, attendee_count });
  }
  if (path.endsWith("/feedback") || path.endsWith("/open") || path === "/matches/action" && false) return ok(config, { ok: true });
  if (path === "/matches/action") { (S.extra.acts = S.extra.acts || {})[`${body.kind}:${body.target_id}`] = body.action === "undo" ? undefined : body.action; return ok(config, { ok: true }); }
  if (path.startsWith("/member-requests/") && path !== "/member-requests/kinds") {
    const id = path.split("/")[2], op = path.split("/")[3];
    const cur = { ...(view()[`/member-requests/${id}`] || {}), ...((S.extra.reqs = S.extra.reqs || {})[id] || {}) };
    if (op === "submit") {
      const missing = (cur.fields || []).filter((f) => f.required && !filled(body.response?.[f.key]));
      if (missing.length) return fail(config, 400, "Please fill in: " + missing.map((f) => f.label).join(", "));
      S.extra.reqs[id] = { status: "submitted", response: body.response, submitted_at: new Date().toISOString(), applied_fields: Object.keys(body.response || {}).filter((k) => LABELS[k]) };
      S.extra.profile = { ...(S.extra.profile || {}), ...(body.response || {}) };
      return ok(config, { ok: true, applied_fields: S.extra.reqs[id].applied_fields });
    }
    if (op === "save") { S.extra.reqs[id] = { ...(S.extra.reqs[id] || {}), status: "in_progress", draft: body.response }; return ok(config, { ok: true }); }
    if (op === "external-open") { S.extra.reqs[id] = { ...(S.extra.reqs[id] || {}), status: "in_progress" }; return ok(config, { ok: true, url: cur.external_url }); }
    if (op === "external-complete") { S.extra.reqs[id] = { status: "submitted", response: { completed_external_form: true }, submitted_at: new Date().toISOString() }; return ok(config, { ok: true }); }
  }
  if (path === "/me/settings" && method === "patch") {
    const cur = S.extra.settings || clone(view()["/me/settings"].settings);
    for (const k of Object.keys(body)) cur[k] = body[k] && typeof body[k] === "object" ? { ...cur[k], ...body[k], ...(body[k].kinds ? { kinds: { ...cur[k].kinds, ...body[k].kinds } } : {}) } : body[k];
    S.extra.settings = cur; return ok(config, { settings: cur });
  }
  if (path === "/me/change-password") {
    if (body.current_password !== "Demo123!") return fail(config, 400, "Your current password is not correct.");
    return /^(?=.*[A-Za-z])(?=.*\d).{10,}$/.test(body.new_password || "") ? ok(config, { ok: true }) : fail(config, 400, "Password needs 10+ characters with a letter and a number.");
  }
  if (path === "/hub/account/sign-out-everywhere") return ok(config, { ok: true });
  if (path === "/hub/admin/accounts/reset-link") return ok(config, { link: "https://pathwai.example/reset-password?token=demo-one-time-link", expires_in_days: 7 });
  if (path === "/hub/admin/accounts/delete") {
    if ((body.confirm || "").toUpperCase() !== "DELETE") return fail(config, 400, "Type DELETE to confirm.");
    (S.extra.goneAccts = S.extra.goneAccts || {})[(body.email || "").toLowerCase()] = true;
    return ok(config, { ok: true, communities: [] });
  }
  const umem = path.match(/^\/admin\/users\/([^/]+)(\/reset-link)?$/);
  if (umem && method === "post" && umem[2]) return ok(config, { link: "https://pathwai.example/reset-password?token=demo-one-time-link", expires_in_days: 7, email: "", name: "" });
  if (umem && method === "delete" && !umem[2]) {
    const id = decodeURIComponent(umem[1]);
    (S.extra.mship = S.extra.mship || {})[id] = { ...((S.extra.mship || {})[id] || {}), removed: true };
    sharedContent("users").deleted[id] = true;
    return ok(config, { ok: true, account_deleted: false });
  }
  if (path === "/hub/account/delete") return (body.confirm || "").toUpperCase() === "DELETE" ? ok(config, { ok: true }) : fail(config, 400, "Type DELETE to confirm.");
  if (path === "/me/profile" && method === "patch") {
    const vals = { ...body.values };
    if (vals.age !== undefined) vals.age = parseInt(vals.age, 10) || null;
    [["support_needs", "needs_seeking"], ["skill_set", "expertise"], ["interests_hobbies", "interests"]].forEach(([a, b]) => { if (vals[a]) vals[b] = vals[a]; });
    S.extra.profile = { ...(S.extra.profile || {}), ...vals };
    const me = view()["/auth/me"];
    // Also a shared edit — someone updating their own profile should show up in the directory for
    // admin and every other member, not just their own logged-in view.
    const ov = sharedContent("users");
    ov.edits[me.id] = { ...(ov.edits[me.id] || {}), ...vals };
    const created = ov.created.find((x) => x.id === me.id);
    if (created) Object.assign(created, vals);
    const u = { ...(view()[`/users/${me.id}`] || me), ...S.extra.profile };
    view()[`/users/${me.id}`] = u;
    return ok(config, { user: u, completion: completion() });
  }
  if (path === "/team-support") {
    const me = view()["/auth/me"];
    const doc = { id: "team-" + Date.now(), user_id: me.id, to_team: true, user_snapshot: { name: me.name }, status: "submitted", category_label: body.category, urgency: body.urgency, created_at: new Date().toISOString(), timeline: [{ status: "submitted", at: new Date().toISOString(), by: me.name }], ...body };
    (S.extra.team = S.extra.team || []).unshift(doc); return ok(config, doc, 201);
  }
  if (path.startsWith("/admin/team-support/")) { const id = path.split("/")[3]; const u = (S.extra.teamUpd = S.extra.teamUpd || {}); u[id] = { ...(u[id] || {}), ...(body.status ? { status: body.status } : {}), ...(body.assignee_id ? { assignee_id: body.assignee_id, status: u[id]?.status || "assigned" } : {}), ...(body.response ? { last_response: body.response } : {}) }; return ok(config, { ok: true }); }
  if (path.startsWith("/admin/member-requests/") && path.endsWith("/review")) { const id = path.split("/")[3]; (S.extra.reqs = S.extra.reqs || {})[id] = { ...(S.extra.reqs[id] || {}), status: body.status }; return ok(config, { ok: true }); }
  if (path === "/admin/member-requests") { return ok(config, { created: 3, ids: [] }, 201); }
  if (path === "/me/calendar" || path === "/me/calendar/reset") { const feed = "https://pathwai.example/api/calendar/feed/demo-token.ics?community=" + slugOf(); return ok(config, { feed_url: feed, webcal_url: feed.replace("https://", "webcal://"), google_url: "https://calendar.google.com/calendar/r?cid=" + encodeURIComponent(feed.replace("https://", "webcal://")) }); }
  if (path === "/admin/google-forms/setup" || path === "/admin/google-forms/reset") { const u = "https://pathwai.example/api/webhooks/google-forms/demo-secret?community=" + slugOf(); return ok(config, { webhook_url: u, script: "function onFormSubmit(e) {\n  UrlFetchApp.fetch(\"" + u + "\", { method: \"post\" });\n}\n" }); }
  if (path === "/admin/members/import") {
    // Demo only: a rough read of the pasted/uploaded text (name,email per line) so the screen can be tried.
    const lines = String(body.csv || "").split(/\r?\n/).filter((l) => l.trim());
    const rows = lines.slice(1).map((l, i) => { const [name, email] = l.split(/[,;\t]/).map((x) => (x || "").trim()); return { line: i + 2, name: name || "Unnamed member", email: email || "", notes: email ? [] : ["no email: they can't sign in until you add one"], status: body.dry_run ? "will_create" : "created" }; });
    return ok(config, { dry_run: !!body.dry_run, total: rows.length, created: rows.length, skipped: 0, without_email: rows.filter((r) => !r.email).length, already_have_login: 0, with_notes: 0, columns_used: ["name", "email"], columns_ignored: [], emailed: 0, email_configured: false, link_days: 7, rows: body.dry_run ? rows : rows.map((r) => (r.email ? { ...r, link: "https://example.com/reset-password?token=demo" } : r)) });
  }
  if (/^\/admin\/membership-requests\/[^/]+\/decision$/.test(path)) {
    const id = path.split("/")[3]; const okd = body.decision === "approve";
    const app = appsHere().find((x) => x.id === id);
    if (app) {
      (S.extra.join = S.extra.join || {})[app.email + "|" + slugOf()] = okd ? "approved" : "rejected";
      // Approving a request seats a real member — put them in the shared directory so admin AND
      // every other member see them right away, not just whoever clicked Approve.
      const users = sharedContent("users");
      if (okd && !users.created.some((u) => u.email === app.email)) {
        users.created.push({
          id: "u-" + app.email.split("@")[0].replace(/[^a-z0-9]/gi, "-"), name: app.name, email: app.email, role: "member", member_type: "member",
          title: app.title || "", company: app.company || "", bio: app.bio || "", location: app.location || "", avatar_url: app.avatar_url || null,
          skill_set: app.skill_set || [], expertise: app.skill_set || [], interests_hobbies: [], goals: [], support_needs: [], needs_seeking: [], open_to: [],
          // Personal photo gallery from the applicant's account-level profile (same field the real
          // backend now merges onto community member records from hub_db().accounts) -- otherwise an
          // approved member's own photos would only ever show up in the platform-wide People panel.
          photos: app.photos || [],
          contact: { email: app.email }, contact_visibility: "members", hidden_from_directory: false, created_at: new Date().toISOString(),
        });
      }
    }
    (S.extra.mship = S.extra.mship || {})[id] = { status: okd ? "approved" : "rejected", decided_at: new Date().toISOString(), decided_by_name: "Fife Ashley-Dejo", note: body.note || null };
    return ok(config, { ok: true, status: okd ? "approved" : "rejected" });
  }
  if (path.startsWith("/admin/moderation/")) {
    // The URL and the queue item both use the singular ("event"/"resource"/"announcement") — map to
    // the plural bucket sharedContent actually stores under (mirrors backend's COLLECTIONS dict).
    const kindSingular = path.split("/")[3], id = path.split("/")[4];
    const kind = { event: "events", resource: "resources", announcement: "announcements" }[kindSingular] || kindSingular;
    (S.extra.moderated = S.extra.moderated || {})[id] = body.decision;
    const item = sharedContent(kind).created.find((x) => x.id === id);
    if (item) item.status = body.decision === "approve" ? "approved" : body.decision === "reject" ? "rejected" : "changes_requested";
    return ok(config, { ok: true, status: body.decision });
  }
  if ((path === "/events" || path === "/resources" || path === "/announcements") && method === "post") {
    const admin = isAdminHere();
    // Adding an event is admin-only now (see routes/events.py's create_event) -- the "Suggest an
    // event" entry point was removed from Events.jsx for members, mirrored here so the preview
    // matches even if this endpoint were hit directly.
    if (path === "/events" && !admin) return fail(config, 403, "Only admins can add events");
    const kind = path.slice(1);
    const me = view()["/auth/me"];
    const doc = { id: "sub-" + Date.now(), ...body, status: admin ? "approved" : "pending", published_at: new Date().toISOString(), author: me.name, submitted_by: me.id, submitted_by_name: me.name };
    doc.cover_url = body.image_url || null;
    if (kind === "resources") Object.assign(doc, { shared_by: { id: me.id, name: me.name, avatar_url: me.avatar_url, title: me.title }, category: body.category || "Discount", is_saved: false, tags: body.tags || [] });
    // A recorded fixture event always carries attendees/attendee_ids/rsvps/related_resources/etc.
    // (the real backend's get_event always fills them in, even empty) -- EventDetail.jsx reads some
    // of these without an optional-chain guard (e.g. `e.attendees.length`), so a freshly created
    // event missing them crashed the detail page blank the moment you opened it (no error shown,
    // just an unresponsive page -- reported as "new events don't generate an accessible page, icon
    // click goes nowhere"). Give a new event the same full shape as a recorded one from the start.
    if (kind === "events") Object.assign(doc, { is_past: false, attendee_count: 0, my_rsvp: null, attendees: [], attendee_ids: [], rsvps: {}, maybe_count: 0, is_attending: false, attended: false, is_saved: false, save_count: 0, related_resources: [], agenda: body.agenda || [] }, admin ? deriveEventPricing(body.ticket_tiers, []) : { ticket_tiers: [], price_cents: null, tier_summary: { has_tiers: false } });
    // Shared per community (not per login) so it shows up for every login that visits — admin-posted
    // content is visible immediately; a member's submission waits, pending, for admin's moderation.
    sharedContent(kind).created.unshift(doc);
    return ok(config, doc, 201);
  }
  if (path.endsWith("/extract-pdf")) {
    // The real endpoint (routes/profile_requests.py's extract_pdf) calls a language model to read
    // the uploaded PDF, same as /chat/message above -- the preview doesn't include one. The old
    // mock had no handler, fell through to the generic {ok:true} default, and ProfileEdit.jsx's
    // success toast fired over an empty draft with nothing actually filled in. Failing honestly
    // here (like chat does, just as an error instead of a reply bubble) matches the two LLM-backed
    // mocks that already say so, rather than quietly faking success.
    return fail(config, 503, "Reading PDFs uses a language model, which the preview doesn't include. Fill in the fields yourself below.");
  }
  if (path === "/chat/message") {
    const m = (body.message || "").toLowerCase();
    const R = [[["event", "game", "clinic", "attend"], "Browse games", "/events"], [["coach", "teammate", "who can help", "connect", "partner", "match"], "See your matches", "/matches"], [["resource", "playbook", "guide", "drill"], "Open the playbook", "/resources"], [["due", "request", "form", "update", "task"], "View your requests", "/requests"], [["profile", "bio", "missing"], "Edit your profile", "/profile"], [["support", "stuck"], "Ask the team for support", "/support"]];
    const actions = R.filter(([k]) => k.some((x) => m.includes(x))).map(([, label, to]) => ({ label, to })).slice(0, 3);
    return ok(config, { session_id: body.session_id || "preview", actions: actions.length ? actions : [{ label: "See your matches", to: "/matches" }, { label: "View your requests", to: "/requests" }],
      reply: "This is the offline preview, so Ask can't reach a language model here. In the running app it answers from your members, events and perks. The buttons below still take you to the right place." });
  }
  const svm = path.match(/^\/(resources|events|users)\/([^/]+)\/save$/);
  if (svm) {
    const [, kind, id] = svm;
    const me = view()["/auth/me"];
    if (kind === "users" && id === me.id) return fail(config, 400, "You can't bookmark your own profile");
    const base = mergedList(view()[`/${kind}`] || [], kind, kind !== "users").find((x) => x.id === id);
    if (!base) return fail(config, 404, "Not found");
    const sv = savedSet(kind);
    sv[id] = !isSaved(kind, base);
    return ok(config, { ok: true, is_saved: sv[id] });
  }
  if (path === "/support-requests" && method === "post") {
    const me = view()["/auth/me"];
    const doc = { id: "new-" + Date.now(), user_id: me.id, user_snapshot: { id: me.id, name: me.name, avatar_url: me.avatar_url, title: me.title, company: me.company }, status: "open", is_featured: false, helpers: [], helper_count: 0, i_offered: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), resolved_at: null, ...body };
    sharedContent("support_requests").created.unshift(doc);
    return ok(config, doc, 201);
  }
  // A board post can be edited or deleted by its author, or deleted (not edited) by an admin --
  // mirrors routes/support_requests.py's patch_request/delete_request. Uses the same
  // sharedContent/applyEdit pattern as events/resources/announcements so an edit or delete made
  // here is visible to every login reading this community for the rest of the preview session.
  const srm = path.match(/^\/support-requests\/([^/]+)$/);
  if (srm && (method === "patch" || method === "delete")) {
    const id = srm[1];
    const me = view()["/auth/me"];
    const ov = sharedContent("support_requests");
    if (ov.deleted[id]) return fail(config, 404, "Request not found");
    const created = ov.created.find((x) => x.id === id);
    const base = created ? applyEdit(created, "support_requests") : applyEdit((view()["/support-requests"] || []).find((x) => x.id === id), "support_requests");
    if (!base) return fail(config, 404, "Request not found");
    const mayEdit = base.user_id === me.id || isAdminHere();
    if (!mayEdit) return fail(config, 403, method === "delete" ? "Only the author can delete" : "Only the author can edit");
    if (method === "delete") { ov.deleted[id] = true; return ok(config, { ok: true }); }
    const patch = { ...body };
    if (patch.status === "resolved") patch.resolved_at = new Date().toISOString();
    patch.updated_at = new Date().toISOString();
    ov.edits[id] = { ...(ov.edits[id] || {}), ...patch };
    if (created) Object.assign(created, patch);
    return ok(config, { ...base, ...patch });
  }
  if (path === "/messages/threads" && method === "post") {
    const me = view()["/auth/me"];
    if (!me) return fail(config, 401, "Not authenticated");
    if (!(body.body || "").trim()) return fail(config, 400, "Write a message");
    const recipientIds = [...new Set((body.recipient_ids || []).filter((r) => r && r !== me.id))];
    if (!recipientIds.length) return fail(config, 400, "Add at least one recipient");
    const store = threadStore();
    const now = new Date().toISOString();
    const participants = [...new Set([me.id, ...recipientIds])].sort();
    let t = store.created.find((x) => {
      const p = x.participant_ids.slice().sort();
      return p.length === participants.length && p.every((v, i) => v === participants[i]);
    });
    if (!t) {
      t = { id: "thread-" + Date.now(), participant_ids: participants, subject: (body.subject || "").trim().slice(0, 140) || "New message", context: body.context || null, created_at: now, read_at: { [me.id]: now }, messages: [] };
      store.created.unshift(t);
    }
    t.messages.push({ id: "msg-" + Date.now(), thread_id: t.id, sender_id: me.id, body: body.body.trim(), created_at: now });
    t.read_at = { ...(t.read_at || {}), [me.id]: now };
    return ok(config, threadOut(t), 201);
  }
  const trm = path.match(/^\/messages\/threads\/([^/]+)\/reply$/);
  if (trm && method === "post") {
    const me = view()["/auth/me"];
    if (!me) return fail(config, 401, "Not authenticated");
    if (!(body.body || "").trim()) return fail(config, 400, "Write a message");
    const t = threadStore().created.find((x) => x.id === trm[1]);
    if (!t || !t.participant_ids.includes(me.id)) return fail(config, 404, "Conversation not found");
    const now = new Date().toISOString();
    const msg = { id: "msg-" + Date.now(), thread_id: t.id, sender_id: me.id, body: body.body.trim(), created_at: now };
    t.messages.push(msg);
    t.read_at = { ...(t.read_at || {}), [me.id]: now };
    return ok(config, msg, 201);
  }
  const rptm = path.match(/^\/messages\/threads\/([^/]+)\/messages\/([^/]+)\/report$/);
  if (rptm && method === "post") {
    const me = view()["/auth/me"];
    if (!me) return fail(config, 401, "Not authenticated");
    const t = threadStore().created.find((x) => x.id === rptm[1]);
    if (!t || !t.participant_ids.includes(me.id)) return fail(config, 404, "Conversation not found");
    const m = t.messages.find((x) => x.id === rptm[2]);
    if (!m) return fail(config, 404, "Message not found");
    const reason = (body.reason || "").trim();
    if (!reason) return fail(config, 400, "Tell the team why you're reporting this message");
    const reportedUser = threadUserById(m.sender_id);
    addAudit("message.reported", "message", m.id, { thread_id: t.id, reason, message_preview: m.body.slice(0, 140), reported_user_id: m.sender_id, reported_user_name: reportedUser?.name });
    return ok(config, { ok: true }, 201);
  }
  const delm = path.match(/^\/messages\/threads\/([^/]+)\/messages\/([^/]+)$/);
  if (delm && method === "delete") {
    const me = view()["/auth/me"];
    if (!me) return fail(config, 401, "Not authenticated");
    const t = threadStore().created.find((x) => x.id === delm[1]);
    if (!t || !t.participant_ids.includes(me.id)) return fail(config, 404, "Conversation not found");
    const m = t.messages.find((x) => x.id === delm[2]);
    if (!m) return fail(config, 404, "Message not found");
    if (m.sender_id !== me.id && !isAdminHere()) return fail(config, 403, "Only the sender can delete this message");
    // threadOut() always reads its "last message" straight off t.messages, so simply shrinking the
    // array (unlike the real backend, which caches last_message_at/preview on the thread doc and
    // has to explicitly resync them -- see _resync_thread_summary in routes/messages.py) is already
    // enough for the inbox list row to stop showing a deleted message.
    t.messages = t.messages.filter((x) => x.id !== delm[2]);
    addAudit("message.deleted", "message", m.id, { thread_id: t.id, by_admin: m.sender_id !== me.id });
    return ok(config, { ok: true });
  }
  const ohm = path.match(/^\/support-requests\/([^/]+)\/offer-help$/);
  if (ohm) {
    // Mirrors routes/support_requests.py's offer_help: records the offer as an edit patch (the
    // same sharedContent/applyEdit mechanism PATCH/DELETE already use above) so it's visible on
    // the very next GET, instead of the old no-op that returned a fixed {helper_count:1} and let
    // Support.jsx's reload right after show no change.
    const id = ohm[1];
    const me = view()["/auth/me"];
    const ov = sharedContent("support_requests");
    if (ov.deleted[id]) return fail(config, 404, "Request not found");
    const created = ov.created.find((x) => x.id === id);
    const base = created ? applyEdit(created, "support_requests") : applyEdit((view()["/support-requests"] || []).find((x) => x.id === id), "support_requests");
    if (!base) return fail(config, 404, "Request not found");
    if (base.user_id === me.id) return fail(config, 400, "You can't offer help on your own request");
    const helpers = [...new Set([...(base.helpers || []), me.id])];
    ov.edits[id] = { ...(ov.edits[id] || {}), helpers, helper_count: helpers.length, i_offered: true };
    return ok(config, { ok: true, helper_count: helpers.length });
  }
  if (path.includes("/programs/") && path.endsWith("/apply")) {
    const org = S.data.public[`/organizations/${path.split("/")[2]}`];
    const prog = S.data.public[path.replace(/\/apply$/, "")]?.program;
    const missing = (prog?.extra_questions || []).filter((x) => x.required && !(body.extra_answers || {})[x.key]).map((x) => x.key);
    if (missing.length) return fail(config, 400, { error: "missing_required", missing });
    return ok(config, { ok: true, already: false, application: { org_name: org?.name } });
  }
  if (path.endsWith("/apply")) return ok(config, { ok: true });
  // Push notifications need a real server + service worker; the static preview just says "no key".
  if (path.startsWith("/push/")) return ok(config, { ok: true, key: null });
  if (path === "/notifications/read") {
    // Mirrors routes/notifications.py's mark_read: {ids:[...]} marks only those, an empty/omitted
    // ids marks everything read -- the old version always did the latter, so clicking a single
    // notification (Notifications.jsx sends {ids:[n.id]}) wrongly cleared every unread badge.
    const notifs = view()["/notifications"];
    const ids = Array.isArray(body?.ids) ? body.ids : null;
    notifs.notifications.forEach((n) => { if (!ids || ids.includes(n.id)) n.read = true; });
    notifs.unread = notifs.notifications.filter((n) => !n.read).length;
    return ok(config, { ok: true, unread: notifs.unread });
  }
  const ndel = path.match(/^\/notifications\/([^/]+)$/);
  if (ndel && method === "delete") {
    // Mirrors routes/notifications.py's delete_notification -- the old mock had no handler at all
    // for this, so it fell through to the generic {ok:true} default and the dismissed notification
    // reappeared on the next load.
    const notifs = view()["/notifications"];
    notifs.notifications = notifs.notifications.filter((n) => n.id !== ndel[1]);
    notifs.unread = notifs.notifications.filter((n) => !n.read).length;
    return ok(config, { ok: true });
  }
  if (path.startsWith("/admin/audits/")) return ok(config, { reply: "Audits call the language model, which the preview doesn't include." });
  if (path === "/invites") {
    const inv = { id: "inv-" + Date.now(), code: Math.random().toString(36).slice(2, 10), email: body.email, role: body.role || "member", status: "pending", created_at: new Date().toISOString() };
    view()["/invites"].unshift(inv);
    // Also kept in a plain session-level store, keyed by code and tagged with which community it
    // belongs to -- GET /invites/{code} and POST /invites/{code}/accept (below) run with no one
    // logged in yet, so they can't reach this same invite through view()["/invites"] (view()
    // resolves only while S.role is truthy).
    (S.extra.invites = S.extra.invites || {})[inv.code] = { ...inv, slug: S.community };
    return ok(config, inv, 201);
  }
  const invAccept = path.match(/^\/invites\/([^/]+)\/accept$/);
  if (invAccept) {
    // No-auth, same as the real backend's POST /invites/{code}/accept (routes/invites.py) --
    // mirrors /hub/signup's account-creation shape, but seats the person straight into the
    // inviting community as "approved" rather than filing a pending request: an invite is already
    // admin-issued, so (unlike a public share-link join) there's no approval step left to run.
    const inv = (S.extra.invites || {})[invAccept[1]];
    if (!inv || inv.status !== "pending") return fail(config, 404, "Invite not found or already used");
    const email = (body.email || "").trim().toLowerCase();
    if (ACCOUNTS[email] || (S.extra.accounts || {})[email]) return fail(config, 409, "An account with that email already exists");
    if (body.accepted_terms !== true) return fail(config, 422, "You need to accept the Terms of Service and Privacy Policy to create an account.");
    if ((body.password || "").length < 10) return fail(config, 400, "Password must be at least 10 characters");
    inv.status = "accepted";
    (S.extra.accounts = S.extra.accounts || {})[email] = { name: body.name, role: inv.role || "member", pw: body.password };
    (S.extra.join = S.extra.join || {})[email + "|" + inv.slug] = "approved";
    S.role = inv.role || "member"; S.email = email; S.community = inv.slug;
    return ok(config, { ok: true, user: { id: "acct-" + email, name: body.name, email, role: inv.role || "member" } }, 201);
  }
  const ce = path.match(/^\/admin\/content\/(events|resources|announcements)\/([^/]+)$/);
  if (ce) {
    const [, kind, id] = ce;
    const ov = sharedContent(kind);
    if (ov.deleted[id]) return fail(config, 404, "Not found");
    const created = ov.created.find((x) => x.id === id);
    const base = created || (view()[`/${kind}`] || []).find((x) => x.id === id);
    if (!base) return fail(config, 404, "Not found");
    if (method === "delete") { ov.deleted[id] = true; return ok(config, { ok: true }); }
    const vals = { ...(body.values || {}) };
    ["tags", "agenda"].forEach((k) => { if (typeof vals[k] === "string") vals[k] = vals[k].split(",").map((x) => x.trim()).filter(Boolean); });
    if (kind === "events" && "ticket_tiers" in vals) {
      const orders = (S.extra.sales || {})[id] || [];
      Object.assign(vals, deriveEventPricing(vals.ticket_tiers, orders));
    } else if (kind === "events" && "capacity" in vals && (((ov.edits[id] || {}).ticket_tiers || base.ticket_tiers || []).length)) {
      // Capacity is derived from tier capacities once an event has tiers; ignore a stray edit to
      // the flat field so it can't quietly disagree with the tiers (matches the real backend).
      delete vals.capacity;
    }
    // Shared edit, not a per-login mutation — every login reading this community sees the change.
    ov.edits[id] = { ...(ov.edits[id] || {}), ...vals };
    if (created) Object.assign(created, vals);
    return ok(config, { ...base, ...ov.edits[id] });
  }
  const mp = path.match(/^\/admin\/users\/([^/]+)\/profile$/);
  if (mp) {
    const uid = mp[1];
    const ov = sharedContent("users");
    ov.edits[uid] = { ...(ov.edits[uid] || {}), ...(body.values || {}) };
    const created = ov.created.find((x) => x.id === uid);
    if (created) Object.assign(created, body.values || {});
    const base = created || view()[`/users/${uid}`] || (view()["/users"] || []).find((x) => x.id === uid) || {};
    return ok(config, { ...base, ...ov.edits[uid] });
  }
  const iw = integWrite(method, path, body, config);
  if (iw) return iw;
  if (path === "/me/billing/checkout") {
    const pl = PLANS.find((x) => x.key === body.plan_key) || PLANS[0];
    (S.extra.pay = S.extra.pay || []).unshift({ id: "pay-" + Date.now(), kind: "plan", plan_key: pl.key, description: pl.label, amount: pl.amount_cents, currency: "cad", status: "paid", at: new Date().toISOString() });
    return ok(config, { ok: true, demo: true, message: `Demo payment complete: ${pl.label}` });
  }
  const vw = path.match(/^\/events\/([^/]+)\/view$/);
  if (vw) {
    const v = (S.extra.views = S.extra.views || {})[vw[1]] = (S.extra.views || {})[vw[1]] || { total: 0, users: [] };
    v.total += 1;
    const who = S.role ? S.email : "anon";
    if (S.role && !v.users.includes(who)) v.users.push(who);
    return ok(config, { ok: true }, 201);
  }
  const ck = path.match(/^\/events\/([^/]+)\/checkout$/);
  if (ck) {
    if (!stripeOn()) return fail(config, 400, "Payments aren't set up for this community yet.");
    const ovEv = sharedContent("events");
    const ev = applyEdit([...ovEv.created, ...((view()["/events"]) || [])].find((x) => x.id === ck[1]), "events") || {};
    const orders = (S.extra.sales = S.extra.sales || {})[ck[1]] = (S.extra.sales || {})[ck[1]] || [];
    const rv = sharedRsvp();
    const effAttendee = Math.max(0, (ev.attendee_count || 0) + (rv.delta[ck[1]] || 0));
    const tiers = ev.tier_summary?.tiers || [];
    let tier = null, amount = ev.price_cents;
    if (tiers.length) {
      tier = tiers.find((t) => t.id === body.tier_id);
      if (!tier) return fail(config, 400, "Pick a ticket type.");
      if (t_sold_out(tier, orders)) return fail(config, 409, `${tier.name} is sold out.`);
      amount = tier.price_cents;
    } else if (ev.capacity && effAttendee >= ev.capacity) return fail(config, 409, "Sold out.");
    if (orders.some((o) => o.email === S.email)) return fail(config, 409, "You already have a ticket.");
    orders.unshift({ id: "o-" + Date.now(), name: (ACCOUNTS[S.email] || {}).name || "Member", email: S.email, tier_id: tier?.id || null, tier_name: tier?.name || null, amount, currency: "cad", at: new Date().toISOString(), demo: true });
    rv.byUser[ck[1]] = rv.byUser[ck[1]] || {};
    const baseline = rv.byUser[ck[1]][S.email] !== undefined ? rv.byUser[ck[1]][S.email] : (ev.my_rsvp ?? null);
    rv.delta[ck[1]] = (rv.delta[ck[1]] || 0) + (baseline === "yes" ? 0 : 1);
    rv.byUser[ck[1]][S.email] = "yes";
    return ok(config, { url: null, demo: true, message: "Demo mode: ticket purchase simulated — you're registered." });
  }
  if (path === "/admin/blasts/audience") {
    const tw = integ().find((x) => x.provider === "twilio"), sg = integ().find((x) => x.provider === "sendgrid");
    const allUsers = mergedList(view()["/users"] || [], "users", false);
    const smsUsers = allUsers.filter((u) => sum(u.id) % 3 !== 0);
    const emailUsers = allUsers.filter((u) => sum(u.id) % 5 !== 0);
    const total = allUsers.length;
    const smsCount = body.type === "admins" ? 1 : body.type === "event" ? Math.min(smsUsers.length, 8) : smsUsers.length;
    const emailCount = body.type === "admins" ? 1 : body.type === "event" ? Math.min(emailUsers.length, 8) : emailUsers.length;
    return ok(config, {
      sms_count: smsCount, email_count: emailCount, total_members: total,
      sms_no_phone: 0, sms_not_opted_in: body.type === "all" ? total - smsUsers.length : 0, email_not_opted_in: body.type === "all" ? total - emailUsers.length : 0,
      twilio_connected: !!tw?.enabled, sendgrid_connected: !!sg?.enabled, sms_demo: !!tw?.demo, email_demo: !!sg?.demo,
    });
  }
  if (path === "/admin/blasts/send") {
    const tw = integ().find((x) => x.provider === "twilio"), sg = integ().find((x) => x.provider === "sendgrid");
    const wantSms = body.channel === "sms" || body.channel === "both", wantEmail = body.channel === "email" || body.channel === "both";
    const wantInternal = !!body.internal;
    if (!wantSms && !wantEmail && !wantInternal) return fail(config, 400, "Choose at least one way to send this: text, email or Pathwai Internal.");
    if (wantSms && !tw?.enabled) return fail(config, 400, "Connect Twilio first (Admin → Integrations) to send texts.");
    if (wantEmail && !sg?.enabled) return fail(config, 400, "Connect SendGrid first (Admin → Integrations) to send email.");
    const allUsers = mergedList(view()["/users"] || [], "users", false);
    const smsUsers = allUsers.filter((u) => sum(u.id) % 3 !== 0);
    const emailUsers = allUsers.filter((u) => sum(u.id) % 5 !== 0);
    const n = (list) => body.audience.type === "admins" ? 1 : body.audience.type === "event" ? Math.min(list.length, 8) : list.length;
    // Pathwai Internal reaches everyone in the audience (no opt-in gate, no integration needed) --
    // same "notify every member" shape as the real backend's notify() fan-out, just simulated here.
    const internalCount = body.audience.type === "admins" ? 1 : body.audience.type === "event" ? Math.min(allUsers.length, 8) : allUsers.length;
    const b = {
      id: "blast-" + Date.now(), message: body.message.trim(), subject: body.subject || null, channel: body.channel, audience: body.audience,
      internal: wantInternal, internal_sent: wantInternal ? internalCount : 0,
      sms_sent: wantSms ? n(smsUsers) : 0, sms_failed: 0, email_sent: wantEmail ? n(emailUsers) : 0, email_failed: 0,
      demo: true, at: new Date().toISOString(),
    };
    (S.extra.blasts = S.extra.blasts || []).unshift(b);
    return ok(config, b);
  }
  if (path === "/community/config" && method === "patch") {
    // Policy: every community requires admin approval, full stop -- mirrors backend/routes/
    // community_config.py's patch_config excluding require_approval from its allowed-fields set.
    // applyToCommunity() already always returns "pending" regardless of this flag, so this is
    // defense in depth, not a behavior change -- but it keeps the mock consistent with the real
    // backend if anything ever PATCHes this field again.
    const { require_approval, ...rest } = body;
    Object.assign(S.data.public["/community/config"], rest);
    return ok(config, S.data.public["/community/config"]);
  }
  return ok(config, { ok: true });
}

export function install(api) {
  api.defaults.adapter = async (config) => {
    const path = (config.url || "").replace(/^https?:\/\/[^/]+/, "").replace(/^\/api/, "").split("?")[0];
    const method = (config.method || "get").toLowerCase();
    let body = {};
    try { body = typeof config.data === "string" ? JSON.parse(config.data) : config.data || {}; } catch { body = {}; }
    await new Promise((r) => setTimeout(r, 60));
    return method === "get" ? get(path, config.params || {}, config) : write(method, path, body, config);
  };
}
