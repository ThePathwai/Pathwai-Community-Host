import React, { createContext, useContext } from "react";
import { cx } from "./ui";

// Draws one audit (the JSON from POST /admin/audits/{kind}): stat tiles, charts and plain-language takeaways.
// The PDF (backend/audit_pdf.py) is built from the same data, with the same colours in the same order.
const DEFAULT_SERIES = ["#2A78D6", "#EB6834", "#1BAF7A", "#EDA100", "#E87BA4"];
// A report can draw its charts in the community's own colours (see ReportView); audits keep the fixed set.
export const SeriesCtx = createContext(DEFAULT_SERIES);

export function AuditTiles({ tiles }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.label} className={cx("rounded-xl border bg-ink/[.04] p-3", t.accent ? "border-ink/50" : "border-line/70")}>
          <p className="stat font-display text-2xl">{t.value}</p>
          <p className="mt-1 text-xs text-muted">{t.label}</p>
          {t.note && <p className="text-[10px] text-muted/80">{t.note}</p>}
        </div>
      ))}
    </div>
  );
}

function HBar({ items, unit, max }) {
  const SERIES = useContext(SeriesCtx);
  const top = max || Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-3 text-xs">
          <span className="truncate" title={it.label}>{it.label}</span>
          <span className="h-2 rounded-full bg-ink/10"><span className="block h-2 rounded-full" style={{ width: `${Math.max((it.value / top) * 100, it.value ? 3 : 0)}%`, background: SERIES[0] }} /></span>
          <span className="w-16 text-right font-semibold tabular-nums">{unit === "% full" ? `${it.value}%` : it.value}{it.note && <span className="ml-1 font-normal text-muted">{it.note}</span>}</span>
        </li>
      ))}
    </ul>
  );
}

function Columns({ items }) {
  const SERIES = useContext(SeriesCtx);
  const top = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex h-36 items-end gap-2 border-b border-line/70 pb-5">
      {items.map((it) => (
        <div key={it.label} className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end">
          <span className="mb-1 text-[11px] font-semibold tabular-nums">{it.value}</span>
          <span className="w-full max-w-[34px] rounded-t-md" style={{ height: `${Math.max((it.value / top) * 100, it.value ? 4 : 0)}%`, maxHeight: "calc(100% - 18px)", background: SERIES[0] }} />
          <span className="absolute -bottom-5 whitespace-nowrap text-[10px] text-muted">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function Donut({ items }) {
  const SERIES = useContext(SeriesCtx);
  const rows = items.slice(0, 5);
  const total = rows.reduce((s, i) => s + i.value, 0) || 1;
  let acc = 0;
  const stops = rows.map((it, i) => { const a = (acc / total) * 360; acc += it.value; return `${SERIES[i]} ${a}deg ${(acc / total) * 360}deg`; }).join(", ");
  return (
    <div className="flex items-center gap-6">
      <div className="relative h-28 w-28 flex-none rounded-full" style={{ background: `conic-gradient(${stops})` }} role="img" aria-label="Breakdown chart">
        <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-surface"><span className="stat font-display text-lg">{total}</span><span className="text-[9px] text-muted">total</span></div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
        {rows.map((it, i) => (
          <li key={it.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: SERIES[i] }} /><span className="min-w-0 flex-1 truncate">{it.label}</span><span className="font-semibold tabular-nums">{it.value} <span className="font-normal text-muted">({Math.round((100 * it.value) / total)}%)</span></span></li>
        ))}
      </ul>
    </div>
  );
}

function Pairs({ items, a, b }) {
  const SERIES = useContext(SeriesCtx);
  const top = Math.max(1, ...items.flatMap((i) => [i.asks, i.helpers]));
  return (
    <div>
      <p className="mb-2 flex gap-4 text-[11px]"><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[0] }} />{a}</span><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[1] }} />{b}</span></p>
      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-3 text-xs">
            <span className="truncate" title={it.label}>{it.label}</span>
            <span className="space-y-1">
              {[[it.asks, SERIES[0]], [it.helpers, SERIES[1]]].map(([v, col], k) => (
                <span key={k} className="flex items-center gap-2"><span className="h-1.5 flex-1 rounded-full bg-ink/10"><span className="block h-1.5 rounded-full" style={{ width: `${Math.max((v / top) * 100, v ? 3 : 0)}%`, background: col }} /></span><span className="w-5 text-right font-semibold tabular-nums">{v}</span></span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Table({ columns, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead><tr className="border-b border-ink/40 text-muted">{columns.map((c) => <th key={c} className="py-1.5 pr-3 font-medium">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-line/50">{r.map((c, j) => <td key={j} className="py-1.5 pr-3 align-top">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function Chart({ ch }) {
  const items = ch.items || [];
  const empty = ch.type === "table" ? !(ch.rows || []).length : !items.length || (ch.type !== "pairs" && items.every((i) => !i.value));
  return (
    <div>
      <h4 className="mb-3 text-sm font-semibold">{ch.title}</h4>
      {empty ? <p className="text-xs text-muted">Nothing to chart yet. This fills in as members join and complete their profiles.</p>
        : ch.type === "hbar" ? <HBar items={items} unit={ch.unit} max={ch.max} />
        : ch.type === "columns" ? <Columns items={items} />
        : ch.type === "donut" ? <Donut items={items} />
        : ch.type === "pairs" ? <Pairs items={items} a={ch.a} b={ch.b} />
        : ch.type === "table" ? <Table columns={ch.columns} rows={ch.rows} /> : null}
    </div>
  );
}

export default function AuditView({ audit }) {
  return (
    <div className="mt-4 space-y-6" data-testid={`audit-view-${audit.kind}`}>
      <AuditTiles tiles={audit.tiles || audit.stats || []} />
      <div className="grid gap-x-10 gap-y-7 md:grid-cols-2">{(audit.charts || []).map((ch) => <Chart key={ch.title} ch={ch} />)}</div>
      {audit.insights?.length > 0 && (
        <div className="rounded-xl bg-ink/[.05] p-4">
          <p className="mb-2 text-sm font-semibold">What this means</p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">{audit.insights.map((t) => <li key={t}>{t}</li>)}</ul>
          {audit.narrative && <p className="mt-3 whitespace-pre-wrap border-t border-line/60 pt-3 text-sm text-muted">{audit.narrative}</p>}
        </div>
      )}
    </div>
  );
}
