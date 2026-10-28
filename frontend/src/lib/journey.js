// Journey: the founder's own startup plan (the twin of backend/journey.py: keep the two identical; a test runs both on the same cases).
// A list of milestones, each filed under one of the five stages. Suggestions come from starter milestones (data/journey_templates.json)
// and from programs that are a good match now, and every one says why. Progress is counting: done out of planned.
import { STAGES, daysUntil, normalizeProfile, suggest, why } from "./navigator";

export const JOURNEY_STATUSES = ["todo", "doing", "done"];
export const JOURNEY_STATUS_LABEL = { todo: "To do", doing: "In progress", done: "Done" };
export const STAGE_NAME = { idea: "Idea", prototype: "Prototype", launched: "Launched", revenue: "Revenue", growth: "Growth" };
export const MAX_MILESTONES = 120;
const MAX_ADD_MANY = 20; const READY_SHARE = 0.8; const READY_MIN = 3; const SOON_DAYS = 30;

const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const validIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T12:00:00Z")) && new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s;
const due = (v) => { const s = String(v ?? "").trim(); if (!s) return ""; const t = s.slice(0, 10); if (!validIso(t)) throw new Error("The due date is not a valid date."); return t; };
const title = (v) => { const s = String(v ?? "").split(/\s+/).filter(Boolean).join(" "); if (s.length < 2) throw new Error("Give the milestone a short title."); return s.slice(0, 120); };
const squash = (v, n) => String(v ?? "").split(/\s+/).filter(Boolean).join(" ").slice(0, n);
let counter = 0;
const randomId = () => "j-" + (Date.now().toString(16) + (counter++).toString(16)).slice(-8);

const clean = (raw, defaultStage, today, newId) => {
  const stage = String(raw.stage || defaultStage).trim().toLowerCase();
  const status = String(raw.status || "todo").trim().toLowerCase();
  if (!JOURNEY_STATUSES.includes(status)) throw new Error("Status must be to do, in progress or done.");
  return {
    id: newId(), title: title(raw.title), stage: STAGES.includes(stage) ? stage : defaultStage, status, due: due(raw.due), note: squash(raw.note, 500),
    key: String(raw.key || "").slice(0, 60), program_id: String(raw.program_id || "").slice(0, 120), program_name: String(raw.program_name || "").slice(0, 120),
    created_at: today, done_at: status === "done" ? today : "",
  };
};
const add = (items, raw, defaultStage, today, newId) => {
  const m = clean(raw, defaultStage, today, newId);
  if (m.key && items.some((i) => i.key === m.key)) return items;
  if (items.length >= MAX_MILESTONES) throw new Error(`Your plan is full (${MAX_MILESTONES} milestones). Remove one to add another.`);
  return [...items, m];
};

export function updateJourney(itemsIn, body, defaultStageIn = "idea", today, newId = randomId) {
  const defaultStage = STAGES.includes(defaultStageIn) ? defaultStageIn : "idea";
  let items = (itemsIn || []).map((i) => ({ ...i }));
  const op = String(body.op || "");
  if (op === "add") return add(items, body, defaultStage, today, newId);
  if (op === "add_many") { for (const raw of (body.items || []).slice(0, MAX_ADD_MANY)) items = add(items, raw && typeof raw === "object" ? raw : {}, defaultStage, today, newId); return items; }
  if (op !== "remove" && op !== "update") throw new Error("Unknown change.");
  const at = items.findIndex((i) => i.id === String(body.id || ""));
  if (at < 0) throw new Error("That milestone is not on your plan.");
  if (op === "remove") return [...items.slice(0, at), ...items.slice(at + 1)];
  if (op === "update") {
    const m = items[at];
    if ("title" in body) m.title = title(body.title);
    if ("stage" in body && STAGES.includes(String(body.stage).trim().toLowerCase())) m.stage = String(body.stage).trim().toLowerCase();
    if ("due" in body) m.due = due(body.due);
    if ("note" in body) m.note = squash(body.note, 500);
    if ("status" in body) {
      const st = String(body.status).trim().toLowerCase();
      if (!JOURNEY_STATUSES.includes(st)) throw new Error("Status must be to do, in progress or done.");
      if (st === "done" && m.status !== "done") m.done_at = today; else if (st !== "done") m.done_at = "";
      m.status = st;
    }
  }
  return items;
}

const applies = (tpl, profile) => {
  const w = tpl.when || {};
  if ("incorporated" in w) {
    const inc = profile.incorporated;
    if (w.incorporated === false && inc === true) return false;
    if (w.incorporated === true && inc !== true) return false;
  }
  for (const [key, field] of [["needs_any", "needs"], ["sectors_any", "sectors"], ["audiences_any", "audiences"]]) {
    if (key in w && !w[key].some((x) => profile[field].includes(x))) return false;
  }
  return true;
};

export function journeySuggestions(rawProfile, itemsIn, programs, today, templates, programLimit = 3) {
  const profile = normalizeProfile(rawProfile);
  const have = new Set((itemsIn || []).map((i) => i.key).filter(Boolean));
  const out = Object.fromEntries(STAGES.map((s) => [s, []]));
  for (const tpl of templates) {
    if (have.has(tpl.key) || !applies(tpl, profile)) continue;
    out[tpl.stage].push({ key: tpl.key, title: tpl.title, stage: tpl.stage, why: tpl.why, core: !!tpl.core });
  }
  const res = suggest(programs, profile, today, 60);
  const picks = [];
  for (const m of res.matches) {
    const key = `prog:${m.id}`;
    if (picks.length >= programLimit) break;
    if (m.fit !== "strong" || !["open", "rolling"].includes(m.status) || have.has(key)) continue;
    const dl = m.deadline || {};
    picks.push({ key, title: `${m.type === "resource" ? "Explore" : "Apply to"} ${m.name}`, stage: profile.stage, why: why(m), core: false, program_id: m.id, program_name: m.name, due: dl.kind === "fixed" ? dl.date : "" });
  }
  const cur = out[profile.stage];
  out[profile.stage] = [...cur.filter((s) => s.core), ...picks, ...cur.filter((s) => !s.core)];
  return out;
}

export function journeySummary(itemsIn, currentStageIn, today) {
  const items = itemsIn || [];
  const currentStage = STAGES.includes(currentStageIn) ? currentStageIn : "idea";
  const cur = STAGES.indexOf(currentStage);
  const stages = STAGES.map((s) => {
    const mine = items.filter((i) => i.stage === s);
    const overdue = mine.filter((i) => i.status !== "done" && i.due && (daysUntil(i.due, today) ?? 0) < 0).length;
    return { stage: s, name: STAGE_NAME[s], total: mine.length, done: mine.filter((i) => i.status === "done").length, doing: mine.filter((i) => i.status === "doing").length, overdue };
  });
  const cands = [];
  items.forEach((m, n) => {
    if (m.status === "done") return;
    const si = STAGES.indexOf(m.stage);
    const d = m.due ? daysUntil(m.due, today) : null;
    if (si > cur && !(d !== null && d <= SOON_DAYS)) return;
    const rank = d !== null && d < 0 ? 0 : d !== null ? 1 : m.status === "doing" ? 2 : 3;
    cands.push([rank, d !== null ? d : 0, Math.abs(cur - si), n, m, d]);
  });
  cands.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
  const nextUp = cands.slice(0, 3).map(([, , , , m, d]) => ({ ...m, overdue: d !== null && d < 0, days: d }));
  const done = items.map((i, n) => [i.done_at || "", n, i]).filter(([, , i]) => i.status === "done");
  done.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : b[1] - a[1]));
  const weekAgo = addDays(today, -6);
  const total = items.length; const finished = done.length;
  let ready = null;
  const cs = stages[cur];
  if (cur < STAGES.length - 1 && cs.total >= READY_MIN && cs.done / cs.total >= READY_SHARE) {
    const nxt = STAGES[cur + 1];
    ready = { to: nxt, to_name: STAGE_NAME[nxt], done: cs.done, total: cs.total, text: `You have finished ${cs.done} of ${cs.total} milestones in ${cs.name}.` };
  }
  return {
    current: currentStage, stages, total, done: finished, percent: total ? Math.floor((200 * finished + total) / (2 * total)) : 0,
    overdue: stages.reduce((a, s) => a + s.overdue, 0), done_this_week: done.filter(([d]) => d >= weekAgo).length,
    next_up: nextUp, recent: done.slice(0, 5).map(([, , i]) => ({ id: i.id, title: i.title, stage: i.stage, done_at: i.done_at || "" })), ready,
  };
}
