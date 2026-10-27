import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, BadgeCheck, Building2, Check, ChevronDown, Compass, ExternalLink, Flag, Lightbulb, MapPin, Rocket, Search, Sparkles, TrendingUp, TriangleAlert, Users, Wrench,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Wordmark, PoweredBy, Spinner, Tabs, cx } from "../components/ui";
import { NEED_LABEL, TYPE_LABEL, needsFromText, daysUntil, todayIso } from "../lib/navigator";
import { Status } from "../components/NavBits";
import GuideChat from "../components/GuideChat";

// /navigator -- public, no login. Pick where you are and what you need; get a short path of Canadian programs with the
// reason for each one. Everything on the cards comes from the program's own requirements (see backend/navigator.py).
// Built to be glanced at: big stage tiles, chips, one line per reason. Community programs sit in the same list.

const STAGE_ICONS = { idea: Lightbulb, prototype: Wrench, launched: Rocket, revenue: TrendingUp, growth: Building2 };
const STORE = "pw_nav_profile";
const DEFAULT = { stage: "idea", needs: ["funding", "mentorship"], audiences: [], sectors: [], province: "ON", city: "", age: "", incorporated: "unsure", employees: "", goal: "" };
const VERIFIED = { official: "Official page", third_party: "Third-party source", unconfirmed: "Not confirmed" };

const load = () => { try { return { ...DEFAULT, ...JSON.parse(window.sessionStorage.getItem(STORE) || "{}") }; } catch { return DEFAULT; } };
const save = (p) => { try { window.sessionStorage.setItem(STORE, JSON.stringify(p)); } catch { /* storage blocked: fine */ } };
// account profile -> the form's shape (the form uses strings for age/employees and yes/no/unsure for incorporated)
const fromAccount = (p) => ({ ...DEFAULT, ...p, age: p.age ? String(p.age) : "", employees: p.employees == null ? "" : String(p.employees), city: p.city || "",
  incorporated: p.incorporated === true ? "yes" : p.incorporated === false ? "no" : "unsure", needs: p.needs || [], audiences: p.audiences || [], sectors: p.sectors || [] });
const dayLabel = (iso) => { try { return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); } catch { return iso || ""; } };
const isExternal = (u) => /^https?:\/\//.test(u || "");

function Toggle({ on, onClick, children, testId }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} data-testid={testId}
      className={cx("rounded-full border px-3 py-1.5 text-sm transition", on ? "border-transparent font-semibold" : "border-line text-muted hover:text-ink")}
      style={on ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{children}</button>
  );
}

function Link2({ href, className, children, ...p }) {
  return isExternal(href) ? <a href={href} target="_blank" rel="noreferrer" className={className} {...p}>{children}</a> : <Link to={href || "/"} className={className} {...p}>{children}</Link>;
}

// What a program's deadline looks like on the row: only a real, upcoming date is worth a chip.
function deadlineChip(p) {
  const dl = p.deadline || {};
  if (dl.kind !== "fixed" || !dl.date) return null;
  const d = daysUntil(dl.date, todayIso());
  if (d == null || d < 0) return null;
  return { text: d === 0 ? "Closes today" : d <= 45 ? `Closes in ${d} day${d === 1 ? "" : "s"}` : `Closes ${dayLabel(dl.date)}`, urgent: d <= 45 };
}

// One program as a single scannable row. Tap it to open the details: what it is, why it fits, what to watch for, what they ask for.
function ProgramRow({ p, meta, open, onToggle }) {
  const chip = deadlineChip(p);
  // Lead with the most specific reason: "built for founders at your stage" is true of nearly every row, so it goes last.
  const reasons = [...(p.reasons || [])].sort((a, b) => /^Built for founders at your stage/.test(a) - /^Built for founders at your stage/.test(b));
  const lead = reasons[0];
  return (
    <article id={`prog-${p.id}`} className={cx("scroll-mt-24 rounded-2xl border bg-surface transition", open ? "border-ink/30" : "border-line")} data-testid={`program-${p.id}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} data-testid={`row-${p.id}`} className="flex w-full items-start gap-3 p-4 text-left">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-base font-semibold leading-snug">{p.name}</span>
            {p.community && <span className="chip chip-accent">From {p.community.name}</span>}
          </span>
          <span className="mt-0.5 block text-sm text-muted">{p.org} · {TYPE_LABEL[p.type] || p.type}</span>
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <Status status={p.status} />
            {chip && <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", chip.urgent ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-ink/10 text-muted")}>{chip.text}</span>}
          </span>
          {lead ? <span className="mt-2 flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /><span className={cx(!open && "line-clamp-2")}>{lead}</span></span>
            : p.summary && <span className={cx("mt-2 block text-sm text-muted", !open && "line-clamp-2")}>{p.summary}</span>}
        </span>
        <ChevronDown className={cx("mt-1 h-5 w-5 shrink-0 text-muted transition", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="space-y-4 border-t border-line px-4 pb-4 pt-4" data-testid={`detail-${p.id}`}>
          {p.summary && lead && <p className="text-[15px]">{p.summary}</p>}
          {p.amount && <div><p className="eyebrow">What you get</p><p className="mt-1 text-sm">{p.amount}</p></div>}
          {reasons.length > 1 && (
            <div><p className="eyebrow">Why it fits you</p>
              <ul className="mt-2 space-y-1.5">{reasons.slice(1).map((r) => <li key={r} className="flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /><span>{r}</span></li>)}</ul></div>
          )}
          {(p.cautions || []).filter(Boolean).length > 0 && (
            <div><p className="eyebrow">Watch out for</p>
              <ul className="mt-2 space-y-1.5">{p.cautions.filter(Boolean).map((r) => <li key={r} className="flex gap-2 text-sm text-muted"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden /><span>{r}</span></li>)}</ul></div>
          )}
          {(p.requirements || []).length > 0 && (
            <div><p className="eyebrow">What they ask for</p>
              <ul className="mt-2 space-y-1 text-sm text-muted">{p.requirements.map((r) => <li key={r} className="flex gap-2"><span aria-hidden>•</span><span>{r}</span></li>)}</ul></div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link2 href={p.apply_url} className="btn-primary !px-4 !py-2 text-sm" data-testid={`apply-${p.id}`}>{p.community ? "See it" : "Official page"}<ExternalLink className="h-4 w-4" /></Link2>
            <span className="inline-flex items-center gap-1 text-xs text-muted" title={meta?.notes || ""}>
              <BadgeCheck className={cx("h-4 w-4", p.verified === "official" ? "text-emerald-500" : "text-muted")} aria-hidden />
              {VERIFIED[p.verified] || ""}{p.last_checked ? ` · checked ${dayLabel(p.last_checked)}` : ""}
            </span>
          </div>
        </div>
      )}
    </article>
  );
}

// The three-step plan, as a short vertical list. Tapping a step opens that program below.
function PathList({ path, onPick }) {
  return (
    <ol className="space-y-2" data-testid="nav-path">
      {path.map((s, i) => (
        <li key={s.phase}>
          <button type="button" onClick={() => onPick(s.program_id)} data-testid={`path-${s.phase}`} className="flex w-full items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-ink/30">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold uppercase text-muted" style={{ letterSpacing: "0.1em" }}>{s.label}</span>
              <span className="mt-0.5 block text-base font-semibold leading-snug">{s.name}</span>
              <span className="mt-0.5 block text-sm text-muted">{s.why}</span>
            </span>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted" aria-hidden />
          </button>
        </li>
      ))}
    </ol>
  );
}

function CommunityCard({ c }) {
  return (
    <Link to={`/c/${c.slug}`} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 transition hover:border-ink/30" data-testid={`com-${c.slug}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold" style={{ background: c.brand?.colors?.accent || "var(--accent)", color: "#fff" }}>{(c.name || "?").slice(0, 1)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{c.name}</span>
        <span className="block truncate text-xs text-muted">{c.kind}{c.city ? ` · ${c.city}` : ""}{c.members ? ` · ${c.members} members` : ""}</span>
        {(c.reasons || [])[0] && <span className="mt-2 flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /><span>{c.reasons[0]}</span></span>}
      </span>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted" aria-hidden />
    </Link>
  );
}

// Signed-out visitors answer a few quick things here. Signed-in people never see this: their answers live in their profile.
function QuickAnswers({ meta, profile, set, toggle }) {
  const found = useMemo(() => needsFromText(profile.goal).filter((n) => !profile.needs.includes(n)), [profile.goal, profile.needs]);
  return (
    <section className="space-y-5 rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-label="About you" data-testid="nav-form">
      <div>
        <p className="eyebrow">Where are you?</p>
        <div className="mt-3 grid grid-cols-1 gap-2">
          {meta.stages.map((s) => {
            const Icon = STAGE_ICONS[s.key] || Compass;
            const on = profile.stage === s.key;
            return (
              <button key={s.key} type="button" onClick={() => set({ stage: s.key })} aria-pressed={on} data-testid={`stage-${s.key}`}
                className={cx("flex items-center gap-3 rounded-xl border p-3 text-left transition", on ? "border-transparent" : "border-line hover:border-ink/30")}
                style={on ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                <span className="min-w-0"><span className="block text-sm font-semibold capitalize">{s.label}</span>{on && <span className="block text-xs opacity-80">{s.hint}</span>}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="eyebrow">What do you need?</p>
        <div className="mt-3 flex flex-wrap gap-2">{meta.needs.map((n) => <Toggle key={n.key} on={profile.needs.includes(n.key)} onClick={() => toggle("needs", n.key)} testId={`need-${n.key}`}>{n.label}</Toggle>)}</div>
      </div>

      <label className="block"><span className="label">Province</span>
        <select className="input" value={profile.province} onChange={(e) => set({ province: e.target.value })} data-testid="nav-province">{meta.provinces.map((p) => <option key={p}>{p}</option>)}</select></label>

      <details className="group rounded-xl border border-line" data-testid="nav-more">
        <summary className="flex cursor-pointer items-center justify-between gap-2 p-3 text-sm font-semibold">Sharper matches (optional)<ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden /></summary>
        <div className="space-y-5 border-t border-line p-3">
          <div>
            <p className="eyebrow">I am…</p>
            <div className="mt-3 flex flex-wrap gap-2">{meta.audiences.map((a) => <Toggle key={a.key} on={profile.audiences.includes(a.key)} onClick={() => toggle("audiences", a.key)} testId={`aud-${a.key}`}>{a.label}</Toggle>)}</div>
            <p className="mt-2 text-xs text-muted">Some programs are only for one group, and we only show those when you pick it.</p>
          </div>
          <div>
            <p className="eyebrow">What you build</p>
            <div className="mt-3 flex flex-wrap gap-2">{meta.sectors.map((s) => <Toggle key={s} on={profile.sectors.includes(s)} onClick={() => toggle("sectors", s)} testId={`sec-${s}`}>{s}</Toggle>)}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">City</span><input className="input" value={profile.city} onChange={(e) => set({ city: e.target.value })} placeholder="Toronto" maxLength={80} data-testid="nav-city" /></label>
            <label className="block"><span className="label">Your age</span><input className="input" inputMode="numeric" value={profile.age} onChange={(e) => set({ age: e.target.value.replace(/\D/g, "").slice(0, 3) })} placeholder="Optional" data-testid="nav-age" /></label>
            <label className="block"><span className="label">Employees</span><input className="input" inputMode="numeric" value={profile.employees} onChange={(e) => set({ employees: e.target.value.replace(/\D/g, "").slice(0, 5) })} placeholder="Optional" data-testid="nav-employees" /></label>
          </div>
          <div>
            <p className="eyebrow">Incorporated?</p>
            <div className="mt-3 flex gap-2">{[["yes", "Yes"], ["no", "Not yet"], ["unsure", "Not sure"]].map(([k, l]) => <Toggle key={k} on={profile.incorporated === k} onClick={() => set({ incorporated: k })} testId={`inc-${k}`}>{l}</Toggle>)}</div>
          </div>
          <label className="block"><span className="label">Anything else? (one line)</span>
            <textarea className="input" rows={2} maxLength={300} value={profile.goal} onChange={(e) => set({ goal: e.target.value })} placeholder="I need a grant to build a prototype and a mentor in health tech" data-testid="nav-goal" />
            {found.length > 0 && (
              <button type="button" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--accent)" }} onClick={() => set({ needs: [...profile.needs, ...found] })} data-testid="nav-pick-needs">
                <Sparkles className="h-4 w-4" />Add {found.map((n) => NEED_LABEL[n]).join(", ")} to my needs
              </button>
            )}
          </label>
        </div>
      </details>

      <p className="text-sm text-muted">Want this kept? <Link to="/signup" className="font-medium underline" data-testid="nav-signup">Make a free account</Link> and it becomes your profile: one place that drives your programs, communities and the guide.</p>
    </section>
  );
}

// Signed-in: the answers come from the person's own profile. This is a read-only summary with one way to change it.
function ProfileStrip({ mine, meta, account, editTo }) {
  const has = !!mine?.stage;
  const stage = meta.stages.find((x) => x.key === mine?.stage)?.label;
  const chips = has ? [stage && `${stage[0].toUpperCase()}${stage.slice(1)}`, ...(mine.needs || []).slice(0, 3).map((n) => NEED_LABEL[n]), mine.province, ...(mine.sectors || []).slice(0, 2)].filter(Boolean) : [];
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-label="Your profile" data-testid="nav-profile-bar">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Rocket className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{has ? "Matched to your profile" : "Your profile"}</p>
          <p className="mt-0.5 truncate text-lg font-semibold leading-snug">{has ? (mine.name || account?.name) : "Add your startup"}</p>
          <p className="text-sm text-muted">{has ? (mine.one_liner || "These results follow whatever is in your profile.") : "Tell us where you are once. Programs, communities and the guide all use it."}</p>
        </div>
      </div>
      {chips.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{chips.map((c) => <span key={c} className="chip">{c}</span>)}</div>}
      <Link to={editTo} className={cx("mt-4 w-full sm:w-auto", has ? "btn-ghost border border-line !py-2 text-sm" : "btn-primary !py-2 text-sm")} data-testid="nav-edit-profile">{has ? "Edit in your profile" : "Set up my profile"}<ArrowRight className="h-4 w-4" /></Link>
    </section>
  );
}

function Results({ res, meta, loading, generic }) {
  const [openId, setOpenId] = useState(null);
  const [type, setType] = useState("");
  const [showAll, setShowAll] = useState(false);
  if (!res) return <Spinner />;
  const { matches, more, later, communities, path, skipped } = res;
  const all = [...matches, ...more];
  const counts = all.reduce((o, p) => ({ ...o, [p.type]: (o[p.type] || 0) + 1 }), {});
  const shown = type ? all.filter((p) => p.type === type) : all;
  const LIMIT = 6;
  const visible = showAll || type ? shown : shown.slice(0, LIMIT);
  const best = visible.filter((p) => p.fit === "strong");
  const worth = visible.filter((p) => p.fit !== "strong");
  const pick = (id) => {
    setType(""); setShowAll(true); setOpenId(id);
    setTimeout(() => document.getElementById(`prog-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  const row = (p) => <ProgramRow key={p.id} p={p} meta={meta} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} />;
  return (
    <div className={cx("space-y-8 transition-opacity", loading && "opacity-60")} aria-busy={loading} data-testid="nav-results">
      {generic && <p className="rounded-xl bg-ink/[.05] p-3 text-sm text-muted">These are examples for an early-stage founder in Ontario. Add your startup to your profile to see yours.</p>}
      <div className="flex gap-3" data-testid="nav-mentor">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Compass className="h-4 w-4" aria-hidden /></span>
        <p className="min-w-0 pt-1 text-[17px] leading-snug">{res.narrative || res.summary}</p>
      </div>

      {path.length > 0 && (
        <section><h2 className="mb-3 text-sm font-semibold uppercase text-muted" style={{ letterSpacing: "0.1em" }}>Your next 3 steps</h2><PathList path={path} onPick={pick} /></section>
      )}

      {communities?.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase text-muted" style={{ letterSpacing: "0.1em" }}>Communities that can help</h2>
          <p className="mb-3 mt-1 text-sm text-muted">Joining one adds its own programs and people here.</p>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))]">{communities.map((c) => <CommunityCard key={c.slug} c={c} />)}</div>
        </section>
      )}

      <section data-testid="nav-list">
        <h2 className="text-sm font-semibold uppercase text-muted" style={{ letterSpacing: "0.1em" }}>{all.length ? `All ${all.length} that fit` : "No clean fit yet"}</h2>
        {Object.keys(counts).length > 1 && (
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter by type">
            <Toggle on={!type} onClick={() => setType("")} testId="nav-type-all"><span className="whitespace-nowrap">All {all.length}</span></Toggle>
            {Object.entries(counts).map(([k, n]) => <Toggle key={k} on={type === k} onClick={() => setType(type === k ? "" : k)} testId={`nav-type-${k}`}><span className="whitespace-nowrap">{TYPE_LABEL[k] || k} {n}</span></Toggle>)}
          </div>
        )}
        {best.length > 0 && <div className="mt-4"><p className="mb-2 text-sm font-semibold">Best fits</p><div className="space-y-3">{best.map(row)}</div></div>}
        {worth.length > 0 && <div className="mt-5"><p className="mb-2 text-sm font-semibold">Worth a look</p><div className="space-y-3">{worth.map(row)}</div></div>}
        {!showAll && !type && shown.length > LIMIT && <button type="button" onClick={() => setShowAll(true)} className="btn-ghost mt-4 w-full border border-line !py-2.5 text-sm" data-testid="nav-show-all">Show {shown.length - LIMIT} more</button>}
      </section>

      {later.length > 0 && (
        <details className="group rounded-2xl border border-dashed border-line" data-testid="nav-later">
          <summary className="flex cursor-pointer items-center justify-between gap-2 p-4 text-sm font-semibold">Not yet: {later.length} to come back to<ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden /></summary>
          <div className="space-y-2 border-t border-dashed border-line p-4">
            {later.map((p) => (
              <div key={p.id} data-testid={`later-${p.id}`}>
                <p className="font-semibold">{p.name} <span className="text-sm font-normal text-muted">· {TYPE_LABEL[p.type] || p.type}</span></p>
                <p className="mt-0.5 flex gap-2 text-sm text-muted"><Flag className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{(p.cautions || [])[0]}</span></p>
              </div>
            ))}
          </div>
        </details>
      )}

      <p className="text-xs text-muted">
        {skipped > 0 ? `${skipped} programs were left out because they are for other provinces, other groups, other stages or age limits. ` : ""}
        Details change without notice, so always confirm on the official page. Directory checked {dayLabel(meta.version)}.
      </p>
    </div>
  );
}

function Directory({ meta }) {
  const [f, setF] = useState({ q: "", type: "", status: "", province: "", need: "" });
  const [rows, setRows] = useState(null);
  const [openId, setOpenId] = useState(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
      api.get("/navigator/programs", { params }).then((r) => { if (live) setRows(r.data.programs); }).catch(() => { if (live) setRows([]); });
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [f]);
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  return (
    <div data-testid="nav-directory">
      <div className="flex flex-col gap-3">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input !pl-9" placeholder="Search grants, loans, accelerators…" value={f.q} onChange={(e) => set("q", e.target.value)} aria-label="Search programs" data-testid="dir-search" /></div>
        <div className="flex flex-wrap gap-2">
          <Toggle on={f.status === "live"} onClick={() => set("status", f.status === "live" ? "" : "live")} testId="dir-live">Taking applications</Toggle>
          {meta.types.map((t) => <Toggle key={t.key} on={f.type === t.key} onClick={() => set("type", f.type === t.key ? "" : t.key)} testId={`dir-type-${t.key}`}>{t.label}</Toggle>)}
        </div>
        <div className="flex flex-wrap gap-2">{meta.needs.slice(0, 7).map((n) => <Toggle key={n.key} on={f.need === n.key} onClick={() => set("need", f.need === n.key ? "" : n.key)} testId={`dir-need-${n.key}`}>{n.label}</Toggle>)}</div>
      </div>
      <p className="mb-3 mt-5 text-sm text-muted">{rows ? `${rows.length} program${rows.length === 1 ? "" : "s"}` : ""}</p>
      {!rows ? <Spinner /> : rows.length === 0 ? <p className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">Nothing matches. Try clearing a filter.</p>
        : <div className="space-y-3">{rows.map((p) => <ProgramRow key={p.id} p={p} meta={meta} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} />)}</div>}
    </div>
  );
}

export default function Navigator({ embedded }) {
  const { user, account } = useAuth();
  const [meta, setMeta] = useState(null);
  const [mine, setMine] = useState(null);   // the signed-in person's saved startup profile ({} when they have none yet); null while loading
  const [tab, setTab] = useState("path");
  const [formOpen, setFormOpen] = useState(false);
  const [profile, setProfile] = useState(load);
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const seq = useRef(0);
  const ready = !account || mine !== null;       // signed in: wait for the profile so we never flash results for someone else's answers
  const generic = !!account && ready && !mine?.stage;

  useEffect(() => { document.title = "Navigator · Pathwai"; api.get("/navigator/meta").then((r) => setMeta(r.data)).catch(() => setErr("The directory could not load. Please try again.")); }, []);

  // Signed in: the profile on the account IS the input. Read it; changing it happens on the profile page, and everything here follows.
  useEffect(() => {
    if (!account) { setMine(null); return; }
    api.get("/navigator/me").then((r) => {
      setMine(r.data.startup || {});
      setProfile(r.data.profile && r.data.profile.stage ? fromAccount(r.data.profile) : DEFAULT);
    }).catch(() => setMine({}));
  }, [account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tell the account which programs have now been seen, so the Hub can say how many are new next time.
  const seenOnce = useRef(false);
  useEffect(() => { if (account && res && !seenOnce.current) { seenOnce.current = true; api.post("/navigator/seen").catch(() => {}); } }, [account, res]);

  const set = useCallback((patch) => { setProfile((p) => { const n = { ...p, ...patch }; save(n); return n; }); }, []);
  const toggle = useCallback((key, v) => { setProfile((p) => { const cur = p[key] || []; const n = { ...p, [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] }; save(n); return n; }); }, []);
  const apiProfile = { ...profile, age: profile.age ? Number(profile.age) : null, employees: profile.employees === "" ? null : Number(profile.employees) };

  useEffect(() => {
    if (!meta || !ready) return undefined;
    const my = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      api.post("/navigator/suggest", { profile: apiProfile })
        .then((r) => { if (seq.current === my) { setRes(r.data); setErr(""); } })
        .catch((e) => { if (seq.current === my) setErr(e?.response?.data?.detail || "Could not get suggestions. Please try again."); })
        .finally(() => { if (seq.current === my) setLoading(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [profile, meta, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const editTo = "/me?edit=startup";

  const body = (
    <div className={cx("mx-auto w-full", account ? "max-w-3xl" : "max-w-[1200px]")}>
      <div className="mb-6">
        <p className="eyebrow">Navigator</p>
        <h1 className="mt-2 text-3xl sm:text-5xl" style={{ textWrap: "balance" }}>Programs that fit you</h1>
        <p className="mt-2 max-w-2xl text-base text-muted sm:text-lg">{account ? "Canadian grants, accelerators and mentors, matched to your profile." : "Say where you are. Get the Canadian programs that fit, and why."}</p>
        <p className="mt-2 text-sm text-muted">{meta ? `${meta.count} programs, hand-checked. Communities add their own.` : "Loading"}</p>
      </div>

      <Tabs tabs={[{ value: "path", label: "For you" }, { value: "ask", label: "Ask the guide" }, { value: "all", label: "Browse all" }]} value={tab} onChange={setTab} />

      {err && <p className="mb-4 rounded-xl border border-red-500/40 p-3 text-sm text-red-500" role="alert">{err}</p>}
      {!meta ? <Spinner /> : tab === "all" ? <Directory meta={meta} /> : tab === "ask" ? (
        <div className="mx-auto w-full max-w-3xl"><GuideChat className="h-[min(72dvh,680px)]" signedIn={!!account} hasProfile={!!mine?.stage} startupName={mine?.name} formProfile={apiProfile} /></div>
      ) : account ? (
        <div className="space-y-6">
          {mine === null ? <Spinner /> : <ProfileStrip mine={mine} meta={meta} account={account} editTo={editTo} />}
          {ready && <Results res={res} meta={meta} loading={loading} generic={generic} />}
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="min-w-0 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
            {/* On a phone the form folds into one line so the answer is the first thing you see. */}
            <button type="button" onClick={() => setFormOpen(!formOpen)} aria-expanded={formOpen} data-testid="nav-form-toggle"
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left lg:hidden">
              <span className="min-w-0 flex-1"><span className="block text-xs font-semibold uppercase text-muted" style={{ letterSpacing: "0.1em" }}>About you</span>
                <span className="block truncate text-sm font-semibold capitalize">{meta.stages.find((x) => x.key === profile.stage)?.label}{profile.needs.length ? ` · ${profile.needs.slice(0, 3).map((n) => NEED_LABEL[n]).join(", ")}` : ""}</span></span>
              <span className="text-sm font-medium" style={{ color: "var(--accent)" }}>{formOpen ? "Done" : "Change"}</span>
            </button>
            <div className={cx(formOpen ? "mt-3 block" : "hidden", "lg:mt-0 lg:block")}><QuickAnswers meta={meta} profile={profile} set={set} toggle={toggle} /></div>
          </div>
          <div className="min-w-0"><Results res={res} meta={meta} loading={loading} /></div>
        </div>
      )}
    </div>
  );

  if (embedded) return body;
  return (
    <div className="min-h-[100dvh] px-4 py-5 sm:py-8" data-testid="navigator-page">
      <header className="mx-auto mb-8 flex w-full max-w-[1200px] items-center justify-between gap-3">
        <Link to="/about" className="text-xl"><Wordmark name="Pathwai" brand={{}} /></Link>
        <Link to={user ? "/" : "/login"} className="btn-ghost !py-2 text-sm">{user ? "Back to community" : "Sign in"}</Link>
      </header>
      {body}
      <PoweredBy className="mt-10 pb-2 text-center" />
    </div>
  );
}
