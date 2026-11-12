// "Your next moves": everything a founder can act on in their ecosystem (programs and grants, events, people, resources), each scored against
// the same startup profile and each carrying a verdict and the reasons (lib/explain.js). Home shows the best few; each kind's own page shows all
// of it, grouped by verdict: good match now, almost there, not yet, not for you right now.
// Pure rules (no network), so the same ranking can run on the server later. Inputs are what the ecosystem already knows:
//   programs: evaluated programs from navigator.suggest ({id, name, org, type, fit, status, reasons, cautions, checks, deadline, ...}),
//   events: [{id, title, starts_at, category, tags, capacity, attendee_count, my_rsvp}], people: [{user:{id,name,title,company,member_type}, headline, score, can_help_you, you_can_help}],
//   resources: [{id, title, category, tags, perk_value, is_featured, shared_by}], why: { event: {id: text}, resource: {id: text} } (optional)
//   profile: the Navigator profile ({stage, needs, ...}), picks: { programId: note } from the hub, today: "YYYY-MM-DD"
import { NEED_LABEL } from "./navigator";
import { NEED_TAGS, VRANK, countBy, daysBetween, explainEvent, explainPerson, explainProgram, explainResource, needsOf } from "./explain";

export { needsOf };
export const KINDS = { program: "Program", grant: "Grant", event: "Event", person: "Person", resource: "Resource" };
const GRANTY = new Set(["grant", "loan", "tax_credit"]);
const FIT_BASE = { strong: 70, possible: 50, later: 30, skip: 15 };
// Kept for the few callers that still ask "how strong is it" in a word.
export const fitOf = (score) => (score >= 75 ? "strong" : score >= 56 ? "good" : "some");

// Everything a search might match on, in one lowercase string (used by the Ask page, lib/ask.js).
const hay = (...xs) => xs.filter(Boolean).join(" ").toLowerCase();

function collect({ programs, events, people, resources, needs, picks, today, hubSlug, hubName }) {
  const pool = [];
  for (const p of programs) {
    const x = explainProgram(p);
    const dl = p.deadline && p.deadline.kind === "fixed" && p.deadline.date ? daysBetween(today, p.deadline.date) : null;
    let score = FIT_BASE[p.fit] ?? 40;
    if (x.verdict !== "no" && dl != null && dl >= 0 && dl <= 45) score += 30 - dl / 2;
    if (GRANTY.has(p.type)) score += 4;
    const own = !!(p.community && (!hubSlug || p.community.slug === hubSlug));
    if (own) score += 8; else if (picks[p.id]) score += 5;
    const kind = GRANTY.has(p.type) ? "grant" : "program";
    pool.push({ kind, id: p.id, title: p.name, sub: p.org, ...x, badge: own ? hubName : picks[p.id] ? `${hubName} pick` : "", amount: p.amount || "", needs: p.needs || [],
      text: hay(p.name, p.org, p.type, p.summary, p.description, ...(p.needs || []), ...(p.tags || [])), deadline: dl != null && dl >= 0 ? p.deadline.date : null, action: dl != null && dl >= 0 ? "Apply" : p.status === "rolling" ? "Apply anytime" : "See details", score, ref: p });
  }
  for (const e of events) {
    const d = daysBetween(today, e.starts_at);
    if (d < 0) continue;
    const x = explainEvent(e, { needs, today });
    pool.push({ kind: "event", id: e.id, title: e.title, sub: [e.category, e.is_attending ? "You're going" : ""].filter(Boolean).join(" · "), at: e.starts_at, ...x,
      place: String(e.location || "").split(" (")[0], going: e.attendee_count || 0, capacity: e.capacity || null, text: hay(e.title, e.category, e.description, e.location, ...(e.tags || [])), rsvp: e.my_rsvp || null, paid: !!e.price_cents, category: e.category || "", days: d,
      needs: needsOf([...(e.tags || []), String(e.category || "").toLowerCase()]), action: e.is_attending ? "You're going" : "RSVP", score: 60 - VRANK[x.verdict] * 12 + Math.max(0, 14 - d), ref: e });
  }
  for (const m of people) {
    const u = m.user || {};
    const offers = (m.can_help_you || []).slice(0, 3), wants = (m.you_can_help || []).slice(0, 3);
    const base = { offers, wants, reasonScore: m.score || 0 };
    const x = explainPerson(base, { needs });
    pool.push({ kind: "person", id: u.id, title: u.name, sub: [u.title, u.company].filter(Boolean).join(", "), type: u.member_type || "", avatar: u.avatar_url || null, offers, wants, text: hay(u.name, u.title, u.company, u.member_type, u.bio, m.headline, ...offers, ...wants), ...x,
      action: "Say hi", score: 60 - VRANK[x.verdict] * 12 + Math.min(10, (m.score || 0) * 1.2), ref: m });
  }
  for (const r of resources) {
    const res = { tags: r.tags || [], value: r.perk_value || "", featured: !!r.is_featured, by: r.shared_by ? { name: r.shared_by.name } : null };
    const x = explainResource(res, { needs });
    pool.push({ kind: "resource", id: r.id, title: r.title, sub: [r.category, r.perk_value].filter(Boolean).join(" · "), category: r.category || "", value: r.perk_value || "",
      by: r.shared_by ? { id: r.shared_by.id, name: r.shared_by.name, title: r.shared_by.title || "" } : null, how: r.how_to_claim || "", desc: r.description || "", url: r.external_url || r.url || "",
      needs: needsOf(r.tags), text: hay(r.title, r.category, r.description, r.perk_value, ...(r.tags || [])), ...x, action: r.category === "Perk" || r.perk_value ? "Get it" : "Read", score: 60 - VRANK[x.verdict] * 12 + (r.is_featured ? 3 : 0), ref: r });
  }
  // verdict first (good now, then almost, then not yet, then not for you), best score within each
  return pool.sort((a, b) => (VRANK[a.verdict] - VRANK[b.verdict]) || (b.score - a.score));
}

export function buildMoves({ programs = [], events = [], people = [], resources = [], why = {}, profile = {}, picks = {}, today, hubSlug = "", hubName = "Hub", limit = 7 }) {
  const needs = (profile.needs || []).filter((n) => NEED_TAGS[n] || NEED_LABEL[n]);
  const all = collect({ programs, events, people, resources, why, needs, picks, today, hubSlug, hubName });
  const out = ({ ref, ...m }, i) => ({ ...m, ...(m.kind === "program" || m.kind === "grant" ? { program: ref } : {}), rank: i + 1, score: Math.round(m.score) });
  const group = (pool) => { const g = {}; for (const m of pool) (g[m.kind] = g[m.kind] || []).push(m); return g; };
  const full = group(all);

  // Home: only things you can act on now or nearly, two best of each kind merged by score, so one kind can't crowd the list.
  const live = all.filter((m) => m.verdict === "now" || m.verdict === "close");
  const byKind = group(live);
  const picked = Object.values(byKind).flatMap((l) => l.slice(0, 2)).sort((a, b) => (VRANK[a.verdict] - VRANK[b.verdict]) || (b.score - a.score)).slice(0, limit);
  const counts = { program: 0, grant: 0, event: 0, person: 0, resource: 0 };
  for (const m of live) counts[m.kind] += 1;
  const verdicts = Object.fromEntries(["program", "event", "person", "resource"].map((k) => [k, countBy(k === "program" ? [...(full.program || []), ...(full.grant || [])] : full[k] || [])]));
  const fullCounts = Object.fromEntries(["program", "grant", "event", "person", "resource"].map((k) => [k, (full[k] || []).length]));
  return { moves: picked.map(out), counts, lists: Object.fromEntries(Object.entries(full).map(([k, l]) => [k, l.map(out)])), totals: fullCounts, verdicts };
}
