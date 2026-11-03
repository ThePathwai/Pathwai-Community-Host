import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Spinner } from "../ui";
import { useEcosystem } from "../../lib/ecosystem";
import { Chips, Empty, FitPill, PageHead, PersonAvatar, RowList, SearchBox, Why, useHubData } from "./HubKit";

// People in a hub's ecosystem lens: who is worth meeting, best fit first, with what they can help with and what they are looking for.
const TYPE = { founder: "Founders", mentor: "Industry leaders", alumni: "Partners", partner: "Investors" };
const TYPE_ONE = { founder: "Founder", mentor: "Industry leader", alumni: "Innovation partner", partner: "Investor", guest: "Guest" };

function Row({ m }) {
  return (
    <li className="p-4 sm:p-5" data-testid={`person-${m.id}`}>
      <div className="flex gap-4">
        <Link to={`/members/${m.id}`} aria-label={`${m.title}, profile`}><PersonAvatar m={m} /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-base font-semibold leading-snug"><Link to={`/members/${m.id}`} className="hover:underline">{m.title}</Link></h3>
            {m.type && <span className="rounded-full bg-ink/[.07] px-2 py-0.5 text-[11px] font-semibold text-muted">{TYPE_ONE[m.type] || m.type}</span>}
            <FitPill fit={m.fit} />
          </div>
          {m.sub && <p className="text-xs text-muted">{m.sub}</p>}
          {!(m.offers.length || m.wants.length) && <Why text={m.reason} />}
          {(m.offers.length > 0 || m.wants.length > 0) && (
            <div className="mt-2.5 space-y-1.5">
              {m.offers.length > 0 && <p className="flex flex-wrap items-center gap-1.5 text-xs"><span className="w-[6.5rem] shrink-0 font-semibold text-muted">Can help with</span>{m.offers.slice(0, 2).map((x) => <span key={x} className="chip">{x}</span>)}</p>}
              {m.wants.length > 0 && <p className="flex flex-wrap items-center gap-1.5 text-xs"><span className="w-[6.5rem] shrink-0 font-semibold text-muted">Looking for</span>{m.wants.slice(0, 2).map((x) => <span key={x} className="chip">{x}</span>)}</p>}
            </div>
          )}
          <div className="mt-3"><Link to={`/members/${m.id}`} className="btn-ghost !py-2 text-sm" data-testid={`hi-${m.id}`}>View profile &amp; say hi</Link></div>
        </div>
      </div>
    </li>
  );
}

export default function HubPeople() {
  const eco = useEcosystem();
  const { d, err } = useHubData();
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");
  const [more, setMore] = useState(false);
  const all = useMemo(() => d?.lists.person || [], [d]);
  const chips = useMemo(() => {
    const n = {};
    for (const m of all) if (TYPE[m.type]) n[m.type] = (n[m.type] || 0) + 1;
    return [["all", "Everyone", all.length], ...Object.keys(TYPE).filter((k) => n[k]).map((k) => [k, TYPE[k], n[k]])];
  }, [all]);
  const needle = q.trim().toLowerCase();
  const rows = all.filter((m) => (type === "all" || m.type === type) && (!needle || JSON.stringify([m.title, m.sub, m.offers, m.wants]).toLowerCase().includes(needle)));
  if (err) return <p className="card text-sm text-muted">People could not load. Please try again in a moment.</p>;
  if (!d) return <Spinner />;
  return (
    <div className="mx-auto w-full max-w-4xl" data-testid="hub-people">
      <PageHead eyebrow="People" title={`Who to meet at ${eco.hub}`} sub="Founders, mentors, investors and partners, with the people who can help you with what you asked for first." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Search by name, role or skill" testid="ppl-search" />
        <div className="min-w-0 flex-1"><Chips items={chips} value={type} onChange={setType} label="Who" testid="ppl-type" /></div>
      </div>
      {rows.length ? <RowList testid="ppl-rows">{(more || needle || type !== "all" ? rows : rows.slice(0, 8)).map((m) => <Row key={m.id} m={m} />)}</RowList> : <Empty>No one matches that search.</Empty>}
      {!more && !needle && type === "all" && rows.length > 8 && <button type="button" onClick={() => setMore(true)} className="btn-ghost mx-auto mt-4 flex !py-2 text-sm" data-testid="ppl-more">Show all {rows.length} people</button>}
    </div>
  );
}
