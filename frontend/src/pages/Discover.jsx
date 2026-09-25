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
      <Tabs tabs={[{ value: "all", label: "All" }, { value: "program", label: "Programs" }, { value: "grant", label: "Grants" }, { value: "mentor", label: "Mentors" }]} value={kind} onChange={setKind} />
      {!data ? <Spinner /> : data.counts.total === 0 ? <Empty title="No results" hint="Try a broader search." /> : (
        <div className="space-y-8">
          {data.programs.length > 0 && <section><h2 className="mb-3 text-xl font-semibold">Programs ({data.programs.length})</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.programs.map((p) => (
              <Link key={p.id} to={`/organizations/${p.org_slug}`}><Card className="h-full transition hover:shadow-md"><p className="text-xs text-muted">{p.org_name}</p><p className="font-medium">{p.name}</p><p className="mt-1 line-clamp-2 text-sm text-muted">{p.description}</p>
                <div className="mt-3 flex gap-1"><Chip>{p.intake_status || "Rolling"}</Chip>{p.duration && <Chip>{p.duration}</Chip>}</div></Card></Link>))}</div></section>}
          {data.grants.length > 0 && <section><h2 className="mb-3 text-xl font-semibold">Grants ({data.grants.length})</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.grants.map((g) => (
              <Card key={g.id}><p className="font-medium">{g.name}</p><p className="mt-1 line-clamp-2 text-sm text-muted">{g.description}</p>
                {g.amount && <p className="mt-2 text-sm">💰 {g.amount}</p>}{g.deadline_label && <p className="text-xs text-muted">Deadline: {g.deadline_label}</p>}
                {g.cta_url && <a className="mt-2 inline-block text-sm underline" href={g.cta_url} target="_blank" rel="noreferrer">Details →</a>}</Card>))}</div></section>}
          {data.mentors.length > 0 && <section><h2 className="mb-3 text-xl font-semibold">Mentors ({data.mentors.length})</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.mentors.map((m) => (
              <Card key={m.slug}><p className="font-medium">{m.name}</p><p className="text-xs text-muted">{m.title}</p><p className="mt-2 line-clamp-3 text-sm">{m.bio}</p>
                <div className="mt-3 flex flex-wrap gap-1">{m.expertise.slice(0, 3).map((t) => <Chip key={t}>{t}</Chip>)}</div></Card>))}</div></section>}
        </div>
      )}
    </div>
  );
}
