import React, { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { isDemo } from "../lib/demo";

/** Members' view of how dependable their community is: the same counted totals the admin sends to sponsors, never names. */
export default function Scorecard() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/community/reliability", { params: { days: 90 } }).then((r) => setD(r.data)).catch(() => setD({ error: true })); }, []);
  if (d?.error) return null;
  return (
    <section className="card" data-testid="scorecard" aria-busy={!d}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base lg:text-lg"><ShieldCheck className="h-4 w-4 text-muted" strokeWidth={2.25} aria-hidden />Community scorecard</h2>
        <p className="flex items-center gap-2 text-xs text-muted">{d?.period_label || "Last 90 days"}{isDemo() && <span className="chip" data-testid="scorecard-sample">Sample data</span>}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 lg:grid-cols-4">
        {(d?.tiles || [null, null, null, null]).map((t, i) => t ? (
          <div key={t.key} className="min-w-0" data-testid={`scorecard-${t.key}`}>
            <p className="stat text-2xl leading-none sm:text-3xl" style={{ color: t.key === "show" ? "var(--accent)" : undefined }}>{t.value}</p>
            <p className="mt-1.5 text-sm font-medium leading-tight">{t.label}</p>
            <p className="mt-0.5 text-xs text-muted">{t.note}</p>
          </div>
        ) : <div key={i} className="h-14 animate-pulse rounded-lg bg-ink/[.06]" />)}
      </div>
      <p className="mt-4 text-xs text-muted">Counted from real attendance, introductions and help given. Totals only, never names.</p>
    </section>
  );
}
