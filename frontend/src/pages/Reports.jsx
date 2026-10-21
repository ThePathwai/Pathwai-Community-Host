import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Check, Copy, Download, ExternalLink, Instagram, Link2, Printer, RefreshCw, Trash2 } from "lucide-react";
import { api, errMsg, timeAgo } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isDemo } from "../lib/demo";
import { Button, Card, Input, PageHeader, Spinner, cx } from "../components/ui";
import ReportView from "../components/ReportView";
import { downloadReportPdf } from "../components/ImpactPanel";

const TYPES = [
  ["sponsor", "Sponsor report", "Reach, event turnout and perk use. For the people backing you."],
  ["funder", "Funder report", "People served, connections made and help given. For grant reporting."],
  ["board", "Board report", "Who is active, who is drifting, what is next. For your leadership."],
];
const PERIODS = [[30, "Last 30 days"], [90, "Last 90 days"], [365, "Last 12 months"]];

export const shareUrl = (slug, token) => `${window.location.origin}/r/${slug || "c"}/${token}`;

export default function Reports() {
  const { config } = useAuth();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const kind = TYPES.some(([k]) => k === sp.get("type")) ? sp.get("type") : "sponsor";
  const days = PERIODS.some(([n]) => n === Number(sp.get("days"))) ? Number(sp.get("days")) : 90;
  const igOn = sp.get("ig") === "1";
  const [ig, setIg] = useState(null);
  const [rep, setRep] = useState(null);
  const [shares, setShares] = useState([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState("");
  const demo = isDemo();
  const set = (patch) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => n.set(k, v)); setSp(n, { replace: true }); };

  const include = igOn && ig?.has_data ? "instagram" : "";
  useEffect(() => { if (ig === null) return; setRep(null); api.get(`/admin/reports/${kind}`, { params: { days, include } }).then((r) => setRep(r.data)).catch((e) => toast.error(errMsg(e))); }, [kind, days, include, ig === null]); // eslint-disable-line
  const loadIg = useCallback(() => api.get("/admin/instagram").then((r) => setIg(r.data)).catch(() => setIg({ connected: false })), []);
  useEffect(() => { loadIg(); }, [loadIg]);
  const refreshIg = async (quiet) => {
    setBusy("ig");
    try { await api.post("/admin/integrations/instagram/sync"); await loadIg(); if (!quiet) toast.success("Instagram numbers updated"); }
    catch (e) { if (!quiet) toast.error(errMsg(e)); } finally { setBusy(""); }
  };
  // Instagram numbers older than half a day are renewed quietly when the page opens (a live connection only).
  useEffect(() => { if (ig?.connected && !ig.sample && ig.fetched_at && Date.now() - new Date(ig.fetched_at).getTime() > 12 * 3600e3) refreshIg(true); }, [ig?.connected]); // eslint-disable-line
  const goConnectIg = () => { try { sessionStorage.setItem("pathwai.admintab", "integrations"); } catch { /* ignore */ } nav("/admin"); };
  const loadShares = useCallback(() => api.get("/admin/report-shares").then((r) => setShares(r.data.shares || [])).catch(() => {}), []);
  useEffect(() => { loadShares(); }, [loadShares]);

  const pdf = async () => {
    if (demo) { window.print(); return; }
    setBusy("pdf");
    try { await downloadReportPdf(kind, days, include); toast.success("PDF downloaded"); }
    catch (e) { let m; try { const t = await e?.response?.data?.text?.(); m = JSON.parse(t).detail; } catch { /* ignore */ } toast.error(m || errMsg(e, "The PDF could not be created.")); }
    finally { setBusy(""); }
  };
  const create = async () => {
    setBusy("share");
    try {
      const { data } = await api.post("/admin/report-shares", { kind, days, label, include: include ? [include] : [] });
      setLabel(""); await loadShares();
      copy(data);
      toast.success("Live link created and copied");
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(""); }
  };
  const copy = async (s) => {
    const url = shareUrl(config?.slug, s.token);
    try { await navigator.clipboard.writeText(url); setCopied(s.id); setTimeout(() => setCopied(""), 2000); }
    catch { window.prompt?.("Copy this link", url); }
  };
  const stop = async (s) => {
    try { await api.delete(`/admin/report-shares/${s.id}`); setShares((x) => x.filter((y) => y.id !== s.id)); toast.success("Link turned off. It no longer opens."); }
    catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="space-y-6" data-testid="reports-page">
      <div className="no-print"><PageHeader title="Reports" subtitle="Proof of what your community is doing, ready for the people who ask. Every number is counted from your own records." /></div>

      <div className="no-print grid gap-3 md:grid-cols-3" role="tablist" aria-label="Report type">
        {TYPES.map(([k, title, blurb]) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => set({ type: k })} data-testid={`report-type-${k}`}
            className={cx("card card-hover text-left", kind === k && "!border-ink ring-1 ring-ink")}>
            <span className="block font-semibold">{title}</span>
            <span className="mt-1 block text-xs leading-snug text-muted">{blurb}</span>
          </button>
        ))}
      </div>

      <Card className="no-print" data-testid="report-instagram">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Instagram className="h-5 w-5 shrink-0 text-muted" />
          {ig?.connected && ig.has_data ? (
            <>
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-sm">
                <input type="checkbox" className="accent-accent" checked={igOn} onChange={(e) => set({ ig: e.target.checked ? "1" : "0" })} data-testid="report-ig-toggle" />
                <span className="min-w-0"><span className="font-medium">Include Instagram reach</span> <span className="text-muted">@{ig.handle} · {ig.followers?.toLocaleString("en-US")} followers · updated {timeAgo(ig.fetched_at)}{ig.sample ? " · sample numbers" : ""}</span></span>
              </label>
              <Button variant="ghost" onClick={() => refreshIg(false)} loading={busy === "ig"} data-testid="report-ig-refresh"><RefreshCw className="h-4 w-4" />Update numbers</Button>
            </>
          ) : ig?.connected ? (
            <>
              <p className="min-w-0 flex-1 text-sm text-muted">Instagram is connected but has no numbers yet.</p>
              <Button variant="ghost" onClick={() => refreshIg(false)} loading={busy === "ig"} data-testid="report-ig-refresh"><RefreshCw className="h-4 w-4" />Pull numbers now</Button>
            </>
          ) : (
            <>
              <p className="min-w-0 flex-1 text-sm text-muted"><span className="font-medium text-ink">Add your Instagram reach.</span> Sponsors like seeing followers, reach and who the audience is next to your community numbers.</p>
              <Button variant="ghost" onClick={goConnectIg} data-testid="report-ig-connect">Connect Instagram</Button>
            </>
          )}
        </div>
      </Card>

      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-line p-0.5 text-xs" role="group" aria-label="Time period">
          {PERIODS.map(([n, text]) => (
            <button key={n} type="button" onClick={() => set({ days: n })} aria-pressed={days === n} data-testid={`report-period-${n}`}
              className={cx("rounded-full px-3 py-1.5 transition-colors", days === n ? "bg-ink text-paper" : "text-muted hover:text-ink")}>{text}</button>
          ))}
        </div>
        <Button onClick={pdf} loading={busy === "pdf"} variant="ghost" data-testid="report-pdf">{demo ? <Printer className="h-4 w-4" /> : <Download className="h-4 w-4" />}{demo ? "Print / save as PDF" : "Download PDF"}</Button>
      </div>

      <Card className="print-area">
        {!rep ? <Spinner /> : (
          <>
            <div className="mb-6 border-b border-line pb-5">
              <p className="eyebrow">{rep.audience}</p>
              <h2 className="mt-2 text-2xl sm:text-3xl" data-testid="report-title">{rep.community}: {rep.headline}</h2>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">{rep.period_label} · Generated {new Date(rep.generated_at).toLocaleDateString(undefined, { dateStyle: "long" })}
                {rep.sample && <span className="chip" data-testid="report-sample">Sample data</span>}</p>
            </div>
            <ReportView report={rep} />
          </>
        )}
      </Card>

      <Card className="no-print" data-testid="report-shares">
        <div className="flex items-start gap-3">
          <Link2 className="mt-1 h-5 w-5 shrink-0 text-muted" />
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold">Share a live link instead of a PDF</h3>
            <p className="mt-1 text-sm text-muted">The page always shows current numbers, and only totals: no names or contact details. Anyone with the link can read it, and you can turn it off at any time.</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Who is it for? (optional, e.g. Acme Bank)" maxLength={80} aria-label="Who the link is for" data-testid="share-label" className="sm:min-w-[18rem] sm:max-w-md sm:flex-1" />
              <Button onClick={create} loading={busy === "share"} data-testid="share-create"><Link2 className="h-4 w-4" />Create live link for the {TYPES.find(([k]) => k === kind)[1].toLowerCase()}</Button>
            </div>
          </div>
        </div>
        {shares.length > 0 && (
          <ul className="mt-5 divide-y divide-line border-t border-line" data-testid="share-list">
            {shares.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3" data-testid={`share-${s.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.label || "Untitled link"} <span className="font-normal text-muted">· {TYPES.find(([k]) => k === s.kind)?.[1] || s.kind}, {PERIODS.find(([n]) => n === s.days)?.[1]?.toLowerCase()}</span></p>
                  <p className="truncate text-xs text-muted">{s.views || 0} {s.views === 1 ? "view" : "views"}{s.last_viewed_at ? ` · last opened ${timeAgo(s.last_viewed_at)}` : " · not opened yet"}</p>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="ghost" onClick={() => copy(s)} data-testid={`share-copy-${s.id}`}>{copied === s.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied === s.id ? "Copied" : "Copy link"}</Button>
                  {demo ? <Link className="btn-ghost" to={`/r/${config?.slug || "c"}/${s.token}`}><ExternalLink className="h-4 w-4" />Open</Link>
                    : <a className="btn-ghost" href={shareUrl(config?.slug, s.token)} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Open</a>}
                  <Button variant="ghost" onClick={() => stop(s)} data-testid={`share-stop-${s.id}`} aria-label="Turn this link off"><Trash2 className="h-4 w-4" />Turn off</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
