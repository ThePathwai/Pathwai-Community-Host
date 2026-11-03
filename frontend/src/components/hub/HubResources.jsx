import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { api } from "../../lib/api";
import { Spinner, cx } from "../ui";
import { useEcosystem } from "../../lib/ecosystem";
import { Chips, Empty, FitPill, KindTile, PageHead, RowList, SearchBox, Why, needChips, useHubData } from "./HubKit";

// Resources in a hub's ecosystem lens: guides, templates, perks and intros from the people who have done it, best fit first. A row opens in place.
function Row({ m }) {
  const [open, setOpen] = useState(false);
  return (
    <li data-testid={`resource-${m.id}`}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-4 p-4 text-left sm:p-5">
        <KindTile kind="resource" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {m.category && <span className="text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{m.category}</span>}
            {m.value && <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}>{m.value}</span>}
            <FitPill fit={m.fit} />
          </span>
          <span className="mt-0.5 block text-base font-semibold leading-snug">{m.title}</span>
          {m.by && <span className="block text-xs text-muted">From {m.by.name}{m.by.title ? `, ${m.by.title}` : ""}</span>}
          <Why text={m.reason} />
        </span>
        <ChevronDown className={cx("mt-1 h-4 w-4 shrink-0 text-muted transition", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="space-y-3 px-4 pb-5 sm:pl-[5.5rem] sm:pr-5" data-testid={`resource-open-${m.id}`}>
          {m.desc && <p className="text-sm leading-relaxed text-ink/90">{m.desc}</p>}
          {m.how && <p className="rounded-xl bg-ink/[.04] p-3 text-sm"><span className="font-semibold">How to get it · </span>{m.how}</p>}
          <div className="flex flex-wrap gap-2">
            {m.by && <Link to={`/members/${m.by.id}`} className="btn-primary !py-2 text-sm">Message {m.by.name.split(" ")[0]}</Link>}
            {m.url && <a className="btn-ghost !py-2 text-sm" href={m.url} target="_blank" rel="noreferrer" onClick={() => api.post(`/resources/${m.id}/open`).catch(() => {})}>Open</a>}
          </div>
        </div>
      )}
    </li>
  );
}

export default function HubResources() {
  const eco = useEcosystem();
  const { d, err } = useHubData();
  const [need, setNeed] = useState("all");
  const [q, setQ] = useState("");
  const all = useMemo(() => d?.lists.resource || [], [d]);
  const chips = useMemo(() => needChips(all), [all]);
  const needle = q.trim().toLowerCase();
  const rows = all.filter((m) => (need === "all" || (m.needs || []).includes(need)) && (!needle || JSON.stringify([m.title, m.desc, m.category, m.by?.name]).toLowerCase().includes(needle)));
  if (err) return <p className="card text-sm text-muted">Resources could not load. Please try again in a moment.</p>;
  if (!d) return <Spinner />;
  return (
    <div className="mx-auto w-full max-w-4xl" data-testid="hub-resources">
      <PageHead eyebrow="Resources" title={`Resources from ${eco.hub}`} sub="Guides, templates, free hours and warm intros from the people who have done it, with the ones that help you most first." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Search resources" testid="res-search" />
        <div className="min-w-0 flex-1"><Chips items={chips} value={need} onChange={setNeed} label="What you need" testid="res-need" /></div>
      </div>
      {rows.length ? <RowList testid="res-rows">{rows.map((m) => <Row key={m.id} m={m} />)}</RowList> : <Empty>Nothing matches that search.</Empty>}
    </div>
  );
}
