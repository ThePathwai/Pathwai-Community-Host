// The Navigator inside the in-browser demo (no server): the same rules as the real site, run on the bundled catalog.
// See lib/navigator.js (the rules) and backend/routes/navigator.py (the real API this stands in for).
import catalog from "./programs_ca.json";
import * as nav from "../lib/navigator";
import { humberNavigator } from "./humber";
import * as guide from "../lib/navigatorGuide";
import * as jny from "../lib/journey";
import journeyTemplates from "./journey_templates.json";

const BLANK_PROFILE = { public: false, blurb: "", stages: [], provides: [], audiences: [], sectors: [], city: "", provinces: [] };
const SEEDED = { "humber-innovation-network": humberNavigator };

function bucket(ctx, slug) {
  const st = ctx.store;
  if (!st[slug]) {
    const seed = SEEDED[slug] ? SEEDED[slug]() : null;
    st[slug] = seed ? { profile: seed.profile, programs: seed.programs, needs: seed.member_needs } : { profile: { ...BLANK_PROFILE }, programs: [], needs: [] };
  }
  return st[slug];
}

// Every community that has opted in, as the real endpoint would list them (Humber is on by default in the demo).
function optedIn(ctx) {
  const slugs = new Set([...Object.keys(SEEDED), ...Object.keys(ctx.store)]);
  const out = [];
  for (const slug of slugs) {
    const b = bucket(ctx, slug);
    if (!b.profile.public) continue;
    const info = ctx.communityInfo(slug);
    if (!info) continue;
    out.push({ ...info, slug, navigator: b.profile, program_count: b.programs.length, programs: b.programs.map((r) => nav.communityProgram(r, slug, info.name)) });
  }
  return out;
}
const allPrograms = (ctx) => [...catalog.programs, ...optedIn(ctx).flatMap((c) => c.programs)];

const meta = () => ({
  version: catalog.version, notes: catalog.notes, count: catalog.programs.length,
  stages: nav.STAGES.map((k) => ({ key: k, label: nav.STAGE_LABEL[k], hint: nav.STAGE_HINT[k] })),
  needs: nav.NEEDS.map((k) => ({ key: k, label: nav.NEED_LABEL[k] })),
  audiences: nav.AUDIENCES.map((k) => ({ key: k, label: nav.AUDIENCE_LABEL[k] })),
  sectors: nav.SECTORS, provinces: nav.PROVINCES,
  types: nav.TYPES.map((k) => ({ key: k, label: nav.TYPE_LABEL[k] })), statuses: nav.STATUSES.map((k) => ({ key: k, label: nav.STATUS_LABEL[k] })),
});

// Mirrors clean_startup() in backend/navigator.py: the startup half of the account profile, clamped to the Navigator's vocabulary.
export function cleanStartup(raw) {
  raw = raw || {};
  if (!Object.keys(raw).length) return {};
  const p = nav.normalizeProfile({ ...raw, age: null });
  return { name: String(raw.name || "").trim().slice(0, 80), one_liner: String(raw.one_liner || "").trim().slice(0, 200), stage: p.stage, sectors: p.sectors,
    audiences: (raw.audiences || []).filter((a, i, l) => nav.AUDIENCES.includes(a) && l.indexOf(a) === i), incorporated: p.incorporated, employees: p.employees,
    student: !!raw.student, needs: p.needs, goal: p.goal, province: p.province, seeking: raw.seeking !== false,
    pitch: Object.fromEntries(["problem", "solution", "traction", "market", "ask"].map((k) => [k, String((raw.pitch || {})[k] || "").replace(/\s+/g, " ").trim().slice(0, 600)]).filter(([, v]) => v)),
    documents: (Array.isArray(raw.documents) ? raw.documents : []).map((d) => ({ title: String((d && d.title) || "").trim().slice(0, 80), url: String((d && d.url) || "").trim().slice(0, 300) })).filter((d) => /^https?:\/\//i.test(d.url)).slice(0, 6) };
}
// Demo only: a ready-made startup on the demo member account so the prefill shows without any typing.
export const DEMO_STARTUP = cleanStartup({ name: "Bright Court", one_liner: "Booking and league tools for community sports", stage: "launched", sectors: ["tech"],
  needs: ["funding", "customers", "mentorship"], incorporated: true, employees: 2, province: "ON", goal: "Fund our second city and find a mentor who has scaled a marketplace",
  pitch: { problem: "Community sports groups run on group chats and spreadsheets. Organizers burn out and players drift away.", solution: "One place to book courts, run ladders and message the group, set up in ten minutes.",
    traction: "14 groups, 900 players, 38% of groups rebooking weekly.", market: "Recreational leagues and club nights across Canadian cities.", ask: "A $25k grant and one mentor who has scaled a two-sided marketplace." },
  documents: [{ title: "Pitch deck · 10 slides", url: "https://example.com/bright-court-deck" }] });

// Demo only: a founder partway through the plan, with something doing, something due soon and something overdue, so the tracking shows.
export function demoJourney(today) {
  const day = (n) => { const d = new Date(today + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const m = (n, stage, title, status, extra = {}) => ({ id: "j-demo" + n, stage, title, status, due: "", note: "", key: "", program_id: "", program_name: "", why: "", url: "", created_at: day(-60), done_at: status === "done" ? day(-40 + n * 2) : "", ...extra });
  return [
    m(1, "idea", "Talk to 10 people who have the problem", "done", { key: "idea-interviews" }),
    m(2, "idea", "Write the problem and who has it in two sentences", "done", { key: "idea-problem" }),
    m(3, "prototype", "Build a working prototype", "done", { key: "proto-build" }),
    m(4, "prototype", "Put it in front of 5 real users and write down what they say", "done", { key: "proto-users" }),
    m(5, "prototype", "Incorporate your company", "done", { key: "proto-incorporate", note: "Federal, through Corporations Canada." }),
    m(6, "launched", "Get your first paying customer", "done", { key: "launch-customer", done_at: day(-12) }),
    m(7, "launched", "Open a business bank account and start bookkeeping", "done", { key: "launch-bank", done_at: day(-3) }),
    m(8, "launched", "Pick the three numbers you will track every month", "doing", { key: "launch-metrics", note: "Active groups, weekly rebooking rate, revenue per group." }),
    m(9, "launched", "Send the grant intro email to our city's economic development office", "todo", { due: day(-3) }),
    m(10, "launched", "Apply to DMZ Incubator", "todo", { key: "prog:dmz-incubator", program_id: "dmz-incubator", program_name: "DMZ Incubator", due: day(12), why: "You have customers and you are in Toronto, which is who this incubator is built for.", url: "https://dmz.torontomu.ca/apply" }),
    m(11, "launched", "Register for GST/HST once your sales pass $30,000 in four quarters", "todo", { key: "launch-gst" }),
    m(12, "revenue", "Write a 12-month plan and budget", "todo", { key: "rev-plan" }),
  ];
}

const pick = (arr, allowed) => arr.filter((x, i) => allowed.includes(x) && arr.indexOf(x) === i);

// The catalog minus what the signed-in person said they are not interested in (twin of _mine_programs in routes/navigator.py).
const mineProgs = (ctx) => nav.withoutHidden(allPrograms(ctx), ctx.account && ctx.account.interest);

export function navigatorCall(method, path, body, params, ctx) {
  const { ok, fail, config } = ctx;
  const today = nav.todayIso();
  if (path === "/navigator/meta") return ok(config, meta());
  if (path === "/navigator/programs" && method === "get") {
    const rows = nav.filterPrograms(allPrograms(ctx), { q: params.q, type: params.type, province: params.province, stage: params.stage, audience: params.audience, status: params.status, need: params.need }, today);
    return ok(config, { programs: rows, count: rows.length });
  }
  const one = path.match(/^\/navigator\/programs\/([^/]+)$/);
  if (one && method === "get") {
    const p = allPrograms(ctx).find((x) => x.id === decodeURIComponent(one[1]));
    return p ? ok(config, { ...p, status: nav.effectiveStatus(p, today) }) : fail(config, 404, "Program not found");
  }
  if (path === "/navigator/me") {
    const a = ctx.account;
    const st = (a && a.startup) || {};
    const profile = Object.keys(st).length ? { ...st, age: a.age || null, city: String(a.location || "").split(",")[0].trim() } : {};
    return ok(config, { signed_in: !!a, profile, startup: st, tracked: (a && a.tracked) || [], interest: (a && a.interest) || [] });
  }
  if (path === "/navigator/home") return ok(config, guide.homeFeed(mineProgs(ctx), optedIn(ctx), ctx.account, today));
  if (path === "/navigator/interest" && method === "post") {
    if (!ctx.account) return fail(config, 401, "Not authenticated");
    try { ctx.account.interest = nav.updateInterest(ctx.account.interest, body || {}, today); } catch (e) { return fail(config, 400, e.message); }
    return ok(config, { interest: ctx.account.interest });
  }
  if (path === "/navigator/track" && method === "post") {
    if (!ctx.account) return fail(config, 401, "Not authenticated");
    try { ctx.account.tracked = nav.updateTracked(ctx.account.tracked, body || {}, (ctx.account.startup || {}).stage || "idea", today); } catch (e) { return fail(config, 400, e.message); }
    return ok(config, { tracked: ctx.account.tracked });
  }
  if (path === "/navigator/route" && method === "get") {
    const a = ctx.account;
    if (!a) return fail(config, 401, "Not authenticated");
    return ok(config, { has_profile: !!(a.startup || {}).stage, ...nav.routePlan(mineProgs(ctx), guide.navigatorProfile(a), a.tracked || [], today), tracked: a.tracked || [], interest: a.interest || [] });
  }
  if (path === "/navigator/journey" && (method === "get" || method === "post")) {
    const a = ctx.account;
    if (!a) return fail(config, 401, "Not authenticated");
    const stage = (a.startup || {}).stage || "idea";
    if (method === "post") { try { a.journey = jny.updateJourney(a.journey, body || {}, stage, today); } catch (e) { return fail(config, 400, e.message); } }
    const items = a.journey || [];
    return ok(config, {
      has_profile: !!(a.startup || {}).stage, current: stage, milestones: items,
      stages: nav.STAGES.map((k) => ({ stage: k, name: jny.STAGE_NAME[k], label: nav.STAGE_LABEL[k], hint: nav.STAGE_HINT[k] })),
      summary: jny.journeySummary(items, stage, today),
      suggestions: jny.journeySuggestions(guide.navigatorProfile(a), items, mineProgs(ctx), today, journeyTemplates.templates),
    });
  }
  if (path === "/navigator/seen" && method === "post") {
    if (!ctx.account) return fail(config, 401, "Not authenticated");
    ctx.account.nav_seen = guide.homeFeed(mineProgs(ctx), optedIn(ctx), ctx.account, today).live_ids || [];
    return ok(config, { ok: true, count: ctx.account.nav_seen.length });
  }
  if (path === "/navigator/chat" && method === "post") {
    const a = ctx.account;
    const st = (a && a.startup) || {};
    const raw = st.stage ? guide.navigatorProfile(a) : (body.profile || {});
    const out = guide.answer(String(body.message || "").slice(0, 500), mineProgs(ctx), optedIn(ctx), raw, today, body.focus || null, st, a);
    return ok(config, { ...out, by: "rules", signed_in: !!a, has_profile: !!st.stage });
  }
  if (path === "/navigator/suggest" && method === "post") {
    const raw = body.profile || {};
    const res = nav.suggest(mineProgs(ctx), raw, today);
    res.communities = nav.rankCommunities(optedIn(ctx), raw);
    return ok(config, { ...res, narrative: res.summary, narrative_by: "rules" });
  }

  // ---- community admin ----
  if (!path.startsWith("/navigator/admin")) return fail(config, 404, "Not found");
  if (!ctx.isAdmin) return fail(config, ctx.signedIn ? 403 : 401, ctx.signedIn ? "Insufficient permissions" : "Not authenticated");
  const b = bucket(ctx, ctx.slug);
  if (path === "/navigator/admin" && method === "get") {
    return ok(config, { profile: b.profile, programs: b.programs, member_needs: b.needs, limit: 40 });
  }
  if (path === "/navigator/admin/profile" && method === "put") {
    b.profile = {
      public: !!body.public, blurb: String(body.blurb || "").trim().slice(0, 300), stages: pick(body.stages || [], nav.STAGES), provides: pick(body.provides || [], nav.NEEDS),
      audiences: pick(body.audiences || [], nav.AUDIENCES), sectors: pick(body.sectors || [], nav.SECTORS), city: String(body.city || "").trim().slice(0, 80), provinces: pick((body.provinces || []).map((x) => String(x).toUpperCase()), nav.PROVINCES),
    };
    return ok(config, b.profile);
  }
  if (path === "/navigator/admin/programs" && method === "post") {
    if (b.programs.length >= 40) return fail(config, 400, "You can list up to 40 programs");
    let clean; try { clean = nav.cleanListing(body); } catch (e) { return fail(config, 400, e.message); }
    const doc = { id: Math.random().toString(36).slice(2, 12), ...clean, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    b.programs.push(doc);
    return ok(config, doc, 201);
  }
  const pm = path.match(/^\/navigator\/admin\/programs\/([^/]+)$/);
  if (pm) {
    const i = b.programs.findIndex((x) => x.id === pm[1]);
    if (i < 0) return fail(config, 404, "Program not found");
    if (method === "delete") { b.programs.splice(i, 1); return ok(config, { ok: true }); }
    if (method === "patch") {
      const cur = b.programs[i];
      const merged = { ...cur, ...body, deadline_kind: body.deadline_kind ?? cur.deadline?.kind, deadline_date: body.deadline_date ?? cur.deadline?.date, deadline_note: body.deadline_note ?? cur.deadline?.note };
      let clean; try { clean = nav.cleanListing(merged); } catch (e) { return fail(config, 400, e.message); }
      b.programs[i] = { ...cur, ...clean, updated_at: new Date().toISOString() };
      return ok(config, b.programs[i]);
    }
  }
  return fail(config, 404, "Not found");
}
