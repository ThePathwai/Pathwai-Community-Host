import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { PoweredBy, Spinner } from "../components/ui";
import ReportView from "../components/ReportView";

// /r/:slug/:token -- what a shared report link opens. No login, read-only, always current, totals only.
export default function PublicReport() {
  const { slug, token } = useParams();
  const [rep, setRep] = useState(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    api.get(`/public/report/${token}`, { headers: { "X-Community": slug } }).then((r) => { setRep(r.data); document.title = `${r.data.community}: ${r.data.title}`; }).catch(() => setGone(true));
  }, [slug, token]);
  if (gone) return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center" data-testid="public-report-gone">
      <h1 className="text-3xl">This link is no longer active.</h1>
      <p className="mt-3 text-sm text-muted">The person who shared it has turned it off. Ask them for a new one.</p>
    </main>
  );
  if (!rep) return <Spinner />;
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:py-12" data-testid="public-report">
      <p className="eyebrow">{rep.title}{rep.label ? ` · prepared for ${rep.label}` : ""}</p>
      <h1 className="mt-3 text-3xl sm:text-4xl" style={{ textWrap: "balance" }}>{rep.community}: {rep.headline}</h1>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">{rep.period_label} · Live, read-only · Updated {new Date(rep.generated_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        {rep.sample && <span className="chip">Sample data</span>}</p>
      <div className="mt-8 rounded-2xl border border-line p-5 sm:p-8"><ReportView report={rep} /></div>
      <p className="mt-6 text-xs text-muted">Every figure is counted from {rep.community}'s own records when you open this page. It shows totals only, never member names or contact details.</p>
      <PoweredBy className="mt-8 text-center" />
    </main>
  );
}
