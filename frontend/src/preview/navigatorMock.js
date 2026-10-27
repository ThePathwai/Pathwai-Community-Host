// The Navigator inside the in-browser demo (no server): the same rules as the real site, run on the bundled catalog.
// See lib/navigator.js (the rules) and backend/routes/navigator.py (the real API this stands in for).
import catalog from "./programs_ca.json";
import * as nav from "../lib/navigator";
import { humberNavigator } from "./humber";
import * as guide from "../lib/navigatorGuide";

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

const pick = (arr, allowed) => arr.filter((x, i) => allowed.includes(x) && arr.indexOf(x) === i);

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
    return ok(config, { signed_in: !!a, profile, startup: st });
  }
  if (path === "/navigator/home") return ok(config, guide.homeFeed(allPrograms(ctx), optedIn(ctx), ctx.account, today));
  if (path === "/navigator/seen" && method === "post") {
    if (!ctx.account) return fail(config, 401, "Not authenticated");
    ctx.account.nav_seen = guide.homeFeed(allPrograms(ctx), optedIn(ctx), ctx.account, today).live_ids || [];
    return ok(config, { ok: true, count: ctx.account.nav_seen.length });
  }
  if (path === "/navigator/chat" && method === "post") {
    const a = ctx.account;
    const st = (a && a.startup) || {};
    const raw = st.stage ? guide.navigatorProfile(a) : (body.profile || {});
    const out = guide.answer(String(body.message || "").slice(0, 500), allPrograms(ctx), optedIn(ctx), raw, today, body.focus || null, st, a);
    return ok(config, { ...out, by: "rules", signed_in: !!a, has_profile: !!st.stage });
  }
  if (path === "/navigator/suggest" && method === "post") {
    const raw = body.profile || {};
    const res = nav.suggest(allPrograms(ctx), raw, today);
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
