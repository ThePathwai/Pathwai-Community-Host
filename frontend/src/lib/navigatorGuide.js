// The Navigator guide (chat) and the Hub's "next steps" feed, for the in-browser demo. A line-for-line twin of
// backend/navigator_guide.py (the real site); backend/tests/test_navigator_guide_parity.py runs both on the same questions
// and fails if a word differs. Rules only: every sentence comes from the catalog entry and the matching rules.
import { NEEDS, NEED_LABEL, STAGE_LABEL, brief, daysUntil, effectiveStatus, evaluate, joinList, normalizeProfile, rankCommunities, suggest, why } from "./navigator";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ALIASES = {
  irap: ["irap", "nrc irap"], sred: ["sr&ed", "sred", "sr and ed"], oitc: ["oitc", "innovation tax credit"],
  "canexport-smes": ["canexport"], csbfp: ["csbfp", "small business financing"], "futurpreneur-core": ["futurpreneur"],
  "futurpreneur-newcomer": ["futurpreneur newcomer", "futurpreneur for newcomers"], belf: ["belf", "black entrepreneurship loan"],
  "dmz-bip": ["dmz"], "indigenous-growth-fund": ["indigenous growth fund", "indigenous growth"], wef: ["wef", "women entrepreneurship fund"],
  "communitech-fierce-founders": ["fierce founders", "communitech"], "venturelab-hci": ["venturelab", "hardware catalyst"],
  velocity: ["velocity"], "ovin-rd": ["ovin"], "mitacs-accelerate": ["mitacs"], "summer-company": ["summer company"],
  "starter-company-plus": ["starter company"], "bmo-launch-me": ["bmo launch me", "launch me"], "bdc-capital": ["bdc"],
  "startup-visa": ["start-up visa", "startup visa"],
};
const TYPE_WORDS = [["tax credit", "tax_credit"], ["grant", "grant"], ["loan", "loan"], ["accelerator", "accelerator"], ["incubator", "incubator"],
  ["competition", "competition"], ["pitch", "competition"], ["investor", "investor"], ["venture capital", "investor"], ["visa", "immigration"], ["immigration", "immigration"]];
const TYPE_NOUN = { grant: "grants", loan: "loans", tax_credit: "tax credits", accelerator: "accelerators", incubator: "incubators", competition: "competitions", investor: "investors", immigration: "immigration routes" };
const W = {
  profile: ["my profile", "about me", "know about me", "where am i", "my startup", "what do you know"],
  communities: ["communit", "join", "network", "cohort"],
  deadline: ["deadline", "closing", "closes", "close soon", "due", "when does", "last day", "running out"],
  next: ["next", "first", "start", "what should i", "where do i", "path", "plan", "recommend", "suggest", "best", "advice", "help me"],
  eligible: ["eligible", "eligib", "qualify", "can i apply", "can we apply", "am i able", "do i meet", "requirements", "require"],
  amount: ["how much", "amount", "worth", "money", "funding amount", "size of"],
  compare: ["compare", " vs ", "versus", "difference between", "which is better"],
  hello: ["hi", "hello", "hey", "help", "what can you do", "who are you"],
};
const KEYWORD_WORDS = {
  funding: ["funding", "money", "capital", "cash", "finance"], mentorship: ["mentor", "coach", "advice"], space: ["workspace", "office", "co-working", "coworking"],
  customers: ["customer", "clients", "pilot", "sales"], export: ["export", "international", "abroad"], rd: ["r&d", "research", "prototype"],
  ip: ["patent", "trademark", "intellectual"], talent: ["hire", "hiring", "talent", "intern", "staff"], network: ["network", "introduc", "connect"],
  tax: ["tax"], training: ["training", "course", "learn", "workshop"], visa: ["immigra", "visa", "permanent resident", "work permit"],
};
const FIT_LINE = { strong: "It looks like a strong fit for you.", possible: "It could work for you.", later: "Not yet, but it could be a fit later." };
const MISSING_LABELS = [["needs", "what you need next"], ["sectors", "what you build"], ["incorporated", "whether you are incorporated"], ["goal", "your next goal"], ["city", "your city"], ["age", "your age or birthday"]];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ws = (t) => String(t == null ? "" : t).split(/\s+/).filter(Boolean).join(" ");
const sent = (text) => { const t = ws(text); return !t || ".!?".includes(t[t.length - 1]) ? t : t + "."; };
const fmtDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${+m[1]}` : String(iso || ""); };
const has = (q, words) => words.some((w) => (w.length <= 4 && !w.startsWith(" ") ? new RegExp("(?<![a-z0-9])" + esc(w) + "(?![a-z0-9])").test(q) : q.includes(w)));
const plural = (n) => (n === 1 ? "" : "s");

const aliasesOf = (p) => {
  const name = String(p.name || "").toLowerCase();
  const out = [name, name.replace(/\s*\(.*?\)\s*/g, " ").trim(), ...(ALIASES[p.id] || [])];
  return [...new Set(out)].filter((a) => a.length >= 3);
};
function findPrograms(q, programs) {
  const hits = [];
  for (const p of programs) {
    let best = 0;
    for (const a of aliasesOf(p)) if (new RegExp("(?<![a-z0-9])" + esc(a) + "(?![a-z0-9])").test(q)) best = Math.max(best, a.length);
    if (best) hits.push([best, p]);
  }
  hits.sort((a, b) => (b[0] - a[0]) || (String(a[1].name) < String(b[1].name) ? -1 : String(a[1].name) > String(b[1].name) ? 1 : 0));
  return hits.slice(0, 2).map((h) => h[1]);
}

function deadlineRaw(p, today) {
  const st = effectiveStatus(p, today);
  const dl = p.deadline || {};
  const kind = dl.kind;
  if (st === "paused") return "It is paused right now. " + (dl.note || "");
  if (kind === "fixed") {
    const d = daysUntil(dl.date, today);
    if (d === null) return "Check the program page for the deadline.";
    if (d < 0) return `The deadline was ${fmtDate(dl.date)}. It has closed.`;
    return `It closes ${fmtDate(dl.date)}, in ${d} day${plural(d)}.`;
  }
  if (st === "closed" || kind === "closed") return "It is closed right now. " + (dl.note || "");
  if (kind === "rolling") return "Intake is rolling, so there is no fixed deadline." + (dl.note ? " " + dl.note : "");
  if (kind === "annual") return sent(dl.note || "It runs once a year") + " Check the page for this year's date.";
  return "No deadline is published. Check the program page." + (dl.note ? " " + dl.note : "");
}
export const deadlineText = (p, today) => sent(deadlineRaw(p, today));

const rowOf = (p, ev, today) => ({ ...brief(p), status: effectiveStatus(p, today), fit: ev.fit, score: ev.score, reasons: ev.reasons, cautions: ev.cautions, skip: ev.skip ?? null });

function detail(p, profile, q, today) {
  let ev = evaluate(p, profile, today);
  const row = rowOf(p, ev, today);
  const fit = FIT_LINE[ev.fit] || ("Probably not for you. " + sent(ev.skip || "A hard requirement does not match"));
  const asksDeadline = has(q, W.deadline); const asksAmount = has(q, W.amount); const asksElig = has(q, W.eligible);
  let parts = [];
  ev = { ...ev, reasons: ev.reasons.filter((r) => !r.toLowerCase().includes("deadline") && !r.startsWith("Closes in")), cautions: ev.cautions.filter((c) => !c.toLowerCase().includes("deadline") && !c.startsWith("Paused")) };
  if (asksDeadline) parts = [`${p.name}: ` + deadlineText(p, today), fit];
  else if (asksAmount) parts = [`${p.name}: ` + sent(p.amount || "The amount is not published. Check the program page"), fit];
  else if (asksElig) {
    parts = [`${p.name}: ${fit}`, ...ev.reasons.slice(0, 2), ...ev.cautions.slice(0, 2)];
    const reqs = (p.requirements || []).slice(0, 3);
    if (reqs.length) parts.push("What they ask for: " + reqs.map((r) => r.replace(/\.+$/, "")).join("; ") + ".");
  } else {
    parts = [`${p.name} (${p.org}): ${p.summary}`, fit, ...ev.reasons.slice(0, 1), ...ev.cautions.slice(0, 1), deadlineText(p, today)];
  }
  if (p.verified !== "official") parts.push("I could only confirm this through a secondary source, so check the official page before you rely on it.");
  return { reply: parts.filter(Boolean).map(sent).join(" "), cards: [row], focus: p.id, intent: "program", suggestions: ["When does it close?", "Am I eligible?", "What should I do next?"] };
}

const filterRank = (ranked, key, value) => {
  const out = ranked.filter((m) => (key === "need" ? (m.needs || []).includes(value) : m.type === value));
  const live = out.filter((m) => m.status !== "closed" && m.status !== "paused");
  return live.length ? live : out;
};

function profileText(profile, startup, missing) {
  const bits = [`you are at the ${STAGE_LABEL[profile.stage]} stage`];
  if (profile.needs.length) bits.push("looking for " + joinList(profile.needs.slice(0, 4).map((n) => NEED_LABEL[n])));
  if (profile.sectors.length) bits.push("building in " + joinList(profile.sectors.slice(0, 3)));
  if (profile.incorporated === true) bits.push("incorporated"); else if (profile.incorporated === false) bits.push("not incorporated yet");
  let s = "Here is what I have: " + bits.join(", ") + ".";
  if (startup.name) s = `For ${startup.name}: ` + s[0].toLowerCase() + s.slice(1);
  if (missing.length) s += " Add " + joinList(missing.slice(0, 3)) + " to your profile and I can be more specific.";
  return s;
}

export function completeness(startup, account) {
  const acc = account || {};
  const have = { needs: !!(startup.needs || []).length, sectors: !!(startup.sectors || []).length, incorporated: startup.incorporated !== undefined && startup.incorporated !== null,
    goal: !!startup.goal, city: !!String(acc.location || "").trim(), age: !!acc.age };
  const missing = MISSING_LABELS.filter(([k]) => !have[k]).map(([key, label]) => ({ key, label }));
  const total = MISSING_LABELS.length + 2;
  const done = MISSING_LABELS.length - missing.length + (startup.stage ? 1 : 0) + (startup.name || startup.one_liner ? 1 : 0);
  return { percent: Math.floor((100 * done) / total + 0.5), missing };
}

export function navigatorProfile(account) {
  const st = (account && account.startup) || {};
  if (!Object.keys(st).length) return {};
  const loc = String((account && account.location) || "").split(",")[0].trim();
  return { ...st, age: (account && account.age) ?? null, city: loc };
}

export function answer(question, programs, communities, rawProfile, today, focus = null, startup = {}, account = null) {
  const q = " " + ws(String(question || "").toLowerCase()) + " ";
  const profile = normalizeProfile(rawProfile);
  const res = suggest(programs, rawProfile, today, 60);
  const ranked = res.matches;
  const missing = completeness(startup || {}, account).missing.map((m) => m.label);
  const base = { cards: [], focus, suggestions: ["What should I do next?", "What is closing soon?", "Which communities fit me?"] };

  let named = findPrograms(q, programs);
  const short = q.trim().split(/\s+/).length <= 4 && !has(q, ["soon", "any", "all", "which", "my"]);
  if (!named.length && focus && !has(q, [...W.next, ...W.communities, ...W.profile])
      && (/(?<![a-z0-9])(it|this|that|them)(?![a-z0-9])/.test(q) || (short && has(q, [...W.deadline, ...W.eligible, ...W.amount])))) {
    named = programs.filter((p) => p.id === focus).slice(0, 1);
  }

  if (named.length === 2 && has(q, [...W.compare, " or ", " and "])) {
    const [a, b] = named;
    const ra = rowOf(a, evaluate(a, profile, today), today); const rb = rowOf(b, evaluate(b, profile, today), today);
    const lines = [[a, ra], [b, rb]].map(([p, r]) => `${p.name}: ${FIT_LINE[r.fit] || "Probably not for you."} ` + deadlineText(p, today) + (p.amount && p.amount.length < 90 ? " " + sent(p.amount) : ""));
    return { ...base, reply: lines.join(" "), cards: [ra, rb], intent: "compare", focus: a.id };
  }
  if (named.length) return { ...base, ...detail(named[0], profile, q, today) };

  if (has(q, W.profile)) return { ...base, reply: profileText(profile, startup || {}, missing), intent: "profile", suggestions: ["What should I do next?", "Which communities fit me?", "What is closing soon?"] };

  if (has(q, W.communities)) {
    const coms = rankCommunities(communities, rawProfile, 3);
    if (!coms.length) return { ...base, reply: "No community is a clear fit yet. Communities show up here once they switch on the Navigator and say who they serve.", intent: "communities" };
    return { ...base, reply: "Closest fits: " + coms.map((c) => `${c.name}: ${sent((c.reasons || [])[0] || "a possible fit")}`).join(" "), communities: coms, intent: "communities" };
  }

  if (has(q, W.deadline)) {
    const soon = [];
    for (const m of ranked) {
      const dl = m.deadline || {};
      const d = dl.kind === "fixed" ? daysUntil(dl.date, today) : null;
      if (d !== null && d >= 0 && m.status !== "closed" && m.status !== "paused") soon.push([d, m]);
    }
    soon.sort((a, b) => (a[0] - b[0]) || (a[1].name < b[1].name ? -1 : a[1].name > b[1].name ? 1 : 0));
    if (!soon.length) {
      const live = ranked.filter((m) => m.status === "rolling").slice(0, 3);
      let t = "Nothing that fits you has a fixed deadline coming up.";
      if (live.length) t += " These take applications on a rolling basis: " + joinList(live.map((m) => m.name)) + ".";
      return { ...base, reply: t, cards: live, intent: "deadlines" };
    }
    const top = soon.slice(0, 3);
    return { ...base, reply: "Closing soonest for you: " + top.map(([d, m]) => `${m.name} closes ${fmtDate(m.deadline.date)}, in ${d} day${plural(d)}.`).join(" "), cards: top.map((t) => t[1]), intent: "deadlines", focus: top[0][1].id };
  }

  const needKeys = NEEDS.filter((k) => (KEYWORD_WORDS[k] || []).some((w) => q.includes(w)));
  const typeHit = TYPE_WORDS.find(([w]) => q.includes(w));
  const typeKey = typeHit ? typeHit[1] : null;
  if (needKeys.length || typeKey) {
    const [pool, label] = typeKey ? [filterRank(ranked, "type", typeKey), TYPE_NOUN[typeKey]] : [filterRank(ranked, "need", needKeys[0]), NEED_LABEL[needKeys[0]]];
    const top = pool.slice(0, 3);
    if (!top.length) return { ...base, reply: `I do not have ${label} that fit you right now. Try the All programs tab, or tell me more about your startup.`, intent: "filter" };
    return { ...base, reply: `For ${label}, the best fits for you: ` + top.map((m) => `${m.name}: ` + (typeKey === null ? `gives you ${label}.` : sent(why(m)))).join(" "), cards: top, intent: "filter", focus: top[0].id };
  }

  if (has(q, W.next) || !has(q, W.hello)) {
    let text = res.summary;
    if (res.path.length) text += " Your path. " + res.path.map((s) => `${s.label}: ${s.name}.`).join(" ");
    if (!has(q, W.next)) text = "I am not sure I understood that, but here is where you stand. " + text;
    const cards = ranked.slice(0, 3);
    return { ...base, reply: text, cards, intent: "next", focus: cards.length ? cards[0].id : focus };
  }
  return { ...base, reply: "I can tell you which programs fit you, when they close, whether you qualify, and which communities to join. Ask about one by name, or tap a question below.", intent: "hello" };
}

export function homeFeed(programs, communities, account, today) {
  const startup = (account && account.startup) || {};
  const comp = completeness(startup, account);
  if (!account || !startup.stage) return { signed_in: !!account, has_profile: false, completeness: comp };
  const raw = navigatorProfile(account);
  const res = suggest(programs, raw, today, 60);
  const ranked = res.matches;
  const soon = [];
  for (const m of ranked) {
    const dl = m.deadline || {};
    const d = dl.kind === "fixed" ? daysUntil(dl.date, today) : null;
    if (d !== null && d >= 0 && d <= 45 && m.status !== "closed" && m.status !== "paused") soon.push({ ...m, days_left: d });
  }
  soon.sort((a, b) => (a.days_left - b.days_left) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const liveIds = ranked.filter((m) => m.status !== "closed" && m.status !== "paused").map((m) => m.id);
  const seen = account.nav_seen;
  const newIds = Array.isArray(seen) ? liveIds.filter((i) => !seen.includes(i)) : [];
  return {
    signed_in: true, has_profile: true,
    startup: { name: startup.name || "", one_liner: startup.one_liner || "", stage: res.profile.stage, stage_label: STAGE_LABEL[res.profile.stage] },
    summary: res.summary, top: ranked.slice(0, 3), path: res.path, closing_soon: soon.slice(0, 3), communities: rankCommunities(communities, raw, 3),
    new_ids: newIds.slice(0, 20), new_count: newIds.length, live_ids: liveIds.slice(0, 100), completeness: comp, as_of: today,
  };
}
