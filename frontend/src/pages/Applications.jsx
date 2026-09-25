import React, { useEffect, useState } from "react";
import { api, fmtDate } from "../lib/api";
import { Card, Chip, Empty, PageHeader, Spinner } from "../components/ui";

const tone = { approved: "!bg-green-500/10 !text-green-400", pending: "!bg-amber-400/10 !text-amber-300", rejected: "!bg-red-500/10 !text-red-400" };
export default function Applications() {
  const [apps, setApps] = useState(null);
  useEffect(() => { api.get("/me/applications").then((r) => setApps(r.data.applications)); }, []);
  return (
    <div>
      <PageHeader title="My applications" subtitle="Every event series, program and crew you've applied to." />
      {!apps ? <Spinner /> : apps.length === 0 ? <Empty title="No applications yet" hint="Browse event series and programs to apply." /> : (
        <div className="space-y-3">{apps.map((a) => (
          <Card key={a.id} className="flex items-center justify-between">
            <div><p className="font-medium">{a.org_name}{a.program_name ? ` · ${a.program_name}` : ""}</p><p className="text-xs text-muted">Applied {fmtDate(a.created_at, { month: "short", day: "numeric" })}</p></div>
            <Chip className={tone[a.status]}>{a.status}</Chip>
          </Card>))}</div>
      )}
    </div>
  );
}
