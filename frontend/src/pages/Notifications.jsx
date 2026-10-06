import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, timeAgo } from "../lib/api";
import DesktopAlerts from "../components/DesktopAlerts";
import { Button, Card, Empty, PageHeader, Spinner } from "../components/ui";

export default function Notifications() {
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const load = () => api.get("/notifications").then((r) => setD(r.data));
  useEffect(() => { load(); }, []);
  const readAll = async () => { await api.post("/notifications/read", {}); load(); };
  const del = async (id) => { await api.delete(`/notifications/${id}`); load(); };
  return (
    <div>
      <PageHeader title="Notifications" subtitle={d ? `${d.unread} unread` : ""} actions={<Button variant="ghost" onClick={readAll}>Mark all read</Button>} />
      <div className="mb-3"><DesktopAlerts compact /></div>
      {!d ? <Spinner /> : d.notifications.length === 0 ? <Empty title="You're all caught up" hint="New requests, matches and event reminders will show up here." /> : (
        <div className="space-y-2">{d.notifications.map((n) => (
          <Card key={n.id} className={`flex cursor-pointer items-start justify-between gap-3 ${n.read ? "opacity-70" : "!border-ink"}`} onClick={async () => { await api.post("/notifications/read", { ids: [n.id] }); if (n.link) nav(n.link); else load(); }}>
            <div><p className="font-medium">{n.title}</p><p className="text-sm text-muted">{n.body}</p><p className="mt-1 text-xs text-muted">{timeAgo(n.created_at)}{n.link && <> · <Link className="underline" to={n.link}>Open</Link></>}</p></div>
            <button className="text-xs text-muted hover:text-ink" onClick={(e) => { e.stopPropagation(); del(n.id); }}>Dismiss</button>
          </Card>))}</div>
      )}
    </div>
  );
}
