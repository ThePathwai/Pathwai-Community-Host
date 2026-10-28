import React, { useEffect, useState } from "react";
import { Check, ChevronDown, MapPin, Plus, X } from "lucide-react";
import { STAGE_LABEL, STATUS_HELP, STATUS_LABEL } from "../lib/navigator";
import { TypeTile } from "./ProgramCards";
import { cx } from "./ui";

// "Your trajectory": the five stages of a company as a route you can step along. Only one stage is open at a time, and it starts on
// the stage you are at, so the page leads with what to do now. Past stages keep your history (programs you were part of) out of the
// way until you open them; later stages only preview what opens up.

const STATE_TEXT = { past: "Behind you", current: "You are here", future: "Ahead" };
const DOT = { open: "#34D399", rolling: "#34D399", check: "#FBBF24", closed: "#94A3B8", paused: "#94A3B8" };
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const ink = (a) => `rgb(var(--c-ink) / ${a})`;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

function Node({ state, n, selected }) {
  const ring = selected ? { boxShadow: `0 0 0 3px rgb(var(--c-surface)), 0 0 0 5px ${ink(0.5)}` } : undefined;
  if (state === "current") {
    return <span className="pw-pulse relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }} data-testid="traj-here"><MapPin className="h-[18px] w-[18px]" aria-hidden /></span>;
  }
  if (state === "past") {
    return <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: ink(0.78), color: "rgb(var(--c-surface))", ...ring }}><Check className="h-4 w-4" strokeWidth={3} aria-hidden /></span>;
  }
  return <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed text-xs font-bold text-muted" style={{ borderColor: ink(0.35), background: "rgb(var(--c-surface))", ...ring }}>{n}</span>;
}

function StatusLine({ status }) {
  return <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted" title={STATUS_HELP[status]}><span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[status] || DOT.check }} aria-hidden />{STATUS_LABEL[status] || status}</span>;
}

function Mini({ r, onPick, muted }) {
  return (
    <button type="button" onClick={() => onPick && onPick(r)} data-testid={`traj-prog-${r.id}`}
      className={cx("flex w-full items-start gap-2.5 rounded-xl border border-line bg-surface p-2.5 text-left transition hover:border-ink/40", muted && "opacity-80 hover:opacity-100")}>
      <TypeTile type={r.type} size={32} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-sm font-semibold leading-snug">{r.name}</span>
        {r.note ? <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{r.note}</span> : null}
        <StatusLine status={r.status} />
      </span>
    </button>
  );
}

function Grid({ rows, onPick, muted }) {
  return <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-[repeat(2,minmax(0,1fr))]">{rows.map((r) => <li key={r.id}><Mini r={r} onPick={onPick} muted={muted} /></li>)}</ul>;
}

// One program the founder has marked: in it now, or done at some stage.
function Mine({ t, onTrack }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface p-2.5" data-testid={`traj-mine-${t.id}`}>
      <TypeTile type={t.type} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{t.name}</span>
        <span className="block text-xs text-muted">{t.state === "in" ? "You're in this now" : `Done at ${STAGE_LABEL[t.stage] || t.stage}`}</span>
      </span>
      {t.state === "in" && <button type="button" onClick={() => onTrack({ ...t, state: "done" })} className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold hover:border-ink/40" data-testid={`traj-done-${t.id}`}>Mark done</button>}
      <button type="button" onClick={() => onTrack({ id: t.id, state: "none" })} className="shrink-0 rounded-lg p-1.5 text-muted hover:text-ink" aria-label={`Remove ${t.name}`}><X className="h-4 w-4" aria-hidden /></button>
    </div>
  );
}

function AddDone({ stage, onTrack }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (name.trim().length < 2 || busy) return;
    setBusy(true);
    const ok = await onTrack({ name: name.trim(), state: "done", stage });
    setBusy(false);
    if (ok) setName("");
  };
  return (
    <form onSubmit={submit} className="flex gap-2" data-testid={`traj-add-${stage}`}>
      <input className="input !py-2 text-sm" placeholder="Add a program or cohort you were part of" value={name} onChange={(e) => setName(e.target.value)} aria-label={`Add a program you did at ${STAGE_LABEL[stage]}`} maxLength={120} />
      <button type="submit" className="btn-ghost !px-3 !py-2 text-sm" disabled={busy || name.trim().length < 2}><Plus className="h-4 w-4" aria-hidden /><span className="sr-only">Add</span></button>
    </form>
  );
}

function Heading({ state, label, hint }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{STATE_TEXT[state]}</p>
      <p className="mt-0.5 text-xl font-bold leading-tight">{cap(label)}</p>
      <p className="mt-0.5 text-sm text-muted">{hint}</p>
    </div>
  );
}

function Panel({ c, tracked, onPick, onTrack }) {
  const all = tracked || [];
  const ids = new Set(all.map((t) => t.id));
  if (c.state === "current") {
    const inNow = all.filter((t) => t.state === "in");
    const rows = c.programs.filter((r) => !ids.has(r.id));
    const more = Math.max(0, c.available - c.programs.length);
    return (
      <div data-testid="traj-panel-current">
        <Heading state="current" label={c.label} hint={c.hint} />
        {inNow.length > 0 && <div className="mb-5"><p className="eyebrow mb-2">You're in</p><div className="space-y-2">{inNow.map((t) => <Mine key={t.id} t={t} onTrack={onTrack} />)}</div></div>}
        <p className="eyebrow mb-2">Worth your time right now</p>
        {rows.length ? <Grid rows={rows} onPick={onPick} /> : <p className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">Nothing stage-specific fits you right now. The any-stage list below still applies.</p>}
        {more > 0 && <p className="mt-2 text-xs text-muted">{more} more for this stage are in the full list below.</p>}
      </div>
    );
  }
  if (c.state === "past") {
    const mine = all.filter((t) => t.state === "done" && t.stage === c.stage);
    return (
      <div data-testid="traj-panel-past">
        <Heading state="past" label={c.label} hint="Your history at this stage. It stays here, out of the way." />
        {mine.length > 0 ? <div className="mb-3 space-y-2">{mine.map((t) => <Mine key={t.id} t={t} onTrack={onTrack} />)}</div> : <p className="mb-3 rounded-xl border border-dashed border-line p-3 text-sm text-muted">Nothing tracked at this stage yet.</p>}
        <AddDone stage={c.stage} onTrack={onTrack} />
        {c.programs.length > 0 && (
          <details className="group mt-4">
            <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">Programs aimed at this stage<ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden /></summary>
            <div className="mt-3"><Grid rows={c.programs.filter((r) => !ids.has(r.id))} onPick={onPick} muted /></div>
          </details>
        )}
      </div>
    );
  }
  return (
    <div data-testid="traj-panel-future">
      <Heading state="future" label={c.label} hint="Just a preview. Nothing here needs your attention yet." />
      {c.programs.length ? <><p className="eyebrow mb-2">Opens up here</p><Grid rows={c.programs} onPick={onPick} muted /></> : <p className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">Nothing new opens up at this stage. What already fits you keeps working.</p>}
    </div>
  );
}

// Programs that are not tied to a stage: they apply now and later, so they sit under the route, closed until you want them.
function AnyStage({ data, onPick }) {
  const list = data.anytime || [];
  if (!list.length) return null;
  const total = data.anytime_total || list.length;
  return (
    <details className="group mt-4 rounded-2xl border border-line" data-testid="traj-anytime">
      <summary className="flex cursor-pointer items-center justify-between gap-3 p-4">
        <span><span className="block text-sm font-bold">Also useful at any stage</span><span className="block text-xs text-muted">{plural(total, "program")} that are not tied to a stage</span></span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-line p-4"><Grid rows={list} onPick={onPick} />{total > list.length && <p className="mt-2 text-xs text-muted">+{total - list.length} more in the full list below.</p>}</div>
    </details>
  );
}

function Stepper({ stages, sel, onSel, tracked }) {
  return (
    <ol className="grid grid-cols-5" role="tablist" aria-label="Stages" data-testid="traj-stepper">
      {stages.map((c, i) => {
        const done = (tracked || []).filter((t) => t.state === "done" && t.stage === c.stage).length;
        const on = sel === i;
        return (
          <li key={c.stage} className="relative">
            {i < stages.length - 1 && <span className="absolute top-5 h-0 border-t-2" style={{ left: "calc(50% + 22px)", right: "calc(-50% + 22px)", borderTopStyle: c.state === "past" ? "solid" : "dashed", borderColor: c.state === "past" ? ink(0.55) : ink(0.28) }} aria-hidden />}
            <button type="button" role="tab" aria-selected={on} onClick={() => onSel(i)} data-testid={`traj-stage-${c.stage}`}
              className={cx("flex w-full flex-col items-center gap-1 rounded-xl px-1 pb-2 pt-0 text-center transition", on ? "" : "opacity-80 hover:opacity-100")}>
              <span className="flex h-10 items-center"><Node state={c.state} n={i + 1} selected={on && c.state !== "current"} /></span>
              <span className={cx("text-[10px] font-semibold uppercase leading-tight", c.state === "current" ? "text-ink" : "text-muted")} style={{ letterSpacing: "0.08em" }}>{c.state === "current" ? "You are here" : c.state === "past" ? "Behind" : "Ahead"}</span>
              <span className={cx("text-xs font-bold leading-tight sm:text-sm", on ? "text-ink" : "text-ink/70")}>{cap(c.label)}</span>
              {c.state === "past" && done > 0 && <span className="text-[10px] text-muted">{done} done</span>}
              <span className="h-0.5 w-8 rounded-full" style={{ background: on ? "var(--accent)" : "transparent" }} aria-hidden />
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// The small version for Home: a vertical list, the current stage open with two programs, everything else one line.
function Compact({ data, tracked, onPick }) {
  const stages = data.stages;
  return (
    <ol data-testid="traj-compact">
      {stages.map((c, i) => {
        const done = (tracked || []).filter((t) => t.state === "done" && t.stage === c.stage).length;
        const nowIn = c.state === "current" ? (tracked || []).filter((t) => t.state === "in") : [];
        return (
          <li key={c.stage} className="relative pb-5 pl-12 last:pb-0" data-testid={`traj-stage-${c.stage}`}>
            {i < stages.length - 1 && <span className="absolute bottom-0 left-[19px] top-9 border-l-2" style={{ borderLeftStyle: c.state === "past" ? "solid" : "dashed", borderColor: c.state === "past" ? ink(0.55) : ink(0.28) }} aria-hidden />}
            <span className="absolute left-0 top-0 flex w-10 justify-center"><Node state={c.state} n={i + 1} /></span>
            <div className="flex min-h-[40px] flex-col justify-center">
              <span className="block text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{STATE_TEXT[c.state]}</span>
              <span className="text-base font-bold leading-tight">{cap(c.label)}</span>
            </div>
            {c.state === "current" ? (
              <ul className="mt-2 space-y-2">
                {nowIn.map((t) => <li key={t.id} className="rounded-xl border border-line bg-surface p-2.5 text-sm"><span className="font-semibold">{t.name}</span><span className="block text-xs text-muted">You're in this now</span></li>)}
                {c.programs.filter((r) => !nowIn.some((t) => t.id === r.id)).slice(0, 2).map((r) => <li key={r.id}><Mini r={{ ...r, note: "" }} onPick={onPick} /></li>)}
              </ul>
            ) : c.state === "past" ? (
              <p className="mt-0.5 text-xs text-muted">{done ? `${done} you've done` : "History tucked away"}</p>
            ) : (
              <p className="mt-0.5 text-xs text-muted">{c.available ? `${plural(c.available, "program")} open up` : "Nothing new opens up"}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function Trajectory({ data, tracked = [], onPick, onTrack, compact }) {
  const [sel, setSel] = useState(data ? data.index : 0);
  useEffect(() => { if (data) setSel(data.index); }, [data && data.index]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data || !data.stages || !data.stages.length) return null;
  if (compact) {
    return (
      <>
        <Compact data={data} tracked={tracked} onPick={onPick} />
        {data.anytime_total > 0 && <p className="mt-4 border-t border-line pt-3 text-xs text-muted" data-testid="traj-anytime-compact">{plural(data.anytime_total, "more program")} apply at any stage.</p>}
      </>
    );
  }
  const c = data.stages[sel] || data.stages[data.index];
  const track = onTrack || (async () => false);
  return (
    <div data-testid="trajectory">
      <Stepper stages={data.stages} sel={sel} onSel={setSel} tracked={tracked} />
      <div className={cx("mt-3 rounded-2xl border p-4 sm:p-5", c.state === "current" ? "" : "border-line")} style={c.state === "current" ? { borderColor: "var(--accent)", background: ink(0.03) } : undefined} role="tabpanel">
        <Panel c={c} tracked={tracked} onPick={onPick} onTrack={track} />
      </div>
      <AnyStage data={data} onPick={onPick} />
    </div>
  );
}
