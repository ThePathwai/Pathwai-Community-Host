import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Rocket } from "lucide-react";
import { api, fmtDate, timeAgo } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useEcosystem } from "../lib/ecosystem";
import { useTracked } from "../lib/useTracked";
import { useInterest } from "../lib/useInterest";
import { STAGE_LABEL, NEED_LABEL } from "../lib/navigator";
import { Avatar, Spinner } from "./ui";
import { ProgramDrawer } from "./ProgramCards";
import { FitPill, KIND, KindTile, Why, daysFromNow, dayShort, heading } from "./hub/HubKit";

// Home for a hub that works as an ecosystem (config.ecosystem, see lib/ecosystem.js): not a feed of what happened, but "where to start".
// One top pick, then the best few of each kind with a way to the full page. Ranking rules are in lib/moves.js (GET /navigator/moves).

function openMove(m, nav, onOpen) {
  if (m.kind === "program" || m.kind === "grant") onOpen(m.program);
  else if (m.kind === "event") nav(`/events/${m.id}`);
  else if (m.kind === "person") nav(`/members/${m.id}`);
  else nav("/resources");
}
const whenOf = (m) => (m.at ? fmtDate(m.at, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : m.deadline ? `Closes ${dayShort(m.deadline)}` : "");

// The one thing to do first: big, plain, one button.
function TopPick({ m, today, onOpen }) {
  const nav = useNavigate();
  const k = KIND[m.kind];
  const left = m.deadline ? daysFromNow(m.deadline, today) : null;
  return (
    <section className="card overflow-hidden !p-0" data-testid="eco-top">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-7" style={{ borderLeft: `4px solid ${k.color}` }}>
        <KindTile kind={m.kind} size={56} />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Start here</p>
          <h2 className="mt-1 text-2xl leading-tight sm:text-3xl" style={{ ...heading, letterSpacing: "-0.03em", textWrap: "balance" }}>{m.title}</h2>
          <p className="mt-1 text-sm text-muted">{[k.label, m.sub].filter(Boolean).join(" · ")}{whenOf(m) ? ` · ${whenOf(m)}` : ""}</p>
          <Why text={m.reason} />
        </div>
        <button type="button" onClick={() => openMove(m, nav, onOpen)} data-testid="eco-top-cta" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-semibold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
          {m.action}<ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {left != null && left <= 14 && <p className="border-t border-line bg-red-500/10 px-5 py-2 text-xs font-semibold text-red-600 sm:px-7">Closes in {left} day{left === 1 ? "" : "s"}.</p>}
    </section>
  );
}

// A short list for one kind, with a clear way to the full page.
function Section({ id, title, to, total, items, today, onOpen }) {
  const nav = useNavigate();
  return (
    <section className="card !p-0" data-testid={`eco-sec-${id}`}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="text-lg" style={heading}>{title}</h2>
        <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "var(--accent)" }} data-testid={`eco-all-${id}`}>See all {total}<ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
      </div>
      {items.length ? (
        <ul className="divide-y divide-line">
          {items.map((m) => {
            const when = whenOf(m);
            const left = m.deadline ? daysFromNow(m.deadline, today) : null;
            return (
              <li key={`${m.kind}-${m.id}`}>
                <button type="button" onClick={() => openMove(m, nav, onOpen)} data-testid={`move-${m.kind}-${m.id}`} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-ink/[.03]">
                  {m.kind === "person" ? <Avatar src={m.avatar} name={m.title} size={40} /> : <KindTile kind={m.kind} size={40} />}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2"><span className="truncate text-sm font-semibold">{m.title}</span><FitPill fit={m.fit} /></span>
                    <span className="block truncate text-xs text-muted">{when || m.sub}{when && m.sub ? ` · ${m.sub}` : ""}</span>
                  </span>
                  {left != null && left <= 14 && <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-600">{left}d left</span>}
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : <p className="p-5 text-sm text-muted">Nothing here yet.</p>}
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
  const { tracked, setTracked, track } = useTracked();
  const itc = useInterest();
  useEffect(() => {
    document.title = `Home · ${hub}`;
    api.get("/navigator/moves").then((r) => { setD(r.data); }).catch(() => setErr(true));
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

      {top && <TopPick m={top} today={d.as_of} onOpen={setOpen} />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2" data-testid="eco-sections">
        <Section id="programs" title="Programs & grants" to="/navigator" total={progs.length} items={progs.slice(0, 3)} today={d.as_of} onOpen={setOpen} />
        <Section id="events" title="Events coming up" to="/events" total={(L.event || []).length} items={[...(L.event || [])].sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(0, 3)} today={d.as_of} onOpen={setOpen} />
        <Section id="people" title="People to meet" to="/members" total={(L.person || []).length} items={(L.person || []).slice(0, 3)} today={d.as_of} onOpen={setOpen} />
        <Section id="resources" title="Resources" to="/resources" total={(L.resource || []).length} items={(L.resource || []).slice(0, 3)} today={d.as_of} onOpen={setOpen} />
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
