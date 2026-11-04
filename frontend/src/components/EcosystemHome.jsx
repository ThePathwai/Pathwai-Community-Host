import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUp, Check, MessageCircle, Rocket } from "lucide-react";
import { api, fmtDate, timeAgo } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useEcosystem } from "../lib/ecosystem";
import { useTracked } from "../lib/useTracked";
import { useInterest } from "../lib/useInterest";
import { STAGE_LABEL, NEED_LABEL } from "../lib/navigator";
import { Avatar, Spinner, cx } from "./ui";
import { ProgramDrawer } from "./ProgramCards";
import { CheckStrip, KIND, KindTile, V, VerdictBadge, daysFromNow, dayShort, heading } from "./hub/HubKit";
import { VERDICT, VERDICTS, VRANK } from "../lib/explain";
import { buildPlan, stepStates } from "../lib/planner";
import { SUGGESTIONS } from "../lib/ask";

// Home for a hub that works as an ecosystem (config.ecosystem, see lib/ecosystem.js). Built to be read without scrolling on a laptop:
//   left   ask bar (say what you want to make happen), the one best next move, then the best few matches with a tab per kind
//   right  your plan (four steps and the next one to do), and the latest news
// Ranking rules are in lib/moves.js (GET /navigator/moves). Each kind's full list is one tap away ("See all").

const ACCENT = { background: "var(--accent)", color: "var(--on-accent)" };
const SOLID = "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold transition hover:opacity-90";

function openMove(m, nav, onOpen) {
  if (m.kind === "program" || m.kind === "grant") onOpen(m.program);
  else if (m.kind === "event") nav(`/events/${m.id}`);
  else if (m.kind === "person") nav(`/members/${m.id}`);
  else nav("/resources");
}
const whenOf = (m) => (m.at ? fmtDate(m.at, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : m.deadline ? `Closes ${dayShort(m.deadline)}` : "");

// Say what you want to make happen. It opens Ask (/ask) with the question already answered.
function AskBar() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const go = (t) => { const v = String(t ?? q).trim(); nav(v ? `/ask?q=${encodeURIComponent(v)}` : "/ask"); };
  return (
    <section className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm sm:p-4" data-testid="eco-ask">
      <form onSubmit={(e) => { e.preventDefault(); go(); }}>
        <label className="flex items-center gap-3 rounded-full border border-line bg-paper py-1.5 pl-4 pr-1.5 transition focus-within:border-ink/40 focus-within:shadow-sm">
          <MessageCircle className="h-5 w-5 shrink-0 text-muted" aria-hidden />
          <input className="min-w-0 flex-1 bg-transparent py-1.5 text-base outline-none placeholder:text-muted" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything, e.g. I need my first paying customers" aria-label="What do you want to make happen?" data-testid="eco-ask-input" maxLength={300} />
          <button type="submit" aria-label="Ask" data-testid="eco-ask-go" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={ACCENT}><ArrowUp className="h-5 w-5" aria-hidden /></button>
        </label>
      </form>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {SUGGESTIONS.slice(0, 3).map((s, i) => <button key={s} type="button" onClick={() => go(s)} data-testid="eco-ask-chip" className={cx("rounded-full border border-line px-3 py-1 text-[13px] text-ink/80 transition hover:bg-ink/5", i > 1 && "hidden sm:inline-block")}>{s}</button>)}
      </div>
    </section>
  );
}

// The one thing to do first: what it is, why, and one button.
function NextMove({ m, today, onOpen }) {
  const nav = useNavigate();
  const left = m.deadline ? daysFromNow(m.deadline, today) : null;
  return (
    <section className="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-sm" data-testid="eco-top" data-verdict={m.verdict}>
      <span aria-hidden className={cx("absolute inset-y-0 left-0 w-1.5", V[m.verdict].bar)} />
      <div className="flex flex-col gap-3 p-4 pl-5 sm:flex-row sm:items-center sm:gap-5 sm:p-5 sm:pl-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <VerdictBadge verdict={m.verdict} />
            <span className="text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>Best next move · {KIND[m.kind].label}</span>
            {left != null && left <= 14 && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-600">{left} day{left === 1 ? "" : "s"} left</span>}
          </div>
          <h2 className="mt-2 text-xl font-bold leading-tight sm:text-2xl" style={{ ...heading, letterSpacing: "-0.025em" }}>{m.title}</h2>
          <p className="mt-1 line-clamp-2 text-sm leading-snug text-ink/85"><span className="text-muted">{[m.sub, whenOf(m)].filter(Boolean).join(" · ")}{m.why ? " · " : ""}</span>{m.why}</p>
          <div className="mt-2.5 hidden sm:block"><CheckStrip checks={m.checks} /></div>
        </div>
        <button type="button" onClick={() => openMove(m, nav, onOpen)} data-testid="eco-top-cta" className={cx(SOLID, "px-6 py-3 text-sm")} style={ACCENT}>{m.action}<ArrowRight className="h-4 w-4" aria-hidden /></button>
      </div>
    </section>
  );
}

// The four planner steps. Wide screens get the list; on a phone it shrinks to a progress bar and the next step.
function PlanCard({ states, mobile = false }) {
  const next = states.find((s) => s.current) || states[0];
  const done = states.filter((s) => s.done).length;
  return (
    <section className={cx("card !p-4 sm:!p-5", mobile ? "lg:hidden" : "hidden lg:block")} data-testid={mobile ? "eco-plan-m" : "eco-plan"}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold" style={heading}>Your plan</h2>
        <span className="text-xs font-semibold text-muted" data-testid="eco-plan-count">{done === 4 ? "Ready for your advisor" : `${done} of 4 done`}</span>
      </div>
      <div className="mt-2.5 flex gap-1" role="img" aria-label={`${done} of 4 steps done`}>{states.map((s) => <span key={s.key} className={cx("h-1.5 flex-1 rounded-full", s.done ? "bg-emerald-500" : s.current ? "bg-ink/40" : "bg-ink/10")} />)}</div>
      <ol className={cx("mt-3 space-y-1", mobile && "hidden")}>
        {states.map((s) => (
          <li key={s.key}>
            <Link to={s.to} data-testid={mobile ? undefined : `eco-step-${s.key}`} data-done={s.done ? "1" : "0"} className={cx("flex items-center gap-3 rounded-xl px-2.5 py-2 transition hover:bg-ink/[.04]", s.current && "bg-ink/[.05]")}>
              <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", s.done ? "bg-emerald-500 text-white" : s.current ? "bg-ink text-paper" : "bg-ink/10 text-ink/70")}>{s.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : s.n}</span>
              <span className="min-w-0"><span className="block text-sm font-semibold leading-tight">{s.label}</span><span className="block truncate text-xs text-muted">{s.detail}</span></span>
            </Link>
          </li>
        ))}
      </ol>
      <Link to={next.to} data-testid={mobile ? "eco-plan-cta-m" : "eco-plan-cta"} className={cx(SOLID, "mt-3.5 w-full px-5 py-2.5 text-sm")} style={ACCENT}>{done === 4 ? "Open my plan" : `Continue: ${next.label}`}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
    </section>
  );
}

// Just the verdict mark (colour and shape), for rows where the words would repeat on every line. The full label is on hover and for screen readers.
function VerdictIcon({ verdict }) {
  const v = V[verdict], Icon = v.Icon;
  return <span className={cx("flex h-7 w-7 items-center justify-center rounded-full", v.tint, v.text)} title={VERDICT[verdict].label} role="img" aria-label={VERDICT[verdict].label}><Icon className="h-4 w-4" aria-hidden /></span>;
}

// One card for all four kinds: a tab each, the best few inside, and the full count one tap away.
function Matches({ tabs, today, onOpen }) {
  const nav = useNavigate();
  const [id, setId] = useState(tabs[0].id);
  const tab = tabs.find((t) => t.id === id) || tabs[0];
  const vs = VERDICTS.filter((v) => tab.counts[v] > 0);
  const total = vs.reduce((n, v) => n + tab.counts[v], 0);
  return (
    <section className="card !p-0" data-testid="eco-matches">
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
        <div className="flex min-w-0 gap-1 overflow-x-auto rounded-full bg-ink/[.06] p-1 [scrollbar-width:none]" role="tablist" aria-label="What to look at">
          {tabs.map((t) => {
            const on = t.id === tab.id;
            return (
              <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => setId(t.id)} data-testid={`eco-tab-${t.id}`}
                className={cx("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition sm:px-3.5", on ? "bg-surface font-semibold shadow-sm" : "text-muted hover:text-ink")}>
                {t.title}<span className={cx("hidden rounded-full px-1.5 text-xs font-bold tabular-nums sm:inline", on ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-ink/10")}>{t.counts.now}</span>
              </button>
            );
          })}
        </div>
        <Link to={tab.to} className="hidden shrink-0 items-center gap-1 text-sm font-semibold sm:inline-flex" style={{ color: "var(--accent)" }} data-testid={`eco-all-${tab.id}`}>See all {total}<ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
      </div>
      {tab.items.length ? (
        <ul className="grid grid-cols-1 gap-2 px-4 pb-3 sm:px-5 md:grid-cols-2" data-testid={`eco-sec-${tab.id}`}>
          {tab.items.map((m, i) => {
            const when = whenOf(m);
            const left = m.deadline ? daysFromNow(m.deadline, today) : null;
            return (
              <li key={`${m.kind}-${m.id}`} className={i > 2 ? "hidden md:block" : ""}>
                <button type="button" onClick={() => openMove(m, nav, onOpen)} data-testid={`move-${m.kind}-${m.id}`} className="flex h-full w-full items-center gap-3 rounded-xl border border-line p-2.5 text-left transition hover:bg-ink/[.03]">
                  {m.kind === "person" ? <Avatar src={m.avatar} name={m.title} size={38} /> : <KindTile kind={m.kind} size={38} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{m.title}</span>
                    <span className="block truncate text-xs text-muted">{when && m.kind !== "person" ? `${when} · ` : ""}{m.why}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <VerdictIcon verdict={m.verdict} />
                    {left != null && left <= 14 && <span className="text-[11px] font-semibold text-red-600">{left}d left</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : <p className="px-5 pb-4 text-sm text-muted">Nothing is a good match right now. Open the page to see why.</p>}
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 sm:px-5">
        <p className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">{vs.map((v) => <span key={v} className="inline-flex items-center gap-1"><span className={cx("h-2 w-2 rounded-full", V[v].bar)} aria-hidden /><span className="font-semibold tabular-nums text-ink/80">{tab.counts[v]}</span> {VERDICT[v].short.toLowerCase()}</span>)}</p>
        <Link to={tab.to} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold sm:hidden" style={{ color: "var(--accent)" }}>See all {total}<ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
      </div>
    </section>
  );
}

function News({ news, hub }) {
  if (!news.length) return null;
  return (
    <section className="card !p-4 sm:!p-5" data-testid="eco-news">
      <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-bold" style={heading}>News from {hub}</h2><Link to="/updates" className="text-xs text-muted hover:text-ink">All ›</Link></div>
      <ul className="divide-y divide-line">{news.map((a) => <li key={a.id} className="py-2.5 first:pt-0 last:pb-0"><p className="line-clamp-2 text-sm font-semibold leading-snug">{a.title}</p><p className="mt-0.5 text-[11px] text-muted">{timeAgo(a.published_at || a.created_at)}</p></li>)}</ul>
    </section>
  );
}

export default function EcosystemHome() {
  const { account } = useAuth();
  const eco = useEcosystem();
  const hub = eco.hub;
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState(null);
  const [news, setNews] = useState([]);
  const [planState, setPlanState] = useState(null);
  const { tracked, setTracked, track } = useTracked();
  const itc = useInterest();
  useEffect(() => {
    document.title = `Home · ${hub}`;
    api.get("/navigator/moves").then((r) => { setD(r.data); }).catch(() => setErr(true));
    api.get("/navigator/plan").then((r) => setPlanState(r.data)).catch(() => {});
    api.get("/announcements").then((r) => setNews((r.data || []).slice(0, 2))).catch(() => {});
    api.get("/navigator/me").then((r) => { setTracked(r.data.tracked || []); itc.setInterest(r.data.interest || []); }).catch(() => {});
  }, [account?.startup]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = account?.startup || {};
  const first = (account?.name || "").split(/\s+/)[0];
  if (err) return <p className="card text-sm text-muted">Your home page could not load. Please try again in a moment.</p>;
  if (!d) return <Spinner />;
  const L = d.lists;
  const progs = [...(L.program || []), ...(L.grant || [])].sort((a, b) => b.score - a.score);
  const top = d.moves[0];
  const plan = (planState && planState.plan) || {};
  const states = stepStates({ startup: st, plan, steps: buildPlan({ direction: plan.direction, lists: L, plan, today: d.as_of }) });
  const live = (l) => (l || []).filter((m) => m.verdict === "now" || m.verdict === "close").sort((a, b) => VRANK[a.verdict] - VRANK[b.verdict] || b.score - a.score).slice(0, 4);
  const tabs = [
    { id: "programs", title: "Programs", to: "/navigator", counts: d.verdicts.program, items: live(progs) },
    { id: "events", title: "Events", to: "/events", counts: d.verdicts.event, items: live(L.event).sort((a, b) => String(a.at).localeCompare(String(b.at))) },
    { id: "people", title: "People", to: "/members", counts: d.verdicts.person, items: live(L.person) },
    { id: "resources", title: "Resources", to: "/resources", counts: d.verdicts.resource, items: live(L.resource) },
  ];
  return (
    <div className="space-y-4" data-testid="eco-home">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="eyebrow">{hub} · {eco.city}</p>
          <h1 className="mt-1.5 text-2xl sm:text-3xl" style={{ ...heading, letterSpacing: "-0.03em", textWrap: "balance" }}>{first ? `Hi ${first}, w` : "W"}hat do you want to make happen?</h1>
        </div>
        {st.stage && (
          <Link to="/me?edit=startup" className="card card-hover !hidden max-w-xs items-center gap-3 !p-2.5 !pr-4 sm:!flex" data-testid="eco-profile">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={ACCENT}><Rocket className="h-4 w-4" aria-hidden /></span>
            <span className="min-w-0"><span className="block truncate text-sm font-semibold">{st.name || "Your startup"}</span>
              <span className="block truncate text-xs text-muted">{STAGE_LABEL[st.stage] || st.stage}{(st.needs || []).length ? ` · ${(st.needs || []).slice(0, 2).map((n) => NEED_LABEL[n] || n).join(", ")}` : ""} · Edit</span></span>
          </Link>
        )}
      </header>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <AskBar />
          {planState && <PlanCard states={states} mobile />}
          {top && <NextMove m={top} today={d.as_of} onOpen={setOpen} />}
          <Matches tabs={tabs} today={d.as_of} onOpen={setOpen} />
        </div>
        <div className="space-y-4 lg:col-span-4">
          {planState && <PlanCard states={states} />}
          <div className="hidden lg:block"><News news={news} hub={hub} /></div>
        </div>
      </div>

      <ProgramDrawer p={open} onClose={() => setOpen(null)} tracked={tracked} onTrack={track} interest={itc} stage={st.stage || "idea"} eco={eco} />
    </div>
  );
}
