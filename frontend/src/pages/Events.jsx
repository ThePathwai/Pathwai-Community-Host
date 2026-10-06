import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../lib/api";
import { Avatar, Button, Chip, Empty, Field, Input, Modal, PageHeader, PhotoField, Select, Spinner, Tabs, TagInput, Textarea, cx } from "../components/ui";
import { useAuth } from "../lib/auth";
import { ItemTools, TierEditor } from "../components/EditKit";

// "This week" is a rolling 7-day window from right now, not the Mon-Sun calendar week -- simplest
// well-defined reading, and it never disagrees with the list's own date order. "Saved" and "Context"
// read straight off fields the list already carries (is_saved, category), same as every other
// client-side filter bar in the app (see Inbox.jsx's quick/who/context filters).
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Same three-way Going/Maybe/Can't go control as the event's own page (EventDetail.jsx) -- RSVPing
// from the list used to only offer a plain "RSVP" on/off toggle, so picking "Maybe" or "Can't go"
// meant opening the event first. Reusing the one component keeps the options identical everywhere
// you can RSVP, not just worded the same.
import { RsvpButtons } from "./EventDetail";

export default function Events() {
  const [tab, setTab] = useState("upcoming");
  const [items, setItems] = useState(null);
  const load = useCallback(() => api.get("/events", { params: { upcoming: tab === "upcoming" } }).then((r) => setItems(r.data)), [tab]);
  useEffect(() => { setItems(null); load(); }, [load]);

  const { config, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", description: "", starts_at: "", location: "", category: "Meetup", tags: [], image_url: "" });
  const [tiers, setTiers] = useState([]);

  // Filter bar: Saved (bookmarked only) and This week (starts_at in the next 7 days) as toggleable
  // quick pills, plus Context narrowing to one event type. All client-side over the already-loaded
  // `items` list for the active tab, same approach as Inbox.jsx's filter bar.
  const [savedOnly, setSavedOnly] = useState(false);
  const [thisWeek, setThisWeek] = useState(false);
  const [ctx, setCtx] = useState("all");
  const ctxOptions = useMemo(() => {
    const live = (items || []).map((e) => e.category).filter(Boolean);
    const types = Array.from(new Set([...(config?.event_types || []), ...live]));
    return [{ value: "all", label: "Any type" }, ...types.sort().map((t) => ({ value: t, label: t }))];
  }, [items, config]);
  const filtered = useMemo(() => {
    if (!items) return items;
    const now = Date.now();
    return items.filter((e) => (!savedOnly || e.is_saved) && (!thisWeek || (() => { const t = new Date(e.starts_at).getTime(); return t >= now && t <= now + WEEK_MS; })()) && (ctx === "all" || e.category === ctx));
  }, [items, savedOnly, thisWeek, ctx]);
  const filtersActive = savedOnly || thisWeek || ctx !== "all";
  const clearFilters = () => { setSavedOnly(false); setThisWeek(false); setCtx("all"); };
  const rsvp = async (id, status) => {
    try { await api.post(`/events/${id}/rsvp`, { status }); toast.success(status === "yes" ? "You're in" : status ? "RSVP saved" : "RSVP removed"); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  // Bookmarking, same on/off toggle as a perk's save button (Resources.jsx) -- feeds the Saved
  // section of /profile alongside saved perks and saved members.
  const toggleSave = async (id) => { try { await api.post(`/events/${id}/save`); load(); } catch (e) { toast.error(errMsg(e)); } };
  const suggest = async () => {
    try {
      const ticket_tiers = tiers.filter((t) => t.name.trim()).map((t) => ({ name: t.name.trim(), price_cents: Math.round((Number(t.price) || 0) * 100), capacity: Number(t.capacity) > 0 ? Number(t.capacity) : null }));
      await api.post("/events", { ...f, ticket_tiers, starts_at: new Date(f.starts_at).toISOString(), host: user.name });
      toast.success("Event published"); setOpen(false); setF({ ...f, title: "", description: "", image_url: "" }); setTiers([]); load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div>
      {/* Adding an event is admin-only -- members can browse, RSVP and bookmark, but no longer get a
          "Suggest an event" entry point here (see routes/events.py's create_event, which now rejects
          a non-admin POST too). */}
      <PageHeader k="events" title="Events" subtitle="Networking, workshops and wellness sessions." actions={user.role === "admin" ? <Button variant="ghost" onClick={() => setOpen(true)} data-testid="suggest-event">Add an event</Button> : undefined} />
      <Tabs tabs={[{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }]} value={tab} onChange={setTab} />
      {items && items.length > 0 && (
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div className="flex flex-wrap gap-1.5">
            {[["savedOnly", setSavedOnly, savedOnly, "Saved", "event-filter-saved"], ["thisWeek", setThisWeek, thisWeek, "This week", "event-filter-week"]].map(([key, setter, on, label, testid]) => (
              <button key={key} type="button" onClick={() => setter(!on)} data-testid={testid}
                className={cx("rounded-full border px-3 py-1 text-sm", on ? "border-transparent text-onaccent" : "border-line text-muted hover:bg-ink/5")}
                style={on ? { background: "var(--accent)" } : undefined}>{label}</button>
            ))}
          </div>
          <Select className="!w-auto" value={ctx} onChange={(e) => setCtx(e.target.value)} data-testid="event-filter-context" options={ctxOptions} />
          {filtersActive && <button className="text-xs text-muted underline" onClick={clearFilters} data-testid="event-filter-clear">Clear filters</button>}
        </div>
      )}
      {!items ? <Spinner /> : items.length === 0 ? <Empty title={tab === "upcoming" ? "No upcoming games or events yet." : "No past events yet."} hint="Suggest one and the team will review it." /> : filtered.length === 0 ? (
        <Empty title="No events match these filters." hint="Try clearing a filter to see more." />
      ) : (
        <>
          {/* Mobile: 2-up tiles — same density step as Members — built around the mini calendar-day
              chip and the RSVP/ticket action, since date + "can I go" is this page's whole value
              (distinct from Connections' "why" and Perks' savings). Desktop keeps the photo grid
              below (`hidden lg:grid`). */}
          <div className="grid grid-cols-2 gap-2 lg:hidden">
            {filtered.map((e) => {
              const dt = new Date(e.starts_at);
              const soldOut = e.tier_summary?.has_tiers ? e.tier_summary.all_sold_out : e.capacity && e.attendee_count >= e.capacity;
              return (
                <div key={e.id} className="card card-hover !p-2 flex flex-col gap-1" data-testid="event-tile">
                  <div className="flex items-center justify-between gap-1">
                    <ItemTools kind="events" item={e} onChanged={load} />
                    <button onClick={() => toggleSave(e.id)} aria-label="Save" data-testid="event-save-mobile" className="shrink-0 rounded p-0.5 text-muted hover:bg-ink/5"><Bookmark className={`h-3 w-3 ${e.is_saved ? "fill-current" : ""}`} /></button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Link to={`/events/${e.id}`} className="flex w-8 shrink-0 flex-col items-center overflow-hidden rounded-md border border-line" aria-hidden>
                      <span className="w-full bg-ink/[.06] py-px text-center text-[7px] font-semibold uppercase tracking-wide text-muted">{dt.toLocaleDateString(undefined, { month: "short" })}</span>
                      <span className="stat w-full py-px text-center text-[12px] leading-none">{dt.getDate()}</span>
                    </Link>
                    <Link to={`/events/${e.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold leading-tight">{e.title}</p>
                      <p className="truncate text-[9px] text-muted">{e.location} · {e.attendee_count} going</p>
                    </Link>
                  </div>
                  {tab === "upcoming" && e.price_cents && e.my_rsvp !== "yes" ? (
                    <Link className="btn-primary !flex !w-full !items-center !justify-center whitespace-nowrap !px-2 !py-1 !text-[9px]" to={`/events/${e.id}`} data-testid="get-ticket-mobile">{soldOut ? "Sold out" : "Ticket"}</Link>
                  ) : tab === "upcoming" ? (
                    <select data-testid="rsvp-select-mobile" aria-label="RSVP" value={e.my_rsvp || ""} onChange={(ev) => rsvp(e.id, ev.target.value || null)} className="input w-full !rounded-md !border-line !px-1.5 !py-1 !text-[9px] !leading-tight">
                      <option value="">RSVP</option>
                      <option value="yes">Going ✓</option>
                      <option value="maybe">Maybe</option>
                      <option value="no">Can't go</option>
                    </select>
                  ) : (
                    <Link className="btn-ghost !flex !w-full !items-center !justify-center whitespace-nowrap !px-2 !py-1 !text-[9px]" to={`/events/${e.id}`}>Details</Link>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden gap-5 lg:grid lg:grid-cols-2 xl:grid-cols-3">
          {filtered.map((e) => (
            <div key={e.id} className="card card-hover group relative overflow-hidden !p-0" data-testid="event-card">
              <Link to={`/events/${e.id}`} className="relative block h-52 overflow-hidden">
                {e.cover_url ? <img src={e.cover_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="h-full w-full" style={{ background: "var(--accent-grad)" }} />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
                <span className="absolute left-3 top-3 rounded-lg bg-white/90 px-3 py-1.5 text-center text-black shadow"><span className="block text-[10px] font-bold uppercase leading-none tracking-wider text-red-600">{new Date(e.starts_at).toLocaleString("en", { month: "short" })}</span><span className="stat block text-lg leading-tight">{new Date(e.starts_at).getDate()}</span></span>
                <span className="absolute right-3 top-3 flex gap-1.5">{e.tier_summary?.has_tiers ? (e.tier_summary.all_sold_out ? <Chip>Sold out</Chip> : <Chip>{e.tier_summary.min_price_cents === e.tier_summary.max_price_cents ? `$${(e.tier_summary.min_price_cents / 100).toFixed(0)}` : `From $${(e.tier_summary.min_price_cents / 100).toFixed(0)}`}</Chip>) : e.capacity && e.attendee_count >= e.capacity ? <Chip>Sold out</Chip> : e.price_cents ? <Chip>${(e.price_cents / 100).toFixed(0)}</Chip> : <Chip>Free</Chip>}{e.is_virtual && <Chip>Virtual</Chip>}</span>
                <span className="absolute bottom-3 left-4 rounded-md bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">{e.category}</span>
              </Link>
              <div className="p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <ItemTools kind="events" item={e} onChanged={load} className="!mb-0" />
                  <button onClick={() => toggleSave(e.id)} aria-label="Save" data-testid="event-save"><Bookmark className={`h-4 w-4 ${e.is_saved ? "fill-current" : ""}`} /></button>
                </div>
                <h3 className="text-lg font-bold leading-snug"><Link to={`/events/${e.id}`}>{e.title}</Link></h3>
                <p className="mt-1 text-sm text-muted">{fmtDate(e.starts_at)} · {e.location}</p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex -space-x-2">{(e.attendee_preview || []).map((a) => <span key={a.id} className="rounded-full ring-2 ring-[rgb(var(--c-surface))]"><Avatar src={a.avatar_url} name={a.name} size={28} /></span>)}</span>
                    <span className="text-xs text-muted">{e.attendee_count}{e.capacity ? ` / ${e.capacity}` : ""} going</span>
                  </div>
                  {tab === "upcoming" && e.price_cents && e.my_rsvp !== "yes" ? <Link className="btn-primary whitespace-nowrap" to={`/events/${e.id}`} data-testid="get-ticket">{(e.tier_summary?.has_tiers ? e.tier_summary.all_sold_out : e.capacity && e.attendee_count >= e.capacity) ? "Sold out" : e.tier_summary?.has_tiers ? "Get ticket" : `Get ticket · $${(e.price_cents / 100).toFixed(0)}`}</Link> : tab !== "upcoming" ? <Link className="btn-ghost" to={`/events/${e.id}`}>Details</Link> : null}
                </div>
                {/* Its own row, not squeezed next to the avatar stack -- Going/Maybe/Can't go is the
                    same three-way control the event's own page uses (see EventDetail.jsx). */}
                {tab === "upcoming" && !(e.price_cents && e.my_rsvp !== "yes") && <RsvpButtons value={e.my_rsvp} onChange={(v) => rsvp(e.id, v)} className="mt-3" />}
              </div>
            </div>
          ))}
          </div>
        </>
      )}
      {user.role === "admin" && (
        <Modal open={open} onClose={() => setOpen(false)} title="Add an event">
          <div className="space-y-4">
            <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="event-title" /></Field>
            <Field label="Description"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Starts"><Input type="datetime-local" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} /></Field>
              <Field label="Type"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={config?.event_types?.length ? config.event_types : ["Meetup"]} /></Field></div>
            <Field label="Location or link"><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
            <TierEditor tiers={tiers} onChange={setTiers} />
            <PhotoField value={f.image_url} onChange={(v) => setF({ ...f, image_url: v })} label="Cover photo (optional)" />
            <Field label="Tags"><TagInput value={f.tags} onChange={(tags) => setF({ ...f, tags })} /></Field>
            <Button onClick={suggest} disabled={!f.title.trim() || !f.starts_at} data-testid="event-submit">Submit</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
