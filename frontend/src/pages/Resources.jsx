import React, { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { useLive } from "../lib/live";
import { Avatar, Button, Card, Chip, Empty, Field, Input, Modal, PageHeader, PhotoField, Select, Spinner, TagInput, Textarea } from "../components/ui";
import { ItemTools } from "../components/EditKit";
import { useAuth } from "../lib/auth";

const CATS = ["Discount", "Free access", "Insight", "Template", "Intro", "Service swap"];

export default function Resources() {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [saved, setSaved] = useState(false);
  const load = () => api.get("/resources", { params: { q: q || undefined, saved: saved || undefined } }).then((r) => setItems(r.data));
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q, saved]); // eslint-disable-line
  useLive(["resources"], load);

  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [req, setReq] = useState(false);
  const [rq, setRq] = useState("");
  const blank = { title: "", url: "", category: "Discount", format: "Perk", perk_value: "", how_to_claim: "", description: "", tags: [], image_url: "" };
  const [f, setF] = useState(blank);
  const submit = async () => { try { const { data } = await api.post("/resources", f); toast.success(data.status === "pending" ? "Sent to the team for a quick review" : "Shared with the community"); setOpen(false); setF(blank); load(); } catch (e) { toast.error(errMsg(e)); } };
  const request = async () => { try { await api.post("/team-support", { category: "Other", title: `Perk request: ${rq}`, description: rq }); toast.success("Request sent to the team"); setReq(false); setRq(""); } catch (e) { toast.error(errMsg(e)); } };
  const toggle = async (id) => { try { await api.post(`/resources/${id}/save`); load(); } catch (e) { toast.error(errMsg(e)); } };
  const shown = (items || []).filter((r) => cat === "all" || r.category === cat);
  const active = q || cat !== "all" || saved;
  const reset = () => { setQ(""); setCat("all"); setSaved(false); };
  return (
    <div>
      {/* "Ask for a perk" (a request sent to the team) is admin-only -- a member can still share a
          perk with the community, just not put in a request for one. */}
      <PageHeader k="resources" title="Community perks" subtitle="Discounts, free access and know-how that members share with each other." actions={<>{user.role === "admin" && <Button variant="ghost" onClick={() => setReq(true)}>Ask for a perk</Button>}<Button variant="ghost" onClick={() => setOpen(true)} data-testid="submit-resource">Share a perk</Button></>} />
      <div className="mb-3 flex flex-wrap gap-2">
        {["all", ...CATS].map((c) => <button key={c} onClick={() => setCat(c)} className={`rounded-full border px-3 py-1 text-sm ${cat === c ? "bg-accent text-on-accent" : ""}`} style={cat === c ? { background: "var(--accent)", color: "var(--on-accent)" } : {}}>{c === "all" ? "All" : c}</button>)}
      </div>
      <div className="mb-3 grid gap-3 sm:grid-cols-4">
        <Input className="sm:col-span-3" placeholder="Search perks, people or skills…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> Saved only</label>
      </div>
      <p className="mb-6 text-xs text-muted">{shown.length} {shown.length === 1 ? "perk" : "perks"}{active ? <button className="ml-3 underline" onClick={reset}>Clear filters</button> : null}</p>
      {!items ? <Spinner /> : shown.length === 0 ? <Empty title="No perks match this search." hint="Try a different keyword, or share one yourself." /> : (
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
                  <button onClick={() => toggle(r.id)} aria-label="Save" data-testid="save-btn-mobile" className="shrink-0 rounded p-0.5 text-muted hover:bg-ink/5"><Bookmark className={`h-3 w-3 ${r.is_saved ? "fill-current" : ""}`} /></button>
                </div>
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
                <div className="mb-2 flex items-start justify-between"><Chip>{r.category}</Chip>
                  <button onClick={() => toggle(r.id)} aria-label="Save" data-testid="save-btn"><Bookmark className={`h-4 w-4 ${r.is_saved ? "fill-current" : ""}`} /></button></div>
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
          <PhotoField value={f.image_url} onChange={(v) => setF({ ...f, image_url: v })} />
          <Field label="Link (optional)"><Input type="url" placeholder="https://" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></Field>
          <p className="text-xs text-muted">{user.role === "admin" ? "Admins publish immediately." : "The Playr League team gives it a quick review before it goes live."}</p>
          <Button onClick={submit} disabled={!f.title.trim()} data-testid="res-submit">Share</Button>
        </div>
      </Modal>
      <Modal open={req} onClose={() => setReq(false)} title="Ask for a perk">
        <div className="space-y-4"><Field label="What would be useful?"><Textarea value={rq} onChange={(e) => setRq(e.target.value)} placeholder="e.g. Anyone with a discount on accounting software?" /></Field><Button onClick={request} disabled={!rq.trim()}>Send to the team</Button></div>
      </Modal>
    </div>
  );
}
