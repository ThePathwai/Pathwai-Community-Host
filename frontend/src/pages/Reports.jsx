import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Check, ChevronDown, Circle, Copy, Download, ExternalLink, FileText, Instagram, Link2, Printer, RefreshCw, Trash2 } from "lucide-react";
import { api, errMsg, timeAgo } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isDemo } from "../lib/demo";
import { Button, Card, Input, PageHeader, Spinner, cx } from "../components/ui";
import ReportView from "../components/ReportView";
import { downloadReportDeck, downloadReportPdf } from "../components/ImpactPanel";
import DeckPreview from "../components/DeckPreview";
import { applySelection, deckTheme, sectionId } from "../lib/deck";

const TYPES = [
  ["sponsor", "Sponsor report", "Reach, event turnout and perk use. For the people backing you."],
  ["funder", "Funder or investor report", "People served, connections made, participation and help given. The traction a funder or investor asks about."],
  ["board", "Board report", "Who is active, who is drifting, what is next. For your leadership."],
];
const PERIODS = [[30, "Last 30 days"], [90, "Last 90 days"], [365, "Last 12 months"]];

export const shareUrl = (slug, token) => `${window.location.origin}/r/${slug || "c"}/${token}`;


function PickBox({ k, children, sub, disabled, strong, hide, flip }) {
  return (
    <label className={cx("flex min-h-[32px] cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-ink/5", disabled && "opacity-45")}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={!hide.has(k)} onChange={() => flip(k)} data-testid={`deck-pick-${k}`} />
      <span className="min-w-0"><span className={cx("break-words", strong && "font-semibold")}>{children}</span>{sub && <span className="block text-xs text-muted">{sub}</span>}</span>
    </label>
  );
}

// Which sections, figures, charts and insights go on the slides. Saved for the report type, used by the preview and the download.
function DeckPicker({ rep, hidden, setHidden }) {
  const [open, setOpen] = useState(false);
  const hide = new Set(hidden);
  const secs = rep.sections || [];
  const flip = (key) => setHidden(hide.has(key) ? hidden.filter((k) => k !== key) : [...hidden, key]);
  let total = 0, shown = 0;
  for (const s of secs) {
    const id = sectionId(s);
    const items = [...(s.tiles || []).map((t) => `t:${id}:${t.label ?? ""}`), ...(s.charts || []).map((c) => `c:${id}:${c.title ?? ""}`), ...(s.insights || []).map((_, n) => `i:${id}:${n}`)];
    total += items.length;
    if (!hide.has(`s:${id}`)) shown += items.filter((k) => !hide.has(k)).length;
  }
  return (
    <div className="mb-4 rounded-xl border border-line" data-testid="deck-picker">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left" data-testid="deck-picker-toggle">
        <span className="min-w-0 text-sm"><span className="font-semibold">Choose what is in the slides</span> <span className="text-muted">· showing {shown} of {total} items{hidden.includes("glance") ? ", no summary slide" : ""}</span></span>
        <ChevronDown className={cx("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-line p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <PickBox hide={hide} flip={flip} k="glance" strong>"At a glance" summary slide</PickBox>
            <button type="button" className="btn-ghost text-xs" disabled={!hidden.length} onClick={() => setHidden([])} data-testid="deck-pick-reset">Show everything</button>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
            {secs.map((s) => {
              const id = sectionId(s), off = hide.has(`s:${id}`);
              return (
                <div key={id} className="rounded-lg border border-line p-2">
                  <PickBox hide={hide} flip={flip} k={`s:${id}`} strong>{s.title}</PickBox>
                  <div className="ml-4 border-l border-line pl-2">
                    {(s.tiles || []).map((t) => <PickBox hide={hide} flip={flip} key={`t${t.label}`} k={`t:${id}:${t.label ?? ""}`} disabled={off} sub={String(t.value)}>{t.label}</PickBox>)}
                    {(s.charts || []).map((c) => <PickBox hide={hide} flip={flip} key={`c${c.title}`} k={`c:${id}:${c.title ?? ""}`} disabled={off} sub="Chart">{c.title}</PickBox>)}
                    {(s.insights || []).map((x, n) => <PickBox hide={hide} flip={flip} key={`i${n}`} k={`i:${id}:${n}`} disabled={off} sub="Sentence">{x.length > 80 ? `${x.slice(0, 80)}…` : x}</PickBox>)}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted">Your choice is saved for this kind of report. The cover and closing slides are always included, and the on-screen report and shared links still show everything.</p>
        </div>
      )}
    </div>
  );
}

// What the slides are made from, and what is still missing. Nothing is required: every slide adapts to what the community has.
function DeckReadiness({ config, ig, onInstagram }) {
  const th = deckTheme(config);
  const photos = Math.min(th.photos.length, 2);
  const items = [
    { k: "logo", ok: !!(th.logo || th.mark), label: "Logo", add: "Add your logo", to: "/admin?tab=brand" },
    { k: "photos", ok: photos >= 2, label: `Photos ${photos}/2`, add: photos ? "Add another photo" : "Add 2 photos", to: "/admin?tab=brand" },
    { k: "story", ok: !!th.about, label: "Your story", add: "Write a short story", to: "/admin?tab=brand" },
    { k: "contact", ok: !!(th.site || th.email), label: "Website or email", add: "Add a website or email", to: "/admin?tab=brand" },
    { k: "ig", ok: !!ig?.connected, label: "Instagram", add: "Connect Instagram", onClick: onInstagram, hide: ig === null },
  ].filter((i) => !i.hide);
  const done = items.filter((i) => i.ok).length;
  return (
    <div className="mb-4 rounded-xl border border-line bg-surface/60 p-3" data-testid="deck-readiness">
      <p className="mb-2 text-xs text-muted"><span className="font-semibold text-ink">{done === items.length ? "Everything is in." : `${done} of ${items.length} personal touches in.`}</span> Your colours and numbers are always used; add what is missing and the slides pick it up straight away.</p>
      <div className="flex flex-wrap gap-2">
        {items.map((i) => {
          const body = (<>{i.ok ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Circle className="h-3.5 w-3.5 text-muted" />}{i.ok ? i.label : i.add}</>);
          const cls = cx("inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 text-xs font-medium", i.ok ? "border-line bg-surface text-ink" : "border-dashed border-ink/30 text-ink hover:bg-ink/5");
          if (i.ok) return <span key={i.k} className={cls} data-testid={`deck-ready-${i.k}`}>{body}</span>;
          return i.to ? <Link key={i.k} to={i.to} className={cls} data-testid={`deck-ready-${i.k}`}>{body}</Link> : <button key={i.k} type="button" onClick={i.onClick} className={cls} data-testid={`deck-ready-${i.k}`}>{body}</button>;
        })}
      </div>
    </div>
  );
}

export default function Reports({ embedded = false }) {
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
  const [hidden, setHiddenState] = useState([]);
  const saving = useRef(null);
  useEffect(() => { setHiddenState([]); api.get(`/admin/deck-selection/${kind}`).then((r) => setHiddenState(r.data.hidden || [])).catch(() => {}); }, [kind]);
  const flushSave = async () => { if (saving.current) { const f = saving.current; saving.current = null; clearTimeout(f.t); await f.run(); } };
  const setHidden = (next) => {
    setHiddenState(next);
    if (saving.current) clearTimeout(saving.current.t);
    const run = () => api.put(`/admin/deck-selection/${kind}`, { hidden: next }).catch((e) => toast.error(errMsg(e, "That choice could not be saved.")));
    saving.current = { run, t: setTimeout(() => { saving.current = null; run(); }, 500) };
  };
  useEffect(() => () => { if (saving.current) { clearTimeout(saving.current.t); saving.current.run(); } }, []);
  const deckRep = useMemo(() => applySelection(rep, hidden), [rep, hidden]);
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
  const goConnectIg = () => { try { sessionStorage.setItem("pathwai.admintab", "integrations"); } catch { /* ignore */ } nav("/admin?tab=integrations"); };
  const loadShares = useCallback(() => api.get("/admin/report-shares").then((r) => setShares(r.data.shares || [])).catch(() => {}), []);
  useEffect(() => { loadShares(); }, [loadShares]);

  const pdf = async () => {
    if (demo) { window.print(); return; }
    setBusy("pdf");
    try { await downloadReportPdf(kind, days, include); toast.success("PDF downloaded"); }
    catch (e) { let m; try { const t = await e?.response?.data?.text?.(); m = JSON.parse(t).detail; } catch { /* ignore */ } toast.error(m || errMsg(e, "The PDF could not be created.")); }
    finally { setBusy(""); }
  };
  const slides = async () => {
    if (demo) { toast.message("Slides download from a live community. In this practice copy, flip through the preview below."); return; }
    setBusy("deck");
    try { await flushSave(); await downloadReportDeck(kind, days, include, label); toast.success("Slides downloaded"); }
    catch (e) { let m; try { const t = await e?.response?.data?.text?.(); m = JSON.parse(t).detail; } catch { /* ignore */ } toast.error(m || errMsg(e, "The slides could not be created.")); }
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
      {!embedded && <div className="no-print"><PageHeader title="Reports" subtitle="Proof of what your community is doing, ready for the people who ask. Every number is counted from your own records." /></div>}

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
              <p className="min-w-[14rem] flex-1 text-sm text-muted">Instagram is connected but has no numbers yet.</p>
              <Button variant="ghost" onClick={() => refreshIg(false)} loading={busy === "ig"} data-testid="report-ig-refresh"><RefreshCw className="h-4 w-4" />Pull numbers now</Button>
            </>
          ) : (
            <>
              <p className="min-w-[14rem] flex-1 text-sm text-muted"><span className="font-medium text-ink">Add your Instagram reach.</span> Show followers, reach and who the audience is next to your community numbers.</p>
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
        <div className="flex flex-wrap gap-2">
          <Button onClick={slides} loading={busy === "deck"} data-testid="report-slides"><Download className="h-4 w-4" />Download slides</Button>
          <Button onClick={pdf} loading={busy === "pdf"} variant="ghost" data-testid="report-pdf">{demo ? <Printer className="h-4 w-4" /> : <FileText className="h-4 w-4" />}{demo ? "Print / save as PDF" : "Download as a document"}</Button>
        </div>
      </div>

      <Card className="no-print" data-testid="report-deck">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold">Your slides</h3>
            <p className="mt-1 max-w-xl text-sm text-muted">Made automatically in your community's colours, logo, photos and story, ready to present or send. Flip through them here, then download.</p>
          </div>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Prepared for (optional)" maxLength={80} aria-label="Who the slides are prepared for" data-testid="deck-label" className="w-full sm:w-72" />
        </div>
        <DeckReadiness config={config} ig={ig} onInstagram={goConnectIg} />
        {rep && <DeckPicker rep={rep} hidden={hidden} setHidden={setHidden} />}
        {!rep ? <Spinner /> : <DeckPreview report={deckRep} config={config} label={label} />}
      </Card>

      <Card className="print-area">
        {!rep ? <Spinner /> : (
          <>
            <div className="mb-6 border-b border-line pb-5">
              <p className="eyebrow">{rep.audience}</p>
              <h2 className="mt-2 text-2xl sm:text-3xl" data-testid="report-title">{rep.community}: {rep.headline}</h2>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">{rep.period_label} · Generated {new Date(rep.generated_at).toLocaleDateString(undefined, { dateStyle: "long" })}
                {rep.sample && <span className="chip" data-testid="report-sample">Sample data</span>}</p>
            </div>
            <ReportView report={rep} config={config} />
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
