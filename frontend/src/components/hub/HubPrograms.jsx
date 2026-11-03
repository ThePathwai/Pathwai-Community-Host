import React, { useEffect, useMemo, useState } from "react";
import { Bookmark } from "lucide-react";
import { useEcosystem } from "../../lib/ecosystem";
import { countBy } from "../../lib/explain";
import { Spinner, cx } from "../ui";
import { ProgramDrawer } from "../ProgramCards";
import { Empty, KindTile, MatchCard, PageHead, SummaryBar, VerdictSections, dayShort, daysFromNow, useHubData } from "./HubKit";

// Programs & grants in a hub's ecosystem lens: what the hub runs for founders, grouped by whether it is a good match right now, with the
// checks (eligibility, stage, needs, timing) and what it would take when it isn't. A card opens the same program drawer used everywhere.
function Card({ m, today, interested, onOpen, onMark }) {
  const left = m.deadline ? daysFromNow(m.deadline, today) : null;
  const when = m.deadline ? `Closes ${dayShort(m.deadline)}${left != null ? ` · ${left} day${left === 1 ? "" : "s"} left` : ""}` : m.program?.status === "rolling" ? "Apply anytime" : "Dates not posted";
  return (
    <MatchCard m={m} testid={`prog-${m.id}`} lead={<KindTile kind={m.kind} size={48} />} kicker={m.kind === "grant" ? "Grant" : "Program"} title={m.title}
      sub={<span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">{m.amount && <span className="font-semibold" style={{ color: "var(--accent)" }}>{m.amount}</span>}<span className={left != null && left <= 14 ? "font-semibold text-red-600" : ""}>{when}</span></span>}
      actions={<>
        <button type="button" onClick={() => onOpen(m.program)} data-testid={`prog-open-${m.id}`} className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>{m.verdict === "now" && m.deadline ? "See details & apply" : "See details"}</button>
        <button type="button" onClick={() => onMark(m.program)} aria-pressed={interested} data-testid={`prog-interest-${m.id}`} className={cx("inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold", interested ? "border-transparent bg-ink/10" : "border-line text-muted hover:text-ink")}><Bookmark className={cx("h-4 w-4", interested && "fill-current")} aria-hidden />{interested ? "Interested" : "Interested?"}</button>
      </>} />
  );
}

export default function HubPrograms({ itc, tracked, onTrack, stage, guide, loadMine }) {
  const eco = useEcosystem();
  const { d, err, reload } = useHubData();
  const [filter, setFilter] = useState("all");
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(null);
  const [view, setView] = useState("list");
  useEffect(() => { if (loadMine) loadMine(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [itc.sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = useMemo(() => [...(d?.lists.program || []), ...(d?.lists.grant || [])].sort((a, b) => b.score - a.score), [d]);
  const interestedIds = new Set(itc.interest.filter((i) => i.state === "yes").map((i) => i.id));
  const items = saved ? all.filter((m) => interestedIds.has(m.id)) : all;
  if (err) return <p className="card text-sm text-muted">Programs could not load. Please try again in a moment.</p>;
  if (!d) return <Spinner />;
  return (
    <div className="mx-auto w-full max-w-5xl" data-testid="hub-programs">
      <PageHead eyebrow="Programs & grants" title={`Programs & grants at ${eco.hub}`} sub="Every program and grant Humber runs, checked against your startup. Each one says why it is, or isn't, a match right now, and what it would take."
        right={<div className="inline-flex rounded-full border border-line p-1" role="group" aria-label="View">
          {[["list", "Browse"], ["ask", "Ask the guide"]].map(([k, label]) => <button key={k} type="button" onClick={() => setView(k)} aria-pressed={view === k} data-testid={`prog-view-${k}`} className={cx("rounded-full px-4 py-1.5 text-sm font-medium", view === k ? "" : "text-muted hover:text-ink")} style={view === k ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{label}</button>)}
        </div>} />
      {view === "ask" ? <div className="mx-auto w-full max-w-3xl">{guide}</div> : (
        <>
          <SummaryBar counts={countBy(all)} value={filter} onChange={setFilter}>
            <button type="button" onClick={() => setSaved(!saved)} aria-pressed={saved} data-testid="prog-saved" className={cx("ml-auto inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm", saved ? "border-transparent bg-ink/10 font-semibold" : "border-line text-muted hover:text-ink")}><Bookmark className={cx("h-4 w-4", saved && "fill-current")} aria-hidden />Interested {interestedIds.size}</button>
          </SummaryBar>
          {items.length ? <VerdictSections items={items} filter={filter} render={(m) => <Card key={m.id} m={m} today={d.as_of} interested={interestedIds.has(m.id)} onOpen={setOpen} onMark={(p) => itc.mark(p, "yes")} />} />
            : <Empty>{saved ? "Nothing saved yet. Press Interested on a program to keep it here." : "Nothing here yet. Add your startup details to your profile and this fills in."}</Empty>}
        </>
      )}
      <ProgramDrawer p={open} onClose={() => setOpen(null)} tracked={tracked} onTrack={onTrack} interest={itc} stage={stage} eco={eco} />
    </div>
  );
}
