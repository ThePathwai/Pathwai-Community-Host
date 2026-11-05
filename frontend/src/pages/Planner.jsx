import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Check, CheckCircle2, ChevronDown, Circle, Clock, Copy, Eye, EyeOff, GripVertical, Lock, Plus, Send, Share2, Sparkles, Target, X } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useEcosystem } from "../lib/ecosystem";
import { NEEDS, NEED_LABEL, STAGES, STAGE_HINT, STAGE_LABEL, needsFromText } from "../lib/navigator";
import { BRIEF_SECTIONS, HORIZONS, STATUS_LABEL, STEPS, UPDATES, advisorBrief, applyUpdate, buildPlan, decide, directions, moveStep, planProgress, stepStates } from "../lib/planner";
import { Avatar, Spinner, cx } from "../components/ui";
import { KindTile, VerdictBadge, dayShort, heading } from "../components/hub/HubKit";

// The venture planner (/plan): four steps that take a founder from "here is my idea" to "here is my brief and my questions for an advisor".
//   1 Your story      what you are building, where you are, what you want  (saved to your startup profile, the same one the Navigator reads)
//   2 Directions      a few routes the business could take, with why each fits you and what it costs
//   3 Your plan       the steps for the route you chose, using the programs, events, people and resources around you
//   4 Advisor brief   a one-page summary and specific questions. Private until you share it, and you choose what goes in.
// The rules are in lib/planner.js. Matches come from GET /navigator/moves; ticks and sharing are saved with /navigator/plan.

const ACCENT = { background: "var(--accent)", color: "var(--on-accent)" };
const PRIMARY = "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50";
const Eyebrow = ({ children }) => <p className="text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{children}</p>;

// ---- the four steps, always visible ----
const SHORT = { story: "Story", directions: "Directions", plan: "Plan", brief: "Brief" };
function Stepper({ states, step, onGo }) {
  return (
    <ol className="grid grid-cols-4 gap-1.5 sm:gap-3" data-testid="plan-steps" aria-label="Planner steps">
      {states.map((s) => {
        const on = s.key === step;
        return (
          <li key={s.key}>
            <button type="button" onClick={() => onGo(s.key)} aria-current={on ? "step" : undefined} data-testid={`step-${s.key}`} data-done={s.done ? "1" : "0"}
              className={cx("flex h-full w-full flex-col items-center gap-1.5 rounded-2xl border p-2 text-center transition sm:items-stretch sm:gap-2 sm:p-4 sm:text-left", on ? "border-transparent shadow-md" : "border-line bg-surface hover:border-ink/30")} style={on ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>
              <span className="flex flex-col items-center gap-1.5 sm:flex-row sm:gap-2">
                <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", on ? "bg-white/25" : s.done ? "bg-emerald-500 text-white" : "bg-ink/10 text-ink/70")}>{s.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : s.n}</span>
                <span className="text-[11px] font-bold sm:truncate sm:text-sm"><span className="sm:hidden">{SHORT[s.key]}</span><span className="hidden sm:inline">{s.label}</span></span>
              </span>
              <span className={cx("hidden text-xs leading-snug sm:block", on ? "opacity-85" : "text-muted")}>{s.detail}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function StepHead({ n, title, sub }) {
  return (
    <div className="mb-5">
      <Eyebrow>Step {n} of 4</Eyebrow>
      <h2 className="mt-1.5 text-2xl sm:text-3xl" style={{ ...heading, letterSpacing: "-0.025em", textWrap: "balance" }}>{title}</h2>
      <p className="mt-1.5 max-w-2xl text-sm text-muted">{sub}</p>
    </div>
  );
}

// ---- 1. your story ----
function Story({ startup, onSave, busy }) {
  const [f, setF] = useState(() => ({ one_liner: startup.one_liner || "", traction: (startup.pitch || {}).traction || "", goal: startup.goal || "", stage: startup.stage || "", needs: startup.needs || [],
    problem: (startup.pitch || {}).problem || "", solution: (startup.pitch || {}).solution || "", market: (startup.pitch || {}).market || "", ask: (startup.pitch || {}).ask || "" }));
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const toggle = (n) => set("needs", f.needs.includes(n) ? f.needs.filter((x) => x !== n) : [...f.needs, n]);
  const heard = needsFromText([f.goal, f.traction, f.ask, f.one_liner].join(" ")).filter((n) => !f.needs.includes(n) && NEED_LABEL[n]).slice(0, 3);
  const ready = f.one_liner.trim() && f.stage && f.needs.length && f.goal.trim();
  const save = () => onSave({ ...startup, one_liner: f.one_liner.trim(), goal: f.goal.trim(), stage: f.stage, needs: f.needs,
    pitch: { ...(startup.pitch || {}), ...Object.fromEntries(["traction", "problem", "solution", "market", "ask"].map((k) => [k, f[k].trim()])) } });
  const lab = "mb-1.5 block text-sm font-semibold";
  return (
    <section data-testid="story-step">
      <StepHead n={1} title="Tell us about your startup" sub="Plain words are fine. Everything on the next steps is built from this, and you can change it any time." />
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="card space-y-5">
          <label className="block"><span className={lab}>What are you building, and for whom?</span>
            <textarea rows={2} className="input" value={f.one_liner} maxLength={200} onChange={(e) => set("one_liner", e.target.value)} data-testid="story-idea" placeholder="e.g. Booking tools for community sports groups" /></label>
          <label className="block"><span className={lab}>Where are you today?</span>
            <textarea rows={2} className="input" value={f.traction} onChange={(e) => set("traction", e.target.value)} data-testid="story-position" placeholder="Customers, users, revenue, a prototype, nothing yet: whatever is true" /></label>
          <label className="block"><span className={lab}>What do you want to be true six months from now?</span>
            <textarea rows={2} className="input" value={f.goal} onChange={(e) => set("goal", e.target.value)} data-testid="story-goal" placeholder="e.g. Launch in a second city and find a mentor" /></label>
          <div><span className={lab}>Your stage</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Your stage">
              {STAGES.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={f.stage === s} onClick={() => set("stage", s)} data-testid={`story-stage-${s}`} title={STAGE_HINT[s]}
                  className={cx("rounded-full border px-3.5 py-1.5 text-sm transition", f.stage === s ? "border-transparent font-semibold" : "border-line text-muted hover:text-ink")} style={f.stage === s ? ACCENT : undefined}>{STAGE_LABEL[s]}</button>
              ))}
            </div></div>
          <div><span className={lab}>What would help most right now? <span className="font-normal text-muted">Pick any.</span></span>
            <div className="flex flex-wrap gap-2">
              {NEEDS.filter((n) => !["export", "tax", "visa"].includes(n)).map((n) => (
                <button key={n} type="button" aria-pressed={f.needs.includes(n)} onClick={() => toggle(n)} data-testid={`story-need-${n}`}
                  className={cx("rounded-full border px-3.5 py-1.5 text-sm transition", f.needs.includes(n) ? "border-transparent font-semibold" : "border-line text-muted hover:text-ink")} style={f.needs.includes(n) ? ACCENT : undefined}>{NEED_LABEL[n]}</button>
              ))}
            </div>
            {heard.length > 0 && (
              <p className="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-muted" data-testid="story-heard"><Sparkles className="h-4 w-4" aria-hidden />You might also need
                {heard.map((n) => <button key={n} type="button" onClick={() => toggle(n)} className="rounded-full border border-dashed border-ink/30 px-3 py-1 text-xs font-semibold text-ink hover:bg-ink/5">+ Add {NEED_LABEL[n]}</button>)}</p>
            )}
          </div>
          <details className="group rounded-xl border border-line px-4 py-3" data-testid="story-more">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">Add more for your advisor, if you like<ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden /></summary>
            <div className="mt-4 space-y-4">
              {[["problem", "The problem you solve"], ["solution", "How you solve it"], ["market", "Who the market is"], ["ask", "What you are asking for"]].map(([k, l]) => (
                <label key={k} className="block"><span className={lab}>{l}</span><textarea rows={2} className="input" value={f[k]} onChange={(e) => set(k, e.target.value)} /></label>
              ))}
            </div>
          </details>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={PRIMARY} style={ACCENT} disabled={!ready || busy} onClick={save} data-testid="story-save">Save and see directions<ArrowRight className="h-4 w-4" aria-hidden /></button>
            {!ready && <span className="text-xs text-muted">Fill in the first three questions, your stage and one need to continue.</span>}
          </div>
        </div>
        <aside className="card h-fit space-y-3 text-sm">
          <Eyebrow>What happens next</Eyebrow>
          <p className="flex gap-2.5"><span className="font-bold">2</span><span>We show a few directions the business could take, and why each fits.</span></p>
          <p className="flex gap-2.5"><span className="font-bold">3</span><span>You pick one and get a plan using the programs, people and events around you.</span></p>
          <p className="flex gap-2.5"><span className="font-bold">4</span><span>You get a one-page brief and questions to take to an advisor.</span></p>
          <p className="flex items-start gap-2 border-t border-line pt-3 text-xs text-muted"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />This is yours. Nobody sees it until you choose to share the brief.</p>
        </aside>
      </div>
    </section>
  );
}

// ---- state a decision ----
// Say what you have decided in your own words. We show what Pathwai would build from it (the direction, the first steps, what is lined up)
// before anything is saved.
const DECIDE_EXAMPLES = ["Apply for grants this month and find my first 10 customers", "Find a mentor who has scaled a startup, in the next 3 months", "Go to Pitch Day and get feedback on my pitch"];
function Decide({ startup, lists, hub, today, saved, onUse, busy }) {
  const [text, setText] = useState("");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const run = (t) => {
    try { setRes(decide({ text: t ?? text, startup, lists, hub, today })); setErr(""); }
    catch (e) { setRes(null); setErr(e.message); }
  };
  const hz = Object.fromEntries(HORIZONS);
  return (
    <section className="mb-6 card space-y-4" data-testid="decide">
      <div>
        <h3 className="text-lg font-bold" style={heading}>Already decided? Say it in your own words</h3>
        <p className="text-sm text-muted">{saved ? `Your decision so far: "${saved.text}". Write a new one to change it.` : "We turn it into a plan and show you what is lined up for it, before you save anything."}</p>
      </div>
      <form className="flex flex-wrap items-start gap-3" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <textarea rows={2} className="input min-w-0 flex-1" style={{ minWidth: "14rem" }} value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="e.g. I want to apply for grants this month and get my first 10 customers" aria-label="Your decision" data-testid="decide-text" />
        <button type="submit" className={PRIMARY} style={ACCENT} disabled={text.trim().length < 6} data-testid="decide-go"><Sparkles className="h-4 w-4" aria-hidden />See what this builds</button>
      </form>
      {!res && <div className="flex flex-wrap gap-2">{DECIDE_EXAMPLES.map((x) => <button key={x} type="button" onClick={() => { setText(x); run(x); }} data-testid="decide-example" className="rounded-full border border-line px-3 py-1 text-[13px] text-ink/80 hover:bg-ink/5">{x}</button>)}</div>}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {res && (
        <div className="space-y-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/[.06] p-4 sm:p-5" data-testid="decide-result">
          <div>
            <Eyebrow>{res.clear ? "How we read it" : "We were not sure, so this is our best guess"}</Eyebrow>
            <p className="mt-1 text-lg font-bold leading-snug" style={{ ...heading }} data-testid="decide-dir">{res.title}</p>
            <p className="text-sm text-ink/85">{res.promise}</p>
            {res.read.length > 0 && <p className="mt-1.5 text-sm text-muted">{res.read.join(" ")}</p>}
            {!res.clear && res.other && <p className="mt-1 text-xs text-muted">Not right? Try adding words like "grants", "customers" or "mentor", or pick a direction below.</p>}
          </div>
          <div>
            <Eyebrow>Your first steps</Eyebrow>
            <ol className="mt-2 space-y-2">{res.steps.slice(0, 5).map((x, i) => (
              <li key={x.id || i} className="flex items-start gap-3 text-sm"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink/10 text-xs font-bold">{i + 1}</span>
                <span className="min-w-0 flex-1"><span className="block font-medium leading-snug">{x.title}</span><span className="block text-xs text-muted">{hz[x.horizon]}{x.why ? ` · ${x.why}` : ""}</span></span></li>))}</ol>
          </div>
          {res.lined.length > 0 && (
            <div>
              <Eyebrow>Lined up for it</Eyebrow>
              <ul className="mt-2 grid gap-2 sm:grid-cols-3">{res.lined.map((m) => (
                <li key={m.kind + m.id} className="flex items-start gap-2.5 rounded-xl border border-line bg-surface p-3" data-testid="decide-lined">
                  <KindTile kind={m.kind} size={32} /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{m.title}</span><span className="mt-0.5 block"><VerdictBadge verdict={m.verdict} short size="sm" /></span></span></li>))}</ul>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={PRIMARY} style={ACCENT} disabled={busy} data-testid="decide-use" onClick={() => onUse(res)}>Use this plan<ArrowRight className="h-4 w-4" aria-hidden /></button>
            <button type="button" className="btn-ghost !py-2 text-sm" onClick={() => setRes(null)} data-testid="decide-edit">Change my words</button>
            <span className="text-xs text-muted">Nothing is saved until you use it.</span>
          </div>
        </div>
      )}
    </section>
  );
}

// ---- 2. directions ----
function Directions({ list, chosen, onChoose, busy, hub, decideProps }) {
  const [more, setMore] = useState(false);
  const shown = more ? list : list.slice(0, 3);
  return (
    <section data-testid="directions-step">
      <StepHead n={2} title="Pick a direction to lean toward" sub="These are the routes your business could take next, best fit first. You are not locked in: you can switch later and your plan changes with it." />
      <Decide {...decideProps} busy={busy} />
      <div className="grid gap-4 lg:grid-cols-3">
        {shown.map((d) => {
          const on = chosen === d.key;
          return (
            <article key={d.key} data-testid={`dir-${d.key}`} data-chosen={on ? "1" : "0"} className={cx("relative flex flex-col gap-4 overflow-hidden rounded-2xl border bg-surface p-5 shadow-sm", on ? "border-emerald-500/60 ring-2 ring-emerald-500/30" : "border-line")}>
              <span aria-hidden className={cx("absolute inset-x-0 top-0 h-1.5", d.best ? "bg-emerald-500" : "bg-ink/15")} />
              <div className="flex h-8 items-center justify-between gap-2 pt-1">
                {d.best ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><Target className="h-3.5 w-3.5" aria-hidden />Best fit for you</span> : <span className="text-xs font-semibold text-muted">Another route</span>}
                {on && <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" aria-hidden />Your pick</span>}
              </div>
              <div>
                <h3 className="text-xl font-bold leading-snug" style={{ letterSpacing: "-0.02em" }}>{d.title}</h3>
                <p className="mt-1.5 text-sm leading-snug text-ink/85">{d.promise}</p>
              </div>
              <div>
                <Eyebrow>Why it fits you</Eyebrow>
                <ul className="mt-1.5 space-y-1.5 text-sm">{d.reasons.slice(0, 4).map((r) => <li key={r} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden /><span>{r}</span></li>)}</ul>
              </div>
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-sm leading-snug">
                <span className="mr-1.5 text-[11px] font-bold uppercase text-amber-700 dark:text-amber-300" style={{ letterSpacing: "0.1em" }}>What it costs</span>{d.caution || d.cost}
              </div>
              <div>
                <Eyebrow>First moves</Eyebrow>
                <ol className="mt-1.5 space-y-1.5 text-sm">{d.moves.map(([, t], i) => <li key={i} className="flex gap-2"><span className="w-4 shrink-0 font-bold text-muted">{i + 1}</span><span>{t}</span></li>)}</ol>
              </div>
              {!d.supportTotal && <p className="text-xs text-muted">Nothing nearby fits this yet.</p>}
              <button type="button" disabled={busy} onClick={() => onChoose(d.key)} data-testid={`dir-choose-${d.key}`} className={cx(PRIMARY, "mt-auto w-full", !on && !d.best && "!bg-transparent border border-line")} style={on || d.best ? ACCENT : undefined}>
                {on ? <>Build my plan<ArrowRight className="h-4 w-4" aria-hidden /></> : <>Choose this direction</>}
              </button>
            </article>
          );
        })}
      </div>
      {list.length > 3 && <button type="button" className="btn-ghost mx-auto mt-5 flex !py-2 text-sm" onClick={() => setMore(!more)} data-testid="dir-more">{more ? "Show fewer" : `Show ${list.length - 3} other directions`}</button>}
    </section>
  );
}

// ---- 3. your plan ----
const NEXT = { todo: "doing", doing: "done", done: "todo" };
function StatusButton({ s, onChange }) {
  const Icon = s === "done" ? CheckCircle2 : s === "doing" ? Clock : Circle;
  return (
    <button type="button" onClick={() => onChange(NEXT[s])} aria-label={`${STATUS_LABEL[s]}. Tap to change.`} title={`${STATUS_LABEL[s]}. Tap to change.`} data-status={s}
      className={cx("mt-0.5 shrink-0 rounded-full transition hover:scale-110", s === "done" ? "text-emerald-600 dark:text-emerald-400" : s === "doing" ? "text-amber-600 dark:text-amber-400" : "text-ink/35")}>
      <Icon className="h-6 w-6" aria-hidden />
    </button>
  );
}

// Drag a step to reorder it or move it to another window (next 2 weeks, 30 days, 90 days). Pointer events, so one code path covers mouse, pen and
// touch; the grip has touch-action none so the rest of the page still scrolls. The up and down arrow keys on the grip do the same for keyboards.
function useDragSteps(steps, onArrange) {
  const [d, setD] = useState(null);          // {id, title, x, y}
  const [target, setTarget] = useState(null); // {horizon, index}
  const zones = useRef({});
  const live = useRef({ y: 0, id: null, target: null });
  const raf = useRef(0);
  const zone = useCallback((k, el) => { zones.current[k] = el; }, []);
  const where = (x, y, id) => {
    let best = null, gap = Infinity;
    for (const [k, el] of Object.entries(zones.current)) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const g = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      if (g < gap) { gap = g; best = { k, el }; }
    }
    if (!best) return null;
    const rows = [...best.el.querySelectorAll("[data-step-id]")].filter((r) => r.dataset.stepId !== id);
    return { horizon: best.k, index: rows.filter((r) => { const b = r.getBoundingClientRect(); return y > b.top + b.height / 2; }).length };
  };
  const end = (commit) => {
    cancelAnimationFrame(raf.current);
    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel);
    const { id, target: t } = live.current;
    live.current = { y: 0, id: null, target: null };
    setD(null); setTarget(null);
    if (commit && id && t) { const next = moveStep(steps, id, t.horizon, t.index); if (next) onArrange(next); }
  };
  const move = (e) => {
    live.current.y = e.clientY;
    const t = where(e.clientX, e.clientY, live.current.id);
    live.current.target = t; setTarget(t);
    setD((x) => (x ? { ...x, x: e.clientX, y: e.clientY } : x));
  };
  const up = () => end(true);
  const cancel = () => end(false);
  const scroll = () => {   // keep a long plan reachable while dragging: scroll when the pointer is near the top or bottom edge
    const y = live.current.y, h = window.innerHeight;
    if (live.current.id) {
      if (y < 90) window.scrollBy(0, -14); else if (y > h - 150) window.scrollBy(0, 14);
      const t = where(0, y, live.current.id); if (t) { live.current.target = t; setTarget(t); }
      raf.current = requestAnimationFrame(scroll);
    }
  };
  const start = (e, s) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    live.current = { y: e.clientY, id: s.id, target: where(e.clientX, e.clientY, s.id) };
    setD({ id: s.id, title: s.title, x: e.clientX, y: e.clientY }); setTarget(live.current.target);
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel);
    raf.current = requestAnimationFrame(scroll);
  };
  useEffect(() => () => { cancelAnimationFrame(raf.current); }, []);
  const key = (e, s) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const hs = HORIZONS.map(([k]) => k);
    const col = steps.filter((x) => x.horizon === s.horizon);
    const i = col.findIndex((x) => x.id === s.id);
    let h = s.horizon, at = i;
    if (e.key === "ArrowUp") { if (i > 0) at = i - 1; else if (hs.indexOf(h) > 0) { h = hs[hs.indexOf(h) - 1]; at = 1e3; } else return; }
    else { if (i < col.length - 1) at = i + 1; else if (hs.indexOf(h) < hs.length - 1) { h = hs[hs.indexOf(h) + 1]; at = 0; } else return; }
    const next = moveStep(steps, s.id, h, at); if (next) onArrange(next);
  };
  const ghost = d ? <div aria-hidden data-testid="drag-ghost" className="pointer-events-none fixed z-50 max-w-[80vw] truncate rounded-xl border border-line bg-surface px-3.5 py-2 text-sm font-semibold shadow-xl" style={{ left: Math.min(d.x + 12, window.innerWidth - 40), top: d.y - 18 }}>{d.title}</div> : null;
  return { id: d ? d.id : null, target, zone, start, key, ghost };
}

function Plan({ dir, steps, log, decision, arranged, onStatus, onAdd, onRemove, onRestore, onArrange, hidden, onPickDirection, busy }) {
  const [text, setText] = useState("");
  const [hz, setHz] = useState("month");
  const drag = useDragSteps(steps, onArrange);
  const p = planProgress(steps);
  if (!dir && !steps.length) {
    return (
      <section data-testid="plan-step"><StepHead n={3} title="Your plan" sub="Your plan is built from the direction you pick." />
        <div className="card flex flex-wrap items-center justify-between gap-4"><p className="text-sm">Pick a direction first, and the steps appear here.</p>
          <button type="button" className={PRIMARY} style={ACCENT} onClick={onPickDirection}>See directions<ArrowRight className="h-4 w-4" aria-hidden /></button></div></section>
    );
  }
  const pct = p.total ? Math.round((100 * p.done) / p.total) : 0;
  return (
    <section data-testid="plan-step">
      <StepHead n={3} title="Your plan" sub={dir ? `For the direction you picked: ${dir.title.toLowerCase()}. Tap the circle to mark a step in progress, then done. Drag the grip to reorder or move a step.` : "These are the steps you have added so far. Pick a direction and we will build the rest around them."} />
      {decision && <p className="mb-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/[.06] px-4 py-3 text-sm" data-testid="plan-decision"><span className="mr-2 text-[11px] font-bold uppercase text-emerald-700 dark:text-emerald-300" style={{ letterSpacing: "0.1em" }}>Your decision</span>{decision.text}</p>}
      <div className="mb-6 card flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1" style={{ minWidth: "14rem" }}>
          <div className="flex items-baseline justify-between text-sm"><span className="font-semibold" data-testid="plan-progress">{p.done} of {p.total} steps done</span><span className="tabular-nums text-muted">{pct}%</span></div>
          <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-ink/10" role="img" aria-label={`${p.done} done, ${p.doing} in progress, ${p.total - p.done - p.doing} to do`}>
            <span className="bg-emerald-500" style={{ flexGrow: p.done }} /><span className="bg-amber-500" style={{ flexGrow: p.doing }} />
          </div>
        </div>
        <button type="button" onClick={onPickDirection} className="btn-ghost !py-2 text-sm" data-testid="plan-change">{dir ? "Change direction" : "Pick a direction"}</button>
      </div>
      <div className="space-y-8" data-testid="plan-board">
        {HORIZONS.map(([k, label]) => {
          const list = steps.filter((s) => s.horizon === k);
          let slot = -1;   // position among the rows that are not being dragged, to place the drop marker
          const marker = (i) => <li key={"m" + i} aria-hidden data-testid="drop-marker" className="mx-3 my-0.5 h-1 rounded-full" style={{ background: "var(--accent)" }} />;
          const over = drag.target && drag.target.horizon === k;
          return (
            <div key={k} data-testid={`hz-${k}`} data-zone={k} ref={(el) => drag.zone(k, el)}>
              <h3 className="mb-3 flex items-center gap-2 text-lg font-bold" style={{ ...heading }}>{label}<span className="text-sm font-normal text-muted">{list.length}</span></h3>
              {list.length === 0 && !drag.id ? (
                <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">Nothing here yet. Drag a step into this window.</p>
              ) : (
              <ul className={cx("card divide-y divide-line !p-0", over && list.filter((s) => s.id !== drag.id).length === 0 && "ring-2")} style={over && list.filter((s) => s.id !== drag.id).length === 0 ? { "--tw-ring-color": "var(--accent)" } : undefined}>
                {over && list.filter((s) => s.id !== drag.id).length === 0 && marker(0)}
                {list.length === 0 && !over && <li className="px-4 py-5 text-center text-sm text-muted">Drop it here</li>}
                {list.map((s) => {
                  const mine = drag.id === s.id;
                  if (!mine) slot += 1;
                  return (
                    <React.Fragment key={s.id}>
                      {over && !mine && drag.target.index === slot && marker(slot)}
                      <li data-step-id={s.id} className={cx("group flex items-start gap-2 p-4 pl-2 sm:gap-3", s.status === "done" && "bg-ink/[.025]", mine && "opacity-40")} data-testid={`step-row-${s.id}`}>
                        <button type="button" onPointerDown={(e) => drag.start(e, s)} onKeyDown={(e) => drag.key(e, s)} data-testid={`grip-${s.id}`} aria-label={`Move ${s.title}. Drag it, or use the up and down arrow keys.`} title="Drag to reorder or move to another window"
                          className="mt-0.5 flex h-6 w-6 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded text-ink/35 hover:bg-ink/5 hover:text-ink active:cursor-grabbing"><GripVertical className="h-5 w-5" aria-hidden /></button>
                        <StatusButton s={s.status} onChange={(v) => onStatus(s.id, v)} />
                        <div className="min-w-0 flex-1">
                          <p className={cx("text-[15px] font-semibold leading-snug", s.status === "done" && "text-muted line-through")}>{s.title}</p>
                          {s.why && <p className="mt-0.5 text-sm leading-snug text-muted">{s.why}</p>}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {s.status === "doing" && <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">In progress</span>}
                            {s.when && <span className="text-xs text-muted">{dayShort(s.when)}</span>}
                            {s.link && <Link to={s.link.to} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-semibold hover:bg-ink/5" data-testid={`step-link-${s.id}`}><KindTile kind={s.link.kind} size={18} />Open<ArrowRight className="h-3 w-3" aria-hidden /></Link>}
                          </div>
                        </div>
                        {s.kind !== "advisor" && <button type="button" onClick={() => onRemove(s.id)} aria-label={`Remove ${s.title}`} className="shrink-0 rounded-full p-1.5 text-muted opacity-60 hover:bg-ink/5 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"><X className="h-4 w-4" aria-hidden /></button>}
                      </li>
                    </React.Fragment>
                  );
                })}
                {over && list.filter((s) => s.id !== drag.id).length > 0 && drag.target.index >= slot + 1 && marker(slot + 1)}
              </ul>
              )}
            </div>
          );
        })}
      </div>
      {drag.ghost}
      <p className="mt-4 text-center text-xs text-muted">Drag the grip on any step to reorder it or move it to another window.{arranged && <> <button type="button" className="underline underline-offset-2" onClick={() => onArrange(null)} data-testid="reset-order">Reset order</button></>}</p>
      <form className="card mt-8 flex flex-wrap items-center gap-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onAdd(text.trim(), hz); setText(""); } }} data-testid="plan-add">
        <input className="input min-w-0 flex-1" style={{ minWidth: "12rem" }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a step of your own" aria-label="Add a step of your own" data-testid="plan-add-text" maxLength={140} />
        <select className="input !w-auto" value={hz} onChange={(e) => setHz(e.target.value)} aria-label="When">{HORIZONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button type="submit" className={PRIMARY} style={ACCENT} disabled={!text.trim() || busy} data-testid="plan-add-btn"><Plus className="h-4 w-4" aria-hidden />Add</button>
      </form>
      <ProgressLog log={log} />
      {hidden > 0 && <button type="button" className="mx-auto mt-4 block text-sm text-muted underline underline-offset-2" onClick={onRestore}>Bring back {hidden} step{hidden === 1 ? "" : "s"} you removed</button>}
    </section>
  );
}

// ---- log an update ----
// "Something happened." One tap on what it was, a line about it, and it updates the profile and the plan. Sits above the steps on every tab.
function UpdateBar({ startup, today, open, setOpen, onSave, busy, last }) {
  const [type, setType] = useState("");
  const [note, setNote] = useState("");
  const u = UPDATES.find((x) => x.key === type);
  let preview = null;
  if (u && (!u.need || note.trim())) { try { preview = applyUpdate({ type, note, startup, today }); } catch { preview = null; } }
  const close = () => { setOpen(false); setType(""); setNote(""); };
  const save = async () => { if (await onSave(applyUpdate({ type, note, startup, today }))) close(); };
  if (!open) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-x-4 gap-y-2 !p-3 sm:!px-5" data-testid="update-closed">
        <p className="min-w-0 text-sm"><span className="font-semibold">Something happened?</span> <span className="text-muted">{last ? `Last update: ${last.label.toLowerCase()}, ${dayShort(last.at)}.` : "Log a customer, funding, a snag. Your plan keeps up."}</span></p>
        <button type="button" className={cx(PRIMARY, "!px-5 !py-2.5")} style={ACCENT} onClick={() => setOpen(true)} data-testid="update-open"><Plus className="h-4 w-4" aria-hidden />Log an update</button>
      </div>
    );
  }
  return (
    <section className="card space-y-4" data-testid="update-form">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-lg font-bold" style={heading}>What happened?</h2><p className="text-sm text-muted">Pick one. Your profile, plan and matches update to match.</p></div>
        <button type="button" onClick={close} aria-label="Close" className="rounded-full p-1.5 text-muted hover:bg-ink/5"><X className="h-4 w-4" aria-hidden /></button>
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What happened">
        {UPDATES.map((x) => (
          <button key={x.key} type="button" role="radio" aria-checked={type === x.key} onClick={() => setType(x.key)} data-testid={`update-${x.key}`}
            className={cx("rounded-full border px-3.5 py-1.5 text-sm transition", type === x.key ? "border-transparent font-semibold" : "border-line text-muted hover:text-ink")} style={type === x.key ? ACCENT : undefined}>{x.label}</button>
        ))}
      </div>
      {u && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!busy && (!u.need || note.trim())) save(); }}>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">{u.ask}{!u.need && <span className="font-normal text-muted"> Optional.</span>}</span>
            <input className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} autoFocus data-testid="update-note" /></label>
          {preview && <p className="rounded-xl bg-ink/[.04] px-3.5 py-2.5 text-sm" data-testid="update-effects"><span className="font-semibold">This will: </span>{preview.effects.join(" ")}</p>}
          <button type="submit" className={PRIMARY} style={ACCENT} disabled={busy || (u.need && !note.trim())} data-testid="update-save">Save update<ArrowRight className="h-4 w-4" aria-hidden /></button>
        </form>
      )}
    </section>
  );
}

function ProgressLog({ log }) {
  if (!log.length) return null;
  return (
    <section className="mt-8" data-testid="progress-log">
      <h3 className="mb-3 flex items-center gap-2 text-lg font-bold" style={heading}>Progress so far<span className="text-sm font-normal text-muted">{log.length}</span></h3>
      <ol className="card divide-y divide-line !p-0">
        {log.slice(0, 6).map((l) => (
          <li key={l.id} className="flex gap-3.5 p-4" data-testid="log-row">
            <span className={cx("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white", l.type === "blocked" ? "bg-amber-500" : "bg-emerald-500")}><Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /></span>
            <div className="min-w-0 flex-1"><p className="text-[15px] font-semibold leading-snug">{l.label}{l.note ? <span className="font-normal">: {l.note}</span> : null}</p>
              {l.effects && l.effects.length > 0 && <p className="mt-0.5 text-sm text-muted">{l.effects.join(" ")}</p>}</div>
            <span className="shrink-0 text-xs text-muted">{dayShort(l.at)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---- 4. advisor brief ----
function Brief({ brief, plan, advisors, onInclude, onShare, onUnshare, busy }) {
  const [pick, setPick] = useState(advisors[0]?.id || "");
  useEffect(() => { if (!pick && advisors[0]) setPick(advisors[0].id); }, [advisors]); // eslint-disable-line react-hooks/exhaustive-deps
  const who = advisors.find((a) => a.id === pick);
  const shared = plan.shared;
  const copy = async () => {
    try { await navigator.clipboard.writeText(brief.text); toast.success("Copied. Paste it into an email or a doc."); onInclude(null); }
    catch { toast.error("Your browser would not copy it. Select the brief and copy it by hand."); }
  };
  return (
    <section data-testid="brief-step">
      <StepHead n={4} title="Your advisor brief" sub="One page that gets an advisor up to speed fast, with the questions worth their time. Tick what goes in. It stays private until you share it." />
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_21rem]">
        <article className="card space-y-6 !p-5 sm:!p-8" data-testid="brief-doc">
          <header className="border-b border-line pb-4">
            <Eyebrow>Advisor brief</Eyebrow>
            <h3 className="mt-1.5 text-2xl font-bold" style={{ ...heading, letterSpacing: "-0.025em" }}>{brief.title.replace(": advisor brief", "")}</h3>
          </header>
          {brief.sections.map((s) => (
            <section key={s.key} data-testid={`brief-${s.key}`} data-on={s.on ? "1" : "0"} className={cx(!s.on && "opacity-50")}>
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <h4 className="text-base font-bold" style={{ letterSpacing: "-0.01em" }}>{s.title}</h4>
                <button type="button" onClick={() => onInclude(s.key, !s.on)} aria-pressed={s.on} data-testid={`inc-${s.key}`} className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", s.on ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-line text-muted")}>
                  {s.on ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}{s.on ? "Included" : "Left out"}</button>
              </div>
              {s.rows && <dl className="space-y-2.5">{s.rows.map(([a, b]) => <div key={a} className="grid gap-x-4 gap-y-0.5 text-sm sm:grid-cols-[10rem_1fr]"><dt className="font-semibold text-muted">{a}</dt><dd className="leading-snug">{b}</dd></div>)}</dl>}
              {s.questions && (
                <ol className="space-y-3">{s.questions.map((q, i) => (
                  <li key={i} className="flex gap-3 text-sm"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink/10 text-xs font-bold">{i + 1}</span>
                    <span><span className="block font-medium leading-snug">{q.q}</span><span className="mt-0.5 block text-xs text-muted">{q.why}</span></span></li>))}</ol>
              )}
            </section>
          ))}
        </article>
        <aside className="space-y-4 lg:sticky lg:top-24">
          <div className="card space-y-3" data-testid="share-card">
            <div className="flex items-center gap-2"><Share2 className="h-4 w-4" aria-hidden /><h3 className="font-bold">Share with an advisor</h3></div>
            {shared ? (
              <div className="space-y-3" data-testid="shared-state">
                <p className="flex items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /><span>Shared with <b>{shared.name}</b>{shared.at ? ` on ${dayShort(shared.at)}` : ""}. They see only the sections you included.</span></p>
                <button type="button" className="btn-ghost w-full !py-2 text-sm" onClick={onUnshare} disabled={busy} data-testid="unshare">Stop sharing</button>
              </div>
            ) : (
              <>
                <p className="flex items-start gap-2 text-sm text-muted"><Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Private right now. Only you can see this brief.</p>
                {advisors.length > 0 ? (
                  <div className="space-y-1.5" role="radiogroup" aria-label="Choose an advisor">
                    {advisors.map((a) => (
                      <button key={a.id} type="button" role="radio" aria-checked={pick === a.id} onClick={() => setPick(a.id)} data-testid={`advisor-${a.id}`}
                        className={cx("flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition", pick === a.id ? "border-emerald-500/60 bg-emerald-500/10" : "border-line hover:bg-ink/5")}>
                        <Avatar src={a.avatar} name={a.title} size={32} /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{a.title}</span><span className="block truncate text-xs text-muted">{a.sub}</span></span>
                      </button>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted">No advisors to choose from yet. You can still copy the brief.</p>}
                <button type="button" className={cx(PRIMARY, "w-full")} style={ACCENT} disabled={!who || busy} onClick={() => onShare(who)} data-testid="share-btn"><Send className="h-4 w-4" aria-hidden />{who ? `Share with ${who.title.split(" ")[0]}` : "Share"}</button>
              </>
            )}
            <button type="button" className="btn-ghost flex w-full items-center justify-center gap-2 !py-2 text-sm" onClick={copy} data-testid="copy-brief"><Copy className="h-4 w-4" aria-hidden />Copy as text</button>
          </div>
          <p className="px-1 text-xs leading-snug text-muted">Sharing is your call. Leave out anything you would rather keep to yourself with the Included buttons, and stop sharing at any time.</p>
        </aside>
      </div>
    </section>
  );
}

// ---- the page ----
export default function Planner() {
  const { account, refresh } = useAuth();
  const eco = useEcosystem();
  const nav = useNavigate();
  const [qs, setQs] = useSearchParams();
  const [moves, setMoves] = useState(null);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  useEffect(() => { document.title = "My plan · Pathwai"; }, []);
  useEffect(() => {
    let live = true;
    api.get("/navigator/plan").then((r) => { if (live) setState(r.data); }).catch(() => live && setErr(true));
    api.get("/navigator/moves").then((r) => live && setMoves(r.data)).catch(() => live && setMoves({ lists: {}, as_of: "" }));
    return () => { live = false; };
  }, [account?.startup]); // eslint-disable-line react-hooks/exhaustive-deps

  const startup = useMemo(() => state?.startup || account?.startup || {}, [state, account?.startup]);
  const plan = useMemo(() => state?.plan || {}, [state]);
  const lists = moves?.lists || {};
  const today = state?.today || moves?.as_of || new Date().toISOString().slice(0, 10);
  const hub = eco?.hub || "";
  const dirs = useMemo(() => directions({ startup, lists, hub }), [startup, moves]); // eslint-disable-line react-hooks/exhaustive-deps
  const steps = useMemo(() => buildPlan({ direction: plan.direction, lists, plan, today }), [plan, moves, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const states = useMemo(() => stepStates({ startup, plan, steps }), [startup, plan, steps]);
  const dir = dirs.find((d) => d.key === plan.direction) || null;
  const brief = useMemo(() => advisorBrief({ startup, direction: plan.direction, lists, plan, steps, today, hub }), [startup, plan, steps, moves, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const advisors = useMemo(() => (lists.person || []).filter((m) => !/founder/i.test(m.type || "") && m.verdict !== "no").slice(0, 4), [moves]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = qs.get("step") || (states.find((s) => s.current) || states[0]).key;
  const go = useCallback((k) => { setQs({ step: k }, { replace: false }); window.scrollTo({ top: 0, behavior: "smooth" }); }, [setQs]);
  const post = async (body, okText) => {
    setBusy(true);
    try { const r = await api.post("/navigator/plan", body); setState((s) => ({ ...s, ...r.data })); if (okText) toast.success(okText); return true; }
    catch (e) { toast.error(errMsg(e)); return false; } finally { setBusy(false); }
  };
  const saveStory = async (next) => {
    setBusy(true);
    try { await api.patch("/hub/profile", { startup: next }); await refresh(); toast.success("Saved"); go("directions"); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const [updating, setUpdating] = useState(qs.get("update") === "1");
  const logUpdate = async ({ startup: next, body, effects }) => {
    setBusy(true);
    try {
      if (next) { await api.patch("/hub/profile", { startup: next }); await refresh(); }
      const r = await api.post("/navigator/plan", body);
      setState((x) => ({ ...x, ...r.data, startup: next || x.startup }));
      toast.success("Saved. " + effects[0]);
      return true;
    } catch (e) { toast.error(errMsg(e)); return false; } finally { setBusy(false); }
  };
  const choose = async (key) => { if (await post({ direction: key, ...(plan.decision && plan.decision.direction !== key ? { decision: null } : {}) })) go("plan"); };
  const arrange = async (next) => {
    setState((x) => ({ ...x, plan: { ...x.plan, arrange: next || [] } }));   // show it at once, then save
    try { const r = await api.post("/navigator/plan", { arrange: next || [] }); setState((x) => ({ ...x, ...r.data })); }
    catch (e) { toast.error(errMsg(e)); api.get("/navigator/plan").then((r) => setState(r.data)).catch(() => {}); }
  };
  const useDecision = async (r) => { if (await post({ decision: { text: r.text, direction: r.direction, at: today, steps: r.ownSteps } }, "Plan built from your decision")) go("plan"); };

  if (err) return <p className="card text-sm text-muted">Your planner could not load. Please try again in a moment.</p>;
  if (!state || !moves) return <Spinner />;
  const first = (account?.name || "").split(/\s+/)[0];
  return (
    <div className="mx-auto max-w-6xl space-y-7" data-testid="planner">
      <header>
        <Eyebrow>My plan{hub ? ` · ${hub}` : ""}</Eyebrow>
        <h1 className="mt-2 text-3xl sm:text-4xl" style={{ ...heading, letterSpacing: "-0.03em", textWrap: "balance" }}>{first ? `${first}, ` : ""}get ready for your advisor</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">Work out where you are and where to go, then walk into the conversation knowing what to ask. Everything here is yours.</p>
      </header>
      <UpdateBar startup={startup} today={today} open={updating} setOpen={setUpdating} onSave={logUpdate} busy={busy} last={(plan.log || [])[0]} />
      <Stepper states={states} step={step} onGo={go} />
      {step === "story" && <Story key={JSON.stringify(startup).length} startup={startup} onSave={saveStory} busy={busy} />}
      {step === "directions" && (startup.stage ? <Directions list={dirs} chosen={plan.direction} onChoose={choose} busy={busy} hub={hub} decideProps={{ startup, lists, hub, today, saved: plan.decision, onUse: useDecision }} />
        : <div className="card flex flex-wrap items-center justify-between gap-4"><p className="text-sm">Tell us about your startup first, so the directions fit you.</p><button type="button" className={PRIMARY} style={ACCENT} onClick={() => go("story")}>Start with your story</button></div>)}
      {step === "plan" && <Plan dir={dir} steps={steps} log={plan.log || []} decision={plan.decision} arranged={(plan.arrange || []).length > 0} onArrange={arrange} hidden={(plan.hidden || []).length} busy={busy} onPickDirection={() => go("directions")}
        onStatus={(id, status) => post({ status: { id, status } })} onAdd={(title, horizon) => post({ add: { title, horizon } })} onRemove={(id) => post({ remove: id })} onRestore={() => post({ restore: true })} />}
      {step === "brief" && <Brief brief={brief} plan={plan} advisors={advisors} busy={busy}
        onInclude={(k, v) => (k ? post({ include: { [k]: v } }) : post({ brief_ready: true }))}
        onShare={(a) => post({ share: { id: a.id, name: a.title, title: a.sub } }, `Shared with ${a.title}`)} onUnshare={() => post({ share: null }, "Sharing stopped")} />}
      {step === "plan" && dir && (
        <div className="flex justify-end"><button type="button" className={PRIMARY} style={ACCENT} onClick={() => go("brief")} data-testid="to-brief">Prepare my advisor brief<ArrowRight className="h-4 w-4" aria-hidden /></button></div>
      )}
      <p className="sr-only" aria-live="polite">{busy ? "Saving" : ""}</p>
    </div>
  );
}
