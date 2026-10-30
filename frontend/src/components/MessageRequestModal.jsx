import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Modal } from "./ui";

// Writing to someone from their profile. A person who listed themselves in Talent gets a message request they can accept or decline (and their
// email is never shown); anyone else gets a normal direct message.
const errMsg = (e) => e?.response?.data?.detail || "Something went wrong. Please try again.";

export default function MessageRequestModal({ to, onClose }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setText(""); }, [to?.name]);
  if (!to) return null;
  const first = (to.name || "them").split(" ")[0];
  const send = async () => {
    if (text.trim().length < 10) return toast.error("Say a little about why you are reaching out.");
    setBusy(true);
    try {
      if (to.request) await api.post(`/talent/${to.id}/message`, { message: text.trim() });
      else await api.post("/hub/messages/threads", { recipient_emails: [to.email], subject: "", body: text.trim() });
      toast.success(to.request ? `Request sent. ${first} will see it first.` : `Sent to ${first}.`);
      onClose(true);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={() => onClose(false)} title={`Message ${to.name}`}>
      <p className="text-sm text-muted">{to.request ? `Your note goes to ${first}'s inbox as a request. They choose whether to reply, and you can write more once they accept. Their email stays private.` : `Your message goes to ${first}'s Messages.`}</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={800} rows={6} autoFocus data-testid="msg-text" aria-label="Your message"
        placeholder="Who you are, what you are building, and what you would like help with." className="mt-4 w-full rounded-xl border border-line bg-transparent p-3 text-sm outline-none focus:border-ink/50" />
      <div className="mt-1 flex items-center justify-between text-xs text-muted"><span>Be specific: a clear ask gets a reply.</span><span className="tabular-nums">{text.length}/800</span></div>
      <div className="mt-4 flex justify-end gap-2"><button type="button" className="btn-ghost !py-2 text-sm" onClick={() => onClose(false)}>Cancel</button><button type="button" className="btn-primary !py-2 text-sm" disabled={busy} onClick={send} data-testid="msg-send">{busy ? "Sending…" : to.request ? "Send request" : "Send"}</button></div>
    </Modal>
  );
}
