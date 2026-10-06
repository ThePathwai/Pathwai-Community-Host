import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, X } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { Button } from "./ui";
import { RecipientPicker } from "./RecipientPicker";

// "New message" from the Messages tab itself, built to read as an email draft — a title bar, a bare
// "To" line, a bare "Subject" line, a full-bleed body — rather than a labeled form in a dialog box.
// Picking more than one person in "To" addresses them all at once: it starts one shared thread
// between everyone added (see routes/messages.py), and writing to that exact group again later
// continues it rather than forking a new one.
export function ComposeModal({ open, onClose, onSent }) {
  const nav = useNavigate();
  const [to, setTo] = useState([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => { if (open) { setTo([]); setSubject(""); setBody(""); } }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const send = async () => {
    setSending(true);
    try {
      const r = await api.post("/messages/threads", { recipient_ids: to.map((u) => u.id), subject, body });
      toast.success("Message sent");
      onSent?.(r.data);
      onClose();
      nav(`/inbox/${r.data.id}`);
    } catch (e) { toast.error(errMsg(e)); } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl2 bg-surface shadow-2xl sm:h-[640px] sm:rounded-xl2" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-line bg-ink/[.03] px-4 py-2.5">
          <p className="text-sm font-semibold">New Message</p>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-1.5">
          <span className="text-sm text-muted">To</span>
          <div className="min-w-0 flex-1"><RecipientPicker value={to} onChange={setTo} autoFocus bare /></div>
        </div>
        <input data-testid="compose-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={140}
          placeholder="Subject" className="w-full shrink-0 border-b border-line bg-transparent px-4 py-2.5 text-sm font-medium outline-none placeholder:font-normal placeholder:text-muted" />
        <textarea data-testid="compose-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message..."
          className="w-full flex-1 resize-none bg-transparent px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-muted" />
        <div className="flex shrink-0 items-center justify-between border-t border-line px-4 py-3">
          <Button onClick={send} disabled={!to.length || !body.trim() || sending} data-testid="compose-send"><Send className="h-4 w-4" />Send</Button>
          {to.length > 1 && <p className="text-xs text-muted">Sending to {to.length} people</p>}
        </div>
      </div>
    </div>
  );
}
