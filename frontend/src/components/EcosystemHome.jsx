import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, Rocket } from "lucide-react";
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

// Home for a hub that works as an ecosystem (config.ecosystem, see lib/ecosystem.js): not a feed of what happened, but "where to start".
// One top pick, then the best few of each kind with a way to the full page. Ranking rules are in lib/moves.js (GET /navigator/moves).

function openMove(m, nav, onOpen) {
  if (m.kind === "program" || m.kind === "grant") onOpen(m.program);
  else if (m.kind === "event") nav(`/events/${m.id}`);
  else if (m.kind === "person") nav(`/members/${m.id}`);
  else nav("/resources");
}
const whenOf = (m) => (m.at ? fmtDate(m.at, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : m.deadline ? `Closes ${dayShort(m.deadline)}` : "");

// The one thing to do first: big, plain, one button, and why.
function TopPick({ m, today, onOpen }) {
  const nav = useNavigate();
  const k = KIND[m.kind];
  const left = m.deadline ? daysFromNow(m.deadline, today) : null;
  return (
    <section className="relative overflow-hidden rounded-3xl border border-line bg-surface shadow-sm" data-testid="eco-top" data-verdict={m.verdict}>
      <span aria-hidden className={cx("absolute inset-y-0 left-0 w-2", V[m.verdict].bar)} />
      <div className="flex flex-col gap-5 p-5 pl-7 sm:flex-row sm:items-center sm:gap-7 sm:p-8 sm:pl-10">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <VerdictBadge verdict={m.verdict} size="lg" />
            <span className="text-xs font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>Best next move · {k.label}</span>
          </div>
          <h2 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl" style={{ ...heading, letterSpacing: "-0.03em", textWrap: "balance" }}>{m.title}</h2>
          <p className="mt-1.5 text-sm text-muted">{[m.sub, whenOf(m)].filter(Boolean).join(" · ")}</p>
          <div className="mt-4"><CheckStrip checks={m.checks} /></div>
          {m.why && <p className="mt-3 max-w-2xl text-[15px] leading-snug text-ink/90">{m.why}</p>}
          {left != null && left <= 14 && <p className="mt-3 inline-flex rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-600">Closes in {left} day{left === 1 ? "" : "s"}</p>}
        </div>
        <button type="button" onClick={() => openMove(m, nav, onOpen)} data-testid="eco-top-cta" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-7 py-3.5 text-base font-semibold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
          {m.action}<ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </section>
  );
}

// Where the founder is in the planner (My plan): four steps, the one to do next highlighted, one button to carry on.
function PlanCard({ states }) {
  const next = states.find((s) => s.current) || states[0];
  const done = states.filter((s) => s.done).length;
  return (
    <section className="card !p-5 sm:!p-6" data-testid="eco-plan">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="eyebrow">Your plan</p>
          <h2 className="mt-1 text-xl sm:text-2xl" style={{ ...heading, letterSpacing: "-0.025em" }}>{done === 4 ? "You're ready for your advisor" : done === 0 ? "Get ready to talk to an advisor" : `${done} of 4 steps done`}</h2>
        </div>
        <Link to={next.to} data-testid="eco-plan-cta" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
          {done === 4 ? "Open my plan" : `Continue: ${next.label}`}<ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {states.map((s) => (
          <li key={s.key}>
            <Link to={s.to} data-testid={`eco-step-${s.key}`} data-done={s.done ? "1" : "0"} className={cx("flex h-full items-start gap-2.5 rounded-xl border p-3 transition hover:bg-ink/[.03]", s.current ? "border-ink/40" : "border-line")}>
              <span className={cx("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", s.done ? "bg-emerald-500 text-white" : s.current ? "bg-ink text-paper" : "bg-ink/10 text-ink/70")}>{s.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : s.n}</span>
              <span className="min-w-0"><span className="block text-sm font-bold">{s.label}</span><span className="block text-xs leading-snug text-muted">{s.detail}</span></span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

// A short list for one kind: how it breaks down at a glance, then the best few, each with its verdict.
function Section({ id, title, to, counts, items, today, onOpen }) {
  const nav = useNavigate();
  const vs = VERDICTS.filter((v) => counts[v] > 0);
  const total = vs.reduce((n, v) => n + counts[v], 0);
  return (
    <section className="card !p-0" data-testid={`eco-sec-${id}`}>
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg" style={heading}>{title}</h2>
          <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "var(--accent)" }} data-testid={`eco-all-${id}`}>See all {total}<ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
        </div>
        <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={vs.map((v) => `${counts[v]} ${VERDICT[v].short}`).join(", ")}>
          {vs.map((v) => <span key={v} style={{ flexGrow: counts[v] }} className={cx("min-w-[8px]", V[v].bar)} />)}
        </div>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">{vs.map((v) => <span key={v} className="inline-flex items-center gap-1"><span className={cx("h-2 w-2 rounded-full", V[v].bar)} aria-hidden /><span className="tabular-nums font-semibold text-ink/80">{counts[v]}</span> {VERDICT[v].short.toLowerCase()}</span>)}</p>
      </div>
      {items.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {items.map((m) => {
            const when = whenOf(m);
            const left = m.deadline ? daysFromNow(m.deadline, today) : null;
            return (
              <li key={`${m.kind}-${m.id}`}>
                <button type="button" onClick={() => openMove(m, nav, onOpen)} data-testid={`move-${m.kind}-${m.id}`} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-ink/[.03]">
                  {m.kind === "person" ? <Avatar src={m.avatar} name={m.title} size={40} /> : <KindTile kind={m.kind} size={40} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{m.title}</span>
                    <span className="block truncate text-xs text-muted">{when && m.kind !== "person" ? `${when} · ` : ""}{m.why}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <VerdictBadge verdict={m.verdict} short />
                    {left != null && left <= 14 && <span className="text-[11px] font-semibold text-red-600">{left}d left</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : <p className="border-t border-line p-5 text-sm text-muted">Nothing is a good match right now. Open the page to see why.</p>}
    </section>
  );
}

export default function EcosystemHome() {
  const { account } = useAuth();
  const eco = useEcosystem();
  const hub = eco.hub;
  const nav = useNavigate();
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
  const live = (l) => (l || []).filter((m) => m.verdict === "now" || m.verdict === "close").sort((a, b) => VRANK[a.verdict] - VRANK[b.verdict] || b.score - a.score).slice(0, 3);
  return (
    <div className="space-y-5" data-testid="eco-home">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">{hub} · {eco.city}</p>
          <h1 className="mt-2 text-3xl sm:text-4xl" style={{ ...heading, letterSpacing: "-0.03em", textWrap: "balance" }}>{first ? `Hi ${first}, ` : ""}here's where to start</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">{eco.home_sub}</p>
        </div>
        {st.stage && (
          <Link to="/me?edit=startup" className="card card-hover !flex max-w-sm items-center gap-3 !p-3" data-testid="eco-profile">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Rocket className="h-4 w-4" aria-hidden /></span>
            <span className="min-w-0"><span className="block truncate text-sm font-semibold">Matched to {st.name || "your startup"}</span>
              <span className="block truncate text-xs text-muted">{STAGE_LABEL[st.stage] || st.stage}{(st.needs || []).length ? ` · ${(st.needs || []).slice(0, 2).map((n) => NEED_LABEL[n] || n).join(", ")}` : ""} · Edit</span></span>
          </Link>
        )}
      </header>

      {planState && <PlanCard states={states} />}

      {top && <TopPick m={top} today={d.as_of} onOpen={setOpen} />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2" data-testid="eco-sections">
        <Section id="programs" title="Programs & grants" to="/navigator" counts={d.verdicts.program} items={live(progs)} today={d.as_of} onOpen={setOpen} />
        <Section id="events" title="Events" to="/events" counts={d.verdicts.event} items={live(L.event).sort((a, b) => String(a.at).localeCompare(String(b.at)))} today={d.as_of} onOpen={setOpen} />
        <Section id="people" title="People" to="/members" counts={d.verdicts.person} items={live(L.person)} today={d.as_of} onOpen={setOpen} />
        <Section id="resources" title="Resources" to="/resources" counts={d.verdicts.resource} items={live(L.resource)} today={d.as_of} onOpen={setOpen} />
      </div>

      {news.length > 0 && (
        <section className="card" data-testid="eco-news">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg" style={heading}>News from {hub}</h2><Link to="/updates" className="text-xs text-muted hover:text-ink">All ›</Link></div>
          <ul className="divide-y divide-line">{news.map((a) => <li key={a.id} className="py-3 first:pt-0 last:pb-0"><p className="text-sm font-semibold">{a.title}</p><p className="mt-0.5 line-clamp-2 text-xs text-muted">{a.body}</p><p className="mt-1 text-[11px] text-muted">{timeAgo(a.published_at || a.created_at)}</p></li>)}</ul>
        </section>
      )}

      <ProgramDrawer p={open} onClose={() => setOpen(null)} tracked={tracked} onTrack={track} interest={itc} stage={st.stage || "idea"} eco={eco} />
    </div>
  );
}
