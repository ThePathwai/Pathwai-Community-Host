import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Bookmark, CalendarDays, Check, ChevronDown, Compass, EyeOff, Flag, LayoutGrid, Pencil, Rocket, Rows, Search, SlidersHorizontal, Users } from "../components/icons";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Wordmark, PoweredBy, Spinner, cx } from "../components/ui";
import { NEED_HINT, NEED_LABEL, TYPE_LABEL } from "../lib/navigator";
import { startDemo } from "../lib/demo";
import { TIMING, deadlineInfo, leadReason, timingMatch, tint, typeMeta } from "../lib/programStyle";
import { DeadlineChip, FitMeter, ProgramCard, ProgramDrawer, TypeTile } from "../components/ProgramCards";
import { Status } from "../components/NavBits";
import { useTracked } from "../lib/useTracked";
import { useInterest } from "../lib/useInterest";
import { useEcosystem } from "../lib/ecosystem";
import Trajectory from "../components/Trajectory";
import ProfilePrompt from "../components/ProfilePrompt";
import AccountShell, { useShell } from "../components/AccountShell";
import GuideChat from "../components/GuideChat";
import FounderEvents from "./FounderEvents";
import HubPrograms from "../components/hub/HubPrograms";

// /navigator ("Programs"): the Canadian programs that fit YOU. Signed in, everything here is read from the one startup profile on your
// account (edit it in your profile, never here), so it is always in step with Home and the guide. Signed out there is no profile to
// read, so the page explains that and points at the two ways in. Community programs sit in the same list (see backend/navigator.py).

const DEFAULT = { stage: "idea", needs: ["funding", "mentorship"], audiences: [], sectors: [], province: "ON", city: "", age: "", incorporated: "unsure", employees: "", goal: "" };
// account profile -> the shape the suggest call expects
const fromAccount = (p) => ({ ...DEFAULT, ...p, age: p.age ? String(p.age) : "", employees: p.employees == null ? "" : String(p.employees), city: p.city || "",
  incorporated: p.incorporated === true ? "yes" : p.incorporated === false ? "no" : "unsure", needs: p.needs || [], audiences: p.audiences || [], sectors: p.sectors || [] });
const dayLabel = (iso) => { try { return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); } catch { return iso || ""; } };

function Pill({ on, onClick, children, testId, color }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} data-testid={testId}
      className={cx("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition", on ? "border-transparent font-semibold" : "border-line text-muted hover:text-ink")}
      style={on ? { background: color ? tint(color, 0.22) : "var(--accent)", color: color || "var(--on-accent)", boxShadow: color ? `inset 0 0 0 1px ${tint(color, 0.5)}` : undefined } : undefined}>{children}</button>
  );
}

// Pick when you can apply. Each chip shows how many in the list below it would match; chips with none are hidden so you never land on an empty list.
function TimingFilter({ value, onChange, list, testid = "nav-timing" }) {
  const n = (k) => list.filter((p) => timingMatch(k, p)).length;
  const opts = TIMING.map(([k, label]) => [k, label, n(k)]).filter(([k, , c]) => c > 0 || k === value);
  if (!opts.length) return null;
  return (
    <>
      <select className="input !rounded-xl !py-2.5 w-full sm:hidden" value={value} onChange={(e) => onChange(e.target.value)} aria-label="When you can apply" data-testid={`${testid}-select`}>
        <option value="">Any timing</option>
        {opts.map(([k, label, c]) => <option key={k} value={k}>{label} · {c}</option>)}
      </select>
      <div className="hidden flex-wrap gap-2 sm:flex" role="group" aria-label="Filter by timing" data-testid={testid}>
        <Pill on={!value} onClick={() => onChange("")} testId={`${testid}-all`}>Any timing</Pill>
        {opts.map(([k, label, c]) => <Pill key={k} on={value === k} onClick={() => onChange(value === k ? "" : k)} testId={`${testid}-${k}`}>{label}<span className="text-xs opacity-60">{c}</span></Pill>)}
      </div>
    </>
  );
}

function Segmented({ items, value, onChange }) {
  return (
    <div className="pw-rail inline-flex max-w-full overflow-x-auto rounded-full border border-line p-1" role="tablist">
      {items.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)} data-testid={`nav-tab-${k}`}
          className={cx("shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium transition sm:px-4 sm:text-sm", value === k ? "" : "text-muted hover:text-ink")}
          style={value === k ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{label}</button>
      ))}
    </div>
  );
}

function CommunityCard({ c }) {
  return (
    <Link to={`/c/${c.slug}`} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 transition hover:border-ink/30" data-testid={`com-${c.slug}`}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold" style={{ background: c.brand?.colors?.accent || "var(--accent)", color: "#fff" }}>{(c.name || "?").slice(0, 1)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{c.name}</span>
        <span className="block truncate text-xs text-muted">{c.kind}{c.city ? ` · ${c.city}` : ""}{c.members ? ` · ${c.members} members` : ""}</span>
        {(c.reasons || [])[0] && <span className="mt-2 flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /><span>{c.reasons[0]}</span></span>}
      </span>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted" aria-hidden />
    </Link>
  );
}

// Signed out: there is no profile to read yet, so there is nothing to fill in here. The page says so and points at the two ways in.
function SignedOutGate() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-line p-4 sm:p-10" style={{ background: "radial-gradient(110% 130% at 100% 0%, rgb(var(--c-ink) / 0.10) 0%, transparent 55%), rgb(var(--c-surface))" }} aria-label="Your profile" data-testid="nav-gate">
      <span className="flex h-10 w-10 items-center justify-center rounded-full sm:h-12 sm:w-12" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Rocket className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden /></span>
      <h2 className="mt-4 max-w-xl text-2xl leading-tight sm:mt-5 sm:text-4xl" style={{ textWrap: "balance", textTransform: "none", letterSpacing: "-0.03em", fontWeight: 800 }}>Your profile picks the programs</h2>
      <p className="mt-2 max-w-xl text-sm text-muted sm:mt-3 sm:text-base">Tell Pathwai about your startup once. Your programs, events, deadlines and the guide all follow it and update when it changes. Free, and nothing to fill in on this page.</p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Link to="/signup?for=founder" className="btn-primary !px-6 !py-3 text-sm" data-testid="nav-gate-signup">Create your profile<ArrowRight className="h-4 w-4" /></Link>
        <Link to="/login?next=navigator" className="btn-ghost !px-6 !py-3 text-sm" data-testid="nav-gate-signin">Sign in</Link>
      </div>
      <div className="pointer-events-none absolute -right-6 top-8 hidden w-[380px] space-y-3 lg:block xl:right-10" aria-hidden data-testid="nav-gate-peek">
        {[["grant", "Grant", "NRC IRAP", "Covers part of your R&D costs", "strong", "translate-x-0"], ["accelerator", "Accelerator", "Velocity Incubator", "Built for founders at your stage", "strong", "-translate-x-6"], ["mentorship", "Mentorship", "Founder Office Hours", "Gives you mentors, which you asked for", "possible", "translate-x-2"]].map(([t, l, n, r, f, tr]) => (
          <div key={n} className={cx("rounded-2xl border border-line bg-surface p-4 shadow-xl", tr)} style={{ background: `linear-gradient(140deg, ${tint(typeMeta(t).color, 0.12)} 0%, transparent 55%), rgb(var(--c-surface))` }}>
            <div className="flex items-center gap-3"><TypeTile type={t} size={36} /><div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{l}</p><p className="font-semibold leading-tight">{n}</p></div><FitMeter fit={f} showLabel={false} /></div>
            <p className="mt-2 flex gap-2 text-sm text-ink/80"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{r}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 rounded-2xl bg-ink/[.05] p-4 sm:max-w-xl">
        <p className="text-sm font-semibold">See it first</p>
        <p className="mt-1 text-sm text-muted">Open a sample founder to see how one profile picks the programs, events and next steps. Nothing you do there is saved.</p>
        <button type="button" onClick={() => startDemo("founder")} className="btn-ghost mt-3 !py-2 text-sm" data-testid="nav-gate-demo">Open the sample founder<ArrowRight className="h-4 w-4" /></button>
      </div>
    </section>
  );
}

const monthDay = (iso) => { try { const d = new Date(iso + "T12:00:00"); return [d.toLocaleDateString(undefined, { month: "short" }), d.getDate()]; } catch { return ["", ""]; } };

function Panel({ title, sub, action, children, className, testId }) {
  return (
    <section className={cx("rounded-3xl border border-line bg-surface p-4 sm:p-6", className)} data-testid={testId}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1 basis-48"><h2 className="text-base font-semibold sm:text-lg" style={{ textTransform: "none", letterSpacing: "-0.02em" }}>{title}</h2>{sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

// Signed out: the rest of the page shows what is actually in the catalog, so there is a reason to look around before signing up.
// Everything here is real data (the public program list and the public events feed); nothing is made up for the page.
function SignedOutShowcase({ meta, onOpen, onBrowse }) {
  const [progs, setProgs] = useState(null);
  const [evs, setEvs] = useState(null);
  const [evTotal, setEvTotal] = useState(0);
  useEffect(() => {
    api.get("/navigator/programs").then((r) => setProgs(r.data.programs || [])).catch(() => setProgs([]));
    api.get("/founder-events").then((r) => { setEvs((r.data.events || []).slice(0, 5)); setEvTotal((r.data.events || []).length + (r.data.others || []).length); }).catch(() => setEvs([]));
  }, []);
  const evN = meta.events ?? evTotal;
  const counts = useMemo(() => (progs || []).reduce((m, p) => { m[p.type] = (m[p.type] || 0) + 1; return m; }, {}), [progs]);
  // An event is a resource, so Events sits beside the kinds of program, with its own count.
  const tiles = useMemo(() => {
    const all = [...(meta.types || []).filter((t) => counts[t.key]).map((t) => ({ ...t, n: counts[t.key] })), ...(evN ? [{ key: "events", label: "Events", n: evN }] : [])].sort((a, b) => b.n - a.n);
    const top = all.slice(0, 8);
    const evTile = all.find((t) => t.key === "events");
    if (evTile && !top.includes(evTile)) top[top.length - 1] = evTile;
    const at = top.indexOf(evTile);
    if (evTile && at > 5) { top.splice(at, 1); top.splice(5, 0, evTile); }   // Events always shows, however few there are today, and phones only show the first six tiles
    return top;
  }, [meta, counts, evN]);
  // Open now: taking applications or open all year, programs read on their own page first, then the ones that say what they are worth.
  const picks = useMemo(() => {
    const rank = { grant: 0, loan: 1, tax_credit: 2, accelerator: 3, incubator: 4, mentorship: 5 };
    const ok = (progs || []).filter((p) => (p.status === "open" || p.status === "rolling") && p.type in rank);
    ok.sort((a, b) => (b.verified === "official") - (a.verified === "official") || (!!b.amount - !!a.amount) || rank[a.type] - rank[b.type]);
    const seen = new Set();
    const out = [];
    for (const p of ok) { if (seen.has(p.org)) continue; seen.add(p.org); out.push(p); if (out.length >= 6) break; }
    return out;
  }, [progs]);
  if (!progs) return null;
  const total = progs.length;
  const official = progs.filter((p) => p.verified === "official").length;
  const STEPS = [["Tell us about your startup once", "Stage, province, what you need. It lives in your profile, so there is no form on this page."], ["Programs sort themselves", "Every program shows why it may fit you and why it may not, so you can skip the ones that do not."], ["Ask the guide", "Ask in plain words what to apply to first, and what a program wants from you."]];
  return (
    <div className="mt-6 space-y-6" data-testid="nav-showcase">
      <Panel title="What is on Pathwai" sub={`${(total + evN).toLocaleString()} resources across Canada: ${total} programs and ${evN} upcoming events. Pick a kind to browse it.`} action={<button type="button" onClick={() => onBrowse("")} className="btn-ghost !py-2 text-sm" data-testid="nav-show-all">Browse all<ArrowRight className="h-4 w-4" /></button>} testId="nav-tiles">
        <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2.5 sm:grid-cols-[repeat(3,minmax(0,1fr))] sm:gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr))]">
          {tiles.map((t) => (
            <button key={t.key} type="button" onClick={() => onBrowse(t.key)} className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-line p-2.5 text-left transition hover:border-ink/40 max-sm:[&:nth-child(n+7)]:hidden sm:gap-3 sm:p-3" data-testid={`nav-tile-${t.key}`}>
              <TypeTile type={t.key} size={32} />
              <span className="min-w-0"><span className="block truncate text-sm font-semibold leading-tight">{t.label}</span><span className="block text-xs tabular-nums text-muted">{t.n}</span></span>
            </button>
          ))}
        </div>
      </Panel>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Open for applications" sub="Taking applications now, or open all year." testId="nav-open-now">
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-[repeat(2,minmax(0,1fr))] [&>li:nth-child(n+5)]:hidden sm:[&>li:nth-child(n+5)]:block">
            {picks.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onOpen(p)} className="flex h-full w-full items-start gap-3 rounded-2xl border border-line p-3 text-left transition hover:border-ink/40">
                  <TypeTile type={p.type} size={36} />
                  <span className="min-w-0 flex-1"><span className="block font-semibold leading-snug" style={{ textWrap: "balance" }}>{p.name}</span><span className="block truncate text-sm text-muted">{p.org}</span>
                    {p.amount && <span className="mt-1.5 inline-flex max-w-full rounded-md px-2 py-0.5 text-xs font-semibold" style={{ background: "var(--accent-soft, rgb(var(--c-ink) / 0.08))" }}><span className="truncate">{p.amount.length > 48 ? p.amount.slice(0, 45).trimEnd() + "..." : p.amount}</span></span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Upcoming events" sub="Networking, pitch and learning events for founders." testId="nav-events">
          {evs && evs.length ? (
            <ul className="space-y-1 [&>li:nth-child(n+4)]:hidden sm:[&>li:nth-child(n+4)]:block">
              {evs.map((e) => { const [m, d] = monthDay(e.date); return (
                <li key={e.id}>
                  <a href={e.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-ink/[.05]">
                    <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-ink/[.06]"><span className="text-[10px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.08em" }}>{m}</span><span className="text-lg font-bold leading-none tabular-nums">{d}</span></span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{e.title}</span><span className="block truncate text-sm text-muted">{[e.org, e.online ? "Online" : e.city].filter(Boolean).join(" · ")}</span></span>
                  </a>
                </li>
              ); })}
            </ul>
          ) : <p className="text-sm text-muted">No events are listed right now. Check back soon.</p>}
          <p className="mt-3 text-xs text-muted">Create a profile and these are picked for your stage and province.</p>
        </Panel>
      </div>
      <Panel title="How it works" testId="nav-how">
        <ol className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
          {STEPS.map(([h, d], i) => (
            <li key={h} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink/10 text-sm font-bold">{i + 1}</span><span><span className="block font-semibold">{h}</span><span className="mt-1 block text-sm text-muted">{d}</span></span></li>
          ))}
        </ol>
        <p className="mt-5 border-t border-line pt-4 text-sm text-muted" data-testid="nav-trust">{official} of {total} programs were read on the program's own page. The rest come from directories, and say so. Events are read from organizers' public pages. Every resource links to its source, so you can check it before you act.</p>
      </Panel>
    </div>
  );
}

// Signed in: your profile in one line, with the single way to change it.
// Gender is optional, but programs made for women only match once it is set. One quiet line, until it is answered or put away.
function GenderNudge({ mine }) {
  const [gone, setGone] = useState(() => { try { return localStorage.getItem("pw-gender-nudge") === "1"; } catch { return false; } });
  const set = mine?.gender || (mine?.audiences || []).includes("women");
  if (gone || set || !mine?.stage) return null;
  const hide = () => { setGone(true); try { localStorage.setItem("pw-gender-nudge", "1"); } catch { /* storage unavailable: it just shows again next visit */ } };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line p-3 pr-2 text-sm" data-testid="nav-gender-nudge">
      <Link to="/me?edit=startup" className="min-w-0 flex-1"><span className="block font-semibold">Add your gender to see programs made for women</span><span className="block text-muted">Optional, private, and used only for matching. Takes a few seconds.</span></Link>
      <button type="button" onClick={hide} className="shrink-0 rounded-full px-3 py-2 text-xs font-semibold text-muted hover:text-ink">Not now</button>
    </div>
  );
}

function ProfileBar({ mine, meta }) {
  const has = !!mine?.stage;
  const stage = meta.stages.find((x) => x.key === mine?.stage)?.label;
  const bits = has ? [stage, ...(mine.needs || []).slice(0, 3).map((n) => NEED_LABEL[n]), mine.province].filter(Boolean) : [];
  if (!has) {
    return (
      <Link to="/me?edit=startup" className="flex items-center gap-4 rounded-2xl border border-dashed border-ink/30 p-4 transition hover:border-ink/60" data-testid="nav-profile-bar" data-tour="profile-bar">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Rocket className="h-5 w-5" aria-hidden /></span>
        <span className="min-w-0 flex-1"><span className="block font-semibold">Add your startup to see programs that fit you</span><span className="block text-sm text-muted">One minute, in your profile. These are examples until then.</span></span>
        <ArrowRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
      </Link>
    );
  }
  return (
    <Link to="/me?edit=startup" className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 pr-4 transition hover:border-ink/30" data-testid="nav-profile-bar" data-tour="profile-bar">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Rocket className="h-[18px] w-[18px]" aria-hidden /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">Matched to {mine.name || "your startup"}</span><span className="block truncate text-xs capitalize text-muted">{bits.join(" · ")}</span></span>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-muted group-hover:text-ink" data-testid="nav-edit-profile"><Pencil className="h-3.5 w-3.5" aria-hidden /><span className="hidden sm:inline">Edit in your profile</span><span className="sm:hidden">Edit</span></span>
    </Link>
  );
}

// The whole decision, in the open: four questions, and how their answers become a label. Collapsed so it is there when asked for.
const QUESTIONS = [["Can I apply?", "Your province, city, group, age, team size, sector and whether you are incorporated, against what the program requires."], ["Is it for my stage?", "The stages the program serves, against yours."], ["Does it give me what I need?", "What it offers, against what you said you need."], ["Can I apply now?", "Open, apply anytime, closed or paused, and any deadline."]];
function HowWeDecide() {
  return (
    <details className="mt-3 rounded-xl border border-line px-4 py-3 text-sm" data-testid="nav-how">
      <summary className="cursor-pointer font-semibold">How we decide what fits you</summary>
      <p className="mt-3 text-muted">Every program is checked with the same four questions. Each answer is yes, no, not sure (we are missing something in your profile) or not yet (a step like incorporating is in the way).</p>
      <ol className="mt-3 space-y-2">{QUESTIONS.map(([q, d], i) => <li key={q} className="flex gap-3"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink/10 text-xs font-bold">{i + 1}</span><span><span className="font-semibold">{q}</span> <span className="text-muted">{d}</span></span></li>)}</ol>
      <ul className="mt-4 space-y-1.5 text-muted">
        <li><span className="font-semibold text-ink">Good match:</span> yes to questions 1, 2 and 3.</li>
        <li><span className="font-semibold text-ink">Worth a look:</span> not ruled out, but one answer is a no or not sure.</li>
        <li><span className="font-semibold text-ink">Not yet:</span> a step is in the way, so keep it in view.</li>
        <li><span className="font-semibold text-ink">Not matched:</span> a rule rules you out, like your province or stage, or the program is closed right now. It is still listed under Everything else.</li>
      </ul>
      <p className="mt-3 text-muted">Question 4 decides whether we suggest it. A program that is closed or paused is never suggested, even when it fits you. It stays under Everything else, marked Closed, so you can plan for its next intake.</p>
    </details>
  );
}

const LEGEND = [["open", "taking applications now"], ["rolling", "no deadline, apply whenever"], ["check", "dates not published"]];

const badgeFor = (p, eco) => (!eco ? "" : p.community ? `At ${eco.hub}` : eco.picks?.[p.id] ? `${eco.hub} pick` : "");

function ScopeSwitch({ eco, scope, onChange, total, here }) {
  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="nav-scope">
      <div className="inline-flex rounded-full border border-line p-1" role="group" aria-label="How wide to look">
        {[["hub", eco.hub], ["all", eco.wider]].map(([k, label]) => (
          <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={scope === k} data-testid={`nav-scope-${k}`}
            className={cx("rounded-full px-4 py-1.5 text-sm font-medium transition", scope === k ? "" : "text-muted hover:text-ink")} style={scope === k ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{label}</button>
        ))}
      </div>
      <p className="text-xs text-muted">{scope === "hub" ? `${here != null ? `${here} here` : eco.hub} · ${total != null ? `${total - (here || 0)} more` : "more"} across Canada` : `Everything in the directory, ${eco.hub} first`}</p>
    </div>
  );
}

// True on a phone-width screen. The phone gets its own, simpler layout of the same data (one view at a time), not a squeezed copy of the computer page.
function useMedia(q) {
  const [m, setM] = useState(() => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(q).matches);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener ? mq.addEventListener("change", h) : mq.addListener(h);
    h();
    return () => (mq.removeEventListener ? mq.removeEventListener("change", h) : mq.removeListener(h));
  }, [q]);
  return m;
}

// One program as a single tappable row: what it is, who runs it, whether you can apply now. The detail is one tap away in the drawer.
function ProgramRow({ p, onOpen, mark }) {
  return (
    <button type="button" onClick={() => onOpen(p)} data-testid={`row-${p.id}`} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left transition active:bg-ink/[.05]">
      <TypeTile type={p.type} size={34} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-sm font-semibold leading-snug">{p.name}</span>
        <span className="mt-1 flex items-center gap-2 text-xs text-muted"><span className="min-w-0 truncate">{p.community ? `From ${p.community.name}` : p.org}</span><span className="shrink-0 whitespace-nowrap"><Status status={p.status} /></span>{mark === "yes" && <Bookmark className="h-3 w-3 shrink-0 text-sky-500" aria-label="Interested" />}</span>
      </span>
      {p.fit && p.fit !== "skip" && <FitMeter fit={p.fit} showLabel={false} />}
      <ChevronDown className="-rotate-90 h-4 w-4 shrink-0 text-muted" aria-hidden />
    </button>
  );
}

// One program in the Browse list on a phone: a short, scannable row (kind, name, who runs it, what it offers, can I apply). The full card is for a computer;
// on a phone it ran to a screen and a half per program, which made 600 of them impossible to scan. The detail is one tap away in the drawer.
function BrowseRow({ p, onOpen, mark }) {
  const dl = deadlineInfo(p);
  const offer = p.amount ? (p.amount.length > 70 ? p.amount.slice(0, 67).trimEnd() + "..." : p.amount) : "";
  return (
    <button type="button" onClick={() => onOpen(p)} data-testid={`program-${p.id}`} className="flex w-full items-start gap-3 rounded-2xl border border-line bg-surface p-3 text-left transition active:bg-ink/[.05]">
      <TypeTile type={p.type} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.1em" }}>{TYPE_LABEL[p.type] || p.type}{dl ? ` · closes ${dl.date}` : ""}</span>
        <span className="mt-0.5 line-clamp-2 block text-[15px] font-semibold leading-snug">{p.name}</span>
        <span className="mt-0.5 block truncate text-xs text-muted">{p.community ? `From ${p.community.name}` : p.org}</span>
        {offer && <span className="mt-1.5 block truncate text-xs font-medium text-ink/80">{offer}</span>}
        <span className="mt-2 flex flex-wrap items-center gap-1.5"><Status status={p.status} />{dl && (dl.soon || dl.urgent) && <DeadlineChip p={p} />}{mark === "yes" && <Bookmark className="h-3.5 w-3.5 text-sky-500" aria-label="Interested" />}</span>
      </span>
      {p.fit && <FitMeter fit={p.fit} showLabel={false} />}
    </button>
  );
}

// The same program as a small square tile for the phone's two-up grid: kind, name, who runs it, whether you can apply. Tap for the detail.
function BrowseTile({ p, onOpen, mark }) {
  const { color } = typeMeta(p.type);
  const dl = deadlineInfo(p);
  return (
    <button type="button" onClick={() => onOpen(p)} data-testid={`program-${p.id}`} className="flex h-full min-h-[156px] w-full flex-col rounded-2xl border border-line p-3 text-left transition active:scale-[.98]"
      style={{ background: `linear-gradient(150deg, ${tint(color, 0.12)} 0%, transparent 60%), rgb(var(--c-surface))` }}>
      <span className="flex items-center justify-between gap-2"><TypeTile type={p.type} size={32} /><span className="flex items-center gap-1.5">{mark === "yes" && <Bookmark className="h-3.5 w-3.5 text-sky-500" aria-label="Interested" />}{p.fit && <FitMeter fit={p.fit} showLabel={false} />}</span></span>
      <span className="mt-2 block truncate text-[10px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.1em" }}>{TYPE_LABEL[p.type] || p.type}</span>
      <span className="line-clamp-3 block text-[14px] font-semibold leading-snug">{p.name}</span>
      <span className="mt-0.5 line-clamp-1 block text-xs text-muted">{p.community ? `From ${p.community.name}` : p.org}</span>
      <span className="mt-auto flex flex-wrap items-center gap-1 pt-2"><Status status={p.status} />{dl && (dl.soon || dl.urgent) && <span className="whitespace-nowrap text-[11px] font-semibold text-amber-600 dark:text-amber-400">{dl.short === "Today" ? "Closes today" : `${dl.short} left`}</span>}</span>
    </button>
  );
}

// The phone version of For you: three views, one at a time. Top picks (the one thing to do, then a few more), Your path (the stages), All (the full list with filters).
function PhoneForYou({ res, onOpen, tracked, onTrack, imap, nudge, generic, loading }) {
  const [v, setV] = useState("picks");
  const [view, setView] = useState("fit");
  const [type, setType] = useState("");
  const [timing, setTiming] = useState("");
  const [limit, setLimit] = useState(10);
  const { matches = [], more = [], later = [], communities = [], trajectory } = res;
  const others = res.others || [];
  const fits = [...matches, ...more];
  const strong = fits.filter((p) => p.fit === "strong");
  const picks = strong.length ? strong : fits;
  const hero = picks[0];
  const base = view === "fit" ? fits : others;
  const timed = timing ? base.filter((p) => timingMatch(timing, p)) : base;
  const counts = timed.reduce((o, p) => ({ ...o, [p.type]: (o[p.type] || 0) + 1 }), {});
  const shown = type ? timed.filter((p) => p.type === type) : timed;
  const go = (x) => { setV(x); if (typeof window !== "undefined") window.scrollTo({ top: 0 }); };
  const best = shown.filter((p) => p.fit === "strong");
  const worth = shown.filter((p) => p.fit !== "strong");
  const group = (title, list) => list.length > 0 && (
    <div className="mt-4"><p className="mb-2 text-sm font-semibold">{title}</p><div className="space-y-2">{list.map((p) => <ProgramRow key={p.id} p={p} onOpen={onOpen} mark={imap?.[p.id]} />)}</div></div>
  );
  const text = res.narrative || res.summary;
  return (
    <div className={cx("space-y-4 transition-opacity", loading && "opacity-60")} aria-busy={loading} data-testid="nav-results">
      {generic && <p className="rounded-xl bg-ink/[.05] p-3 text-sm text-muted">These are examples for an early-stage founder in Ontario. Add your startup to your profile to see yours.</p>}
      <div className="[&>div]:flex [&>div]:w-full [&_button]:flex-1"><Segmented items={[["picks", "Top picks"], ["path", "Your path"], ["all", `All · ${fits.length}`]]} value={v} onChange={go} /></div>

      {v === "picks" && (
        <div className="space-y-4" data-testid="phone-picks">
          {hero ? (
            <section className="rounded-3xl border border-line p-4" style={{ background: `linear-gradient(140deg, ${tint(typeMeta(hero.type).color, 0.12)} 0%, transparent 55%), rgb(var(--c-surface))` }} data-testid="phone-hero" data-tour="matches">
              <p className="eyebrow">Start here</p>
              <div className="mt-3 flex items-center gap-3"><TypeTile type={hero.type} size={38} /><span className="min-w-0 flex-1"><span className="block text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{TYPE_LABEL[hero.type] || hero.type}</span><span className="block truncate text-xs text-muted">{hero.org}</span></span><FitMeter fit={hero.fit} showLabel={false} /></div>
              <p className="mt-3 text-lg font-semibold leading-snug" style={{ textWrap: "balance" }}>{hero.name}</p>
              {leadReason(hero) && <p className="mt-2 flex gap-2 text-sm text-ink/80"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /><span className="line-clamp-3">{leadReason(hero)}</span></p>}
              <div className="mt-3 flex flex-wrap items-center gap-2"><Status status={hero.status} /><DeadlineChip p={hero} /></div>
              <button type="button" onClick={() => onOpen(hero)} className="btn-primary mt-4 w-full !py-3 text-sm" data-testid="phone-hero-open">See details<ArrowRight className="h-4 w-4" /></button>
            </section>
          ) : <p className="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-muted">No clean fit yet. Open All to see everything we track.</p>}
          {picks.length > 1 && (
            <section>
              <p className="mb-2 text-sm font-semibold">Also worth your time</p>
              <div className="space-y-2">{picks.slice(1, 5).map((p) => <ProgramRow key={p.id} p={p} onOpen={onOpen} mark={imap?.[p.id]} />)}</div>
            </section>
          )}
          <button type="button" onClick={() => go("all")} className="btn-ghost w-full !py-3 text-sm" data-testid="phone-see-all">See all {fits.length} matches<ArrowRight className="h-4 w-4" /></button>
          {text && <details className="rounded-2xl border border-line px-4 py-3 text-sm"><summary className="cursor-pointer font-semibold">Your next step, in words</summary><p className="mt-2 leading-snug text-ink/90">{text}</p></details>}
          {nudge && <div className="empty:hidden">{nudge}</div>}
        </div>
      )}

      {v === "path" && (
        <section className="rounded-3xl border border-line bg-surface p-4" data-testid="phone-path">
          {trajectory?.stages?.length > 0 ? <Trajectory data={trajectory} tracked={tracked} onPick={onOpen} onTrack={onTrack} /> : <p className="text-sm text-muted">Add your stage to your profile to see your path.</p>}
        </section>
      )}

      {v === "all" && (
        <div data-testid="phone-all">
          <div className="[&>div]:flex [&>div]:w-full [&_button]:flex-1"><Segmented items={[["fit", `For you · ${fits.length}`], ["other", `Everything else · ${others.length}`]]} value={view} onChange={(x) => { setView(x); setType(""); setTiming(""); setLimit(10); }} /></div>
          <div className="mt-3 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2" data-testid="phone-filters">
            <select className="input !rounded-xl !py-2.5 w-full" value={timing} onChange={(e) => { setTiming(e.target.value); setLimit(10); }} aria-label="When you can apply" data-testid="phone-timing">
              <option value="">Any timing</option>
              {TIMING.map(([k, label]) => <option key={k} value={k}>{label} · {base.filter((p) => timingMatch(k, p)).length}</option>)}
            </select>
            <select className="input !rounded-xl !py-2.5 w-full" value={type} onChange={(e) => setType(e.target.value)} aria-label="Kind of program" data-testid="phone-type">
              <option value="">All kinds · {timed.length}</option>
              {Object.entries(counts).map(([k, n]) => <option key={k} value={k}>{TYPE_LABEL[k] || k} · {n}</option>)}
            </select>
          </div>
          {shown.length === 0 && <p className="mt-4 rounded-2xl border border-dashed border-line p-5 text-center text-sm text-muted">Nothing here matches that. <button type="button" onClick={() => { setTiming(""); setType(""); }} className="font-semibold text-ink underline">Clear filters</button></p>}
          {view === "fit" ? <>{group("Good matches", best.slice(0, limit))}{group("Worth a look", worth.slice(0, Math.max(0, limit - best.length)))}</> : <div className="mt-4 space-y-2">{shown.slice(0, limit).map((p) => <ProgramRow key={p.id} p={p} onOpen={onOpen} mark={imap?.[p.id]} />)}</div>}
          {shown.length > limit && <button type="button" onClick={() => setLimit((n) => n + 15)} className="btn-ghost mt-4 w-full !py-3 text-sm">Show {Math.min(15, shown.length - limit)} more</button>}
          {communities.length > 0 && (
            <details className="mt-6 rounded-2xl border border-line">
              <summary className="flex cursor-pointer items-center justify-between gap-2 p-4 text-sm font-semibold">Communities that can help · {communities.length}<ChevronDown className="h-4 w-4 text-muted" aria-hidden /></summary>
              <div className="space-y-3 border-t border-line p-4">{communities.map((c) => <CommunityCard key={c.slug} c={c} />)}</div>
            </details>
          )}
          {later.length > 0 && (
            <details className="mt-3 rounded-2xl border border-dashed border-line">
              <summary className="flex cursor-pointer items-center justify-between gap-2 p-4 text-sm font-semibold">Not yet: {later.length} to come back to<ChevronDown className="h-4 w-4 text-muted" aria-hidden /></summary>
              <div className="space-y-3 border-t border-dashed border-line p-4">{later.map((p) => <div key={p.id}><p className="font-semibold">{p.name} <span className="text-sm font-normal text-muted">· {TYPE_LABEL[p.type] || p.type}</span></p><p className="mt-0.5 flex gap-2 text-sm text-muted"><Flag className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{(p.cautions || [])[0]}</span></p></div>)}</div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// The mentor line: what to do first. On a phone it opens to three lines with a "More" for the rest.
function Narrative({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div className="flex items-start gap-3" data-testid="nav-mentor">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Compass className="h-4 w-4" aria-hidden /></span>
      <div className="min-w-0 pt-1">
        <p className={cx("text-[15px] leading-snug text-ink/90", !open && "line-clamp-3 sm:line-clamp-none")}>{text}</p>
        {!open && text.length > 150 && <button type="button" onClick={() => setOpen(true)} className="mt-1 text-sm font-semibold text-muted underline sm:hidden">More</button>}
      </div>
    </div>
  );
}

// Wide screens only: the column beside the list. Your next step, what you saved, and what is coming up, so the width is used for things you act on.
function NextStepRail({ res, itc, onOpen }) {
  const shell = useShell();
  const [evs, setEvs] = useState(null);
  useEffect(() => { api.get("/founder-events").then((r) => setEvs((r.data.events || []).slice(0, 4))).catch(() => setEvs([])); }, []);
  const every = [...(res.matches || []), ...(res.more || []), ...(res.later || []), ...(res.others || [])];
  const saved = itc.interest.filter((i) => i.state === "yes").map((i) => every.find((p) => p.id === i.id)).filter(Boolean).slice(0, 4);
  const card = "rounded-3xl border border-line bg-surface p-5";
  return (
    <aside className="sticky top-6 hidden space-y-4 xl:block" aria-label="Next step" data-testid="nav-rail">
      <section className={card}>
        <p className="eyebrow mb-3">Your next step</p>
        <Narrative text={res.narrative || res.summary} />
        {shell?.openGuide && <button type="button" onClick={() => shell.openGuide()} className="btn-ghost mt-4 w-full !py-2.5 text-sm">Ask the guide<ArrowRight className="h-4 w-4" /></button>}
      </section>
      {saved.length > 0 && (
        <section className={card}>
          <p className="eyebrow mb-3">Saved for later</p>
          <ul className="space-y-1">
            {saved.map((p) => (
              <li key={p.id}><button type="button" onClick={() => onOpen(p)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-ink/[.05]"><TypeTile type={p.type} size={32} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="block truncate text-xs text-muted">{p.org}</span></span></button></li>
            ))}
          </ul>
        </section>
      )}
      <section className={card}>
        <p className="eyebrow mb-3">Coming up</p>
        {evs && evs.length ? (
          <ul className="space-y-1">
            {evs.map((e) => { const [m, d] = monthDay(e.date); return (
              <li key={e.id}><a href={e.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-ink/[.05]"><span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-ink/[.06]"><span className="text-[10px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.08em" }}>{m}</span><span className="text-base font-bold leading-none tabular-nums">{d}</span></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{e.title}</span><span className="block truncate text-xs text-muted">{[e.org, e.online ? "Online" : e.city].filter(Boolean).join(" · ")}</span></span></a></li>
            ); })}
          </ul>
        ) : <p className="text-sm text-muted">{evs ? "No events are listed right now." : "Loading"}</p>}
        <Link to="/founder-events" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">All events<ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
      </section>
    </aside>
  );
}

function Results({ res, meta, loading, generic, onOpen, tracked, onTrack, imap, eco, scope, onWiden, railed, nudge }) {
  const phone = useMedia("(max-width: 639px)");
  const [view, setView] = useState("fit");
  const [aboutOpen, setAboutOpen] = useState(false);     // phones: the explainer lines and the filters start folded away
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [type, setType] = useState("");
  const [timing, setTiming] = useState("");
  const [showAll, setShowAll] = useState(false);
  if (!res) return <Spinner />;
  if (phone) return <PhoneForYou res={res} onOpen={onOpen} tracked={tracked} onTrack={onTrack} imap={imap} nudge={nudge} generic={generic} loading={loading} />;
  const { matches, more, later, communities, trajectory } = res;
  const others = res.others || [];
  const fits = [...matches, ...more];
  const communityN = [...fits, ...later, ...others].filter((p) => p.community).length;
  const base = view === "fit" ? fits : others;
  const timed = timing ? base.filter((p) => timingMatch(timing, p)) : base;
  const counts = timed.reduce((o, p) => ({ ...o, [p.type]: (o[p.type] || 0) + 1 }), {});
  const shown = type ? timed.filter((p) => p.type === type) : timed;
  const LIMIT = 6;
  const visible = showAll || type || timing ? shown : shown.slice(0, LIMIT);
  const best = visible.filter((p) => p.fit === "strong");
  const worth = visible.filter((p) => p.fit !== "strong");
  const grid = cx("grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))]", !railed && "2xl:grid-cols-[repeat(3,minmax(0,1fr))]");
  const filterCount = (type ? 1 : 0) + (timing ? 1 : 0);
  const switchView = (v) => { setView(v); setType(""); setTiming(""); setShowAll(false); };
  return (
    <div className={cx("space-y-10 transition-opacity", loading && "opacity-60")} aria-busy={loading} data-testid="nav-results">
      {generic && <p className="rounded-xl bg-ink/[.05] p-3 text-sm text-muted">These are examples for an early-stage founder in Ontario. Add your startup to your profile to see yours.</p>}

      {trajectory?.stages?.length > 0 && (
        <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <div className={cx("mb-5", railed && "xl:hidden")}><Narrative text={res.narrative || res.summary} /></div>
          <p className="eyebrow">Your trajectory</p>
          <p className="mb-5 mt-1 hidden text-sm text-muted sm:block">{trajectory.story}</p>
          <div className="mb-4" />
          <Trajectory data={trajectory} tracked={tracked} onPick={onOpen} onTrack={onTrack} />
        </section>
      )}

      <section data-testid="nav-list">
        <div data-tour="matches" className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl" style={{ textTransform: "none", letterSpacing: "-0.01em", fontWeight: 700 }}>{view === "fit" ? (fits.length ? `${fits.length} programs that fit you` : "No clean fit yet") : `${others.length} programs not matched to you`}</h2>
          <Segmented items={[["fit", `For you · ${fits.length}`], ["other", `Everything else · ${others.length}`]]} value={view} onChange={switchView} />
        </div>
        <button type="button" onClick={() => setAboutOpen((o) => !o)} aria-expanded={aboutOpen} className="mt-3 flex w-full items-center justify-between gap-2 rounded-xl border border-line px-4 py-2.5 text-left text-sm font-semibold text-muted sm:hidden" data-testid="nav-about-toggle">About these results<ChevronDown className={cx("h-4 w-4 transition", aboutOpen && "rotate-180")} aria-hidden /></button>
        <div className={cx(aboutOpen ? "block" : "hidden", "sm:block")} data-testid="nav-about">
        <p className="mt-2 text-xs text-muted" data-testid="nav-totals">All {fits.length + later.length + others.length} programs: {fits.length} fit you{later.length ? `, ${later.length} are not yet` : ""}, {others.length} are not matched to you.{communityN > 0 ? ` That includes ${communityN} from communities you joined.` : ""}</p>
        <p className="mt-2 text-sm text-muted">{view === "fit" ? "Matched to your stage, needs, province and group." : "Real programs too. They are not matched to you yet because of stage, province, group or sector. Each card says why."}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted" data-testid="nav-legend">{LEGEND.map(([k, t]) => <span key={k} className="inline-flex items-center gap-1.5"><Status status={k} />{t}</span>)}</p>
        <HowWeDecide />
        </div>
        <button type="button" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen} className="mt-3 flex w-full items-center justify-between gap-2 rounded-xl border border-line px-4 py-2.5 text-left text-sm font-semibold sm:hidden" data-testid="nav-filters-toggle"><span className="inline-flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" aria-hidden />Filter{filterCount ? ` · ${filterCount} on` : ""}</span><ChevronDown className={cx("h-4 w-4 text-muted transition", filtersOpen && "rotate-180")} aria-hidden /></button>
        <div className={cx(filtersOpen ? "block" : "hidden", "sm:block")} data-testid="nav-filters">
        <div className="mt-4"><TimingFilter value={timing} onChange={(v) => { setTiming(v); setShowAll(false); }} list={base} /></div>
        {Object.keys(counts).length > 1 && (
          <div className="pw-rail -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Filter by type">
            <Pill on={!type} onClick={() => setType("")} testId="nav-type-all">All<span className="text-xs opacity-60">{timed.length}</span></Pill>
            {Object.entries(counts).map(([k, n]) => { const { color, Icon } = typeMeta(k); return <Pill key={k} on={type === k} color={color} onClick={() => setType(type === k ? "" : k)} testId={`nav-type-${k}`}><Icon className="h-3.5 w-3.5" aria-hidden />{TYPE_LABEL[k] || k}<span className="text-xs opacity-60">{n}</span></Pill>; })}
          </div>
        )}
        </div>
        {shown.length === 0 && <p className="mt-6 rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted" data-testid="nav-timing-empty">Nothing here matches that. <button type="button" onClick={() => { setTiming(""); setType(""); }} className="font-semibold text-ink underline">Clear filters</button></p>}
        {view === "fit" ? (
          <>
            {best.length > 0 && <div className="mt-6"><p className="mb-1 text-sm font-semibold">Good matches</p><p className="mb-3 hidden text-xs text-muted sm:block">Nothing in your profile rules it out, it is for your stage, and it gives you what you asked for. Confirm what each one asks for on its page.</p><div className={grid}>{best.map((p) => <ProgramCard key={p.id} p={p} onOpen={onOpen} mark={imap?.[p.id]} badge={badgeFor(p, eco)} />)}</div></div>}
            {worth.length > 0 && <div className="mt-8"><p className="mb-1 text-sm font-semibold">Worth a look</p><p className="mb-3 hidden text-xs text-muted sm:block">Not ruled out, but one answer is a no or missing. The card says which.</p><div className={grid}>{worth.map((p) => <ProgramCard key={p.id} p={p} onOpen={onOpen} mark={imap?.[p.id]} badge={badgeFor(p, eco)} />)}</div></div>}
          </>
        ) : (
          <div className={cx("mt-6", grid)} data-testid="nav-others">{visible.map((p) => <ProgramCard key={p.id} p={p} onOpen={onOpen} mark={imap?.[p.id]} badge={badgeFor(p, eco)} />)}</div>
        )}
        {!showAll && !type && !timing && shown.length > LIMIT && <button type="button" onClick={() => setShowAll(true)} className="btn-ghost mt-5 w-full !py-3 text-sm" data-testid="nav-show-all">Show {shown.length - LIMIT} more</button>}
      </section>

      {communities?.length > 0 && (
        <section>
          <h2 className="text-xl" style={{ textTransform: "none", letterSpacing: "-0.01em", fontWeight: 700 }}>Communities that can help</h2>
          <p className="mb-4 mt-1 text-sm text-muted">Joining one adds its own programs and people here.</p>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))]">{communities.map((c) => <CommunityCard key={c.slug} c={c} />)}</div>
        </section>
      )}

      {later.length > 0 && (
        <details className="group rounded-2xl border border-dashed border-line" data-testid="nav-later">
          <summary className="flex cursor-pointer items-center justify-between gap-2 p-4 text-sm font-semibold">Not yet: {later.length} to come back to<ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden /></summary>
          <div className="space-y-3 border-t border-dashed border-line p-4">
            {later.map((p) => (
              <div key={p.id} data-testid={`later-${p.id}`}>
                <p className="font-semibold">{p.name} <span className="text-sm font-normal text-muted">· {TYPE_LABEL[p.type] || p.type}</span></p>
                <p className="mt-0.5 flex gap-2 text-sm text-muted"><Flag className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{(p.cautions || [])[0]}</span></p>
              </div>
            ))}
          </div>
        </details>
      )}

      {eco?.wider && scope === "hub" && onWiden && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-line bg-card p-4" data-testid="nav-widen">
          <p className="text-sm text-muted"><span className="font-semibold text-ink">Showing {eco.hub} programs and the picks we shortlisted.</span> {res?.catalog_total ? `${res.catalog_total} programs and grants exist across Canada.` : "More exist across Canada."}</p>
          <button type="button" onClick={onWiden} className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-bg" data-testid="nav-widen-btn">Widen to {eco.wider}</button>
        </div>
      )}

      <p className="text-xs text-muted" data-testid="nav-provenance">{meta.page_checks?.read > 0 ? `${meta.page_checks.read} of ${meta.count} programs have been read from their own official page (latest ${dayLabel(meta.page_checks.last_read)}). We re-read each one about once a day, and the rest are as last checked by hand.` : `Details change without notice, so confirm on the official page. Directory checked ${dayLabel(meta.version)}.`}</p>
    </div>
  );
}

function Directory({ meta, onOpen, imap, eco, fitRes, account, hasProfile, startType }) {
  const BLANK = { q: "", type: "", timing: "", province: "", need: "", region: "" };
  const [f, setF] = useState(() => ({ ...BLANK, type: startType && startType !== "events" ? startType : "" }));
  const [rowsAll, setRows] = useState(null);
  const phone = useMedia("(max-width: 639px)");
  // On a phone the list is a two-up grid of small tiles (or short rows, one tap to switch); the choice is remembered on this phone.
  const [layout, setLayoutRaw] = useState(() => { try { return localStorage.getItem("pw_browse_layout") === "rows" ? "rows" : "grid"; } catch { return "grid"; } });
  const setLayout = (v) => { setLayoutRaw(v); try { localStorage.setItem("pw_browse_layout", v); } catch { /* private window: fine */ } };
  const tiles = phone && layout === "grid";
  const step = !phone ? 24 : tiles ? 12 : 20;
  const [limit, setLimit] = useState(step);   // 600+ programs: show a screenful, then more on request
  const [moreOpen, setMoreOpen] = useState(false);   // phones: only search and kind show; need, place and timing fold away
  const [ev, setEv] = useState(startType === "events");   // "Events" is one more kind in this list: pick it and the list below becomes upcoming events
  const [all, setAll] = useState([]);
  useEffect(() => { api.get("/navigator/programs").then((r) => setAll(r.data.programs || [])).catch(() => {}); }, []);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      const params = Object.fromEntries(Object.entries({ q: f.q, type: f.type, province: f.province, need: f.need, region: f.region }).filter(([, v]) => v));
      api.get("/navigator/programs", { params }).then((r) => { if (live) setRows(r.data.programs); }).catch(() => { if (live) setRows([]); });
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [f.q, f.type, f.province, f.need, f.region]);
  const rows = useMemo(() => (rowsAll && f.timing ? rowsAll.filter((p) => timingMatch(f.timing, p)) : rowsAll), [rowsAll, f.timing]);
  useEffect(() => { setLimit(step); }, [f.q, f.type, f.need, f.region, f.timing, ev, step]);
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  // Signed in with a startup profile: every program here carries the same "why it may fit / why it may not" as For you.
  const fitById = useMemo(() => {
    const m = {};
    for (const p of [...(fitRes?.matches || []), ...(fitRes?.more || []), ...(fitRes?.later || []), ...(fitRes?.others || [])]) m[p.id] = { fit: p.fit, reasons: p.reasons, cautions: p.cautions, checks: p.checks, score: p.score };
    return m;
  }, [fitRes]);
  const counts = useMemo(() => all.reduce((m, p) => { m[p.type] = (m[p.type] || 0) + 1; return m; }, {}), [all]);
  // With a profile, the closest fits lead: good matches, then worth a look, then not yet, then not matched (nearest first); ties keep the score order.
  const ordered = useMemo(() => {
    if (!rows) return rows;
    if (!hasProfile || !fitRes) return rows;
    const rank = { strong: 0, possible: 1, later: 2, skip: 3 };
    const near = (id) => (fitById[id]?.checks || []).slice(0, 3).filter((c) => c.state === "yes").length;
    const live = (p) => (p.status === "closed" || p.status === "paused" ? 1 : 0);
    return rows.map((p, i) => ({ p, i })).sort((a, b) => {
      const A = fitById[a.p.id]; const B = fitById[b.p.id];
      return ((rank[A?.fit] ?? 4) - (rank[B?.fit] ?? 4)) || ((B?.score || 0) - (A?.score || 0)) || (near(b.p.id) - near(a.p.id)) || (live(a.p) - live(b.p)) || (a.i - b.i);
    }).map((x) => x.p);
  }, [rows, fitById, hasProfile, fitRes]);
  const active = Object.values(f).some(Boolean);
  const label = "mb-1.5 block text-[11px] font-semibold uppercase text-muted";
  const select = "input !rounded-xl !py-2.5 w-full";
  return (
    <div data-testid="nav-directory">
      <div className="space-y-4 rounded-3xl border border-line bg-surface p-4 sm:p-5">
        {!ev && <div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input !rounded-full !py-3 !pl-11" placeholder="Search by name, organisation or what it offers" value={f.q} onChange={(e) => set("q", e.target.value)} aria-label="Search programs" data-testid="dir-search" /></div>}
        <div>
          <span className={label} style={{ letterSpacing: "0.12em" }}>What kind</span>
          <select className="input !rounded-xl !py-2.5 w-full sm:hidden" value={ev ? "events" : f.type} onChange={(e) => { const v = e.target.value; if (v === "events") { setEv(true); } else { setEv(false); set("type", v); } }} aria-label="What kind" data-testid="dir-type-select">
            <option value="">All kinds</option>
            {meta.types.map((t) => <option key={t.key} value={t.key}>{t.label}{counts[t.key] ? ` · ${counts[t.key]}` : ""}</option>)}
            <option value="events">Events</option>
          </select>
          <div className="hidden flex-wrap gap-2 sm:flex">
            {meta.types.map((t) => { const { color, Icon } = typeMeta(t.key); return <Pill key={t.key} on={!ev && f.type === t.key} color={color} onClick={() => { setEv(false); set("type", f.type === t.key ? "" : t.key); }} testId={`dir-type-${t.key}`}><Icon className="h-3.5 w-3.5" aria-hidden />{t.label}{counts[t.key] ? <span className="text-xs opacity-60">{counts[t.key]}</span> : null}</Pill>; })}
            <Pill on={ev} color="#F59E0B" onClick={() => setEv(!ev)} testId="dir-type-events"><CalendarDays className="h-3.5 w-3.5" aria-hidden />Events</Pill>
          </div>
        </div>
        {!ev && <button type="button" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} className="flex w-full items-center justify-between gap-2 rounded-xl border border-line px-4 py-2.5 text-left text-sm font-semibold sm:hidden" data-testid="dir-more-toggle"><span className="inline-flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" aria-hidden />More filters{(f.need ? 1 : 0) + (f.region ? 1 : 0) + (f.timing ? 1 : 0) ? ` · ${(f.need ? 1 : 0) + (f.region ? 1 : 0) + (f.timing ? 1 : 0)} on` : ""}</span><ChevronDown className={cx("h-4 w-4 text-muted transition", moreOpen && "rotate-180")} aria-hidden /></button>}
        <div className={cx("space-y-4", moreOpen ? "block" : "hidden", "sm:block")}>
        {!ev && <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className={label} style={{ letterSpacing: "0.12em" }}>What you need</span>
            <select className={select} value={f.need} onChange={(e) => set("need", e.target.value)} data-testid="dir-need" aria-label="What you need">
              <option value="">Anything</option>
              {meta.needs.map((n) => <option key={n.key} value={n.key}>{n.label.charAt(0).toUpperCase() + n.label.slice(1)}</option>)}
            </select></label>
          {meta.regions && (
            <label className="block"><span className={label} style={{ letterSpacing: "0.12em" }}>Where you are</span>
              <select className={select} value={f.region} onChange={(e) => set("region", e.target.value)} aria-label="Show programs near" data-testid="dir-region">
                <option value="">Anywhere in Canada</option>
                {meta.regions.map((r) => <option key={r.key} value={r.key}>{r.label.charAt(0).toUpperCase() + r.label.slice(1)}</option>)}
              </select></label>
          )}
        </div>}
        {!ev && <div><span className={label} style={{ letterSpacing: "0.12em" }}>When you can apply</span><TimingFilter value={f.timing} onChange={(v) => set("timing", v)} list={rowsAll || []} testid="dir-timing" /></div>}
        {!ev && f.need && NEED_HINT[f.need] && <p className="text-sm text-muted" data-testid="dir-need-hint"><span className="font-semibold text-ink/80">{NEED_LABEL[f.need].charAt(0).toUpperCase() + NEED_LABEL[f.need].slice(1)}:</span> {NEED_HINT[f.need]}</p>}
        </div>
      </div>
      {ev ? <div className="mt-6"><FounderEvents embedded /></div> : <>
      <div className="mb-3 mt-5 flex items-center justify-between gap-3">
        <p className="text-sm font-medium" data-testid="dir-count">{rows ? `${rows.length} program${rows.length === 1 ? "" : "s"}` : ""}{f.region && rows ? <span className="font-normal text-muted"> in or open to {(meta.regions || []).find((r) => r.key === f.region)?.label}</span> : null}{hasProfile && fitRes && rows?.length > 1 ? <span className="font-normal text-muted"> · best fit first</span> : null}</p>
        <div className="flex shrink-0 items-center gap-3">
  {active && <button type="button" onClick={() => setF(BLANK)} className="text-sm font-semibold text-muted underline hover:text-ink" data-testid="dir-clear">Clear filters</button>}
        {phone && <div className="inline-flex shrink-0 rounded-full border border-line p-0.5" role="group" aria-label="Layout">
          {[["grid", LayoutGrid, "Grid"], ["rows", Rows, "List"]].map(([k, I, t]) => <button key={k} type="button" onClick={() => setLayout(k)} aria-pressed={layout === k} aria-label={t} data-testid={`dir-layout-${k}`} className={cx("flex h-8 w-9 items-center justify-center rounded-full transition", layout === k ? "" : "text-muted")} style={layout === k ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}><I className="h-4 w-4" aria-hidden /></button>)}
        </div>}
        </div>
      </div>
      {!hasProfile && !ev && (
        <ProfilePrompt className="mb-5" to={account ? "/me?edit=startup" : "/signup?for=founder"} testId="dir-no-profile" tour="profile-bar"
          title={account ? "Add your startup to see which programs fit you" : "Create a free profile to see which programs fit you"}
          body="Right now you're seeing every program. With a profile, each one tells you why it fits, or doesn't, and what to watch out for."
          points={["Programs ranked by how well they match you", "Why each one fits, or doesn't", "Deadlines and events picked for your stage"]}
          cta={account ? "Add my startup" : "Create my free profile"} />
      )}
      {!rows ? <Spinner /> : rows.length === 0 ? <p className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">Nothing matches. Try clearing a filter.</p>
        : <>
          <div className={tiles ? "grid grid-cols-2 gap-2.5" : phone ? "space-y-2" : "grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))] 2xl:grid-cols-[repeat(3,minmax(0,1fr))]"}>{ordered.slice(0, limit).map((q) => { const p = hasProfile && fitById[q.id] ? { ...q, ...fitById[q.id] } : q; return tiles ? <BrowseTile key={p.id} p={p} onOpen={onOpen} mark={imap?.[p.id]} /> : phone ? <BrowseRow key={p.id} p={p} onOpen={onOpen} mark={imap?.[p.id]} /> : <ProgramCard key={p.id} p={p} onOpen={onOpen} mark={imap?.[p.id]} badge={badgeFor(p, eco)} />; })}</div>
          {ordered.length > limit && <div className="mt-5 flex flex-col items-center gap-1"><button type="button" onClick={() => setLimit((n) => n + step)} className="btn-ghost w-full sm:w-auto" data-testid="dir-more">Show {Math.min(step, ordered.length - limit)} more</button><p className="text-xs text-muted">Showing {limit} of {ordered.length}. Search or pick a kind to narrow the list.</p></div>}
        </>}
      </>}
    </div>
  );
}

// The programs you said yes or no to. Interested ones read like a shortlist; the ones you hid wait here with a way back.
function InterestedTab({ itc, onOpen }) {
  const phone = useMedia("(max-width: 639px)");
  const [all, setAll] = useState(null);
  useEffect(() => { api.get("/navigator/programs").then((r) => setAll(r.data.programs || [])).catch(() => setAll([])); }, []);
  const rows = (state) => itc.interest.filter((i) => i.state === state).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  // Prefer the live catalog entry (so dates and links are current); fall back to the name we saved.
  const full = (i) => (all || []).find((p) => p.id === i.id) || { id: i.id, name: i.name || "A program", org: i.org, type: i.type, summary: "", status: "check" };
  const yes = rows("yes"); const no = rows("no");
  if (!all) return <Spinner />;
  return (
    <div className="space-y-8" data-testid="nav-interested">
      <section>
        <h2 className="text-xl" style={{ textTransform: "none", letterSpacing: "-0.01em", fontWeight: 700 }}>{yes.length ? `${yes.length} you are interested in` : "Nothing saved yet"}</h2>
        <p className="mt-1 text-sm text-muted">Open any program and press Interested. It lands here, with its dates and its official page.</p>
        {yes.length > 0
          ? <div className={phone ? "mt-4 space-y-2" : "mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))]"}>{yes.map((i) => phone ? <BrowseRow key={i.id} p={full(i)} onOpen={onOpen} mark="yes" /> : <ProgramCard key={i.id} p={full(i)} onOpen={onOpen} mark="yes" />)}</div>
          : <p className="mt-4 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted" data-testid="nav-interested-empty">Your shortlist is empty. Look through Programs that fit you and press Interested on the ones worth a second look.</p>}
      </section>
      {no.length > 0 && (
        <details className="group rounded-2xl border border-dashed border-line" data-testid="nav-hidden">
          <summary className="flex cursor-pointer items-center justify-between gap-2 p-4 text-sm font-semibold"><span className="flex items-center gap-2"><EyeOff className="h-4 w-4" aria-hidden />Not interested: {no.length} hidden from your suggestions</span><ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden /></summary>
          <ul className="divide-y divide-line border-t border-dashed border-line">
            {no.map((i) => (
              <li key={i.id} className="flex items-center gap-3 p-4" data-testid={`hidden-${i.id}`}>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{full(i).name}</span><span className="block truncate text-xs text-muted">{full(i).org}</span></span>
                <button type="button" onClick={() => itc.mark(full(i), "no")} className="btn-ghost !px-3 !py-1.5 text-sm" data-testid={`unhide-${i.id}`}>Bring back</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export default function Navigator({ embedded }) {
  const { user, account } = useAuth();
  const [meta, setMeta] = useState(null);
  const [mine, setMine] = useState(null);   // the signed-in person's saved startup profile ({} when none yet); null while loading
  const [tab, setTab] = useState("path");
  const [startType, setStartType] = useState("");   // a catalog tile on the signed-out page opens Browse all with that kind already picked
  const [profile, setProfile] = useState(DEFAULT);
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null);
  const { tracked, setTracked, track } = useTracked();
  const itc = useInterest();
  const eco = useEcosystem();                    // a hub describes itself (config.ecosystem): its own programs and picks first, one tap to widen
  const loc = useLocation();
  const [scope, setScope] = useState(() => (eco && new URLSearchParams(loc.search).get("scope") !== "all" ? "hub" : "all"));
  const seq = useRef(0);
  const ready = !account || mine !== null;       // signed in: wait for the profile so we never flash results for someone else's answers
  const generic = !!account && ready && !mine?.stage;
  const phone = useMedia("(max-width: 639px)");
  // No startup on the account yet means nothing can be picked for you: open on Browse, and leave "For you" out until there is a profile.
  useEffect(() => { if (generic && tab === "path") setTab("all"); }, [generic, tab]);
  const railed = !embedded;                       // on a wide screen the next step, saved programs and events sit in a side column

  useEffect(() => { document.title = "Opportunities · Pathwai"; api.get("/navigator/meta").then((r) => setMeta(r.data)).catch(() => setErr("The directory could not load. Please try again.")); }, []);

  // Signed in: the profile on the account IS the input. Read it; changing it happens on the profile page, and everything here follows.
  useEffect(() => {
    if (!account) { setMine(null); return; }
    api.get("/navigator/me").then((r) => {
      setMine(r.data.startup || {});
      setTracked(r.data.tracked || []);
      itc.setInterest(r.data.interest || []);
      setProfile(r.data.profile && r.data.profile.stage ? fromAccount(r.data.profile) : DEFAULT);
    }).catch(() => setMine({}));
  }, [account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tell the account which programs have now been seen, so Home can say how many are new next time.
  const seenOnce = useRef(false);
  useEffect(() => { if (account && res && !seenOnce.current) { seenOnce.current = true; api.post("/navigator/seen").catch(() => {}); } }, [account, res]);

  const apiProfile = useMemo(() => ({ ...profile, age: profile.age ? Number(profile.age) : null, employees: profile.employees === "" ? null : Number(profile.employees) }), [profile]);
  useEffect(() => {
    if (!meta || !ready || !account) return undefined;
    const my = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      api.post("/navigator/suggest", { profile: apiProfile, ...(eco ? { scope } : {}) })
        .then((r) => { if (seq.current === my) { setRes(r.data); setErr(""); } })
        .catch((e) => { if (seq.current === my) setErr(e?.response?.data?.detail || "Could not get suggestions. Please try again."); })
        .finally(() => { if (seq.current === my) setLoading(false); });
    }, 200);
    return () => clearTimeout(t);
  }, [apiProfile, meta, ready, account?.id, itc.sig, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  // A hub's ecosystem lens (config.ecosystem) gets its own, simpler page: one ranked list, same shape as Events, People and Resources.
  const ecoBody = eco && account ? (
    <HubPrograms itc={itc} tracked={tracked} onTrack={track} stage={mine?.stage || "idea"}
      loadMine={() => api.get("/navigator/me").then((r) => { setTracked(r.data.tracked || []); itc.setInterest(r.data.interest || []); }).catch(() => {})}
      guide={<GuideChat className="h-[min(72dvh,680px)]" signedIn hasProfile={!!mine?.stage} startupName={mine?.name} formProfile={apiProfile} />} />
  ) : null;
  const body = ecoBody || (
    <div className="mx-auto w-full max-w-6xl 2xl:max-w-[1400px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow hidden sm:block">Opportunities</p>
          <h1 className="text-2xl sm:mt-2 sm:text-4xl" style={{ textTransform: "none", letterSpacing: "-0.03em", fontWeight: 800, textWrap: "balance" }}>{eco ? (scope === "hub" ? `Programs & grants at ${eco.hub}` : `Programs & grants across ${eco.wider}`) : account && !generic ? "Opportunities that fit your startup" : "Canadian opportunities"}</h1>
          <p className="mt-2 hidden text-sm text-muted sm:block">{eco ? (scope === "hub" ? (eco.wider ? `What ${eco.hub} runs, plus the grants, loans and programs its team points founders to. Each one is checked against your startup.` : `What ${eco.hub} runs for founders. Each one is checked against your startup.`) : `Every grant, loan, accelerator and mentor we track, with ${eco.hub} programs first.`) : meta ? <>{(meta.resources ?? meta.count).toLocaleString()} resources, each with its source: {meta.programs ?? meta.count} grants, loans, accelerators, mentors and founder communities{meta.events ? `, and ${meta.events} upcoming events` : ""}. Communities you join add their own on top.</> : "Loading"}</p>
        </div>
        <div data-tour="tabs" className="w-full max-sm:[&>div]:flex max-sm:[&>div]:w-full max-sm:[&>div]:overflow-visible max-sm:[&_button]:flex-1 max-sm:[&_button]:px-1.5 sm:w-auto"><Segmented items={[...(generic ? [] : [["path", "For you"]]), ["all", <><span className="sm:hidden">Browse</span><span className="hidden sm:inline">Browse all</span></>], ...(account ? [["saved", <><span className="sm:hidden">Saved{itc.interest.some((i) => i.state === "yes") ? ` · ${itc.interest.filter((i) => i.state === "yes").length}` : ""}</span><span className="hidden sm:inline">{itc.interest.some((i) => i.state === "yes") ? `Interested · ${itc.interest.filter((i) => i.state === "yes").length}` : "Interested"}</span></>]] : []), ["ask", <><span className="sm:hidden">Guide</span><span className="hidden sm:inline">Ask the guide</span></>]]} value={tab} onChange={setTab} /></div>
      </div>

      {eco?.wider && account && tab === "path" && <div className="mb-5"><ScopeSwitch eco={eco} scope={scope} onChange={setScope} total={res?.catalog_total} here={scope === "hub" ? (res ? (res.totals?.fit ?? null) : null) : null} /></div>}
      {err && <p className="mb-4 rounded-xl border border-red-500/40 p-3 text-sm text-red-500" role="alert">{err}</p>}
      {!meta ? <Spinner /> : tab === "all" ? <Directory startType={startType} meta={meta} onOpen={setOpen} imap={itc.byId} eco={eco} fitRes={res} account={account} hasProfile={!!account && !!mine?.stage} /> : tab === "saved" && account ? <InterestedTab itc={itc} onOpen={setOpen} /> : tab === "ask" ? (
        <div className="mx-auto w-full max-w-3xl"><GuideChat className="h-[min(72dvh,680px)]" signedIn={!!account} hasProfile={!!mine?.stage} startupName={mine?.name} formProfile={account ? apiProfile : undefined} /></div>
      ) : account ? (
        <div className="space-y-6">
          {mine === null ? <Spinner /> : <><ProfileBar mine={mine} meta={meta} />{!phone && <div className="mt-3 empty:hidden"><GenderNudge mine={mine} /></div>}</>}
          {ready && !generic && <div className={cx(railed && "xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start xl:gap-8")}><Results nudge={phone ? <GenderNudge mine={mine} /> : null} railed={railed} res={res} meta={meta} loading={loading} generic={generic} onOpen={setOpen} tracked={tracked} onTrack={track} imap={itc.byId} eco={eco} scope={scope} onWiden={() => setScope("all")} />{railed && res && <NextStepRail res={res} itc={itc} onOpen={setOpen} />}</div>}
        </div>
      ) : <><SignedOutGate /><SignedOutShowcase meta={meta} onOpen={setOpen} onBrowse={(t) => { setStartType(t); setTab("all"); window.scrollTo({ top: 0 }); }} /></>}
      <ProgramDrawer p={open} onClose={() => setOpen(null)} meta={meta} tracked={tracked} onTrack={account ? track : undefined} interest={account ? itc : undefined} eco={eco} stage={res?.trajectory?.current || mine?.stage || "idea"} />
    </div>
  );

  if (embedded) return body;
  if (account) return <AccountShell active="programs">{body}</AccountShell>;
  return (
    <div className="flex min-h-[100dvh] flex-col px-4 py-5 sm:py-8" data-testid="navigator-page">
      <header className="mx-auto mb-8 flex w-full max-w-6xl 2xl:max-w-[1400px] items-center justify-between gap-3">
        <Link to="/" className="text-xl" aria-label="Pathwai home"><Wordmark name="Pathwai" brand={{}} /></Link>
        <Link to={user ? "/" : "/login"} className="btn-ghost !py-2 text-sm">{user ? "Back to community" : "Sign in"}</Link>
      </header>
      <div className="flex-1">{body}</div>
      <PoweredBy className="mt-10 pb-2 text-center" />
    </div>
  );
}
