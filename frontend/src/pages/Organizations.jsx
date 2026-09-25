import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, Chip, Empty, Input, PageHeader, Select, Spinner } from "../components/ui";

export default function Organizations() {
  const [items, setItems] = useState(null);
  const [meta, setMeta] = useState({ types: [], regions: [] });
  const [q, setQ] = useState(""); const [type, setType] = useState("all"); const [region, setRegion] = useState("all");
  useEffect(() => { api.get("/organizations/meta/filters").then((r) => setMeta(r.data)); }, []);
  useEffect(() => {
    const t = setTimeout(() => api.get("/organizations", { params: { q: q || undefined, type, region } }).then((r) => setItems(r.data.organizations)), 200);
    return () => clearTimeout(t);
  }, [q, type, region]);
  return (
    <div>
      <PageHeader title="Event series & partners" subtitle="Our event series, workshops and the partners who support our members." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Input placeholder="Search organizations…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={type} onChange={(e) => setType(e.target.value)} options={[{ value: "all", label: "All types" }, ...meta.types.map((t) => ({ value: t.value, label: t.label }))]} />
        <Select value={region} onChange={(e) => setRegion(e.target.value)} options={[{ value: "all", label: "All regions" }, ...meta.regions]} />
      </div>
      {!items ? <Spinner /> : items.length === 0 ? <Empty title="No organizations match" /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((o) => (
            <Link key={o.slug} to={`/organizations/${o.slug}`}>
              <Card className="h-full overflow-hidden !p-0 transition hover:shadow-md" data-testid="org-card">
                <div className="h-2" style={{ background: o.accent_color || "#0A0A0A" }} />
                <div className="p-5">
                  <p className="font-medium">{o.name}</p><p className="text-xs text-muted">{o.headquarters}</p>
                  <p className="mt-2 line-clamp-2 text-sm">{o.tagline}</p>
                  <div className="mt-3 flex flex-wrap gap-1"><Chip>{o.type}</Chip>{o.focus_areas.slice(0, 2).map((f) => <Chip key={f}>{f}</Chip>)}</div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
