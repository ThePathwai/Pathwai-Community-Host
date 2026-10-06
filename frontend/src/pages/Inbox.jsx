import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Flag, PenSquare, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate, timeAgo } from "../lib/api";
import { useLive } from "../lib/live";
import { useAuth } from "../lib/auth";
import { Avatar, Button, Empty, Input, PageHeader, Select, Spinner, Tabs, cx } from "../components/ui";
import { ComposeModal } from "../components/ComposeModal";
import BlastComposer from "../components/BlastComposer";

// The in-app inbox: every "reach out to a member" and "message about a help board post" entry point
// in the product lands here — see ReachOutModal.jsx for where a targeted conversation starts, and
// ComposeModal.jsx for starting a fresh one from this tab, addressed to one or more people at once
// (see routes/messages.py). Reads like email: a subject line set once, then a running thread under
// it, shown here as stacked messages rather than a live chat.
//
// Admins get a second tab here, Blasts (BlastComposer -- SMS/email broadcast to many members at
// once) -- this used to be its own page behind a second "Messages" icon in the header, which just
// meant two differently-shaped things both called Messages. One destination now: the inbox is the
// default, and admins can switch to Blasts without leaving it.
function otherNames(t) { return (t.others || []).map((o) => o.name).join(", "); }

// A context-less thread (most of them) is "General"; one started from the Help board (or, later,
// an event or a to-do) carries a `context: {type, id, title}` set when it began (see Support.jsx's
// "Message" action) -- labelled here the way that section is labelled elsewhere in the product, so
// filtering "by context" reads the same everywhere.
const CONTEXT_LABELS = { support_request: "Help board", event: "Events", request: "To-do" };
const contextLabel = (type) => CONTEXT_LABELS[type] || (type ? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "General");
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

// Overlapping-circle avatar stack for a group thread's list row; a single avatar for the common
// one-to-one case.
function ThreadAvatar({ others }) {
  if (others.length <= 1) return <Avatar src={others[0]?.avatar_url} name={others[0]?.name} size={40} />;
  return (
    <span className="relative inline-block h-10 w-10 shrink-0">
      <span className="absolute left-0 top-0"><Avatar src={others[0].avatar_url} name={others[0].name} size={26} /></span>
      <span className="absolute bottom-0 right-0 rounded-full ring-2 ring-[rgb(var(--c-surface))]"><Avatar src={others[1].avatar_url} name={others[1].name} size={26} /></span>
    </span>
  );
}

// Two-step "tap again to confirm" delete, same shape as Support.jsx's help-board DeletePostButton --
// your own message, or any message at all if you're admin.
function DeleteMessageButton({ onDelete }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirm) return <button type="button" className="text-muted hover:text-ink" title="Delete message" aria-label="Delete message" onClick={() => setConfirm(true)} data-testid="delete-message"><Trash2 className="h-3.5 w-3.5" /></button>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="text-muted">Delete?</span>
      <button type="button" className="font-semibold text-red-600" disabled={busy} onClick={async () => { setBusy(true); await onDelete(); setBusy(false); }} data-testid="delete-message-confirm">Yes</button>
      <button type="button" className="text-muted hover:text-ink" aria-label="Cancel" onClick={() => setConfirm(false)}><X className="h-3 w-3" /></button>
    </span>
  );
}

export default function Inbox() {
  const { threadId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState("inbox");
  const [list, setList] = useState(null);
  const [thread, setThread] = useState(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const scrollRef = useRef(null);

  // Filter bar: Sent / Recents / a custom date range, who the thread is with (Members vs. Admin &
  // team), and the context it started from (Help board, Events, To-do, or General) -- the six facets
  // asked for. All client-side over the already-loaded thread list, same as Resources.jsx's search.
  const [quick, setQuick] = useState("all"); // all | sent | recent
  const [who, setWho] = useState("all"); // all | member | admin
  const [ctx, setCtx] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const loadList = useCallback(() => api.get("/messages/threads").then((r) => setList(r.data.threads)).catch((e) => toast.error(errMsg(e))), []);
  useEffect(() => { loadList(); }, [loadList]);
  // A new message: refresh the list and the open conversation in place (the composer is left alone).
  useLive(["messages"], () => {
    loadList();
    if (threadId) api.get(`/messages/threads/${threadId}`).then((r) => setThread(r.data)).catch(() => {});
  });

  useEffect(() => {
    if (!threadId) { setThread(null); return; }
    setThread(null);
    api.get(`/messages/threads/${threadId}`).then((r) => { setThread(r.data); loadList(); }).catch((e) => { toast.error(errMsg(e)); nav("/inbox", { replace: true }); });
  }, [threadId, nav, loadList]);

  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [thread?.messages?.length]);

  const contextOptions = useMemo(() => {
    const types = [...new Set((list || []).map((t) => t.context?.type || "none"))];
    return [{ value: "all", label: "Any context" }, ...types.sort().map((t) => ({ value: t, label: contextLabel(t === "none" ? null : t) }))];
  }, [list]);

  const active = quick !== "all" || who !== "all" || ctx !== "all" || dateFrom || dateTo;
  const clearFilters = () => { setQuick("all"); setWho("all"); setCtx("all"); setDateFrom(""); setDateTo(""); };

  const filteredList = useMemo(() => {
    let out = list || [];
    if (quick === "sent") out = out.filter((t) => t.last_sender_id === user.id);
    else if (quick === "recent") out = out.filter((t) => t.last_message_at && Date.now() - new Date(t.last_message_at).getTime() <= RECENT_MS);
    if (who !== "all") out = out.filter((t) => (t.others || []).some((o) => (who === "admin" ? o.role === "admin" : o.role !== "admin")));
    if (ctx !== "all") out = out.filter((t) => (t.context?.type || "none") === ctx);
    if (dateFrom) out = out.filter((t) => t.last_message_at && t.last_message_at.slice(0, 10) >= dateFrom);
    if (dateTo) out = out.filter((t) => t.last_message_at && t.last_message_at.slice(0, 10) <= dateTo);
    return out;
  }, [list, quick, who, ctx, dateFrom, dateTo, user.id]);

  const send = async () => {
    if (!body.trim() || !threadId) return;
    setSending(true);
    try {
      const r = await api.post(`/messages/threads/${threadId}/reply`, { body });
      setBody("");
      setThread((t) => ({ ...t, messages: [...t.messages, r.data] }));
      loadList();
    } catch (e) { toast.error(errMsg(e)); } finally { setSending(false); }
  };

  const deleteMessage = async (messageId) => {
    try {
      await api.delete(`/messages/threads/${threadId}/messages/${messageId}`);
      setThread((t) => ({ ...t, messages: t.messages.filter((m) => m.id !== messageId) }));
      loadList();
      toast.success("Message deleted");
    } catch (e) { toast.error(errMsg(e)); }
  };

  const reportMessage = async (messageId, reason) => {
    try {
      await api.post(`/messages/threads/${threadId}/messages/${messageId}/report`, { reason });
      toast.success("Thanks — the team will review this.");
    } catch (e) { toast.error(errMsg(e)); }
  };

  const senderOf = (m) => (m.sender_id === user.id ? user : (thread.others || []).find((o) => o.id === m.sender_id) || { name: "Former member", avatar_url: null });

  return (
    <div>
      <PageHeader k="inbox" title="Messages"
        subtitle={tab === "blasts" ? "Reach your members by text, email, or both." : "Your conversations with other members, all in one place."}
        actions={tab === "inbox" ? <Button onClick={() => setComposeOpen(true)} data-testid="compose-open"><PenSquare className="h-4 w-4" />New message</Button> : undefined} />
      {user.role === "admin" && <Tabs tabs={[{ value: "inbox", label: "Inbox" }, { value: "blasts", label: "Blasts" }]} value={tab} onChange={setTab} />}
      {tab === "blasts" ? (
        <BlastComposer goIntegrations={() => { try { sessionStorage.setItem("pathwai.admintab", "integrations"); } catch { /* noop */ } nav("/admin"); }} />
      ) : (
      <>
      <div className={cx("mb-3 flex-wrap items-end gap-2 lg:flex", threadId ? "hidden lg:flex" : "flex")}>
        <div className="flex flex-wrap gap-1.5">
          {[["all", "All"], ["sent", "Sent"], ["recent", "Recents"]].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setQuick(v)} data-testid={`inbox-quick-${v}`}
              className={cx("rounded-full border px-3 py-1 text-sm", quick === v ? "border-transparent text-onaccent" : "border-line text-muted hover:bg-ink/5")}
              style={quick === v ? { background: "var(--accent)" } : undefined}>{l}</button>
          ))}
        </div>
        <Select className="!w-auto" value={who} onChange={(e) => setWho(e.target.value)} data-testid="inbox-filter-who"
          options={[{ value: "all", label: "Everyone" }, { value: "member", label: "Members" }, { value: "admin", label: "Admin & team" }]} />
        <Select className="!w-auto" value={ctx} onChange={(e) => setCtx(e.target.value)} data-testid="inbox-filter-context" options={contextOptions} />
        <Input type="date" className="!w-auto" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" data-testid="inbox-date-from" />
        <Input type="date" className="!w-auto" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" data-testid="inbox-date-to" />
        {active && <button className="text-xs text-muted underline" onClick={clearFilters} data-testid="inbox-clear-filters">Clear filters</button>}
      </div>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr] lg:items-start">
        <div className={cx("space-y-1.5 lg:block", threadId ? "hidden" : "block")}>
          {!list ? <Spinner /> : filteredList.length === 0 ? (
            list.length === 0 ? (
              <Empty title="No messages yet" hint="Start a new message, or reach out to a member from their profile, a match, or the Help board." action={<Button onClick={() => setComposeOpen(true)}>New message</Button>} />
            ) : <Empty title="No messages match these filters." hint="Try clearing a filter." action={active ? <Button variant="ghost" onClick={clearFilters}>Clear filters</Button> : undefined} />
          ) : filteredList.map((t) => (
            <Link key={t.id} to={`/inbox/${t.id}`} data-testid="thread-row"
              className={cx("card card-hover !p-3 flex items-center gap-3", threadId === t.id && "!border-ink")}>
              <span className="relative shrink-0"><ThreadAvatar others={t.others} />
                {t.unread && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[rgb(var(--c-surface))]" style={{ background: "var(--accent)" }} />}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2"><p className={cx("truncate text-sm", t.unread ? "font-semibold" : "font-medium")}>{otherNames(t)}</p>
                  <span className="shrink-0 text-[10px] text-muted">{timeAgo(t.last_message_at)}</span></div>
                <p className="truncate text-xs text-muted">{t.subject}{t.context ? ` · ${contextLabel(t.context.type)}` : ""}</p>
                <p className={cx("truncate text-xs", t.unread ? "text-ink/80" : "text-muted")}>{t.last_sender_id === user.id ? "You: " : ""}{t.last_message_preview}</p>
              </div>
            </Link>
          ))}
        </div>

        <div className={cx("card !p-0 flex flex-col overflow-hidden lg:block", threadId ? "flex" : "hidden lg:flex", "h-[calc(100vh-260px)] min-h-[420px]")}>
          {!threadId ? (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted">Pick a conversation, or start a new message.</div>
          ) : !thread ? <div className="flex h-full items-center justify-center"><Spinner /></div> : (
            <>
              {/* Same window chrome as ComposeModal/ReachOutModal (tinted title bar, bare rows, a
                  borderless body) so a thread you're reading matches the draft you wrote to start
                  it — one email client, not a chat pane bolted onto a form. */}
              <div className="flex shrink-0 items-center gap-3 border-b border-line bg-ink/[.03] px-4 py-2.5">
                <Link to="/inbox" className="btn-ghost !hidden !px-2 max-lg:!inline-flex" aria-label="Back to messages">←</Link>
                <ThreadAvatar others={thread.others} />
                {thread.others.length === 1 ? (
                  <Link to={thread.others[0].id ? `/members/${thread.others[0].id}` : "#"} className="min-w-0 truncate text-sm font-semibold hover:underline">{otherNames(thread)}</Link>
                ) : <p className="min-w-0 truncate text-sm font-semibold">{otherNames(thread)}</p>}
              </div>
              <div className="shrink-0 border-b border-line px-4 py-2.5">
                <p className="eyebrow">Subject</p>
                <p className="mt-0.5 truncate text-base font-semibold">{thread.subject}{thread.context ? ` · ${contextLabel(thread.context.type)}` : ""}</p>
              </div>
              {/* Stacked, full-width messages — each its own header (who, when, and now Report/Delete)
                  over the body — reads like a mail thread rather than a live chat: no bubbles, no
                  side-by-side alignment, no auto-send on Enter. Sending is always an explicit,
                  deliberate "Send" below. */}
              <div ref={scrollRef} className="flex-1 divide-y divide-line overflow-y-auto">
                {thread.messages.map((m) => (
                  <MessageRow key={m.id} m={m} mine={m.sender_id === user.id} sender={senderOf(m)} isAdmin={user.role === "admin"}
                    onDelete={() => deleteMessage(m.id)} onReport={(reason) => reportMessage(m.id, reason)} />
                ))}
              </div>
              <div className="shrink-0 border-t border-line">
                <textarea data-testid="inbox-reply" rows={3} value={body} placeholder={`Write a reply to ${otherNames(thread) || "the group"}...`}
                  onChange={(e) => setBody(e.target.value)} className="w-full resize-none bg-transparent px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-muted" />
                <div className="flex items-center justify-end border-t border-line px-4 py-3">
                  <Button onClick={send} disabled={!body.trim() || sending} data-testid="inbox-send"><Send className="h-4 w-4" />Send</Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      </>
      )}
      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} onSent={loadList} />
    </div>
  );
}

// Pulled out of the thread view so each message keeps its own report/delete step state independent
// of its siblings (a shared boolean on the parent would make every message confirm at once).
function MessageRow({ m, mine, sender, isAdmin, onDelete, onReport }) {
  const [reportStep, setReportStep] = useState("idle"); // idle | confirm | reason
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const canDelete = mine || isAdmin;
  const submitReport = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    await onReport(reason.trim());
    setBusy(false); setReportStep("idle"); setReason("");
  };
  return (
    <div className="px-4 py-4">
      <div className="mb-2 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <Avatar src={sender.avatar_url} name={sender.name} size={28} />
          <p className="text-sm font-semibold">{mine ? "You" : sender.name}</p>
          <span className="text-xs text-muted">{fmtDate(m.created_at)}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!mine && reportStep === "idle" && <ReportMessageIcon onClick={() => setReportStep("confirm")} />}
          {reportStep === "confirm" && (
            <span className="inline-flex items-center gap-1.5 text-xs">
              <span className="text-muted">Report this message?</span>
              <button type="button" className="font-semibold" onClick={() => setReportStep("reason")} data-testid="report-message-confirm">Yes</button>
              <button type="button" className="text-muted hover:text-ink" aria-label="Cancel" onClick={() => setReportStep("idle")}><X className="h-3 w-3" /></button>
            </span>
          )}
          {canDelete && reportStep === "idle" && <DeleteMessageButton onDelete={onDelete} />}
        </div>
      </div>
      <p className="whitespace-pre-wrap break-words pl-[2.625rem] text-sm leading-relaxed text-ink/90">{m.body}</p>
      {reportStep === "reason" && (
        <div className="mt-2 flex items-center gap-2 pl-[2.625rem]">
          <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you reporting this message?" className="flex-1 !text-xs" data-testid="report-reason" />
          <Button variant="ghost" className="!px-2.5 !py-1.5 !text-xs" disabled={!reason.trim() || busy} onClick={submitReport} data-testid="report-message-submit">Submit report</Button>
          <button type="button" className="text-muted hover:text-ink" aria-label="Cancel report" onClick={() => { setReportStep("idle"); setReason(""); }}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  );
}

function ReportMessageIcon({ onClick }) {
  return <button type="button" className="text-muted hover:text-ink" title="Report message" aria-label="Report message" onClick={onClick} data-testid="report-message"><Flag className="h-3.5 w-3.5" /></button>;
}
