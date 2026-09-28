import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, Chip, Empty, Input, PageHeader, Select, Spinner, Tabs } from "../components/ui";

export default function Discover() {
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("all");
  const [data, setData] = useState(null);
  const [regions, setRegions] = useState([]);
  const active = q || region !== "all" || kind !== "all";
  const reset = () => { setQ(""); setRegion("all"); setKind("all"); };
  useEffect(() => { api.get("/organizations/meta/filters").then((r) => setRegions(r.data.regions)); }, []);
  useEffect(() => {
    const t = setTimeout(() => api.get("/discover", { params: { kind, q: q || undefined, region } }).then((r) => setData(r.data)), 200);
    return () => clearTimeout(t);
  }, [kind, q, region]);

  return (
    <div>
      <PageHeader title="Discover" subtitle="Programs, workshops and mentors across the community." />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Input className="sm:col-span-2" placeholder="Search programs, clinics, coaches…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="discover-search" />
        <Select value={region} onChange={(e) => setRegion(e.target.value)} options={[{ value: "all", label: "All regions" }, ...regions]} />
      </div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1"><Tabs tabs={[{ value: "all", label: "All" }, { value: "program", label: "Programs" }, { value: "grant", label: "Grants" }, { value: "mentor", label: "Mentors" }]} value={kind} onChange={setKind} /></div>
        {active && <button className="mb-5 shrink-0 text-xs text-muted underline" onClick={reset}>Clear filters</button>}
      </div>
      {!data ? <Spinner /> : data.counts.total === 0 ? <Empty title="No results" hint="Try a broader search." /> : (
        <div className="space-y-6 lg:space-y-8">
          {/* Mobile: 2-up compact cards per section instead of one full-width card per row — same
              density as the rest of the app's browse pages. Desktop keeps the roomier grid (`hidden lg:grid`). */}
          {data.programs.length > 0 && <section><h2 className="mb-2.5 text-base font-semibold lg:mb-3 lg:text-xl">Programs ({data.programs.length})</h2>
            <div className="grid grid-cols-2 gap-2.5 lg:hidden">{data.programs.map((p) => (
              <Link key={p.id} to={`/organizations/${p.org_slug}`}><Card className="h-full !p-2.5"><p className="truncate text-[10px] text-muted">{p.org_name}</p><p className="truncate text-[13px] font-semibold">{p.name}</p><p className="mt-1 line-clamp-2 text-[11px] text-muted">{p.description}</p>
                <div className="mt-1.5 flex flex-wrap gap-1"><Chip className="!px-1.5 !py-0.5 !text-[9px]">{p.intake_status || "Rolling"}</Chip></div></Card></Link>))}</div>
            <div className="hidden gap-3 lg:grid lg:grid-cols-3">{data.programs.map((p) => (
              <Link key={p.id} to={`/organizations/${p.org_slug}`}><Card className="h-full transition hover:shadow-md"><p className="text-xs text-muted">{p.org_name}</p><p className="font-medium">{p.name}</p><p className="mt-1 line-clamp-2 text-sm text-muted">{p.description}</p>
                <div className="mt-3 flex gap-1"><Chip>{p.intake_status || "Rolling"}</Chip>{p.duration && <Chip>{p.duration}</Chip>}</div></Card></Link>))}</div></section>}
          {data.grants.length > 0 && <section><h2 className="mb-2.5 text-base font-semibold lg:mb-3 lg:text-xl">Grants ({data.grants.length})</h2>
            <div className="grid grid-cols-2 gap-2.5 lg:hidden">{data.grants.map((g) => (
              <Card key={g.id} className="!p-2.5"><p className="truncate text-[13px] font-semibold">{g.name}</p><p className="mt-1 line-clamp-2 text-[11px] text-muted">{g.description}</p>
                {g.amount && <p className="mt-1 truncate text-[11px]">💰 {g.amount}</p>}{g.deadline_label && <p className="truncate text-[10px] text-muted">Due: {g.deadline_label}</p>}
                {g.cta_url && <a className="mt-1 inline-block text-[11px] underline" href={g.cta_url} target="_blank" rel="noreferrer">Details →</a>}</Card>))}</div>
            <div className="hidden gap-3 lg:grid lg:grid-cols-3">{data.grants.map((g) => (
              <Card key={g.id}><p className="font-medium">{g.name}</p><p className="mt-1 line-clamp-2 text-sm text-muted">{g.description}</p>
                {g.amount && <p className="mt-2 text-sm">💰 {g.amount}</p>}{g.deadline_label && <p className="text-xs text-muted">Deadline: {g.deadline_label}</p>}
                {g.cta_url && <a className="mt-2 inline-block text-sm underline" href={g.cta_url} target="_blank" rel="noreferrer">Details →</a>}</Card>))}</div></section>}
          {data.mentors.length > 0 && <section><h2 className="mb-2.5 text-base font-semibold lg:mb-3 lg:text-xl">Mentors ({data.mentors.length})</h2>
            <div className="grid grid-cols-2 gap-2.5 lg:hidden">{data.mentors.map((m) => (
              <Card key={m.slug} className="!p-2.5"><p className="truncate text-[13px] font-semibold">{m.name}</p><p className="truncate text-[10px] text-muted">{m.title}</p><p className="mt-1 line-clamp-2 text-[11px]">{m.bio}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">{m.expertise.slice(0, 2).map((t) => <Chip key={t} className="!px-1.5 !py-0.5 !text-[9px]">{t}</Chip>)}</div></Card>))}</div>
            <div className="hidden gap-3 lg:grid lg:grid-cols-3">{data.mentors.map((m) => (
              <Card key={m.slug}><p className="font-medium">{m.name}</p><p className="text-xs text-muted">{m.title}</p><p className="mt-2 line-clamp-3 text-sm">{m.bio}</p>
                <div className="mt-3 flex flex-wrap gap-1">{m.expertise.slice(0, 3).map((t) => <Chip key={t}>{t}</Chip>)}</div></Card>))}</div></section>}
        </div>
      )}
    </div>
  );
}
