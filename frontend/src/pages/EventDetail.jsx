import { ItemTools } from "../components/EditKit";
import { useAuth } from "../lib/auth";
import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Bookmark, CalendarPlus, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../lib/api";
import { useLive } from "../lib/live";
import { Avatar, Button, Card, Chip, cx, Field, PageHeader, SectionCard, Select, Spinner, Textarea } from "../components/ui";

export const RsvpButtons = ({ value, onChange, size, className }) => (
  <div className={cx("inline-flex gap-1", className)} role="group" aria-label="RSVP">
    {[["yes", "Going"], ["maybe", "Maybe"], ["no", "Can't go"]].map(([v, l]) => (
      <button key={v} data-testid={`rsvp-${v}`} onClick={() => onChange(value === v ? null : v)}
        className={`rounded-full border px-3 py-1.5 text-sm transition ${value === v ? "border-transparent text-onaccent" : "border-line text-muted hover:bg-ink/5"}`}
        style={value === v ? { background: "var(--accent)" } : undefined}>{l}{value === v && v === "yes" ? " ✓" : ""}</button>))}
  </div>
);

// Opens Google Calendar's "new event" screen with this event already filled in (no sign-in or API needed).
function googleCalUrl(e) {
  const start = new Date(e.starts_at);
  if (isNaN(start)) return "https://calendar.google.com/calendar/r/eventedit";
  let end = e.ends_at ? new Date(e.ends_at) : new Date(start.getTime() + 3600000);
  if (isNaN(end) || end <= start) end = new Date(start.getTime() + 3600000);
  const f = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const q = new URLSearchParams({ action: "TEMPLATE", text: e.title || "Event", dates: `${f(start)}/${f(end)}`, details: `${(e.description || "").slice(0, 600)}\n\n${window.location.href}`.trim(), location: e.location || e.virtual_url || "" });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export default function EventDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [e, setE] = useState(null);
  const [rating, setRating] = useState("5");
  const [note, setNote] = useState("");
  const { user } = useAuth();
  const [sales, setSales] = useState(null);
  const [tierId, setTierId] = useState("");
  const load = useCallback(() => api.get(`/events/${id}`).then((r) => setE(r.data)).catch(() => setE(false)), [id]);
  useEffect(() => { load(); }, [load]);
  useLive(["events"], load);
  useEffect(() => { api.post(`/events/${id}/view`).catch(() => {}); }, [id]);
  useEffect(() => { if (user?.role === "admin" && e && (e.price_cents || e.tier_summary?.has_tiers)) api.get(`/admin/events/${id}/sales`).then((r) => setSales(r.data)).catch(() => {}); }, [user, id, e]);
  useEffect(() => { if (e?.tier_summary?.has_tiers && !tierId) { const first = e.tier_summary.tiers.find((t) => !t.sold_out); if (first) setTierId(first.id); } }, [e]); // eslint-disable-line
  const rsvp = async (status) => { try { await api.post(`/events/${id}/rsvp`, { status }); toast.success(status === "yes" ? "You're in — added to your home page" : status ? "RSVP saved" : "RSVP removed"); load(); } catch (x) { toast.error(errMsg(x)); } };
  const buy = async () => { try { const { data } = await api.post(`/events/${id}/checkout`, e.tier_summary?.has_tiers ? { tier_id: tierId } : {}); if (data.url) window.location.href = data.url; else { toast.success(data.message); load(); } } catch (x) { toast.error(errMsg(x)); } };
  const feedback = async () => { try { await api.post(`/events/${id}/feedback`, { rating: Number(rating), note }); toast.success("Thanks for the feedback"); load(); } catch (x) { toast.error(errMsg(x)); } };
  const toggleSave = async () => { try { await api.post(`/events/${id}/save`); load(); } catch (x) { toast.error(errMsg(x)); } };
  // The hosted preview artifact runs in a sandboxed iframe that blocks every file download it
  // starts itself -- a plain <a href> to a real backend URL would also just 404 there (there's no
  // backend to hit), so a live link is doubly broken in that context. Same honesty as the
  // chat/extract-pdf preview fallbacks: say so instead of silently failing.
  const PREVIEW = process.env.REACT_APP_PREVIEW === "true";
  const addToCalendar = (ev) => { if (PREVIEW) { ev.preventDefault(); toast.message("Downloads aren't available in this preview — this opens a real .ics file in the deployed app."); } };
  if (e === null) return <Spinner />;
  if (e === false) return <div className="py-20 text-center"><p className="font-display text-xl">This link is not available.</p></div>;
  return (
    <div>
      <PageHeader title={e.title} subtitle={`${fmtDate(e.starts_at)} · ${e.location || (e.virtual_url ? "Virtual" : "")} · hosted by ${e.host || "The Playr League"}`}
        actions={<><ItemTools kind="events" item={e} onChanged={load} /><button className="btn-ghost" onClick={toggleSave} aria-label="Save" data-testid="event-detail-save"><Bookmark className={`h-4 w-4 ${e.is_saved ? "fill-current" : ""}`} />{e.is_saved ? "Saved" : "Save"}</button><a className="btn-ghost" href={googleCalUrl(e)} target="_blank" rel="noreferrer" data-testid="add-to-google-calendar"><CalendarPlus className="h-4 w-4" />Google Calendar</a><a className="btn-ghost" href={`${api.defaults.baseURL}/events/${e.id}/ics`} onClick={addToCalendar} data-testid="add-to-calendar"><CalendarPlus className="h-4 w-4" />Apple / Outlook</a></>} />
      {e.cover_url && (
        <div className="mb-6 overflow-hidden rounded-xl2 border border-line bg-ink/5" data-testid="event-cover">
          <img src={e.cover_url} alt={e.title} className="aspect-[16/10] w-full object-cover sm:aspect-[21/9] sm:max-h-[420px]" />
        </div>)}
      <div className="mb-6 flex flex-wrap items-center gap-3"><Chip>{e.category}</Chip>
        {e.is_past ? <Chip>Past event</Chip> : e.tier_summary?.has_tiers ? null : e.price_cents && e.my_rsvp !== "yes" ? (e.capacity && e.attendee_count >= e.capacity ? <Chip>Sold out</Chip> : <Button onClick={buy} data-testid="buy-ticket">Buy ticket · ${(e.price_cents / 100).toFixed(2)}</Button>) : e.source === "luma" && e.url && e.my_rsvp !== "yes" ? <a className="btn-primary" href={e.url} target="_blank" rel="noreferrer" data-testid="luma-register">Register on Luma</a> : <RsvpButtons value={e.my_rsvp} onChange={rsvp} />}
        <span className="text-sm text-muted">{e.attendee_count}{e.capacity ? ` / ${e.capacity}` : ""} going{e.maybe_count ? ` · ${e.maybe_count} maybe` : ""}</span>
        {e.virtual_url && e.my_rsvp === "yes" && <a className="btn-ghost" href={e.virtual_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Join link</a>}</div>
      {!e.is_past && e.tier_summary?.has_tiers && e.my_rsvp !== "yes" && (
        <SectionCard title="Choose a ticket" className="mb-6">
          <div className="space-y-2" role="radiogroup" aria-label="Ticket tiers" data-testid="tier-picker">
            {e.tier_summary.tiers.map((t) => (
              <label key={t.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm ${t.sold_out ? "cursor-not-allowed opacity-50" : tierId === t.id ? "border-ink" : "border-line hover:bg-ink/5"}`}>
                <span className="flex items-center gap-2"><input type="radio" className="accent-accent" name="tier" disabled={t.sold_out} checked={tierId === t.id} onChange={() => setTierId(t.id)} data-testid={`tier-${t.id}`} /><span className="font-medium">{t.name}</span>{t.capacity != null && <span className="text-xs text-muted">{t.sold}/{t.capacity}</span>}</span>
                <span className="font-semibold">{t.sold_out ? "Sold out" : `$${(t.price_cents / 100).toFixed(2)}`}</span>
              </label>))}
          </div>
          <Button className="mt-3" onClick={buy} disabled={!tierId} data-testid="buy-ticket">Buy ticket</Button>
        </SectionCard>)}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <SectionCard title="About"><p className="whitespace-pre-wrap text-sm leading-relaxed">{e.description}</p></SectionCard>
          {e.agenda?.length > 0 && <SectionCard title="Agenda"><ol className="space-y-2 text-sm">{e.agenda.map((a, i) => <li key={i} className="flex gap-3"><span className="text-muted">{String(i + 1).padStart(2, "0")}</span>{a}</li>)}</ol></SectionCard>}
          {e.prep && <SectionCard title="How to prepare"><p className="text-sm">{e.prep}</p></SectionCard>}
          {e.is_past && e.my_rsvp === "yes" && !e.feedback_given && (
            <SectionCard title="How was it?"><div className="space-y-3"><Field label="Rating"><Select value={rating} onChange={(x) => setRating(x.target.value)} options={["5", "4", "3", "2", "1"]} /></Field>
              <Field label="Anything we should know?"><Textarea value={note} onChange={(x) => setNote(x.target.value)} /></Field><Button onClick={feedback}>Send feedback</Button></div></SectionCard>)}
        </div>
        <div className="space-y-5">
          {sales && (
            <SectionCard title="Ticket sales">
              <div className="grid grid-cols-3 gap-3 text-center" data-testid="ticket-sales">
                <div><p className="stat font-display text-2xl">{sales.sold}{sales.capacity ? <span className="text-sm text-muted"> / {sales.capacity}</span> : null}</p><p className="text-xs text-muted">Sold</p></div>
                <div><p className="stat font-display text-2xl">${(sales.revenue_cents / 100).toFixed(0)}</p><p className="text-xs text-muted">Revenue</p></div>
                <div><p className="stat font-display text-2xl">{sales.traffic.conversion_rate != null ? `${(sales.traffic.conversion_rate * 100).toFixed(0)}%` : "—"}</p><p className="text-xs text-muted">Conversion</p></div>
              </div>
              {!sales.stripe_connected && <p className="mt-3 rounded-lg border border-line p-2 text-xs text-muted">Stripe isn't connected yet, so members can't buy. Set it up under Admin → Integrations.</p>}
              {sales.tiers.length > 0 && (
                <div className="mt-4 space-y-1.5" data-testid="tier-sales">
                  {sales.tiers.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>{t.name}{t.sold_out && <span className="ml-1.5 text-xs text-muted">· sold out</span>}</span>
                      <span className="text-muted">{t.sold}{t.capacity != null ? `/${t.capacity}` : ""} · ${(t.revenue_cents / 100).toFixed(0)}</span>
                    </div>))}
                </div>)}
              {sales.orders.length > 0 && <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">{sales.orders.slice(0, 6).map((o) => <li key={o.id} className="flex justify-between gap-2"><span>{o.name}{o.tier_name ? <span className="text-muted"> · {o.tier_name}</span> : ""}</span><span className="text-muted">${((o.amount || 0) / 100).toFixed(2)}{o.demo ? " · demo" : ""}</span></li>)}</ul>}
            </SectionCard>)}
          {sales && (
            <SectionCard title="Traffic">
              <div className="grid grid-cols-3 gap-3 text-center" data-testid="event-traffic">
                <div><p className="stat font-display text-2xl">{sales.traffic.views}</p><p className="text-xs text-muted">Page views</p></div>
                <div><p className="stat font-display text-2xl">{sales.traffic.unique_viewers}</p><p className="text-xs text-muted">Unique visitors</p></div>
                <div><p className="stat font-display text-2xl">{sales.traffic.anonymous_views}</p><p className="text-xs text-muted">Not signed in</p></div>
              </div>
            </SectionCard>)}
          {e.related_resources?.length > 0 && <SectionCard title="Related resources"><ul className="space-y-2 text-sm">{e.related_resources.map((r) => <li key={r.id}><a className="underline" href={r.url} target="_blank" rel="noreferrer">{r.title}</a></li>)}</ul></SectionCard>}
          <SectionCard title="Who's going">{e.attendees.length === 0 ? <p className="text-sm text-muted">Be the first to RSVP.</p> : <div className="space-y-2">{e.attendees.slice(0, 8).map((a) => <Link key={a.id} to={`/members/${a.id}`} className="flex items-center gap-2 text-sm hover:underline"><Avatar src={a.avatar_url} name={a.name} size={28} />{a.name}</Link>)}</div>}</SectionCard>
        </div>
      </div>
    </div>
  );
}
