import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Check, ChevronDown, CircleCheck, Flag, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useJourney } from "../lib/useJourney";
import { JOURNEY_STATUS_LABEL } from "../lib/journey";
import { daysUntil, todayIso } from "../lib/navigator";
import { Ring } from "../components/NavBits";
import AccountShell from "../components/AccountShell";
import { Spinner, cx } from "../components/ui";

// Journey: your own plan for building the startup. Milestones are filed under the five stages. Add your own, take suggestions (each one says
// why it is there), tick them off, and watch the count. When most of a stage is done, it offers the next stage.

const dayName = (iso) => { try { return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return iso; } };

export function DueChip({ due, done }) {
  if (!due) return null;
  const d = daysUntil(due, todayIso());
  const late = !done && d !== null && d < 0;
  const soon = !done && d !== null && d >= 0 && d <= 7;
  const text = done ? `Was due ${dayName(due)}` : late ? `${-d} day${d === -1 ? "" : "s"} overdue` : d === 0 ? "Due today" : soon ? `Due in ${d} day${d === 1 ? "" : "s"}` : `Due ${dayName(due)}`;
  return <span className={cx("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold", late ? "bg-red-500/15 text-red-500" : soon ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-ink/10 text-muted")} data-testid="due-chip">{text}</span>;
}

// The round control on the left of a milestone: tap to finish it, tap again to take it back.
function Tick({ status, onToggle, label }) {
  const done = status === "done";
  return (
    <button type="button" onClick={onToggle} aria-pressed={done} aria-label={done ? `Mark "${label}" as not done` : `Mark "${label}" as done`} data-testid="journey-tick"
      className={cx("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition", done ? "border-transparent" : status === "doing" ? "border-amber-500" : "border-ink/30 hover:border-ink/60")}
      style={done ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>
      {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : status === "doing" ? <span className="h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden /> : null}
    </button>
  );
}

function Row({ m, act, stages }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(m.note || "");
  useEffect(() => setNote(m.note || ""), [m.note]);
  const done = m.status === "done";
  const set = (patch) => act({ op: "update", id: m.id, ...patch });
  return (
    <li className="rounded-2xl border border-line bg-surface" data-testid={`milestone-${m.id}`} data-status={m.status}>
      <div className="flex items-start gap-3 p-3.5">
        <Tick status={m.status} label={m.title} onToggle={() => set({ status: done ? "todo" : "done" })} />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start justify-between gap-2 text-left">
            <span className={cx("min-w-0 text-[15px] font-medium leading-snug", done && "text-muted line-through")}>{m.title}</span>
            <ChevronDown className={cx("mt-1 h-4 w-4 shrink-0 text-muted transition", open && "rotate-180")} aria-hidden />
          </button>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {m.status === "doing" && <span className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">In progress</span>}
            <DueChip due={m.due} done={done} />
            {m.program_id && !m.title.includes(m.program_name || "\u0000") && <Link to="/navigator" className="inline-flex items-center gap-1 text-xs font-medium text-muted underline hover:text-ink">{m.program_name || "Program"}</Link>}
            {m.status === "todo" && <button type="button" onClick={() => set({ status: "doing" })} className="text-xs font-semibold text-muted underline hover:text-ink" data-testid="journey-start">Start</button>}
            {m.note && !open && <span className="min-w-0 truncate text-xs text-muted">{m.note}</span>}
          </div>
          {open && (
            <div className="mt-3 space-y-3 border-t border-line pt-3" data-testid="journey-editor">
              <div className="flex flex-wrap items-center gap-2">
                {["todo", "doing", "done"].map((s) => <button key={s} type="button" onClick={() => set({ status: s })} aria-pressed={m.status === s} className={cx("rounded-full border px-3 py-1 text-xs font-semibold transition", m.status === s ? "border-transparent" : "border-line hover:border-ink/40")} style={m.status === s ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{JOURNEY_STATUS_LABEL[s]}</button>)}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-muted">Due date<input type="date" defaultValue={m.due || ""} onChange={(e) => set({ due: e.target.value })} className="mt-1 block w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm font-normal text-ink" data-testid="journey-due" /></label>
                <label className="block text-xs font-semibold text-muted">Stage<select value={m.stage} onChange={(e) => set({ stage: e.target.value })} className="mt-1 block w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm font-normal text-ink">{stages.map((s) => <option key={s.stage} value={s.stage}>{s.name}</option>)}</select></label>
              </div>
              <label className="block text-xs font-semibold text-muted">Note<textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (m.note || "") && set({ note })} rows={2} maxLength={500} placeholder="What you did, who you spoke to, what is next" className="mt-1 block w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm font-normal text-ink" data-testid="journey-note" /></label>
              <button type="button" onClick={() => act({ op: "remove", id: m.id })} className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:underline" data-testid="journey-remove"><Trash2 className="h-3.5 w-3.5" aria-hidden />Remove from my plan</button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Suggestion({ s, onAdd }) {
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-dashed border-line p-3.5" data-testid={`suggest-${s.key}`}>
      <button type="button" onClick={() => onAdd(s)} aria-label={`Add "${s.title}" to my plan`} data-testid="journey-add-suggestion" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink/30 text-muted transition hover:border-ink/60 hover:text-ink"><Plus className="h-3.5 w-3.5" aria-hidden /></button>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium leading-snug">{s.title}</p>
        <p className="mt-0.5 text-sm text-muted">{s.why}</p>
        {s.due && <div className="mt-1.5"><DueChip due={s.due} /></div>}
      </div>
    </li>
  );
}

function Panel({ stage, current, items, suggestions, act, stages }) {
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [more, setMore] = useState(false);
  const open = items.filter((m) => m.status !== "done").sort((a, b) => (a.status === "doing" ? 0 : 1) - (b.status === "doing" ? 0 : 1) || (a.due && b.due ? (a.due < b.due ? -1 : 1) : a.due ? -1 : b.due ? 1 : 0));
  const done = items.filter((m) => m.status === "done");
  const addOne = async (e) => { e.preventDefault(); if (text.trim().length < 2) return; if (await act({ op: "add", title: text, stage: stage.stage, due })) { setText(""); setDue(""); } };
  const addSuggestion = (s) => act({ op: "add", title: s.title, stage: s.stage, key: s.key, due: s.due || "", program_id: s.program_id || "", program_name: s.program_name || "" });
  const seed = () => act({ op: "add_many", items: suggestions.slice(0, 6).map((s) => ({ title: s.title, stage: s.stage, key: s.key, due: s.due || "", program_id: s.program_id || "", program_name: s.program_name || "" })) });
  const shown = more ? suggestions : suggestions.slice(0, 4);
  const empty = items.length === 0;
  const verb = stage.stage === current ? "right now" : stage.index < stages.findIndex((s) => s.stage === current) ? "behind you" : "ahead of you";
  return (
    <div data-testid={`journey-panel-${stage.stage}`}>
      <p className="text-sm text-muted">{stage.hint}. {stage.stage === current ? "This is where you are." : `This stage is ${verb}.`}</p>
      {empty && suggestions.length > 0 && (
        <div className="mt-4 rounded-2xl p-4" style={{ background: "rgb(var(--c-ink) / 0.05)" }} data-testid="journey-empty">
          <p className="font-semibold">{stage.stage === current ? "Start with a plan for this stage" : "Nothing planned for this stage yet"}</p>
          <p className="mt-1 text-sm text-muted">{stage.stage === current ? "These are the milestones that matter most, plus programs you can apply to now. Keep what fits, change or remove the rest." : "Add what you want to get done here, or take a suggestion below."}</p>
          {stage.stage === current && <button type="button" onClick={seed} className="btn-primary mt-3 !py-2.5" data-testid="journey-seed">Use this plan<ArrowRight className="h-4 w-4" aria-hidden /></button>}
        </div>
      )}
      {!empty && <ul className="mt-4 space-y-2.5">{open.map((m) => <Row key={m.id} m={m} act={act} stages={stages} />)}</ul>}
      {done.length > 0 && <div className="mt-4"><p className="eyebrow mb-2">Done · {done.length}</p><ul className="space-y-2.5">{done.map((m) => <Row key={m.id} m={m} act={act} stages={stages} />)}</ul></div>}
      <form onSubmit={addOne} className="mt-4 flex flex-wrap gap-2" data-testid="journey-add-form">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={120} placeholder={`Add a milestone for ${stage.name}`} aria-label="New milestone" className="min-w-0 flex-1 basis-56 rounded-xl border border-line bg-transparent px-3.5 py-2.5 text-sm" data-testid="journey-new" />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className="rounded-xl border border-line bg-transparent px-3 py-2.5 text-sm" />
        <button type="submit" className="btn-ghost !py-2.5" disabled={text.trim().length < 2}><Plus className="h-4 w-4" aria-hidden />Add</button>
      </form>
      {suggestions.length > 0 && !empty && (
        <div className="mt-8" data-testid="journey-suggestions">
          <p className="eyebrow">Suggested for you · {suggestions.length}</p>
          <p className="mb-3 mt-1 text-xs text-muted">Each one says why it is here. Tap + to add it to your plan.</p>
          <ul className="space-y-2.5">{shown.map((s) => <Suggestion key={s.key} s={s} onAdd={addSuggestion} />)}</ul>
          {suggestions.length > 4 && <button type="button" onClick={() => setMore((v) => !v)} className="mt-3 text-sm font-semibold text-muted underline hover:text-ink">{more ? "Show fewer" : `Show ${suggestions.length - 4} more`}</button>}
        </div>
      )}
      {empty && suggestions.length > 0 && stage.stage !== current && <ul className="mt-4 space-y-2.5">{shown.map((s) => <Suggestion key={s.key} s={s} onAdd={addSuggestion} />)}</ul>}
    </div>
  );
}

function Recent({ rows, className }) {
  if (!rows.length) return null;
  return (
    <section className={cx("rounded-3xl border border-line bg-surface p-5", className)} data-testid="journey-recent">
      <h2 className="text-lg" style={{ textTransform: "none", letterSpacing: "-0.01em", fontWeight: 700 }}>Recently finished</h2>
      <ul className="mt-3 space-y-2.5">{rows.map((r) => <li key={r.id} className="flex items-start gap-2.5 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /><span className="min-w-0 flex-1">{r.title}</span><span className="shrink-0 text-xs text-muted">{r.done_at ? dayName(r.done_at) : ""}</span></li>)}</ul>
    </section>
  );
}

function NextUp({ rows, act, onOpenStage }) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-5" data-testid="journey-next">
      <h2 className="text-lg" style={{ textTransform: "none", letterSpacing: "-0.01em", fontWeight: 700 }}>Next up</h2>
      {rows.length ? (
        <ul className="mt-3 space-y-3">
          {rows.map((m) => (
            <li key={m.id} className="flex items-start gap-3" data-testid={`next-${m.id}`}>
              <Tick status={m.status} label={m.title} onToggle={() => act({ op: "update", id: m.id, status: "done" })} />
              <button type="button" onClick={() => onOpenStage(m.stage)} className="min-w-0 flex-1 text-left">
                <span className="block text-sm font-medium leading-snug">{m.title}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2"><DueChip due={m.due} />{m.status === "doing" && <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">In progress</span>}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-sm text-muted">Nothing waiting. Add a milestone, or take a suggestion.</p>}
    </section>
  );
}

export default function Journey({ embedded }) {
  const { account, loading, refresh } = useAuth();
  const { data, error, act, load } = useJourney(!!account);
  const [stage, setStage] = useState(null);
  const [hideReady, setHideReady] = useState(false);
  useEffect(() => { document.title = "Journey · Pathwai"; }, []);
  const current = data?.current;
  useEffect(() => { if (current && !stage) setStage(current); }, [current, stage]);
  const stages = useMemo(() => (data?.stages || []).map((s, index) => ({ ...s, index })), [data]);

  if (loading) return <Spinner />;
  if (!account) return <Navigate to="/login" replace />;

  const move = async () => {
    try {
      await api.patch("/hub/profile", { startup: { ...(account.startup || {}), stage: data.summary.ready.to } });
      await refresh();
      await load();
      setStage(data.summary.ready.to);
      toast.success(`You are now at the ${data.summary.ready.to_name} stage`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not move you to the next stage."); }
  };

  let body;
  if (!data) body = error ? <p className="rounded-xl border border-red-500/40 p-3 text-sm text-red-500" role="alert">{error}</p> : <Spinner />;
  else if (!data.has_profile) {
    body = (
      <div className="rounded-3xl border border-dashed border-line p-8 text-center" data-testid="journey-no-profile">
        <Flag className="mx-auto h-6 w-6 text-muted" aria-hidden />
        <p className="mt-3 text-lg font-semibold">Tell us where your startup is first</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">Your journey is built around your stage and what you need. It takes a minute in your profile.</p>
        <Link to="/me?edit=startup" className="btn-primary mt-5 inline-flex">Add your startup<ArrowRight className="h-4 w-4" aria-hidden /></Link>
      </div>
    );
  } else {
    const s = data.summary;
    const sel = stages.find((x) => x.stage === (stage || current)) || stages[0];
    const by = Object.fromEntries(s.stages.map((x) => [x.stage, x]));
    body = (
      <div className="space-y-6">
        {error && <p className="rounded-xl border border-red-500/40 p-3 text-sm text-red-500" role="alert">{error}</p>}
        {s.ready && !hideReady && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl p-4" style={{ background: "var(--accent)", color: "var(--on-accent)" }} data-testid="journey-ready">
            <CircleCheck className="h-6 w-6 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1 text-sm font-medium"><span className="font-bold">Ready for {s.ready.to_name}?</span> {s.ready.text}</p>
            <button type="button" onClick={move} className="rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-black" data-testid="journey-advance">Move to {s.ready.to_name}</button>
            <button type="button" onClick={() => setHideReady(true)} className="text-sm font-semibold underline opacity-90">Not yet</button>
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="order-2 min-w-0 lg:order-1">
            <div role="tablist" aria-label="Stages" className="mb-5 grid grid-cols-5 gap-1.5">
              {stages.map((st) => {
                const c = by[st.stage]; const on = st.stage === sel.stage; const here = st.stage === s.current;
                return (
                  <button key={st.stage} type="button" role="tab" aria-selected={on} onClick={() => setStage(st.stage)} data-testid={`journey-stage-${st.stage}`}
                    className={cx("min-w-0 rounded-xl border px-0.5 py-2.5 text-center transition sm:px-3", on ? "border-ink/40 bg-ink/[.06]" : "border-line hover:border-ink/30")}>
                    <span className="block text-[11px] font-semibold sm:text-sm">{st.name}</span>
                    <span className="mt-0.5 block text-[11px] tabular-nums text-muted">{c.total ? `${c.done}/${c.total}` : "–"}</span>
                    <span className="mx-auto mt-1.5 block h-1 w-full max-w-[56px] overflow-hidden rounded-full bg-ink/10" aria-hidden><span className="block h-full rounded-full" style={{ width: `${c.total ? (100 * c.done) / c.total : 0}%`, background: "var(--accent)" }} /></span>
                    {here && <span className="mt-1 block text-[10px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.1em" }}>You are here</span>}
                  </button>
                );
              })}
            </div>
            <Panel key={sel.stage} stage={sel} current={s.current} stages={stages} act={act} items={data.milestones.filter((m) => m.stage === sel.stage)} suggestions={data.suggestions[sel.stage] || []} />
          </div>
          <aside className="order-1 min-w-0 space-y-4 lg:order-2">
            <section className="flex items-center gap-4 rounded-3xl border border-line bg-surface p-5" data-testid="journey-progress">
              <Ring percent={s.percent} size={64} />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{s.total ? `${s.done} of ${s.total} milestones done` : "No milestones yet"}</p>
                <p className="text-xs text-muted">{s.total ? [s.done_this_week ? `${s.done_this_week} finished this week` : "None finished this week", s.overdue ? `${s.overdue} overdue` : ""].filter(Boolean).join(" · ") : "Add one, or use the suggested plan."}</p>
              </div>
            </section>
            <NextUp rows={s.next_up} act={act} onOpenStage={setStage} />
            <Recent rows={s.recent} className="hidden lg:block" />
          </aside>
          <Recent rows={s.recent} className="order-3 lg:hidden" />
        </div>
      </div>
    );
  }

  const page = (
    <div className="mx-auto w-full max-w-6xl" data-testid="journey-page">
      <div className="mb-6">
        <p className="eyebrow">Journey</p>
        <h1 className="mt-2 text-3xl sm:text-4xl" style={{ textTransform: "none", letterSpacing: "-0.03em", fontWeight: 800, textWrap: "balance" }}>{account.startup?.name ? `${account.startup.name}'s journey` : "Your startup journey"}</h1>
        <p className="mt-2 text-sm text-muted">Plan what you will do at each stage, and tick it off as you go. Programs you apply to and the stage you are at stay in step with your profile.</p>
      </div>
      {body}
    </div>
  );
  return embedded ? page : <AccountShell active="journey">{page}</AccountShell>;
}
