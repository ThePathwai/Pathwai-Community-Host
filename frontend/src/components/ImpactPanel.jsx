import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Download, FileText, Send } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { isDemo } from "../lib/demo";
import { useLive } from "../lib/live";
import { Avatar, Button, cx } from "./ui";

// The PDF comes back as a file, so a failed request arrives as a Blob: read the message out of it.
async function pdfError(e) {
  try { const t = await e?.response?.data?.text?.(); const j = t && JSON.parse(t); if (j?.detail) return j.detail; } catch { /* fall through */ }
  return errMsg(e, "The PDF could not be created. Please try again.");
}
export async function downloadReportPdf(kind, days) {
  const r = await api.get(`/admin/reports/${kind}.pdf`, { params: { days }, responseType: "blob" });
  const name = (/filename="?([^";]+)"?/.exec(r.headers?.["content-disposition"] || "") || [])[1] || `${kind}-report.pdf`;
  const url = URL.createObjectURL(r.data);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const PERIODS = [[30, "30 days"], [90, "90 days"], [365, "12 months"]];

/** First thing on the admin home: the four numbers a sponsor, funder or board asks about, and one button to send them. */
export function ImpactPanel() {
  const nav = useNavigate();
  const [days, setDays] = useState(90);
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get("/admin/impact", { params: { days } }).then((r) => setD(r.data)).catch(() => setD({ error: true })), [days]);
  useEffect(() => { load(); }, [load]);
  useLive(null, load);
  const download = async () => {
    // The practice copy has no server to build a PDF, so it opens the same report on screen (with Print / save as PDF).
    if (isDemo()) { nav(`/reports?type=sponsor&days=${days}`); return; }
    setBusy(true);
    try { await downloadReportPdf("sponsor", days); toast.success("Sponsor report downloaded"); } catch (e) { toast.error(await pdfError(e)); } finally { setBusy(false); }
  };
  if (d?.error) return null;
  return (
    <section className="card" data-testid="impact-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base lg:text-lg">Impact</h2>
          {isDemo() && <span className="chip" data-testid="impact-sample">Sample data</span>}
        </div>
        <div className="inline-flex rounded-full border border-line p-0.5 text-xs" role="group" aria-label="Time period">
          {PERIODS.map(([n, label]) => (
            <button key={n} type="button" onClick={() => setDays(n)} aria-pressed={days === n} data-testid={`impact-period-${n}`}
              className={cx("rounded-full px-3 py-1 transition-colors", days === n ? "bg-ink text-paper" : "text-muted hover:text-ink")}>{label}</button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4" aria-busy={!d}>
        {(d?.cards || [null, null, null, null]).map((c, i) => c ? (
          <div key={c.key} data-testid={`impact-${c.key}`} className="min-w-0">
            <p className="eyebrow">{c.label}</p>
            <p className="mt-1.5 flex items-baseline gap-1.5"><span className="stat text-3xl leading-none" style={{ color: c.key === "active" ? "var(--accent)" : undefined }}>{c.value}</span>
              <span className="text-sm text-muted">{c.of || c.unit}</span></p>
            <p className="mt-1.5 text-xs leading-snug text-muted">{c.note}</p>
          </div>
        ) : <div key={i} className="h-16 animate-pulse rounded-lg bg-ink/[.06]" />)}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="min-w-0 text-xs text-muted">Counted from your own records. Send it to a sponsor, funder or your board.</p>
        <div className="flex flex-wrap gap-2">
          <Link to="/reports" className="btn-ghost" data-testid="impact-all-reports"><FileText className="h-4 w-4" />All reports</Link>
          <Button onClick={download} loading={busy} data-testid="impact-download"><Download className="h-4 w-4" />Download sponsor report</Button>
        </div>
      </div>
    </section>
  );
}

/** Members who have not done anything in 30+ days, each with a one-tap nudge. */
export function QuietCard() {
  const [d, setD] = useState(null);
  const [all, setAll] = useState(false);
  const [sending, setSending] = useState(null);
  const load = useCallback(() => api.get("/admin/quiet").then((r) => setD(r.data)).catch(() => setD({ members: [], total: 0, error: true })), []);
  useEffect(() => { load(); }, [load]);
  useLive(null, load);
  if (!d || d.error) return null;
  const rows = d.members || [];
  const nudge = async (ids, key) => {
    setSending(key);
    try {
      const { data } = await api.post("/admin/quiet/nudge", { user_ids: ids });
      const now = new Date().toISOString();
      setD((x) => ({ ...x, members: x.members.map((m) => (ids.includes(m.id) ? { ...m, nudged_recently: true, nudged_at: now } : m)) }));
      toast.success(data.sent === 1 ? "Nudge sent" : `${data.sent} nudges sent`);
    } catch (e) { toast.error(errMsg(e)); } finally { setSending(null); }
  };
  const open = rows.filter((m) => !m.nudged_recently);
  const shown = all ? rows : rows.slice(0, 5);
  return (
    <section className="card" data-testid="quiet-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base lg:text-lg">Going quiet <span className="stat ml-1 text-muted" data-testid="quiet-count">{d.total}</span></h2>
          <p className="mt-0.5 text-xs text-muted">No visit, RSVP, perk or message in the last {d.days} days. New members get two weeks first.</p>
        </div>
        {open.length > 1 && <Button variant="ghost" loading={sending === "all"} onClick={() => nudge(open.map((m) => m.id), "all")} data-testid="quiet-nudge-all"><Send className="h-4 w-4" />Nudge all {open.length}</Button>}
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted" data-testid="quiet-empty">Nobody has gone quiet. Everyone who joined more than two weeks ago has been active recently.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {shown.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5" data-testid={`quiet-row-${m.id}`}>
              <Avatar src={m.avatar_url} name={m.name} size={36} />
              <div className="min-w-0 flex-1">
                <Link to={`/members/${m.id}`} className="block truncate text-sm font-medium hover:underline">{m.name}</Link>
                <p className="truncate text-xs text-muted">{m.reason}</p>
              </div>
              {m.nudged_recently
                ? <span className="shrink-0 text-xs text-muted" data-testid={`quiet-done-${m.id}`}>Nudged</span>
                : <Button variant="ghost" loading={sending === m.id} onClick={() => nudge([m.id], m.id)} data-testid={`quiet-nudge-${m.id}`}><Send className="h-3.5 w-3.5" />Nudge</Button>}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {rows.length > 5 ? <button type="button" onClick={() => setAll((v) => !v)} className="text-xs text-muted underline underline-offset-2 hover:text-ink" data-testid="quiet-toggle">{all ? "Show fewer" : `Show all ${rows.length}`}</button> : <span />}
        {d.nudged_30d > 0 && <p className="text-xs text-muted">{d.nudged_30d} nudged in the last 30 days · {d.came_back_30d} came back</p>}
      </div>
    </section>
  );
}
