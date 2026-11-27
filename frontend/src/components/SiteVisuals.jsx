import React from "react";
import { ArrowRight, Check, Circle, CircleCheck } from "./icons";
import { Eyebrow, Pill } from "./SiteKit";
import { cx } from "./ui";

// The pictures on the home page: a made-up hub window, the scattered-to-one-map diagram, and the three stages of growth.
// Everything here is sample material made up for illustration, with no figures, and says so under each picture.
// Colours come from the site's own tokens so every picture works in both the dark and the light theme.

const ink = (a) => `rgb(var(--c-ink) / ${a})`;

/* ---------- the hero picture: what only Pathwai has. The hub's own catalogue in, a plan that stays current, the hard conversations left to the team ---------- */

const HUB_ONLY = [
  ["Founder Fundamentals", "Next cohort opens in January", "Your hub", "gray"],
  ["Legal clinic", "Every second Tuesday", "Your hub", "gray"],
  ["Mentor, utility sales", "Thursdays, by booking", "Your hub", "gray"],
  ["Seed funding round", "Federal · checked Nov 24", "Checked", "green"],
];
const PLAN = [
  ["done", "Applied", "Seed funding round", "Marked by the founder"],
  ["next", "Next", "Clean growth grant", "Closes in 9 days"],
  ["later", "Then", "Book the utility mentor", "Thursday · Your hub"],
];

export function HubWindow() {
  return (
    <figure className="mx-auto mt-14 max-w-5xl text-left sm:mt-16" data-testid="site-window">
      <div className="overflow-hidden rounded-[1.6rem] border border-line/70 bg-paper/60 shadow-[0_40px_90px_-34px_rgba(0,0,0,.7)] backdrop-blur-xl">
        <div className="flex items-center gap-2 border-b border-line/60 px-4 py-3">
          <span className="flex gap-1.5" aria-hidden>{[0, 1, 2].map((i) => <i key={i} className="h-2.5 w-2.5 rounded-full bg-ink/20" />)}</span>
          <span className="mx-auto text-xs text-muted">Northfield Innovation Hub · Pathwai</span>
          <span className="w-10 max-sm:hidden" aria-hidden />
        </div>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* in: the hub's own knowledge */}
          <div className="hidden border-r border-line/60 p-5 lg:block">
            <Eyebrow>Your hub's own programs</Eyebrow>
            <ul className="mt-4 space-y-2">
              {HUB_ONLY.map(([t, meta, tag, tone]) => (
                <li key={t} className="rounded-2xl bg-ink/[.05] p-3">
                  <span className="flex items-start justify-between gap-2"><span className="text-sm font-semibold leading-snug">{t}</span><Pill tone={tone}>{tag}</Pill></span>
                  <span className="mt-0.5 block text-xs text-muted">{meta}</span>
                </li>
              ))}
            </ul>
          </div>
          {/* the founder's plan, kept current */}
          <div className="p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-xs font-bold" style={{ color: "var(--on-accent)" }}>AJ</span>
              <span className="min-w-0"><span className="block text-sm font-semibold">Amara's plan</span><span className="block text-xs text-muted">VoltGrid · Seed · Updated today</span></span>
            </div>
            <p className="mt-4 rounded-2xl border border-line/70 border-l-2 border-l-emerald-400 bg-ink/[.04] px-4 py-3 text-sm"><span className="eyebrow block">What changed</span><span className="mt-1 block">Pilot accelerator closed. Next intake is in spring, so the funding step moved up.</span></p>
            <ol className="mt-4 space-y-2">
              {PLAN.map(([state, tag, t, meta]) => (
                <li key={t} className="flex items-center gap-3 rounded-2xl border border-line/60 bg-ink/[.04] p-3">
                  {state === "done" ? <CircleCheck className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden /> : <Circle className={cx("h-5 w-5 shrink-0", state === "next" ? "text-ink" : "text-muted")} aria-hidden />}
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{t}</span><span className="block truncate text-xs text-muted">{meta}</span></span>
                  <span className="eyebrow">{tag}</span>
                </li>
              ))}
            </ol>
          </div>
          {/* out: the team keeps the hard conversations */}
          <div className="hidden border-l border-line/60 p-5 lg:block">
            <Eyebrow>Your team's view</Eyebrow>
            <p className="mt-4 text-xs font-semibold text-muted">Answered by Pathwai</p>
            <ul className="mt-2 space-y-1.5">
              {["Which programs are open now?", "Am I eligible for the clinic?", "Where do I start?"].map((t) => <li key={t} className="flex items-start gap-2 rounded-xl bg-ink/[.05] px-3 py-2 text-xs"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />{t}</li>)}
            </ul>
            <p className="mt-5 text-xs font-semibold text-muted">Needs your advisor</p>
            <div className="mt-2 rounded-2xl border border-ink/30 bg-ink/[.07] p-3">
              <p className="text-sm font-semibold leading-snug">Amara · utility pilot contract</p>
              <p className="mt-1 text-xs text-muted">Plan and history attached</p>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted">Sample hub and founder, made up for illustration.</figcaption>
    </figure>
  );
}

/* ---------- the problem, drawn: many places on the left, one map on the right ---------- */

// [label, rotation in degrees, nudge down in px]. Fixed, so the scatter looks the same on every visit.
const PORTALS = [["Federal grants", -3, 0], ["Provincial programs", 2, 14], ["City hubs", -2, 4], ["Accelerators", 3, -2], ["Tax credits", -2, 16], ["Mentor lists", 2, 2], ["Event pages", -3, 12], ["Investor lists", 2, -4], ["University labs", -1, 10], ["Funder sites", 3, 6]];

export function ScatterToMap() {
  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-[1fr_6.5rem_1fr]" data-testid="site-scatter">
      <div className="card flex flex-col !p-6 sm:!p-8">
        <Eyebrow>Where support lives today</Eyebrow>
        <div className="my-auto flex flex-wrap justify-center gap-x-2.5 gap-y-5 py-6" aria-hidden>
          {PORTALS.map(([t, r, y]) => (
            <span key={t} className="rounded-xl border border-dashed border-ink/25 px-3 py-2 text-sm text-muted" style={{ transform: `translateY(${y}px) rotate(${r}deg)` }}>{t}</span>
          ))}
        </div>
        <p className="text-sm text-muted">Hundreds of portals. Different rules, dates and forms.</p>
      </div>

      <svg viewBox="0 0 104 240" className="mx-auto hidden h-full w-full lg:block" aria-hidden fill="none">
        {[30, 80, 120, 160, 210].map((y) => <path key={y} d={`M0 ${y} C 52 ${y}, 40 120, 92 120`} style={{ stroke: ink(0.3) }} strokeWidth="1.2" strokeDasharray="3 4" />)}
        <path d="M86 112 L96 120 L86 128" style={{ stroke: ink(0.7) }} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <svg viewBox="0 0 24 40" className="mx-auto h-10 w-6 lg:hidden" aria-hidden fill="none">
        <path d="M12 2 V34 M5 27 L12 35 L19 27" style={{ stroke: ink(0.6) }} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="0" />
      </svg>

      <div className="card flex flex-col gap-3 !p-6 sm:!p-8">
        <Eyebrow>With Pathwai, in one hub</Eyebrow>
        <div className="rounded-2xl bg-ink/[.05] p-4">
          <p className="eyebrow">The founder</p>
          <p className="mt-2 text-lg font-semibold leading-snug">Sees what fits, and why.</p>
          <ul className="mt-3 space-y-1.5">
            {["Seed funding round", "Utility partnerships mentor"].map((t) => <li key={t} className="flex items-center gap-2 text-sm text-muted"><Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />{t}</li>)}
          </ul>
        </div>
        <div className="rounded-2xl bg-ink/[.05] p-4">
          <p className="eyebrow">The hub team</p>
          <p className="mt-2 text-lg font-semibold leading-snug">Keeps the hard conversations.</p>
          <p className="mt-2 text-sm text-muted">Routine questions are already answered.</p>
        </div>
      </div>
    </div>
  );
}

/* ---------- one hub, many hubs, every hub ---------- */

// A small seeded scatter, so "every hub" is the same picture each time.
function scatter(n, seed) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const pts = [];
  let guard = 0;
  while (pts.length < n && guard++ < 4000) {
    const p = [14 + rnd() * 172, 12 + rnd() * 116];
    if (pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 26)) pts.push(p);
  }
  return pts;
}
const around = ([cx0, cy0], r, n, off = 0) => Array.from({ length: n }, (_, i) => { const a = off + (i / n) * Math.PI * 2; return [cx0 + Math.cos(a) * r, cy0 + Math.sin(a) * r]; });
const lines = (pts, max) => pts.flatMap((a, i) => pts.slice(i + 1).filter((b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < max).map((b) => [a, b]));

const ONE = [100, 70];
const MANY = [[48, 44], [152, 40], [62, 104], [148, 102]];
const EVERY = scatter(17, 7);
const edge = { stroke: ink(0.28) };
const dash = { stroke: ink(0.4) };
const hub = { fill: "var(--accent)" };
const dot = { fill: ink(0.5) };

const STAGES = [
  ["One hub", "A venture advisor loaded with your programs, events and people."],
  ["Many hubs", "Founders move between hubs when they choose to. Hubs refer to each other."],
  ["Every hub", "One national map of support, and no founder left to search alone."],
];

function StageArt({ i }) {
  const common = { viewBox: "0 0 200 140", className: "h-40 w-full sm:h-auto", "aria-hidden": true };
  if (i === 0) {
    const f = around(ONE, 44, 9, 0.3);
    return (
      <svg {...common}>
        {f.map(([x, y], k) => <line key={k} x1={ONE[0]} y1={ONE[1]} x2={x} y2={y} strokeWidth="1" style={edge} />)}
        {f.map(([x, y], k) => <circle key={k} cx={x} cy={y} r="3.2" style={dot} />)}
        <circle cx={ONE[0]} cy={ONE[1]} r="17" style={hub} />
        <circle cx={ONE[0]} cy={ONE[1]} r="23" fill="none" strokeWidth="1" style={dash} />
      </svg>
    );
  }
  if (i === 1) {
    return (
      <svg {...common}>
        {lines(MANY, 130).map(([a, b], k) => <line key={k} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} strokeWidth="1.2" strokeDasharray="3 4" style={dash} />)}
        {MANY.map((c, k) => around(c, 22, 4, k).map(([x, y], j) => <g key={`${k}-${j}`}><line x1={c[0]} y1={c[1]} x2={x} y2={y} strokeWidth="1" style={edge} /><circle cx={x} cy={y} r="2.6" style={dot} /></g>))}
        {MANY.map(([x, y], k) => <circle key={k} cx={x} cy={y} r="11" style={hub} />)}
      </svg>
    );
  }
  return (
    <svg {...common}>
      {lines(EVERY, 50).map(([a, b], k) => <line key={k} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} strokeWidth="1" style={dash} />)}
      {EVERY.map(([x, y], k) => <circle key={k} cx={x} cy={y} r="6" style={hub} />)}
    </svg>
  );
}

export function GrowthStages() {
  return (
    <ol className="grid gap-4 sm:grid-cols-3" data-testid="site-growth">
      {STAGES.map(([t, d], i) => (
        <li key={t} className="card flex flex-col !p-5 sm:!p-6">
          <div className="rounded-2xl bg-ink/[.04] p-2"><StageArt i={i} /></div>
          <h3 className="mt-5 text-xl">{t}</h3>
          <p className="mt-1.5 text-sm text-muted">{d}</p>
        </li>
      ))}
    </ol>
  );
}

/* ---------- the three "see it in action" pictures ---------- */

export function StoryHub() {
  const open = ["Federal grants", "Provincial programs", "Public event pages"];
  const own = ["Cohort dates and intake notes", "Your mentors and their hours", "Your events, perks and clinics", "Local rules, and who to call"];
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1.25fr]" data-testid="story-hub-art">
      <div className="card !p-5">
        <Eyebrow>Anyone can find</Eyebrow>
        <ul className="mt-4 space-y-2" aria-hidden>{open.map((t) => <li key={t} className="rounded-xl border border-dashed border-ink/25 px-3 py-2.5 text-sm text-muted">{t}</li>)}</ul>
      </div>
      <div className="card !border-ink/30 !p-5">
        <Eyebrow>Only your hub has</Eyebrow>
        <ul className="mt-4 space-y-2">{own.map((t) => <li key={t} className="flex items-center gap-2.5 rounded-xl bg-ink/[.07] px-3 py-2.5 text-sm font-medium"><Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />{t}</li>)}</ul>
      </div>
    </div>
  );
}

const WEEK0 = [["Seed funding round", "Applied", "green"], ["Clean growth grant", "Closes in 9 days", "gray"], ["Pilot accelerator", "Closes in 12 days", "gray"]];
const WEEK2 = [["Seed funding round", "Applied", "green"], ["Clean growth grant", "Closed", "gray", true], ["Pilot accelerator", "Closed", "gray", true], ["Venture clinic at your hub", "New · Dec 16", "blue"]];

function Snapshot({ label, rows }) {
  return (
    <div className="card !p-4">
      <Eyebrow>{label}</Eyebrow>
      <ul className="mt-3 space-y-2">
        {rows.map(([t, tag, tone, struck]) => (
          <li key={t} className="rounded-xl bg-ink/[.06] px-3 py-2.5">
            <span className={cx("block text-sm font-medium", struck && "text-muted line-through decoration-ink/40")}>{t}</span>
            <span className="mt-1.5 inline-block"><Pill tone={tone}>{tag}</Pill></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StoryCurrent() {
  return (
    <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]" data-testid="story-current-art">
      <Snapshot label="The plan today" rows={WEEK0} />
      <span className="mx-auto flex flex-col items-center gap-1 text-xs text-muted"><ArrowRight className="h-5 w-5 rotate-90 sm:rotate-0" aria-hidden />Two weeks on</span>
      <Snapshot label="The plan, kept current" rows={WEEK2} />
    </div>
  );
}

export function StoryTeam() {
  const routine = ["Which programs are open now?", "Am I eligible for the legal clinic?", "Where do I start?", "When is the next cohort?"];
  const hard = ["Negotiating a utility pilot", "Choosing between two offers"];
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1.15fr]" data-testid="story-team-art">
      <div className="card !p-5">
        <Eyebrow>Pathwai answers</Eyebrow>
        <ul className="mt-4 space-y-2">{routine.map((t) => <li key={t} className="flex items-start gap-2.5 rounded-xl bg-ink/[.06] px-3 py-2.5 text-sm"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />{t}</li>)}</ul>
      </div>
      <div className="card !border-ink/30 !p-5">
        <Eyebrow>Your team takes</Eyebrow>
        <ul className="mt-4 space-y-2">{hard.map((t) => <li key={t} className="rounded-xl bg-ink/[.07] px-3 py-3"><span className="block text-sm font-semibold">{t}</span><span className="mt-1 block text-xs text-muted">The founder's plan and history come with it</span></li>)}</ul>
        <p className="mt-4 flex items-center gap-2 text-xs text-muted"><ArrowRight className="h-3.5 w-3.5" aria-hidden />Handed over when a founder needs a person</p>
      </div>
    </div>
  );
}
