import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Info } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Modal, Wordmark } from "./ui";

// "About the brand" -- every community's home page tells newcomers who's behind it. The story comes from the admin's
// About text (falling back to the tagline), with an optional website button they can label themselves.
export default function AboutBrand() {
  const { user, config } = useAuth();
  const [open, setOpen] = useState(false);
  const name = config?.community_name || "this community";
  const story = (config?.about || "").trim() || (config?.tagline || "").trim();
  const url = (config?.about_url || "").trim();
  const cta = (config?.about_cta || "").trim() || "Visit our website";
  const logo = config?.brand?.logo_url;
  const isAdmin = user?.role === "admin";
  if (!story && !isAdmin) return null;

  const site = url && (
    <a href={url} target="_blank" rel="noreferrer noopener" className="btn-ghost" data-testid="about-website">{cta}<ArrowUpRight className="h-4 w-4" aria-hidden /></a>
  );

  return (
    <section className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6" data-testid="about-brand">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-ink/[.06]">
        {logo ? <img src={logo} alt="" className="h-full w-full object-contain p-1.5" /> : <Info className="h-6 w-6 text-muted" aria-hidden />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="eyebrow">About {name}</p>
        {story
          ? <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-muted sm:text-[15px]" data-testid="about-text">{story}</p>
          : <p className="mt-1 text-sm text-muted">Tell your members about your brand: who you are and why you started.</p>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {story
          ? <button type="button" className="btn-primary" onClick={() => setOpen(true)} data-testid="about-open">Our story</button>
          : <Link to="/admin" onClick={() => { try { sessionStorage.setItem("pathwai.admintab", "brand"); } catch {} }} className="btn-primary" data-testid="about-add">Add your story</Link>}
        {site}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={`About ${name}`}>
        <div className="space-y-4" data-testid="about-modal">
          {logo && <img src={logo} alt="" className="h-12 w-auto max-w-[60%] object-contain" />}
          {config?.tagline && config.tagline !== story && <p className="text-base font-medium">{config.tagline}</p>}
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{story}</p>
          {site}
        </div>
      </Modal>
    </section>
  );
}
