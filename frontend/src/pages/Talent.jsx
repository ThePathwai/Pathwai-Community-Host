import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Search } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import AccountShell from "../components/AccountShell";
import { ProfileCard, Rail, StartupMini } from "../components/ProfileRail";
import { Spinner, cx } from "../components/ui";

// Talent: skilled people and startups across Canada who chose to be found. Everything is opt-in. The only way to reach someone is a message
// request they can accept or decline, so nobody's inbox or email is exposed. Ranked for what you are looking for and where you are.

const heading = { textTransform: "none", letterSpacing: "-0.01em", fontWeight: 700 };
const errMsg = (e) => e?.response?.data?.detail || "Something went wrong. Please try again.";

function Pill({ on, onClick, children, testId }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} data-testid={testId}
      className={cx("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition", on ? "border-transparent font-semibold" : "border-line text-muted hover:text-ink")}
      style={on ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{children}</button>
  );
}
const Widget = ({ children, className = "", ...rest }) => <section className={cx("rounded-3xl border border-line bg-surface p-5", className)} {...rest}>{children}</section>;

function Why({ lines }) {
  if (!lines?.length) return null;
  return <ul className="mt-3 space-y-1" data-testid="talent-why">{lines.map((l) => <li key={l} className="flex gap-1.5 text-[13px] leading-snug"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden /><span>{l}</span></li>)}</ul>;
}

export default function Talent({ embedded }) {
  const { account, loading } = useAuth();
  const [opt, setOpt] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("people");
  const [category, setCategory] = useState("");
  const [openTo, setOpenTo] = useState("");
  const [remote, setRemote] = useState(false);
  const [available, setAvailable] = useState(false);
  const [province, setProvince] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(12);
  const [openRail, setOpenRail] = useState("");
  useEffect(() => { document.title = "Talent · Pathwai"; }, []);
  useEffect(() => { api.get("/talent/options").then((r) => setOpt(r.data)).catch(() => {}); }, []);

  const load = useCallback(() => api.get("/talent", { params: { kind, q: q.trim() || undefined, category: category || undefined, open_to: openTo || undefined, remote: remote || undefined, available: available || undefined, province: province || undefined } })
    .then((r) => { setData(r.data); setError(""); }).catch((e) => setError(errMsg(e))), [kind, q, category, openTo, remote, available, province]);
  useEffect(() => {
    if (!account) return undefined;
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [account, load]);

  const toggleLooking = async (k) => {
    const cur = data?.viewer?.hiring_for || [];
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k].slice(0, 6);
    setData((d) => d && ({ ...d, viewer: { ...d.viewer, hiring_for: next } }));
    try { await api.put("/talent/me", { hiring_for: next }); load(); } catch (e) { toast.error(errMsg(e)); load(); }
  };

  const filtersOn = !!(q || category || openTo || remote || available || province);
  const v = data?.viewer;
  const labelOf = useMemo(() => Object.fromEntries((opt?.categories || []).map((c) => [c.key, c.label])), [opt]);
  const browse = kind === "people" && !filtersOn;           // no filter: swipeable rows by area; with a filter: one grid of results
  const byArea = useMemo(() => (opt?.categories || []).filter((c) => c.key !== "other").map((c) => [c, (data?.results || []).filter((p) => p.categories?.includes(c.key))]).filter(([, l]) => l.length), [opt, data]);
  const cats = useMemo(() => (opt?.categories || []).filter((c) => c.key !== "other"), [opt]);

  if (loading) return <Spinner />;
  if (!account) return <Navigate to="/login" replace />;

  const page = (
    <div className="mx-auto w-full max-w-6xl" data-testid="talent-page">
      <p className="eyebrow">Talent</p>
      <h1 className="mt-2 text-3xl sm:text-4xl" style={{ textTransform: "none", letterSpacing: "-0.03em", fontWeight: 800, textWrap: "balance" }}>Find people to build with</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">Developers, marketers, sales people, accountants and startups across Canada who chose to be found. Send a message request; they decide whether to reply.</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Widget data-testid="talent-looking">
          <h2 className="text-lg" style={heading}>Who are you looking for?</h2>
          <p className="mt-1 text-xs text-muted">Pick the kinds of people you need and they move to the top of the list.</p>
          <div className="mt-3 flex flex-wrap gap-2">{cats.map((c) => <Pill key={c.key} on={!!v?.hiring_for?.includes(c.key)} onClick={() => toggleLooking(c.key)} testId={`talent-look-${c.key}`}>{c.label}</Pill>)}</div>
          {v?.needs_talent && !v?.hiring_for?.length && <p className="mt-3 text-xs text-muted">You told us you need talent, so this is a good place to start.</p>}
        </Widget>
        <Widget data-testid="talent-me">
          {v && !v.listed ? (
            <>
              <h2 className="text-lg" style={heading}>Want to be found too?</h2>
              <p className="mt-1 text-sm text-muted">Add your skills and what you are open to, and founders and startups can message you. You can switch it off any time.</p>
              <Link to="/talent/me" className="btn-primary mt-4 !px-5 !py-2.5 text-sm" data-testid="talent-join">Add your talent profile<ArrowRight className="h-4 w-4" aria-hidden /></Link>
            </>
          ) : (
            <>
              <h2 className="text-lg" style={heading}>You are in the talent pool</h2>
              <p className="mt-1 text-sm text-muted">{v?.startup_listed ? "People and your startup are both visible." : "Your talent profile is visible."} Requests appear in your Messages.</p>
              <Link to="/talent/me" className="btn-ghost mt-4 !px-5 !py-2.5 text-sm" data-testid="talent-edit">Edit your profile<ArrowRight className="h-4 w-4" aria-hidden /></Link>
            </>
          )}
        </Widget>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-line p-1" role="tablist">
          {[["people", `People · ${data?.counts?.people ?? 0}`], ["startups", `Startups · ${data?.counts?.startups ?? 0}`]].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={kind === k} onClick={() => { setKind(k); setCategory(""); setOpenTo(""); setLimit(12); }} data-testid={`talent-tab-${k}`}
              className={cx("rounded-full px-4 py-1.5 text-sm font-medium transition", kind === k ? "" : "text-muted hover:text-ink")} style={kind === k ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{label}</button>
          ))}
        </div>
        <label className="relative block w-full sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={kind === "people" ? "Search skills or names" : "Search startups"} aria-label="Search" data-testid="talent-search" className="w-full rounded-full border border-line bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:border-ink/50" /></label>
      </div>

      <div className="pw-rail -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label={kind === "people" ? "Area of work" : "Looking for"}>
        <Pill on={!category} onClick={() => setCategory("")} testId="talent-cat-all">{kind === "people" ? "All areas" : "Any role"}</Pill>
        {cats.map((c) => <Pill key={c.key} on={category === c.key} onClick={() => setCategory(category === c.key ? "" : c.key)} testId={`talent-cat-${c.key}`}>{c.label}</Pill>)}
      </div>
      {kind === "people" && opt && (
        <div className="pw-rail -mx-4 mt-2 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Open to">
          {opt.open_to.map((o) => <Pill key={o.key} on={openTo === o.key} onClick={() => setOpenTo(openTo === o.key ? "" : o.key)} testId={`talent-open-${o.key}`}>{o.label}</Pill>)}
          <span className="mx-1 w-px shrink-0 self-stretch bg-line" aria-hidden />
          <Pill on={remote} onClick={() => setRemote(!remote)} testId="talent-remote">Remote</Pill>
          <Pill on={available} onClick={() => setAvailable(!available)} testId="talent-available">Available now</Pill>
          <select value={province} onChange={(e) => setProvince(e.target.value)} aria-label="Province" data-testid="talent-province" className="shrink-0 rounded-full border border-line bg-transparent px-3 py-1.5 text-sm text-muted outline-none focus:border-ink/50">
            <option value="">Any province</option>{opt.provinces.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      )}

      {error && <p className="mt-4 rounded-xl border border-red-500/40 p-3 text-sm text-red-500" role="alert">{error}</p>}
      {!data && !error ? <div className="mt-10"><Spinner /></div> : data && opt && (
        <div className="mt-6">
          {data.results.length > 0 ? (browse ? (
            <div className="space-y-8" data-testid="talent-rails">
              <Rail testId="talent-rail-best" title="Best matches for you" sub="Ranked by who you are looking for, where you are, and who is free now." count={data.results.length > 12 ? 12 : data.results.length}>
                {data.results.slice(0, 12).map((p) => <ProfileCard key={p.id} p={p} />)}
              </Rail>
              {byArea.map(([c, list]) => (
                <Rail key={c.key} testId={`talent-rail-${c.key}`} title={c.label} count={list.length} expanded={openRail === c.key} onSeeAll={list.length > 4 ? () => setOpenRail(openRail === c.key ? "" : c.key) : null}>
                  {list.map((p) => <ProfileCard key={p.id} p={p} wide={openRail === c.key} />)}
                </Rail>
              ))}
            </div>
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="talent-results">
                {data.results.slice(0, limit).map((r) => <li key={r.id} className="flex">{kind === "people" ? <ProfileCard p={r} wide /> : <StartupMini s={{ ...r, hiring_labels: (r.hiring_for || []).map((k) => labelOf[k] || k) }} wide />}</li>)}
              </ul>
              {data.results.length > limit && <button type="button" onClick={() => setLimit((l) => l + 12)} className="btn-ghost mt-4 w-full !py-3 text-sm" data-testid="talent-more">Show {Math.min(12, data.results.length - limit)} more</button>}
            </>
          )) : (
            <div className="rounded-3xl border border-dashed border-line p-8 text-center" data-testid="talent-empty">
              <p className="font-semibold">{filtersOn ? "No one matches those filters" : kind === "people" ? "No one has joined the talent pool yet" : "No startups are listed yet"}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">{filtersOn ? "Clear a filter or two to see more." : "The pool fills as people add their profile. Be one of the first."}</p>
              {filtersOn && <button type="button" className="btn-ghost mt-4 !py-2 text-sm" onClick={() => { setQ(""); setCategory(""); setOpenTo(""); setRemote(false); setAvailable(false); setProvince(""); }}>Clear filters</button>}
            </div>
          )}
          <p className="mt-6 text-xs text-muted">Everyone here chose to be listed and can leave any time. Profiles are written by the people themselves, so check details before you commit to anything.</p>
        </div>
      )}
    </div>
  );
  return embedded ? page : <AccountShell active="talent">{page}</AccountShell>;
}
