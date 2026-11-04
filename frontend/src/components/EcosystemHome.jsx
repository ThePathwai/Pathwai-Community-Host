import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUp, Check, MessageCircle, Plus, Rocket } from "lucide-react";
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

// Home for a hub that works as an ecosystem (config.ecosystem, see lib/ecosystem.js). It is sized to the screen: on a laptop or a phone the
// whole page is visible at once, with nothing to scroll. Whatever room is left goes to the list of matches, which shows as many rows as fit.
//   left   ask bar, the one best next move, then the matches (a tab per kind)
//   right  your plan (the four steps), and the latest news.  On a phone the plan shrinks to one row.
// Ranking rules are in lib/moves.js (GET /navigator/moves). Each kind's full list is one tap away ("See all").

const ACCENT = { background: "var(--accent)", color: "var(--on-accent)" };
const SOLID = "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition hover:opacity-90";

function openMove(m, nav, onOpen) {
  if (m.kind === "program" || m.kind === "grant") onOpen(m.program);
  else if (m.kind === "event") nav(`/events/${m.id}`);
  else if (m.kind === "person") nav(`/members/${m.id}`);
  else nav("/resources");
}
const whenOf = (m) => (m.at ? fmtDate(m.at, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : m.deadline ? `Closes ${dayShort(m.deadline)}` : "");

// Say what you want to make happen. It opens Ask (/assistant) with the question already answered.
function AskBar() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const go = (t) => { const v = String(t ?? q).trim(); nav(v ? `/assistant?q=${encodeURIComponent(v)}` : "/assistant"); };
  return (
    <section className="flex-none rounded-2xl border border-line bg-surface p-3 shadow-sm sm:p-4" data-testid="eco-ask">
      <form onSubmit={(e) => { e.preventDefault(); go(); }}>
        <label className="flex items-center gap-3 rounded-full border border-line bg-paper py-1 pl-4 pr-1 transition focus-within:border-ink/40 focus-within:shadow-sm">
          <MessageCircle className="h-5 w-5 shrink-0 text-muted" aria-hidden />
          <input className="min-w-0 flex-1 bg-transparent py-1.5 text-base outline-none placeholder:text-muted" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything, e.g. I need my first customers" aria-label="What do you want to make happen?" data-testid="eco-ask-input" maxLength={300} />
          <button type="submit" aria-label="Ask" data-testid="eco-ask-go" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={ACCENT}><ArrowUp className="h-5 w-5" aria-hidden /></button>
        </label>
      </form>
      <div className="short-hide mt-2 flex gap-1.5 overflow-hidden">
        {SUGGESTIONS.slice(0, 3).map((s, i) => <button key={s} type="button" onClick={() => go(s)} data-testid="eco-ask-chip" className={cx("shrink-0 whitespace-nowrap rounded-full border border-line px-3 py-1 text-[13px] text-ink/80 transition hover:bg-ink/5", i === 1 && "hidden min-[430px]:inline-block", i === 2 && "hidden sm:inline-block")}>{s}</button>)}
      </div>
    </section>
  );
}

// The one thing to do first: what it is, why, and one button.
function NextMove({ m, today, onOpen }) {
  const nav = useNavigate();
  const left = m.deadline ? daysFromNow(m.deadline, today) : null;
  return (
    <section className="short-hide relative flex-none overflow-hidden rounded-2xl border border-line bg-surface shadow-sm" data-testid="eco-top" data-verdict={m.verdict}>
      <span aria-hidden className={cx("absolute inset-y-0 left-0 w-1.5", V[m.verdict].bar)} />
      <div className="flex items-center gap-3 p-3 pl-4 sm:gap-5 sm:p-4 sm:pl-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <VerdictBadge verdict={m.verdict} />
            <span className="text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>Best next move</span>
            {left != null && left <= 14 && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-600">{left} day{left === 1 ? "" : "s"} left</span>}
          </div>
          <h2 className="mt-1.5 truncate text-lg font-bold leading-tight sm:text-xl" style={{ ...heading, letterSpacing: "-0.02em" }}>{m.title}</h2>
          <p className="short-hide mt-0.5 line-clamp-1 text-[13px] text-muted sm:line-clamp-2">{[m.sub, whenOf(m)].filter(Boolean).join(" · ")}{m.why ? ` · ${m.why}` : ""}</p>
        </div>
        <button type="button" onClick={() => openMove(m, nav, onOpen)} data-testid="eco-top-cta" className={cx(SOLID, "px-4 py-2.5 text-sm sm:px-6 sm:py-3")} style={ACCENT}>{m.action}<ArrowRight className="h-4 w-4" aria-hidden /></button>
      </div>
    </section>
  );
}

// The four planner steps. Wide screens get the list and it stretches to fill its column; on a phone it is one row: progress and a button.
function PlanCard({ states, mobile = false }) {
  const next = states.find((s) => s.current) || states[0];
  const done = states.filter((s) => s.done).length;
  const bar = <div className="flex gap-1" role="img" aria-label={`${done} of 4 steps done`}>{states.map((s) => <span key={s.key} className={cx("h-1.5 flex-1 rounded-full", s.done ? "bg-emerald-500" : s.current ? "bg-ink/40" : "bg-ink/10")} />)}</div>;
  if (mobile) {
    return (
      <section className="card flex flex-none items-center gap-3 !p-3 lg:hidden" data-testid="eco-plan-m">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-baseline justify-between gap-2"><h2 className="whitespace-nowrap text-base font-bold" style={heading}>Your plan</h2><span className="hidden truncate text-xs text-muted min-[400px]:inline">{done === 4 ? "Ready" : `Next: ${next.label}`}</span></div>
          {bar}
        </div>
        <Link to="/plan?update=1" aria-label="Log an update" title="Log an update" data-testid="eco-update-m" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line transition hover:bg-ink/5"><Plus className="h-5 w-5" aria-hidden /></Link>
        <Link to={next.to} data-testid="eco-plan-cta-m" className={cx(SOLID, "px-4 py-2.5 text-sm")} style={ACCENT}>{done === 4 ? "Open" : "Continue"}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
      </section>
    );
  }
  return (
    <section className="card hidden flex-none flex-col !p-5 lg:flex" data-testid="eco-plan">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold" style={heading}>Your plan</h2>
        <span className="text-xs font-semibold text-muted" data-testid="eco-plan-count">{done === 4 ? "Ready for your advisor" : `${done} of 4 done`}</span>
      </div>
      <div className="mt-3">{bar}</div>
      <ol className="mt-3 space-y-1">
        {states.map((s) => (
          <li key={s.key}>
            <Link to={s.to} data-testid={`eco-step-${s.key}`} data-done={s.done ? "1" : "0"} className={cx("flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-ink/[.04]", s.current && "bg-ink/[.06]")}>
              <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", s.done ? "bg-emerald-500 text-white" : s.current ? "bg-ink text-paper" : "bg-ink/10 text-ink/70")}>{s.done ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : s.n}</span>
              <span className="min-w-0"><span className="block text-sm font-semibold leading-tight">{s.label}</span><span className="block truncate text-xs text-muted">{s.detail}</span></span>
            </Link>
          </li>
        ))}
      </ol>
      <Link to={next.to} data-testid="eco-plan-cta" className={cx(SOLID, "mt-3 w-full px-5 py-3 text-sm")} style={ACCENT}>{done === 4 ? "Open my plan" : `Continue: ${next.label}`}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
      <Link to="/plan?update=1" data-testid="eco-update" className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full border border-line px-5 py-2.5 text-sm font-semibold transition hover:bg-ink/5"><Plus className="h-4 w-4" aria-hidden />Log an update</Link>
    </section>
  );
}

// Just the verdict mark (colour and shape), for rows where the words would repeat on every line. The full label is on hover and for screen readers.
function VerdictIcon({ verdict }) {
  const v = V[verdict], Icon = v.Icon;
  return <span className={cx("flex h-7 w-7 items-center justify-center rounded-full", v.tint, v.text)} title={VERDICT[verdict].label} role="img" aria-label={VERDICT[verdict].label}><Icon className="h-4 w-4" aria-hidden /></span>;
}

// Rows that fit in a box of this height, so the list always fills its space and never needs a scrollbar.
function useRows(rowMin, gap) {
  const ref = useRef(null);
  const [rows, setRows] = useState(3);
  const [box, setBox] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => { setBox(el.clientHeight - 12); setRows(Math.max(1, Math.floor((el.clientHeight - 12 + gap) / (rowMin + gap)))); };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rowMin, gap]);
  return [ref, rows, box];
}

// One card for all four kinds: a tab each, then as many matches as fit, best first (good matches, then almost, then the rest, so nothing is hidden by the order).
function Matches({ tabs, today, onOpen }) {
  const nav = useNavigate();
  const [id, setId] = useState(tabs[0].id);
  const tab = tabs.find((t) => t.id === id) || tabs[0];
  const [wide, setWide] = useState(() => (typeof window === "undefined" ? true : window.matchMedia("(min-width: 768px)").matches));
  useEffect(() => { const q = window.matchMedia("(min-width: 768px)"); const f = () => setWide(q.matches); q.addEventListener("change", f); return () => q.removeEventListener("change", f); }, []);
  const [ref, rows, box] = useRows(wide ? 60 : 54, 8);
  const cols = wide ? 2 : 1;
  const vs = VERDICTS.filter((v) => tab.counts[v] > 0);
  const total = vs.reduce((n, v) => n + tab.counts[v], 0);
  const shown = tab.items.slice(0, rows * cols);
  const shownRows = Math.max(1, Math.ceil(shown.length / cols));
  const roomy = (box - (shownRows - 1) * 8) / shownRows >= 100;   // tall tiles show the verdict in words and what it takes, instead of empty space
  return (
    <section className="card flex min-h-[9rem] min-w-0 flex-1 flex-col !p-0" data-testid="eco-matches">
      <div className="flex flex-none items-center justify-between gap-3 px-3 pb-2.5 pt-3 sm:px-4 sm:pt-4">
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
      <div ref={ref} className="min-h-0 flex-1 overflow-hidden px-3 pb-3 sm:px-4" data-testid={`eco-sec-${tab.id}`}>
        <ul className="grid h-full gap-2" data-testid="eco-list" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: `minmax(0, 1fr)` }}>
          {shown.map((m) => {
            const when = whenOf(m);
            const left = m.deadline ? daysFromNow(m.deadline, today) : null;
            return (
              <li key={`${m.kind}-${m.id}`} className="min-h-0">
                <button type="button" onClick={() => openMove(m, nav, onOpen)} data-testid={`move-${m.kind}-${m.id}`} data-verdict={m.verdict}
                  className={cx("flex h-full w-full items-center gap-3 rounded-xl border border-line px-3 text-left transition hover:bg-ink/[.03]", m.verdict === "no" && "bg-ink/[.025]")}>
                  {m.kind === "person" ? <Avatar src={m.avatar} name={m.title} size={40} /> : <KindTile kind={m.kind} size={40} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{m.title}</span>
                    <span className="line-clamp-2 text-xs leading-snug text-muted">{when && m.kind !== "person" ? `${when} · ` : ""}{m.why}</span>
                    {roomy && <span className={cx("mt-1 line-clamp-2 block text-xs font-medium leading-snug", V[m.verdict].text)}>{VERDICT[m.verdict].label}{m.gap ? `: ${m.gap}` : ""}</span>}
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
      </div>
      <div className="flex flex-none items-center justify-between gap-3 border-t border-line px-3 py-2 sm:px-4">
        <p className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">{vs.map((v) => <span key={v} className="inline-flex items-center gap-1"><span className={cx("h-2 w-2 rounded-full", V[v].bar)} aria-hidden /><span className="font-semibold tabular-nums text-ink/80">{tab.counts[v]}</span> {VERDICT[v].short.toLowerCase()}</span>)}</p>
        <Link to={tab.to} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold sm:hidden" style={{ color: "var(--accent)" }}>See all {total}<ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
      </div>
    </section>
  );
}

// The right column's second card: events you are going to, then the latest news, as one list. It takes whatever height is left and shows as many rows as fit.
function Updates({ events, news, hub }) {
  const [ref, rows] = useRows(46, 0);
  const going = events.filter((e) => e.rsvp).sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(0, 3)
    .map((e) => ({ key: `e${e.id}`, tag: "Going", title: e.title, sub: whenOf(e), to: `/events/${e.id}` }));
  const items = [...going, ...news.map((a) => ({ key: `n${a.id}`, tag: "News", title: a.title, sub: timeAgo(a.published_at || a.created_at), to: "/updates" }))];
  if (!items.length) return null;
  return (
    <section className="card hidden min-h-0 flex-1 flex-col !p-4 lg:flex" data-testid="eco-news">
      <div className="mb-2 flex flex-none items-center justify-between"><h2 className="text-base font-bold" style={heading}>Coming up &amp; news from {hub}</h2></div>
      <div ref={ref} className="min-h-0 flex-1 overflow-hidden">
        <ul className="divide-y divide-line">{items.slice(0, Math.max(1, rows)).map((it) => (
          <li key={it.key}><Link to={it.to} className="block py-2 first:pt-0">
            <p className="flex items-center gap-2"><span className={cx("rounded px-1.5 py-px text-[10px] font-bold uppercase", it.tag === "Going" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-ink/10 text-ink/70")} style={{ letterSpacing: "0.08em" }}>{it.tag}</span><span className="text-[11px] text-muted">{it.sub}</span></p>
            <p className="mt-0.5 line-clamp-1 text-sm font-semibold leading-snug">{it.title}</p>
          </Link></li>))}</ul>
      </div>
    </section>
  );
}

// Make the page exactly as tall as the screen (minus the header, and the tab bar on a phone), so it never scrolls. The footer is hidden on this page (index.css).
function useFitScreen(ready) {
  const ref = useRef(null);
  const [h, setH] = useState(null);
  useLayoutEffect(() => {
    document.body.dataset.fit = "home";
    return () => { delete document.body.dataset.fit; };
  }, []);
  useLayoutEffect(() => {
    if (!ready) return undefined;
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const main = el.parentElement ? parseFloat(getComputedStyle(el.parentElement).paddingBottom) || 0 : 0;
      const bar = document.querySelector('[data-testid="tabbar"]');
      const barH = bar && getComputedStyle(bar).display !== "none" ? bar.offsetHeight : 0;
      setH(Math.max(420, Math.floor(window.innerHeight - top - main - barH)));
    };
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);
    return () => { window.removeEventListener("resize", fit); window.removeEventListener("orientationchange", fit); };
  }, [ready]);
  return [ref, h];
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
  const [fitRef, fitH] = useFitScreen(!!d);
  useEffect(() => {
    document.title = `Home · ${hub}`;
    api.get("/navigator/moves").then((r) => { setD(r.data); }).catch(() => setErr(true));
    api.get("/navigator/plan").then((r) => setPlanState(r.data)).catch(() => {});
    api.get("/announcements").then((r) => setNews((r.data || []).slice(0, 5))).catch(() => {});
    api.get("/navigator/me").then((r) => { setTracked(r.data.tracked || []); itc.setInterest(r.data.interest || []); }).catch(() => {});
  }, [account?.startup]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = account?.startup || {};
  const first = (account?.name || "").split(/\s+/)[0];
  if (err) return <p className="card text-sm text-muted">Your home page could not load. Please try again in a moment.</p>;
  if (!d) return <Spinner />;
  const L = d.lists;
  const rank = (a, b) => VRANK[a.verdict] - VRANK[b.verdict] || b.score - a.score;
  const progs = [...(L.program || []), ...(L.grant || [])].sort(rank);
  const top = d.moves[0];
  const plan = (planState && planState.plan) || {};
  const states = stepStates({ startup: st, plan, steps: buildPlan({ direction: plan.direction, lists: L, plan, today: d.as_of }) });
  // good matches first, then almost, then the rest; events in date order within each group
  const byDate = (a, b) => VRANK[a.verdict] - VRANK[b.verdict] || String(a.at).localeCompare(String(b.at));
  const tabs = [
    { id: "programs", title: "Programs", to: "/navigator", counts: d.verdicts.program, items: progs },
    { id: "events", title: "Events", to: "/events", counts: d.verdicts.event, items: [...(L.event || [])].sort(byDate) },
    { id: "people", title: "People", to: "/members", counts: d.verdicts.person, items: [...(L.person || [])].sort(rank) },
    { id: "resources", title: "Resources", to: "/resources", counts: d.verdicts.resource, items: [...(L.resource || [])].sort(rank) },
  ];
  return (
    <div ref={fitRef} style={fitH ? { height: fitH } : undefined} className="flex flex-col gap-3 lg:gap-4" data-testid="eco-home">
      <header className="flex flex-none flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <div className="min-w-0">
          <p className="eyebrow hidden sm:block">{hub} · {eco.city}</p>
          <h1 className="text-xl sm:mt-1 sm:text-2xl" style={{ ...heading, letterSpacing: "-0.03em", textWrap: "balance" }}>{first ? `Hi ${first}, w` : "W"}hat do you want to make happen?</h1>
        </div>
        {st.stage && (
          <Link to="/me?edit=startup" className="card card-hover !hidden max-w-xs items-center gap-3 !p-2 !pr-4 sm:!flex" data-testid="eco-profile">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={ACCENT}><Rocket className="h-4 w-4" aria-hidden /></span>
            <span className="min-w-0"><span className="block truncate text-sm font-semibold">{st.name || "Your startup"}</span>
              <span className="block truncate text-xs text-muted">{STAGE_LABEL[st.stage] || st.stage}{(st.needs || []).length ? ` · ${(st.needs || []).slice(0, 2).map((n) => NEED_LABEL[n] || n).join(", ")}` : ""} · Edit</span></span>
          </Link>
        )}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
        <div className="flex min-h-0 min-w-0 flex-col gap-3 lg:col-span-8 lg:gap-4">
          <AskBar />
          {planState && <PlanCard states={states} mobile />}
          {top && <NextMove m={top} today={d.as_of} onOpen={setOpen} />}
          <Matches tabs={tabs} today={d.as_of} onOpen={setOpen} />
        </div>
        <div className="hidden min-h-0 flex-col gap-4 lg:col-span-4 lg:flex">
          {planState && <PlanCard states={states} />}
          <Updates events={L.event || []} news={news} hub={hub} />
        </div>
      </div>

      <ProgramDrawer p={open} onClose={() => setOpen(null)} tracked={tracked} onTrack={track} interest={itc} stage={st.stage || "idea"} eco={eco} />
    </div>
  );
}
