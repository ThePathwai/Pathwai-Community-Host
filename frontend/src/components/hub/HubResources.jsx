import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { countBy } from "../../lib/explain";
import { Spinner } from "../ui";
import { useEcosystem } from "../../lib/ecosystem";
import { Empty, KindTile, MatchCard, PageHead, SearchBox, SummaryBar, VerdictSections, useHubData } from "./HubKit";

// Resources in a hub's ecosystem lens: guides, templates, perks and intros, grouped by whether they help with what you asked for, with the
// reason and how to get each one.
function Card({ m }) {
  const first = m.by ? m.by.name.split(" ")[0] : "";
  return (
    <MatchCard m={m} testid={`resource-${m.id}`} lead={<KindTile kind="resource" size={48} />} kicker={m.category} title={m.title}
      sub={<span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">{m.value && <span className="font-semibold" style={{ color: "var(--accent)" }}>{m.value}</span>}{m.by && <span>From {m.by.name}{m.by.title ? `, ${m.by.title}` : ""}</span>}</span>}
      extra={<div className="space-y-2.5">{m.desc && <p className="text-sm leading-relaxed text-ink/90">{m.desc}</p>}{m.how && <p className="rounded-xl bg-ink/[.05] p-3 text-sm"><span className="font-semibold">How to get it · </span>{m.how}</p>}</div>}
      actions={<>
        {m.by && <Link to={`/members/${m.by.id}`} className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>Message {first}</Link>}
        {m.url && <a className="btn-ghost !py-2 text-sm" href={m.url} target="_blank" rel="noreferrer" onClick={() => api.post(`/resources/${m.id}/open`).catch(() => {})}>Open</a>}
      </>} />
  );
}

export default function HubResources() {
  const eco = useEcosystem();
  const { d, err } = useHubData();
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const all = useMemo(() => d?.lists.resource || [], [d]);
  const needle = q.trim().toLowerCase();
  const items = all.filter((m) => !needle || JSON.stringify([m.title, m.desc, m.category, m.by?.name]).toLowerCase().includes(needle));
  if (err) return <p className="card text-sm text-muted">Resources could not load. Please try again in a moment.</p>;
  if (!d) return <Spinner />;
  return (
    <div className="mx-auto w-full max-w-5xl" data-testid="hub-resources">
      <PageHead eyebrow="Resources" title={`Resources from ${eco.hub}`} sub="Guides, templates, free hours and warm intros from the people who have done it, checked against what you asked for." />
      <SummaryBar counts={countBy(all)} value={filter} onChange={setFilter} />
      <div className="mb-6 flex"><SearchBox value={q} onChange={setQ} placeholder="Search resources" testid="res-search" /></div>
      {items.length ? <VerdictSections items={items} filter={filter} render={(m) => <Card key={m.id} m={m} />} /> : <Empty>Nothing matches that search.</Empty>}
    </div>
  );
}
