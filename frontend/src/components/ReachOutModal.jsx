import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, X } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { Avatar, Button, Spinner } from "./ui";

// Every point in the product that lets one member reach out to another opens this — a draft, the way
// an email is a draft, not a chat bubble: a title bar, the recipient shown (not editable here, since
// the page it was opened from already picked them), a bare Subject line, a full-bleed body. It sends
// inside Pathwai (see routes/messages.py), never a hand-off to the member's own phone or inbox. A
// second "reach out" to the same person continues the conversation already started with them instead
// of forking a new one, so the subject below only matters the first time two people message.
export function ReachOutModal({ open, onClose, member, defaultTopic = "", context, communityName, onSent }) {
  const nav = useNavigate();
  const [subject, setSubject] = useState(defaultTopic);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => { if (open) { setSubject(defaultTopic); setBody(""); } }, [open]); // eslint-disable-line

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  if (!member) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div className="w-full max-w-2xl rounded-xl2 bg-surface p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}><Spinner /></div>
      </div>
    );
  }
  const first = (member.name || "").split(" ")[0] || "them";

  const send = async () => {
    setSending(true);
    try {
      const r = await api.post("/messages/threads", { recipient_ids: [member.id], subject, body, context });
      toast.success("Message sent");
      onSent?.(r.data);
      onClose();
      nav(`/inbox/${r.data.id}`);
    } catch (e) { toast.error(errMsg(e)); } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl2 bg-surface shadow-2xl sm:h-[600px] sm:rounded-xl2" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-line bg-ink/[.03] px-4 py-2.5">
          <p className="text-sm font-semibold">New Message</p>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2">
          <span className="text-sm text-muted">To</span>
          <span className="flex items-center gap-1.5 rounded-full bg-ink/[.07] py-0.5 pl-1 pr-2.5 text-xs font-medium">
            <Avatar src={member.avatar_url} name={member.name} size={18} />{member.name}
          </span>
        </div>
        <input data-testid="reach-out-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={140}
          placeholder="Subject" className="w-full shrink-0 border-b border-line bg-transparent px-4 py-2.5 text-sm font-medium outline-none placeholder:font-normal placeholder:text-muted" />
        <textarea data-testid="reach-out-body" value={body} onChange={(e) => setBody(e.target.value)}
          placeholder={`Hi ${first}, I'd love to connect${communityName ? ` through ${communityName}` : ""}.`}
          className="w-full flex-1 resize-none bg-transparent px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-muted" />
        <div className="flex shrink-0 items-center border-t border-line px-4 py-3">
          <Button onClick={send} disabled={!body.trim() || sending} data-testid="reach-out-send"><Send className="h-4 w-4" />Send</Button>
        </div>
      </div>
    </div>
  );
}
