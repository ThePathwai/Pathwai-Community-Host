import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { cx } from "./ui";

// "Where you have applied": tick the programs you applied to. That is all we ask, never how it went. Kept on your account
// (GET/POST /navigator/outcomes). Nothing leaves it unless you switch on the box at the bottom, and then your community only ever
// adds you into totals of 5 or more people: never your name or your programs.

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
    const take = (p) => { if (!p || !p.id || seen.has(p.id)) return; seen.add(p.id); out.push({ id: p.id, name: p.name, org: p.org || "", type: p.type || "", applied: !!mine[p.id] }); };
    tracked.filter((t) => t.state === "in" || t.state === "done").forEach(take);
    interest.filter((i) => i.state === "yes").forEach(take);
    (d.applications || []).forEach(take);   // anything already marked stays listed, even if you later un-shortlisted it
    return out;
  }, [d, tracked, interest]);

  if (!d) return null;

  const save = async (row, applied) => {
    setBusy(row.id);
    try {
      const r = await api.post("/navigator/outcomes", { id: row.id, name: row.name, org: row.org, type: row.type, status: applied ? "applied" : "none" });
      setD(r.data);
    } catch (e) { toast.error(errMsg(e)); }
    setBusy("");
  };
  const share = async (on) => {
    setBusy("share");
    try {
      const r = await api.put("/navigator/outcomes/sharing", { share: on });
      setD(r.data);
      toast.success(on ? "Your applications now count in your community's totals" : "Your applications no longer count in any totals");
    } catch (e) { toast.error(errMsg(e)); }
    setBusy("");
  };

  return (
    <section className="flex flex-col rounded-3xl border border-line bg-surface p-5" data-testid="path-outcomes">
      <Label>Where you have applied</Label>
      <h3 className="mt-1 text-lg" style={heading}>Tick the ones you applied to</h3>
      <p className="mt-1 text-sm text-muted">Just applied or not. We never ask how it went.</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Programs you say you are in, have done or are interested in will appear here.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line/60">
          {rows.map((r) => (
            <li key={r.id} data-testid={`outcome-${r.id}`}>
              <label className="flex cursor-pointer items-center gap-3 py-3">
                <input type="checkbox" className="h-4 w-4 accent-accent" checked={r.applied} disabled={busy === r.id} onChange={(e) => save(r, e.target.checked)}
                  aria-label={`I applied to ${r.name}`} data-testid={`outcome-applied-${r.id}`} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}</span>
                <span className="text-xs text-muted">{r.applied ? "Applied" : ""}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <label className={cx("mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-3", d.share && "border-ink/40")}>
        <input type="checkbox" className="mt-1 h-4 w-4 accent-accent" checked={!!d.share} disabled={busy === "share"} onChange={(e) => share(e.target.checked)} data-testid="outcome-share" />
        <span className="text-sm">
          <span className="block font-semibold">Count my applications in my community's totals</span>
          <span className="mt-0.5 block text-xs text-muted">Off unless you turn it on. Communities you belong to add your applications to their totals, and never see your name, your startup or which programs. Nothing shows until at least 5 people have chosen to share. Turn it off any time.</span>
        </span>
      </label>
    </section>
  );
}
