import React, { useRef, useState } from "react";
import { FileUp, Download } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { Button, Card, Chip, Textarea } from "./ui";
import ScrollLock from "./ScrollLock";

// Admin -> Members -> "Import from CSV". Three steps: pick a file, preview exactly what will happen
// (nothing is saved yet), then import. Rows with missing details are still added; see
// backend/routes/member_import.py for the rules.

const TEMPLATE = [
  ["name", "email", "phone", "birthday", "title", "company", "location", "bio", "linkedin", "instagram", "website", "skills", "interests", "goals"],
  ["Ada Okafor", "ada@example.com", "+1 416 555 0101", "1990-04-23", "Founder", "Okafor Labs", "Toronto", "Building tools for small shops", "https://linkedin.com/in/ada", "@ada", "https://okaforlabs.com", "Product; Fundraising", "Running; Jazz", "Find a CTO"],
  ["Marcus Bell", "marcus@example.com", "", "", "", "", "Mississauga", "", "", "", "", "", "", ""],
  ["", "sam.lee@example.com", "", "", "", "", "", "", "", "", "", "", "", ""],
];
const toCsv = (rows) => rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(",")).join("\n");

function download(name, text) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch { toast.error("Your browser blocked the download."); }
}

const STATUS = {
  will_create: { label: "Will be added", cls: "text-green-600" }, created: { label: "Added", cls: "text-green-600" },
  skipped: { label: "Skipped", cls: "text-muted" },
};

export default function MemberImport({ onDone }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState(false);
  const [ok, setOk] = useState(false);
  const fileRef = useRef(null);

  const reset = () => { setText(""); setFileName(""); setPreview(null); setResult(null); setInvite(false); setOk(false); setBusy(false); };
  const close = () => { setOpen(false); reset(); };

  const pickFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    if (f.size > 1_500_000) return toast.error("That file is too big. Split it into files of up to 1,000 people.");
    try { setText(await f.text()); setFileName(f.name); } catch { toast.error("Couldn't read that file."); }
  };

  const check = async () => {
    setBusy(true);
    try { const { data } = await api.post("/admin/members/import", { csv: text, dry_run: true }); setPreview(data); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/admin/members/import", { csv: text, dry_run: false, send_invites: invite, confirm_permission: ok });
      setResult(data); toast.success(`${data.created} member${data.created === 1 ? "" : "s"} added`); onDone?.();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const links = (result?.rows || []).filter((r) => r.link);
  const step = result ? 3 : preview ? 2 : 1;

  return (
    <>
      <Card className="flex flex-wrap items-center justify-between gap-4" data-testid="member-import-card">
        <div>
          <p className="font-medium">Add many members at once</p>
          <p className="text-sm text-muted">Upload a CSV and Pathwai creates a profile for each person, even if some details are missing.</p>
        </div>
        <Button variant="ghost" onClick={() => setOpen(true)} data-testid="member-import-open"><FileUp className="h-4 w-4" /> Import from CSV</Button>
      </Card>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={close}>
          <ScrollLock />
          <div className="max-h-modal-lg w-full max-w-3xl overflow-y-auto overscroll-contain rounded-xl2 bg-surface p-6" onClick={(e) => e.stopPropagation()} data-testid="member-import-modal">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Import members from a CSV</h2>
              <button onClick={close} className="text-muted hover:text-ink" aria-label="Close">✕</button>
            </div>

            {step === 1 && (
              <div className="space-y-4">
                <p className="text-sm text-muted">Each row becomes a member. You only need a name <em>or</em> an email: leave anything you don't have blank. Nothing is saved until you've seen a preview.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" onChange={pickFile} data-testid="member-import-file" />
                  <Button onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" /> Choose a CSV file</Button>
                  <Button variant="ghost" onClick={() => download("pathwai-members-template.csv", toCsv(TEMPLATE))} data-testid="member-import-template"><Download className="h-4 w-4" /> Download template</Button>
                  {fileName && <span className="text-sm text-muted" data-testid="member-import-filename">{fileName}</span>}
                </div>
                <details className="text-sm" open={!!text && !fileName}>
                  <summary className="cursor-pointer text-muted">Or paste rows from a spreadsheet</summary>
                  <Textarea rows={6} className="mt-2 font-mono text-xs" placeholder={"name,email\nAda Okafor,ada@example.com"} value={text} onChange={(e) => { setText(e.target.value); setFileName(""); }} data-testid="member-import-text" />
                </details>
                <p className="text-xs text-muted">Columns it understands: name (or first and last name), email, phone, birthday (like 1990-04-23; age is worked out from it), title, company, location, bio, tagline, linkedin, instagram, website, skills, interests, goals. Other columns are ignored. Up to 1,000 people per file.</p>
                <div className="flex justify-end"><Button onClick={check} loading={busy} disabled={!text.trim()} data-testid="member-import-preview">Preview</Button></div>
              </div>)}

            {step === 2 && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2" data-testid="member-import-summary">
                  <Chip accent>{preview.created} will be added</Chip>
                  {preview.skipped > 0 && <Chip>{preview.skipped} skipped</Chip>}
                  {preview.without_email > 0 && <Chip>{preview.without_email} without an email</Chip>}
                  {preview.already_have_login > 0 && <Chip>{preview.already_have_login} already have a Pathwai login</Chip>}
                </div>
                {preview.columns_ignored.length > 0 && <p className="text-xs text-muted">Not imported (unrecognised columns): {preview.columns_ignored.join(", ")}</p>}
                <div className="max-h-72 overflow-auto rounded-xl border border-line">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-surface text-xs text-muted"><tr><th className="p-2">Row</th><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">What happens</th></tr></thead>
                    <tbody>
                      {preview.rows.slice(0, 200).map((r) => (
                        <tr key={r.line} className="border-t border-line align-top" data-testid="member-import-row">
                          <td className="p-2 text-muted">{r.line}</td>
                          <td className="p-2">{r.name}</td>
                          <td className="p-2 break-all">{r.email || <span className="text-muted">none</span>}</td>
                          <td className="p-2"><span className={STATUS[r.status]?.cls}>{STATUS[r.status]?.label}</span>{r.reason ? <span className="text-muted"> · {r.reason}</span> : null}
                            {(r.notes || []).map((n) => <p key={n} className="text-xs text-muted">{n}</p>)}</td>
                        </tr>))}
                    </tbody>
                  </table>
                </div>
                {preview.rows.length > 200 && <p className="text-xs text-muted">Showing the first 200 of {preview.rows.length} rows.</p>}
                <div className="space-y-2 rounded-xl bg-ink/5 p-3 text-sm">
                  <p className="text-muted">Everyone added is approved straight away and shows in the directory. They don't have a password yet: each person gets a link (valid {preview.link_days} days) to set one.</p>
                  <label className={"flex items-start gap-2 " + (preview.email_configured ? "" : "opacity-60")}>
                    <input type="checkbox" className="mt-1" checked={invite} disabled={!preview.email_configured} onChange={(e) => setInvite(e.target.checked)} data-testid="member-import-invite" />
                    <span>Email each person their link{!preview.email_configured && " (email sending isn't set up yet, so you'll get the links to share yourself)"}</span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" checked={ok} onChange={(e) => setOk(e.target.checked)} data-testid="member-import-confirm" />
                    <span>I have these people's permission to add them, and they agree to Pathwai's Terms and Privacy Policy.</span>
                  </label>
                </div>
                <div className="flex justify-between gap-2">
                  <Button variant="ghost" onClick={() => setPreview(null)}>Back</Button>
                  <Button onClick={run} loading={busy} disabled={!ok || preview.created === 0} data-testid="member-import-run">Add {preview.created} member{preview.created === 1 ? "" : "s"}</Button>
                </div>
              </div>)}

            {step === 3 && (
              <div className="space-y-4" data-testid="member-import-done">
                <p className="text-lg font-medium">{result.created} member{result.created === 1 ? "" : "s"} added{result.skipped ? `, ${result.skipped} skipped` : ""}.</p>
                {result.emailed > 0 && <p className="text-sm text-muted">{result.emailed} invitation email{result.emailed === 1 ? "" : "s"} sent.</p>}
                {links.length > 0 && (
                  <div className="space-y-2 rounded-xl bg-ink/5 p-3 text-sm">
                    <p>{links.length} {links.length === 1 ? "person needs" : "people need"} a link to set their password. Each works for {result.link_days} days and for that person only. Send them yourself (email, WhatsApp, text), and treat the file like a password list.</p>
                    <Button variant="ghost" onClick={() => download("pathwai-sign-in-links.csv", toCsv([["name", "email", "link"], ...links.map((r) => [r.name, r.email, r.link])]))} data-testid="member-import-links"><Download className="h-4 w-4" /> Download sign-in links</Button>
                    <p className="text-xs text-muted">Anyone can also use "Forgot password" on the sign-in page once email sending is set up.</p>
                  </div>)}
                {result.without_email > 0 && <p className="text-sm text-muted">{result.without_email} profile{result.without_email === 1 ? " was" : "s were"} added without an email. They're in the directory but can't sign in until an email is added.</p>}
                <div className="flex justify-end"><Button onClick={close} data-testid="member-import-close">Done</Button></div>
              </div>)}
          </div>
        </div>)}
    </>
  );
}
