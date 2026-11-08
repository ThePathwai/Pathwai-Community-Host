// The guided walkthrough player (demo only). It plays itself from the first screen to the last: it fills in the founder's profile, presses the
// buttons and moves between screens on its own, with a visible cursor and a caption that says what is happening. Pause it, step to the next or
// previous part, or restart. It drives the real product screens (it types into the real form and clicks the real buttons), so what a viewer sees
// is exactly what a founder would do. Nothing here is used outside the Humber demo.
import { api } from "./api";
import { SAMPLE_STARTUP } from "./demoSample";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CANCEL = Symbol("cancel");

// ---- state the player bar reads ----
let st = { scene: 0, playing: false, paused: false, done: false, caption: "", error: false, pending: false };
const subs = new Set();
export const getTour = () => st;
export const subscribeTour = (f) => { subs.add(f); return () => subs.delete(f); };
const emit = (patch) => { st = { ...st, ...patch }; syncDom(); subs.forEach((f) => f()); };

let token = 0;            // bumped to cancel whatever is running
let bound = { nav: null, refresh: null };
export const bindTour = (nav, refresh) => { bound = { nav, refresh }; };

// ---- cursor and the click-blocker ----
let cursor = null; let block = null;
function ensureDom() {
  if (cursor) return;
  const css = document.createElement("style");
  css.textContent = `
#pw-tour-block{position:fixed;inset:0;z-index:9000;background:transparent;touch-action:pan-y}
#pw-tour-cursor{position:fixed;left:0;top:0;z-index:9999;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:999px;pointer-events:none;
 background:rgba(11,78,162,.28);border:2px solid #0B4EA2;box-shadow:0 2px 10px rgba(0,0,0,.3);transition:transform .7s cubic-bezier(.22,.8,.3,1),opacity .25s;opacity:0}
#pw-tour-cursor.on{opacity:1}
#pw-tour-cursor.tap::after{content:"";position:absolute;inset:-6px;border-radius:999px;border:2px solid #0B4EA2;animation:pwtap .5s ease-out forwards}
@keyframes pwtap{from{transform:scale(.6);opacity:1}to{transform:scale(1.9);opacity:0}}
.pw-tour-ring{outline:3px solid rgba(11,78,162,.55)!important;outline-offset:3px;border-radius:12px;transition:outline-color .2s}`;
  document.head.appendChild(css);
  block = document.createElement("div"); block.id = "pw-tour-block"; block.style.display = "none"; document.body.appendChild(block);
  cursor = document.createElement("div"); cursor.id = "pw-tour-cursor"; document.body.appendChild(cursor);
}
function syncDom() {
  if (typeof document === "undefined") return;
  ensureDom();
  block.style.display = st.playing ? "block" : "none";
  if (!st.playing) cursor.classList.remove("on");
}

// ---- helpers the scenes use ----
const q = (sel) => document.querySelector(sel);
const shown = (el) => !!el && el.getClientRects().length > 0;
async function gate(t) { while (st.paused && t === token) await sleep(100); if (t !== token) throw CANCEL; }
async function wait(t, ms) { let left = ms; while (left > 0) { await gate(t); const s = Math.min(100, left); await sleep(s); left -= s; } await gate(t); }
async function waitFor(t, sel, ms = 9000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { await gate(t); const el = q(sel); if (shown(el)) return el; await sleep(100); }
  throw new Error("The walkthrough could not find " + sel);
}
async function reveal(t, el) {
  const r = el.getBoundingClientRect();
  if (r.top < 150 || r.bottom > window.innerHeight - 130) { el.scrollIntoView({ behavior: "smooth", block: "center" }); await wait(t, 750); }
}
async function point(t, el) {
  await reveal(t, el);
  const r = el.getBoundingClientRect();
  cursor.classList.add("on");
  cursor.style.transform = `translate(${Math.round(r.left + Math.min(r.width / 2, 120))}px, ${Math.round(r.top + r.height / 2)}px)`;
  await wait(t, 750);
}
const makeCtx = (t) => ({
  wait: (ms) => wait(t, ms),
  cap: (text) => emit({ caption: text }),
  // Goes to a screen unless we are already on it (so jumping to a part works, and moving on from the previous part does not double up).
  nav: async (path) => {
    const cur = window.location.hash.startsWith("#/") ? window.location.hash.slice(1) : window.location.pathname + window.location.search;
    if (cur !== path && bound.nav) bound.nav(path, { replace: true });
    window.scrollTo(0, 0);
    await wait(t, 700);
  },
  has: (sel) => !!q(sel),
  all: (sel) => [...document.querySelectorAll(sel)].filter(shown),
  point: async (sel) => { const el = await waitFor(t, sel); await point(t, el); return el; },
  ring: async (sel, ms = 1800) => { const el = typeof sel === "string" ? await waitFor(t, sel) : sel; await reveal(t, el); el.classList.add("pw-tour-ring"); await wait(t, ms); el.classList.remove("pw-tour-ring"); },
  scroll: async (sel, block = "center") => { const el = await waitFor(t, sel); el.scrollIntoView({ behavior: "smooth", block }); await wait(t, 900); },
  click: async (sel) => {
    const el = typeof sel === "string" ? await waitFor(t, sel) : sel; await point(t, el);
    cursor.classList.remove("tap"); void cursor.offsetWidth; cursor.classList.add("tap");
    await wait(t, 250); el.click(); await wait(t, 500);
  },
  type: async (sel, text, speed = 24) => {
    const el = await waitFor(t, sel); await point(t, el);
    el.focus({ preventScroll: true });
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const set = Object.getOwnPropertyDescriptor(proto, "value").set;
    set.call(el, ""); el.dispatchEvent(new Event("input", { bubbles: true }));
    for (let i = 1; i <= text.length; i++) { await gate(t); set.call(el, text.slice(0, i)); el.dispatchEvent(new Event("input", { bubbles: true })); await sleep(speed); }
    await wait(t, 350);
  },
});

// ---- the scenes ----
export const SCENES = [
  { key: "story", title: "Your profile", say: "Step 1. The founder tells the hub about their business: what it is, where they are and what they want.",
    async run(c) {
      await c.nav("/plan?step=story");
      await c.wait(1500);
      c.cap("Step 1. The founder names the business and says what it does, in one line.");
      await c.type("[data-testid=story-name]", "Bright Court");
      await c.type("[data-testid=story-line]", "Booking and league tools for community sports");
      c.cap("Then where they are, what they need and what they build.");
      await c.click("[data-testid=story-stage-launched]");
      await c.click("[data-testid=story-need-funding]");
      await c.click("[data-testid=story-need-customers]");
      await c.click("[data-testid=story-need-mentorship]");
      await c.click("[data-testid=story-sec-tech]");
      c.cap("And what they are trying to do next, in their own words.");
      await c.type("[data-testid=story-goal]", "Fund our second city and find a mentor who has scaled a marketplace", 20);
      c.cap("They can add their pitch too. Everything here goes on their Pathwai profile.");
      if (!q("[data-testid=story-pitch]")) await c.click("[data-testid=story-pitch-open]");
      await c.type("[data-testid=story-pitch-problem]", "Community sports groups run on group chats and spreadsheets. Organizers burn out and players drift away.", 14);
      await c.type("[data-testid=story-pitch-traction]", "14 groups, 900 players, 38% of groups rebooking weekly.", 16);
      await c.type("[data-testid=story-pitch-ask]", "A $25k grant and one mentor who has scaled a two-sided marketplace.", 14);
      c.cap("Saved to the profile. From here the hub starts working for this business.");
      await c.click("[data-testid=story-save]");
    } },
  { key: "home", title: "What the hub suggests", say: "Step 2. The hub now knows the business, so it suggests what to do next.",
    async run(c) {
      await c.nav("/");
      await c.waitFor("[data-testid=eco-home]");
      await c.wait(2000);
      c.cap("Step 2. With the profile saved, the hub suggests what to do next, in order, and why.");
      await c.ring("[data-testid=eco-moves]", 3000);
      c.cap("Behind the suggestions are the hub's real options. The founder looks through them before deciding anything.");
      await c.wait(2200);
    } },
  { key: "programs", title: "Programs and grants", say: "Step 3. Every program and grant, checked against this business.",
    async run(c) {
      await c.nav("/navigator");
      await c.waitFor("[data-testid=hub-programs]");
      await c.wait(1500);
      c.cap("Step 3. Every program and grant the hub runs, checked against this business and sorted: good match now, not yet, or not a match.");
      await c.ring("[data-testid=summary]", 3200);
      c.cap("Each card says why it fits and what to confirm before applying.");
      const first = c.all("article[data-testid^=prog-c-]")[0];
      if (first) await c.ring(first, 3200);
      c.cap("'How we checked' shows the reasoning, so nothing is a black box.");
      if (first) { const tg = first.querySelector("[data-testid=why-toggle]"); if (tg) { await c.click(tg); await c.wait(3200); await c.click(tg); } }
      c.cap("The founder marks the ones worth a second look.");
      for (const b of c.all("button[data-testid^=prog-interest-]").slice(0, 2)) { if (b.getAttribute("aria-pressed") !== "true") { await c.click(b); await c.wait(500); } }
      await c.wait(1200);
      if (c.has("[data-testid=group-later]")) { c.cap("What does not fit yet says why, so the founder knows what would change it."); await c.scroll("[data-testid=group-later]", "start"); await c.wait(3200); }
    } },
  { key: "events", title: "Events", say: "Step 4. The events worth going to, in order.",
    async run(c) {
      await c.nav("/events");
      await c.waitFor("[data-testid=hub-events]");
      await c.wait(1500);
      c.cap("Step 4. The same check runs on every event: the ones worth this founder's time come first, soonest at the top.");
      await c.ring("[data-testid=summary]", 3000);
      const first = c.all("article[data-testid^=event-]")[0];
      c.cap("Each one says why it is a match, for example what it covers and when.");
      if (first) await c.ring(first, 3000);
      c.cap("The founder says yes to the ones they will go to.");
      for (const b of c.all("button[data-testid^=rsvp-]").filter((x) => /I'm going/i.test(x.textContent || "")).slice(0, 2)) { await c.click(b); await c.wait(500); }
      await c.wait(1400);
      if (c.has("[data-testid=group-close]")) { c.cap("Events that are almost a fit say what is missing."); await c.scroll("[data-testid=group-close]", "start"); await c.wait(3000); }
    } },
  { key: "people", title: "People and resources", say: "Step 5. The people to meet and the resources to use.",
    async run(c) {
      await c.nav("/members");
      await c.waitFor("[data-testid=hub-people]");
      await c.wait(1500);
      c.cap("Step 5. Mentors, alumni and other founders, matched to what this business asked for.");
      const first = c.all("article[data-testid^=person-]")[0];
      if (first) await c.ring(first, 3000);
      c.cap("Each match says why, and the founder can open a profile and say hi.");
      if (first) { const tg = first.querySelector("[data-testid=why-toggle]"); if (tg) { await c.click(tg); await c.wait(3000); await c.click(tg); } }
      await c.nav("/resources");
      await c.waitFor("[data-testid=hub-resources]");
      await c.wait(1500);
      c.cap("Then the hub's guides, templates and perks, checked the same way.");
      await c.ring("[data-testid=summary]", 2400);
      const r = c.all("article[data-testid^=resource-]")[0];
      if (r) await c.ring(r, 3200);
    } },
  { key: "directions", title: "Make your decision", say: "Step 6. With the options in view, the founder decides.",
    async run(c) {
      await c.nav("/plan?step=directions");
      await c.waitFor("[data-testid=directions-step]");
      await c.wait(1800);
      c.cap("Step 6. Now the founder has seen the options. The hub lays out the routes the business could take, best fit first, with what each costs.");
      await c.scroll("[data-testid=directions-step]", "start");
      await c.wait(3000);
      c.cap("The founder makes the decision in their own words.");
      await c.type("[data-testid=decide-text]", "I want to apply to Pitch Day and the micro-grant, and get my first 10 customers this month", 22);
      await c.click("[data-testid=decide-go]");
      await c.waitFor("[data-testid=decide-result]");
      c.cap("The hub reads it, turns it into first steps and shows what is lined up for it, before anything is saved.");
      await c.scroll("[data-testid=decide-result]", "start");
      await c.wait(4000);
      c.cap("They use it. That is the decision.");
      await c.click("[data-testid=decide-use]");
    } },
  { key: "plan", title: "Build your plan", say: "Step 7. The chosen route becomes a plan for 2 weeks, 30 days and 90 days.",
    async run(c) {
      await c.nav("/plan?step=plan");
      await c.waitFor("[data-testid=plan-step]");
      await c.wait(2000);
      c.cap("Step 7. The route becomes a plan: what to do in the next 2 weeks, 30 days and 90 days.");
      await c.ring("[data-testid=plan-step]", 1200);
      c.cap("Each step uses this hub's own programs, events and people. Founders can reorder them, tick them off or add their own.");
      await c.scroll("[data-testid=plan-progress]", "start"); await c.wait(2600);
      const rows = document.querySelectorAll("[data-step-id]");
      if (rows.length) { rows[rows.length - 1].scrollIntoView({ behavior: "smooth", block: "center" }); await c.wait(2600); }
      c.cap("When the plan looks right, the founder moves on to the decision plan.");
      await c.click("[data-testid=to-brief]");
    } },
  { key: "brief", title: "Decision plan", say: "Step 8. The founder leaves with a decision.",
    async run(c) {
      await c.nav("/plan?step=brief");
      await c.waitFor("[data-testid=decision-hero]");
      await c.wait(2000);
      c.cap("Step 8. The founder leaves with a decision: the direction they chose and the plan for it.");
      await c.ring("[data-testid=decision-hero]", 2800);
      c.cap("They can share it with their team or an advisor, and choose what goes in.");
      await c.point("[data-testid=share-card]"); await c.wait(2400);
      c.cap("Or they start the plan on their own. No advisor needed.");
      await c.click("[data-testid=start-plan]");
      await c.wait(2400);
      c.cap("That is the whole journey: from a profile to a decision plan the founder can act on.");
    } },
];

// ---- getting each scene into the right state when someone jumps to it ----
const profile = async () => { await api.patch("/hub/profile", { startup: SAMPLE_STARTUP }); if (bound.refresh) await bound.refresh(); };
const blank = async () => { await profile(); await api.post("/navigator/plan", { direction: "", decision: null, started: null }); };
const chosen = async () => { await profile(); await api.post("/navigator/plan", { direction: "expand", started: null }); };
const PREP = [
  async () => { await api.post("/navigator/demo-reset", {}); if (bound.refresh) await bound.refresh(); },
  blank, blank, blank, blank, blank, chosen, chosen,
];


async function runFrom(i, t) {
  try {
    for (let k = i; k < SCENES.length; k++) {
      if (t !== token) return;
      emit({ scene: k, caption: SCENES[k].say });
      const ctx = makeCtx(t); ctx.waitFor = (sel) => waitFor(t, sel);
      await SCENES[k].run(ctx);
    }
    if (t === token) { cursor && cursor.classList.remove("on"); emit({ playing: false, done: true, caption: "That is the whole journey: from a profile to a decision plan the founder can act on." }); }
  } catch (e) {
    if (e === CANCEL) return;
    console.error(e);
    if (t === token) emit({ playing: false, paused: false, error: true, caption: "The walkthrough lost its place. Press Restart to play it again." });
  }
}

// ---- controls ----
const start = async (i, prep) => {
  token += 1; const t = token;
  emit({ scene: i, playing: true, paused: false, done: false, error: false, pending: false, caption: SCENES[i].say });
  try { if (prep) await PREP[i](); } catch (e) { console.error(e); }
  if (t === token) runFrom(i, t);
};
export const tour = {
  // Called by "Start the walkthrough" once the new founder is signed in; the player bar picks this up and begins.
  begin() { token += 1; emit({ scene: 0, playing: false, paused: false, done: false, error: false, pending: true, caption: SCENES[0].say }); },
  launch() { if (st.pending) start(0, false); },
  play() { if (st.done || st.error || (!st.playing && !st.paused)) return start(st.done || st.error ? 0 : st.scene, true); emit({ paused: false, playing: true }); return undefined; },
  pause() { if (st.playing) emit({ paused: true, playing: false }); },
  next() { return start(Math.min(SCENES.length - 1, st.scene + 1), true); },
  back() { return start(Math.max(0, st.scene - 1), true); },
  restart() { return start(0, true); },
  stop() { token += 1; emit({ playing: false, paused: false, pending: false }); },
};
