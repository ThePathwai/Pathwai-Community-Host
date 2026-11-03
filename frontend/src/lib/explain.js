// "Why is this a match, or why not, and what would make it one?" for everything a founder can act on in an ecosystem: programs and grants,
// events, people and resources. Every item gets the same four-way verdict and the same shape, so a page can show it the same way each time:
//   verdict: now (good match right now) | close (almost: one thing to sort out) | later (not yet) | no (not for you right now)
//   checks:  [{ key, label, state: yes|maybe|later|no, text }]  the short list of things we looked at, in plain words
//   why:     one sentence on what makes it good (or what is wrong)
//   gap:     what it would take to line up, or "" when nothing is needed
// Pure rules, no network, so the same answers can come from the server later. Programs reuse the Navigator's own checks (lib/navigator.js).
import { NEED_LABEL, STAGE_LABEL, needsFromText } from "./navigator";

export const VERDICTS = ["now", "close", "later", "no"];
export const VERDICT = {
  now: { label: "Good match now", short: "Good now", group: "Good matches right now", blurb: "Fits what you asked for, and you can act on it today." },
  close: { label: "Almost there", short: "Almost", group: "Almost there", blurb: "A good fit with one thing to sort out first." },
  later: { label: "Not yet", short: "Not yet", group: "Not yet", blurb: "Worth keeping in view. Here is what has to change first." },
  no: { label: "Not for you right now", short: "Not now", group: "Not for you right now", blurb: "Doesn't line up with your startup today. Here is why." },
};
export const VRANK = { now: 0, close: 1, later: 2, no: 3 };

// What each thing a founder can ask for looks like in tags and event categories.
export const NEED_TAGS = {
  funding: ["funding", "grants", "grant", "sred", "irap", "safe", "cap-table", "term-sheets", "pre-seed", "investors", "angels", "pitch", "pitch-day", "finals", "judges"],
  customers: ["customers", "pilots", "customer-discovery", "industry", "corporate", "sprint", "research"],
  mentorship: ["mentor", "office-hours", "feedback", "practice", "pitch", "advice"],
  network: ["mixer", "community", "industry", "founders", "demo-night"],
  training: ["workshop", "legal", "template", "guide", "term-sheets", "equity"],
  rd: ["rd", "sred", "irap", "research", "grants"],
  ip: ["ip", "legal", "patent"],
  talent: ["hiring", "talent"],
};
const low = (xs) => (xs || []).map((x) => String(x).toLowerCase());
export const needsOf = (tags) => Object.keys(NEED_TAGS).filter((n) => NEED_TAGS[n].some((t) => low(tags).includes(t)));
export const overlap = (tags, needs) => needs.filter((n) => (NEED_TAGS[n] || []).some((t) => low(tags).includes(t)));
export const labels = (needs, n = 3) => joinList(needs.slice(0, n).map((k) => NEED_LABEL[k] || k));
export function joinList(xs) { const a = xs.filter(Boolean); return a.length <= 1 ? a.join("") : a.length === 2 ? `${a[0]} and ${a[1]}` : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`; }
const decap = (s) => String(s || "").replace(/\.$/, "").replace(/^[A-Z](?![A-Z])/, (c) => c.toLowerCase());
const cap = (s) => String(s || "").replace(/^./, (c) => c.toUpperCase());
export const daysBetween = (from, iso) => Math.round((new Date(String(iso).slice(0, 10) + "T12:00:00Z") - new Date(from + "T12:00:00Z")) / 86400000);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const plainDates = (t) => String(t || "").replace(/\((\d{4})-(\d{2})-(\d{2})\)/g, (_, y, m, d) => `(${MONTHS[+m - 1]} ${+d})`).replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, y, m, d) => `${MONTHS[+m - 1]} ${+d}`);
const chk = (key, label, state, text) => ({ key, label, state, text: plainDates(text) });
const worstOf = (checks) => (checks.some((c) => c.state === "no") ? "no" : checks.some((c) => c.state === "later") ? "later" : checks.some((c) => c.state === "maybe") ? "maybe" : "yes");

// ---------- programs and grants ----------
const PCHECK = { apply: "Eligibility", stage: "Stage", need: "Needs", timing: "Timing" };
const ASK = { age: "age", employees: "team size", sectors: "sector", incorporated: "whether you are incorporated", needs: "what you need" };
const FIT_VERDICT = { strong: "now", possible: "close", later: "later", skip: "no" };

export function explainProgram(p) {
  const verdict = FIT_VERDICT[p.fit] || "close";
  const checks = (p.checks || []).map((c) => chk(c.key, PCHECK[c.key] || c.key, c.state, c.text));
  const by = (k) => (p.checks || []).find((c) => c.key === k) || {};
  const apply = by("apply"), stage = by("stage"), need = by("need"), timing = by("timing");
  const fixes = [];
  // what has to happen, in the order a founder would do it
  if (apply.state === "maybe" && apply.ask) fixes.push(`Add your ${ASK[apply.ask] || apply.ask} to your startup profile and we will check this for you.`);
  const laters = [];
  for (const f of apply.items || []) {
    if (f.state !== "later") continue;
    const m = /at least (\d+)/.exec(f.text);
    laters.push(/incorporated/i.test(f.text) ? "become incorporated" : m ? `grow to ${m[1]} full-time employees` : decap(f.text));
  }
  if (stage.state === "later") {
    const earliest = (p.stages || []).map((s) => ["idea", "prototype", "launched", "revenue", "growth"].indexOf(s)).filter((i) => i >= 0).sort()[0];
    laters.push(earliest != null ? `get to the ${STAGE_LABEL[["idea", "prototype", "launched", "revenue", "growth"][earliest]]} stage` : "get to a later stage");
  }
  if (laters.length) fixes.push(`Check back once you ${joinList(laters)}.`);
  if (stage.state === "no") fixes.push("Nothing to change: you have moved past this. It is built for earlier-stage founders.");
  if (apply.state === "no") fixes.push("Nothing to change: it has a requirement you don't meet.");
  if (need.state === "no") {
    const gives = (p.needs || []).map((n) => NEED_LABEL[n]).filter(Boolean);
    fixes.push(gives.length ? `It gives ${joinList(gives.slice(0, 3))}. If that matters now, add it to what you need in your profile.` : "It doesn't give what you asked for.");
  }
  if (timing.state === "no") fixes.push("Check back when it reopens.");
  if (timing.state === "maybe") fixes.push("No deadline was published, so check their page before you plan around it.");
  if (apply.caveat && apply.unchecked && apply.unchecked.length) fixes.push(`Before you apply, confirm: ${String(apply.unchecked[0]).replace(/\.$/, "")}.`);
  // The one sentence on the card: why it fits when it does, what is in the way when it doesn't.
  const blockers = [apply, stage, need, timing].filter((c) => c.state === "no" || c.state === "later");
  const why = verdict === "now" || verdict === "close" ? (need.state === "yes" ? need.text : (p.reasons || [])[0] || "") + (verdict === "close" && apply.state === "maybe" ? ` ${apply.text}` : "")
    : blockers.map((c) => c.text).filter(Boolean).join(" ");
  return { verdict, checks, why: plainDates(why || ""), gap: plainDates(fixes[0] || ""), gaps: fixes.map(plainDates) };
}

// ---------- events ----------
export function explainEvent(e, { needs = [], today }) {
  const topic = needsOf([...(e.tags || []), String(e.category || "").toLowerCase()]);
  const hit = overlap([...(e.tags || []), String(e.category || "").toLowerCase()], needs);
  const d = daysBetween(today, e.starts_at);
  const going = e.my_rsvp === "yes";
  const cap = e.capacity || null;
  const left = cap ? cap - (e.attendee_count || 0) : null;
  const checks = [];
  if (hit.length) checks.push(chk("topic", "Topic", "yes", `Covers ${labels(hit)}, which you asked for.`));
  else if (topic.length && needs.length) checks.push(chk("topic", "Topic", "no", `It is about ${labels(topic, 2)}, not what you asked for (${labels(needs, 2)}).`));
  else checks.push(chk("topic", "Topic", "maybe", "Open to every founder. It has no single topic to check against."));
  checks.push(chk("timing", "Timing", d > 30 ? "maybe" : "yes", d <= 0 ? "Today." : d === 1 ? "Tomorrow." : d > 30 ? `A month or more away (${d} days).` : `In ${d} days.`));
  if (going) checks.push(chk("spots", "Spot", "yes", "You are going."));
  else if (left != null && left <= 0) checks.push(chk("spots", "Spot", "no", `Full: ${e.attendee_count} of ${cap} places taken.`));
  else if (left != null && left <= Math.max(3, cap * 0.1)) checks.push(chk("spots", "Spot", "maybe", `Only ${left} place${left === 1 ? "" : "s"} left.`));
  else checks.push(chk("spots", "Spot", "yes", left != null ? `${left} places left.` : "Open to everyone."));
  const topicState = checks[0].state, spots = checks[2];
  let verdict = "now", gap = "";
  if (spots.state === "no") { verdict = "later"; gap = "Full right now. Places sometimes free up, so check back, or pick another session."; }
  else if (topicState === "no") { verdict = "no"; gap = `Worth going only if ${labels(topic, 2)} matters to you now. Add it to what you need in your profile and it will rank higher.`; }
  else if (spots.state === "maybe") { verdict = "close"; gap = "Places are nearly gone. RSVP today to keep yours."; }
  else if (topicState === "maybe") { verdict = "close"; gap = "Read the description to see whether it is for you."; }
  const why = going ? `You're going. ${checks[0].state === "yes" ? checks[0].text : ""}`.trim() : verdict === "no" ? checks[0].text : `${checks[0].text} ${checks[1].text}`;
  return { verdict, checks, why, gap, gaps: gap ? [gap] : [] };
}

// ---------- people ----------
export function explainPerson(m, { needs = [] }) {
  const offers = m.offers || [], wants = m.wants || [];
  const offerNeeds = needsFromText(offers.join(" "));
  const hit = needs.filter((n) => offerNeeds.includes(n));
  const swap = (m.reasonScore || 0) > 0 && wants.length;
  const checks = [];
  if (hit.length) checks.push(chk("helps", "Helps you", "yes", `Can help with ${labels(hit)}: ${offers.slice(0, 2).join(", ")}.`));
  else if (offers.length) checks.push(chk("helps", "Helps you", "no", `Their focus is ${offers.slice(0, 2).join(" and ")}, not ${needs.length ? labels(needs, 2) : "what you asked for"}.`));
  else checks.push(chk("helps", "Helps you", "maybe", "We don't know yet what they offer."));
  if (swap) checks.push(chk("swap", "You help them", "yes", `You can help with ${wants.slice(0, 2).join(" and ")}.`));
  let verdict, gap = "";
  if (hit.length) { verdict = "now"; gap = `Say hi and ask about ${offers[0] || "what they offer"}.`; }
  else if (swap) { verdict = "close"; gap = `Lead with how you can help (${wants[0]}). It opens the door to their time.`; }
  else { verdict = "no"; gap = offers.length ? `Their help is in ${offers.slice(0, 2).join(" and ")}. If you need that soon, add it to your profile and they will rank higher.` : ""; }
  const why = checks[0].text + (swap ? ` ${checks[1].text}` : "");
  return { verdict, checks, why, gap, gaps: gap ? [gap] : [] };
}

// ---------- resources ----------
export function explainResource(r, { needs = [] }) {
  const topic = needsOf(r.tags || []);
  const hit = overlap(r.tags || [], needs);
  const checks = [];
  if (hit.length) checks.push(chk("topic", "Topic", "yes", `Helps with ${labels(hit)}, which you asked for.`));
  else if (topic.length && needs.length) checks.push(chk("topic", "Topic", "no", `It is about ${labels(topic, 2)}, not what you asked for (${labels(needs, 2)}).`));
  else checks.push(chk("topic", "Topic", "maybe", "General help for founders here."));
  if (r.value) checks.push(chk("cost", "Cost", "yes", cap(r.value) + "."));
  let verdict, gap = "";
  if (hit.length) { verdict = "now"; gap = ""; }
  else if (r.featured) { verdict = "close"; gap = "It is popular with founders here, though it isn't aimed at what you asked for."; }
  else { verdict = "no"; gap = topic.length ? `Useful if ${labels(topic, 2)} becomes a priority. Add it to your profile and it will rank higher.` : "It isn't tied to anything you asked for yet. Add a need it could cover and it will rank higher."; }
  return { verdict, checks, why: checks[0].text, gap, gaps: gap ? [gap] : [] };
}

export const countBy = (items) => { const c = { now: 0, close: 0, later: 0, no: 0 }; for (const m of items) c[m.verdict] += 1; return c; };
export { worstOf };
