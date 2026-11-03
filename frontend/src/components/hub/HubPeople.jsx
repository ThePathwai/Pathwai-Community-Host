import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { countBy } from "../../lib/explain";
import { Spinner } from "../ui";
import { useEcosystem } from "../../lib/ecosystem";
import { Chips, Empty, MatchCard, PageHead, PersonAvatar, SearchBox, SummaryBar, VerdictSections, useHubData } from "./HubKit";

// People in a hub's ecosystem lens: grouped by whether they can help with what you asked for, with the checks (can they help you, can you help
// them) and what to do about it. Search and filter by who they are.
const TYPE = { founder: "Founders", mentor: "Industry leaders", alumni: "Partners", partner: "Investors" };
const TYPE_ONE = { founder: "Founder", mentor: "Industry leader", alumni: "Innovation partner", partner: "Investor", guest: "Guest" };

function Card({ m }) {
  return (
    <MatchCard m={m} testid={`person-${m.id}`} kicker={TYPE_ONE[m.type] || m.type}
      lead={<Link to={`/members/${m.id}`} aria-label={`${m.title}, profile`}><PersonAvatar m={m} size={52} /></Link>}
      title={<Link to={`/members/${m.id}`} className="hover:underline">{m.title}</Link>} sub={m.sub}
      actions={<Link to={`/members/${m.id}`} className="btn-ghost !py-2 text-sm" data-testid={`hi-${m.id}`}>View profile &amp; say hi</Link>} />
  );
}

export default function HubPeople() {
  const eco = useEcosystem();
  const { d, err } = useHubData();
  const [filter, setFilter] = useState("all");
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");
  const all = useMemo(() => d?.lists.person || [], [d]);
  const typeChips = useMemo(() => {
    const n = {};
    for (const m of all) if (TYPE[m.type]) n[m.type] = (n[m.type] || 0) + 1;
    return [["all", "Everyone", all.length], ...Object.keys(TYPE).filter((k) => n[k]).map((k) => [k, TYPE[k], n[k]])];
  }, [all]);
  const needle = q.trim().toLowerCase();
  const items = all.filter((m) => (type === "all" || m.type === type) && (!needle || JSON.stringify([m.title, m.sub, m.offers, m.wants]).toLowerCase().includes(needle)));
  if (err) return <p className="card text-sm text-muted">People could not load. Please try again in a moment.</p>;
  if (!d) return <Spinner />;
  return (
    <div className="mx-auto w-full max-w-5xl" data-testid="hub-people">
      <PageHead eyebrow="People" title={`Who to meet at ${eco.hub}`} sub="Founders, mentors, investors and partners, checked against what you asked for. The people who can help you most come first." />
      <SummaryBar counts={countBy(all)} value={filter} onChange={setFilter} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Search by name, role or skill" testid="ppl-search" />
        <div className="min-w-0 flex-1"><Chips items={typeChips} value={type} onChange={setType} label="Who" testid="ppl-type" /></div>
      </div>
      {items.length ? <VerdictSections items={items} filter={filter} render={(m) => <Card key={m.id} m={m} />} /> : <Empty>No one matches that search.</Empty>}
    </div>
  );
}
