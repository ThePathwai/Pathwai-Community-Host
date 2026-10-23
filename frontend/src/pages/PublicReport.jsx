import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { applyBrand } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { PoweredBy, Spinner, Wordmark, cx } from "../components/ui";
import ReportView from "../components/ReportView";
import DeckPreview from "../components/DeckPreview";

// /r/:slug/:token -- what a shared report link opens. No login, read-only, always current, totals only.
// It opens in the community's own colours and logo, as a report page or as the same slides they would download.
export default function PublicReport() {
  const { slug, token } = useParams();
  const [rep, setRep] = useState(null);
  const [gone, setGone] = useState(false);
  const [view, setView] = useState("report");
  useEffect(() => {
    api.get(`/public/report/${token}`, { headers: { "X-Community": slug } }).then((r) => {
      setRep(r.data); document.title = `${r.data.community}: ${r.data.title}`;
    }).catch(() => setGone(true));
  }, [slug, token]);
  // Applied once the sign-in check has finished, because that check puts the plain Pathwai look back when nobody is signed in.
  const { loading } = useAuth();
  useEffect(() => {
    if (!loading && rep?.brand?.colors) applyBrand({ community_name: rep.community, brand: rep.brand });
  }, [loading, rep]);
  // the settings the slides are drawn from, as the community's own pages hold them
  const config = useMemo(() => rep && ({ community_name: rep.community, brand: rep.brand || {}, gallery_photos: rep.photos || [], about: rep.about, about_url: rep.about_url }), [rep]);
  if (gone) return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center" data-testid="public-report-gone">
      <h1 className="text-3xl">This link is no longer active.</h1>
      <p className="mt-3 text-sm text-muted">The person who shared it has turned it off. Ask them for a new one.</p>
    </main>
  );
  if (!rep) return <Spinner />;
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:py-12" data-testid="public-report">
      <div className="mb-6 text-xl sm:text-2xl" data-testid="public-report-brand"><Wordmark name={rep.community} brand={rep.brand || {}} /></div>
      <p className="eyebrow">{rep.title}{rep.label ? ` · prepared for ${rep.label}` : ""}</p>
      <h1 className="mt-3 text-3xl sm:text-4xl" style={{ textWrap: "balance" }}>{rep.community}: {rep.headline}</h1>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">{rep.period_label} · Live, read-only · Updated {new Date(rep.generated_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        {rep.sample && <span className="chip">Sample data</span>}</p>
      <div className="mt-6 inline-flex rounded-full border border-line p-0.5 text-sm" role="tablist" aria-label="How to read this">
        {[["report", "Report"], ["slides", "Slides"]].map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} data-testid={`public-view-${k}`}
            className={cx("rounded-full px-4 py-1.5 transition-colors", view === k ? "bg-ink text-paper" : "text-muted hover:text-ink")}>{t}</button>
        ))}
      </div>
      {view === "report"
        ? <div className="mt-5 rounded-2xl border border-line p-5 sm:p-8" data-testid="public-report-page"><ReportView report={rep} config={config} /></div>
        : <div className="mt-5" data-testid="public-report-slides"><DeckPreview report={rep} config={config} label={rep.label || ""} /></div>}
      <p className="mt-6 text-xs text-muted">Every figure is counted from {rep.community}'s own records when you open this page. It shows totals only, never member names or contact details.</p>
      <PoweredBy className="mt-8 text-center" />
    </main>
  );
}
