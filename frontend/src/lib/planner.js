// The venture planner: a founder tells their story, sees a few directions the business could take, picks one, gets a plan that uses the
// support around them, and arrives at an advisor conversation with a brief and specific questions. The founder owns all of it and decides
// whether anyone else sees it. Pure rules (no network), the same way lib/moves.js and lib/explain.js are, so a server can run them later.
//   startup: the founder's saved startup profile (name, one_liner, stage, needs, goal, pitch{...}, documents[])
//   lists:   everything the hub knows, already judged against the founder (lib/moves.js buildMoves().lists): {program, grant, event, person, resource}
//   plan:    what the founder has chosen and ticked: {direction, status{id: todo|doing|done}, custom[], hidden[], shared, include{}, notes}
import { NEED_LABEL, STAGE_LABEL, STAGE_NOW, needsFromText } from "./navigator";
import { daysBetween, joinList, labels } from "./explain";

export const STEPS = [
  { key: "story", label: "Your story", to: "/plan?step=story" },
  { key: "directions", label: "Directions", to: "/plan?step=directions" },
  { key: "plan", label: "Your plan", to: "/plan?step=plan" },
  { key: "brief", label: "Advisor brief", to: "/plan?step=brief" },
];
export const HORIZONS = [["soon", "Next 2 weeks"], ["month", "Next 30 days"], ["quarter", "Next 90 days"]];
export const STATUS_LABEL = { todo: "To do", doing: "In progress", done: "Done" };
export const BRIEF_SECTIONS = [["story", "Your story"], ["direction", "Direction you are leaning toward"], ["plan", "Where your plan stands"], ["lined", "Support lined up"], ["questions", "Questions for your advisor"]];
const MAX_CUSTOM = 20;

// ---- directions -------------------------------------------------------------------------------------------------------------------------
// Each direction is a plain-language bet, with the honest cost of making it. `moves` are the first three steps, as [horizon, step, why].
export const DIRECTIONS = [
  { key: "customers", title: "Win more customers first", needs: ["customers", "network"], stages: ["prototype", "launched", "revenue"], words: ["customer", "pilot", "revenue", "users", "sales"],
    promise: "Spend the next quarter getting more people to pay or pilot before you raise anything.",
    cost: "Funding conversations wait until your numbers are stronger.",
    moves: [["soon", "List the three kinds of customer most likely to pay, with ten real names for each", "It narrows who you talk to first."],
      ["month", "Run ten customer conversations and write down what each would pay for", "This is the proof any funder or advisor will ask about."],
      ["quarter", "Turn two of those conversations into paid pilots", "A paid pilot is worth more than ten promises."]] },
  { key: "funding", title: "Raise early funding", needs: ["funding"], stages: ["idea", "prototype", "launched", "revenue"], words: ["fund", "raise", "grant", "capital", "invest", "seed"],
    promise: "Line up non-dilutive money first (grants and micro-grants), then decide whether to talk to investors.",
    cost: "Applications take time away from customers, and most have deadlines.",
    moves: [["soon", "Write a one-page ask: how much you need, what it pays for, and what it unlocks", "Every application and every investor will start here."],
      ["month", "Apply to the grants and programs that fit you today", "Free money first keeps more of the company yours."],
      ["quarter", "Decide whether to approach investors, using what the applications taught you", "You will know your numbers and your story by then."]] },
  { key: "mentor", title: "Learn from someone who has done it", needs: ["mentorship", "network", "training"], stages: ["idea", "prototype", "launched", "revenue", "growth"], words: ["mentor", "advice", "guidance", "learn", "scaled", "coach"],
    promise: "Find one or two people who have scaled something like yours, and let them shape your next moves.",
    cost: "It does not grow revenue or bring in money on its own.",
    moves: [["soon", "Write down the three decisions you are most stuck on", "Mentors help most with specific decisions."],
      ["month", "Meet two people who have been through it and ask them about those decisions", "Two views show you where experienced people disagree."],
      ["quarter", "Choose one to keep as a regular mentor, and report back on what changed", "Reporting back is how a first chat becomes a mentor."]] },
  { key: "build", title: "Strengthen the product", needs: ["rd", "ip", "talent", "space"], stages: ["idea", "prototype", "launched"], words: ["product", "build", "prototype", "tech", "patent", "hire"],
    promise: "Make what you have clearly better, protected and easier to sell, before you push for growth.",
    cost: "Customers and funding move slower while you build.",
    moves: [["soon", "List the three things customers or testers ask for most", "It keeps the build tied to real demand."],
      ["month", "Check what you can protect (IP) and what research funding applies", "These are cheaper to sort out before you scale."],
      ["quarter", "Ship one big improvement and show it to five existing users", "Their reaction tells you if the build was worth it."]] },
  { key: "expand", title: "Open a second market", needs: ["customers", "export", "funding"], stages: ["launched", "revenue", "growth"], words: ["second city", "second market", "expand", "new market", "export", "scale", "abroad", "national"],
    promise: "Take what works in your first market to a second one, and use that to show you can scale.",
    cost: "It stretches a small team, and a second market can hide problems in the first.",
    moves: [["soon", "Write down what is working in your first market, in numbers", "A second market only repeats what is already proven."],
      ["month", "Pick the one best second market and talk to five people who live there", "One market done well beats three half-tried."],
      ["quarter", "Run a small paid test in that market before committing the team", "It is a cheap way to find out if the pattern holds."]] },
];
const DIRECTION = Object.fromEntries(DIRECTIONS.map((d) => [d.key, d]));
export const directionOf = (key) => DIRECTION[key] || null;

const hasText = (s) => String(s || "").trim().length > 0;
const storyText = (st) => [st.goal, st.one_liner, ...Object.values(st.pitch || {})].filter(hasText).join(" ").toLowerCase();
// What an item gives, in the founder's needs vocabulary. People list what they can help with; programs and others carry `needs`.
export const itemNeeds = (it) => (it.needs && it.needs.length ? it.needs : needsFromText([...(it.offers || []), it.title, it.sub].join(" ")));
const live = (it) => it.verdict === "now" || it.verdict === "close";
const allItems = (lists) => Object.values(lists || {}).flat();
const supportFor = (dir, lists) => {
  const fits = (it) => live(it) && itemNeeds(it).some((n) => dir.needs.includes(n));
  const count = (...kinds) => kinds.flatMap((k) => (lists && lists[k]) || []).filter(fits).length;
  return { programs: count("program", "grant"), events: count("event"), people: count("person"), resources: count("resource") };
};

// The directions that suit this founder, best first, each with the reasons in plain words.
export function directions({ startup = {}, lists = {}, hub = "" }) {
  const needs = startup.needs || [];
  const text = storyText(startup);
  const out = DIRECTIONS.map((d) => {
    const hit = needs.filter((n) => d.needs.includes(n));
    const stageOk = d.stages.includes(startup.stage);
    const stem = d.words.find((w) => text.includes(w));
    const word = stem ? (text.match(new RegExp("[a-z]*" + stem + "[a-z]*")) || [stem])[0] : "";
    const support = supportFor(d, lists);
    const total = support.programs + support.events + support.people + support.resources;
    const score = hit.length * 3 + (stageOk ? 2 : -2) + (word ? 2 : 0) + Math.min(4, total) * 0.5;
    const reasons = [];
    if (hit.length) reasons.push(`You asked for ${labels(hit)}.`);
    if (word) reasons.push(`You wrote "${word}" in your story.`);
    if (stageOk && startup.stage) reasons.push(`It makes sense when you are ${STAGE_NOW[startup.stage] || STAGE_LABEL[startup.stage]}.`);
    if (total) reasons.push(`${hub ? hub + " has " : "There are "}${[[support.programs, "program"], [support.events, "event"], [support.people, "person"], [support.resources, "resource"]].filter(([n]) => n).map(([n, w]) => `${n} ${w === "person" ? (n === 1 ? "person" : "people") : w + (n === 1 ? "" : "s")}`).slice(0, 3).join(", ")} that fit it now.`);
    if (!reasons.length) reasons.push("It is a common route for startups like yours.");
    const caution = !stageOk && startup.stage ? `It is usually a later step than ${STAGE_NOW[startup.stage] || STAGE_LABEL[startup.stage]}.` : "";
    return { ...d, score, reasons, caution, support, supportTotal: total };
  });
  return out.sort((a, b) => b.score - a.score).map((d, i) => ({ ...d, best: i === 0 }));
}

// ---- the plan -----------------------------------------------------------------------------------------------------------------------------
const horizonFor = (days) => (days == null ? "month" : days <= 14 ? "soon" : days <= 45 ? "month" : "quarter");
const LINK = { program: "/navigator", grant: "/navigator", event: "/events", person: "/members", resource: "/resources" };
const linkOf = (it) => ({ kind: it.kind, id: it.id, to: it.kind === "person" ? `/members/${it.id}` : LINK[it.kind], label: it.title });
const fitsDirection = (dir) => (it) => live(it) && itemNeeds(it).some((n) => dir.needs.includes(n));
const ho = (h) => ["soon", "month", "quarter"].indexOf(h);

// Steps for the chosen direction: its own first moves, then the best things around the founder that serve it, then what to do to unlock the
// "almost there" ones, then the advisor meeting itself. Ids are stable so ticks survive a refresh.
export function buildPlan({ direction, lists = {}, plan = {}, today }) {
  const dir = DIRECTION[direction];
  if (!dir) return [];
  const steps = dir.moves.map(([h, title, why], i) => ({ id: `m:${dir.key}:${i}`, kind: "move", horizon: h, title, why }));
  const fit = fitsDirection(dir);
  const programs = [...(lists.program || []), ...(lists.grant || [])].filter(fit).slice(0, 2);
  for (const p of programs) {
    const d = p.deadline ? daysBetween(today, p.deadline) : null;
    steps.push({ id: `i:${p.kind}:${p.id}`, kind: "program", horizon: horizonFor(d), title: `${p.verdict === "now" ? "Apply to" : "Get ready for"} ${p.title}`, why: p.why, link: linkOf(p), when: p.deadline || "" });
  }
  for (const e of (lists.event || []).filter(fit).slice(0, 1)) steps.push({ id: `i:event:${e.id}`, kind: "event", horizon: horizonFor(e.days), title: `${e.rsvp ? "You're going to" : "Go to"} ${e.title}`, why: e.why, link: linkOf(e), when: e.at || "" });
  for (const m of (lists.person || []).filter(fit).slice(0, 2)) steps.push({ id: `i:person:${m.id}`, kind: "person", horizon: "soon", title: `Ask ${m.title} for advice`, why: m.gap || m.why, link: linkOf(m) });
  for (const r of (lists.resource || []).filter(fit).slice(0, 1)) steps.push({ id: `i:resource:${r.id}`, kind: "resource", horizon: "soon", title: `Use "${r.title}"`, why: r.why, link: linkOf(r) });
  const unlock = [...(lists.program || []), ...(lists.grant || [])].filter((p) => (p.verdict === "close" || p.verdict === "later") && p.gap).slice(0, 1);
  for (const p of unlock) steps.push({ id: `u:${p.id}`, kind: "unlock", horizon: "quarter", title: `Work toward ${p.title}`, why: p.gap, link: linkOf(p) });
  steps.push({ id: "final", kind: "advisor", horizon: "month", title: "Meet your advisor, with your brief", why: "Bring your direction, your plan and your questions so the time goes to advice." });
  for (const c of plan.custom || []) steps.push({ id: c.id, kind: "custom", horizon: c.horizon, title: c.title, why: "Added by you." });
  const hidden = new Set(plan.hidden || []);
  return steps.filter((s) => !hidden.has(s.id)).map((s, i) => ({ ...s, status: (plan.status || {})[s.id] || "todo", order: i }))
    .sort((a, b) => ho(a.horizon) - ho(b.horizon) || (a.kind === "advisor") - (b.kind === "advisor") || a.order - b.order);
}

export const planProgress = (steps) => ({ done: steps.filter((s) => s.status === "done").length, doing: steps.filter((s) => s.status === "doing").length, total: steps.length });

// Where the founder is in the four steps, for the tracker on Home and the top of the planner.
export function stepStates({ startup = {}, plan = {}, steps = [] }) {
  const story = hasText(startup.one_liner) && !!startup.stage && (startup.needs || []).length > 0 && hasText(startup.goal);
  const picked = !!DIRECTION[plan.direction];
  const prog = planProgress(steps);
  const brief = !!plan.shared || !!plan.brief_ready;
  const list = [
    { key: "story", done: story, detail: story ? `${startup.name || "Your startup"} · ${STAGE_LABEL[startup.stage] || ""}` : "Tell us what you are building and what you want." },
    { key: "directions", done: picked, detail: picked ? DIRECTION[plan.direction].title : "See the routes your business could take." },
    { key: "plan", done: picked && prog.total > 0 && prog.done >= Math.max(3, Math.ceil(prog.total / 2)), detail: picked ? `${prog.done} of ${prog.total} steps done` : "Comes from the direction you pick." },
    { key: "brief", done: brief, detail: plan.shared ? `Shared with ${plan.shared.name}` : brief ? "Ready for your advisor." : "A one-page summary with your questions." },
  ];
  const next = list.find((s) => !s.done) || list[list.length - 1];
  return STEPS.map((s, i) => ({ ...s, ...list[i], current: s.key === next.key, n: i + 1 }));
}

// ---- the advisor brief --------------------------------------------------------------------------------------------------------------------
const clip = (s, n = 160) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };
const dateWord = (iso) => { const d = new Date(String(iso).slice(0, 10) + "T12:00:00Z"); return isNaN(d) ? "" : d.toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }); };

// Specific questions, built from the gaps in this founder's own plan, most useful first.
export function adviceQuestions({ startup = {}, direction, lists = {}, steps = [], today, limit = 6 }) {
  const dir = DIRECTION[direction];
  const qs = [];
  if (dir) qs.push({ q: `I'm leaning toward "${dir.title.toLowerCase()}". What would make you pick a different route for a company like mine?`, why: "Tests the choice you made before you commit time to it." });
  const programs = [...(lists.program || []), ...(lists.grant || [])];
  const soon = programs.filter((p) => live(p) && p.deadline && daysBetween(today, p.deadline) >= 0 && daysBetween(today, p.deadline) <= 45).sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
  if (soon) qs.push({ q: `${soon.title} closes ${dateWord(soon.deadline)}. Should I apply now, or wait until I'm stronger?`, why: `It is a ${soon.verdict === "now" ? "good match" : "near match"} with a deadline.` });
  const close = programs.find((p) => p.verdict === "close" && p.gap);
  if (close) qs.push({ q: `For ${close.title}, I need to sort out one thing first. ${clip(close.gap, 140)} Is that worth doing?`, why: "It is almost a match." });
  const later = programs.find((p) => p.verdict === "later" && p.gap);
  if (later) qs.push({ q: `${later.title} is a step ahead of where I am. ${clip(later.gap, 140)} Is that a good goal for the next year?`, why: "Shows what the next stage asks of you." });
  const needs = startup.needs || [];
  const sector = (startup.sectors || [])[0] || "";
  if (needs.includes("funding")) qs.push({ q: `${programs.filter((p) => p.verdict === "now").length ? "Several grants fit me today. " : ""}Should I go for grants first, or start talking to investors?`, why: "You asked for funding." });
  if (needs.includes("customers")) qs.push({ q: `Who do you know that could open doors to first customers${sector ? " in " + sector : ""}?`, why: "You asked for first customers." });
  if (needs.includes("mentorship")) qs.push({ q: `Can you introduce me to someone who has scaled something like ${startup.name || "this"}?`, why: "You asked for a mentor." });
  const gaps = [["problem", "the problem"], ["solution", "the solution"], ["traction", "my traction"], ["market", "the size of the market"], ["ask", "what I am asking for"]].filter(([k]) => !hasText((startup.pitch || {})[k]));
  if (gaps.length) qs.push({ q: `I haven't written down ${joinList(gaps.slice(0, 2).map((g) => g[1]))} yet. What should I be able to say about ${gaps.length > 1 ? "them" : "it"}?`, why: "Gaps in your story are what a funder notices first." });
  if (hasText(startup.goal)) qs.push({ q: `My goal is "${clip(startup.goal, 90)}". What is the biggest risk to that in the next six months?`, why: "It tells you what to protect." });
  const stuck = steps.filter((s) => s.status === "doing").slice(0, 1)[0];
  if (stuck) qs.push({ q: `I'm working on "${stuck.title.toLowerCase()}". What would you do next?`, why: "Something already in progress." });
  return qs.slice(0, limit);
}

export function advisorBrief({ startup = {}, direction, lists = {}, plan = {}, steps = [], today, hub = "" }) {
  const dir = DIRECTION[direction];
  const st = startup;
  const inc = { story: true, direction: true, plan: true, lined: true, questions: true, ...(plan.include || {}) };
  const sections = [];
  const pitch = st.pitch || {};
  const need = joinList((st.needs || []).map((n) => NEED_LABEL[n] || n));
  const story = [];
  story.push(["Snapshot", [st.name, STAGE_LABEL[st.stage], st.employees ? `${st.employees} ${st.employees === 1 ? "person" : "people"}` : "", st.province].filter(Boolean).join(" · ")]);
  if (hasText(st.one_liner)) story.push(["What we are building", st.one_liner]);
  for (const [k, label] of [["problem", "The problem"], ["solution", "Our answer"], ["traction", "Traction so far"], ["market", "Market"], ["ask", "The ask"]]) if (hasText(pitch[k])) story.push([label, pitch[k]]);
  if (hasText(st.goal)) story.push(["Goal for the next six months", st.goal]);
  if (need) story.push(["Looking for", need]);
  if ((st.documents || []).length) story.push(["Documents", st.documents.map((d) => d.title || d.url).join(" · ")]);
  sections.push({ key: "story", title: "Your story", rows: story, on: inc.story });
  if (dir) {
    const top = directions({ startup: st, lists, hub }).find((d) => d.key === dir.key);
    sections.push({ key: "direction", title: "Direction you are leaning toward", rows: [[dir.title, dir.promise], ["Why it fits", (top ? top.reasons : []).join(" ")], ["What it costs", dir.cost]], on: inc.direction });
  }
  const p = planProgress(steps);
  const names = (s) => steps.filter((x) => x.status === s).map((x) => x.title);
  const planRows = [["Progress", p.total ? `${p.done} of ${p.total} steps done${p.doing ? `, ${p.doing} in progress` : ""}` : "No plan yet."]];
  if (names("done").length) planRows.push(["Done", names("done").join("; ")]);
  if (names("doing").length) planRows.push(["In progress", names("doing").join("; ")]);
  const nextUp = steps.filter((x) => x.status === "todo" && x.kind !== "advisor").slice(0, 3).map((x) => x.title);
  if (nextUp.length) planRows.push(["Up next", nextUp.join("; ")]);
  sections.push({ key: "plan", title: "Where your plan stands", rows: planRows, on: inc.plan });
  const lined = [...(lists.program || []), ...(lists.grant || [])].filter((x) => x.verdict === "now").slice(0, 3).map((x) => `${x.title}${x.deadline ? ` (closes ${dateWord(x.deadline)})` : ""}`);
  const evs = (lists.event || []).filter((e) => e.rsvp).slice(0, 2).map((e) => e.title);
  const lrows = [];
  if (lined.length) lrows.push(["Programs and grants that fit today", lined.join("; ")]);
  if (evs.length) lrows.push(["Events I'm going to", evs.join("; ")]);
  if (!lrows.length) lrows.push(["Nothing lined up yet", "Nothing matched strongly yet."]);
  sections.push({ key: "lined", title: "Support lined up", rows: lrows, on: inc.lined });
  const qs = adviceQuestions({ startup: st, direction, lists, steps, today });
  sections.push({ key: "questions", title: "Questions for your advisor", questions: qs, on: inc.questions });
  const title = `${st.name || "My startup"}: advisor brief`;
  const text = [title, `Prepared ${dateWord(today)}`, "", ...sections.filter((s) => s.on).flatMap((s) => [
    s.title.toUpperCase(), ...(s.rows ? s.rows.map(([a, b]) => `${a}: ${b}`) : (s.questions || []).map((q, i) => `${i + 1}. ${q.q}`)), ""])].join("\n").trim();
  return { title, sections, text, questions: qs };
}

// ---- saving -----------------------------------------------------------------------------------------------------------------------------
// One small, clamped update per call, the way the real endpoints take them. Returns the new plan.
const cleanId = (s) => String(s || "").slice(0, 80);
export function updatePlan(planIn, body = {}, newId = () => Math.random().toString(36).slice(2, 10)) {
  const plan = { direction: "", status: {}, custom: [], hidden: [], include: {}, shared: null, brief_ready: false, ...(planIn || {}) };
  plan.status = { ...plan.status }; plan.custom = [...plan.custom]; plan.hidden = [...plan.hidden]; plan.include = { ...plan.include };
  if ("direction" in body) plan.direction = DIRECTION[body.direction] ? body.direction : "";
  if (body.status && typeof body.status === "object") { const { id, status } = body.status; if (id && STATUS_LABEL[status]) plan.status[cleanId(id)] = status; }
  if (body.add) {
    const title = String(body.add.title || "").replace(/\s+/g, " ").trim().slice(0, 140);
    if (!title) throw new Error("Write the step first");
    if (plan.custom.length >= MAX_CUSTOM) throw new Error(`You can add up to ${MAX_CUSTOM} steps of your own`);
    plan.custom.push({ id: "c:" + newId(), title, horizon: HORIZONS.some(([k]) => k === body.add.horizon) ? body.add.horizon : "month" });
  }
  if (body.remove) { const id = cleanId(body.remove); if (id.startsWith("c:")) plan.custom = plan.custom.filter((c) => c.id !== id); else if (id !== "final" && !plan.hidden.includes(id)) plan.hidden.push(id); }
  if (body.restore) plan.hidden = [];
  if (body.include && typeof body.include === "object") for (const [k] of BRIEF_SECTIONS) if (k in body.include) plan.include[k] = !!body.include[k];
  if ("brief_ready" in body) plan.brief_ready = !!body.brief_ready;
  if ("share" in body) {
    const s = body.share;
    plan.shared = s && s.name ? { id: cleanId(s.id), name: String(s.name).slice(0, 80), title: String(s.title || "").slice(0, 120), at: String(s.at || "").slice(0, 10) } : null;
    if (plan.shared) plan.brief_ready = true;
  }
  return plan;
}
