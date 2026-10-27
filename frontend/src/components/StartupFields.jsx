import React, { useState } from "react";
import { Plus, Rocket, X } from "lucide-react";
import { Field, Input, Select, Textarea, cx } from "./ui";
import { AUDIENCES, AUDIENCE_LABEL, NEEDS, NEED_LABEL, PROVINCES, SECTORS, STAGES, STAGE_HINT, STAGE_LABEL } from "../lib/navigator";

// The startup half of the account profile. It lives on the account (not in any one community) and is what the
// Navigator starts from, so advice and community suggestions begin with who you are instead of a blank form.
// Same words and options as the Navigator itself (lib/navigator.js), so the two can never disagree.
// Backend: clean_startup() in navigator.py, saved through PATCH /hub/profile as `startup`.

export const BLANK_STARTUP = { name: "", one_liner: "", stage: "idea", sectors: [], needs: ["funding", "mentorship"], audiences: [], incorporated: "unsure", employees: "", province: "ON", goal: "", pitch: {}, documents: [] };

// stored (true/false/null) <-> form ("yes"/"no"/"unsure")
export const startupToForm = (s) => (s && Object.keys(s).length ? {
  ...BLANK_STARTUP, ...s, pitch: s.pitch || {}, documents: s.documents || [], employees: s.employees == null ? "" : String(s.employees),
  incorporated: s.incorporated === true ? "yes" : s.incorporated === false ? "no" : "unsure",
} : null);
export const startupToApi = (f) => (!f ? {} : {
  ...f, employees: f.employees === "" ? null : Number(f.employees),
  incorporated: f.incorporated === "yes" ? true : f.incorporated === "no" ? false : null,
});  // {} clears it on the account

function Chip({ on, onClick, children, testId }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} data-testid={testId}
      className={cx("rounded-full border px-3 py-1 text-sm transition", on ? "border-transparent font-semibold" : "border-line text-muted hover:text-ink")}
      style={on ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{children}</button>
  );
}

const PITCH = [["problem", "The problem", "Who has it, and what it costs them"], ["solution", "Your answer", "What you built and why it works"], ["traction", "Traction", "Customers, revenue, pilots, waitlist"],
  ["market", "The market", "How big, and who you sell to first"], ["ask", "The ask", "What you need right now, in one line"]];

// Optional: the five pitch "slides" and links to a deck. They show up on your profile page exactly the way a founder's card shows in a community.
function PitchFields({ value, set, testPrefix }) {
  const [open, setOpen] = useState(Object.keys(value.pitch || {}).length > 0 || (value.documents || []).length > 0);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium" style={{ color: "var(--accent)" }} data-testid={`${testPrefix}-pitch-open`}>+ Add your pitch and deck (optional)</button>;
  const pitch = value.pitch || {}; const docs = value.documents || [];
  const setDoc = (i, patch) => set({ documents: docs.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  return (
    <div className="space-y-3 rounded-xl border border-line p-3" data-testid={`${testPrefix}-pitch`}>
      <p className="label">Your pitch</p>
      {PITCH.map(([k, label, hint]) => <Field key={k} label={label}><Textarea rows={2} value={pitch[k] || ""} onChange={(e) => set({ pitch: { ...pitch, [k]: e.target.value } })} maxLength={600} placeholder={hint} data-testid={`${testPrefix}-pitch-${k}`} /></Field>)}
      <div>
        <p className="label">Deck and documents <span className="font-normal normal-case text-muted">(links)</span></p>
        <div className="mt-2 space-y-2">
          {docs.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input className="!w-2/5" value={d.title} onChange={(e) => setDoc(i, { title: e.target.value })} placeholder="Pitch deck" maxLength={80} />
              <Input type="url" value={d.url} onChange={(e) => setDoc(i, { url: e.target.value })} placeholder="https://" maxLength={300} data-testid={`${testPrefix}-doc-url-${i}`} />
              <button type="button" onClick={() => set({ documents: docs.filter((_, j) => j !== i) })} aria-label="Remove link" className="shrink-0 text-muted hover:text-ink"><X className="h-4 w-4" /></button>
            </div>))}
          {docs.length < 6 && <button type="button" onClick={() => set({ documents: [...docs, { title: "", url: "" }] })} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink" data-testid={`${testPrefix}-doc-add`}><Plus className="h-4 w-4" />Add a link</button>}
        </div>
      </div>
    </div>
  );
}

export default function StartupFields({ value, onChange, testPrefix = "su" }) {
  if (!value) {
    return (
      <button type="button" onClick={() => onChange({ ...BLANK_STARTUP })} data-testid={`${testPrefix}-add`}
        className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-line p-4 text-left transition hover:border-ink/40">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Rocket className="h-5 w-5" aria-hidden /></span>
        <span className="min-w-0"><span className="block font-semibold">I'm building something</span><span className="block text-sm text-muted">Add your startup. The Navigator uses it to find programs that fit.</span></span>
      </button>
    );
  }
  const set = (p) => onChange({ ...value, ...p });
  const tog = (k, v) => set({ [k]: value[k].includes(v) ? value[k].filter((x) => x !== v) : [...value[k], v] });
  return (
    <div className="space-y-4 rounded-2xl border border-line p-4" data-testid={`${testPrefix}-form`}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-semibold"><Rocket className="h-4 w-4" aria-hidden />Your startup</p>
        <button type="button" onClick={() => onChange(null)} className="text-sm text-muted hover:text-ink" data-testid={`${testPrefix}-remove`}>Remove</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={value.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} placeholder="Lumen Solar" data-testid={`${testPrefix}-name`} /></Field>
        <Field label="In one line"><Input value={value.one_liner} onChange={(e) => set({ one_liner: e.target.value })} maxLength={200} placeholder="Solar for condo buildings" data-testid={`${testPrefix}-line`} /></Field>
      </div>
      <div>
        <p className="label">Where are you?</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">{STAGES.map((s) => <Chip key={s} on={value.stage === s} onClick={() => set({ stage: s })} testId={`${testPrefix}-stage-${s}`}>{STAGE_LABEL[s]}</Chip>)}</div>
        <p className="mt-1 text-xs text-muted">{STAGE_HINT[value.stage]}</p>
      </div>
      <div>
        <p className="label">What do you need next?</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">{NEEDS.map((n) => <Chip key={n} on={value.needs.includes(n)} onClick={() => tog("needs", n)} testId={`${testPrefix}-need-${n}`}>{NEED_LABEL[n]}</Chip>)}</div>
      </div>
      <div>
        <p className="label">What you build</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">{SECTORS.map((s) => <Chip key={s} on={value.sectors.includes(s)} onClick={() => tog("sectors", s)} testId={`${testPrefix}-sec-${s}`}>{s}</Chip>)}</div>
      </div>
      <div>
        <p className="label">I am… <span className="font-normal normal-case text-muted">(optional)</span></p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">{AUDIENCES.map((a) => <Chip key={a} on={value.audiences.includes(a)} onClick={() => tog("audiences", a)} testId={`${testPrefix}-aud-${a}`}>{AUDIENCE_LABEL[a]}</Chip>)}</div>
        <p className="mt-1 text-xs text-muted">Some programs are only for one group. We only show those when you pick it.</p>
      </div>
      <div>
        <p className="label">Incorporated?</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">{[["yes", "Yes"], ["no", "Not yet"], ["unsure", "Not sure"]].map(([k, l]) => <Chip key={k} on={value.incorporated === k} onClick={() => set({ incorporated: k })} testId={`${testPrefix}-inc-${k}`}>{l}</Chip>)}</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Province"><Select value={value.province} onChange={(e) => set({ province: e.target.value })} options={PROVINCES.map((p) => ({ value: p, label: p }))} data-testid={`${testPrefix}-province`} /></Field>
        <Field label="Employees"><Input inputMode="numeric" value={value.employees} onChange={(e) => set({ employees: e.target.value.replace(/\D/g, "").slice(0, 5) })} placeholder="Optional" /></Field>
      </div>
      <PitchFields value={value} set={set} testPrefix={testPrefix} />
      <Field label="What are you trying to do next?"><Textarea rows={2} value={value.goal} onChange={(e) => set({ goal: e.target.value })} maxLength={500} placeholder="Land our first three pilot buildings and fund the install crew" data-testid={`${testPrefix}-goal`} /></Field>
    </div>
  );
}
