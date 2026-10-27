import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUp, CalendarClock, Compass, Plus, Rocket, Sparkles, Users } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { groupOf } from "../lib/communityGroup";
import { TYPE_LABEL } from "../lib/navigator";
import { deadlineInfo, leadReason, tint, typeMeta } from "../lib/programStyle";
import { Ring, Status } from "../components/NavBits";
import { DeadlineChip, ProgramDrawer, TypeTile } from "../components/ProgramCards";
import Trajectory from "../components/Trajectory";
import { useShell } from "../components/AccountShell";
import { Spinner, cx } from "../components/ui";

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

export default function Home({ items, onEnter }) {
  const { account } = useAuth();
  const nav = useNavigate();
  const shell = useShell();
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => { api.get("/navigator/home").then((r) => setD(r.data)).catch(() => setD({ has_profile: false, completeness: { percent: 0, missing: [] } })); }, [account?.startup]);
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
  const soon = soonAll.filter((m) => !hero || m.id !== hero.id); // the hero already counts its own days down
  const comp = d.completeness || { percent: 0, missing: [] };
  return (
    <div className="mx-auto max-w-6xl space-y-6" data-testid="home">
      {head}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
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

          {soon.length > 0 && (
            <section data-testid="home-soon">
              <div className="mb-3 flex items-end justify-between"><h2 className="text-lg" style={{ textTransform: "none", letterSpacing: "-0.01em", fontWeight: 700 }}>Closing soon</h2><Link to="/navigator" className="text-sm text-muted hover:text-ink">All programs</Link></div>
              <div className="pw-rail -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 xl:mx-0 xl:px-0">
                {soon.map((m) => {
                  const { color } = typeMeta(m.type);
                  return (
                    <button key={m.id} type="button" onClick={() => setOpen(m)} data-testid={`soon-${m.id}`} className="flex w-[240px] shrink-0 flex-col rounded-2xl border border-line p-4 text-left transition hover:border-ink/30" style={{ background: `linear-gradient(150deg, ${tint(color, 0.12)} 0%, transparent 60%), rgb(var(--c-surface))` }}>
                      <span className="flex items-start justify-between"><TypeTile type={m.type} size={36} /><span className="text-right"><span className="stat block text-3xl" style={{ color: m.days_left <= 14 ? "#F87171" : color }}>{m.days_left}</span><span className="text-[10px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>days</span></span></span>
                      <span className="mt-3 block text-[15px] font-semibold leading-snug">{m.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted">{m.org}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section data-testid="home-communities">
            <div className="mb-3 flex items-end justify-between"><h2 className="text-lg" style={{ textTransform: "none", letterSpacing: "-0.01em", fontWeight: 700 }}>Innovation communities</h2><Link to="/hub?v=innovation" className="text-sm text-muted hover:text-ink">See all</Link></div>
            <div className="grid gap-3 md:grid-cols-2">
              {mineInnovation.map((c) => (
                <div key={c.slug} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5" data-testid={`home-joined-${c.slug}`}>
                  <Initials c={c} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{c.name}</p><p className="truncate text-xs text-muted">You're in · {c.members} members</p></div>
                  <button type="button" onClick={() => onEnter(c)} className="rounded-lg px-3.5 py-1.5 text-sm font-semibold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>Enter</button>
                </div>
              ))}
              {(d.communities || []).filter((c) => !mineInnovation.some((m) => m.slug === c.slug)).map((c) => (
                <Link key={c.slug} to={`/c/${c.slug}`} className="flex items-center gap-3 rounded-2xl border border-dashed border-line p-3.5 transition hover:border-ink/40" data-testid={`home-suggest-${c.slug}`}>
                  <Initials c={c} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{c.name}</p><p className="line-clamp-2 text-xs text-muted">{(c.reasons || [])[0] || c.kind}</p></div>
                  <span className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold">View</span>
                </Link>
              ))}
              {mineInnovation.length === 0 && !(d.communities || []).length && <Link to="/hub?v=innovation" className="flex items-center gap-3 rounded-2xl border border-dashed border-line p-4 text-sm text-muted hover:text-ink"><Plus className="h-4 w-4" />Find an innovation community to join</Link>}
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-3xl border border-line bg-surface p-5" data-testid="home-path">
            <h2 className="text-lg" style={{ textTransform: "none", letterSpacing: "-0.01em", fontWeight: 700 }}>Your trajectory</h2>
            <p className="mb-4 mt-1 text-xs text-muted">Where you came from, where you are, what opens up next.</p>
            <Trajectory compact data={d.trajectory} onPick={(r) => setOpen(r)} />
            <Link to="/navigator" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold hover:underline">See the full route<ArrowRight className="h-4 w-4" aria-hidden /></Link>
          </section>

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
      <ProgramDrawer p={open} onClose={() => setOpen(null)} />
    </div>
  );
}
