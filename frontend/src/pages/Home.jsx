import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUp, ArrowUpRight, Plus, Rocket, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { groupOf } from "../lib/communityGroup";
import { TYPE_LABEL } from "../lib/navigator";
import { deadlineInfo, leadReason, tint, typeMeta } from "../lib/programStyle";
import { Ring, Status } from "../components/NavBits";
import { DeadlineChip, ProgramDrawer, TypeTile } from "../components/ProgramCards";
import Trajectory from "../components/Trajectory";
import { useTracked } from "../lib/useTracked";
import { useInterest } from "../lib/useInterest";
import { useShell } from "../components/AccountShell";
import { Avatar, Spinner, cx } from "../components/ui";

// Home: where you are, and the single best thing to do next. Everything here is read from your one profile and the programs every community
// lists (GET /navigator/home), so it changes the moment either does. Innovation only: your leisure communities live under their own heading.

const hello = () => { const h = new Date().getHours(); return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
const SUGGEST = ["What should I do next?", "What is closing soon?", "Which communities fit me?"];

function Tile({ to, onClick, n, label, hint }) {
  const cls = "group rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-ink/30";
  const body = <><p className="stat text-3xl">{n}</p><p className="mt-2 text-sm font-semibold">{label}</p><p className="text-xs text-muted">{hint}</p></>;
  return to ? <Link to={to} className={cls}>{body}</Link> : <button type="button" onClick={onClick} className={cls}>{body}</button>;
}
function Initials({ c, size = 44 }) {
  const col = c.brand?.colors || {};
  return (
    <span className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line/60" style={{ width: size, height: size, background: col.background || "rgb(var(--c-ink) / 0.08)" }}>
      {c.brand?.logo_url ? <img src={c.brand.logo_url} alt="" className="max-h-[72%] max-w-[78%] object-contain" /> : <span className="text-sm font-bold" style={{ color: col.accent || "inherit" }}>{(c.name || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>}
    </span>
  );
}

const H = { textTransform: "none", letterSpacing: "-0.01em", fontWeight: 700 };
const Cap = ({ children, className = "" }) => <p className={cx("text-[11px] font-semibold uppercase text-muted", className)} style={{ letterSpacing: "0.12em" }}>{children}</p>;

// Every box below the hero is the same kind of widget: a plain title, one line saying what it is, the rows, and one link pinned to the bottom.
function HomeWidget({ title, sub, to, cta, testId, linkId, children }) {
  return (
    <section className="flex flex-col rounded-3xl border border-line bg-surface p-5" data-testid={testId}>
      <h2 className="text-lg" style={H}>{title}</h2>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
      <div className="mt-3 flex-1">{children}</div>
      {to && <Link to={to} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold hover:underline" data-testid={linkId}>{cta}<ArrowRight className="h-4 w-4" aria-hidden /></Link>}
    </section>
  );
}
const Rows = ({ children }) => <ul className="divide-y divide-line">{children}</ul>;
const Quiet = ({ children }) => <p className="rounded-2xl bg-ink/[.04] p-4 text-sm text-muted">{children}</p>;

// What you can apply to now: programs closing in the next 45 days first (soonest on top), then other open programs that fit. Tapping one opens its details.
function ApplyNow({ soon, more, onOpen }) {
  const rows = [...soon, ...more.filter((m) => !soon.some((x) => x.id === m.id) && m.status !== "closed" && m.status !== "paused")].slice(0, 4);
  return (
    <HomeWidget title="Apply now" sub="Programs open to you. The ones closing soonest are on top." to="/navigator" cta="See all programs" testId="home-soon">
      {rows.length ? (
        <Rows>
          {rows.map((m) => {
            const { color } = typeMeta(m.type); const dl = deadlineInfo(m); const timed = dl && m.days_left != null;
            return (
              <li key={m.id}>
                <button type="button" onClick={() => onOpen(m)} data-testid={`soon-${m.id}`} className="flex w-full items-center gap-3 py-3 text-left first:pt-1 last:pb-0">
                  {timed ? (
                    <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl leading-none" style={{ background: tint(color, 0.14) }} aria-hidden>
                      <span className="stat text-xl" style={{ color: m.days_left <= 14 ? "#F87171" : color }}>{m.days_left}</span>
                      <span className="mt-0.5 text-[9px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.1em" }}>{m.days_left === 1 ? "day" : "days"}</span>
                    </span>
                  ) : <TypeTile type={m.type} size={48} />}
                  <span className="min-w-0 flex-1"><span className="line-clamp-2 block text-sm font-semibold leading-snug">{m.name}</span><span className="block truncate text-xs text-muted">{timed ? `${m.org} · closes ${dl.date}` : `${m.org} · ${TYPE_LABEL[m.type] || m.type}`}</span></span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                </button>
              </li>
            );
          })}
        </Rows>
      ) : <Quiet>Nothing open to you right now. New programs show up here as they open.</Quiet>}
    </HomeWidget>
  );
}

// A short version of your path: what you want next, and the best resource for each. The full path lives on /journey.
function PathCard({ onPick }) {
  const [r, setR] = useState(null);
  useEffect(() => { api.get("/navigator/route").then((x) => setR(x.data)).catch(() => setR(false)); }, []);
  if (r && !r.has_profile) return null;
  const rows = r ? r.steps.filter((s) => s.resources.length).slice(0, 3) : [];
  return (
    <HomeWidget title="Your path" sub="The best resource for each thing you want next." to="/journey" cta={r && r.steps.length ? "See your whole path" : "Build your path"} testId="home-journey" linkId="home-journey-link">
      {r === null ? <Quiet>Loading…</Quiet> : r === false ? <Quiet>Your path is not available right now.</Quiet> : rows.length ? (
        <Rows>
          {rows.map((s) => (
            <li key={s.need}>
              <button type="button" onClick={() => onPick(s.resources[0])} className="flex w-full items-center gap-3 py-3 text-left first:pt-1 last:pb-0" data-testid={`home-path-${s.need}`}>
                <span className="min-w-0 flex-1"><Cap>{s.title}</Cap><span className="mt-1 block text-sm font-semibold leading-snug">{s.resources[0].name}</span></span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              </button>
            </li>
          ))}
        </Rows>
      ) : <Quiet>Pick what you want next and your path appears here.</Quiet>}
    </HomeWidget>
  );
}

// The next few events that fit you. The whole list, with filters, lives on /founder-events.
function EventsCard() {
  const [r, setR] = useState(null);
  useEffect(() => { api.get("/founder-events").then((x) => setR(x.data)).catch(() => setR(false)); }, []);
  const rows = r ? r.events.slice(0, 3) : [];
  const dayOf = (e) => (e.days_away === 0 ? "Today" : e.days_away === 1 ? "Tomorrow" : new Date(e.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }));
  return (
    <HomeWidget title="Events near you" sub="Upcoming networking and founder events that fit what you asked for." to="/founder-events" cta="See all events" testId="home-events" linkId="home-events-link">
      {r === null ? <Quiet>Loading…</Quiet> : r === false ? <Quiet>Events are not available right now.</Quiet> : rows.length ? (
        <Rows>
          {rows.map((e) => (
            <li key={e.id}>
              <a href={e.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 py-3 first:pt-1 last:pb-0" data-testid={`home-event-${e.id}`}>
                <span className="min-w-0 flex-1"><Cap>{dayOf(e)}{e.online ? " · Online" : e.city ? ` · ${e.city}` : ""}</Cap><span className="mt-1 block text-sm font-semibold leading-snug">{e.title}</span></span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              </a>
            </li>
          ))}
        </Rows>
      ) : <Quiet>No upcoming events yet. We check event pages twice a day.</Quiet>}
    </HomeWidget>
  );
}

// A few people from the talent pool, best fit first. The whole pool, with filters and message requests, lives on /talent.
function TalentCard() {
  const [r, setR] = useState(null);
  useEffect(() => { api.get("/talent").then((x) => setR(x.data)).catch(() => setR(false)); }, []);
  const rows = r ? r.results.slice(0, 3) : [];
  return (
    <HomeWidget title="People to meet" sub="Developers, marketers, sales people, accountants and startups who chose to be found." to="/people" cta="Browse people" testId="home-talent">
      {r === null ? <Quiet>Loading…</Quiet> : r === false ? <Quiet>Talent is not available right now.</Quiet> : rows.length ? (
        <Rows>
          {rows.map((p) => (
            <li key={p.id}>
              <Link to={`/people/${p.id}`} className="flex items-center gap-3 py-3 first:pt-1 last:pb-0" data-testid={`home-talent-${p.id}`}>
                <Avatar src={p.avatar_url} name={p.name} size={40} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="line-clamp-2 block text-xs leading-snug text-muted">{p.headline}</span></span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </Rows>
      ) : <Quiet>No one has joined the pool yet. Add your own profile to be one of the first.</Quiet>}
    </HomeWidget>
  );
}

// Communities you are in, then ones that fit you.
function CommunitiesCard({ mine, suggested, onEnter }) {
  const rows = [...mine.map((c) => ({ c, joined: true })), ...suggested.map((c) => ({ c, joined: false }))].slice(0, 3);
  return (
    <HomeWidget title="Communities" sub="The ones you are in, and others that fit your startup." to="/hub?v=innovation" cta="See all communities" testId="home-communities">
      {rows.length ? (
        <Rows>
          {rows.map(({ c, joined }) => (
            <li key={c.slug} className="flex items-center gap-3 py-3 first:pt-1 last:pb-0" data-testid={joined ? `home-joined-${c.slug}` : `home-suggest-${c.slug}`}>
              <Initials c={c} size={40} />
              <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-semibold leading-snug">{c.name}</p><p className="truncate text-xs text-muted">{joined ? `You're in · ${c.members} members` : (c.reasons || [])[0] || c.kind}</p></div>
              {joined
                ? <button type="button" onClick={() => onEnter(c)} className="shrink-0 rounded-lg px-3.5 py-1.5 text-sm font-semibold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>Enter</button>
                : <Link to={`/c/${c.slug}`} className="shrink-0 rounded-lg border border-line px-3.5 py-1.5 text-sm font-semibold hover:border-ink/40">View</Link>}
            </li>
          ))}
        </Rows>
      ) : <Link to="/hub?v=innovation" className="flex items-center gap-2 rounded-2xl bg-ink/[.04] p-4 text-sm text-muted hover:text-ink"><Plus className="h-4 w-4" aria-hidden />Find a community to join</Link>}
    </HomeWidget>
  );
}

export default function Home({ items, onEnter }) {
  const { account } = useAuth();
  const nav = useNavigate();
  const shell = useShell();
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState("");
  const { tracked, setTracked, track } = useTracked();
  const itc = useInterest();
  useEffect(() => { api.get("/navigator/home").then((r) => { setD(r.data); setTracked(r.data.tracked || []); itc.setInterest(r.data.interest || []); }).catch(() => setD({ has_profile: false, completeness: { percent: 0, missing: [] } })); }, [account?.startup, setTracked, itc.sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const mineInnovation = useMemo(() => (items || []).filter((c) => c.my?.status === "approved" && groupOf(c) === "innovation"), [items]);
  const first = (account?.name || "").split(/\s+/)[0];
  const ask = (text) => shell?.openGuide(text);

  if (!d) return <Spinner />;
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const head = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow">{today}</p>
        <h1 className="mt-2 text-3xl sm:text-4xl" style={{ textTransform: "none", letterSpacing: "-0.03em", fontWeight: 800 }}>{hello()}{first ? `, ${first}` : ""}.</h1>
      </div>
      {d.has_profile && (
        <Link to="/me?edit=startup" className="group inline-flex max-w-full items-center gap-2.5 rounded-full border border-line py-1.5 pl-2 pr-4 text-sm hover:border-ink/30" data-testid="home-startup-pill">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Rocket className="h-3.5 w-3.5" aria-hidden /></span>
          <span className="min-w-0 truncate font-medium">{d.startup.name || "Your startup"}</span><span className="hidden capitalize text-muted sm:inline">· {d.startup.stage_label}</span>
        </Link>
      )}
    </div>
  );

  // No startup on the profile yet: one clear thing to do.
  if (!d.has_profile) {
    return (
      <div className="mx-auto max-w-5xl space-y-8" data-testid="home">
        {head}
        <section className="relative overflow-hidden rounded-3xl border border-line p-6 sm:p-10" style={{ background: "radial-gradient(120% 140% at 100% 0%, rgb(var(--c-ink) / 0.10) 0%, transparent 55%), rgb(var(--c-surface))" }} data-testid="home-empty">
          <p className="eyebrow">Step 1 of 3</p>
          <h2 className="mt-3 max-w-xl text-3xl sm:text-4xl" style={{ textTransform: "none", letterSpacing: "-0.03em", fontWeight: 800, textWrap: "balance" }}>Tell us where your startup is at, once.</h2>
          <p className="mt-3 max-w-xl text-base text-muted">It takes about a minute. From then on this page picks your best next step, counts down your deadlines and suggests the communities that fit, and it updates whenever your profile does.</p>
          <div className="mt-6 flex flex-wrap gap-2"><Link to="/me?edit=startup" className="btn-primary !px-6 !py-3" data-testid="home-add-startup">Add your startup<ArrowRight className="h-4 w-4" /></Link><Link to="/navigator" className="btn-ghost !px-6 !py-3">Browse programs</Link></div>
          <ol className="mt-10 grid gap-4 sm:grid-cols-3">
            {[["Your profile", "Stage, what you need, what you build."], ["Your next step", "The program that fits you best, and why."], ["Your people", "Mentors and communities that match."]].map(([t, b], i) => (
              <li key={t} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-ink/30 text-xs font-bold">{i + 1}</span><span><span className="block text-sm font-semibold">{t}</span><span className="block text-sm text-muted">{b}</span></span></li>
            ))}
          </ol>
        </section>
      </div>
    );
  }

  const hero = d.top[0];
  const heroDl = hero ? deadlineInfo(hero) : null;
  const heroColor = hero ? typeMeta(hero.type).color : "#888";
  const soonAll = d.closing_soon || [];
  const comp = d.completeness || { percent: 0, missing: [] };
  return (
    <div className="mx-auto max-w-6xl space-y-6" data-testid="home">
      {head}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="min-w-0 space-y-6">
          {hero && (
            <section className="relative overflow-hidden rounded-3xl border border-line p-6 sm:p-8" data-testid="home-hero"
              style={{ background: `radial-gradient(90% 120% at 100% 0%, ${tint(heroColor, 0.22)} 0%, transparent 60%), rgb(var(--c-surface))` }}>
              <div className="flex items-start justify-between gap-4">
                <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase" style={{ letterSpacing: "0.16em", color: heroColor }}><Sparkles className="h-3.5 w-3.5" aria-hidden />Your next best step</p>
                {heroDl && (
                  <div className="text-right"><p className="stat text-5xl" style={{ color: heroDl.urgent ? "#F87171" : heroColor }}>{heroDl.days}</p><p className="mt-1 text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.14em" }}>days left</p></div>
                )}
              </div>
              <div className="mt-4 flex items-center gap-3"><TypeTile type={hero.type} size={44} /><div className="min-w-0"><p className="text-xs font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{TYPE_LABEL[hero.type] || hero.type}</p><p className="truncate text-sm text-muted">{hero.org}</p></div></div>
              <h2 className="mt-4 max-w-2xl text-3xl leading-tight sm:text-4xl" style={{ textTransform: "none", letterSpacing: "-0.03em", fontWeight: 800, textWrap: "balance" }}>{hero.name}</h2>
              {leadReason(hero) && <p className="mt-3 max-w-xl text-base text-ink/85">{leadReason(hero)}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2"><Status status={hero.status} /><DeadlineChip p={hero} /></div>
              <div className="mt-6 grid gap-2 sm:flex sm:flex-wrap">
                <button type="button" onClick={() => setOpen(hero)} className="btn-primary !px-6 !py-3" data-testid="home-hero-open">See the details<ArrowRight className="h-4 w-4" /></button>
                <button type="button" onClick={() => ask(`Why is ${hero.name} a good fit for me?`)} className="btn-ghost !px-5 !py-3">Why this one?</button>
              </div>
            </section>
          )}

          <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) { ask(q.trim()); setQ(""); } }} className="rounded-2xl border border-line bg-surface p-3 sm:p-4" data-testid="home-ask">
            <div className="flex items-center gap-2">
              <Sparkles className="ml-1 h-5 w-5 shrink-0 text-muted" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder="Ask about a program, a deadline, a community…" aria-label="Ask the guide" data-testid="home-ask-input" className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none placeholder:text-muted" />
              <button type="submit" disabled={!q.trim()} aria-label="Ask" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-30" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><ArrowUp className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 border-t border-line pt-3">{SUGGEST.map((s) => <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-ink">{s}</button>)}</div>
          </form>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-stretch" data-testid="home-widgets">
            <ApplyNow soon={soonAll} more={d.top.slice(1)} onOpen={(m) => setOpen(m)} />
            <EventsCard />
            <TalentCard />
            <PathCard onPick={(r) => setOpen(r)} />
          </div>
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-3xl border border-line bg-surface p-5" data-testid="home-path">
            <h2 className="text-lg" style={{ textTransform: "none", letterSpacing: "-0.01em", fontWeight: 700 }}>Your trajectory</h2>
            <p className="mb-4 mt-1 text-xs text-muted">Where you came from, where you are, what opens up next.</p>
            <Trajectory compact data={d.trajectory} tracked={tracked} onPick={(r) => setOpen(r)} />
            <Link to="/navigator" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold hover:underline">See the full route<ArrowRight className="h-4 w-4" aria-hidden /></Link>
          </section>

          <CommunitiesCard mine={mineInnovation} suggested={(d.communities || []).filter((c) => !mineInnovation.some((m) => m.slug === c.slug))} onEnter={onEnter} />

          <div className="grid grid-cols-2 gap-3">
            <Tile to="/navigator" n={d.matched ?? d.top.length} label="Programs fit" hint="matched to you" />
            <Tile to="/navigator" n={d.new_count || 0} label="New" hint="since you last looked" />
            <Tile to="/navigator" n={soonAll.length} label="Closing soon" hint="within 45 days" />
            <Tile to="/hub?v=innovation" n={mineInnovation.length} label="Communities" hint="joined" />
          </div>

          <section className="rounded-3xl border border-line bg-surface p-5" data-testid="home-profile">
            <div className="flex items-center gap-4"><Ring percent={comp.percent} size={60} /><div className="min-w-0"><p className="text-sm font-semibold">Profile {comp.percent}% complete</p><p className="text-xs text-muted">{comp.missing?.length ? `Add ${comp.missing[0].label} for sharper matches.` : "Everything the matches need is in."}</p></div></div>
            <div className="mt-4 flex gap-2"><Link to="/me?edit=1" className="btn-ghost flex-1 !py-2 text-sm">{comp.missing?.length ? "Improve it" : "Edit"}</Link><Link to="/me" className="btn-ghost flex-1 !py-2 text-sm">View</Link></div>
          </section>
        </aside>
      </div>
      <ProgramDrawer p={open} onClose={() => setOpen(null)} tracked={tracked} onTrack={track} interest={itc} stage={d.trajectory?.current || d.startup?.stage || "idea"} />
    </div>
  );
}
