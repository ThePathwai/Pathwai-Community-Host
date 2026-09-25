import React, { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, errMsg, timeAgo } from "../lib/api";
import { useAuth } from "../lib/auth";
import { SUGGEST } from "../lib/profile";
import crowd from "../assets/crowd.jpg";
import { Avatar, AvatarUpload, Button, Field, Input, Modal, PoweredBy, Select, Spinner, TagInput, Textarea, Wordmark } from "../components/ui";

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
        <p className="mt-3 text-xs" style={{ color: col.muted }}>{c.members} members · {c.upcoming_events} upcoming events</p>
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
          <p className="mt-4 text-xs" style={{ color: col.muted }}>{c.members} members · {c.upcoming_events} upcoming events</p>
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
  contact: { phone: "", linkedin: "", instagram: "", website: "" } };

export default function Hub() {
  const { account, loading, enter, logout, showHubTheme, refresh } = useAuth();
  const nav = useNavigate();
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

  const load = useCallback(() => api.get("/hub/communities").then((r) => setItems(r.data.communities)).catch((e) => toast.error(errMsg(e))), []);
  useEffect(() => { showHubTheme(); }, [showHubTheme]);
  useEffect(() => { if (account) load(); }, [account, load]);
  useEffect(() => { if (starting && !categories.length) api.get("/hub/community-categories").then((r) => setCategories(r.data.categories)).catch(() => {}); }, [starting, categories.length]);
  if (loading) return <Spinner />;
  if (!account) return <Navigate to="/login" replace />;

  const openProfileEditor = () => {
    setPf({ name: account.name || "", age: account.age || "", title: account.title || "", company: account.company || "", location: account.location || "", bio: account.bio || "",
            skill_set: account.skill_set || [], interests_hobbies: account.interests_hobbies || [], goals: account.goals || [], support_needs: account.support_needs || [],
            contact: { phone: "", linkedin: "", instagram: "", website: "", ...(account.contact || {}) } });
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
  const doEnter = async (c) => { try { await enter(c.slug); nav("/", { replace: true }); } catch (e) { toast.error(errMsg(e)); } };
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/hub/communities/${apply.slug}/apply`, { title: f.title, message: f.message, answers: f.answers });
      toast.success(apply.require_approval ? `Request sent to ${apply.name}` : `Welcome to ${apply.name}`);
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
              <h2 className="mt-14 text-xl font-bold sm:text-2xl">Discover communities</h2>
              <p className="mt-1 text-sm text-muted">Every community reviews requests to join. You'll get a notification when you're in.</p>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:hidden">{discover.map((c) => <CommunityTile key={c.slug} c={c} onView={setViewing} />)}</div>
              <div className="mt-6 hidden gap-5 md:grid md:grid-cols-2 lg:grid-cols-3">{discover.map((c) => <CommunityCard key={c.slug} c={c} onApply={(x) => { setApply(x); setF({ title: account.title || "", message: "", answers: {} }); }} onView={setViewing} />)}</div>
            </>)}
        </>)}

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
