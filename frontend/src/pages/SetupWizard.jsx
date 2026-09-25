import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Card, Field, Input, Select, Spinner, TagInput, cx } from "../components/ui";
import { PhotoCarouselEditor } from "../components/PhotoCarousel";

const STEPS = ["Identity", "Look & feel", "Photos", "Content", "Review"];

export default function SetupWizard() {
  const nav = useNavigate();
  const { loadConfig } = useAuth();
  const [step, setStep] = useState(0);
  const [d, setD] = useState(null);
  const [presets, setPresets] = useState({ themes: [], community_types: [] });
  const [busy, setBusy] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    Promise.all([api.get("/community/config"), api.get("/community/presets")]).then(([c, p]) => {
      if (!hydratedRef.current) { hydratedRef.current = true; setD(c.data); } // hydrate once — never overwrite the draft
      setPresets(p.data);
    });
  }, []);
  if (!d) return <Spinner />;
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));

  const persist = async (extra = {}) => {
    const { community_name, tagline, community_type, theme, member_label_singular, member_label_plural, event_types, support_categories, gallery_photos } = d;
    await api.patch("/community/config", { community_name, tagline, community_type, theme, member_label_singular, member_label_plural, event_types, support_categories, gallery_photos, ...extra });
    await loadConfig();
  };
  const next = async () => { setBusy(true); try { await persist(); setStep(step + 1); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  const launch = async () => { setBusy(true); try { await persist({ setup_completed: true }); toast.success("Community launched"); nav("/admin"); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <button className="mb-4 text-sm text-muted underline" onClick={() => nav("/admin")} data-testid="setup-exit">Exit setup</button>
      <h1 className="mb-1 text-2xl font-semibold sm:text-3xl lg:text-4xl">Set up your community</h1>
      <div className="my-6 flex gap-2">{STEPS.map((s, i) => <div key={s} className={cx("flex-1 rounded-full py-1 text-center text-xs", i <= step ? "text-onaccent" : "bg-ink/10 text-muted")} style={i <= step ? { background: "var(--accent)" } : undefined}>{s}</div>)}</div>
      <Card className="space-y-5">
        {step === 0 && <>
          <Field label="Community name"><Input data-testid="setup-name" value={d.community_name} onChange={(e) => set("community_name", e.target.value)} /></Field>
          <Field label="Tagline"><Input value={d.tagline} onChange={(e) => set("tagline", e.target.value)} /></Field>
          <Field label="Type"><Select value={d.community_type} onChange={(e) => set("community_type", e.target.value)} options={presets.community_types} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Members are called (singular)"><Input value={d.member_label_singular} onChange={(e) => set("member_label_singular", e.target.value)} /></Field>
            <Field label="Members are called (plural)"><Input value={d.member_label_plural} onChange={(e) => set("member_label_plural", e.target.value)} /></Field>
          </div></>}
        {step === 1 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{presets.themes.map((t) => (
          <button key={t.preset} onClick={() => set("theme", { preset: t.preset, accent: t.accent })} data-testid={`theme-${t.preset}`}
            className={cx("rounded-xl2 border p-4 text-left", d.theme?.preset === t.preset ? "border-ink" : "border-line")}><div className="mb-2 h-8 rounded-lg" style={{ background: t.accent }} /><p className="text-sm font-medium">{t.label}</p></button>))}</div>}
        {step === 2 && <>
          <p className="text-sm text-muted">Add a few photos to slide through automatically on your community's home dashboard — a quick way to show off events, spaces, or people. Drag and zoom to choose how each one sits in the frame. Optional; you can add or change these anytime from Branding.</p>
          <PhotoCarouselEditor value={d.gallery_photos || []} onChange={(v) => set("gallery_photos", v)} aspect={4 / 5} tileClass="aspect-[4/5]" testId="gallery-carousel" /></>}
        {step === 3 && <>
          <Field label="Event types"><TagInput value={d.event_types} onChange={(v) => set("event_types", v)} /></Field>
          <Field label="Support request categories"><TagInput value={d.support_categories} onChange={(v) => set("support_categories", v)} /></Field></>}
        {step === 4 && <dl className="space-y-2 text-sm" data-testid="setup-review">
          <div><dt className="label">Name</dt><dd>{d.community_name}</dd></div>
          <div><dt className="label">Members</dt><dd>{d.member_label_plural}</dd></div>
          <div><dt className="label">Dashboard photos</dt><dd>{(d.gallery_photos || []).length > 0 ? `${d.gallery_photos.length} added` : "None added"}</dd></div>
          <div><dt className="label">Event types</dt><dd>{d.event_types.join(", ")}</dd></div>
          <div><dt className="label">Support categories</dt><dd>{d.support_categories.join(", ")}</dd></div></dl>}
        <div className="flex justify-between pt-2">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
          {step < 4 ? <Button onClick={next} loading={busy} data-testid="setup-next">Next</Button> : <Button onClick={launch} loading={busy} data-testid="setup-launch">Launch community</Button>}
        </div>
      </Card>
    </div>
  );
}
