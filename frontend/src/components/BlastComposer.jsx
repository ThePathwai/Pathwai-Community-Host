import React, { useCallback, useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate, timeAgo } from "../lib/api";
import { Button, Card, Chip, Field, Input, Select, Spinner, Textarea } from "./ui";

const AUD = [{ value: "all", label: "All members" }, { value: "event", label: "Guests of an event" }, { value: "admins", label: "Admins only" }];
const CHANNEL_LABEL = { sms: "Text", email: "Email", both: "Text + email" };

export default function BlastComposer({ goIntegrations }) {
  const [msg, setMsg] = useState("");
  const [subject, setSubject] = useState("");
  const [sms, setSms] = useState(true);
  const [email, setEmail] = useState(false);
  const [type, setType] = useState("all");
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState("");
  const [aud, setAud] = useState(null);
  const [hist, setHist] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const channel = sms && email ? "both" : email ? "email" : "sms";

  useEffect(() => { api.get("/events", { params: { upcoming: true } }).then((r) => { setEvents(r.data); if (r.data[0]) setEventId(r.data[0].id); }).catch(() => {}); }, []);
  const loadHist = useCallback(() => api.get("/admin/blasts/history").then((r) => setHist(r.data.blasts)), []);
  useEffect(() => { loadHist(); }, [loadHist]);
  useEffect(() => {
    if (type === "event" && !eventId) { setAud(null); return; }
    api.post("/admin/blasts/audience", { type, event_id: type === "event" ? eventId : null }).then((r) => setAud(r.data)).catch(() => setAud(null));
  }, [type, eventId]);
  useEffect(() => { setConfirm(false); }, [msg, subject, sms, email, type, eventId]);

  const send = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/admin/blasts/send", { message: msg, subject: email ? subject : null, channel, audience: { type, event_id: type === "event" ? eventId : null } });
      const parts = [];
      if (sms) parts.push(`${data.sms_sent} text${data.sms_sent === 1 ? "" : "s"}`);
      if (email) parts.push(`${data.email_sent} email${data.email_sent === 1 ? "" : "s"}`);
      const failed = (data.sms_failed || 0) + (data.email_failed || 0);
      toast.success(`${data.demo ? "Demo: " : ""}${parts.join(" and ")} sent${failed ? `, ${failed} failed` : ""}`);
      setMsg(""); setSubject(""); setConfirm(false); loadHist();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const segs = Math.max(1, Math.ceil((msg.length + 22) / 153));
  const count = channel === "email" ? aud?.email_count : channel === "sms" ? aud?.sms_count : Math.max(aud?.sms_count || 0, aud?.email_count || 0);
  const ready = (!sms || aud?.twilio_connected) && (!email || aud?.sendgrid_connected);
  const needsSetup = aud && !ready;
  return (
    <div className="grid gap-5 lg:grid-cols-[3fr_2fr]" data-testid="blast-page">
      <div className="space-y-4">
        {needsSetup && (
          <Card><p className="font-semibold">Connect {!aud.twilio_connected && sms ? "Twilio" : ""}{!aud.twilio_connected && sms && !aud.sendgrid_connected && email ? " and " : ""}{!aud.sendgrid_connected && email ? "SendGrid" : ""} to send this blast</p>
            <p className="mt-1 text-sm text-muted">Add credentials under Admin → Integrations. Type <code>demo</code> as the key to try it with sample data.</p>
            <Button className="mt-3" onClick={goIntegrations} data-testid="blast-connect">Open integrations</Button></Card>)}
        <Card>
          <h3 className="mb-4 flex items-center gap-2 text-lg"><MessageSquare className="h-5 w-5" />New blast{(sms && aud?.sms_demo) || (email && aud?.email_demo) ? <Chip>Demo mode</Chip> : null}</h3>
          <div className="space-y-4">
            <Field label="Send by">
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" className="accent-accent" checked={sms} onChange={(e) => setSms(e.target.checked)} data-testid="blast-channel-sms" />Text message</label>
                <label className="flex items-center gap-2"><input type="checkbox" className="accent-accent" checked={email} onChange={(e) => setEmail(e.target.checked)} data-testid="blast-channel-email" />Email</label>
              </div>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Send to"><Select value={type} onChange={(e) => setType(e.target.value)} options={AUD} data-testid="blast-audience" /></Field>
              {type === "event" && <Field label="Event"><Select value={eventId} onChange={(e) => setEventId(e.target.value)} options={events.map((e) => ({ value: e.id, label: `${e.title} · ${fmtDate(e.starts_at)}` }))} /></Field>}
            </div>
            {email && <Field label="Email subject" hint="Defaults to the first line of your message if left blank."><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Doors open at 7 tonight" data-testid="blast-subject" /></Field>}
            <Field label="Message" hint={sms ? `${msg.length} characters · about ${segs} text segment${segs > 1 ? "s" : ""} each. "Reply STOP to opt out." is added automatically.` : `${msg.length} characters`}>
              <Textarea rows={5} maxLength={sms ? 420 : 1600} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Doors open at 7pm tonight. Bring your ticket and a friend." data-testid="blast-message" />
            </Field>
            {aud && (sms || email) && (
              <div className="rounded-lg border border-line bg-ink/5 p-3 text-sm" data-testid="blast-count">
                {sms && <p>Text: <span className="font-semibold">{aud.sms_count}</span> {aud.sms_count === 1 ? "person" : "people"}{aud.sms_not_opted_in > 0 || aud.sms_no_phone > 0 ? ` · skipped ${aud.sms_not_opted_in} not opted in${aud.sms_no_phone ? `, ${aud.sms_no_phone} no phone` : ""}` : ""}</p>}
                {email && <p>Email: <span className="font-semibold">{aud.email_count}</span> {aud.email_count === 1 ? "person" : "people"}{aud.email_not_opted_in > 0 ? ` · skipped ${aud.email_not_opted_in} unsubscribed` : ""}</p>}
              </div>)}
            {!confirm ? <Button onClick={() => setConfirm(true)} disabled={!msg.trim() || !ready || !aud || !(sms || email) || count === 0} data-testid="blast-review">Review and send</Button> : (
              <div className="rounded-lg border border-accent/50 p-4" data-testid="blast-confirm">
                <p className="text-sm">Send by <strong>{CHANNEL_LABEL[channel].toLowerCase()}</strong> to {sms && <>{" "}<strong>{aud.sms_count}</strong> by text</>}{sms && email && " and "}{email && <><strong>{aud.email_count}</strong> by email</>}? This can't be undone.</p>
                <div className="mt-3 flex gap-2"><Button onClick={send} loading={busy} data-testid="blast-send">Send now</Button><Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button></div>
              </div>)}
          </div>
        </Card>
      </div>
      <Card>
        <h3 className="mb-3 text-lg">Recent blasts</h3>
        {!hist ? <Spinner /> : hist.length === 0 ? <p className="text-sm text-muted">Nothing sent yet.</p> : (
          <ul className="space-y-3" data-testid="blast-history">{hist.map((b) => (
            <li key={b.id} className="border-b border-line pb-3 last:border-0">
              <div className="flex items-center gap-2"><Chip>{CHANNEL_LABEL[b.channel] || b.channel}</Chip><span className="text-xs text-muted">{timeAgo(b.at)}</span></div>
              <p className="mt-1 text-sm">{b.message}</p>
              <p className="mt-1 text-xs text-muted">
                {b.channel !== "email" && `${b.sms_sent} text${b.sms_sent === 1 ? "" : "s"}${b.sms_failed ? ` (${b.sms_failed} failed)` : ""}`}
                {b.channel === "both" && " · "}
                {b.channel !== "sms" && `${b.email_sent} email${b.email_sent === 1 ? "" : "s"}${b.email_failed ? ` (${b.email_failed} failed)` : ""}`}
                {b.demo ? " · demo" : ""} · {AUD.find((a) => a.value === b.audience?.type)?.label || "All members"}
              </p>
            </li>))}</ul>)}
      </Card>
    </div>
  );
}
