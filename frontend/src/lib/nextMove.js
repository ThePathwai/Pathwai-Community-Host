// The reasoning behind "Your next move" on the Journey page: which resource comes first and why, what comes after it, and what to
// check before applying. Plain functions over the route data (GET /navigator/route), so the live site and the in-browser demo agree.
// Nothing here is scored or hidden: a deadline that is close comes first, then what you said you are already doing, then the first
// thing you asked for.
import { daysUntil, todayIso } from "./navigator";

export const URGENT_DAYS = 21;       // a fixed deadline this close moves a resource to the front
const LIVE = ["open", "rolling", "check"];

const dayLabel = (iso) => { try { return new Date(String(iso).slice(0, 10) + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return String(iso || ""); } };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Days until a fixed deadline, or null when there is none, it has passed, or the resource is not taking applications.
export function daysLeft(r, today = todayIso()) {
  const dl = (r && r.deadline) || {};
  if (dl.kind !== "fixed" || !LIVE.includes(r.status)) return null;
  const d = daysUntil(dl.date, today);
  return d !== null && d >= 0 ? d : null;
}

// The one resource to do first. A close deadline beats everything; then something you are already doing; then the best fit for the
// first thing you asked for (the first one that is actually taking applications).
export function pickMove(steps, today = todayIso()) {
  const rows = [];
  (steps || []).forEach((st, si) => (st.resources || []).forEach((r, ri) => rows.push({ r, step: st, si, ri, days: daysLeft(r, today) })));
  if (!rows.length) return null;
  const order = (a, b) => a.si - b.si || a.ri - b.ri;
  const live = rows.filter((x) => LIVE.includes(x.r.status));
  const urgent = live.filter((x) => x.days !== null && x.days <= URGENT_DAYS).sort((a, b) => a.days - b.days || order(a, b));
  if (urgent.length) return { ...urgent[0], reason: "urgent" };
  const going = rows.filter((x) => x.r.mine === "in").sort(order);
  if (going.length) return { ...going[0], reason: "going" };
  return { ...(live[0] || rows[0]), reason: "first" };
}

// Why it is first, in one to three short lines.
export function whyFirst(move, steps) {
  if (!move) return [];
  const { r, step, reason, days } = move;
  const lead = (steps || []).find((s) => (s.resources || []).length);
  const out = [];
  if (reason === "urgent") {
    out.push(days === 0 ? "It closes today." : `It closes in ${plural(days, "day", "days")} (${dayLabel(r.deadline.date)}), the soonest deadline on your list.`);
    if (r.mine === "in") out.push("You are already doing this, so finish it first.");
    else if (lead && step !== lead) out.push(`You listed ${lead.label} first, but this one is for ${step.label} and it cannot wait.`);
  } else if (reason === "going") {
    out.push("You said you are doing this. Finish it before you start something new.");
  } else {
    const n = (step.resources || []).length + (step.more || 0);
    out.push(`The closest match for ${step.label}${step === (steps || [])[0] ? ", the first thing you asked for" : ""}.`);
    if (n === 1) out.push(`It is the only ${step.label} resource that fits you right now.`);
    if (r.status === "rolling") out.push("Applications are rolling, so you can start any time.");
  }
  return out.slice(0, 3);
}

// The next resource for each of the other things you asked for, and a few words on timing so you can see why it can wait.
export function waitNote(r, today = todayIso()) {
  const d = daysLeft(r, today);
  if (d !== null) return d <= URGENT_DAYS ? `closes in ${plural(d, "day", "days")}` : `closes ${dayLabel(r.deadline.date)}, so you have time`;
  if (r.status === "rolling") return "rolling, no rush";
  if (r.status === "closed" || r.status === "paused") return "not open right now";
  return "next on your list";
}

export function thenPicks(steps, move, today = todayIso(), limit = 2) {
  const out = [];
  for (const st of steps || []) {
    if (!move || st === move.step || !(st.resources || []).length) continue;
    const rs = st.resources;
    const soon = rs.map((r) => ({ r, d: daysLeft(r, today) })).filter((x) => x.d !== null && x.d <= URGENT_DAYS).sort((a, b) => a.d - b.d)[0];
    const r = rs.find((x) => x.mine === "in") || (soon && soon.r) || rs[0];
    if (r.id === move.r.id) continue;
    out.push({ label: st.label, r, note: waitNote(r, today) });
  }
  return out.slice(0, limit);
}

// What to check before applying: the answers the profile could not give, and the things the program asks for that only the founder can
// confirm. "profile" items can be fixed by adding a detail to the profile; "confirm" items are for the program's own page. The list is
// short on purpose: profile gaps first, then what the program asks for, then missing dates; `total` is how many there are in all.
export const PREP_SHOW = 3;
export function prepFor(r) {
  const all = [];
  const seen = new Set();
  const add = (kind, text, ask) => {
    const k = String(text || "").trim().toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    all.push({ kind, text: String(text).trim(), ...(ask ? { ask } : {}) });
  };
  const checks = (r && r.checks) || [];
  const apply = checks.find((c) => c.key === "apply") || {};
  (apply.items || []).forEach((it) => { if (it.state === "maybe") add(it.ask ? "profile" : "confirm", it.text, it.ask); });
  // Notes the catalog keeps for itself ("Check the site for intake...") are not requirements.
  (apply.unchecked || []).filter((u) => !/^check\b/i.test(String(u))).forEach((u) => add("confirm", `Confirm: ${u}`));
  const timing = checks.find((c) => c.key === "timing");
  if (timing && timing.state === "maybe") add("confirm", "No deadline is published. Check the site before you plan around it.");
  if (r && r.verified === "unconfirmed") add("confirm", "We could not confirm the current details. Check the program page.");
  return { total: all.length, items: all.slice(0, PREP_SHOW) };
}

export const prepHeading = (n) => (n === 0 ? "Ready to apply. Nothing in your profile rules you out." : `${plural(n, "thing", "things")} to check before you apply`);
