// Navigator: the same matching rules as backend/navigator.py, in the browser.
//
// The real site asks the server (POST /api/navigator/suggest). The in-browser demo has no server, so
// preview/mock.js runs these rules on the bundled catalog instead. backend/tests/test_navigator_parity.py runs
// this file against the Python one on shared cases and fails if the answers differ: change one, change both.
// The labels below are also what the Navigator page uses for its pickers, so there is one list of words.

export const STAGES = ["idea", "prototype", "launched", "revenue", "growth"];
export const STAGE_LABEL = { idea: "idea", prototype: "prototype", launched: "just launched", revenue: "earning revenue", growth: "growing" };
export const STAGE_HINT = { idea: "Still validating the idea", prototype: "Building a first version", launched: "Launched, first customers", revenue: "Steady revenue", growth: "Scaling a proven product" };
export const NEEDS = ["funding", "mentorship", "space", "customers", "export", "rd", "ip", "talent", "network", "tax", "training", "visa"];
export const NEED_LABEL = { funding: "funding", mentorship: "mentors", space: "a workspace", customers: "first customers", export: "export help", rd: "R&D support", ip: "IP protection", talent: "talent", network: "a network", tax: "tax savings", training: "training", visa: "an immigration route" };
export const AUDIENCES = ["women", "black", "indigenous", "newcomer", "youth", "student", "rural"];
export const AUDIENCE_LABEL = { women: "women", black: "Black", indigenous: "Indigenous", newcomer: "newcomer", youth: "young", student: "student", rural: "rural" };
export const SECTORS = ["tech", "hardware", "health", "cleantech", "mobility", "creative", "retail", "food", "services", "social"];
export const PROVINCES = ["ON", "BC", "AB", "SK", "MB", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"];
export const TYPES = ["grant", "loan", "tax_credit", "accelerator", "incubator", "mentorship", "competition", "investor", "immigration", "research_partnership", "resource"];
export const TYPE_LABEL = { grant: "Grant", loan: "Loan", tax_credit: "Tax credit", accelerator: "Accelerator", incubator: "Incubator", mentorship: "Mentorship", competition: "Competition", investor: "Investor", immigration: "Immigration", research_partnership: "Research partner", resource: "Resource" };
export const STATUSES = ["open", "rolling", "check", "closed", "paused"];
export const STATUS_LABEL = { open: "Open", rolling: "Rolling", check: "Check the site", closed: "Closed", paused: "Paused" };
const STATUS_POINTS = { open: 10, rolling: 8, check: 0, closed: -25, paused: -35 };
const VERIFIED_POINTS = { official: 4, third_party: 1, unconfirmed: -4 };
const PHASE_ORDER = ["learn", "fund", "scale"];
const PHASE_LABEL = { learn: "Start here", fund: "Then fund it", scale: "Then scale" };

// Words in a member's own sentence that point at a need (mirrors routes/navigator.py _KEYWORDS).
export const KEYWORDS = {
  funding: ["fund", "grant", "loan", "capital", "invest", "money", "raise"], mentorship: ["mentor", "advice", "coach", "guidance", "advis"],
  space: ["space", "office", "lab", "studio"], customers: ["customer", "client", "sales", "market", "pilot"], export: ["export", "international", "global", "abroad"],
  rd: ["r&d", "research", "prototype", "develop"], ip: ["patent", "trademark", "legal", "intellectual"], talent: ["hire", "talent", "intern", "recruit", "developer"],
  network: ["network", "intro", "connect", "community"], tax: ["tax", "sr&ed"], training: ["train", "learn", "course", "workshop", "skill"], visa: ["visa", "immigra", "work permit"],
};
export const needsFromText = (text) => { const t = String(text || "").toLowerCase(); return Object.keys(KEYWORDS).filter((k) => KEYWORDS[k].some((w) => t.includes(w))); };

const lst = (v, allowed, cap = 12) => {
  const out = [];
  for (const x of Array.isArray(v) ? v : []) {
    const s = String(x).trim().toLowerCase();
    if (s && !out.includes(s) && (!allowed || allowed.includes(s))) out.push(s);
  }
  return out.slice(0, cap);
};
const toInt = (v, lo, hi) => {
  let n;
  if (typeof v === "number" && Number.isFinite(v)) n = Math.trunc(v);
  else if (typeof v === "string" && /^\s*[+-]?\d+\s*$/.test(v)) n = parseInt(v, 10);
  else return null;
  return n >= lo && n <= hi ? n : null;
};

export function normalizeProfile(raw) {
  raw = raw || {};
  let stage = String(raw.stage || "idea").trim().toLowerCase();
  let inc = raw.incorporated;
  if (typeof inc === "string") inc = { yes: true, no: false }[inc.trim().toLowerCase()] ?? null;
  else if (typeof inc !== "boolean") inc = null;
  let province = String(raw.province || "ON").trim().toUpperCase();
  const audiences = lst(raw.audiences, AUDIENCES);
  const age = toInt(raw.age, 13, 110);
  const student = !!raw.student || audiences.includes("student");
  if (student && !audiences.includes("student")) audiences.push("student");
  if (age !== null && age <= 29 && !audiences.includes("youth")) audiences.push("youth");
  return {
    stage: STAGES.includes(stage) ? stage : "idea", audiences, age, province: PROVINCES.includes(province) ? province : "ON",
    city: String(raw.city || "").trim().slice(0, 80), sectors: lst(raw.sectors, SECTORS), incorporated: inc,
    employees: toInt(raw.employees, 0, 100000), student, needs: lst(raw.needs, NEEDS), goal: String(raw.goal || "").trim().slice(0, 500),
  };
}

const MS_DAY = 86400000;
const daysUntil = (iso, today) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return null;
  const a = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const t = /^(\d{4})-(\d{2})-(\d{2})/.exec(today);
  return Math.round((a - Date.UTC(+t[1], +t[2] - 1, +t[3])) / MS_DAY);
};
export { daysUntil, why, joinList, brief };
export const todayIso = () => new Date().toISOString().slice(0, 10);

export function effectiveStatus(p, today) {
  const status = STATUSES.includes(p.status) ? p.status : "check";
  const dl = p.deadline || {};
  if (dl.kind === "fixed") { const d = daysUntil(dl.date, today); if (d !== null && d < 0) return "closed"; }
  return status;
}

const joinList = (items) => (items.length <= 1 ? items.join("") : items.slice(0, -1).join(", ") + " and " + items[items.length - 1]);
const why = (row) => { const rs = row.reasons || []; return rs.find((r) => !r.startsWith("Built for founders at your stage")) || rs[0] || row.summary || ""; };
const skipRow = (why) => ({ fit: "skip", score: 0, reasons: [], cautions: [], skip: why });

export function evaluate(p, profile, today) {
  const req = p.requires || {};
  const reasons = []; const cautions = []; const later = [];
  let score = 0;
  const restricted = p.restricted_to || [];
  if (restricted.length && !restricted.some((a) => profile.audiences.includes(a))) return skipRow("For " + joinList(restricted.map((a) => AUDIENCE_LABEL[a] || a)) + " founders");
  const provs = p.provinces || ["any"];
  if (!provs.includes("any") && !provs.includes(profile.province)) return skipRow("Only for " + joinList(provs));
  const age = profile.age;
  const lo = req.age_min ?? null; const hi = req.age_max ?? null;
  if (lo !== null || hi !== null) {
    if (age !== null && ((lo !== null && age < lo) || (hi !== null && age > hi))) return skipRow("Age limit");
    if (age === null) cautions.push("Has an age limit" + (lo !== null && hi !== null ? ` (${lo} to ${hi})` : "") + "; add your age to check");
  }
  if (req.student && !profile.student) return skipRow("Only for students");
  const emp = profile.employees;
  if (req.max_employees != null && emp !== null && emp > req.max_employees) return skipRow(`Limit of ${req.max_employees} employees`);
  const sectors = p.sectors || ["any"];
  const specific = !sectors.includes("any");
  if (specific && profile.sectors.length && !profile.sectors.some((s) => sectors.includes(s))) return skipRow("Focused on " + joinList(sectors));

  const stages = p.stages || STAGES;
  const si = STAGES.indexOf(profile.stage);
  if (stages.includes(profile.stage)) {
    score += 30; reasons.push(`Built for founders at your stage (${STAGE_LABEL[profile.stage]}).`);
  } else {
    const idx = stages.map((s) => STAGES.indexOf(s)).filter((i) => i >= 0);
    const earliest = Math.min(...idx); const latest = Math.max(...idx);
    if (si > latest) return skipRow("Aimed at earlier-stage companies");
    later.push(`Aimed at companies that are ${STAGE_LABEL[STAGES[earliest]]} or further along.`);
    score -= 10;
  }
  if (req.incorporated) {
    if (profile.incorporated === false) later.push("Needs an incorporated company.");
    else if (profile.incorporated === null) cautions.push("Requires an incorporated company.");
  }
  if (req.min_employees != null && emp !== null && emp < req.min_employees) later.push(`Needs at least ${req.min_employees} full-time employees.`);

  const provides = p.needs || [];
  const hits = profile.needs.filter((n) => provides.includes(n));
  if (hits.length) { score += Math.min(3, hits.length) * 12; reasons.push("Gives you " + joinList(hits.slice(0, 3).map((n) => NEED_LABEL[n])) + ", which you asked for."); }
  else if (profile.needs.length) cautions.push("Does not cover what you listed as your needs.");

  const audHits = profile.audiences.filter((a) => (p.audiences || []).includes(a));
  if (audHits.length) { score += 15; reasons.push("Designed for " + joinList(audHits.map((a) => AUDIENCE_LABEL[a])) + " founders."); }
  if (specific) {
    const secHits = profile.sectors.filter((s) => sectors.includes(s));
    if (secHits.length) { score += 10; reasons.push("Focused on " + joinList(secHits) + ", your area."); }
    else if (!profile.sectors.length) { score -= 15; cautions.push("Focused on " + joinList(sectors) + "; add your sector to check."); }
  }

  const status = effectiveStatus(p, today);
  score += STATUS_POINTS[status];
  const dl = p.deadline || {};
  const days = dl.kind === "fixed" ? daysUntil(dl.date, today) : null;
  if (status === "closed") cautions.push("Closed right now. " + (dl.note || ""));
  else if (status === "paused") cautions.push("Paused. " + (dl.note || ""));
  else if (days !== null) { if (days <= 60) score += 8; reasons.push(`Closes in ${days} day${days === 1 ? "" : "s"} (${dl.date}).`); }
  else if (status === "open" || status === "rolling") reasons.push("Taking applications now" + (dl.kind === "rolling" && dl.note ? ": " + dl.note : "."));
  else cautions.push("No deadline was published, so check the site before planning around it.");

  score += VERIFIED_POINTS[p.verified || "unconfirmed"] ?? -4;
  if (p.verified === "unconfirmed") cautions.push("We could not confirm the current details. Check the program page.");

  const rs = reasons.filter(Boolean);
  if (later.length) return { fit: "later", score, reasons: rs, cautions: [...later, ...cautions], skip: "" };
  if (score >= 55) return { fit: "strong", score, reasons: rs, cautions, skip: "" };
  if (score >= 25) return { fit: "possible", score, reasons: rs, cautions, skip: "" };
  return skipRow("Not a strong match");
}

const BRIEF_KEYS = ["id", "name", "org", "level", "type", "summary", "amount", "stages", "audiences", "needs", "sectors", "provinces", "requirements", "deadline", "status", "phase", "apply_url", "source_url", "verified", "last_checked", "restricted_to", "community"];
const brief = (p) => { const o = {}; for (const k of BRIEF_KEYS) if (k in p) o[k] = p[k]; return o; };
const byScore = (a, b) => (b.score - a.score) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

export function summaryText(profile, ranked, later) {
  const stage = STAGE_LABEL[profile.stage];
  const need = joinList(profile.needs.slice(0, 3).map((n) => NEED_LABEL[n]));
  if (!ranked.length) return `Nothing in the directory is a clean fit for a founder who is ${stage} yet` + (need ? ` and looking for ${need}` : "") + ". The directory is growing; try adding a community that lists its own programs.";
  const top = ranked[0];
  const live = ranked.filter((r) => r.status === "open" || r.status === "rolling");
  let s = `You're at the ${stage} stage` + (need ? ` and looking for ${need}` : "") + `. Start with ${top.name}: ` + why(top);
  if (live.length && live[0].id !== top.id) s += ` ${live[0].name} is taking applications now.`;
  if (later.length) s += ` ${later[0].name} is worth keeping in view for later.`;
  return s;
}

export function suggest(programs, rawProfile, today = todayIso(), limit = 8) {
  const profile = normalizeProfile(rawProfile);
  const buckets = { strong: [], possible: [], later: [] };
  let skipped = 0;
  for (const p of programs) {
    const ev = evaluate(p, profile, today);
    if (ev.fit === "skip") { skipped += 1; continue; }
    buckets[ev.fit].push({ ...brief(p), status: effectiveStatus(p, today), fit: ev.fit, score: ev.score, reasons: ev.reasons, cautions: ev.cautions });
  }
  for (const k of Object.keys(buckets)) buckets[k].sort(byScore);
  const ranked = [...buckets.strong, ...buckets.possible];
  const path = [];
  for (const phase of PHASE_ORDER) {
    const pick = ranked.find((r) => r.phase === phase && r.status !== "closed" && r.status !== "paused") || ranked.find((r) => r.phase === phase);
    if (pick) path.push({ phase, label: PHASE_LABEL[phase], program_id: pick.id, name: pick.name, why: why(pick) });
  }
  return { profile, matches: ranked.slice(0, limit), more: ranked.slice(limit, limit + 8), later: buckets.later.slice(0, 5), skipped, path, trajectory: trajectory(programs, profile, today), summary: summaryText(profile, ranked, buckets.later), as_of: today };
}

export const STAGE_NOW = { idea: "at the idea stage", prototype: "at the prototype stage", launched: "just launched", revenue: "earning revenue", growth: "growing" };

// Where the founder came from, where they are and where they are going: the five stages, each with the programs that serve it.
// Mirrors backend/navigator.py trajectory(); tests/test_navigator_guide_parity-style checks keep the two in step.
export function trajectory(programs, rawProfile, today = todayIso(), perStage = 3) {
  const profile = normalizeProfile(rawProfile);
  const cur = STAGES.indexOf(profile.stage);
  const stateOf = (i) => (i < cur ? "past" : i === cur ? "current" : "future");
  const order = [cur];
  for (let i = cur + 1; i < STAGES.length; i += 1) order.push(i);
  for (let i = cur - 1; i >= 0; i -= 1) order.push(i);
  const used = new Set();
  const cols = {};
  for (const i of order) {
    const stage = STAGES[i];
    const state = stateOf(i);
    const at = { ...profile, stage };
    const rows = [];
    for (const p of programs) {
      const stList = (p.stages || STAGES).filter((x) => STAGES.includes(x));
      const sl = stList.length ? stList : STAGES;
      if (!sl.includes(stage)) continue;
      const ev = evaluate(p, at, today);
      if (ev.fit === "skip") continue;
      const status = effectiveStatus(p, today);
      const idx = sl.map((x) => STAGES.indexOf(x));
      const first = Math.min(...idx); const last = Math.max(...idx);
      let live = status === "open" || status === "rolling" ? 0 : status === "check" ? 1 : 2;
      if (state === "current") live = 0; // the column you are in follows the same order as your matches: best fit first
      const lead = state === "past" ? (last === i ? 0 : 1) : state === "future" ? (first === i ? 0 : 1) : 0;
      const res = p.type === "resource" ? 1 : 0;
      rows.push({ key: [lead, res, live, -ev.score, p.name], p, ev, status, first, last });
    }
    rows.sort((a, b) => { for (let k = 0; k < 5; k += 1) { if (a.key[k] < b.key[k]) return -1; if (a.key[k] > b.key[k]) return 1; } return 0; });
    const pool = rows.filter((r) => !used.has(r.p.id) && !((r.status === "closed" || r.status === "paused") && state !== "past"));
    let picked = [];
    for (const cap of [2, perStage]) {
      for (const r of pool) {
        if (picked.length >= perStage) break;
        if (picked.includes(r) || picked.filter((x) => x.p.type === r.p.type).length >= cap) continue;
        picked.push(r);
      }
    }
    picked = rows.filter((r) => picked.includes(r));
    const out = picked.map((r) => {
      used.add(r.p.id);
      let note;
      if (state === "future") {
        note = r.first === i ? `Opens up at the ${STAGE_LABEL[stage]} stage.` : "Gets easier to land as you grow.";
        if (r.ev.cautions.length) note += " " + r.ev.cautions[0];
      } else if (state === "past") note = r.last === i ? "Built for this stage; you have likely used or outgrown it." : (r.p.summary || "");
      else note = why({ ...brief(r.p), reasons: r.ev.reasons });
      return { ...brief(r.p), status: r.status, fit: r.ev.fit, score: r.ev.score, note };
    });
    cols[i] = { stage, label: STAGE_LABEL[stage], hint: STAGE_HINT[stage], state, available: rows.length, programs: out };
  }
  const stages = STAGES.map((_, i) => cols[i]);
  const nxt = cur + 1 < stages.length ? stages[cur + 1] : null;
  let story = "";
  if (cur > 0) story += `You've come through ${joinList(stages.slice(0, cur).map((c) => c.label))}. `;
  story += `Right now you're ${STAGE_NOW[profile.stage]}. `;
  if (nxt) {
    const names = nxt.programs.slice(0, 2).map((r) => r.name);
    story += `Next up is ${nxt.label}` + (names.length > 1 ? `, where ${joinList(names)} come into reach.` : names.length ? `, where ${names[0]} comes into reach.` : ".");
  } else story += "You're at the top of the ladder, so the focus now is scaling and export.";
  return { current: profile.stage, index: cur, stages, story };
}

export function evaluateCommunity(com, profile) {
  const nav = com.navigator || {};
  const reasons = []; let score = 0;
  if ((nav.stages || []).includes(profile.stage)) { score += 30; reasons.push(`Members here are at the ${STAGE_LABEL[profile.stage]} stage, like you.`); }
  const hits = profile.needs.filter((n) => (nav.provides || []).includes(n));
  if (hits.length) { score += Math.min(3, hits.length) * 12; reasons.push("Offers " + joinList(hits.slice(0, 3).map((n) => NEED_LABEL[n])) + "."); }
  const aud = profile.audiences.filter((a) => (nav.audiences || []).includes(a));
  if (aud.length) { score += 20; reasons.push("Built with " + joinList(aud.map((a) => AUDIENCE_LABEL[a])) + " founders in mind."); }
  const sec = profile.sectors.filter((s) => (nav.sectors || []).includes(s));
  if (sec.length) { score += 10; reasons.push("Active in " + joinList(sec) + "."); }
  const city = profile.city.toLowerCase();
  if (city && city === String(nav.city || "").toLowerCase()) { score += 15; reasons.push(`Based in ${nav.city}.`); }
  else if ((nav.provinces || []).includes(profile.province)) score += 5;
  return { slug: com.slug, name: com.name, kind: com.kind, tagline: com.tagline, blurb: nav.blurb || "", members: com.members, brand: com.brand, city: nav.city || "", score, reasons, programs: com.program_count || 0 };
}

export function rankCommunities(communities, rawProfile, limit = 4) {
  const profile = normalizeProfile(rawProfile);
  return communities.map((c) => evaluateCommunity(c, profile)).filter((r) => r.score > 0).sort(byScore).slice(0, limit);
}

export function filterPrograms(programs, f = {}, today = todayIso()) {
  const ql = String(f.q || "").trim().toLowerCase();
  const out = [];
  for (const p of programs) {
    const st = effectiveStatus(p, today);
    if (f.type && p.type !== f.type) continue;
    if (f.province && !(p.provinces || ["any"]).includes("any") && !(p.provinces || []).includes(String(f.province).toUpperCase())) continue;
    if (f.stage && !(p.stages || []).includes(f.stage)) continue;
    if (f.audience && !(p.audiences || []).includes(f.audience) && !(p.restricted_to || []).includes(f.audience)) continue;
    if (f.need && !(p.needs || []).includes(f.need)) continue;
    if (f.status === "live" && st !== "open" && st !== "rolling") continue;
    if (STATUSES.includes(f.status) && st !== f.status) continue;
    if (ql && ![p.name, p.org, p.summary, (p.requirements || []).join(" ")].join(" ").toLowerCase().includes(ql)) continue;
    out.push({ ...brief(p), status: st });
  }
  const rank = (r) => (r.status === "open" || r.status === "rolling" ? 0 : r.status === "check" ? 1 : 2);
  return out.sort((a, b) => (rank(a) - rank(b)) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// A program a community admin lists (mirrors navigator.clean_listing). Throws an Error with a readable message.
export function cleanListing(body) {
  const name = String(body.name || "").trim();
  if (name.length < 3) throw new Error("Give the program a name");
  const url = String(body.apply_url || "").trim();
  if ((url && !(url.startsWith("https://") || url.startsWith("http://"))) || url.length > 300 || url.includes(" ")) throw new Error("The apply link must start with https://");
  const kind = TYPES.includes(body.type) ? body.type : "mentorship";
  const status = STATUSES.includes(body.status) ? body.status : "open";
  let dkind = String(body.deadline_kind || (body.deadline_date ? "fixed" : "rolling"));
  if (!["fixed", "rolling", "annual", "none_published", "closed"].includes(dkind)) dkind = "rolling";
  let ddate = String(body.deadline_date || "").trim().slice(0, 10) || null;
  if (dkind === "fixed") { if (!/^\d{4}-\d{2}-\d{2}$/.test(ddate || "") || isNaN(Date.parse(ddate))) throw new Error("Use a deadline date like 2026-12-01"); } else ddate = null;
  const reqs = (body.requirements || []).map((r) => String(r).trim().slice(0, 140)).filter(Boolean).slice(0, 8);
  return {
    name: name.slice(0, 120), org: String(body.org || "").trim().slice(0, 120), type: kind, summary: String(body.summary || "").trim().slice(0, 240), amount: String(body.amount || "").trim().slice(0, 160),
    stages: lst(body.stages, STAGES).length ? lst(body.stages, STAGES) : [...STAGES], audiences: lst(body.audiences, AUDIENCES), needs: lst(body.needs, NEEDS),
    sectors: lst(body.sectors, SECTORS).length ? lst(body.sectors, SECTORS) : ["any"], requirements: reqs, status, apply_url: url,
    deadline: { kind: dkind, date: ddate, note: String(body.deadline_note || "").trim().slice(0, 160) },
  };
}

export function communityProgram(row, slug, communityName) {
  return {
    id: `c-${slug}-${row.id}`, name: row.name, org: row.org || communityName, level: "community", type: row.type || "mentorship", summary: row.summary || "", amount: row.amount || "",
    stages: row.stages || [...STAGES], audiences: row.audiences || [], needs: row.needs || [], sectors: row.sectors || ["any"], provinces: ["any"], restricted_to: [], requires: {},
    requirements: row.requirements || [], deadline: row.deadline || { kind: "rolling", date: null, note: "" }, status: row.status || "open", phase: "learn",
    apply_url: row.apply_url || `/c/${slug}`, source_url: `/c/${slug}`, verified: "official", last_checked: (row.updated_at || "").slice(0, 10), community: { slug, name: communityName },
  };
}
