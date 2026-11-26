import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { cx } from "./ui";

// "How it went": for each program you said you are in, have done or are interested in, say what happened (applied, got in, not selected...)
// and, if you got in, roughly how much funding came with it. Kept on your account (GET/POST /navigator/outcomes). Nothing leaves it unless you
// switch on the box at the bottom, and then your community only ever adds you into totals of 5 or more people: never your name or your programs.

const Label = ({ children }) => <p className="text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{children}</p>;
const heading = { textTransform: "none", letterSpacing: "-0.01em", fontWeight: 700 };

export default function Outcomes({ tracked = [], interest = [] }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    let live = true;
    api.get("/navigator/outcomes").then((r) => { if (live) setD(r.data); }).catch(() => { if (live) setD(false); });
    return () => { live = false; };
  }, []);

  const rows = useMemo(() => {
    if (!d) return [];
    const mine = Object.fromEntries((d.applications || []).map((a) => [a.id, a]));
    const seen = new Set();
    const out = [];
    const take = (p) => { if (!p || !p.id || seen.has(p.id)) return; seen.add(p.id); out.push({ id: p.id, name: p.name, org: p.org || "", type: p.type || "", status: mine[p.id]?.status || "", funding: mine[p.id]?.funding || "" }); };
    tracked.filter((t) => t.state === "in" || t.state === "done").forEach(take);
    interest.filter((i) => i.state === "yes").forEach(take);
    (d.applications || []).forEach(take);   // anything already logged stays listed, even if you later un-shortlisted it
    return out;
  }, [d, tracked, interest]);

  if (!d) return null;

  const save = async (row, status, funding) => {
    setBusy(row.id);
    try {
      const r = await api.post("/navigator/outcomes", { id: row.id, name: row.name, org: row.org, type: row.type, status: status || "none", funding: funding || "" });
      setD(r.data);
    } catch (e) { toast.error(errMsg(e)); }
    setBusy("");
  };
  const share = async (on) => {
    setBusy("share");
    try {
      const r = await api.put("/navigator/outcomes/sharing", { share: on });
      setD(r.data);
      toast.success(on ? "Your progress now counts in your community's totals" : "Your progress no longer counts in any totals");
    } catch (e) { toast.error(errMsg(e)); }
    setBusy("");
  };
  const gotIn = (s) => s === "accepted" || s === "completed";

  return (
    <section className="flex flex-col rounded-3xl border border-line bg-surface p-5" data-testid="path-outcomes">
      <Label>How it went</Label>
      <h3 className="mt-1 text-lg" style={heading}>Tell us what happened</h3>
      <p className="mt-1 text-sm text-muted">Applied somewhere? Say how it went. It helps you remember, and it is how a program's results get counted.</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Programs you say you are in, have done or are interested in will appear here.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line/60">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3" data-testid={`outcome-${r.id}`}>
              <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium">{r.name}</span>
              <select className="input !w-auto !py-1.5 text-sm" value={r.status || "none"} disabled={busy === r.id} aria-label={`What happened with ${r.name}`}
                onChange={(e) => save(r, e.target.value, e.target.value === r.status ? r.funding : "")} data-testid={`outcome-status-${r.id}`}>
                <option value="none">Haven't applied</option>
                {d.statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              {gotIn(r.status) && (
                <select className="input !w-auto !py-1.5 text-sm" value={r.funding} disabled={busy === r.id} aria-label={`Funding that came with ${r.name}`}
                  onChange={(e) => save(r, r.status, e.target.value)} data-testid={`outcome-funding-${r.id}`}>
                  <option value="">Funding? (optional)</option>
                  {d.funding.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              )}
            </li>
          ))}
        </ul>
      )}
      <label className={cx("mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-3", d.share && "border-ink/40")}>
        <input type="checkbox" className="mt-1 h-4 w-4 accent-accent" checked={!!d.share} disabled={busy === "share"} onChange={(e) => share(e.target.checked)} data-testid="outcome-share" />
        <span className="text-sm">
          <span className="block font-semibold">Count my progress in my community's totals</span>
          <span className="mt-0.5 block text-xs text-muted">Off unless you turn it on. Communities you belong to add your results to their totals, and never see your name, your startup or which programs. Nothing shows until at least 5 people have chosen to share. Turn it off any time.</span>
        </span>
      </label>
    </section>
  );
}
