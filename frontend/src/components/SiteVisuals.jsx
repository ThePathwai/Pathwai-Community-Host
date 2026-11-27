import React from "react";
import { ArrowUp, Building2, Calendar, Check, Download, FileText, Gift, Lock, Users } from "./icons";
import { Eyebrow, Pill } from "./SiteKit";

// The pictures on the home page: a made-up hub window, the scattered-to-one-map diagram, the three stages of growth and a funder report.
// Everything here is sample material made up for illustration, with no figures, and says so under each picture.
// Colours come from the site's own tokens so every picture works in both the dark and the light theme.

const ink = (a) => `rgb(var(--c-ink) / ${a})`;

/* ---------- the hero picture: a hub's advisor, as a founder meets it ---------- */

const MATCHES = [
  ["Seed funding round", "Your hub · Closes soon", "Good match now", "green"],
  ["Clean growth grant", "Federal · Rolling intake", "Good match now", "green"],
  ["Pilot accelerator", "Regional · Opens in spring", "Almost", "blue"],
];

export function HubWindow() {
  return (
    <figure className="mx-auto mt-14 max-w-5xl text-left sm:mt-16" data-testid="site-window">
      <div className="overflow-hidden rounded-[1.6rem] border border-line/70 bg-paper/60 shadow-[0_40px_90px_-34px_rgba(0,0,0,.7)] backdrop-blur-xl">
        <div className="flex items-center gap-2 border-b border-line/60 px-4 py-3">
          <span className="flex gap-1.5" aria-hidden>{[0, 1, 2].map((i) => <i key={i} className="h-2.5 w-2.5 rounded-full bg-ink/20" />)}</span>
          <span className="mx-auto text-xs text-muted">Northfield Innovation Hub · Advisor</span>
          <span className="w-10 max-sm:hidden" aria-hidden />
        </div>
        <div className="grid lg:grid-cols-[12.5rem_minmax(0,1fr)_15rem]">
          {/* what the hub loaded once */}
          <div className="hidden border-r border-line/60 p-5 lg:block">
            <Eyebrow>Loaded once</Eyebrow>
            <ul className="mt-4 space-y-1.5">
              {[[Building2, "Programs"], [Calendar, "Events"], [Users, "People"], [Gift, "Perks"]].map(([Icon, t]) => (
                <li key={t} className="flex items-center gap-2.5 rounded-xl bg-ink/[.05] px-3 py-2.5 text-sm">
                  <Icon className="h-4 w-4 text-muted" aria-hidden />{t}<Check className="ml-auto h-3.5 w-3.5 text-emerald-400" aria-hidden />
                </li>
              ))}
            </ul>
          </div>
          {/* the conversation */}
          <div className="flex flex-col gap-4 p-4 sm:p-6">
            <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm text-paper">Which grant should I apply for?</p>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink/10 text-[11px] font-bold" aria-hidden>P</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">Three fit a seed-stage climate team in Ontario. Start with the first, it closes soonest.</p>
                <ul className="mt-3 space-y-2">
                  {MATCHES.map(([t, meta, tag, tone], i) => (
                    <li key={t} className="flex items-center gap-3 rounded-2xl border border-line/60 bg-ink/[.04] p-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/10 text-xs font-bold" aria-hidden>{i + 1}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{t}</span><span className="block truncate text-xs text-muted">{meta}</span></span>
                      <span className="max-sm:hidden"><Pill tone={tone}>{tag}</Pill></span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-full border border-line/60 px-4 py-2 text-sm text-muted" aria-hidden>
              <span className="flex-1">Ask the advisor</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-paper"><ArrowUp className="h-3.5 w-3.5" /></span>
            </div>
          </div>
          {/* who is asking */}
          <div className="hidden border-l border-line/60 p-5 lg:block">
            <Eyebrow>The founder</Eyebrow>
            <div className="mt-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-xs font-bold" style={{ color: "var(--on-accent)" }}>AJ</span>
              <span><span className="block text-sm font-semibold">Amara J.</span><span className="block text-xs text-muted">VoltGrid · Toronto</span></span>
            </div>
            <dl className="mt-4 space-y-2 text-xs">
              {[["Stage", "Seed"], ["Region", "Ontario"], ["Needs", "Funding, mentors"]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 rounded-xl bg-ink/[.05] px-3 py-2"><dt className="text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>
              ))}
            </dl>
            <div className="mt-4 rounded-2xl border border-line/60 p-3">
              <p className="eyebrow">Next move</p>
              <p className="mt-1.5 text-sm font-semibold leading-snug">Apply to the seed funding round</p>
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

/* ---------- the funder report, as a page you could hand over ---------- */

const REPORT_ROWS = [["Members active", 0.82], ["Introductions made", 0.56], ["Events held", 0.68], ["Perks used", 0.44]];
const HANDOVER = [
  [FileText, "Reports", "PDF, slides or a live link, in your hub's own colours."],
  [Download, "The raw numbers", "Every number behind them in one spreadsheet."],
  [Lock, "Private by design", "Totals only. Small groups are hidden so no one can be picked out."],
];

export function ReportMock() {
  return (
    <div className="grid items-center gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-10" data-testid="site-proof">
      <figure>
        <div className="mx-auto max-w-xl rounded-[1.4rem] bg-[#F6F6F8] p-6 text-[#16161C] shadow-[0_34px_70px_-30px_rgba(0,0,0,.7)] sm:p-8">
          <div className="flex items-start justify-between gap-4 border-b border-[#16161C]/10 pb-4">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#16161C]/55">Funder report</p><p className="mt-1 text-lg font-semibold">Northfield Innovation Hub</p></div>
            <span className="rounded-full bg-[#16161C] px-3 py-1 text-[11px] font-medium text-white">Last 90 days</span>
          </div>
          <div className="mt-5 space-y-4">
            {REPORT_ROWS.map(([t, w]) => (
              <div key={t}>
                <p className="text-sm font-medium">{t}</p>
                <div className="mt-1.5 h-2.5 rounded-full bg-[#16161C]/10"><div className="h-full rounded-full bg-[#16161C]" style={{ width: `${w * 100}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[#16161C]/10 pt-4">
            {["PDF", "Slides", "Live link", "Spreadsheet"].map((t) => <span key={t} className="rounded-full border border-[#16161C]/20 px-3 py-1 text-[11px] font-medium">{t}</span>)}
          </div>
        </div>
        <figcaption className="mt-3 text-center text-xs text-muted">Sample report, made up for illustration.</figcaption>
      </figure>
      <ul className="space-y-3">
        {HANDOVER.map(([Icon, t, d]) => (
          <li key={t} className="card flex items-start gap-4 !p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink/10"><Icon className="h-4 w-4" aria-hidden /></span>
            <span><h3 className="text-lg">{t}</h3><p className="mt-1 text-sm text-muted">{d}</p></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
