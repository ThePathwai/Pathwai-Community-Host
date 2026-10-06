import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Mail, Users } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, timeAgo } from "../lib/api";
import { useAuth } from "../lib/auth";
import { SUGGEST } from "../lib/profile";
import crowd from "../assets/crowd.jpg";
import { Avatar, AvatarUpload, Button, Field, Input, Modal, PhotoGallery, PoweredBy, Select, Spinner, TagInput, Textarea, Wordmark, cx } from "../components/ui";
import HubPeople from "../components/HubPeople";

const RADIUS = { sharp: "2px", soft: "0.75rem", round: "1.25rem" };

// Each community card is drawn in that community's own colours, fonts and shape, so the hub shows how different they are.
function CommunityCard({ c, onEnter, onApply, onView }) {
  const col = c.brand?.colors || {};
  const r = RADIUS[c.brand?.radius] || RADIUS.soft;
  const btn = c.brand?.button_shape === "pill" ? "9999px" : c.brand?.button_shape === "square" ? "2px" : "0.5rem";
  const st = c.my?.status;
  return (
    <article className="flex cursor-pointer flex-col overflow-hidden border transition hover:-translate-y-0.5 hover:shadow-lg" data-testid={`community-${c.slug}`} onClick={() => onView(c)} style={{ background: col.surface || col.background, color: col.text, borderColor: col.border, borderRadius: r, fontFamily: `"${c.brand?.font}", system-ui, sans-serif` }}>
      <div className="relative h-32" style={{ background: col.background }}>
        {c.cover && <img src={c.cover} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${col.surface || col.background}, transparent 70%)` }} />
        {c.brand?.logo_url && <img src={c.brand.logo_url} alt="" className="absolute left-4 top-4 h-10 w-auto max-w-[8rem] object-contain" />}
        <span className="absolute right-3 top-3 px-2.5 py-1 text-[10px] font-bold uppercase" style={{ background: col.accent, color: col.on_accent || "#fff", borderRadius: btn, letterSpacing: "0.12em" }}>{c.kind}</span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-xl font-bold leading-tight" style={{ fontFamily: `"${c.brand?.heading_font}", serif` }}>{c.name}</h3>
        <p className="mt-1 text-sm" style={{ color: col.muted }}>{c.tagline}</p>
        <p className="mt-3 line-clamp-3 text-sm" style={{ color: col.text, opacity: 0.85 }}>{c.about}</p>
        <p className="mt-3 text-xs" style={{ color: col.muted }}>{c.members} members · {c.upcoming_events} upcoming events{c.country ? ` · ${c.country}` : ""}</p>
        {c.interest_tags?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">{c.interest_tags.map((t) => (
            <span key={t} className="px-2 py-0.5 text-[10px] font-medium" style={{ background: col.background, color: col.muted, borderRadius: btn, border: `1px solid ${col.border}` }}>{t}</span>
          ))}</div>
        )}
        <div className="mt-auto pt-5">
          {st === "approved" ? (
            <div className="flex items-center justify-between gap-3">
              <button className="px-5 py-2.5 text-sm font-semibold" data-testid={`enter-${c.slug}`} onClick={(e) => { e.stopPropagation(); onEnter(c); }} style={{ background: col.accent, color: col.on_accent || "#fff", borderRadius: btn }}>Enter</button>
              {c.my.role === "admin" && <span className="text-xs font-semibold" style={{ color: col.accent }}>{c.my.platform_admin ? "Platform admin" : "Admin"}{c.pending_requests ? ` · ${c.pending_requests} new request${c.pending_requests > 1 ? "s" : ""}` : ""}</span>}
            </div>
          ) : st === "pending" ? (
            <div className="flex items-center gap-2 text-sm" data-testid={`pending-${c.slug}`}><span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" /><span style={{ color: col.text }}>Request under review</span><span className="text-xs" style={{ color: col.muted }}>· sent {timeAgo(c.my.requested_at)}</span></div>
          ) : st === "rejected" ? (
            <p className="text-sm" style={{ color: col.muted }}>Your request wasn't approved.</p>
          ) : (
            <button className="border px-5 py-2.5 text-sm font-semibold" data-testid={`apply-${c.slug}`} onClick={(e) => { e.stopPropagation(); onApply(c); }} style={{ borderColor: col.accent, color: col.accent, borderRadius: btn }}>Request to join</button>
          )}
        </div>
      </div>
    </article>
  );
}

// Mobile-only stand-in for CommunityCard (see the grid split below) — a dense, portrait grid tile
// closer to an Instagram grid / Airbnb search grid than an editorial card, so someone in several
// communities can scan all of them without much scrolling. Always opens the detail modal on tap
// (never acts immediately) since there's no room on a tile this small for a real action button.
function CommunityTile({ c, onView }) {
  const col = c.brand?.colors || {};
  const st = c.my?.status;
  return (
    <article className="relative aspect-[4/5] cursor-pointer overflow-hidden rounded-xl border" data-testid={`community-tile-${c.slug}`} onClick={() => onView(c)}
      style={{ background: col.background || "rgb(var(--c-ink) / 0.06)", borderColor: col.border || "transparent" }}>
      {c.cover ? <img src={c.cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
        : <div className="absolute inset-0 flex items-center justify-center" style={{ background: col.accent ? `linear-gradient(135deg, ${col.accent}, ${col.background || "#000"})` : undefined }}>
            {c.brand?.logo_url && <img src={c.brand.logo_url} alt="" className="h-10 w-auto max-w-[70%] object-contain opacity-90" />}
          </div>}
      <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,.85), rgba(0,0,0,.05) 55%)" }} />
      {c.brand?.logo_url && c.cover && <img src={c.brand.logo_url} alt="" className="absolute left-2 top-2 h-5 w-auto max-w-[45%] object-contain drop-shadow" />}
      {st === "approved" && c.my.role === "admin" && c.pending_requests > 0 && (
        <span className="absolute right-2 top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white" data-testid={`tile-badge-${c.slug}`}>{c.pending_requests}</span>
      )}
      {st === "pending" && <span className="absolute right-2 top-2 h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" aria-hidden />}
      <div className="absolute inset-x-0 bottom-0 p-2.5 text-white">
        <p className="truncate text-[13px] font-bold leading-tight">{c.name}</p>
        <p className="truncate text-[11px] text-white/70">
          {st === "approved" ? (c.my.role === "admin" ? (c.my.platform_admin ? "Platform admin" : "Admin") : `${c.members} members`)
            : st === "pending" ? "Request sent"
            : st === "rejected" ? "Not approved"
            : c.kind}
        </p>
      </div>
    </article>
  );
}

// Opened by clicking a CommunityCard (its Enter/Request-to-join buttons still act immediately without
// opening this). Shows the same info as the card, uncropped, plus the same status-dependent action —
// styled in that community's own brand, exactly like the card is, so it doesn't feel like a generic modal.
function CommunityDetailModal({ c, onClose, onEnter, onApply }) {
  if (!c) return null;
  const col = c.brand?.colors || {};
  const r = RADIUS[c.brand?.radius] || RADIUS.soft;
  const btn = c.brand?.button_shape === "pill" ? "9999px" : c.brand?.button_shape === "square" ? "2px" : "0.5rem";
  const st = c.my?.status;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose} data-testid="community-detail">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl2" onClick={(e) => e.stopPropagation()}
        style={{ background: col.surface || col.background, color: col.text, borderRadius: r, fontFamily: `"${c.brand?.font}", system-ui, sans-serif` }}>
        <div className="relative h-44 sm:h-56" style={{ background: col.background }}>
          {c.cover && <img src={c.cover} alt="" className="absolute inset-0 h-full w-full object-cover" />}
          <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${col.surface || col.background}, transparent 60%)` }} />
          {c.brand?.logo_url && <img src={c.brand.logo_url} alt="" className="absolute left-5 top-5 h-12 w-auto max-w-[9rem] object-contain" />}
          <button onClick={onClose} aria-label="Close" data-testid="close-community-detail" className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/60">✕</button>
        </div>
        <div className="p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold leading-tight" style={{ fontFamily: `"${c.brand?.heading_font}", serif` }}>{c.name}</h2>
            <span className="shrink-0 px-2.5 py-1 text-[10px] font-bold uppercase" style={{ background: col.accent, color: col.on_accent || "#fff", borderRadius: btn, letterSpacing: "0.12em" }}>{c.kind}</span>
          </div>
          <p className="mt-1 text-sm" style={{ color: col.muted }}>{c.tagline}</p>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: col.text, opacity: 0.85 }}>{c.about || "No description yet."}</p>
          <p className="mt-4 text-xs" style={{ color: col.muted }}>{c.members} members · {c.upcoming_events} upcoming events{c.country ? ` · ${c.country}` : ""}</p>
          {c.interest_tags?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">{c.interest_tags.map((t) => (
              <span key={t} className="px-2 py-0.5 text-[10px] font-medium" style={{ background: col.background, color: col.muted, borderRadius: btn, border: `1px solid ${col.border}` }}>{t}</span>
            ))}</div>
          )}
          <div className="mt-6">
            {st === "approved" ? (
              <div className="flex items-center justify-between gap-3">
                <button className="px-5 py-2.5 text-sm font-semibold" data-testid="detail-enter" onClick={() => onEnter(c)} style={{ background: col.accent, color: col.on_accent || "#fff", borderRadius: btn }}>Enter</button>
                {c.my.role === "admin" && <span className="text-xs font-semibold" style={{ color: col.accent }}>{c.my.platform_admin ? "Platform admin" : "Admin"}{c.pending_requests ? ` · ${c.pending_requests} new request${c.pending_requests > 1 ? "s" : ""}` : ""}</span>}
              </div>
            ) : st === "pending" ? (
              <div className="flex items-center gap-2 text-sm" data-testid="detail-pending"><span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" /><span style={{ color: col.text }}>Request under review</span><span className="text-xs" style={{ color: col.muted }}>· sent {timeAgo(c.my.requested_at)}</span></div>
            ) : st === "rejected" ? (
              <p className="text-sm" style={{ color: col.muted }}>Your request wasn't approved.</p>
            ) : (
              <button className="border px-5 py-2.5 text-sm font-semibold" data-testid="detail-apply" onClick={() => onApply(c)} style={{ borderColor: col.accent, color: col.accent, borderRadius: btn }}>Request to join</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// The standard profile saved once on the account (not per community — see BuildProfileStep in
// Signup.jsx) — reused here so it can be revisited any time from the hub, not just right after signup.
function AccountProfileForm({ f, setF, photo, setPhoto }) {
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setContact = (k) => (e) => setF({ ...f, contact: { ...f.contact, [k]: e.target.value } });
  return (
    <div className="space-y-4">
      <AvatarUpload photo={photo} onChange={setPhoto} name={f.name} testId="account-profile-photo-upload" />
      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <Field label="Name"><Input data-testid="account-profile-name" value={f.name} onChange={set("name")} required minLength={2} maxLength={120} /></Field>
        <Field label="Age"><Input data-testid="account-profile-age" type="number" min={13} max={120} value={f.age} onChange={set("age")} placeholder="e.g. 29" /></Field>
      </div>
      <Field label="What do you do?"><Input value={f.title} onChange={set("title")} placeholder="e.g. Physiotherapist, teacher, chef" maxLength={120} /></Field>
      <Field label="Employer or school"><Input value={f.company} onChange={set("company")} maxLength={120} /></Field>
      <Field label="Neighbourhood or city"><Input value={f.location} onChange={set("location")} maxLength={120} /></Field>
      <Field label="About you"><Textarea rows={3} value={f.bio} onChange={set("bio")} maxLength={1000} /></Field>
      <PhotoGallery value={f.photos} onChange={(v) => setF({ ...f, photos: v })} />
      <Field label="Skills"><TagInput value={f.skill_set} suggestions={SUGGEST.skill_set} onChange={(v) => setF({ ...f, skill_set: v })} /></Field>
      <Field label="Interests"><TagInput value={f.interests_hobbies} suggestions={SUGGEST.interests_hobbies} onChange={(v) => setF({ ...f, interests_hobbies: v })} /></Field>
      <Field label="Goals"><TagInput value={f.goals} suggestions={SUGGEST.goals} onChange={(v) => setF({ ...f, goals: v })} /></Field>
      <Field label="Support needed"><TagInput value={f.support_needs} suggestions={SUGGEST.support_needs} onChange={(v) => setF({ ...f, support_needs: v })} /></Field>
      <div>
        <p className="label">Contact info <span className="font-normal normal-case text-muted">(optional — shown to members you're connected with)</span></p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Input placeholder="Phone" value={f.contact.phone} onChange={setContact("phone")} />
          <Input type="url" placeholder="LinkedIn" value={f.contact.linkedin} onChange={setContact("linkedin")} />
          <Input placeholder="Instagram (@you)" value={f.contact.instagram} onChange={setContact("instagram")} />
          <Input type="url" placeholder="Website" value={f.contact.website} onChange={setContact("website")} />
        </div>
      </div>
    </div>
  );
}

const BLANK_PROFILE = { name: "", age: "", title: "", company: "", location: "", bio: "", skill_set: [], interests_hobbies: [], goals: [], support_needs: [],
  photos: [], contact: { phone: "", linkedin: "", instagram: "", website: "" } };

// The "Messages centre" from the Hub page: one merged inbox across every community you've joined
// (GET /hub/messages already does the merging/sorting server-side -- see routes/hub.py), filterable
// by community and by unread. Replying, deleting and reporting all need that community's own session
// (get_current_user), which this platform-level page doesn't carry, so opening a thread here enters
// that community first (same as clicking its card) and lands straight on the thread itself.
function HubInbox({ open, onClose, loading, data, communities, onOpenThread }) {
  const [quick, setQuick] = useState("all"); // all | unread
  const [slugFilter, setSlugFilter] = useState("all");
  const bySlug = useMemo(() => Object.fromEntries((communities || []).map((c) => [c.slug, c])), [communities]);
  const threads = useMemo(() => data?.threads || [], [data]);
  const present = useMemo(() => Array.from(new Set(threads.map((t) => t.community_slug))), [threads]);
  const filtered = threads.filter((t) => (quick !== "unread" || t.unread) && (slugFilter === "all" || t.community_slug === slugFilter));
  useEffect(() => { if (!open) { setQuick("all"); setSlugFilter("all"); } }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[8vh]" onClick={onClose} data-testid="hub-inbox">
      <div className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-xl2 bg-[rgb(var(--c-surface))] text-ink" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="text-lg font-bold">Messages</h2>
          <button onClick={onClose} aria-label="Close" data-testid="close-hub-inbox" className="text-muted hover:text-ink">✕</button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="flex gap-1.5">
            {[["all", "All"], ["unread", "Unread"]].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setQuick(v)} data-testid={`hub-inbox-quick-${v}`}
                className={cx("rounded-full border px-3 py-1 text-xs", quick === v ? "border-transparent text-onaccent" : "border-line text-muted hover:bg-ink/5")}
                style={quick === v ? { background: "var(--accent)" } : undefined}>{l}</button>
            ))}
          </div>
          {present.length > 1 && (
            <Select className="!w-auto !text-xs" value={slugFilter} onChange={(e) => setSlugFilter(e.target.value)} data-testid="hub-inbox-community-filter"
              options={[{ value: "all", label: "Every community" }, ...present.map((s) => ({ value: s, label: bySlug[s]?.name || s }))]} />
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? <div className="p-10"><Spinner /></div> : filtered.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted">{threads.length === 0 ? "No messages yet, in any of your communities." : "No messages match these filters."}</p>
          ) : filtered.map((t) => {
            const com = bySlug[t.community_slug];
            const names = (t.others || []).map((o) => o.name).join(", ") || "Conversation";
            return (
              <button key={`${t.community_slug}:${t.id}`} type="button" onClick={() => onOpenThread(t.community_slug, t.id)} data-testid="hub-inbox-thread"
                className="flex w-full items-start gap-3 border-b border-line p-3.5 text-left hover:bg-ink/5">
                <Avatar src={t.other?.avatar_url} name={names} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cx("truncate text-sm", t.unread ? "font-semibold" : "font-medium")}>{names}</p>
                    <span className="shrink-0 text-[10px] text-muted">{timeAgo(t.last_message_at)}</span>
                  </div>
                  <p className="truncate text-xs text-muted">{t.subject}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ background: com?.brand?.colors?.accent ? `${com.brand.colors.accent}26` : "rgb(var(--c-ink) / 0.08)", color: com?.brand?.colors?.accent || "inherit" }}>
                      {com?.name || t.community_slug}
                    </span>
                    <p className="truncate text-xs text-muted">{t.last_message_preview}</p>
                  </div>
                </div>
                {t.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--accent)" }} aria-hidden data-testid="hub-inbox-unread-dot" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Hub() {
  const { account, loading, enter, logout, showHubTheme, refresh } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState(null);
  const [apply, setApply] = useState(null);
  const [f, setF] = useState({ title: "", message: "", answers: {} });
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false); // "start your own community" modal
  const [categories, setCategories] = useState([]);
  const [nc, setNc] = useState({ name: "", category: "other" });
  const [editingProfile, setEditingProfile] = useState(false); // account-level "standard profile" modal
  const [pf, setPf] = useState(BLANK_PROFILE);
  const [pPhoto, setPPhoto] = useState("");
  const [pBusy, setPBusy] = useState(false);
  const [viewing, setViewing] = useState(null); // community whose detail view is open
  const [country, setCountry] = useState("all"); // "Discover communities" filters — client-side, over the already-loaded list
  const [interest, setInterest] = useState("all");
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxData, setInboxData] = useState(null);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [peopleInitialThread, setPeopleInitialThread] = useState(null);
  const [peopleInitialProfile, setPeopleInitialProfile] = useState(null);

  // A community member card's "View on People" link (MemberProfile.jsx) can't open this panel
  // directly -- it's mounted here, on a different route -- so it hands off through a ?person=
  // query param instead, the same bridge /join and /c/:slug links use to carry state across a
  // navigation. Consumed once on arrival, same one-shot pattern as peopleInitialThread.
  useEffect(() => {
    const email = params.get("person");
    if (!email) return;
    setPeopleInitialProfile(email);
    setPeopleOpen(true);
    setParams((p) => { p.delete("person"); return p; }, { replace: true });
  }, [params, setParams]);

  const load = useCallback(() => api.get("/hub/communities").then((r) => setItems(r.data.communities)).catch((e) => toast.error(errMsg(e))), []);
  const loadInbox = useCallback(() => {
    setInboxLoading(true);
    return api.get("/hub/messages").then((r) => setInboxData(r.data)).catch(() => setInboxData({ threads: [], unread: 0 })).finally(() => setInboxLoading(false));
  }, []);
  useEffect(() => { showHubTheme(); }, [showHubTheme]);
  useEffect(() => { if (account) { load(); loadInbox(); } }, [account, load, loadInbox]);
  useEffect(() => { if (starting && !categories.length) api.get("/hub/community-categories").then((r) => setCategories(r.data.categories)).catch(() => {}); }, [starting, categories.length]);
  if (loading) return <Spinner />;
  if (!account) return <Navigate to="/login" replace />;

  const openProfileEditor = () => {
    setPf({ name: account.name || "", age: account.age || "", title: account.title || "", company: account.company || "", location: account.location || "", bio: account.bio || "",
            skill_set: account.skill_set || [], interests_hobbies: account.interests_hobbies || [], goals: account.goals || [], support_needs: account.support_needs || [],
            photos: account.photos || [], contact: { phone: "", linkedin: "", instagram: "", website: "", ...(account.contact || {}) } });
    setPPhoto(account.avatar_url || "");
    setEditingProfile(true);
  };
  const saveProfile = async () => {
    if (pf.name.trim().length < 2) return toast.error("Enter your name.");
    setPBusy(true);
    try { await api.patch("/hub/profile", { ...pf, age: pf.age ? parseInt(pf.age, 10) : null, avatar_url: pPhoto || null }); await refresh(); toast.success("Profile saved"); setEditingProfile(false); }
    catch (e) { toast.error(errMsg(e)); } finally { setPBusy(false); }
  };

  const mine = (items || []).filter((c) => ["approved", "pending"].includes(c.my.status));
  const discover = (items || []).filter((c) => !["approved", "pending"].includes(c.my.status));
  // At a handful of communities these filters are unnecessary; at hundreds they're how someone
  // actually finds theirs, so they're built in from the start. Countries/interests are derived from
  // whatever's on screen rather than a separate call — Discover communities already loads every
  // community's summary in one shot.
  const countries = Array.from(new Set(discover.map((c) => c.country).filter(Boolean))).sort();
  const interestTags = Array.from(new Set(discover.flatMap((c) => c.interest_tags || []))).sort();
  const filteredDiscover = discover.filter((c) => (country === "all" || c.country === country) && (interest === "all" || (c.interest_tags || []).includes(interest)));
  const filtersActive = country !== "all" || interest !== "all";
  const doEnter = async (c) => { try { await enter(c.slug); nav("/", { replace: true }); } catch (e) { toast.error(errMsg(e)); } };
  // Opening a thread from the unified inbox: a community thread enters that community first (same
  // as clicking its card), then lands straight on the thread -- replying/deleting/reporting need that
  // community's own session, which this platform-level page never carries. A platform thread
  // (community_slug: null) isn't inside any community at all, so it's handed to HubPeople's own
  // thread view instead.
  const openThread = async (slug, threadId) => {
    if (!slug) { setInboxOpen(false); setPeopleInitialThread(threadId); setPeopleOpen(true); return; }
    try { await enter(slug); setInboxOpen(false); nav(`/inbox/${threadId}`); } catch (e) { toast.error(errMsg(e)); }
  };
  const closePeople = () => { setPeopleOpen(false); setPeopleInitialThread(null); setPeopleInitialProfile(null); };
  // "View" on a platform thread's invite/share card: enters the attached community, same as the
  // Hub card's own Enter button.
  const openCommunityFromCard = async (slug) => { try { await enter(slug); closePeople(); nav("/", { replace: true }); } catch (e) { toast.error(errMsg(e)); } };
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/hub/communities/${apply.slug}/apply`, { title: f.title, message: f.message, answers: f.answers });
      // Every community requires admin approval now -- no community can auto-approve a join request.
      toast.success(`Request sent to ${apply.name}`);
      setApply(null); setF({ title: "", message: "", answers: {} }); load();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const submitCreate = async () => {
    if (nc.name.trim().length < 2) return toast.error("Give your community a name.");
    setBusy(true);
    try {
      await api.post("/hub/communities", { name: nc.name.trim(), category: nc.category });
      await refresh(); // picks up the admin role in the community the call above just created
      nav("/setup", { replace: true });
    } catch (e) { toast.error(errMsg(e)); setBusy(false); }
  };

  return (
    <div className="relative min-h-screen" data-testid="hub">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[26rem] overflow-hidden"><img src={crowd} alt="" className="h-full w-full object-cover opacity-25" /><div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(8,8,11,.2), rgb(var(--c-bg)))" }} /></div>
    <div className="relative mx-auto max-w-6xl px-4 py-6 lg:px-8">
      <header className="mb-10 flex items-center justify-between">
        <span className="text-3xl"><Wordmark name="Pathwai" brand={{}} /></span>
        <div className="flex items-center gap-3">
          <span className="hidden text-right text-xs sm:block"><span className="block font-medium">{account.name}</span><span className="text-muted">{account.email}</span></span>
          <button onClick={() => setPeopleOpen(true)} data-testid="hub-open-people" title="People" aria-label="People" className="text-ink/80 hover:text-ink">
            <Users className="h-5 w-5" />
          </button>
          <button onClick={() => { setInboxOpen(true); loadInbox(); }} data-testid="hub-open-inbox" title="Messages" aria-label="Messages" className="relative text-ink/80 hover:text-ink">
            <Mail className="h-5 w-5" />
            {inboxData?.unread > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white" data-testid="hub-inbox-badge">{inboxData.unread}</span>}
          </button>
          <button onClick={openProfileEditor} data-testid="hub-edit-profile" title="Edit your Pathwai profile"><Avatar src={account.avatar_url} name={account.name} size={36} /></button>
          <button className="btn-ghost" onClick={async () => { await logout(); nav("/login", { replace: true }); }} data-testid="hub-logout">Sign out</button>
        </div>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl lg:text-4xl">Your communities</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">One Pathwai login. Each community has its own members, events and look, and you have a separate profile in each — pre-filled from your <button className="underline" onClick={openProfileEditor} data-testid="hub-profile-link">Pathwai profile</button>.</p>
        </div>
        <Button variant="ghost" className="border border-dashed border-line" onClick={() => setStarting(true)} data-testid="hub-start-community">+ Start your own community</Button>
      </div>

      {!items ? <Spinner /> : (
        <>
          {mine.length === 0 ? <p className="mt-8 rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">You haven't joined a community yet. Pick one below and send a request.</p> : (
            <>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:hidden">{mine.map((c) => <CommunityTile key={c.slug} c={c} onView={setViewing} />)}</div>
              <div className="mt-6 hidden gap-5 md:grid md:grid-cols-2 lg:grid-cols-3">{mine.map((c) => <CommunityCard key={c.slug} c={c} onEnter={doEnter} onView={setViewing} />)}</div>
            </>)}

          {discover.length > 0 && (
            <>
              <div className="mt-14 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold sm:text-2xl">Discover communities</h2>
                  <p className="mt-1 text-sm text-muted">{discover.length} communities on Pathwai. Every community reviews requests to join — you'll get a notification when you're in.</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                <Select data-testid="discover-country-filter" value={country} onChange={(e) => setCountry(e.target.value)}
                  options={[{ value: "all", label: "All countries" }, ...countries.map((c) => ({ value: c, label: c }))]} />
                <Select data-testid="discover-interest-filter" value={interest} onChange={(e) => setInterest(e.target.value)}
                  options={[{ value: "all", label: "All interests" }, ...interestTags.map((t) => ({ value: t, label: t }))]} />
                {filtersActive && <button className="justify-self-start text-xs text-muted underline sm:justify-self-auto" onClick={() => { setCountry("all"); setInterest("all"); }}>Clear filters</button>}
              </div>
              {filteredDiscover.length === 0 ? (
                <p className="mt-8 rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">No communities match those filters.</p>
              ) : (
                <>
                  <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:hidden">{filteredDiscover.map((c) => <CommunityTile key={c.slug} c={c} onView={setViewing} />)}</div>
                  <div className="mt-6 hidden gap-5 md:grid md:grid-cols-2 lg:grid-cols-3">{filteredDiscover.map((c) => <CommunityCard key={c.slug} c={c} onApply={(x) => { setApply(x); setF({ title: account.title || "", message: "", answers: {} }); }} onView={setViewing} />)}</div>
                </>
              )}
            </>)}
        </>)}

      <HubInbox open={inboxOpen} onClose={() => setInboxOpen(false)} loading={inboxLoading} data={inboxData} communities={items} onOpenThread={openThread} />

      <HubPeople open={peopleOpen} onClose={closePeople} communities={items} initialThreadId={peopleInitialThread} initialProfileEmail={peopleInitialProfile} onThreadRead={loadInbox} onOpenCommunity={openCommunityFromCard} />

      <CommunityDetailModal c={viewing} onClose={() => setViewing(null)}
        onEnter={(c) => { setViewing(null); doEnter(c); }}
        onApply={(c) => { setViewing(null); setApply(c); setF({ title: account.title || "", message: "", answers: {} }); }} />

      <Modal open={!!apply} onClose={() => setApply(null)} title={apply ? `Request to join ${apply.name}` : ""}>
        {apply && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-line bg-ink/5 p-3">
              <Avatar src={account.avatar_url} name={account.name} size={40} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Applying as {account.name}</p>
                <p className="truncate text-xs text-muted">{[account.title, account.company].filter(Boolean).join(" · ") || "No profile details yet"} · pulled from your Pathwai profile</p>
              </div>
              <button type="button" className="shrink-0 text-xs font-medium underline" onClick={() => { setApply(null); openProfileEditor(); }} data-testid="apply-edit-profile">Edit</button>
            </div>
            <Field label="What do you do?" hint="From your Pathwai profile — override it just for this community if you like."><Input data-testid="apply-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Physiotherapist, teacher, chef" maxLength={120} /></Field>
            {(apply.apply_questions || []).map((q) => <Field key={q.key} label={q.label}><Input value={f.answers[q.key] || ""} onChange={(e) => setF({ ...f, answers: { ...f.answers, [q.key]: e.target.value } })} placeholder={q.placeholder} /></Field>)}
            <Field label="Why would you like to join?"><Textarea data-testid="apply-message" rows={3} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} maxLength={600} /></Field>
            <Button onClick={submit} loading={busy} data-testid="apply-submit">Send request</Button>
          </div>)}
      </Modal>

      <Modal open={editingProfile} onClose={() => setEditingProfile(false)} title="Your Pathwai profile">
        <div className="space-y-4">
          <p className="text-sm text-muted">This is the standard profile every new community application starts from. Editing it here doesn't change what you've already shared inside communities you've joined.</p>
          <AccountProfileForm f={pf} setF={setPf} photo={pPhoto} setPhoto={setPPhoto} />
          <Button onClick={saveProfile} loading={pBusy} data-testid="save-account-profile">Save profile</Button>
        </div>
      </Modal>

      <Modal open={starting} onClose={() => setStarting(false)} title="Start your own community">
        <div className="space-y-4">
          <p className="text-sm text-muted">You'll be its founding admin — a church, a club, a wellness brand — with your own members, events and look. You can change any of this later.</p>
          <Field label="Community name"><Input data-testid="create-community-name" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} placeholder="e.g. Riverside Run Club" maxLength={80} /></Field>
          <Field label="What kind of community is it?"><Select data-testid="create-community-category" value={nc.category} onChange={(e) => setNc({ ...nc, category: e.target.value })} options={categories.map((c) => ({ value: c.key, label: c.label }))} /></Field>
          <Button onClick={submitCreate} loading={busy} data-testid="create-community-submit">Create community</Button>
        </div>
      </Modal>
      <PoweredBy className="mt-16 flex justify-center" />
    </div>
    </div>
  );
}
