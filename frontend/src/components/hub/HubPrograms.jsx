import React, { useEffect, useMemo, useState } from "react";
import { Bookmark } from "lucide-react";
import { useEcosystem } from "../../lib/ecosystem";
import { Spinner, cx } from "../ui";
import { ProgramDrawer } from "../ProgramCards";
import { Chips, Empty, FitPill, KindTile, PageHead, RowList, Why, dayShort, daysFromNow, useHubData } from "./HubKit";

// Programs & grants in a hub's ecosystem lens: what the hub runs for founders, best fit first, each with when it closes and why it fits.
// A row opens the same program drawer used everywhere (Interested / Not interested, how to apply).
function Row({ m, today, interested, onOpen }) {
  const left = m.deadline ? daysFromNow(m.deadline, today) : null;
  const soon = left != null && left <= 14;
  return (
    <li data-testid={`prog-${m.id}`}>
      <div className="flex w-full items-start gap-4 p-4 sm:p-5">
        <KindTile kind={m.kind} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[11px] font-semibold uppercase" style={{ letterSpacing: "0.12em", color: m.kind === "grant" ? "#1B9C8E" : "#6D5BD0" }}>{m.kind === "grant" ? "Grant" : "Program"}</span>
            <FitPill fit={m.fit} />
            {interested && <span className="inline-flex items-center gap-1 rounded-full bg-ink/[.07] px-2 py-0.5 text-[11px] font-semibold"><Bookmark className="h-3 w-3" aria-hidden />Interested</span>}
          </div>
          <h3 className="mt-0.5 text-base font-semibold leading-snug">{m.title}</h3>
          {m.amount && <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>{m.amount}</p>}
          <Why text={m.reason} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onOpen(m.program)} data-testid={`prog-open-${m.id}`} className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>{m.deadline ? "See details & apply" : "See details"}</button>
            <span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold", soon ? "bg-red-500/15 text-red-600" : "bg-ink/[.07] text-ink/80")}>{m.deadline ? `Closes ${dayShort(m.deadline)}${left != null ? ` · ${left} day${left === 1 ? "" : "s"}` : ""}` : m.program?.status === "rolling" ? "Apply anytime" : "Check the dates"}</span>
          </div>
        </div>
      </div>
    </li>
  );
}

export default function HubPrograms({ itc, tracked, onTrack, stage, guide, loadMine }) {
  const eco = useEcosystem();
  const { d, err, reload } = useHubData();
  const [kind, setKind] = useState("all");
  const [open, setOpen] = useState(null);
  const [view, setView] = useState("list");
  useEffect(() => { if (loadMine) loadMine(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [itc.sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = useMemo(() => [...(d?.lists.program || []), ...(d?.lists.grant || [])].sort((a, b) => b.score - a.score), [d]);
  const interestedIds = new Set(itc.interest.filter((i) => i.state === "yes").map((i) => i.id));
  const chips = [["all", "All", all.length], ["program", "Programs", all.filter((m) => m.kind === "program").length], ["grant", "Grants", all.filter((m) => m.kind === "grant").length], ["saved", "Interested", all.filter((m) => interestedIds.has(m.id)).length]];
  const rows = all.filter((m) => (kind === "all" ? true : kind === "saved" ? interestedIds.has(m.id) : m.kind === kind));
  if (err) return <p className="card text-sm text-muted">Programs could not load. Please try again in a moment.</p>;
  if (!d) return <Spinner />;
  return (
    <div className="mx-auto w-full max-w-4xl" data-testid="hub-programs">
      <PageHead eyebrow="Programs & grants" title={`Programs & grants at ${eco.hub}`} sub="Everything Humber runs for founders, with the ones that fit your startup first. Say Interested to keep one, Not interested to hide it."
        right={<div className="inline-flex rounded-full border border-line p-1" role="group" aria-label="View">
          {[["list", "Browse"], ["ask", "Ask the guide"]].map(([k, label]) => <button key={k} type="button" onClick={() => setView(k)} aria-pressed={view === k} data-testid={`prog-view-${k}`} className={cx("rounded-full px-4 py-1.5 text-sm font-medium", view === k ? "" : "text-muted hover:text-ink")} style={view === k ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{label}</button>)}
        </div>} />
      {view === "ask" ? <div className="mx-auto w-full max-w-3xl">{guide}</div> : (
        <>
          <div className="mb-4"><Chips items={chips} value={kind} onChange={setKind} label="Type" testid="prog-kind" /></div>
          {rows.length ? <RowList testid="prog-rows">{rows.map((m) => <Row key={m.id} m={m} today={d.as_of} interested={interestedIds.has(m.id)} onOpen={setOpen} />)}</RowList>
            : <Empty>{kind === "saved" ? "Nothing saved yet. Open a program and press Interested." : "Nothing here yet. Add your startup details to your profile and this fills in."}</Empty>}
        </>
      )}
      <ProgramDrawer p={open} onClose={() => setOpen(null)} tracked={tracked} onTrack={onTrack} interest={itc} stage={stage} eco={eco} />
    </div>
  );
}
