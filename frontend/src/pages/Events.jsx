import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../lib/api";
import { Avatar, Button, Chip, Empty, Field, Input, Modal, PageHeader, PhotoField, Select, Spinner, Tabs, TagInput, Textarea } from "../components/ui";
import { useAuth } from "../lib/auth";
import { ItemTools } from "../components/EditKit";

function TierEditor({ tiers, onChange }) {
  const set = (i, patch) => onChange(tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <div className="space-y-2 rounded-lg border border-line p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Ticket tiers</p>
      {tiers.length === 0 && <p className="text-xs text-muted">No tiers yet — this event is free.</p>}
      {tiers.map((t, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <Input placeholder="Tier name (e.g. Early bird)" value={t.name} onChange={(e) => set(i, { name: e.target.value })} data-testid={`tier-name-${i}`} />
          <Input placeholder="Price $" type="number" min="0" step="0.01" value={t.price} onChange={(e) => set(i, { price: e.target.value })} data-testid={`tier-price-${i}`} />
          <Input placeholder="Capacity" type="number" min="1" value={t.capacity} onChange={(e) => set(i, { capacity: e.target.value })} data-testid={`tier-capacity-${i}`} />
          <button type="button" className="p-2 text-muted hover:text-ink" onClick={() => onChange(tiers.filter((_, j) => j !== i))} aria-label="Remove tier"><Trash2 className="h-4 w-4" /></button>
        </div>))}
      <Button type="button" variant="ghost" onClick={() => onChange([...tiers, { name: tiers.length ? "" : "General admission", price: "", capacity: "" }])} data-testid="add-tier">Add a tier</Button>
      <p className="text-xs text-muted">Leave capacity blank for unlimited. Add more than one tier for things like Early bird vs GA vs VIP.</p>
    </div>
  );
}

export default function Events() {
  const [tab, setTab] = useState("upcoming");
  const [items, setItems] = useState(null);
  const load = useCallback(() => api.get("/events", { params: { upcoming: tab === "upcoming" } }).then((r) => setItems(r.data)), [tab]);
  useEffect(() => { setItems(null); load(); }, [load]);

  const { config, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", description: "", starts_at: "", location: "", category: "Meetup", tags: [], image_url: "" });
  const [tiers, setTiers] = useState([]);
  const rsvp = async (id, status) => {
    try { await api.post(`/events/${id}/rsvp`, { status }); toast.success(status === "yes" ? "You're in" : status ? "RSVP saved" : "RSVP removed"); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  const suggest = async () => {
    try {
      const ticket_tiers = user.role === "admin" ? tiers.filter((t) => t.name.trim()).map((t) => ({ name: t.name.trim(), price_cents: Math.round((Number(t.price) || 0) * 100), capacity: Number(t.capacity) > 0 ? Number(t.capacity) : null })) : [];
      const { data } = await api.post("/events", { ...f, ticket_tiers, starts_at: new Date(f.starts_at).toISOString(), host: user.name });
      toast.success(data.status === "pending" ? "Sent to the team for approval" : "Event published"); setOpen(false); setF({ ...f, title: "", description: "", image_url: "" }); setTiers([]); load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div>
      <PageHeader k="events" title="Events" subtitle="Networking, workshops and wellness sessions." actions={<Button variant="ghost" onClick={() => setOpen(true)} data-testid="suggest-event">{user.role === "admin" ? "Add an event" : "Suggest an event"}</Button>} />
      <Tabs tabs={[{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }]} value={tab} onChange={setTab} />
      {!items ? <Spinner /> : items.length === 0 ? <Empty title={tab === "upcoming" ? "No upcoming games or events yet." : "No past events yet."} hint="Suggest one and the team will review it." /> : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((e) => (
            <div key={e.id} className="card card-hover group relative overflow-hidden !p-0" data-testid="event-card">
              <Link to={`/events/${e.id}`} className="relative block h-52 overflow-hidden">
                {e.cover_url ? <img src={e.cover_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="h-full w-full" style={{ background: "var(--accent-grad)" }} />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
                <span className="absolute left-3 top-3 rounded-lg bg-white/90 px-3 py-1.5 text-center text-black shadow"><span className="block text-[10px] font-bold uppercase leading-none tracking-wider text-red-600">{new Date(e.starts_at).toLocaleString("en", { month: "short" })}</span><span className="stat block text-lg leading-tight">{new Date(e.starts_at).getDate()}</span></span>
                <span className="absolute right-3 top-3 flex gap-1.5">{e.tier_summary?.has_tiers ? (e.tier_summary.all_sold_out ? <Chip>Sold out</Chip> : <Chip>{e.tier_summary.min_price_cents === e.tier_summary.max_price_cents ? `$${(e.tier_summary.min_price_cents / 100).toFixed(0)}` : `From $${(e.tier_summary.min_price_cents / 100).toFixed(0)}`}</Chip>) : e.capacity && e.attendee_count >= e.capacity ? <Chip>Sold out</Chip> : e.price_cents ? <Chip>${(e.price_cents / 100).toFixed(0)}</Chip> : <Chip>Free</Chip>}{e.is_virtual && <Chip>Virtual</Chip>}</span>
                <span className="absolute bottom-3 left-4 rounded-md bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">{e.category}</span>
              </Link>
              <div className="p-5">
                <ItemTools kind="events" item={e} onChanged={load} className="mb-3" />
                <h3 className="text-lg font-bold leading-snug"><Link to={`/events/${e.id}`}>{e.title}</Link></h3>
                <p className="mt-1 text-sm text-muted">{fmtDate(e.starts_at)} · {e.location}</p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex -space-x-2">{(e.attendee_preview || []).map((a) => <span key={a.id} className="rounded-full ring-2 ring-[rgb(var(--c-surface))]"><Avatar src={a.avatar_url} name={a.name} size={28} /></span>)}</span>
                    <span className="text-xs text-muted">{e.attendee_count}{e.capacity ? ` / ${e.capacity}` : ""} going</span>
                  </div>
                  {tab === "upcoming" && e.price_cents && e.my_rsvp !== "yes" ? <Link className="btn-primary whitespace-nowrap" to={`/events/${e.id}`} data-testid="get-ticket">{(e.tier_summary?.has_tiers ? e.tier_summary.all_sold_out : e.capacity && e.attendee_count >= e.capacity) ? "Sold out" : e.tier_summary?.has_tiers ? "Get ticket" : `Get ticket · $${(e.price_cents / 100).toFixed(0)}`}</Link> : tab === "upcoming" ? <button data-testid="rsvp-toggle" className={e.my_rsvp === "yes" ? "btn-ghost whitespace-nowrap" : "btn-primary whitespace-nowrap"} onClick={() => rsvp(e.id, e.my_rsvp === "yes" ? null : "yes")}>{e.my_rsvp === "yes" ? "Going ✓" : "RSVP"}</button> : <Link className="btn-ghost" to={`/events/${e.id}`}>Details</Link>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Suggest an event">
        <div className="space-y-4">
          <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="event-title" /></Field>
          <Field label="Description"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Starts"><Input type="datetime-local" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} /></Field>
            <Field label="Type"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={config?.event_types?.length ? config.event_types : ["Meetup"]} /></Field></div>
          <Field label="Location or link"><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
          {user.role === "admin" && <TierEditor tiers={tiers} onChange={setTiers} />}
          <PhotoField value={f.image_url} onChange={(v) => setF({ ...f, image_url: v })} label="Cover photo (optional)" />
          <Field label="Tags"><TagInput value={f.tags} onChange={(tags) => setF({ ...f, tags })} /></Field>
          <p className="text-xs text-muted">{user.role === "admin" ? "Admins publish immediately." : "The Playr League team reviews suggestions before they go live."}</p>
          <Button onClick={suggest} disabled={!f.title.trim() || !f.starts_at} data-testid="event-submit">Submit</Button>
        </div>
      </Modal>
    </div>
  );
}
