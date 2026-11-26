import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Download } from "../components/icons";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Chip, PageHeader, SectionCard, Spinner, cx } from "../components/ui";

// Impact and export (/impact), for a community's admins. Every number in the reports as a table and as a spreadsheet file
// (GET /admin/metrics and /admin/metrics.csv, backend/impact.py). Totals only: no names or emails, and a group under 5 shows as "<5".
// The file is what a hub sends to a funder, so what you see here is exactly what is in it.

const RANGES = [[30, "30 days"], [90, "90 days"], [365, "12 months"]];
const COMPARED = new Set(["Membership", "Introductions", "Events", "Perks", "Support", "Re-engagement"]);
const fmt = (v, unit) => (typeof v === "number" ? v.toLocaleString("en-CA") : v) + (unit === "%" && typeof v === "number" ? "%" : "");
const move = (c) => (c == null ? "" : c > 0 ? `+${c}` : c < 0 ? `−${Math.abs(c)}` : "no change");

export default function HubImpact() {
  const { user, config } = useAuth();
  const [days, setDays] = useState(90);
  const [t, setT] = useState(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setT(null); setErr(false);
    api.get("/admin/metrics", { params: { days } }).then((r) => { if (live) setT(r.data); }).catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [days]);
  const groups = useMemo(() => {
    const out = [];
    for (const r of t?.rows || []) {
      let g = out[out.length - 1];
      if (!g || g.name !== r.section) { g = { name: r.section, rows: [] }; out.push(g); }
      g.rows.push(r);
    }
    return out;
  }, [t]);
  if (user && user.role !== "admin") return <Navigate to="/" replace />;

  const download = async () => {
    setBusy(true);
    try {
      const r = await api.get("/admin/metrics.csv", { params: { days }, responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const slug = (t?.community || config?.community_name || "community").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "community";
      const a = document.createElement("a");
      a.href = url; a.download = `${slug}-metrics-${t?.period_end || new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };

  return (
    <div data-testid="hub-impact">
      <PageHeader title="Impact and export" subtitle="Every number in your reports, as a spreadsheet you can send to a funder or open in Excel or Sheets."
        actions={<Button onClick={download} loading={busy} disabled={!t} data-testid="impact-download"><Download className="h-4 w-4" aria-hidden />Download CSV</Button>} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Period" className="inline-flex rounded-full border border-line bg-ink/5 p-1 text-sm">
          {RANGES.map(([d, label]) => (
            <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d} data-testid={`impact-range-${d}`}
              className={cx("rounded-full px-4 py-1.5", days === d ? "bg-ink text-paper" : "text-muted hover:text-ink")}>{label}</button>
          ))}
        </div>
        {t && <span className="text-xs text-muted">{t.period_start} to {t.period_end}{t.compared_with_previous ? ", compared with the period before" : ""}</span>}
        {t?.sample && <Chip>Sample data</Chip>}
      </div>

      {err && <p className="card text-sm text-muted" role="alert">We couldn't load your numbers. Try again in a moment.</p>}
      {!t && !err && <Spinner />}
      {t && (
        <div className="grid gap-4">
          {groups.map((g) => {
            const compared = COMPARED.has(g.name);
            return (
              <SectionCard key={g.name} title={g.name}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    {compared && <thead><tr className="text-left text-[11px] uppercase text-muted"><th className="pb-2 font-semibold">Measure</th><th className="pb-2 text-right font-semibold">Now</th><th className="pb-2 text-right font-semibold">Before</th><th className="pb-2 text-right font-semibold">Change</th></tr></thead>}
                    <tbody>
                      {g.rows.map((r, i) => (
                        <tr key={`${r.metric}-${i}`} className="border-t border-line/60 first:border-0">
                          <th scope="row" className="py-2 pr-3 text-left font-normal">{r.metric}{!compared && r.note && <span className="block text-xs text-muted">{r.note}</span>}</th>
                          <td className="py-2 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(r.value, r.unit)}{!compared && r.unit && r.unit !== "%" && <span className="ml-1 text-xs text-muted">{r.unit}</span>}</td>
                          {compared && <td className="py-2 text-right text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>{r.previous == null ? "—" : fmt(r.previous, r.unit)}</td>}
                          {compared && <td className="py-2 text-right text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>{move(r.change) || "—"}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            );
          })}
          <p className="text-xs text-muted" data-testid="impact-note">{t.note} Event and perk names are the public titles you published.</p>
        </div>
      )}
    </div>
  );
}
