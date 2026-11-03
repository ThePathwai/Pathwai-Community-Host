import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, Calendar, Check, Compass, Landmark, Rocket, Users } from "lucide-react";
import { api, fmtDate, timeAgo } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useEcosystem } from "../lib/ecosystem";
import { useTracked } from "../lib/useTracked";
import { useInterest } from "../lib/useInterest";
import { STAGE_LABEL, NEED_LABEL } from "../lib/navigator";
import { Avatar, Spinner, cx } from "./ui";
import { ProgramDrawer } from "./ProgramCards";

// Home for a hub that works as an ecosystem (config.ecosystem, see lib/ecosystem.js): not a feed of what happened, but one ranked list of what
// to DO next. Programs and grants, events, people and resources each get scored against the founder's startup profile and merged, so the
// top of the page answers "what should I do this week?". GET /navigator/moves (rules in lib/moves.js).

const heading = { textTransform: "none", letterSpacing: "-0.02em", fontWeight: 700 };
// One look per kind, so a row says what it is before you read it. Colours come from the hub's own palette where possible.
const KIND = {
  program: { label: "Program", Icon: Rocket, color: "#6D5BD0" },
  grant: { label: "Grant", Icon: Landmark, color: "#1B9C8E" },
  event: { label: "Event", Icon: Calendar, color: "var(--accent)" },
  person: { label: "Person", Icon: Users, color: "#E76F51" },
  resource: { label: "Resource", Icon: BookOpen, color: "#C98A12" },
};
const TABS = [["all", "All"], ["program", "Programs"], ["grant", "Grants"], ["event", "Events"], ["person", "People"], ["resource", "Resources"]];
const dayShort = (iso) => { try { return new Date(String(iso).slice(0, 10) + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return ""; } };
const daysFromNow = (iso, today) => Math.round((new Date(String(iso).slice(0, 10) + "T12:00:00Z") - new Date(today + "T12:00:00Z")) / 86400000);

function KindTile({ kind, size = 44 }) {
  const { Icon, color } = KIND[kind];
  return <span className="flex shrink-0 items-center justify-center rounded-xl" style={{ width: size, height: size, background: `color-mix(in srgb, ${color} 14%, transparent)`, color }} aria-hidden><Icon className="h-5 w-5" strokeWidth={2.1} /></span>;
}

function Row({ m, today, onOpen, hub }) {
  const nav = useNavigate();
  const k = KIND[m.kind];
  const go = () => {
    if (m.kind === "program" || m.kind === "grant") onOpen(m.program);
    else if (m.kind === "event") nav(`/events/${m.id}`);
    else if (m.kind === "person") nav(`/members/${m.id}`);
    else nav("/resources");
  };
  const when = m.at ? fmtDate(m.at, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : m.deadline ? `Closes ${dayShort(m.deadline)}` : "";
  const left = m.deadline ? daysFromNow(m.deadline, today) : null;
  return (
    <li>
      <button type="button" onClick={go} data-testid={`move-${m.kind}-${m.id}`} className="grid w-full grid-cols-[44px_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5 py-3.5 text-left first:pt-1 last:pb-1 sm:grid-cols-[44px_minmax(0,1fr)_auto]">
        {m.kind === "person" ? <Avatar name={m.title} size={44} /> : <KindTile kind={m.kind} />}
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[10px] font-semibold uppercase" style={{ letterSpacing: "0.14em", color: k.color }}>{k.label}</span>
            {m.badge && <span className="rounded-full bg-ink/[.07] px-2 py-0.5 text-[10px] font-semibold text-muted">{m.badge === "Humber" ? `At ${hub}` : m.badge.replace("Humber", hub)}</span>}
          </span>
          <span className="mt-0.5 block text-[15px] font-semibold leading-snug">{m.title}</span>
          {m.sub && <span className="block truncate text-xs text-muted">{m.sub}</span>}
          {m.reason && <span className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-snug text-ink/80"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden /><span>{m.reason}</span></span>}
        </span>
        <span className="col-start-2 flex flex-row flex-wrap items-center gap-x-3 gap-y-1 sm:col-start-3 sm:row-start-1 sm:flex-col sm:items-end sm:gap-1.5 sm:pt-0.5 sm:text-right">
          {when && <span className={cx("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", left != null && left <= 14 ? "bg-red-500/15 text-red-600" : "bg-ink/[.07] text-ink/80")}>{when}</span>}
          <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: k.color }}>{m.action}<ArrowRight className="h-3.5 w-3.5" aria-hidden /></span>
        </span>
      </button>
    </li>
  );
}

export default function EcosystemHome() {
  const { account } = useAuth();
  const eco = useEcosystem();
  const hub = eco.hub;
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState("all");
  const [open, setOpen] = useState(null);
  const [news, setNews] = useState([]);
  const { tracked, setTracked, track } = useTracked();
  const itc = useInterest();
  useEffect(() => {
    document.title = `Your next moves · ${hub}`;
    api.get("/navigator/moves").then((r) => { setD(r.data); }).catch(() => setErr(true));
    api.get("/announcements").then((r) => setNews((r.data || []).slice(0, 2))).catch(() => {});
    api.get("/navigator/me").then((r) => { setTracked(r.data.tracked || []); itc.setInterest(r.data.interest || []); }).catch(() => {});
  }, [account?.startup]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = account?.startup || {};
  const first = (account?.name || "").split(/\s+/)[0];
  const rows = useMemo(() => {
    if (!d) return [];
    if (tab === "all") return d.moves;
    return (d.lists[tab] || []).slice(0, 6);
  }, [d, tab]);
  if (err) return <p className="card text-sm text-muted">Your next moves could not load. Please try again in a moment.</p>;
  if (!d) return <Spinner />;
  const c = d.counts;
  const TILES = [
    ["/navigator", "Programs & grants", c.program + c.grant, "open to you", Compass],
    ["/events", "Events", c.event, "in the next 30 days", Calendar],
    ["/members", "People", c.person, "worth meeting", Users],
    ["/resources", "Resources", c.resource, "for your stage", BookOpen],
  ];
  return (
    <div className="space-y-6" data-testid="eco-home">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">{hub} · {eco.city}</p>
          <h1 className="mt-2 text-3xl sm:text-4xl" style={{ ...heading, letterSpacing: "-0.03em", textWrap: "balance" }}>{first ? `${first}, ` : ""}{eco.home_title.charAt(0).toLowerCase() + eco.home_title.slice(1)}</h1>
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="eco-tiles">
        {TILES.map(([to, label, n, hint, Icon]) => (
          <Link key={label} to={to} className="card card-hover !p-4">
            <span className="flex items-center justify-between"><span className="text-sm font-semibold">{label}</span><Icon className="h-4 w-4 text-muted" aria-hidden /></span>
            <span className="mt-3 block text-3xl font-bold tabular-nums" style={{ letterSpacing: "-0.02em" }}>{n}</span>
            <span className="text-xs text-muted">{hint}</span>
          </Link>
        ))}
      </div>

      <section className="card !p-5 sm:!p-6" data-testid="eco-moves">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl" style={heading}>{tab === "all" ? "Your next moves" : `${TABS.find((t) => t[0] === tab)[1]} for you`}</h2>
            <p className="mt-1 text-xs text-muted">{tab === "all" ? "The best things to do first, from everything at Humber. Each says why." : "Best match first."}</p>
          </div>
        </div>
        <div className="pw-rail -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter your next moves">
          {TABS.map(([k, label]) => {
            const n = k === "all" ? null : c[k];
            const on = tab === k;
            return (
              <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={on} data-testid={`eco-tab-${k}`}
                className={cx("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition", on ? "border-transparent font-semibold" : "border-line text-muted hover:text-ink")}
                style={on ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{label}{n != null && <span className="text-xs opacity-70">{n}</span>}</button>
            );
          })}
        </div>
        {rows.length ? <ul className="mt-4 divide-y divide-line" data-testid="eco-rows">{rows.map((m) => <Row key={`${m.kind}-${m.id}`} m={m} today={d.as_of} onOpen={setOpen} hub={hub} />)}</ul>
          : <p className="mt-4 rounded-2xl bg-ink/[.04] p-4 text-sm text-muted">Nothing here yet. Add your startup details to your profile and this fills in.</p>}
        {tab === "all" && <p className="mt-4 border-t border-line pt-4 text-xs text-muted">Pick a type above to see all of it, or <Link to="/navigator" className="font-semibold text-ink underline underline-offset-2">open Programs &amp; grants</Link> for the full list.</p>}
      </section>

      <div className={cx("grid gap-4", eco.wider && "lg:grid-cols-[1.4fr_1fr]")}>
        <section className="card" data-testid="eco-news">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg" style={heading}>News from {hub}</h2><Link to="/updates" className="text-xs text-muted hover:text-ink">All ›</Link></div>
          {news.length ? <ul className="divide-y divide-line">{news.map((a) => <li key={a.id} className="py-3 first:pt-0 last:pb-0"><p className="text-sm font-semibold">{a.title}</p><p className="mt-0.5 line-clamp-2 text-xs text-muted">{a.body}</p><p className="mt-1 text-[11px] text-muted">{timeAgo(a.published_at || a.created_at)}</p></li>)}</ul> : <p className="text-sm text-muted">No news right now.</p>}
        </section>
        {eco.wider && <section className="card flex flex-col" data-testid="eco-zoom">
          <h2 className="text-lg" style={heading}>Beyond {hub}</h2>
          <p className="mt-1 text-sm text-muted">This is {hub}&rsquo;s slice of one navigator. The same view works for a region or the whole country.</p>
          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            <Link to="/navigator?scope=all" className="btn-ghost !py-2 text-sm" data-testid="eco-widen">Programs across Canada<ArrowRight className="h-4 w-4" /></Link>
            <Link to="/founder-events" className="btn-ghost !py-2 text-sm">Events nearby<ArrowRight className="h-4 w-4" /></Link>
          </div>
        </section>}
      </div>

      <ProgramDrawer p={open} onClose={() => setOpen(null)} tracked={tracked} onTrack={track} interest={itc} stage={st.stage || "idea"} eco={eco} />
    </div>
  );
}
