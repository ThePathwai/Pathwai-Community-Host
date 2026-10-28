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
// Plain words: open = taking applications now, rolling = no deadline, check = dates not published.
export const STATUS_LABEL = { open: "Open now", rolling: "Apply anytime", check: "Dates not posted", closed: "Closed", paused: "Paused" };
export const STATUS_HELP = {
  open: "Taking applications right now. If there is a closing date, it is shown.",
  rolling: "No deadline. Apply whenever you are ready.",
  check: "The organisation has not published dates. Check its page before you plan around it.",
  closed: "Not taking applications.",
  paused: "Not taking applications for now.",
};
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
const why = (row) => { const rs = row.reasons || []; return rs.find((r) => !isStageLine(r)) || rs[0] || row.summary || ""; };
export const CHECK_Q = { apply: "Can I apply?", stage: "Is it for my stage?", need: "Does it give me what I need?", timing: "Can I apply now?" };
export const FIT_WORD = { strong: "Good match", possible: "Worth a look", later: "Not yet", skip: "Not matched" };
export const STAGE_LINE_PREFIXES = ["Built for founders at your stage", "Open to companies at any stage"];
export const isStageLine = (r) => STAGE_LINE_PREFIXES.some((x) => String(r || "").startsWith(x));
const SEVERITY = { yes: 0, maybe: 1, later: 2, no: 3 };
const worst = (items) => items.reduce((w, i) => (SEVERITY[i.state] > SEVERITY[w] ? i.state : w), "yes");

// Judge one program for one founder by asking four plain questions (the twin of navigator.py: keep the two identical).
//   1. Can I apply?  2. Is it for my stage?  3. Does it give me what I need?  4. Can I apply now?
// Each is "yes", "maybe" (an answer is missing from the profile), "later" (a step not taken yet) or "no". No points.
// A "no" on 1 or 2 is "skip", a "later" on 1 or 2 is "later", yes/yes/yes on 1 to 3 is "strong", anything else is "possible".
// Timing never changes the match. `score` only orders programs inside a match group and is never shown.
export function evaluate(p, profile, today) {
  const req = p.requires || {};
  const facets = []; const tailored = []; const focus = [];
  const add = (state, text, ask) => facets.push(ask ? { state, text, ask } : { state, text });

  const restricted = p.restricted_to || [];
  if (restricted.length) {
    const label = joinList(restricted.map((a) => AUDIENCE_LABEL[a] || a));
    if (restricted.some((a) => profile.audiences.includes(a))) { add("yes", `For ${label} founders only. You qualify.`); tailored.push(`For ${label} founders, which you are.`); }
    else add("no", `For ${label} founders`);
  }
  const provs = p.provinces || ["any"];
  if (!provs.includes("any")) {
    if (provs.includes(profile.province)) add("yes", `Open to founders in ${profile.province}.`);
    else add("no", "Only for " + joinList(provs));
  }
  const age = profile.age;
  const lo = req.age_min ?? null; const hi = req.age_max ?? null;
  if (lo !== null || hi !== null) {
    const span = lo !== null && hi !== null ? `${lo} to ${hi}` : lo !== null ? `${lo}+` : `up to ${hi}`;
    if (age === null) add("maybe", "Has an age limit" + (lo !== null && hi !== null ? ` (${lo} to ${hi})` : "") + "; add your age to check", "age");
    else if ((lo !== null && age < lo) || (hi !== null && age > hi)) add("no", "Age limit " + span);
    else add("yes", `Age limit ${span}. You fit.`);
  }
  if (req.student) { if (profile.student) add("yes", "For students. You are one."); else add("no", "Only for students"); }
  const emp = profile.employees;
  if (req.max_employees != null) {
    if (emp === null) add("maybe", `Limit of ${req.max_employees} employees; add your team size to check`, "employees");
    else if (emp > req.max_employees) add("no", `Limit of ${req.max_employees} employees`);
    else add("yes", `Limit of ${req.max_employees} employees. You are within it.`);
  }
  const sectors = p.sectors || ["any"];
  const specific = !sectors.includes("any");
  if (specific) {
    const secHits = profile.sectors.filter((s) => sectors.includes(s));
    if (secHits.length) { add("yes", "Focused on " + joinList(secHits) + ", your area."); focus.push("Focused on " + joinList(secHits) + ", your area."); }
    else if (profile.sectors.length) add("no", "Focused on " + joinList(sectors));
    else add("maybe", "Focused on " + joinList(sectors) + "; add your sector to check.", "sectors");
  }
  const audHits = profile.audiences.filter((a) => (p.audiences || []).includes(a));
  if (audHits.length && !restricted.length) {
    const t = "Designed for " + joinList(audHits.map((a) => AUDIENCE_LABEL[a])) + " founders.";
    add("yes", t); tailored.push(t);
  }
  if (req.incorporated) {
    if (profile.incorporated === true) add("yes", "Needs an incorporated company. You have one.");
    else if (profile.incorporated === false) add("later", "Needs an incorporated company.");
    else add("maybe", "Requires an incorporated company; say whether you are incorporated to check.", "incorporated");
  }
  if (req.min_employees != null) {
    if (emp === null) add("maybe", `Needs at least ${req.min_employees} full-time employees; add your team size to check`, "employees");
    else if (emp < req.min_employees) add("later", `Needs at least ${req.min_employees} full-time employees.`);
    else add("yes", `Needs at least ${req.min_employees} employees. You have them.`);
  }
  const aState = worst(facets);
  const blocking = facets.find((f) => f.state === aState) || null;
  const aText = aState === "yes" ? (facets.length ? "You meet what they ask for." + (tailored.length || focus.length ? " " + [...tailored, ...focus][0] : "") : "Nothing rules you out.") : blocking.text;
  const applyCheck = { key: "apply", q: CHECK_Q.apply, state: aState, text: aText, items: facets, ...(blocking && blocking.ask ? { ask: blocking.ask } : {}) };

  const stages = (p.stages || STAGES).filter((s) => STAGES.includes(s)); const stageList = stages.length ? stages : STAGES;
  const si = STAGES.indexOf(profile.stage);
  let stageCheck;
  if (stageList.includes(profile.stage)) {
    stageCheck = { key: "stage", q: CHECK_Q.stage, state: "yes", text: stageList.length >= 4 ? `Open to companies at any stage, including yours (${STAGE_LABEL[profile.stage]}).` : `Built for founders at your stage (${STAGE_LABEL[profile.stage]}).` };
  } else {
    const idx = stageList.map((s) => STAGES.indexOf(s));
    const earliest = Math.min(...idx); const latest = Math.max(...idx);
    stageCheck = si > latest
      ? { key: "stage", q: CHECK_Q.stage, state: "no", text: "Aimed at earlier-stage companies" }
      : { key: "stage", q: CHECK_Q.stage, state: "later", text: `Aimed at companies that are ${STAGE_LABEL[STAGES[earliest]]} or further along.` };
  }

  const provides = p.needs || [];
  const hits = profile.needs.filter((n) => provides.includes(n));
  const misses = profile.needs.filter((n) => !provides.includes(n));
  let needCheck;
  if (hits.length) {
    let text = "Gives you " + joinList(hits.slice(0, 3).map((n) => NEED_LABEL[n])) + ", which you asked for.";
    if (misses.length) text += " It does not cover " + joinList(misses.slice(0, 3).map((n) => NEED_LABEL[n])) + ".";
    needCheck = { key: "need", q: CHECK_Q.need, state: "yes", text };
  } else if (profile.needs.length) {
    let text = "Does not cover what you asked for (" + joinList(profile.needs.slice(0, 3).map((n) => NEED_LABEL[n])) + ").";
    if (provides.length) text += " It offers " + joinList(provides.slice(0, 3).filter((n) => n in NEED_LABEL).map((n) => NEED_LABEL[n])) + ".";
    needCheck = { key: "need", q: CHECK_Q.need, state: "no", text };
  } else needCheck = { key: "need", q: CHECK_Q.need, state: "maybe", text: "You have not said what you need, so this cannot be checked yet.", ask: "needs" };

  const status = effectiveStatus(p, today);
  const dl = p.deadline || {};
  const days = dl.kind === "fixed" ? daysUntil(dl.date, today) : null;
  let timingCheck;
  if (status === "closed") timingCheck = { key: "timing", q: CHECK_Q.timing, state: "no", text: ("Closed right now. " + (dl.note || "")).trim() };
  else if (status === "paused") timingCheck = { key: "timing", q: CHECK_Q.timing, state: "no", text: ("Paused. " + (dl.note || "")).trim() };
  else if (days !== null) timingCheck = { key: "timing", q: CHECK_Q.timing, state: "yes", text: `Closes in ${days} day${days === 1 ? "" : "s"} (${dl.date}).` };
  else if (status === "open" || status === "rolling") timingCheck = { key: "timing", q: CHECK_Q.timing, state: "yes", text: "Taking applications now" + (dl.kind === "rolling" && dl.note ? ": " + dl.note : ".") };
  else timingCheck = { key: "timing", q: CHECK_Q.timing, state: "maybe", text: "No deadline was published, so check the site before planning around it." };

  const checks = [applyCheck, stageCheck, needCheck, timingCheck];
  const live = status === "closed" || status === "paused" ? 0 : 1;
  const urgency = days !== null && days <= 60 ? 3 : status === "open" ? 2 : status === "rolling" ? 1 : 0;
  const trust = { official: 2, third_party: 1 }[p.verified || "unconfirmed"] ?? 0;
  const score = live * 10000 + (tailored.length + focus.length) * 1000 + Math.min(3, hits.length) * 100 + urgency * 10 + trust;

  const reasons = [...tailored, ...(needCheck.state === "yes" ? [needCheck.text] : []), ...focus, ...(timingCheck.state === "yes" ? [timingCheck.text] : []), ...(stageCheck.state === "yes" ? [stageCheck.text] : [])].filter(Boolean);
  const steps = [...facets.filter((f) => f.state === "later").map((f) => f.text), ...(stageCheck.state === "later" ? [stageCheck.text] : [])];
  const cautions = [...steps, ...facets.filter((f) => f.state === "maybe" || f.state === "no").map((f) => f.text), ...[needCheck, timingCheck].filter((c) => c.state !== "yes").map((c) => c.text)];
  if (p.verified === "unconfirmed") cautions.push("We could not confirm the current details. Check the program page.");
  const out = { score, reasons, cautions, skip: "", checks };

  const stopper = [applyCheck, stageCheck].find((c) => c.state === "no");
  if (stopper) return { ...out, fit: "skip", score: 0, reasons: [], cautions: [], skip: stopper === applyCheck ? blocking.text : stopper.text };
  if (aState === "later" || stageCheck.state === "later") return { ...out, fit: "later" };
  if (aState === "yes" && stageCheck.state === "yes" && needCheck.state === "yes") return { ...out, fit: "strong" };
  return { ...out, fit: "possible" };
}

// What a card needs about one program: the match, the sentences and the four answers. A program that is not matched
// carries its one reason in `cautions`, so the card can say why.
const verdict = (p, profile, today) => {
  const ev = evaluate(p, profile, today);
  if (ev.fit === "skip") return { fit: "skip", score: 0, reasons: [], cautions: [ev.skip], checks: ev.checks };
  return { fit: ev.fit, score: ev.score, reasons: ev.reasons, cautions: ev.cautions, checks: ev.checks };
};

const BRIEF_KEYS = ["id", "name", "org", "level", "type", "summary", "amount", "stages", "audiences", "needs", "sectors", "provinces", "requirements", "deadline", "status", "phase", "apply_url", "link_label", "link_kind", "link_note", "link_exact", "source_url", "verified", "last_checked", "restricted_to", "community"];
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
  const others = [];
  for (const p of programs) {
    const ev = evaluate(p, profile, today);
    if (ev.fit === "skip") {
      skipped += 1;
      // Not left out, just not matched: the founder can still look, and sees why it does not line up.
      others.push({ ...brief(p), status: effectiveStatus(p, today), ...verdict(p, profile, today) });
      continue;
    }
    buckets[ev.fit].push({ ...brief(p), status: effectiveStatus(p, today), ...verdict(p, profile, today) });
  }
  for (const k of Object.keys(buckets)) buckets[k].sort(byScore);
  const ranked = [...buckets.strong, ...buckets.possible];
  const liveRank = { open: 0, rolling: 1, check: 2, closed: 3, paused: 3 };
  others.sort((a, b) => ((liveRank[a.status] ?? 2) - (liveRank[b.status] ?? 2)) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const path = [];
  for (const phase of PHASE_ORDER) {
    const pick = ranked.find((r) => r.phase === phase && r.status !== "closed" && r.status !== "paused") || ranked.find((r) => r.phase === phase);
    if (pick) path.push({ phase, label: PHASE_LABEL[phase], program_id: pick.id, name: pick.name, why: why(pick) });
  }
  return { profile, matches: ranked.slice(0, limit), more: ranked.slice(limit, limit + 8), later: buckets.later.slice(0, 5), skipped, others, path, trajectory: trajectory(programs, profile, today), summary: summaryText(profile, ranked, buckets.later), as_of: today };
}

export const STAGE_NOW = { idea: "at the idea stage", prototype: "at the prototype stage", launched: "just launched", revenue: "earning revenue", growth: "growing" };

// Where the founder came from, where they are and where they are going. Mirrors backend/navigator.py trajectory().
// Not every program lines up with a stage, and the route does not pretend they do: columns can be short or empty, and programs
// that are not tied to a stage (resources, anything serving four or more stages) go in "anytime".
const isAnytime = (p) => {
  const st = (p.stages || STAGES).filter((x) => STAGES.includes(x));
  return p.type === "resource" || st.length >= 4 || st.length === 0;
};
const cmpKey = (a, b) => { for (let k = 0; k < 3; k += 1) { if (a.key[k] < b.key[k]) return -1; if (a.key[k] > b.key[k]) return 1; } return 0; };

export function trajectory(programs, rawProfile, today = todayIso(), perStage = 3, anyLimit = 6, currentLimit = 5) {
  const profile = normalizeProfile(rawProfile);
  const cur = STAGES.indexOf(profile.stage);
  const stateOf = (i) => (i < cur ? "past" : i === cur ? "current" : "future");
  const usable = (p, stage) => { const ev = evaluate(p, { ...profile, stage }, today); return ev.fit === "skip" ? null : ev; };
  const stages = STAGES.map((stage, i) => {
    const state = stateOf(i);
    const rows = [];
    for (const p of programs) {
      if (isAnytime(p)) continue;
      const stList = (p.stages || STAGES).filter((x) => STAGES.includes(x));
      const idx = stList.map((x) => STAGES.indexOf(x));
      const first = Math.min(...idx); const last = Math.max(...idx);
      if (state === "past" && last !== i) continue;
      if (state === "future" && first !== i) continue;
      if (state === "current" && !stList.includes(stage)) continue;
      const ev = usable(p, stage);
      if (!ev) continue;
      const status = effectiveStatus(p, today);
      if ((status === "closed" || status === "paused") && state !== "past") continue;
      const live = state === "current" || status === "open" || status === "rolling" ? 0 : status === "check" ? 1 : 2;
      rows.push({ key: [live, -ev.score, p.name], p, ev, status });
    }
    rows.sort(cmpKey);
    let picked = [];
    const limit = state === "current" ? currentLimit : perStage;
    for (const cap of [2, limit]) {
      for (const r of rows) {
        if (picked.length >= limit) break;
        if (picked.includes(r) || picked.filter((x) => x.p.type === r.p.type).length >= cap) continue;
        picked.push(r);
      }
    }
    picked = rows.filter((r) => picked.includes(r));
    const out = picked.map((r) => {
      let note;
      if (state === "future") { note = `Opens up at the ${STAGE_LABEL[stage]} stage.`; if (r.ev.cautions.length) note += " " + r.ev.cautions[0]; }
      else if (state === "past") note = "Aimed at this stage and earlier. You may have used it, or skipped it.";
      else note = why({ ...brief(r.p), reasons: r.ev.reasons });
      return { ...brief(r.p), status: r.status, ...verdict(r.p, profile, today), note };
    });
    return { stage, label: STAGE_LABEL[stage], hint: STAGE_HINT[stage], state, available: rows.length, programs: out };
  });
  const anyRows = [];
  for (const p of programs) {
    if (!isAnytime(p)) continue;
    const ev = usable(p, profile.stage);
    const status = effectiveStatus(p, today);
    if (!ev || status === "closed" || status === "paused") continue;
    anyRows.push({ key: [status === "open" || status === "rolling" ? 0 : 1, -ev.score, p.name], p, ev, status });
  }
  anyRows.sort(cmpKey);
  const anytime = anyRows.slice(0, anyLimit).map((r) => ({ ...brief(r.p), status: r.status, ...verdict(r.p, profile, today), note: r.p.summary || "" }));
  const nxt = cur + 1 < stages.length ? stages[cur + 1] : null;
  let story = "";
  if (cur > 0) story += `You've come through ${joinList(stages.slice(0, cur).map((c) => c.label))}. `;
  story += `Right now you're ${STAGE_NOW[profile.stage]}. `;
  if (nxt) {
    const names = nxt.programs.slice(0, 2).map((r) => r.name);
    if (names.length > 1) story += `Next up is ${nxt.label}, where ${joinList(names)} come into reach.`;
    else if (names.length) story += `Next up is ${nxt.label}, where ${names[0]} comes into reach.`;
    else story += `Next up is ${nxt.label}. Nothing new opens up there, so lean on what already fits.`;
  } else story += "You're at the top of the ladder, so the focus now is scaling and export.";
  return { current: profile.stage, index: cur, stages, anytime, anytime_total: anyRows.length, story };
}

// Programs a founder is in now, or has been part of at an earlier stage. Mirrors update_tracked() in backend/navigator.py.
// The founder's path: for each thing they want next, the few resources worth using, best first, then a preview of the next stage.
// Mirrors backend/navigator.py route_plan().
export const STAGE_GOALS = {
  idea: ["mentorship", "training", "funding"], prototype: ["funding", "mentorship", "space"], launched: ["customers", "funding", "network"],
  revenue: ["funding", "export", "talent"], growth: ["export", "talent", "funding"],
};
const ROUTE_PER_GOAL = 2;
const ROUTE_COMING_UP = 3;
export function routePlan(programs, rawProfile, tracked = [], today = todayIso()) {
  const profile = normalizeProfile(rawProfile);
  const cur = STAGES.indexOf(profile.stage);
  const res = suggest(programs, profile, today, programs.length + 1);
  const mine = Object.fromEntries((tracked || []).map((t) => [t.id, t]));
  const done = new Set((tracked || []).filter((t) => t.state === "done").map((t) => t.id));
  const ranked = res.matches.filter((r) => !done.has(r.id));
  const used = new Set();
  const steps = [];
  for (const need of profile.needs) {
    const fits = ranked.filter((r) => (r.needs || []).includes(need) && !used.has(r.id));
    const live = fits.filter((r) => ["open", "rolling", "check"].includes(r.status));
    const waiting = fits.filter((r) => ["closed", "paused"].includes(r.status));
    live.sort((a, b) => (mine[a.id]?.state === "in" ? 0 : 1) - (mine[b.id]?.state === "in" ? 0 : 1));
    let picks = live.slice(0, ROUTE_PER_GOAL);
    if (picks.length < 2) picks = picks.concat(waiting.slice(0, 2 - picks.length));
    picks.forEach((r) => used.add(r.id));
    steps.push({ need, label: NEED_LABEL[need], title: "To get " + NEED_LABEL[need], resources: picks.map((r) => ({ ...r, mine: mine[r.id]?.state || "" })), more: Math.max(0, live.length - ROUTE_PER_GOAL) });
  }
  const nxt = cur + 1 < STAGES.length ? STAGES[cur + 1] : null;
  let coming = null;
  if (nxt) {
    const col = res.trajectory.stages[cur + 1];
    coming = { stage: nxt, label: STAGE_LABEL[nxt], hint: STAGE_HINT[nxt], programs: col.programs.filter((r) => !used.has(r.id) && !done.has(r.id)).slice(0, ROUTE_COMING_UP) };
  }
  return {
    stage: profile.stage, label: STAGE_LABEL[profile.stage], goal: profile.goal, needs: profile.needs,
    options: NEEDS.map((k) => ({ key: k, label: NEED_LABEL[k], common: STAGE_GOALS[profile.stage].includes(k) })),
    steps, coming_up: coming, next: nxt, as_of: today,
  };
}

export const MAX_TRACKED = 60;
export function updateTracked(items, body, defaultStage = "idea", today = todayIso()) {
  const rows = (items || []).filter((i) => i && i.id);
  const state = String(body.state || "");
  if (!["in", "done", "none"].includes(state)) throw new Error("Choose in, done or none");
  const pid = String(body.id || "").trim().slice(0, 80);
  if (state === "none") return rows.filter((i) => i.id !== pid);
  const name = String(body.name || "").split(/\s+/).filter(Boolean).join(" ").slice(0, 120);
  if (name.length < 2) throw new Error("Give the program a name");
  let stage = String(body.stage || "").trim().toLowerCase();
  if (!STAGES.includes(stage)) stage = STAGES.includes(defaultStage) ? defaultStage : "idea";
  const kind = String(body.type || "");
  const row = { id: pid || "m-" + Math.random().toString(16).slice(2, 10), name, org: String(body.org || "").split(/\s+/).filter(Boolean).join(" ").slice(0, 120), type: TYPES.includes(kind) ? kind : "", state, stage, at: today };
  const out = [...rows.filter((i) => i.id !== row.id), row];
  if (out.length > MAX_TRACKED) throw new Error(`You can track up to ${MAX_TRACKED} programs`);
  return out;
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
