import React, { useEffect, useRef, useState } from "react";
import { Download, FileUp, Link2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../lib/api";
import { Button, Card, Chip, Field, Input, Select, Tabs } from "../components/ui";
import MemberImport from "../components/MemberImport";

// Admin -> Import your data. Pathwai does the work itself (members, events, tickets, texts), so there is nothing to
// connect: if the old data lives in a spreadsheet, a guest-list export or a calendar, bring it in from a file or a
// link. Every import is a preview first; nothing is saved until the admin has seen what will happen.
// See backend/routes/data_import.py.

const toCsv = (rows) => rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(",")).join("\n");
function download(name, text) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch { toast.error("Your browser blocked the download."); }
}
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { return undefined; } };
const isCalendar = (name, text) => /\.ics$/i.test(name || "") || /BEGIN:VCALENDAR/i.test((text || "").slice(0, 2000));

const STATUS = {
  will_create: ["Will be added", "text-green-600"], created: ["Added", "text-green-600"],
  will_update: ["Will be updated", "text-green-600"], updated: ["Updated", "text-green-600"],
  will_add: ["Will be marked going", "text-green-600"], added: ["Marked going", "text-green-600"],
  not_member: ["Not a member yet", "text-amber-600"], skipped: ["Skipped", "text-muted"],
};

/** Pick where the data comes from: a file on this computer, or a link to a sheet or calendar. */
function Source({ value, onChange, accept, linkHint, testid }) {
  const [mode, setMode] = useState("file");
  const fileRef = useRef(null);
  const pick = async (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    if (f.size > 1_500_000) return toast.error("That file is too big. Split it into smaller files.");
    try { onChange({ text: await f.text(), name: f.name, url: "" }); } catch { toast.error("Couldn't read that file."); }
  };
  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-line p-0.5 text-sm" role="tablist">
        {[["file", "Upload a file"], ["link", "Paste a link"]].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} data-testid={`${testid}-mode-${k}`}
            className={"rounded-md px-3 py-1.5 " + (mode === k ? "bg-ink text-paper" : "text-muted hover:text-ink")}>{l}</button>))}
      </div>
      {mode === "file" ? (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={pick} data-testid={`${testid}-file`} />
          <Button onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" /> Choose a file</Button>
          {value.name && <span className="text-sm text-muted" data-testid={`${testid}-filename`}>{value.name}</span>}
        </div>
      ) : (
        <Field label="Link" hint={linkHint}>
          <div className="flex items-center gap-2"><Link2 className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <Input placeholder="https://docs.google.com/spreadsheets/d/…" value={value.url} onChange={(e) => onChange({ text: "", name: "", url: e.target.value })} data-testid={`${testid}-url`} /></div>
        </Field>)}
    </div>
  );
}
const hasSource = (v) => !!(v.text?.trim() || v.url?.trim());

function Preview({ data, columns, extra }) {
  return (
    <div className="space-y-3" data-testid="import-preview">
      <div className="flex flex-wrap gap-2">
        {Object.entries(data.chips).map(([k, n]) => n > 0 && <Chip key={k} accent={k === "main"}>{n} {k === "main" ? data.mainLabel : k}</Chip>)}
      </div>
      {data.columns_ignored?.length > 0 && <p className="text-xs text-muted">Not used (unrecognised columns): {data.columns_ignored.join(", ")}</p>}
      <div className="max-h-72 overflow-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-surface text-xs text-muted"><tr><th className="p-2">Row</th>{columns.map((c) => <th key={c.label} className="p-2">{c.label}</th>)}<th className="p-2">What happens</th></tr></thead>
          <tbody>
            {data.rows.slice(0, 200).map((r) => (
              <tr key={r.line} className="border-t border-line align-top" data-testid="import-row">
                <td className="p-2 text-muted">{r.line}</td>
                {columns.map((c) => <td key={c.label} className="p-2 break-words">{c.render(r) || <span className="text-muted">none</span>}</td>)}
                <td className="p-2"><span className={STATUS[r.status]?.[1]}>{STATUS[r.status]?.[0]}</span>{r.reason ? <span className="text-muted"> · {r.reason}</span> : null}
                  {(r.notes || []).map((n) => <p key={n} className="text-xs text-muted">{n}</p>)}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
      {data.rows.length > 200 && <p className="text-xs text-muted">Showing the first 200 of {data.rows.length} rows.</p>}
      {extra}
    </div>
  );
}

const EVENT_TEMPLATE = [
  ["title", "date", "time", "end time", "location", "description", "category", "capacity", "price", "link"],
  ["Founders Coffee", "2026-11-12", "18:00", "20:00", "MaRS, Toronto", "Casual check-in for founders", "Meetup", "40", "", ""],
  ["Pitch Night", "Nov 19, 2026", "7:00 PM", "9:30 PM", "Online", "Five pitches, live feedback", "Workshop", "", "$15", "https://example.com/tickets"],
];
const GUEST_TEMPLATE = [["name", "email", "status"], ["Ada Okafor", "ada@example.com", "approved"], ["Marcus Bell", "marcus@example.com", "going"]];

function EventsImport({ onDone }) {
  const [src, setSrc] = useState({ text: "", name: "", url: "" });
  const [past, setPast] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const body = (dry) => ({ [isCalendar(src.name, src.text) ? "ics" : "csv"]: src.text || "", url: src.text ? "" : src.url, dry_run: dry, include_past: past, timezone: tz() });
  const run = async (dry) => {
    setBusy(true);
    try {
      const { data } = await api.post("/admin/import/events", body(dry));
      if (dry) setPreview(data); else { setResult(data); toast.success(`${data.created + data.updated} event${data.created + data.updated === 1 ? "" : "s"} brought in`); onDone?.(); }
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const reset = () => { setSrc({ text: "", name: "", url: "" }); setPreview(null); setResult(null); };
  if (result) return (
    <div className="space-y-3" data-testid="import-events-done">
      <p className="text-lg font-medium">{result.created} event{result.created === 1 ? "" : "s"} added{result.updated ? `, ${result.updated} updated` : ""}{result.skipped ? `, ${result.skipped} skipped` : ""}.</p>
      <p className="text-sm text-muted">They are on your Events page now. Members were not notified, so a big import stays quiet.</p>
      <Button variant="ghost" onClick={reset}>Import more</Button>
    </div>);
  if (preview) return (
    <div className="space-y-4">
      <Preview data={{ ...preview, mainLabel: "will be added", chips: { main: preview.created, "will be updated": preview.updated, skipped: preview.skipped } }}
        columns={[{ label: "Event", render: (r) => r.title }, { label: "When", render: (r) => (r.starts_at ? fmtDate(r.starts_at) : "") }]} />
      <div className="flex justify-between gap-2"><Button variant="ghost" onClick={() => setPreview(null)}>Back</Button>
        <Button onClick={() => run(false)} loading={busy} disabled={preview.created + preview.updated === 0} data-testid="import-events-run">Bring in {preview.created + preview.updated} event{preview.created + preview.updated === 1 ? "" : "s"}</Button></div>
    </div>);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">From a spreadsheet of events, a calendar file (.ics), or a link to a Google Sheet or a calendar (Google, Apple, Outlook, Luma and others give you one). Re-import a calendar link any time to pick up changes.</p>
      <Source value={src} onChange={setSrc} accept=".csv,.tsv,.txt,.ics,text/csv,text/calendar,text/plain" testid="events" linkHint="A Google Sheet shared as “anyone with the link can view”, a sheet published to the web, or a calendar feed link." />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={() => download("pathwai-events-template.csv", toCsv(EVENT_TEMPLATE))} data-testid="events-template"><Download className="h-4 w-4" /> Spreadsheet template</Button>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-accent" checked={past} onChange={(e) => setPast(e.target.checked)} />Include events that already happened</label>
      </div>
      <p className="text-xs text-muted">Only a title and a date are needed. Times read in your timezone ({tz() || "Toronto"}); a date with no time starts at 6 PM.</p>
      <div className="flex justify-end"><Button onClick={() => run(true)} loading={busy} disabled={!hasSource(src)} data-testid="import-events-preview">Preview</Button></div>
    </div>
  );
}

function GuestsImport({ onDone }) {
  const [events, setEvents] = useState(null);
  const [eventId, setEventId] = useState("");
  const [src, setSrc] = useState({ text: "", name: "", url: "" });
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/events").then((r) => { setEvents(r.data); if (r.data[0]) setEventId(r.data[0].id); }).catch(() => setEvents([])); }, []);
  const run = async (dry) => {
    setBusy(true);
    try {
      const { data } = await api.post("/admin/import/guests", { event_id: eventId, csv: src.text || "", url: src.text ? "" : src.url, dry_run: dry });
      if (dry) setPreview(data); else { setResult(data); toast.success(`${data.added} guest${data.added === 1 ? "" : "s"} marked going`); onDone?.(); }
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const reset = () => { setSrc({ text: "", name: "", url: "" }); setPreview(null); setResult(null); };
  if (result) return (
    <div className="space-y-3" data-testid="import-guests-done">
      <p className="text-lg font-medium">{result.added} guest{result.added === 1 ? "" : "s"} marked going for {result.event_title}.</p>
      {result.not_members > 0 && <p className="text-sm text-muted">{result.not_members} {result.not_members === 1 ? "person isn't" : "people aren't"} members yet. Add them under Members first (the same file works), then import this list again.</p>}
      <Button variant="ghost" onClick={reset}>Import another list</Button>
    </div>);
  if (preview) return (
    <div className="space-y-4">
      <Preview data={{ ...preview, mainLabel: "will be marked going", chips: { main: preview.added, "not members yet": preview.not_members, skipped: preview.skipped } }}
        columns={[{ label: "Name", render: (r) => r.name }, { label: "Email", render: (r) => r.email }]}
        extra={preview.not_members > 0 && <p className="text-sm text-muted">People who aren't members yet are left out. Import them as members first (the same file works), then run this again.</p>} />
      <div className="flex justify-between gap-2"><Button variant="ghost" onClick={() => setPreview(null)}>Back</Button>
        <Button onClick={() => run(false)} loading={busy} disabled={preview.added === 0} data-testid="import-guests-run">Mark {preview.added} going</Button></div>
    </div>);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Already ran this event somewhere else? Bring the guest list in and everyone who is a member shows as going. Guests are matched to members by email. Anyone marked declined, waitlisted or cancelled is left out.</p>
      <Field label="Event"><Select value={eventId} onChange={(e) => setEventId(e.target.value)} options={(events || []).map((e) => ({ value: e.id, label: `${e.title} · ${fmtDate(e.starts_at)}` }))} data-testid="guests-event" /></Field>
      <Source value={src} onChange={setSrc} accept=".csv,.tsv,.txt,text/csv,text/plain" testid="guests" linkHint="A Google Sheet shared as “anyone with the link can view”, or a sheet published to the web." />
      <div className="flex flex-wrap items-center gap-3"><Button variant="ghost" onClick={() => download("pathwai-guest-list-template.csv", toCsv(GUEST_TEMPLATE))}><Download className="h-4 w-4" /> Template</Button>
        <span className="text-xs text-muted">Needs an email column. A status column is optional.</span></div>
      <div className="flex justify-end"><Button onClick={() => run(true)} loading={busy} disabled={!hasSource(src) || !eventId} data-testid="import-guests-preview">Preview</Button></div>
    </div>
  );
}

export default function ImportData() {
  const [tab, setTab] = useState("events");
  return (
    <div className="space-y-4" data-testid="import-page">
      <p className="text-sm text-muted">Pathwai runs your members, events, tickets, texts and email itself, so there's nothing to connect and nothing to type in twice. If your old information lives in a spreadsheet or a calendar, bring it in here. Airtable users: open the view, choose Download CSV, and upload that file.</p>
      <Tabs tabs={[{ value: "events", label: "Events" }, { value: "guests", label: "Guest list" }, { value: "members", label: "Members" }]} value={tab} onChange={setTab} />
      {tab === "events" && <Card><EventsImport /></Card>}
      {tab === "guests" && <Card><GuestsImport /></Card>}
      {tab === "members" && <MemberImport />}
    </div>
  );
}
