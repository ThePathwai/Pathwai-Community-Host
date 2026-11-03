// "Your next moves": one ranked list across everything a founder can act on in their ecosystem. Programs and grants, events, people and
// resources are each scored against the same startup profile, then merged, so the top of the list answers "what should I do this week?".
// Pure rules (no network), so the same ranking can run on the server later. Inputs are what the ecosystem already knows:
//   programs: evaluated programs ({id, name, org, type, fit, status, reasons, deadline, ...}), best first
//   events: upcoming events ({id, title, starts_at, category, tags}), people: [{user:{id,name,title,company,member_type}, headline, score}]
//   resources: [{id, title, category, tags, perk_value, is_featured}], why: { event: {id: text}, resource: {id: text} } (optional)
//   profile: the Navigator profile ({stage, needs, ...}), picks: { programId: note } from the hub, today: "YYYY-MM-DD"
import { NEED_LABEL } from "./navigator";

export const KINDS = { program: "Program", grant: "Grant", event: "Event", person: "Person", resource: "Resource" };
const GRANTY = new Set(["grant", "loan", "tax_credit"]);
// What each thing a founder can ask for looks like in tags and event categories.
const NEED_TAGS = {
  funding: ["funding", "grants", "grant", "sred", "irap", "safe", "cap-table", "term-sheets", "pre-seed", "investors", "angels", "pitch", "pitch-day", "finals", "judges"],
  customers: ["customers", "pilots", "customer-discovery", "industry", "corporate", "sprint", "research"],
  mentorship: ["mentor", "office-hours", "feedback", "practice", "pitch", "advice"],
  network: ["mixer", "community", "industry", "founders", "demo-night"],
  training: ["workshop", "legal", "template", "guide", "term-sheets", "equity"],
  rd: ["rd", "sred", "irap", "research", "grants"],
  ip: ["ip", "legal", "patent"],
  talent: ["hiring", "talent"],
};
const days = (from, iso) => Math.round((new Date(String(iso).slice(0, 10) + "T12:00:00Z") - new Date(from + "T12:00:00Z")) / 86400000);
const overlap = (tags, needs) => needs.filter((n) => (NEED_TAGS[n] || []).some((t) => (tags || []).map((x) => String(x).toLowerCase()).includes(t)));
const labels = (needs) => needs.slice(0, 2).map((n) => (NEED_LABEL[n] || n).toLowerCase()).join(" and ");

// How strong a match is, in words a founder understands. Scores from different kinds sit on one scale, so the same cut-offs work for all of them.
export const fitOf = (score) => (score >= 75 ? "strong" : score >= 56 ? "good" : "some");
// Which of the needs a founder can name (funding, mentors, customers...) an item speaks to, so a page can offer "Funding / Mentors / ..." filters.
export const needsOf = (tags) => Object.keys(NEED_TAGS).filter((n) => (NEED_TAGS[n] || []).some((t) => (tags || []).map((x) => String(x).toLowerCase()).includes(t)));

// strict = the short "this week" pool for Home (near events, strong programs, relevant resources); loose = everything, for each kind's own page.
function collect({ programs, events, people, resources, why, needs, picks, today, hubSlug }, strict) {
  const pool = [];
  for (const p of programs) {
    if (["closed", "paused"].includes(p.status)) continue;
    if (strict && !["strong", "possible"].includes(p.fit)) continue;
    const dl = p.deadline && p.deadline.kind === "fixed" && p.deadline.date ? days(today, p.deadline.date) : null;
    let score = p.fit === "strong" ? 70 : p.fit === "possible" ? 50 : 38;
    if (dl != null && dl >= 0 && dl <= 45) score += 30 - dl / 2;
    if (GRANTY.has(p.type)) score += 4;
    const own = !!(p.community && (!hubSlug || p.community.slug === hubSlug));
    if (own) score += 8; else if (picks[p.id]) score += 5;
    const kind = GRANTY.has(p.type) ? "grant" : "program";
    pool.push({ kind, id: p.id, title: p.name, sub: p.org, reason: (p.reasons || [])[0] || p.summary || "", badge: own ? "Humber" : picks[p.id] ? "Humber pick" : "",
      amount: p.amount || "", needs: p.needs || [], deadline: dl != null && dl >= 0 ? p.deadline.date : null, action: dl != null && dl >= 0 ? "Apply" : p.status === "rolling" ? "Apply anytime" : "Take a look", score, ref: p });
  }
  for (const e of events) {
    const d = days(today, e.starts_at);
    if (d < 0 || (strict && d > 30)) continue;
    const hit = overlap(e.tags, needs);
    const score = 52 + Math.max(0, 14 - d) * 1.6 + hit.length * 6 + (e.is_attending ? -12 : 0);
    pool.push({ kind: "event", id: e.id, title: e.title, sub: [e.category, e.is_attending ? "You're going" : ""].filter(Boolean).join(" · "), at: e.starts_at,
      place: e.location || "", going: e.attendee_count || 0, capacity: e.capacity || null, rsvp: e.my_rsvp || null, paid: !!e.price_cents, category: e.category || "",
      needs: needsOf([...(e.tags || []), String(e.category || "").toLowerCase()]),
      reason: hit.length ? `Fits what you asked for: ${labels(hit)}.` : (why.event && why.event[e.id]) || "Open to every founder at Humber.", action: e.is_attending ? "You're going" : "RSVP", score, ref: e });
  }
  for (const m of people) {
    const u = m.user || {};
    pool.push({ kind: "person", id: u.id, title: u.name, sub: [u.title, u.company].filter(Boolean).join(", "), type: u.member_type || "", avatar: u.avatar_url || null,
      offers: (m.can_help_you || []).slice(0, 3), wants: (m.you_can_help || []).slice(0, 3),
      reason: (m.headline || m.why || "Part of the Humber community.").replace(/\s*·\s*/g, ". ").replace(/\.?$/, "."),
      action: "Say hi", score: 50 + Math.min(14, (m.score || 0) * 1.5), ref: m });
  }
  for (const r of resources) {
    const hit = overlap(r.tags, needs);
    if (strict && !hit.length && !r.is_featured) continue;
    pool.push({ kind: "resource", id: r.id, title: r.title, sub: [r.category, r.perk_value].filter(Boolean).join(" · "), category: r.category || "", value: r.perk_value || "",
      by: r.shared_by ? { id: r.shared_by.id, name: r.shared_by.name, title: r.shared_by.title || "" } : null, how: r.how_to_claim || "", desc: r.description || "", url: r.external_url || r.url || "",
      needs: needsOf(r.tags),
      reason: hit.length ? `Helps with ${labels(hit)}, which you asked for.` : (why.resource && why.resource[r.id]) || "Shared by the Humber community.", action: r.category === "Perk" || r.perk_value ? "Get it" : "Read", score: 44 + hit.length * 7 + (r.is_featured ? 3 : 0), ref: r });
  }
  return pool.sort((a, b) => b.score - a.score);
}

export function buildMoves({ programs = [], events = [], people = [], resources = [], why = {}, profile = {}, picks = {}, today, hubSlug = "", limit = 7 }) {
  const needs = (profile.needs || []).filter((n) => NEED_TAGS[n] || NEED_LABEL[n]);
  const ctx = { programs, events, people, resources, why, needs, picks, today, hubSlug };
  const out = ({ ref, ...m }, i) => ({ ...m, ...(m.kind === "program" || m.kind === "grant" ? { program: ref } : {}), rank: i + 1, fit: fitOf(m.score), score: Math.round(m.score) });
  const group = (pool) => { const g = {}; for (const m of pool) (g[m.kind] = g[m.kind] || []).push(m); return g; };

  // Home: two best of each kind, merged by score, so one kind can't crowd the list and every kind can show up.
  const strict = collect(ctx, true);
  const byKind = group(strict);
  const picked = Object.values(byKind).flatMap((l) => l.slice(0, 2)).sort((a, b) => b.score - a.score).slice(0, limit);
  const counts = { program: 0, grant: 0, event: 0, person: 0, resource: 0 };
  for (const m of strict) counts[m.kind] += 1;
  // Each kind's own page: everything, best first.
  const full = group(collect(ctx, false));
  const fullCounts = Object.fromEntries(["program", "grant", "event", "person", "resource"].map((k) => [k, (full[k] || []).length]));
  return { moves: picked.map(out), counts, lists: Object.fromEntries(Object.entries(full).map(([k, l]) => [k, l.map(out)])), totals: fullCounts };
}
