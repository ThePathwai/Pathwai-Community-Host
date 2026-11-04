// "Ask": a founder says what they are trying to make happen, in their own words, and gets the one person, resource, program or event around
// them that can help most, with why. Pure rules (no network, no model), run over the same judged lists the other pages use (lib/moves.js),
// so every answer also carries the honest verdict for this founder: a good match now, almost, not yet, or not for you right now.
//   ask(text, { lists, startup, plan, state }) -> { reply, results: [{ item, helps, because, rank }], chips, topic, link, state }
//   state: { last, seen } carried between turns so "someone else" and "an event instead" work.
import { NEED_LABEL, needsFromText } from "./navigator";
import { VRANK, joinList } from "./explain";
import { itemNeeds } from "./planner";

const STOP = new Set(("a an the i me my we our you your to for of and or in on at with is are be it this that can could should would do does how what who where when why need want find get " +
  "help someone anyone something looking like please about from have has some any more really just so ask tell show give make happen able want wanna im ive first which new best good own there anything").split(" "));
// What a founder says, and the words the hub's own tags and descriptions use for it.
const SYN = {
  money: ["funding", "grant"], fund: ["funding", "grant"], funding: ["funding", "grant"], raise: ["funding", "investor", "safe"], capital: ["funding"], investor: ["investors", "angel", "funding", "pitch"], vc: ["investors"],
  pitch: ["pitch", "deck"], deck: ["deck", "pitch", "template"], slides: ["deck", "pitch"], customer: ["customers", "pilots", "intro"], client: ["customers", "pilots"], sell: ["customers", "sales"], sales: ["customers", "sales"],
  pilot: ["pilots", "corporate"], corporate: ["corporate", "pilots", "partner"], intro: ["introductions", "intro", "warm"], introduce: ["introductions", "intro", "warm"], lawyer: ["legal", "lawyer"], legal: ["legal"],
  incorporate: ["legal", "incorporation"], contract: ["legal"], patent: ["ip", "patent"], trademark: ["ip", "legal"], hire: ["hiring", "talent"], hiring: ["hiring", "talent"], recruit: ["hiring", "talent"],
  mentor: ["mentor", "advice", "office"], advice: ["mentor", "advice", "office"], coach: ["mentor", "coaching", "pitch"], feedback: ["feedback", "practice", "review"], practice: ["practice", "pitch", "feedback"],
  network: ["mixer", "network", "community"], meet: ["mixer", "network", "intro"], grant: ["grant", "grants", "funding"], apply: ["apply", "application", "grant"], cloud: ["credits", "cloud"], credits: ["credits", "cloud"],
  tax: ["tax", "sred"], research: ["research", "lab", "students"], prototype: ["prototype", "lab", "research"], space: ["space", "cowork"], export: ["export", "customs"], safe: ["safe", "cap", "term"], cap: ["cap", "safe", "term"],
  valuation: ["term", "safe", "cap"], equity: ["equity", "safe", "cap"], interview: ["customer", "interview", "discovery"], market: ["market", "customers"], expand: ["export", "second", "market"],
};
const HINTS = {
  person: /\b(who|someone|anyone|person|people|mentor|introduce|intro|talk to|speak to|expert|connect me)\b/,
  event: /\b(event|events|meet ?up|workshop|attend|mixer|demo night|session|happening)\b/,
  program: /\b(grant|grants|program|programs|apply|accelerator|competition|incubator|loan)\b/,
  resource: /\b(template|guide|resource|resources|perk|credits|checklist|kit|download|read|how do i|how to)\b/,
};
const KIND_OF = { grant: "program", program: "program", event: "event", person: "person", resource: "resource" };
const MORE = /\b(this|that|it|another|else|different|other|more|next)\b/;
const KIND_WORDS = /^(guide|event|resource|person|people|program|grant|template|mentor|workshop|there|any|which|anything)$/;
const GREET = /^(hi|hey|hello|yo|good (morning|afternoon|evening)|thanks|thank you|ok|okay|cool)\b/;
const PLANTALK = /\b(my plan|advisor|brief|prepare|prep for|next step|what should i do|where do i start)\b/;

const stem = (w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w);
const tokens = (t) => [...new Set(String(t || "").toLowerCase().replace(/[^a-z0-9$\s-]/g, " ").split(/\s+/).map((w) => w.replace(/^-+|-+$/g, "")).filter((w) => w.length > 2 && !STOP.has(w)).map(stem))];
const first = (name) => String(name || "").split(/\s+/)[0];
const sentence = (s) => { const t = String(s || "").replace(/\s+/g, " ").trim(); const m = t.match(/^.*?[.!?](\s|$)/); return (m ? m[0] : t).trim(); };
const KIND_WORD = { person: "person", resource: "resource", program: "program", grant: "grant", event: "event" };

function score(item, toks, expanded, needs, hint) {
  // A person is found by what they do, not by their name ("Grant" the person is not a grant).
  const title = (item.kind === "person" ? item.sub || "" : item.title + " " + (item.sub || "")).toLowerCase();
  const text = item.text || title;
  let sc = 0; const hit = new Set(); const words = [];
  for (const t of toks) {
    const terms = [t, ...(SYN[t] || [])];
    let best = 0;
    for (const term of terms) {
      const direct = term === t;
      if (title.includes(term)) best = Math.max(best, direct ? 4 : 2.5);
      else if (text.includes(term)) best = Math.max(best, direct ? 2 : 1.2);
    }
    if (best) { hit.add(t); sc += best; if (best >= 1.2) words.push(t); }
  }
  sc += hit.size * 1.5;
  const need = needs.filter((n) => itemNeeds(item).includes(n));
  sc += need.length * 1.5;
  if (hint && hint === KIND_OF[item.kind]) sc += hit.size ? 4 : 0.5;
  else if (!hint && (item.kind === "person" || item.kind === "resource")) sc += hit.size ? 0.6 : 0;
  sc += item.verdict === "now" ? 1.2 : item.verdict === "close" ? 0.5 : item.verdict === "later" ? 0 : -0.3;
  return { sc: hit.size || need.length ? sc : 0, hit: [...hit], words, need };
}

// One line on how this item helps with what was asked.
function helpsLine(item, ctx) {
  const k = item.kind;
  if (k === "person") {
    const m = (item.offers || []).filter((o) => ctx.words.some((w) => o.toLowerCase().includes(w)));
    const list = m.length ? m : (item.offers || []).slice(0, 2);
    return list.length ? `Can help with ${joinList(list.slice(0, 3))}.` : item.sub ? `${item.sub}.` : "A good person to ask.";
  }
  if (k === "resource") return sentence(item.desc) || item.why;
  if (k === "event") return item.why;
  return item.why;
}

const actionText = (item, topic) => {
  const t = topic ? ` about ${topic}` : "";
  if (item.kind === "person") return `Ask ${item.title}${t}`;
  if (item.kind === "resource") return `Use "${item.title}"${topic ? " for " + topic : ""}`;
  if (item.kind === "event") return `Go to ${item.title}`;
  return `Look at ${item.title}`;
};
export { actionText };

export const SUGGESTIONS = [
  "I need to find my first customers",
  "Who can give me feedback on my pitch?",
  "Which grant should I apply for?",
  "I need a lawyer to look at my agreements",
  "How do I get intros to corporate pilots?",
];

export function ask(text, { lists = {}, startup = {}, plan = {}, state = {} } = {}) {
  const raw = String(text || "").trim().slice(0, 300);
  const low = raw.toLowerCase();
  const seen = new Set(state.seen || []);
  if (!raw) return null;
  if (PLANTALK.test(low) && !/\b(grant|customer|funding|lawyer)\b/.test(low)) {
    const picked = !!plan.direction;
    return { reply: picked ? "Your plan and advisor brief are the best place for that. They already use what we know about your startup, and the brief lists the questions to bring." : "Start by picking a direction. It turns what you want into a plan, and then a brief with questions for your advisor.",
      results: [], chips: ["Who can read my pitch deck?", "Which grant should I apply for?"], topic: "", link: { to: picked ? "/plan?step=brief" : "/plan?step=directions", label: picked ? "Open my advisor brief" : "Pick a direction" }, state: { last: state.last, seen: [...seen] } };
  }
  if (GREET.test(low) && tokens(low).length < 2) {
    return { reply: "Glad to help. Tell me what you are trying to make happen, like finding customers or getting feedback on a pitch, and I'll point you to the right person or resource.", results: [], chips: SUGGESTIONS.slice(0, 3), topic: "", link: null, state: { last: state.last, seen: [...seen] } };
  }
  const asksMore = !!state.last && MORE.test(low) && tokens(low.replace(MORE, " ")).filter((w) => !KIND_WORDS.test(w)).length === 0;
  const query = asksMore ? state.last : raw;
  const q = query.toLowerCase();
  let hint = Object.keys(HINTS).find((k) => HINTS[k].test(asksMore ? low : q)) || "";
  let strict = false;   // "an event for this" / "someone else": the answer has to be that kind
  if (asksMore) { const h = Object.keys(HINTS).find((k) => HINTS[k].test(low)); if (h) { hint = h; strict = true; } }
  const toks = tokens(q);
  const needs = [...new Set([...needsFromText(q), ...toks.flatMap((t) => (SYN[t] ? needsFromText(SYN[t][0]) : []))])];
  const items = Object.values(lists).flat();
  const scored = items.filter((it) => !seen.has(`${it.kind}:${it.id}`) || !asksMore).map((it) => ({ it, ...score(it, toks, [], needs, hint) })).filter((r) => r.sc >= 3.5 && (!strict || KIND_OF[r.it.kind] === hint)).sort((a, b) => b.sc - a.sc);
  // The best of each kind first, so the answer is a person and a resource and an event rather than three of the same, and never the same title twice.
  const top = [];
  const best = scored[0];
  for (const r of scored) {
    if (top.length >= 3 || r.sc < best.sc * 0.45) break;
    if (top.some((x) => x.it.kind === r.it.kind || x.it.title === r.it.title)) continue;
    top.push(r);
  }
  for (const r of scored) { if (top.length >= 2 || !best || r.sc < best.sc * 0.45) break; if (!top.includes(r) && !top.some((x) => x.it.title === r.it.title)) top.push(r); }
  const topic = joinList((needs.length ? needs.slice(0, 2).map((n) => NEED_LABEL[n]) : toks.slice(0, 3)));
  const nextState = { last: query, seen: [...seen, ...top.map((r) => `${r.it.kind}:${r.it.id}`)] };
  if (!top.length) {
    return { reply: asksMore ? (strict ? `I don't have ${hint === "person" ? "another person" : hint === "event" ? "an event" : hint === "resource" ? "a resource" : "a program"} for that one. Try asking about it a different way.` : "That is everything I have for that one. Try describing it a different way.") : "I couldn't find anything at Humber that clearly helps with that. Try saying what you want to happen, like \"get my first customers\" or \"read my term sheet\", or ask for a person, a resource, an event or a program.",
      results: [], chips: SUGGESTIONS.slice(0, 3), topic, link: null, state };
  }
  const results = top.map((r, i) => ({ item: r.it, helps: helpsLine(r.it, r), because: r.hit.length ? `Matches ${joinList(r.hit.slice(0, 3).map((h) => `"${h}"`))}` : `Fits ${topic}`, rank: i + 1 }));
  const lead = results[0].item;
  const name = lead.kind === "person" ? first(lead.title) : `"${lead.title}"`;
  const second = results[1] ? results[1].item : null;
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const lead1 = lead.kind === "person" ? `${name} is the best person for this` : lead.kind === "resource" ? `start with ${name}` : lead.kind === "event" ? `${name} is the best place to start` : `look at ${name} first`;
  const secondName = second ? (second.kind === "person" ? first(second.title) : `"${second.title}"`) : "";
  const reply = `${topic ? `For ${topic}, ${lead1}` : cap(lead1)}.${second ? ` ${secondName} is a good next look.` : ""}${lead.verdict === "now" || lead.verdict === "close" ? "" : " It is not a priority for your startup right now, so see below for what it would take."}`;
  const kinds = new Set(results.map((r) => KIND_OF[r.item.kind]));
  const chips = [!kinds.has("person") && "Who could help with this?", !kinds.has("resource") && "Is there a guide for this?", !kinds.has("event") && "Any events for this?", "Someone else"].filter(Boolean).slice(0, 3);
  return { reply, results, chips, topic, link: null, state: nextState };
}
