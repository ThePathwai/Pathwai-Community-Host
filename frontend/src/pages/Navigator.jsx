import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, BadgeCheck, Building2, Check, ChevronDown, Compass, ExternalLink, Flag, Lightbulb, MapPin, Rocket, Search, Sparkles, TrendingUp, TriangleAlert, Users, Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Wordmark, PoweredBy, Spinner, Tabs, cx } from "../components/ui";
import { NEED_LABEL, STATUS_LABEL, TYPE_LABEL, needsFromText } from "../lib/navigator";

// /navigator -- public, no login. Pick where you are and what you need; get a short path of Canadian programs with the
// reason for each one. Everything on the cards comes from the program's own requirements (see backend/navigator.py).
// Built to be glanced at: big stage tiles, chips, one line per reason. Community programs sit in the same list.

const STAGE_ICONS = { idea: Lightbulb, prototype: Wrench, launched: Rocket, revenue: TrendingUp, growth: Building2 };
const STORE = "pw_nav_profile";
const DEFAULT = { stage: "idea", needs: ["funding", "mentorship"], audiences: [], sectors: [], province: "ON", city: "", age: "", incorporated: "unsure", employees: "", goal: "" };
const STATUS_STYLE = {
  open: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", rolling: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  check: "bg-amber-500/15 text-amber-700 dark:text-amber-400", closed: "bg-red-500/15 text-red-600 dark:text-red-400", paused: "bg-red-500/15 text-red-600 dark:text-red-400",
};
const FIT = { strong: "Strong fit", possible: "Possible fit", later: "Later" };
const VERIFIED = { official: "Official page", third_party: "Third-party source", unconfirmed: "Not confirmed" };

const load = () => { try { return { ...DEFAULT, ...JSON.parse(window.sessionStorage.getItem(STORE) || "{}") }; } catch { return DEFAULT; } };
const save = (p) => { try { window.sessionStorage.setItem(STORE, JSON.stringify(p)); } catch { /* storage blocked: fine */ } };
const key = (p) => JSON.stringify([p.stage, [...p.needs].sort(), [...p.audiences].sort(), [...p.sectors].sort(), p.province, p.incorporated, String(p.employees), p.goal]);
// account profile -> the form's shape (the form uses strings for age/employees and yes/no/unsure for incorporated)
const fromAccount = (p) => ({ ...DEFAULT, ...p, age: p.age ? String(p.age) : "", employees: p.employees == null ? "" : String(p.employees), city: p.city || "",
  incorporated: p.incorporated === true ? "yes" : p.incorporated === false ? "no" : "unsure", needs: p.needs || [], audiences: p.audiences || [], sectors: p.sectors || [] });
// the form -> what is stored on the account (age and city already live on the account itself)
const toStartup = (p) => ({ stage: p.stage, needs: p.needs, audiences: p.audiences, sectors: p.sectors, province: p.province, goal: p.goal,
  employees: p.employees === "" ? null : Number(p.employees), incorporated: p.incorporated === "yes" ? true : p.incorporated === "no" ? false : null });
const dayLabel = (iso) => { try { return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); } catch { return iso || ""; } };
const isExternal = (u) => /^https?:\/\//.test(u || "");

function Toggle({ on, onClick, children, testId }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} data-testid={testId}
      className={cx("rounded-full border px-3 py-1.5 text-sm transition", on ? "border-transparent font-semibold" : "border-line text-muted hover:text-ink")}
      style={on ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{children}</button>
  );
}

function Status({ status }) {
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_STYLE[status] || STATUS_STYLE.check)}>{STATUS_LABEL[status] || status}</span>;
}

function Link2({ href, className, children, ...p }) {
  return isExternal(href) ? <a href={href} target="_blank" rel="noreferrer" className={className} {...p}>{children}</a> : <Link to={href || "/"} className={className} {...p}>{children}</Link>;
}

// One program, with the reasons it was picked and anything to watch out for.
function ProgramCard({ p, meta, compact }) {
  const [open, setOpen] = useState(false);
  const fit = p.fit;
  return (
    <article id={`prog-${p.id}`} className="scroll-mt-24 rounded-2xl border border-line bg-surface p-4 sm:p-5" data-testid={`program-${p.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip">{TYPE_LABEL[p.type] || p.type}</span>
        <Status status={p.status} />
        {p.community && <Link to={`/c/${p.community.slug}`} className="chip chip-accent">From {p.community.name}</Link>}
        {fit && <span className="ml-auto text-xs font-semibold text-muted">{FIT[fit]}</span>}
      </div>
      <h3 className="mt-3 text-xl font-semibold leading-snug" style={{ textTransform: "none", letterSpacing: 0 }}>{p.name}</h3>
      <p className="text-sm text-muted">{p.org}</p>
      {fit && fit !== "later" && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10" aria-hidden><div className="h-full rounded-full" style={{ width: `${Math.max(8, Math.min(100, p.score))}%`, background: "var(--accent)" }} /></div>}
      {!compact && p.summary && <p className="mt-3 text-[15px]">{p.summary}</p>}
      {p.amount && <p className="mt-2 text-sm"><span className="font-semibold">Amount: </span><span className="text-muted">{p.amount}</span></p>}

      {(p.reasons || []).length > 0 && (
        <ul className="mt-3 space-y-1.5">{p.reasons.map((r) => <li key={r} className="flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /><span>{r}</span></li>)}</ul>
      )}
      {(p.cautions || []).length > 0 && (
        <ul className="mt-2 space-y-1.5">{p.cautions.filter(Boolean).map((r) => <li key={r} className="flex gap-2 text-sm text-muted"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden /><span>{r}</span></li>)}</ul>
      )}

      {(p.requirements || []).length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink" aria-expanded={open} data-testid={`req-${p.id}`}>
            What they ask for <ChevronDown className={cx("h-4 w-4 transition", open && "rotate-180")} />
          </button>
          {open && <ul className="mt-2 space-y-1 text-sm text-muted">{p.requirements.map((r) => <li key={r} className="flex gap-2"><span aria-hidden>•</span><span>{r}</span></li>)}</ul>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link2 href={p.apply_url} className="btn-primary !px-4 !py-2 text-sm" data-testid={`apply-${p.id}`}>{p.community ? "See it" : "Official page"}<ExternalLink className="h-4 w-4" /></Link2>
        <span className="inline-flex items-center gap-1 text-xs text-muted" title={meta?.notes || ""}>
          <BadgeCheck className={cx("h-4 w-4", p.verified === "official" ? "text-emerald-500" : "text-muted")} aria-hidden />
          {VERIFIED[p.verified] || ""}{p.last_checked ? ` · checked ${dayLabel(p.last_checked)}` : ""}
        </span>
      </div>
    </article>
  );
}

function PathStep({ step, i }) {
  return (
    <a href={`#prog-${step.program_id}`} className="group flex flex-1 flex-col rounded-2xl border border-line bg-surface p-4 transition hover:border-ink/30" data-testid={`path-${step.phase}`}>
      <span className="flex items-center gap-2 text-xs font-semibold uppercase text-muted" style={{ letterSpacing: "0.1em" }}>
        <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px]" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>{i + 1}</span>{step.label}
      </span>
      <span className="mt-2 text-base font-semibold leading-snug">{step.name}</span>
      <span className="mt-1 text-sm text-muted">{step.why}</span>
    </a>
  );
}

function CommunityCard({ c }) {
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-surface p-4" data-testid={`com-${c.slug}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold" style={{ background: c.brand?.colors?.accent || "var(--accent)", color: "#fff" }}>{(c.name || "?").slice(0, 1)}</span>
        <div className="min-w-0"><p className="truncate font-semibold">{c.name}</p><p className="truncate text-xs text-muted">{c.kind}{c.city ? ` · ${c.city}` : ""}{c.members ? ` · ${c.members} members` : ""}</p></div>
      </div>
      {c.blurb && <p className="mt-3 text-sm text-muted">{c.blurb}</p>}
      <ul className="mt-3 space-y-1.5">{c.reasons.slice(0, 3).map((r) => <li key={r} className="flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /><span>{r}</span></li>)}</ul>
      <Link to={`/c/${c.slug}`} className="btn-ghost mt-4 !py-2 text-sm">See the community <ArrowRight className="h-4 w-4" /></Link>
    </div>
  );
}

function AboutYou({ meta, profile, set, toggle }) {
  const found = useMemo(() => needsFromText(profile.goal).filter((n) => !profile.needs.includes(n)), [profile.goal, profile.needs]);
  return (
    <section className="space-y-6 rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-label="About you" data-testid="nav-form">
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
                <span className="min-w-0"><span className="block text-sm font-semibold capitalize">{s.label}</span><span className={cx("block text-xs", on ? "opacity-80" : "text-muted")}>{s.hint}</span></span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="eyebrow">What do you need?</p>
        <div className="mt-3 flex flex-wrap gap-2">{meta.needs.map((n) => <Toggle key={n.key} on={profile.needs.includes(n.key)} onClick={() => toggle("needs", n.key)} testId={`need-${n.key}`}>{n.label}</Toggle>)}</div>
      </div>

      <div>
        <p className="eyebrow">I am…</p>
        <div className="mt-3 flex flex-wrap gap-2">{meta.audiences.map((a) => <Toggle key={a.key} on={profile.audiences.includes(a.key)} onClick={() => toggle("audiences", a.key)} testId={`aud-${a.key}`}>{a.label}</Toggle>)}</div>
        <p className="mt-2 text-xs text-muted">Optional. Some programs are only for one group, and we only show those when you pick it.</p>
      </div>

      <div>
        <p className="eyebrow">What you build</p>
        <div className="mt-3 flex flex-wrap gap-2">{meta.sectors.map((s) => <Toggle key={s} on={profile.sectors.includes(s)} onClick={() => toggle("sectors", s)} testId={`sec-${s}`}>{s}</Toggle>)}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="label">Province</span>
          <select className="input" value={profile.province} onChange={(e) => set({ province: e.target.value })} data-testid="nav-province">{meta.provinces.map((p) => <option key={p}>{p}</option>)}</select></label>
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
    </section>
  );
}

function Results({ res, meta, loading }) {
  if (!res) return <Spinner />;
  const { matches, more, later, communities, path, skipped } = res;
  return (
    <div className={cx("space-y-6 transition-opacity", loading && "opacity-60")} aria-busy={loading} data-testid="nav-results">
      <div className="flex gap-3 rounded-2xl border border-line bg-surface p-4 sm:p-5" data-testid="nav-mentor">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Compass className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0">
          <p className="eyebrow">Your mentor says</p>
          <p className="mt-1 text-[17px] leading-snug">{res.narrative || res.summary}</p>
        </div>
      </div>

      {path.length > 0 && (
        <div>
          <p className="eyebrow mb-3">Your path</p>
          <div className="flex flex-col gap-3 sm:flex-row">{path.map((s, i) => <PathStep key={s.phase} step={s} i={i} />)}</div>
        </div>
      )}

      <div>
        <p className="eyebrow mb-3">{matches.length ? `${matches.length} that fit${more.length ? `, ${more.length} more below` : ""}` : "No clean fit yet"}</p>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[repeat(2,minmax(0,1fr))]">{matches.map((p) => <ProgramCard key={p.id} p={p} meta={meta} />)}</div>
        {more.length > 0 && (
          <details className="mt-4 rounded-2xl border border-line bg-surface p-4"><summary className="cursor-pointer text-sm font-semibold">{more.length} more to look at</summary>
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[repeat(2,minmax(0,1fr))]">{more.map((p) => <ProgramCard key={p.id} p={p} meta={meta} />)}</div></details>
        )}
      </div>

      {communities?.length > 0 && (
        <div>
          <p className="eyebrow mb-3">Communities that can help</p>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-[repeat(2,minmax(0,1fr))]">{communities.map((c) => <CommunityCard key={c.slug} c={c} />)}</div>
        </div>
      )}

      {later.length > 0 && (
        <div>
          <p className="eyebrow mb-3">Come back to these</p>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
            {later.map((p) => (
              <div key={p.id} className="rounded-2xl border border-dashed border-line p-4" data-testid={`later-${p.id}`}>
                <div className="flex items-center gap-2"><span className="chip">{TYPE_LABEL[p.type] || p.type}</span><Status status={p.status} /></div>
                <p className="mt-2 font-semibold">{p.name}</p>
                <p className="mt-1 flex gap-2 text-sm text-muted"><Flag className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{(p.cautions || [])[0]}</span></p>
              </div>
            ))}
          </div>
        </div>
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
        : <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[repeat(2,minmax(0,1fr))]">{rows.map((p) => <ProgramCard key={p.id} p={p} meta={meta} compact />)}</div>}
    </div>
  );
}

export default function Navigator({ embedded }) {
  const { user, account, refresh } = useAuth();
  const [meta, setMeta] = useState(null);
  const [mine, setMine] = useState(null);   // the signed-in person's saved startup profile ({} when they have none yet)
  const [saved, setSaved] = useState("");   // what the form looked like when it last matched the saved profile
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("path");
  const [formOpen, setFormOpen] = useState(false);
  const [profile, setProfile] = useState(load);
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const seq = useRef(0);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  useEffect(() => { document.title = "Navigator · Pathwai"; api.get("/navigator/meta").then((r) => setMeta(r.data)).catch(() => setErr("The directory could not load. Please try again.")); }, []);

  // Signed in with a startup profile: start from it, unless they already changed the form during this visit.
  useEffect(() => {
    if (!account) { setMine(null); return; }
    api.get("/navigator/me").then((r) => {
      setMine(r.data.startup || {});
      const fresh = (() => { try { return !window.sessionStorage.getItem(STORE); } catch { return true; } })();
      if (fresh && r.data.profile && r.data.profile.stage) {
        const p = fromAccount(r.data.profile);
        setProfile(p); save(p); setSaved(key(p));
      } else setSaved(key(profileRef.current));
    }).catch(() => setMine({}));
  }, [account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveToAccount = async () => {
    setSaving(true);
    try {
      const body = { startup: { ...(mine || {}), ...toStartup(profile) } };
      if (profile.city && !account?.location) body.location = profile.city;
      await api.patch("/hub/profile", body);
      setMine(body.startup); setSaved(key(profile)); await refresh();
      toast.success("Saved to your profile");
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };

  const set = useCallback((patch) => setProfile((p) => { const n = { ...p, ...patch }; save(n); return n; }), []);
  const toggle = useCallback((key, v) => setProfile((p) => { const cur = p[key] || []; const n = { ...p, [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] }; save(n); return n; }), []);

  useEffect(() => {
    if (!meta) return undefined;
    const my = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      const body = { ...profile, age: profile.age ? Number(profile.age) : null, employees: profile.employees === "" ? null : Number(profile.employees) };
      api.post("/navigator/suggest", { profile: body })
        .then((r) => { if (seq.current === my) { setRes(r.data); setErr(""); } })
        .catch((e) => { if (seq.current === my) setErr(e?.response?.data?.detail || "Could not get suggestions. Please try again."); })
        .finally(() => { if (seq.current === my) setLoading(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [profile, meta]);

  const body = (
    <div className="mx-auto w-full max-w-[1200px]">
      <div className="mb-6">
        <p className="eyebrow">Navigator</p>
        <h1 className="mt-2 text-3xl sm:text-5xl" style={{ textWrap: "balance" }}>Your next step in Canadian innovation</h1>
        <p className="mt-2 max-w-2xl text-base text-muted sm:text-lg">Say where you are. Get the programs that fit, and why.</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden />{meta ? `${meta.count} programs, hand-checked` : "Loading"}</span>
          <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" aria-hidden />Communities add their own</span>
        </div>
      </div>

      <Tabs tabs={[{ value: "path", label: "My path" }, { value: "all", label: "All programs" }]} value={tab} onChange={setTab} />

      {err && <p className="mb-4 rounded-xl border border-red-500/40 p-3 text-sm text-red-500" role="alert">{err}</p>}
      {!meta ? <Spinner /> : tab === "all" ? <Directory meta={meta} /> : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="min-w-0 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
            {/* On a phone the long form folds into one line so the answer is the first thing you see. */}
            <button type="button" onClick={() => setFormOpen(!formOpen)} aria-expanded={formOpen} data-testid="nav-form-toggle"
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left lg:hidden">
              <span className="min-w-0 flex-1"><span className="block text-xs font-semibold uppercase text-muted" style={{ letterSpacing: "0.1em" }}>About you</span>
                <span className="block truncate text-sm font-semibold capitalize">{meta.stages.find((x) => x.key === profile.stage)?.label}{profile.needs.length ? ` · ${profile.needs.slice(0, 3).map((n) => NEED_LABEL[n]).join(", ")}` : ""}</span></span>
              <span className="text-sm font-medium" style={{ color: "var(--accent)" }}>{formOpen ? "Done" : "Change"}</span>
            </button>
            {account && mine && (
              <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 lg:mt-0 lg:mb-3" data-testid="nav-profile-bar">
                <Rocket className="h-5 w-5 shrink-0" style={{ color: "var(--accent)" }} aria-hidden />
                <p className="min-w-0 flex-1 text-sm">
                  {mine.stage ? (mine.name ? `Starting from ${mine.name}` : "Starting from your startup profile") : "Save this to your profile"}
                  <span className="block text-xs text-muted">{!mine.stage ? "Every community and this page will know where you are." : saved === key(profile) ? "Matches your profile." : "You changed something."}</span>
                </p>
                {(!mine.stage || saved !== key(profile)) && <button type="button" onClick={saveToAccount} disabled={saving} className="btn-ghost !px-3 !py-1.5 text-sm" data-testid="nav-save-profile">{saving ? "Saving" : "Save"}</button>}
              </div>
            )}
            <div className={cx(formOpen ? "mt-3 block" : "hidden", "lg:mt-0 lg:block")}><AboutYou meta={meta} profile={profile} set={set} toggle={toggle} /></div>
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
