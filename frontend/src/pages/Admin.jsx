import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Download, Search } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import AccountShell from "../components/AccountShell";
import { Spinner, cx } from "../components/ui";

// Admin: real numbers for the team, nothing made up. Visits come from the page-view counter, accounts come from the accounts themselves
// (so an account someone deletes leaves this list; Export keeps a copy), and the funnel is the pilot's KPIs. Only platform admins see it.

const heading = { textTransform: "none", letterSpacing: "-0.01em", fontWeight: 700 };
const Widget = ({ children, className = "", ...rest }) => <section className={cx("rounded-3xl border border-line bg-surface p-5", className)} {...rest}>{children}</section>;
const Label = ({ children }) => <p className="text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{children}</p>;
const n = (v) => Number(v || 0).toLocaleString("en-CA");
const pct = (v) => `${Math.round((v || 0) * 100)}%`;
const shortDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
const RANGES = [[7, "7 days"], [30, "30 days"], [90, "90 days"]];

function Tile({ label, value, hint, testid }) {
  return (
    <Widget data-testid={testid} className="!p-4">
      <Label>{label}</Label>
      <p className="stat mt-2 text-3xl sm:text-4xl">{value}</p>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </Widget>
  );
}

// One series of thin bars on one scale, anchored to the baseline. Hover or focus a bar to read its day. The accent colour carries the single series.
function Bars({ rows, field, noun, label }) {
  const max = Math.max(1, ...rows.map((r) => r[field]));
  const total = rows.reduce((s, r) => s + r[field], 0);
  const [on, setOn] = useState(null);
  const w = 100 / rows.length;
  const shown = on !== null ? rows[on] : null;
  return (
    <div>
      <p className="mb-2 h-5 text-sm" aria-live="polite">
        {shown ? <><span className="font-semibold tabular-nums">{n(shown[field])}</span> {noun}<span className="text-muted"> · {shortDay(shown.day)}</span></>
          : <span className="text-muted">{n(total)} {noun} in this period</span>}
      </p>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-32 w-full" role="img" aria-label={`${label}: ${n(total)} ${noun} over ${rows.length} days. Highest day ${n(max)}.`}>
        <line x1="0" y1="39.6" x2="100" y2="39.6" stroke="rgb(var(--c-line))" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
        {rows.map((r, i) => {
          const h = r[field] ? Math.max(1.2, (r[field] / max) * 38) : 0;
          return (
            <g key={r.day} onMouseEnter={() => setOn(i)} onMouseLeave={() => setOn(null)} onFocus={() => setOn(i)} onBlur={() => setOn(null)} tabIndex={0}>
              <rect x={i * w} y="0" width={w} height="40" fill="transparent" />
              {h > 0 && <rect x={i * w + w * 0.18} y={39.6 - h} width={w * 0.64} height={h} rx="0.6" fill="var(--accent)" opacity={on === null || on === i ? 1 : 0.45} />}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-muted"><span>{shortDay(rows[0].day)}</span><span>{shortDay(rows[rows.length - 1].day)}</span></div>
    </div>
  );
}

function Funnel({ steps }) {
  return (
    <ol className="space-y-3" data-testid="admin-funnel">
      {steps.map((s) => (
        <li key={s.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm"><span>{s.label}</span><span className="tabular-nums"><b>{n(s.count)}</b> <span className="text-muted">· {pct(s.share)}</span></span></div>
          <div className="h-2 rounded-full bg-ink/[.07]"><div className="h-2 rounded-full" style={{ width: `${Math.max(s.count ? 2 : 0, s.share * 100)}%`, background: "var(--accent)" }} /></div>
        </li>
      ))}
    </ol>
  );
}

// What founders asked for on their profile and what they saved. Real choices only; with few founders, read the counts, not the percentages.
function Demand({ d }) {
  const none = !d.needs.length && !d.programs.length;
  return (
    <Widget data-testid="admin-demand">
      <Label>What founders are looking for</Label>
      <p className="mb-4 mt-1 text-xs text-muted">From the needs founders chose on their profile and the programs they saved. {d.founders_with_needs ? `${n(d.founders_with_needs)} ${d.founders_with_needs === 1 ? "founder has" : "founders have"} chosen needs so far.` : ""}</p>
      {none ? <p className="text-sm text-muted">Nothing yet. This fills in as founders finish their profile and save programs.</p> : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <p className="mb-2 text-sm font-semibold">Needs they picked</p>
            {d.needs.length ? (
              <ol className="space-y-3" data-testid="admin-needs">
                {d.needs.map((x) => (
                  <li key={x.need}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-sm"><span>{x.label}</span><span className="tabular-nums"><b>{n(x.count)}</b> <span className="text-muted">· {pct(x.share)}</span></span></div>
                    <div className="h-2 rounded-full bg-ink/[.07]"><div className="h-2 rounded-full" style={{ width: `${Math.max(2, x.share * 100)}%`, background: "var(--accent)" }} /></div>
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-muted">No one has picked needs yet.</p>}
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold">Most saved programs</p>
            {d.programs.length ? (
              <ul className="divide-y divide-line text-sm" data-testid="admin-saved">
                {d.programs.map((p) => <li key={`${p.name}-${p.org}`} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0"><span className="block truncate">{p.name}</span>{p.org ? <span className="block truncate text-xs text-muted">{p.org}</span> : null}</span><span className="tabular-nums text-muted">{n(p.saves)}</span></li>)}
              </ul>
            ) : <p className="text-sm text-muted">No saved programs yet.</p>}
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold">Kinds of program they save</p>
            {d.types.length ? <List rows={d.types.map((t) => [t.label, t.saves])} empty="" /> : <p className="text-sm text-muted">No saved programs yet.</p>}
          </div>
        </div>
      )}
    </Widget>
  );
}

const List = ({ rows, empty }) => (rows.length ? (
  <ul className="divide-y divide-line text-sm">
    {rows.map(([k, v]) => <li key={k} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0 truncate">{k}</span><span className="tabular-nums text-muted">{n(v)}</span></li>)}
  </ul>
) : <p className="text-sm text-muted">{empty}</p>);

function Accounts() {
  const [q, setQ] = useState("");
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => api.get("/hub/admin/users", { params: { q: q.trim() } }).then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e))), 200);
    return () => clearTimeout(t);
  }, [q]);
  const download = async () => {
    setBusy(true);
    try {
      const r = await api.get("/hub/admin/users/export", { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = `pathwai-accounts-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase text-muted";
  return (
    <Widget data-testid="admin-accounts">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div><Label>Accounts</Label><p className="mt-1 text-xs text-muted">Everyone who has signed up. If someone deletes their account it leaves this list, so export a copy if you want to keep it.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input className="input !pl-9" placeholder="Search name, email or startup" value={q} onChange={(e) => setQ(e.target.value)} data-testid="admin-search" aria-label="Search accounts" /></label>
          <button type="button" className="btn-ghost" onClick={download} disabled={busy} data-testid="admin-export"><Download className="h-4 w-4" aria-hidden />Export CSV</button>
        </div>
      </div>
      {!d ? <Spinner /> : !d.users.length ? <p className="py-6 text-sm text-muted">{q ? "No one matches that search." : "No accounts yet."}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr><th className={th}>Name</th><th className={th}>Startup</th><th className={th}>Stage</th><th className={th}>Signed up</th><th className={th}>Last active</th><th className={cx(th, "text-right")}>Saved</th><th className={cx(th, "text-right")}>Plan</th></tr></thead>
            <tbody className="divide-y divide-line">
              {d.users.map((u) => (
                <tr key={u.id} data-testid={`admin-user-${u.id}`}>
                  <td className="px-3 py-2.5"><span className="block font-medium">{u.name}</span><span className="block text-xs text-muted">{u.email}</span></td>
                  <td className="px-3 py-2.5">{u.startup || <span className="text-muted">Not yet</span>}{u.province ? <span className="block text-xs text-muted">{u.province}</span> : null}</td>
                  <td className="px-3 py-2.5 capitalize">{u.stage || <span className="text-muted">Not yet</span>}</td>
                  <td className="px-3 py-2.5 tabular-nums">{u.signed_up ? shortDay(u.signed_up) : ""}</td>
                  <td className="px-3 py-2.5 tabular-nums">{u.last_active ? shortDay(u.last_active) : <span className="text-muted">Never</span>}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{u.tracked}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{u.plan_items}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.total > d.users.length && <p className="px-3 pt-3 text-xs text-muted">Showing the newest {d.users.length} of {d.total}. Export for everyone.</p>}
        </div>
      )}
    </Widget>
  );
}

export default function Admin() {
  const { account, loading } = useAuth();
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => { document.title = "Admin · Pathwai"; }, []);
  const load = useCallback(() => { setErr(false); api.get("/hub/admin/overview", { params: { days } }).then((r) => setD(r.data)).catch(() => setErr(true)); }, [days]);
  useEffect(() => { if (account?.platform_admin) load(); }, [account?.platform_admin, load]);
  const sources = useMemo(() => (d?.visits.top_sources || []).map((s) => [s.source, s.views]), [d]);
  if (loading) return <Spinner />;
  if (!account) return <Navigate to="/login" state={{ from: "/admin" }} replace />;
  if (!account.platform_admin) return <Navigate to="/" replace />;
  const a = d?.accounts; const v = d?.visits;
  return (
    <AccountShell active="admin">
      <div className="mx-auto w-full max-w-6xl" data-testid="admin-page">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Admin</p>
            <h1 className="mt-1 text-2xl sm:text-3xl" style={heading}>How Pathwai is doing</h1>
            <p className="mt-1 text-sm text-muted">Real visits and real accounts. Your own visits and team accounts are left out. Days are Toronto days.</p>
          </div>
          <div className="flex gap-1.5" role="group" aria-label="Time range">
            {RANGES.map(([k, label]) => (
              <button key={k} type="button" onClick={() => setDays(k)} aria-pressed={days === k} data-testid={`admin-range-${k}`}
                className={cx("rounded-full border px-3 py-1.5 text-[13px] font-semibold", days === k ? "border-transparent" : "border-line hover:border-ink/40")}
                style={days === k ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{label}</button>
            ))}
          </div>
        </div>

        {err ? <Widget><p className="text-sm text-muted">The numbers could not load. <button type="button" className="underline" onClick={load}>Try again</button></p></Widget> : !d ? <Spinner /> : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="admin-tiles">
              <Tile testid="tile-visitors" label="Visitors" value={n(v.visitors)} hint={`${n(v.page_views)} page views · counted once per person per day`} />
              <Tile testid="tile-new" label="New accounts" value={n(a.new)} hint={`${n(a.total)} accounts now`} />
              <Tile testid="tile-active" label="Active this week" value={n(a.active_7d)} hint={`${n(a.active_30d)} in the last 30 days`} />
              <Tile testid="tile-deleted" label="Deleted accounts" value={n(a.deleted_in_range)} hint={`${n(a.deleted_ever)} in all; ${n(a.signed_up_ever)} signed up in all`} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Widget><Label>Visitors each day</Label><div className="mt-3"><Bars rows={v.series} field="visitors" noun="visitors" label="Visitors each day" /></div></Widget>
              <Widget><Label>New accounts each day</Label><div className="mt-3"><Bars rows={a.series} field="signups" noun="new accounts" label="New accounts each day" /></div></Widget>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Widget className="lg:col-span-1"><Label>Pilot funnel</Label><p className="mb-3 mt-1 text-xs text-muted">Of everyone with an account today.</p><Funnel steps={d.funnel} /></Widget>
              <Widget><Label>Top pages</Label><div className="mt-2"><List rows={v.top_pages.map((p) => [p.path, p.views])} empty="No visits in this period yet." /></div></Widget>
              <Widget><Label>Where visitors come from</Label><div className="mt-2"><List rows={sources} empty="No outside links in this period. Visits that type the address or use a bookmark are not listed." /></div>
                <p className="mt-3 text-xs text-muted">{pct(v.signed_in_share)} of page views were from signed-in people.</p></Widget>
            </div>

            <Demand d={d.demand} />

            <Accounts />
          </div>
        )}
      </div>
    </AccountShell>
  );
}
