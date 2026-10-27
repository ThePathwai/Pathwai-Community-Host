import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ChevronDown, Compass, Flag, Pencil, Rocket, Search, Users } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Wordmark, PoweredBy, Spinner, cx } from "../components/ui";
import { NEED_LABEL, TYPE_LABEL } from "../lib/navigator";
import { startDemo } from "../lib/demo";
import { tint, typeMeta } from "../lib/programStyle";
import { FitMeter, PathTimeline, ProgramCard, ProgramDrawer, TypeTile } from "../components/ProgramCards";
import AccountShell from "../components/AccountShell";
import GuideChat from "../components/GuideChat";

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

function Segmented({ items, value, onChange }) {
  return (
    <div className="inline-flex rounded-full border border-line p-1" role="tablist">
      {items.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)} data-testid={`nav-tab-${k}`}
          className={cx("rounded-full px-4 py-1.5 text-sm font-medium transition", value === k ? "" : "text-muted hover:text-ink")}
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
    <section className="relative overflow-hidden rounded-3xl border border-line p-6 sm:p-10" style={{ background: "radial-gradient(110% 130% at 100% 0%, rgb(var(--c-ink) / 0.10) 0%, transparent 55%), rgb(var(--c-surface))" }} aria-label="Your profile" data-testid="nav-gate">
      <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Rocket className="h-6 w-6" aria-hidden /></span>
      <h2 className="mt-5 max-w-xl text-3xl leading-tight sm:text-4xl" style={{ textWrap: "balance", textTransform: "none", letterSpacing: "-0.03em", fontWeight: 800 }}>Your profile picks the programs</h2>
      <p className="mt-3 max-w-xl text-base text-muted">Tell Pathwai about your startup once, in your profile. This page, the communities suggested to you and the guide all follow it and update when it changes. There is no form to fill in here.</p>
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
        <p className="mt-1 text-sm text-muted">Fife Ashley-Dejo is a founder who has not joined any community. Open the practice account to see how one profile drives everything.</p>
        <button type="button" onClick={() => startDemo("founder")} className="btn-ghost mt-3 !py-2 text-sm" data-testid="nav-gate-demo">Open Fife's profile (demo)<ArrowRight className="h-4 w-4" /></button>
      </div>
    </section>
  );
}

// Signed in: your profile in one line, with the single way to change it.
function ProfileBar({ mine, meta }) {
  const has = !!mine?.stage;
  const stage = meta.stages.find((x) => x.key === mine?.stage)?.label;
  const bits = has ? [stage, ...(mine.needs || []).slice(0, 3).map((n) => NEED_LABEL[n]), mine.province].filter(Boolean) : [];
  if (!has) {
    return (
      <Link to="/me?edit=startup" className="flex items-center gap-4 rounded-2xl border border-dashed border-ink/30 p-4 transition hover:border-ink/60" data-testid="nav-profile-bar">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Rocket className="h-5 w-5" aria-hidden /></span>
        <span className="min-w-0 flex-1"><span className="block font-semibold">Add your startup to see programs that fit you</span><span className="block text-sm text-muted">One minute, in your profile. These are examples until then.</span></span>
        <ArrowRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
      </Link>
    );
  }
  return (
    <Link to="/me?edit=startup" className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 pr-4 transition hover:border-ink/30" data-testid="nav-profile-bar">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Rocket className="h-[18px] w-[18px]" aria-hidden /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">Matched to {mine.name || "your startup"}</span><span className="block truncate text-xs capitalize text-muted">{bits.join(" · ")}</span></span>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-muted group-hover:text-ink" data-testid="nav-edit-profile"><Pencil className="h-3.5 w-3.5" aria-hidden /><span className="hidden sm:inline">Edit in your profile</span><span className="sm:hidden">Edit</span></span>
    </Link>
  );
}

function Results({ res, meta, loading, generic, onOpen }) {
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
  const find = (id) => all.find((p) => p.id === id);
  const grid = "grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))] 2xl:grid-cols-[repeat(3,minmax(0,1fr))]";
  return (
    <div className={cx("space-y-10 transition-opacity", loading && "opacity-60")} aria-busy={loading} data-testid="nav-results">
      {generic && <p className="rounded-xl bg-ink/[.05] p-3 text-sm text-muted">These are examples for an early-stage founder in Ontario. Add your startup to your profile to see yours.</p>}

      {path.length > 0 && (
        <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <div className="mb-5 flex items-start gap-3" data-testid="nav-mentor">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Compass className="h-4 w-4" aria-hidden /></span>
            <p className="min-w-0 pt-1 text-[15px] leading-snug text-ink/90">{res.narrative || res.summary}</p>
          </div>
          <p className="eyebrow mb-4">Your path</p>
          <PathTimeline path={path} onPick={(id) => { const p = find(id); if (p) onOpen(p); }} />
        </section>
      )}

      <section data-testid="nav-list">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-xl" style={{ textTransform: "none", letterSpacing: "-0.01em", fontWeight: 700 }}>{all.length ? `${all.length} programs that fit` : "No clean fit yet"}</h2>
        </div>
        {Object.keys(counts).length > 1 && (
          <div className="pw-rail -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Filter by type">
            <Pill on={!type} onClick={() => setType("")} testId="nav-type-all">All<span className="text-xs opacity-60">{all.length}</span></Pill>
            {Object.entries(counts).map(([k, n]) => { const { color, Icon } = typeMeta(k); return <Pill key={k} on={type === k} color={color} onClick={() => setType(type === k ? "" : k)} testId={`nav-type-${k}`}><Icon className="h-3.5 w-3.5" aria-hidden />{TYPE_LABEL[k] || k}<span className="text-xs opacity-60">{n}</span></Pill>; })}
          </div>
        )}
        {best.length > 0 && <div className="mt-6"><p className="mb-3 text-sm font-semibold">Best fits</p><div className={grid}>{best.map((p) => <ProgramCard key={p.id} p={p} onOpen={onOpen} />)}</div></div>}
        {worth.length > 0 && <div className="mt-8"><p className="mb-3 text-sm font-semibold">Worth a look</p><div className={grid}>{worth.map((p) => <ProgramCard key={p.id} p={p} onOpen={onOpen} />)}</div></div>}
        {!showAll && !type && shown.length > LIMIT && <button type="button" onClick={() => setShowAll(true)} className="btn-ghost mt-5 w-full !py-3 text-sm" data-testid="nav-show-all">Show {shown.length - LIMIT} more</button>}
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

      <p className="text-xs text-muted">
        {skipped > 0 ? `${skipped} programs were left out because they are for other provinces, other groups, other stages or age limits. ` : ""}
        Details change without notice, so always confirm on the official page. Directory checked {dayLabel(meta.version)}.
      </p>
    </div>
  );
}

function Directory({ meta, onOpen }) {
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
      <div className="space-y-3">
        <div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input !rounded-full !py-3 !pl-11" placeholder="Search grants, loans, accelerators…" value={f.q} onChange={(e) => set("q", e.target.value)} aria-label="Search programs" data-testid="dir-search" /></div>
        <div className="pw-rail -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <Pill on={f.status === "live"} onClick={() => set("status", f.status === "live" ? "" : "live")} testId="dir-live">Taking applications</Pill>
          {meta.types.map((t) => { const { color, Icon } = typeMeta(t.key); return <Pill key={t.key} on={f.type === t.key} color={color} onClick={() => set("type", f.type === t.key ? "" : t.key)} testId={`dir-type-${t.key}`}><Icon className="h-3.5 w-3.5" aria-hidden />{t.label}</Pill>; })}
        </div>
        <div className="pw-rail -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">{meta.needs.slice(0, 7).map((n) => <Pill key={n.key} on={f.need === n.key} onClick={() => set("need", f.need === n.key ? "" : n.key)} testId={`dir-need-${n.key}`}>{n.label}</Pill>)}</div>
      </div>
      <p className="mb-3 mt-5 text-sm text-muted">{rows ? `${rows.length} program${rows.length === 1 ? "" : "s"}` : ""}</p>
      {!rows ? <Spinner /> : rows.length === 0 ? <p className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">Nothing matches. Try clearing a filter.</p>
        : <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))] 2xl:grid-cols-[repeat(3,minmax(0,1fr))]">{rows.map((p) => <ProgramCard key={p.id} p={p} onOpen={onOpen} />)}</div>}
    </div>
  );
}

export default function Navigator({ embedded }) {
  const { user, account } = useAuth();
  const [meta, setMeta] = useState(null);
  const [mine, setMine] = useState(null);   // the signed-in person's saved startup profile ({} when none yet); null while loading
  const [tab, setTab] = useState("path");
  const [profile, setProfile] = useState(DEFAULT);
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null);
  const seq = useRef(0);
  const ready = !account || mine !== null;       // signed in: wait for the profile so we never flash results for someone else's answers
  const generic = !!account && ready && !mine?.stage;

  useEffect(() => { document.title = "Programs · Pathwai"; api.get("/navigator/meta").then((r) => setMeta(r.data)).catch(() => setErr("The directory could not load. Please try again.")); }, []);

  // Signed in: the profile on the account IS the input. Read it; changing it happens on the profile page, and everything here follows.
  useEffect(() => {
    if (!account) { setMine(null); return; }
    api.get("/navigator/me").then((r) => {
      setMine(r.data.startup || {});
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
      api.post("/navigator/suggest", { profile: apiProfile })
        .then((r) => { if (seq.current === my) { setRes(r.data); setErr(""); } })
        .catch((e) => { if (seq.current === my) setErr(e?.response?.data?.detail || "Could not get suggestions. Please try again."); })
        .finally(() => { if (seq.current === my) setLoading(false); });
    }, 200);
    return () => clearTimeout(t);
  }, [apiProfile, meta, ready, account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const body = (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Programs</p>
          <h1 className="mt-2 text-3xl sm:text-4xl" style={{ textTransform: "none", letterSpacing: "-0.03em", fontWeight: 800, textWrap: "balance" }}>{account ? "Programs that fit you" : "Canadian programs that fit you"}</h1>
          <p className="mt-2 text-sm text-muted">{meta ? `${meta.count} grants, loans, accelerators and mentors, hand-checked. Communities add their own.` : "Loading"}</p>
        </div>
        <Segmented items={[["path", "For you"], ["all", "Browse all"], ["ask", "Ask the guide"]]} value={tab} onChange={setTab} />
      </div>

      {err && <p className="mb-4 rounded-xl border border-red-500/40 p-3 text-sm text-red-500" role="alert">{err}</p>}
      {!meta ? <Spinner /> : tab === "all" ? <Directory meta={meta} onOpen={setOpen} /> : tab === "ask" ? (
        <div className="mx-auto w-full max-w-3xl"><GuideChat className="h-[min(72dvh,680px)]" signedIn={!!account} hasProfile={!!mine?.stage} startupName={mine?.name} formProfile={account ? apiProfile : undefined} /></div>
      ) : account ? (
        <div className="space-y-6">
          {mine === null ? <Spinner /> : <ProfileBar mine={mine} meta={meta} />}
          {ready && <Results res={res} meta={meta} loading={loading} generic={generic} onOpen={setOpen} />}
        </div>
      ) : <SignedOutGate />}
      <ProgramDrawer p={open} onClose={() => setOpen(null)} meta={meta} />
    </div>
  );

  if (embedded) return body;
  if (account) return <AccountShell active="programs">{body}</AccountShell>;
  return (
    <div className="min-h-[100dvh] px-4 py-5 sm:py-8" data-testid="navigator-page">
      <header className="mx-auto mb-8 flex w-full max-w-6xl items-center justify-between gap-3">
        <Link to="/about" className="text-xl"><Wordmark name="Pathwai" brand={{}} /></Link>
        <Link to={user ? "/" : "/login"} className="btn-ghost !py-2 text-sm">{user ? "Back to community" : "Sign in"}</Link>
      </header>
      {body}
      <PoweredBy className="mt-10 pb-2 text-center" />
    </div>
  );
}
