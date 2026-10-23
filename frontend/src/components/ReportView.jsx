import React from "react";
import { AuditTiles, Chart, SeriesCtx } from "./AuditView";
import { deckTheme } from "../lib/deck";

// Draws a sponsor / funder / board report (backend/impact.py build_report, or lib/sampleReport.js in the demo).
// Used on the Reports page, the shared read-only page and the sample report on the About page.
export default function ReportView({ report, compact = false, config = null }) {
  const series = config ? deckTheme(config).series : null; // the same chart colours the downloaded slides use
  const body = (
    <div className="space-y-8" data-testid={`report-${report.type}`}>
      {report.sections.map((s) => (
        <section key={s.kind} data-testid={`report-section-${s.kind}`}>
          <h3 className="font-display text-lg">{s.title}</h3>
          <p className="mb-3 mt-0.5 text-xs text-muted">{s.subtitle}</p>
          <AuditTiles tiles={s.tiles} />
          {!compact && s.charts?.length > 0 && <div className="mt-6 grid gap-x-10 gap-y-7 md:grid-cols-2">{s.charts.map((ch) => <Chart key={ch.title} ch={ch} />)}</div>}
          {s.insights?.length > 0 && (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">{s.insights.map((t) => <li key={t}>{t}</li>)}</ul>
          )}
        </section>
      ))}
    </div>
  );
  return series ? <SeriesCtx.Provider value={series}>{body}</SeriesCtx.Provider> : body;
}
