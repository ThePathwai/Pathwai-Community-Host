import React, { useCallback, useEffect, useState } from "react";
import { Flag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, timeAgo } from "../lib/api";
import { Avatar, Button, Field, Input, Select, Spinner, Tabs, Textarea, cx } from "./ui";

// Platform-wide "People" panel on the Hub: search everyone on Pathwai (not just whoever shares a
// community with you), follow/unfollow them, see which of their communities are public, and message
// or invite/share with them directly -- none of which needs a shared community. Backed by
// routes/hub.py's /hub/people*, /hub/following, /hub/followers and /hub/messages/threads* (all keyed
// by email, the only identity that's stable across every community someone might belong to -- see
// directory.person_by_email). Kept in its own file rather than inlined in Hub.jsx the way HubInbox
// is: this is substantial, composer-shaped UI (search, profile, compose, a thread view), matching the
// codebase's own precedent of pulling that out into its own file (BlastComposer.jsx,
// RecipientPicker.jsx, ComposeModal.jsx).
//
// Also renders a platform-level thread's detail/reply view. That view has two entry points: picking
// "Message" on someone's profile here, and clicking a community_slug:null row in HubInbox -- which
// can't use the enter()+nav() flow community threads use, since a platform thread doesn't belong to
// any one community (see Hub.jsx's openThread). Hub.jsx hands that case to this component via
// `initialThreadId` instead.

const TABS = [{ value: "search", label: "Search" }, { value: "following", label: "Following" }, { value: "followers", label: "Followers" }];
const EMPTY_COMPOSE = { subject: "", body: "", attachType: "none", attachSlug: "", attachEventId: "" };

// Was a plain <span> -- showed which communities this person belongs to but gave no way to actually
// go look at one, even though the exact same "jump into a community from inside this panel" wiring
// already existed for a shared thread's context card below (onOpenCommunity). Reusing it here is the
// other half of bridging People with the per-community member directory: this panel already links a
// shared community's thread into that community, so a shared community badge should too.
function CommunityBadge({ c, onOpen }) {
  const accent = c.colors?.accent;
  const Tag = onOpen ? "button" : "span";
  return (
    <Tag type={onOpen ? "button" : undefined} onClick={onOpen ? () => onOpen(c.slug) : undefined}
      className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", onOpen && "hover:opacity-80")}
      data-testid="people-profile-community-badge" style={{ background: accent ? `${accent}26` : "rgb(var(--c-ink) / 0.08)", color: accent || "inherit" }}>
      {c.logo_url && <img src={c.logo_url} alt="" className="h-4 w-4 rounded-full object-cover" />}
      {c.name}
    </Tag>
  );
}

// A feed card, not a plain directory row: the person's own photos (if they've added any) ride
// along the bottom, same as the grid on their full profile -- so scrolling the list already feels
// like scrolling a social feed instead of a contact list.
function PersonRow({ p, onOpen, onToggleFollow }) {
  const photos = (p.photos || []).slice(0, 3);
  return (
    <div className="border-b border-line p-3.5" data-testid="people-row">
      <div className="flex items-center gap-3">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onOpen(p.email)}>
          <Avatar src={p.avatar_url} name={p.name} size={40} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{p.name}</p>
            <p className="truncate text-xs text-muted">{[p.title, p.company].filter(Boolean).join(" · ") || p.email}</p>
          </div>
        </button>
        {typeof p.is_following === "boolean" && (
          <button type="button" onClick={() => onToggleFollow(p)} data-testid="people-follow-toggle"
            className={cx("shrink-0 rounded-full border px-3 py-1 text-xs font-semibold", p.is_following ? "border-line text-muted hover:bg-ink/5" : "border-transparent text-onaccent")}
            style={!p.is_following ? { background: "var(--accent)" } : undefined}>
            {p.is_following ? "Following" : "Follow"}
          </button>
        )}
      </div>
      {photos.length > 0 && (
        <button type="button" onClick={() => onOpen(p.email)} className="mt-2.5 flex gap-1.5 pl-[52px]" data-testid="people-row-photos">
          {photos.map((src, i) => <img key={i} src={src} alt="" className="h-16 w-16 rounded-lg object-cover" />)}
        </button>
      )}
    </div>
  );
}

// Same two-step "tap again to confirm" delete as the community inbox's own DeleteMessageButton
// (Inbox.jsx) -- a platform DM had no way to take a message back at all until now.
function DeletePlatformMessageButton({ onDelete }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirm) return <button type="button" className="text-muted hover:text-ink" title="Delete message" aria-label="Delete message" onClick={() => setConfirm(true)} data-testid="platform-delete-message"><Trash2 className="h-3.5 w-3.5" /></button>;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]">
      <span className="text-muted">Delete?</span>
      <button type="button" className="font-semibold text-red-600" disabled={busy} onClick={async () => { setBusy(true); await onDelete(); setBusy(false); }} data-testid="platform-delete-message-confirm">Yes</button>
      <button type="button" className="text-muted hover:text-ink" aria-label="Cancel" onClick={() => setConfirm(false)}><X className="h-3 w-3" /></button>
    </span>
  );
}

// Pulled out of the thread view, same reasoning as Inbox.jsx's MessageRow: each message keeps its
// own report/delete step state independent of its siblings.
function PlatformMessageRow({ m, mine, onDelete, onReport }) {
  const [reportStep, setReportStep] = useState("idle"); // idle | confirm | reason
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submitReport = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    await onReport(reason.trim());
    setBusy(false); setReportStep("idle"); setReason("");
  };
  return (
    <div className={cx("group max-w-[85%]", mine ? "ml-auto" : "")} data-testid="people-thread-message-row">
      <div className={cx("rounded-xl2 p-3 text-sm", mine ? "text-onaccent" : "bg-ink/5")} style={mine ? { background: "var(--accent)" } : undefined}>
        <p>{m.body}</p>
        <p className="mt-1 text-[10px] opacity-70">{timeAgo(m.created_at)}</p>
      </div>
      <div className={cx("mt-1 flex items-center gap-2 opacity-0 transition group-hover:opacity-100", mine ? "justify-end" : "justify-start")}>
        {!mine && reportStep === "idle" && <button type="button" className="text-muted hover:text-ink" title="Report message" aria-label="Report message" onClick={() => setReportStep("confirm")} data-testid="platform-report-message"><Flag className="h-3.5 w-3.5" /></button>}
        {mine && reportStep === "idle" && <DeletePlatformMessageButton onDelete={onDelete} />}
        {reportStep === "confirm" && (
          <span className="inline-flex items-center gap-1.5 text-[11px]">
            <span className="text-muted">Report this message?</span>
            <button type="button" className="font-semibold" onClick={() => setReportStep("reason")} data-testid="platform-report-message-confirm">Yes</button>
            <button type="button" className="text-muted hover:text-ink" aria-label="Cancel" onClick={() => setReportStep("idle")}><X className="h-3 w-3" /></button>
          </span>
        )}
      </div>
      {reportStep === "reason" && (
        <div className="mt-1.5 flex items-center gap-2">
          <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you reporting this message?" className="flex-1 !text-xs" data-testid="platform-report-reason" />
          <Button variant="ghost" className="!px-2.5 !py-1.5 !text-xs" disabled={!reason.trim() || busy} onClick={submitReport} data-testid="platform-report-submit">Report</Button>
          <button type="button" className="text-muted hover:text-ink" aria-label="Cancel report" onClick={() => { setReportStep("idle"); setReason(""); }}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  );
}

export default function HubPeople({ open, onClose, communities, initialThreadId, initialProfileEmail, onThreadRead, onOpenCommunity }) {
  const [tab, setTab] = useState("search");
  const [q, setQ] = useState("");
  const [people, setPeople] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [screen, setScreen] = useState("list"); // list | profile | compose | thread
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [composeTo, setComposeTo] = useState(null);
  const [compose, setCompose] = useState(EMPTY_COMPOSE);
  const [composeEvents, setComposeEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");

  const myApproved = (communities || []).filter((c) => c.my?.status === "approved");

  const loadList = useCallback((which, query) => {
    setListLoading(true);
    const req = which === "search" ? api.get("/hub/people", { params: { q: query || "" } }) : api.get(`/hub/${which}`);
    req.then((r) => setPeople(r.data.people)).catch((e) => { toast.error(errMsg(e)); setPeople([]); }).finally(() => setListLoading(false));
  }, []);

  const openThread = useCallback((threadId) => {
    setScreen("thread"); setThreadLoading(true); setThread(null);
    api.get(`/hub/messages/threads/${threadId}`).then((r) => { setThread(r.data); onThreadRead?.(); }).catch((e) => { toast.error(errMsg(e)); setScreen("list"); }).finally(() => setThreadLoading(false));
  }, [onThreadRead]);

  // Opening the panel: a platform thread clicked in HubInbox jumps straight to it; a "View on
  // People" link from a community member's own card (MemberProfile.jsx -- see openProfile below)
  // jumps straight to that person's profile screen; otherwise reset to a fresh search. Both
  // initialThreadId and initialProfileEmail are one-shot handoffs -- Hub.jsx clears them when this
  // panel closes, so reopening via the People button afterwards always lands back on Search.
  useEffect(() => {
    if (!open) return;
    if (initialThreadId) { openThread(initialThreadId); return; }
    if (initialProfileEmail) { openProfile(initialProfileEmail); return; }
    setScreen("list"); setTab("search"); setQ(""); loadList("search", "");
  }, [open, initialThreadId, initialProfileEmail, openThread, loadList]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (open && screen === "list" && !initialThreadId) loadList(tab, tab === "search" ? q : undefined); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || screen !== "list" || tab !== "search") return;
    const t = setTimeout(() => loadList("search", q), 250);
    return () => clearTimeout(t);
  }, [q, open, screen, tab, loadList]);

  const backToList = () => { setScreen("list"); setProfile(null); setComposeTo(null); setThread(null); loadList(tab, tab === "search" ? q : undefined); };

  const openProfile = (email) => {
    setScreen("profile"); setProfileLoading(true); setProfile(null);
    api.get(`/hub/people/${encodeURIComponent(email)}`).then((r) => setProfile(r.data)).catch((e) => { toast.error(errMsg(e)); setScreen("list"); }).finally(() => setProfileLoading(false));
  };

  const toggleFollow = async (p, fromProfile) => {
    try {
      const r = p.is_following ? await api.delete(`/hub/people/${encodeURIComponent(p.email)}/follow`) : await api.post(`/hub/people/${encodeURIComponent(p.email)}/follow`);
      if (fromProfile) setProfile((old) => old && ({ ...old, is_following: r.data.is_following, followers: old.followers + (r.data.is_following ? 1 : -1) }));
      else setPeople((old) => (old || []).map((x) => (x.email === p.email ? { ...x, is_following: r.data.is_following } : x)));
    } catch (e) { toast.error(errMsg(e)); }
  };

  const startCompose = (person) => { setComposeTo(person); setCompose(EMPTY_COMPOSE); setComposeEvents([]); setScreen("compose"); };

  useEffect(() => {
    if (screen !== "compose" || compose.attachType !== "event" || !compose.attachSlug) { setComposeEvents([]); return; }
    setEventsLoading(true);
    api.get(`/hub/communities/${compose.attachSlug}/events`).then((r) => setComposeEvents(r.data.events)).catch(() => setComposeEvents([])).finally(() => setEventsLoading(false));
  }, [screen, compose.attachType, compose.attachSlug]);

  const sendCompose = async () => {
    if (!compose.body.trim()) return toast.error("Write a message.");
    let context = null;
    if (compose.attachType === "community" && compose.attachSlug) {
      const c = myApproved.find((x) => x.slug === compose.attachSlug);
      context = { type: "community", slug: compose.attachSlug, title: c?.name || compose.attachSlug };
    } else if (compose.attachType === "event") {
      if (!compose.attachEventId) return toast.error("Pick an event to share.");
      const ev = composeEvents.find((e) => e.id === compose.attachEventId);
      context = { type: "event", slug: compose.attachSlug, event_id: compose.attachEventId, title: ev?.title || "Event" };
    }
    setBusy(true);
    try {
      const r = await api.post("/hub/messages/threads", { recipient_emails: [composeTo.email], subject: compose.subject, body: compose.body, context });
      toast.success(`Sent to ${composeTo.name}`);
      openThread(r.data.id);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const sendReply = async () => {
    if (!reply.trim() || !thread) return;
    setBusy(true);
    try { await api.post(`/hub/messages/threads/${thread.id}/reply`, { body: reply }); setReply(""); openThread(thread.id); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  // Mirrors Inbox.jsx's deleteMessage/reportMessage for a community thread -- same two actions, now
  // available on a platform-level DM too (routes/hub.py's delete_platform_message/
  // report_platform_message).
  const deleteMessage = async (messageId) => {
    if (!thread) return;
    try {
      await api.delete(`/hub/messages/threads/${thread.id}/messages/${messageId}`);
      setThread((t) => ({ ...t, messages: t.messages.filter((m) => m.id !== messageId) }));
      toast.success("Message deleted");
    } catch (e) { toast.error(errMsg(e)); }
  };
  const reportMessage = async (messageId, reason) => {
    if (!thread) return;
    try { await api.post(`/hub/messages/threads/${thread.id}/messages/${messageId}/report`, { reason }); toast.success("Thanks — the team will review this."); }
    catch (e) { toast.error(errMsg(e)); }
  };

  if (!open) return null;
  const other = thread?.others?.[0];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[8vh]" onClick={onClose} data-testid="hub-people">
      <div className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-xl2 bg-[rgb(var(--c-surface))] text-ink" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line p-4">
          <div className="flex items-center gap-2">
            {screen !== "list" && <button type="button" onClick={backToList} data-testid="people-back" className="text-muted hover:text-ink">← Back</button>}
            <h2 className="text-lg font-bold">{screen === "list" ? "People" : screen === "profile" ? (profile?.name || "Profile") : screen === "compose" ? `Message ${composeTo?.name || ""}` : thread?.subject || "Conversation"}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" data-testid="close-hub-people" className="text-muted hover:text-ink">✕</button>
        </div>

        {screen === "list" && (
          <>
            <div className="border-b border-line p-3">
              <Tabs tabs={TABS} value={tab} onChange={setTab} />
              {tab === "search" && <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people by name, role or employer" data-testid="people-search-input" />}
            </div>
            <div className="flex-1 overflow-y-auto">
              {listLoading ? <div className="p-10"><Spinner /></div> : !people?.length ? (
                <p className="p-10 text-center text-sm text-muted">
                  {tab === "search" ? "No one matches that search." : tab === "following" ? "You aren't following anyone yet." : "No one follows you yet."}
                </p>
              ) : people.map((p) => <PersonRow key={p.email} p={p} onOpen={openProfile} onToggleFollow={toggleFollow} />)}
            </div>
          </>
        )}

        {screen === "profile" && (
          <div className="flex-1 overflow-y-auto p-5" data-testid="people-profile">
            {profileLoading || !profile ? <Spinner /> : (
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <Avatar src={profile.avatar_url} name={profile.name} size={56} />
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-bold">{profile.name}</p>
                    <p className="text-sm text-muted">{[profile.title, profile.company].filter(Boolean).join(" · ")}</p>
                    <p className="mt-1 text-xs text-muted">{profile.followers} follower{profile.followers === 1 ? "" : "s"} · {profile.following} following{profile.is_followed_by ? " · Follows you" : ""}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => toggleFollow(profile, true)} data-testid="people-profile-follow"
                    className={cx("flex-1 rounded-full border px-4 py-2 text-sm font-semibold", profile.is_following ? "border-line text-muted hover:bg-ink/5" : "border-transparent text-onaccent")}
                    style={!profile.is_following ? { background: "var(--accent)" } : undefined}>
                    {profile.is_following ? "Following" : "Follow"}
                  </button>
                  <Button variant="ghost" className="flex-1 border border-line" onClick={() => startCompose(profile)} data-testid="people-profile-message">Message</Button>
                </div>
                {profile.bio && <p className="whitespace-pre-wrap text-sm leading-relaxed">{profile.bio}</p>}
                {profile.photos?.length > 0 && (
                  <div className="grid grid-cols-3 gap-1.5" data-testid="people-profile-photos">
                    {profile.photos.map((src, i) => <img key={i} src={src} alt="" className="aspect-square w-full rounded-lg object-cover" data-testid="people-profile-photo" />)}
                  </div>
                )}
                {profile.communities?.length > 0 && (
                  <div>
                    <p className="label mb-1.5">Communities</p>
                    <div className="flex flex-wrap gap-1.5">{profile.communities.map((c) => <CommunityBadge key={c.slug} c={c} onOpen={onOpenCommunity} />)}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {screen === "compose" && (
          <div className="flex-1 overflow-y-auto p-5" data-testid="people-compose">
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-line bg-ink/5 p-3">
                <Avatar src={composeTo?.avatar_url} name={composeTo?.name} size={36} />
                <p className="text-sm font-medium">To {composeTo?.name}</p>
              </div>
              <Field label="Subject (optional)"><Input value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} maxLength={140} data-testid="people-compose-subject" /></Field>
              <Field label="Message"><Textarea rows={4} value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} maxLength={2000} data-testid="people-compose-body" /></Field>
              <Field label="Attach (optional) — invite them to a community, or share an event">
                <Select value={compose.attachType} onChange={(e) => setCompose({ ...compose, attachType: e.target.value, attachSlug: "", attachEventId: "" })} data-testid="people-compose-attach-type"
                  options={[{ value: "none", label: "Nothing" }, { value: "community", label: "Invite to a community" }, { value: "event", label: "Share an event" }]} />
              </Field>
              {compose.attachType !== "none" && myApproved.length === 0 && <p className="text-xs text-muted">You're not in any communities to share from yet.</p>}
              {compose.attachType !== "none" && myApproved.length > 0 && (
                <Field label="Which community?">
                  <Select value={compose.attachSlug} onChange={(e) => setCompose({ ...compose, attachSlug: e.target.value, attachEventId: "" })} data-testid="people-compose-attach-community"
                    options={[{ value: "", label: "Choose one" }, ...myApproved.map((c) => ({ value: c.slug, label: c.name }))]} />
                </Field>
              )}
              {compose.attachType === "event" && compose.attachSlug && (
                <Field label="Which event?">
                  {eventsLoading ? <Spinner /> : (
                    <Select value={compose.attachEventId} onChange={(e) => setCompose({ ...compose, attachEventId: e.target.value })} data-testid="people-compose-attach-event"
                      options={[{ value: "", label: composeEvents.length ? "Choose one" : "No upcoming events" }, ...composeEvents.map((ev) => ({ value: ev.id, label: ev.title }))]} />
                  )}
                </Field>
              )}
              <Button onClick={sendCompose} loading={busy} data-testid="people-compose-send">Send</Button>
            </div>
          </div>
        )}

        {screen === "thread" && (
          <div className="flex flex-1 flex-col overflow-hidden" data-testid="people-thread">
            <div className="flex-1 overflow-y-auto p-4">
              {threadLoading || !thread ? <Spinner /> : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar src={other?.avatar_url} name={other?.name} size={32} />
                    <p className="text-sm font-medium">{other?.name}</p>
                  </div>
                  {thread.context && (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-line p-3" data-testid="people-thread-context-card">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{thread.context.type === "event" ? "Shared event" : "Community invite"}</p>
                        <p className="truncate text-sm font-semibold">{thread.context.title}</p>
                      </div>
                      {onOpenCommunity && <button type="button" className="shrink-0 text-xs font-semibold underline" onClick={() => onOpenCommunity(thread.context.slug)} data-testid="people-thread-view-community">View</button>}
                    </div>
                  )}
                  {(thread.messages || []).map((m) => (
                    <PlatformMessageRow key={m.id} m={m} mine={m.sender_email !== other?.email}
                      onDelete={() => deleteMessage(m.id)} onReport={(reason) => reportMessage(m.id, reason)} />
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-line p-3">
              <Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" data-testid="people-thread-reply-body"
                onKeyDown={(e) => { if (e.key === "Enter") sendReply(); }} />
              <Button onClick={sendReply} loading={busy} data-testid="people-thread-reply-send">Send</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
