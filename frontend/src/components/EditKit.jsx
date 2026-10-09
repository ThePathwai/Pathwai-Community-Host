// Admin in-place editing: admins see the same portal members see, plus an "Edit site" mode
// that makes text, branding and content editable right on the page.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Palette, Pencil, Plug, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Field, Input, Modal, Select, TagInput, Textarea, cx } from "./ui";
import Branding from "../pages/AdminBrand";

const Ctx = createContext({ canEdit: false, editing: false, setEditing: () => {}, drawer: false, setDrawer: () => {} });
export const useEdit = () => useContext(Ctx);

const KEY = "pathwai.editing";
const readFlag = () => { try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; } };

export function EditProvider({ children }) {
  const { user } = useAuth();
  const canEdit = user?.role === "admin";
  const [editing, setEd] = useState(readFlag);
  const [drawer, setDrawer] = useState(false);
  const setEditing = (v) => { setEd(v); try { sessionStorage.setItem(KEY, v ? "1" : "0"); } catch { /* ignore */ } if (!v) setDrawer(false); };
  return <Ctx.Provider value={{ canEdit, editing: canEdit && editing, setEditing, drawer, setDrawer }}>{children}</Ctx.Provider>;
}

/** Save part of the community config (brand fields merge into the existing brand object). */
export function useSaveConfig() {
  const { config, loadConfig } = useAuth();
  return useCallback(async ({ brand, page_text, ...rest }) => {
    const patch = { ...rest };
    if (brand) patch.brand = { ...(config?.brand || {}), ...brand };
    if (page_text) patch.page_text = { ...(config?.page_text || {}), ...page_text };
    try { await api.patch("/community/config", patch); await loadConfig(); return true; } catch (e) { toast.error(errMsg(e)); return false; }
  }, [config, loadConfig]);
}

/** Text that turns into an editable field for admins in edit mode. `field` is "brand.x", "page_text.x" or a top-level config key. */
export function Inline({ field, fallback = "", as: Tag = "span", className = "", multiline = false, placeholder = "Click to edit" }) {
  const { config } = useAuth();
  const { editing } = useEdit();
  const save = useSaveConfig();
  const ref = useRef();
  const [scope, key] = field.includes(".") ? field.split(".") : [null, field];
  const stored = scope ? config?.[scope]?.[key] : config?.[key];
  const value = stored || fallback;
  useEffect(() => { if (ref.current && document.activeElement !== ref.current) ref.current.textContent = value; }, [value, editing]);
  if (!editing) return value ? <Tag className={className}>{value}</Tag> : null;
  const commit = async (e) => {
    const next = e.currentTarget.textContent.trim();
    if (next === (value || "")) return;
    const ok = await save(scope ? { [scope]: { [key]: next } } : { [key]: next });
    if (ok) toast.success("Saved");
  };
  return (
    <Tag ref={ref} contentEditable suppressContentEditableWarning spellCheck={false} data-testid={`inline-${field}`} data-placeholder={placeholder}
      onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter" && !multiline) { e.preventDefault(); e.currentTarget.blur(); } if (e.key === "Escape") { e.currentTarget.textContent = value; e.currentTarget.blur(); } }}
      className={cx(className, "cursor-text rounded outline-dashed outline-1 outline-offset-4 outline-ink/30 hover:outline-ink/70 focus:outline-solid focus:outline-accent empty:before:text-muted empty:before:content-[attr(data-placeholder)]")} />
  );
}

/** Ticket-tier editor: name / price ($) / capacity per tier. Shared by the "Add an event" form
    and the admin event-edit dialog below, so pricing is set the same way in both places. */
export function TierEditor({ tiers, onChange }) {
  const set = (i, patch) => onChange(tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <div className="space-y-2 rounded-lg border border-line p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Ticket tiers</p>
      {tiers.length === 0 && <p className="text-xs text-muted">No tiers yet — this event is free.</p>}
      {tiers.map((t, i) => (
        <div key={t.id || i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <Input placeholder="Tier name (e.g. Early bird)" value={t.name} onChange={(e) => set(i, { name: e.target.value })} data-testid={`tier-name-${i}`} />
          <Input placeholder="Price $" type="number" min="0" step="0.01" value={t.price} onChange={(e) => set(i, { price: e.target.value })} data-testid={`tier-price-${i}`} />
          <Input placeholder="Capacity" type="number" min="1" value={t.capacity} onChange={(e) => set(i, { capacity: e.target.value })} data-testid={`tier-capacity-${i}`} />
          <button type="button" className="p-2 text-muted hover:text-ink" onClick={() => onChange(tiers.filter((_, j) => j !== i))} aria-label="Remove tier"><Trash2 className="h-4 w-4" /></button>
        </div>))}
      <Button type="button" variant="ghost" onClick={() => onChange([...tiers, { name: tiers.length ? "" : "General admission", price: "", capacity: "" }])} data-testid="add-tier">Add a tier</Button>
      <p className="text-xs text-muted">Leave capacity blank for unlimited. Add more than one tier for things like Early bird vs GA vs VIP.</p>
    </div>
  );
}

/** Generic schema-driven form dialog. */
export function EditDialog({ open, title, fields, initial, onSave, onClose, saveLabel = "Save changes" }) {
  const [v, setV] = useState(initial || {});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setV(initial || {}); }, [open]); // eslint-disable-line
  const set = (k, val) => setV((p) => ({ ...p, [k]: val }));
  const go = async () => { setBusy(true); try { await onSave(v); } finally { setBusy(false); } };
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4" data-testid="edit-dialog">
        {fields.map((f) => f.type === "tiers" ? (
          <TierEditor key={f.key} tiers={v[f.key] || []} onChange={(t) => set(f.key, t)} />
        ) : (
          <Field key={f.key} label={f.label}>
            {f.type === "textarea" ? <Textarea rows={f.rows || 4} value={v[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
              : f.type === "tags" ? <TagInput value={v[f.key] || []} onChange={(x) => set(f.key, x)} />
              : f.type === "select" ? <Select value={v[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} options={f.options} />
              : <Input type={f.type || "text"} value={v[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} data-testid={`edit-${f.key}`} />}
          </Field>
        ))}
        <div className="flex gap-2"><Button onClick={go} loading={busy} data-testid="edit-save">{saveLabel}</Button><Button variant="ghost" onClick={onClose}>Cancel</Button></div>
      </div>
    </Modal>
  );
}

const toLocal = (iso) => { if (!iso) return ""; const d = new Date(iso); if (isNaN(d)) return ""; const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

export const CONTENT_FIELDS = {
  events: [
    { key: "title", label: "Title" }, { key: "description", label: "Description", type: "textarea" },
    { key: "starts_at", label: "Starts", type: "datetime-local" }, { key: "location", label: "Location" },
    { key: "virtual_url", label: "Virtual link" }, { key: "host", label: "Host" }, { key: "category", label: "Type" },
    { key: "ticket_tiers", label: "Pricing", type: "tiers" }, { key: "capacity", label: "Capacity (only used if there are no ticket tiers)", type: "number" },
    { key: "url", label: "External registration link (e.g. Luma)" }, { key: "tags", label: "Tags", type: "tags" },
    { key: "prep", label: "What to prepare", type: "textarea", rows: 2 },
  ],
  resources: [
    { key: "title", label: "Title" }, { key: "url", label: "Link" }, { key: "category", label: "Category" }, { key: "format", label: "Format" },
    { key: "perk_value", label: "The perk (e.g. 20% off)" }, { key: "description", label: "Description", type: "textarea" }, { key: "how_to_claim", label: "How to claim", type: "textarea", rows: 2 }, { key: "tags", label: "Tags", type: "tags" },
  ],
  announcements: [
    { key: "title", label: "Title" }, { key: "category", label: "Type" }, { key: "body", label: "Message", type: "textarea", rows: 6 },
    { key: "cta_label", label: "Button label" }, { key: "cta_url", label: "Button link" },
  ],
};

/** Edit / delete controls that appear on a content card while an admin is editing. */
export function ItemTools({ kind, item, onChanged, className = "" }) {
  const { editing } = useEdit();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (!editing) return null;
  const fields = CONTENT_FIELDS[kind];
  const initial = { ...item, starts_at: toLocal(item.starts_at), tags: item.tags || [] };
  if (kind === "events") {
    // Ticket tiers store price in cents; the tier editor works in dollars. And an older event
    // that was priced without ever getting a tier (price_cents set, no ticket_tiers) is shown
    // as one implied "General admission" tier here, so its price is visible and editable
    // instead of silently reading as free.
    initial.ticket_tiers = (item.ticket_tiers && item.ticket_tiers.length)
      ? item.ticket_tiers.map((t) => ({ id: t.id, name: t.name, price: t.price_cents != null ? String(t.price_cents / 100) : "0", capacity: t.capacity != null ? String(t.capacity) : "" }))
      : item.price_cents ? [{ name: "General admission", price: String(item.price_cents / 100), capacity: item.capacity != null ? String(item.capacity) : "" }] : [];
  }
  const save = async (v) => {
    const values = {};
    fields.forEach((f) => { if (v[f.key] !== initial[f.key]) values[f.key] = v[f.key]; });
    if (values.starts_at) values.starts_at = new Date(values.starts_at).toISOString();
    if (kind === "events" && values.ticket_tiers) {
      values.ticket_tiers = values.ticket_tiers.filter((t) => t.name.trim()).map((t) => ({ id: t.id, name: t.name.trim(), price_cents: Math.round((Number(t.price) || 0) * 100), capacity: Number(t.capacity) > 0 ? Number(t.capacity) : null }));
    }
    if (!Object.keys(values).length) return setOpen(false);
    try { await api.patch(`/admin/content/${kind}/${item.id}`, { values }); toast.success("Saved"); setOpen(false); onChanged?.(); } catch (e) { toast.error(errMsg(e)); }
  };
  const del = async () => { try { await api.delete(`/admin/content/${kind}/${item.id}`); toast.success("Deleted"); onChanged?.(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className={cx("flex items-center gap-1", className)} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} data-testid="item-tools">
      <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setOpen(true)} data-testid="item-edit"><Pencil className="h-3 w-3" />Edit</button>
      {confirm
        ? <><button className="btn-primary !bg-red-600 !px-2 !py-1 text-xs !text-white" onClick={del} data-testid="item-delete-confirm">Delete?</button><button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setConfirm(false)}><X className="h-3 w-3" /></button></>
        : <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setConfirm(true)} aria-label="Delete" data-testid="item-delete"><Trash2 className="h-3 w-3" /></button>}
      <EditDialog open={open} title={`Edit ${kind.replace(/s$/, "")}`} fields={fields} initial={initial} onSave={save} onClose={() => setOpen(false)} />
    </div>
  );
}

const MEMBER_FIELDS = [
  { key: "name", label: "Name" }, { key: "age", label: "Age" }, { key: "height", label: "Height" }, { key: "title", label: "Profession" }, { key: "company", label: "Employer" },
  { key: "location", label: "Neighbourhood" }, { key: "industry", label: "Main sport" }, { key: "stage", label: "Level" }, { key: "position", label: "Position" }, { key: "cohort", label: "Division / team" },
  { key: "bio", label: "Bio", type: "textarea" },
  { key: "skill_set", label: "Skills", type: "tags" }, { key: "interests_hobbies", label: "Interests", type: "tags" },
  { key: "goals", label: "Goals", type: "tags" }, { key: "support_needs", label: "Support needed", type: "tags" },
];

/** Admin can edit any member's profile from the profile page. */
export function EditMemberButton({ member, onChanged }) {
  const { editing } = useEdit();
  const [open, setOpen] = useState(false);
  if (!editing) return null;
  const save = async (v) => {
    const values = {};
    MEMBER_FIELDS.forEach((f) => { if (JSON.stringify(v[f.key]) !== JSON.stringify(member[f.key])) values[f.key] = v[f.key]; });
    if (!Object.keys(values).length) return setOpen(false);
    try { await api.patch(`/admin/users/${member.id}/profile`, { values }); toast.success("Profile updated"); setOpen(false); onChanged?.(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (<><Button variant="ghost" onClick={() => setOpen(true)} data-testid="edit-member"><Pencil className="h-4 w-4" />Edit profile</Button>
    <EditDialog open={open} title={`Edit ${member.name}`} fields={MEMBER_FIELDS} initial={member} onSave={save} onClose={() => setOpen(false)} /></>);
}

/** Top bar: only admins see it. */
export function EditBar() {
  const { canEdit, editing, setEditing, drawer, setDrawer } = useEdit();
  if (!canEdit) return null;
  const item = "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-muted hover:bg-ink/5 hover:text-ink";
  return (
    <div className="border-b border-line bg-surface" data-testid="edit-bar">
      <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-4 py-1.5 text-xs">
        <span className="shrink-0 pr-1 text-[10px] font-semibold uppercase tracking-widest text-muted">Admin</span>
        <button role="switch" aria-checked={editing} onClick={() => setEditing(!editing)} data-testid="edit-toggle"
          className={cx("flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 font-medium", editing ? "border-transparent bg-accent text-onaccent" : "border-line hover:bg-ink/5")}>
          <Pencil className="h-3 w-3" />{editing ? "Editing on" : "Edit site"}
        </button>
        {editing && <>
          <button className={cx(item, drawer && "bg-ink/10 text-ink")} onClick={() => setDrawer(!drawer)} data-testid="edit-branding"><Palette className="h-3.5 w-3.5" />Branding &amp; menu</button>
          <Link className={item} to="/admin" onClick={() => { try { sessionStorage.setItem("pathwai.admintab", "integrations"); } catch { /* ignore */ } }} data-testid="edit-integrations"><Plug className="h-3.5 w-3.5" />Integrations</Link>
          <span className="hidden shrink-0 text-muted sm:inline">Click any text or item to edit it</span>
        </>}
        <Link className={cx(item, "ml-auto")} to="/admin" data-testid="edit-admin-tools">Admin tools →</Link>
      </div>
    </div>
  );
}

/** Slide-over with the full branding editor (same component as Admin → Branding). */
export function BrandDrawer() {
  const { editing, drawer, setDrawer } = useEdit();
  if (!editing || !drawer) return null;
  return (
    <div className="fixed inset-y-0 right-0 z-[60] w-[min(560px,100vw)] overflow-auto overscroll-contain border-l border-line bg-paper shadow-card" data-testid="brand-drawer">
      {/* padding lives on the inner wrapper: padding on the scrolling box itself leaves a gap under the sticky Save bar */}
      <div className="p-5 pb-0">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-xl">Branding &amp; menu</h2><button onClick={() => setDrawer(false)} aria-label="Close" className="text-muted hover:text-ink"><X className="h-5 w-5" /></button></div>
        <Branding embedded />
      </div>
    </div>
  );
}
