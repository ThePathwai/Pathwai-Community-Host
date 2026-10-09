import React, { useState } from "react";
import { ArrowUpRight, Info, Pencil, Share2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Field, Input, Modal, Textarea } from "./ui";

// "About the brand" -- every community's home page tells newcomers who's behind it. The story comes from the admin's
// About text (falling back to the tagline), with an optional website button they can label themselves.
// Admins can edit it right here. Everyone (members and admins) gets a Share button: the community's public link, which
// opens its own branded page where anyone can ask to join.
export default function AboutBrand() {
  const { user, config, loadConfig } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ about: "", about_url: "", about_cta: "" });
  const [busy, setBusy] = useState(false);
  const name = config?.community_name || "this community";
  const story = (config?.about || "").trim() || (config?.tagline || "").trim();
  const url = (config?.about_url || "").trim();
  const cta = (config?.about_cta || "").trim() || "Visit our website";
  const logo = config?.brand?.logo_url;
  const isAdmin = user?.role === "admin";
  const shareUrl = config?.slug ? `${window.location.origin}/c/${config.slug}` : "";
  if (!story && !isAdmin) return null;

  const startEdit = () => { setF({ about: (config?.about || "").trim() || (config?.tagline || "").trim(), about_url: config?.about_url || "", about_cta: config?.about_cta || "" }); setEditing(true); };
  const save = async () => {
    setBusy(true);
    try { await api.patch("/community/config", f); await loadConfig(); toast.success("Saved. Your members see it now."); setEditing(false); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const share = async () => {
    const text = `Join ${name} on Pathwai`;
    // Phones get their own share sheet (Messages, WhatsApp, Instagram...); everywhere else the link is copied.
    if (navigator.share && window.matchMedia?.("(pointer: coarse)").matches) {
      try { await navigator.share({ title: name, text, url: shareUrl }); return; } catch (e) { if (e?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(shareUrl); toast.success("Link copied. Anyone who opens it can ask to join."); }
    catch { toast.message(shareUrl); }
  };

  const site = url && (
    <a href={url} target="_blank" rel="noreferrer noopener" className="btn-ghost" data-testid="about-website">{cta}<ArrowUpRight className="h-4 w-4" aria-hidden /></a>
  );
  const shareBtn = shareUrl && <button type="button" className="btn-ghost" onClick={share} data-testid="about-share"><Share2 className="h-4 w-4" aria-hidden />Share</button>;

  return (
    <section className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6" data-testid="about-brand">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-ink/[.06]">
        {logo ? <img src={logo} alt="" className="h-full w-full object-contain p-1.5" /> : <Info className="h-6 w-6 text-muted" aria-hidden />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="eyebrow">About {name}</p>
          {isAdmin && <button type="button" onClick={startEdit} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink" data-testid="about-edit"><Pencil className="h-3 w-3" aria-hidden />Edit</button>}
        </div>
        {story
          ? <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-muted sm:text-[15px]" data-testid="about-text">{story}</p>
          : <p className="mt-1 text-sm text-muted">Tell your members about your brand: who you are and why you started.</p>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {story
          ? <button type="button" className="btn-primary" onClick={() => setOpen(true)} data-testid="about-open">Our story</button>
          : <button type="button" className="btn-primary" onClick={startEdit} data-testid="about-add">Add your story</button>}
        {shareBtn}
        {site}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={`About ${name}`}>
        <div className="space-y-4" data-testid="about-modal">
          {logo && <img src={logo} alt="" className="h-12 w-auto max-w-[60%] object-contain" />}
          {config?.tagline && config.tagline !== story && <p className="text-base font-medium">{config.tagline}</p>}
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{story}</p>
          <div className="flex flex-wrap gap-2">{shareBtn}{site}</div>
        </div>
      </Modal>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit About the brand">
        <div className="space-y-4" data-testid="about-edit-modal">
          <Field label="Your story" hint="Who you are, what you do and why people join. Members see it on their home page, and so does anyone who opens your share link."><Textarea rows={6} maxLength={1500} data-testid="about-edit-text" value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} /></Field>
          <Field label="Website (optional)" hint="Adds a button to the About card."><Input data-testid="about-edit-url" value={f.about_url} onChange={(e) => setF({ ...f, about_url: e.target.value })} placeholder="https://" /></Field>
          <Field label="Button label (optional)"><Input value={f.about_cta} maxLength={40} onChange={(e) => setF({ ...f, about_cta: e.target.value })} placeholder="Visit our website" /></Field>
          <div className="flex gap-2"><Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button onClick={save} loading={busy} data-testid="about-edit-save">Save</Button></div>
        </div>
      </Modal>
    </section>
  );
}
