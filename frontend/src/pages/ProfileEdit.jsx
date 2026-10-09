import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errMsg, timeAgo } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Circle } from "lucide-react";
import { Ring, OPTIONAL_NOTE } from "../components/ProfileNudge";
import { AvatarUpload, Button, Card, Field, Input, PageHeader, SectionCard, Select, Spinner, StatusBadge, TagInput, Textarea } from "../components/ui";
import { fieldLabel, fieldOn, prettyDate, SUGGEST, oldestISO, todayISO } from "../lib/profile";

const ARR = ["expertise", "services_offered", "topics_can_advise_on", "needs_seeking", "interests_hobbies"];
const STR = ["name", "title", "company", "location", "bio", "venture_tagline", "startup_name", "startup_one_liner"];

function RequestCard({ r, onDone }) {
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await api.post(`/profile-requests/${r.id}/submit`, { response: vals }); toast.success("Profile updated"); onDone(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const pdf = async (file) => {
    const fd = new FormData(); fd.append("file", file);
    try { const { data } = await api.post(`/profile-requests/${r.id}/extract-pdf`, fd); setVals({ ...vals, ...data.draft }); toast.success("Draft filled from your PDF — review before saving"); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Card className="!border-amber-400/40 !bg-amber-400/10" data-testid="profile-request">
      <div className="mb-3 flex items-start justify-between"><div><p className="font-medium">{r.title}</p><p className="text-sm text-muted">{r.prompt}</p></div>
        <button className="text-xs text-muted" onClick={async () => { await api.post(`/profile-requests/${r.id}/dismiss`); onDone(); }}>Dismiss</button></div>
      <div className="space-y-3">
        {r.fields.map((f) => (
          <Field key={f.key} label={f.label}>
            {f.type === "longtext" || f.type === "list" ? <Textarea placeholder={f.placeholder} value={Array.isArray(vals[f.key]) ? vals[f.key].join("\n") : vals[f.key] || ""} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
              : <Input placeholder={f.placeholder} value={vals[f.key] || ""} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />}
          </Field>))}
        {r.supports_pdf && <label className="btn-ghost cursor-pointer">Fill from PDF<input type="file" accept="application/pdf" hidden onChange={(e) => e.target.files[0] && pdf(e.target.files[0])} /></label>}
        <Button onClick={submit} loading={busy}>Save</Button>
      </div>
    </Card>
  );
}

const sections = (cfg) => [
  ["About you", [["name", "Name"], ...(fieldOn(cfg, "age") ? [["birthday", "Birthday", "date", "Others see your age, not this date"]] : []), ["height", fieldLabel(cfg, "height"), "text", "5'10\" or 178 cm"], ["title", fieldLabel(cfg, "title")], ["company", "Employer or school"], ["location", "Neighbourhood"], ["bio", "About you", "longtext"]]],
  ["Skills & interests", [["skill_set", fieldLabel(cfg, "skill_set"), "tags"], ["interests_hobbies", fieldLabel(cfg, "interests_hobbies"), "tags"]]],
  ["Goals & support", [["goals", fieldLabel(cfg, "goals"), "tags"], ["support_needs", fieldLabel(cfg, "support_needs"), "tags"]]],
];

function Value({ v, type }) {
  if (Array.isArray(v)) return v.length ? <div className="flex flex-wrap gap-1">{v.map((x) => <span key={x} className="chip">{x}</span>)}</div> : <span className="text-muted">Not added yet</span>;
  if (!v) return <span className="text-sm text-muted">Not added yet</span>;
  // Short fields (name, email, a URL…) sit in a 2-up grid on mobile now, so they need to truncate
  // instead of overflowing into the next column — longtext (bio) is the one type that still needs
  // to wrap and show in full.
  if (type === "date") return <span className="block truncate text-sm">{prettyDate(v)}</span>;
  return type === "longtext" ? <span className="whitespace-pre-wrap text-sm">{v}</span> : <span className="block truncate text-sm">{v}</span>;
}

function Section({ title, fields, data, onSaved, openSignal }) {
  const [edit, setEdit] = useState(false);
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  const start = () => { const v = {}; fields.forEach(([k]) => { v[k] = data[k] ?? ""; }); setVals(v); setEdit(true); };
  // Jumped to from the checklist: open this box for editing (once per tap) and bring it into view.
  useEffect(() => { if (openSignal && openSignal.title === title) { start(); setTimeout(() => document.getElementById("sec-" + title)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60); } }, [openSignal]); // eslint-disable-line
  const save = async () => { setBusy(true); try { const { data: r } = await api.patch("/me/profile", { values: vals }); toast.success("Saved"); setEdit(false); onSaved(r); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  return (
    <div id={"sec-" + title} className="scroll-mt-24">
    <SectionCard title={title} action={edit ? <div className="flex gap-2"><Button variant="ghost" className="!py-1" onClick={() => setEdit(false)}>Cancel</Button><Button className="!py-1" loading={busy} onClick={save} data-testid={`save-${title}`}>Save</Button></div> : <Button variant="ghost" className="!py-1" onClick={start} data-testid={`edit-${title}`}>Edit</Button>}>
      <div className={edit ? "grid gap-4 sm:grid-cols-2" : "grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-2"}>
        {fields.map(([k, label, type, ph]) => (
          <div key={k} className={"min-w-0" + (type === "longtext" || type === "tags" ? " col-span-2" : "")}>
            {edit ? (
              <Field label={label}>
                {type === "longtext" ? <Textarea value={vals[k] || ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
                  : type === "tags" ? <TagInput value={Array.isArray(vals[k]) ? vals[k] : []} suggestions={SUGGEST[k]} onChange={(v) => setVals({ ...vals, [k]: v })} />
                  : type === "level" ? <Select value={vals[k] || ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} options={[{ value: "", label: "Choose…" }, ...LEVELS]} />
                  : <Input data-testid={`profile-${k}`} type={type === "number" ? "number" : type === "url" ? "url" : type === "date" ? "date" : "text"} placeholder={ph} {...(type === "date" ? { min: oldestISO(), max: todayISO() } : {})} value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />}
              </Field>
            ) : (<><p className="label truncate">{label}</p><Value v={data[k]} type={type} /></>)}
          </div>))}
      </div>
    </SectionCard>
    </div>
  );
}

function ContactSection({ data, onSaved }) {
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [c, setC] = useState(data.contact || {});
  const [vis, setVis] = useState(data.contact_visibility || "members");
  const F = ["email", "phone", "linkedin", "instagram", "website"];
  const ph = { email: "you@example.com", phone: "+1 416 555 0100", linkedin: "https://linkedin.com/in/you", instagram: "@you", website: "https://" };
  const start = () => { setC(data.contact || {}); setVis(data.contact_visibility || "members"); setEdit(true); };
  const save = async () => {
    setBusy(true);
    try { const { data: r } = await api.patch("/me/profile", { values: { contact: c, contact_visibility: vis } }); onSaved(r); toast.success("Contact details saved"); setEdit(false); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <SectionCard title="Contact details" action={edit ? <div className="flex gap-2"><Button variant="ghost" className="!py-1" onClick={() => setEdit(false)}>Cancel</Button><Button className="!py-1" loading={busy} onClick={save} data-testid="contact-save">Save</Button></div> : <Button variant="ghost" className="!py-1" onClick={start} data-testid="edit-Contact details">Edit</Button>}>
      {edit ? (
        <>
          <p className="mb-3 text-sm text-muted">Optional. Shown on your profile in this community so members can reach you. Your details in other communities are separate.</p>
          <div className="grid gap-3 sm:grid-cols-2">{F.map((k) => <Field key={k} label={k[0].toUpperCase() + k.slice(1)}><Input data-testid={`contact-${k}`} placeholder={ph[k]} value={c[k] || ""} onChange={(e) => setC({ ...c, [k]: e.target.value })} /></Field>)}</div>
          <div className="mt-4"><Select value={vis} onChange={(e) => setVis(e.target.value)} options={[{ value: "members", label: "Visible to community members" }, { value: "hidden", label: "Hidden (message me in the app)" }]} /></div>
        </>
      ) : (
        <>
        <p className="mb-3 text-xs text-muted">Optional. LinkedIn, Instagram and website don't count toward your profile percentage.</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-2">
          {F.map((k) => <div key={k} className="min-w-0"><p className="label truncate">{k[0].toUpperCase() + k.slice(1)}</p><Value v={data.contact?.[k]} /></div>)}
        </div>
        </>
      )}
    </SectionCard>
  );
}

function Documents({ data, onSaved }) {
  const [docs, setDocs] = useState(data.documents || []);
  const [t, setT] = useState(""); const [u, setU] = useState("");
  const persist = async (values) => { try { const { data: r } = await api.patch("/me/profile", { values }); onSaved(r); toast.success("Saved"); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <SectionCard title="Documents and links">
      <p className="mb-2 text-xs text-muted">Optional. Documents and links don't count toward your profile percentage.</p>
      <div className="space-y-2">{docs.length === 0 && <p className="text-sm text-muted">No documents yet. Add a signed form or anything the team asked for.</p>}
        {docs.map((d, i) => <div key={i} className="flex items-center justify-between text-sm"><a className="underline" href={d.url} target="_blank" rel="noreferrer">{d.title || d.url}</a><button className="text-xs text-muted hover:text-ink" onClick={() => { const n = docs.filter((_, j) => j !== i); setDocs(n); persist({ documents: n }); }}>Remove</button></div>)}</div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]"><Input placeholder="Title" value={t} onChange={(e) => setT(e.target.value)} /><Input type="url" placeholder="https://" value={u} onChange={(e) => setU(e.target.value)} />
        <Button variant="ghost" disabled={!u.trim()} onClick={() => { const n = [...docs, { title: t || "Document", url: u }]; setDocs(n); setT(""); setU(""); persist({ documents: n }); }}>Add</Button></div>
    </SectionCard>
  );
}

export default function ProfileEdit() {
  const { user, setUser, config } = useAuth();
  const [f, setF] = useState(null);
  const [comp, setComp] = useState(null);
  const [eng, setEng] = useState(null);
  const [reqs, setReqs] = useState([]);
  const [params, setParams] = useSearchParams();
  const [openSignal, setOpenSignal] = useState(null);
  const loadReqs = () => api.get("/me/profile-requests").then((r) => setReqs(r.data.requests)).catch(() => {});
  const loadAll = () => { api.get(`/users/${user.id}`).then((r) => setF(r.data)); api.get("/me/profile-completion").then((r) => setComp(r.data)); };
  useEffect(() => { loadAll(); loadReqs(); api.get("/me/engagement").then((r) => setEng(r.data)); }, [user.id]); // eslint-disable-line
  // /profile?focus=bio (from the home page checklist) jumps straight to the right box.
  const focusKey = params.get("focus");
  useEffect(() => {
    if (!focusKey || !f || !comp) return;
    jump(focusKey);
    const next = new URLSearchParams(params); next.delete("focus"); setParams(next, { replace: true });
  }, [focusKey, !!f, !!comp]); // eslint-disable-line
  if (!f || !comp) return <Spinner />;
  function jump(key) {
    if (key === "avatar_url") { document.querySelector('[data-testid="photo-card"]')?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const sec = sections(config).find(([, fields]) => fields.some(([k]) => k === key));
    if (sec) setOpenSignal({ title: sec[0], n: Date.now() });
  }
  const todo = (comp.missing_keys || []).map((k, i) => ({ key: k, label: (comp.missing || [])[i] || k }));
  const saved = (r) => { setF(r.user); setComp(r.completion); setUser({ ...user, ...r.user }); };
  const upload = async (url) => {
    try { const { data: r } = await api.patch("/me/profile", { values: { avatar_url: url } }); saved(r); toast.success("Photo updated"); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="space-y-5">
      <PageHeader title="My profile" subtitle="This is your profile. It's what everyone in the community sees, and how we recommend connections." />
      <Card className="flex flex-wrap items-center gap-5" data-testid="photo-card">
        <div className="min-w-[11rem] flex-1">
          <p className="font-display text-2xl">{f.name}</p>
          <p className="text-sm text-muted">{[f.age && `${f.age} yrs`, f.height?.split(" · ")[0], f.title].filter(Boolean).join(" · ")}</p>
          <p className="mt-2 text-xs text-muted">Add a clear photo of your face — you can drag and zoom to fit it to the square yourself.</p>
        </div>
        <AvatarUpload photo={f.avatar_url} onChange={upload} name={f.name} size={104} testId="photo-upload" label="Upload photo" variant="primary" />
      </Card>
      <Card data-testid="profile-completion">
        <div className="flex items-center gap-4">
          <Ring value={comp.percent} size={64} />
          <div className="min-w-0">
            <p className="font-display text-xl">{todo.length === 0 ? "Your profile is complete" : "Finish your profile"}</p>
            <p className="text-sm text-muted">{todo.length === 0 ? "Everyone in the community can see the full picture." : `${todo.length} ${todo.length === 1 ? "thing" : "things"} left to reach 100%. Tap one to fill it in.`}</p>
          </div>
        </div>
        {todo.length > 0 && (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2" data-testid="profile-todo">
            {todo.map((m) => (
              <li key={m.key}><button type="button" onClick={() => jump(m.key)} data-testid={`todo-${m.key}`} className="flex w-full items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-left text-sm hover:border-ink/40 hover:bg-ink/5">
                <Circle className="h-4 w-4 shrink-0 text-muted" /><span className="min-w-0 flex-1 truncate">{m.label}</span><span className="shrink-0 text-xs underline">Add</span></button></li>))}
          </ul>)}
        {comp.percent > 0 && todo.length > 0 && <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><Check className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />Done so far: {Object.entries(comp.sections || {}).map(([n, v]) => `${n} ${v.done}/${v.total}`).join(" · ")}</p>}
        <p className="mt-3 rounded-lg bg-ink/5 px-3 py-2 text-xs text-muted" data-testid="optional-note">{OPTIONAL_NOTE}</p>
      </Card>
      {reqs.map((r) => <RequestCard key={r.id} r={r} onDone={() => { loadReqs(); loadAll(); }} />)}
      <div className="grid gap-5 lg:grid-cols-2">
        {sections(config).map(([title, fields]) => <div key={title} className={fields.length > 4 ? "lg:col-span-2" : ""}><Section title={title} fields={fields} data={f} onSaved={saved} openSignal={openSignal} /></div>)}
        <ContactSection data={f} onSaved={saved} />
        <Documents data={f} onSaved={saved} />
        <SectionCard title="Games and events">
          {!eng ? <Spinner /> : eng.events.length === 0 ? <p className="text-sm text-muted">No games yet. RSVP to one and it shows here.</p> : <ul className="space-y-2 text-sm">{eng.events.slice(0, 5).map((e) => <li key={e.id} className="flex justify-between gap-3"><Link className="hover:underline" to={`/events/${e.id}`}>{e.title}</Link><span className="eyebrow">{e.attended ? "attended" : e.rsvp}</span></li>)}</ul>}
        </SectionCard>
        <SectionCard title="Perks activity">
          {!eng ? <Spinner /> : (eng.resources_saved.length + eng.resources_opened.length) === 0 ? <p className="text-sm text-muted">Guides you save or open appear here.</p> : <ul className="space-y-2 text-sm">{[...eng.resources_saved.map((r) => ({ ...r, tag: "saved" })), ...eng.resources_opened.map((r) => ({ ...r, tag: "opened" }))].slice(0, 6).map((r, i) => <li key={i} className="flex justify-between gap-3"><span>{r.title}</span><span className="eyebrow">{r.tag}</span></li>)}</ul>}
        </SectionCard>
        <SectionCard title="Coaches and support">
          {!eng ? <Spinner /> : <div className="space-y-2 text-sm">{eng.mentors.map((m) => <p key={m.id}><Link className="underline" to={`/members/${m.id}`}>{m.name}</Link> <span className="text-muted">· your coach</span></p>)}
            {eng.support_history.length === 0 && eng.mentors.length === 0 && <p className="text-muted">No support requests yet.</p>}
            {eng.support_history.slice(0, 4).map((s) => <p key={s.id} className="flex items-center justify-between gap-3"><span>{s.title}</span><StatusBadge status={s.status} /></p>)}</div>}
        </SectionCard>
        <SectionCard title="Updates and activity">
          {!eng ? <Spinner /> : eng.activity.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : <ul className="space-y-1.5 text-sm">{eng.activity.slice(0, 6).map((a, i) => <li key={i} className="flex justify-between gap-3"><span className="text-ink/80">{a.action.replace(/[._]/g, " ")}</span><span className="text-xs text-muted">{timeAgo(a.at)}</span></li>)}</ul>}
        </SectionCard>
      </div>
    </div>
  );
}
