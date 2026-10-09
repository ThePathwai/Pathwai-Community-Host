import React, { useEffect, useState } from "react";
import { Bookmark, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { useLive } from "../lib/live";
import { Avatar, Button, Card, Chip, Empty, Field, Input, Modal, PageHeader, PhotoField, Select, Spinner, TagInput, Textarea } from "../components/ui";
import { ItemTools } from "../components/EditKit";
import { useAuth } from "../lib/auth";
import { teamOf } from "../lib/names";

const CATS = ["Discount", "Free access", "Insight", "Template", "Intro", "Service swap"];

export default function Resources() {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [saved, setSaved] = useState(false);
  const [mine, setMine] = useState(false); // "My perks": everything I've shared, including ones still in review
  const [mineCount, setMineCount] = useState(0);
  const [del, setDel] = useState(null); // the perk I'm about to delete
  const [busy, setBusy] = useState(false);
  const load = () => (mine
    ? api.get("/resources/mine").then((r) => { setItems(r.data); setMineCount(r.data.length); })
    : api.get("/resources", { params: { q: q || undefined, saved: saved || undefined } }).then((r) => { setItems(r.data); setMineCount((c) => Math.max(c, r.data.filter((x) => x.is_mine).length)); }));
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q, saved, mine]); // eslint-disable-line
  useEffect(() => { api.get("/resources/mine").then((r) => setMineCount(r.data.length)).catch(() => {}); }, []);
  useLive(["resources"], load);

  const { user, config } = useAuth();
  const [open, setOpen] = useState(false);
  const [req, setReq] = useState(false);
  const [rq, setRq] = useState("");
  const blank = { title: "", url: "", category: "Discount", format: "Perk", perk_value: "", how_to_claim: "", description: "", tags: [], image_url: "" };
  const [f, setF] = useState(blank);
  const submit = async () => { try { const { data } = await api.post("/resources", f); toast.success(data.status === "pending" ? "Sent to the team for a quick review" : "Shared with the community"); setOpen(false); setF(blank); load(); } catch (e) { toast.error(errMsg(e)); } };
  const request = async () => { try { await api.post("/team-support", { category: "Other", title: `Perk request: ${rq}`, description: rq }); toast.success("Request sent to the team"); setReq(false); setRq(""); } catch (e) { toast.error(errMsg(e)); } };
  const toggle = async (id) => { try { await api.post(`/resources/${id}/save`); load(); } catch (e) { toast.error(errMsg(e)); } };
  const needle = q.trim().toLowerCase();
  const shown = (items || []).filter((r) => (cat === "all" || r.category === cat) && (!mine || !needle || JSON.stringify([r.title, r.description, r.perk_value]).toLowerCase().includes(needle)) && (!mine || !saved || r.is_saved));
  const active = q || cat !== "all" || saved;
  const reset = () => { setQ(""); setCat("all"); setSaved(false); };
  const remove = async () => {
    setBusy(true);
    try { await api.delete(`/resources/${del.id}`); toast.success("Perk deleted"); setDel(null); setMineCount((c) => Math.max(0, c - 1)); load(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const trash = (r, cls = "") => r.is_mine && (
    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDel(r); }} aria-label="Delete this perk" title="Delete this perk" data-testid="perk-delete" className={"shrink-0 rounded p-1 text-muted hover:bg-red-500/10 hover:text-red-500 " + cls}><Trash2 className="h-3.5 w-3.5" /></button>
  );
  const pending = (r) => r.status === "pending" && <Chip>Waiting for review</Chip>;
  return (
    <div>
      {/* "Ask for a perk" (a request sent to the team) is admin-only -- a member can still share a
          perk with the community, just not put in a request for one. */}
      <PageHeader k="resources" title="Community perks" subtitle="Discounts, free access and know-how that members share with each other." actions={<>{user.role === "admin" && <Button variant="ghost" onClick={() => setReq(true)}>Ask for a perk</Button>}<Button variant="ghost" onClick={() => setOpen(true)} data-testid="submit-resource">Share a perk</Button></>} />
      <div className="mb-4 inline-flex rounded-full bg-ink/5 p-1" data-testid="perk-tabs">
        <button onClick={() => setMine(false)} data-testid="tab-all-perks" className={"rounded-full px-4 py-1.5 text-sm " + (!mine ? "bg-surface font-medium shadow-sm" : "text-muted")}>All perks</button>
        <button onClick={() => setMine(true)} data-testid="tab-my-perks" className={"rounded-full px-4 py-1.5 text-sm " + (mine ? "bg-surface font-medium shadow-sm" : "text-muted")}>My perks{mineCount > 0 ? ` · ${mineCount}` : ""}</button>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {["all", ...CATS].map((c) => <button key={c} onClick={() => setCat(c)} className={`rounded-full border px-3 py-1 text-sm ${cat === c ? "bg-accent text-on-accent" : ""}`} style={cat === c ? { background: "var(--accent)", color: "var(--on-accent)" } : {}}>{c === "all" ? "All" : c}</button>)}
      </div>
      <div className="mb-3 grid gap-3 sm:grid-cols-4">
        <Input className="sm:col-span-3" placeholder="Search perks, people or skills…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> Saved only</label>
      </div>
      <p className="mb-6 text-xs text-muted">{shown.length} {shown.length === 1 ? "perk" : "perks"}{active ? <button className="ml-3 underline" onClick={reset}>Clear filters</button> : null}</p>
      {!items ? <Spinner /> : shown.length === 0 ? (mine && mineCount === 0
        ? <Empty title="You haven't shared a perk yet" hint="A discount, a free session, a tip that could help another member. Share one and it lives here." action={<Button onClick={() => setOpen(true)}>Share a perk</Button>} />
        : <Empty title="No perks match this search." hint="Try a different keyword, or share one yourself." />) : (
        <>
          {/* Mobile: 2-up tiles — same density step as Members — built around the value badge and the
              claim action, since "what's the deal and how do I get it" is this page's whole value
              (distinct from Connections' "why" and Events' date/RSVP). Desktop keeps the rich card
              grid below (`hidden lg:grid`). */}
          <div className="grid grid-cols-2 gap-2 lg:hidden">
            {shown.map((r) => (
              <div key={r.id} className="card card-hover !p-2 flex flex-col gap-1" data-testid="resource-tile">
                <div className="flex items-center justify-between gap-1">
                  <span className="stat truncate rounded-md px-1.5 py-0.5 text-[9px] leading-tight" style={{ background: "rgb(var(--c-ink) / 0.07)", color: "var(--accent)" }}>{r.perk_value || r.category}</span>
                  <span className="flex shrink-0 items-center">{trash(r, "!p-0.5")}<button onClick={() => toggle(r.id)} aria-label="Save" data-testid="save-btn-mobile" className="shrink-0 rounded p-0.5 text-muted hover:bg-ink/5"><Bookmark className={`h-3 w-3 ${r.is_saved ? "fill-current" : ""}`} /></button></span>
                </div>
                {r.status === "pending" && <span className="text-[9px] font-semibold uppercase text-muted">Waiting for review</span>}
                <p className="truncate text-[11px] font-semibold leading-tight">{r.title}</p>
                {(r.external_url || r.url) ? (
                  <a className="truncate text-[10px] font-semibold underline" style={{ color: "var(--accent)" }} href={r.external_url || r.url} target="_blank" rel="noreferrer" onClick={() => api.post(`/resources/${r.id}/open`).catch(() => {})}>{r.cta_label || "Claim"} →</a>
                ) : (
                  <p className="truncate text-[10px] text-muted">{r.shared_by ? `Shared by ${r.shared_by.name}` : r.category}</p>
                )}
              </div>
            ))}
          </div>

          <div className="hidden gap-4 lg:grid lg:grid-cols-3">
            {shown.map((r) => (
              <Card key={r.id} className="flex flex-col" data-testid="resource-card">
                <ItemTools kind="resources" item={r} onChanged={load} className="mb-3" />
                {r.cover_url && <img src={r.cover_url} alt="" className="-mx-1 mb-3 h-40 w-[calc(100%+0.5rem)] rounded-lg object-cover" />}
                <div className="mb-2 flex items-start justify-between gap-2"><span className="flex flex-wrap items-center gap-1.5"><Chip>{r.category}</Chip>{pending(r)}</span>
                  <span className="flex shrink-0 items-center gap-1">{trash(r, "!p-1.5")}<button onClick={() => toggle(r.id)} aria-label="Save" data-testid="save-btn"><Bookmark className={`h-4 w-4 ${r.is_saved ? "fill-current" : ""}`} /></button></span></div>
                {r.perk_value && <p className="text-2xl leading-tight" style={{ color: "var(--accent)", fontFamily: "var(--font-heading)" }}>{r.perk_value}</p>}
                <h3 className="mt-1 font-medium">{r.title}</h3>
                <p className="mt-1 line-clamp-3 text-sm text-muted">{r.description}</p>
                {r.how_to_claim && <p className="mt-2 flex-1 text-xs"><span className="eyebrow">How to claim · </span>{r.how_to_claim}</p>}
                {!r.how_to_claim && <div className="flex-1" />}
                {r.shared_by && (
                  <Link to={`/members/${r.shared_by.id}`} className="mt-3 flex items-center gap-2 border-t pt-3" style={{ borderColor: "var(--c-line)" }}>
                    <Avatar src={r.shared_by.avatar_url} name={r.shared_by.name} size={32} />
                    <span className="min-w-0 text-xs"><span className="block truncate font-medium">{r.shared_by.name}</span><span className="block truncate text-muted">{r.shared_by.title}</span></span>
                    <a className="ml-auto shrink-0 text-sm underline" href={r.external_url || r.url} target="_blank" rel="noreferrer" onClick={(e) => { e.stopPropagation(); api.post(`/resources/${r.id}/open`).catch(() => {}); }}>{r.cta_label || "Claim"} →</a>
                  </Link>
                )}
                {(r.tags || []).length > 0 && <div className="mt-2 flex flex-wrap gap-1">{r.tags.slice(0, 3).map((t) => <Chip key={t}>{t}</Chip>)}</div>}
              </Card>
            ))}
          </div>
        </>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Share a perk">
        <div className="space-y-4">
          <p className="text-sm text-muted">Got a discount, free session, tool tip or know-how that could help another member? Share it here.</p>
          <Field label="What are you offering?"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Pilates classes at a member rate" data-testid="res-title" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={CATS} /></Field>
            <Field label="The perk"><Input value={f.perk_value} onChange={(e) => setF({ ...f, perk_value: e.target.value })} placeholder="20% off" /></Field>
          </div>
          <Field label="Details"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="How to claim"><Input value={f.how_to_claim} onChange={(e) => setF({ ...f, how_to_claim: e.target.value })} placeholder="Message me, or use code PLAYR20" /></Field>
          <PhotoField value={f.image_url} onChange={(v) => setF({ ...f, image_url: v })} aspect={2} />
          <Field label="Link (optional)"><Input type="url" placeholder="https://" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></Field>
          <p className="text-xs text-muted">{user.role === "admin" ? "Admins publish immediately." : `The ${teamOf(config)} gives it a quick review before it goes live.`}</p>
          <Button onClick={submit} disabled={!f.title.trim()} data-testid="res-submit">Share</Button>
        </div>
      </Modal>
      <Modal open={!!del} onClose={() => setDel(null)} title="Delete this perk?">
        {del && <div className="space-y-4" data-testid="perk-delete-modal">
          <p className="text-sm">"{del.title}" will be removed for everyone, including anyone who saved it. This can't be undone.</p>
          <div className="flex gap-2"><Button variant="ghost" onClick={() => setDel(null)}>Keep it</Button><Button onClick={remove} loading={busy} data-testid="perk-delete-confirm">Delete perk</Button></div>
        </div>}
      </Modal>
      <Modal open={req} onClose={() => setReq(false)} title="Ask for a perk">
        <div className="space-y-4"><Field label="What would be useful?"><Textarea value={rq} onChange={(e) => setRq(e.target.value)} placeholder="e.g. Anyone with a discount on accounting software?" /></Field><Button onClick={request} disabled={!rq.trim()}>Send to the team</Button></div>
      </Modal>
    </div>
  );
}
