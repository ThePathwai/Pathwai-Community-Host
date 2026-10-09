import React, { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { FONTS, HEADING_FONTS, applyBrand, brandVars, loadFont } from "../lib/theme";
import { DEFAULT_FIELDS, typeLabel } from "../lib/profile";
import { Button, Card, Chip, Field, Input, PoweredBy, Select, Spinner, StatusBadge, Textarea, Wordmark } from "../components/ui";
import { PhotoCarouselEditor } from "../components/PhotoCarousel";

const COLOR_FIELDS = [["accent", "Accent / buttons"], ["on_accent", "Text on buttons"], ["background", "Page background"], ["surface", "Cards"], ["text", "Text"], ["muted", "Secondary text"], ["border", "Borders"]];

const SWATCHES = ["#F00F21", "#EBEBEB", "#3B82F6", "#6366F1", "#8B5CF6", "#EC4899", "#EF4444", "#F97316", "#EAB308", "#22C55E", "#14B8A6", "#0EA5E9", "#111111"];
const okHex = (v) => /^#[0-9a-fA-F]{6}$/.test(v);

function ColorField({ label, value, onChange, swatches = false }) {
  return (
    <div className="block min-w-0"><span className="label">{label}</span>
      <div className="flex items-center gap-2">
        <label className="relative h-9 w-10 shrink-0 cursor-pointer overflow-hidden rounded border border-line" style={{ background: okHex(value) ? value : "transparent" }} title="Pick a colour">
          <input type="color" value={okHex(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={label} /></label>
        <Input value={value} onChange={(e) => onChange(e.target.value.startsWith("#") ? e.target.value : "#" + e.target.value)} maxLength={7} className="min-w-0 font-mono" placeholder="#RRGGBB" />
      </div>
      {swatches && <div className="mt-2 flex flex-wrap gap-1.5">{SWATCHES.map((c) => <button key={c} type="button" onClick={() => onChange(c)} aria-label={c} title={c} className={`h-6 w-6 rounded-full border ${value?.toUpperCase() === c ? "border-ink ring-2 ring-ink/40" : "border-line"}`} style={{ background: c }} />)}</div>}
    </div>
  );
}

function LogoField({ label, hint, value, onFile, onUrl, onClear, wide = true, testid }) {
  const ref = useRef(); const [drag, setDrag] = useState(false); const [url, setUrl] = useState("");
  return (
    <div><span className="label">{label}</span>
      <div onClick={() => ref.current.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); e.dataTransfer.files[0] && onFile(e.dataTransfer.files[0]); }} data-testid={testid}
        className={`flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 ${drag ? "border-ink bg-ink/5" : "border-line hover:border-ink/50"}`}>
        {value ? <img src={value} alt="" className={`${wide ? "h-12 max-w-[9rem]" : "h-12 w-12"} rounded bg-neutral-700 object-contain p-1`} /> : <span className="flex h-12 w-12 items-center justify-center rounded bg-ink/5"><ImagePlus className="h-5 w-5 text-muted" /></span>}
        <div className="min-w-0 flex-1 text-sm"><p className="font-medium">{value ? "Replace" : "Upload image"}</p>{!value && <p className="text-xs text-muted">Click or drop a file · {hint}</p>}</div>
        {value && <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={(e) => { e.stopPropagation(); onClear(); }}>Remove</button>}
        <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => { e.target.files[0] && onFile(e.target.files[0]); e.target.value = ""; }} />
      </div>
      <div className="mt-2 flex gap-2"><Input placeholder="…or paste an image link (https://…)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button variant="ghost" disabled={!url.startsWith("https://")} onClick={() => { onUrl(url); setUrl(""); }}>Use</Button></div>
    </div>
  );
}

// downscale an uploaded logo so it stays small enough to store in the community config
function fileToLogo(file, max = 480) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Please choose an image file."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("That image couldn't be read."));
    img.src = url;
  });
}

function Preview({ draft }) {
  const b = draft.brand;
  useEffect(() => { loadFont(b.font, b.heading_font); }, [b.font, b.heading_font]);
  const nav = draft.nav.filter((n) => n.enabled);
  return (
    <div style={{ ...brandVars(b), background: "rgb(var(--c-bg))", color: "rgb(var(--c-ink))", fontFamily: "var(--font-sans)" }} data-mode={b.mode} className="overflow-hidden rounded-xl border border-line" data-testid="brand-preview">
      <div className="flex min-w-0 items-center gap-4 border-b border-line px-4 py-3"><span className="shrink-0 text-base"><Wordmark name={draft.community_name} brand={b} /></span>
        <div className="flex min-w-0 gap-1 overflow-x-auto text-xs">{["Home", ...nav.map((n) => n.label)].slice(0, 5).map((l, i) => <span key={l} className={`shrink-0 rounded-full px-2.5 py-1 ${i === 0 ? "bg-ink/10" : "text-muted"}`}>{l}</span>)}</div></div>
      <div className="space-y-4 p-4">
        <div><h1 className="text-2xl">Welcome back, Maya</h1><p className="mt-1 text-xs text-muted">{b.welcome_message || draft.tagline}</p></div>
        <div className="card"><p className="eyebrow">Needs your attention</p>
          <div className="mt-3 flex items-center justify-between rounded-lg border border-line p-3"><span className="text-sm">Season availability</span><StatusBadge status="in_progress" /></div></div>
        <div className="flex flex-wrap gap-2"><button className="btn-primary">Primary action</button><button className="btn-ghost">Secondary</button><Chip>Chip</Chip></div>
        <input className="input" placeholder="Input field" readOnly />
        <PoweredBy />
      </div>
    </div>
  );
}

export default function Branding({ embedded = false }) {
  const { loadConfig, config } = useAuth();
  const [d, setD] = useState(null);
  const [presets, setPresets] = useState([]);
  const [busy, setBusy] = useState(false);
  const configRef = useRef(config); configRef.current = config;
  useEffect(() => {
    api.get("/community/config").then((r) => setD({ community_name: r.data.community_name, tagline: r.data.tagline, about: r.data.about || "", about_url: r.data.about_url || "", about_cta: r.data.about_cta || "", brand: r.data.brand, nav: r.data.nav, custom_links: r.data.custom_links || [], profile: r.data.profile, member_types: r.data.member_types, gallery_photos: r.data.gallery_photos || [], dashboard_cover_url: r.data.dashboard_cover_url || null }));
    api.get("/community/presets").then((r) => setPresets(r.data.themes));
  }, []);
  // while editing inside the site, show the draft on the real page; revert if it is not saved
  useEffect(() => {
    if (!embedded || !d) return undefined;
    applyBrand({ ...config, brand: d.brand });
    return undefined;
  }, [embedded, d?.brand]); // eslint-disable-line
  useEffect(() => () => { if (embedded) applyBrand(configRef.current); }, []); // eslint-disable-line
  if (!d) return <Spinner />;
  const setBrand = (patch) => setD({ ...d, brand: { ...d.brand, preset: "custom", ...patch } });
  const setColor = (k, v) => setD({ ...d, brand: { ...d.brand, preset: "custom", colors: { ...d.brand.colors, [k]: v } } });
  const pick = (p) => setD({ ...d, brand: { ...d.brand, preset: p.preset, mode: p.mode, colors: p.colors, heading_style: p.heading_style || "uppercase", heading_font: p.heading_font || "", font: p.font || d.brand.font, radius: p.radius || d.brand.radius, button_shape: p.button_shape || d.brand.button_shape } });
  const move = (i, dir) => { const n = [...d.nav]; const j = i + dir; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setD({ ...d, nav: n }); };
  const saveLogo = async (patch) => {
    const brand = { ...d.brand, ...patch };
    setD((x) => ({ ...x, brand }));
    try { await api.patch("/community/config", { brand }); await loadConfig(); toast.success(patch.logo_url === null || patch.logo_mark_url === null ? "Removed" : "Logo saved — live for your members"); } catch (e) { toast.error(errMsg(e)); }
  };
  const upload = async (file, key) => { try { await saveLogo({ [key]: await fileToLogo(file, key === "logo_url" ? 640 : 160) }); } catch (e) { toast.error(e.message); } };
  const saveCover = async (dashboard_cover_url) => {
    setD((x) => ({ ...x, dashboard_cover_url }));
    try { await api.patch("/community/config", { dashboard_cover_url: dashboard_cover_url || "" }); await loadConfig(); toast.success(dashboard_cover_url ? "Cover photo saved — live for your members" : "Removed"); } catch (e) { toast.error(errMsg(e)); }
  };
  const uploadCover = async (file) => { try { await saveCover(await fileToLogo(file, 1200)); } catch (e) { toast.error(e.message); } };
  const save = async () => {
    setBusy(true);
    try { await api.patch("/community/config", d); await loadConfig(); toast.success("Branding saved — your members see it now"); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const b = d.brand;
  return (
    <div className={embedded ? "grid gap-6" : "grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px] [&>*]:min-w-0"}>
      <div className="space-y-5">
        <Card className="space-y-4">
          <p className="eyebrow">Identity</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Community name"><Input data-testid="brand-name" value={d.community_name} onChange={(e) => setD({ ...d, community_name: e.target.value })} /></Field>
            <Field label="Tagline"><Input value={d.tagline || ""} onChange={(e) => setD({ ...d, tagline: e.target.value })} /></Field>
          </div>
          <Field label="About the brand" hint="Shown in the About card on your members' home page and on your community's join page."><Textarea rows={4} maxLength={1500} data-testid="brand-about" value={d.about || ""} onChange={(e) => setD({ ...d, about: e.target.value })} placeholder="Who you are, what you do and why people join." /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Website (optional)" hint="Adds a button to the About card."><Input data-testid="brand-about-url" value={d.about_url || ""} onChange={(e) => setD({ ...d, about_url: e.target.value })} placeholder="https://" /></Field>
            <Field label="Button label (optional)"><Input value={d.about_cta || ""} maxLength={40} onChange={(e) => setD({ ...d, about_cta: e.target.value })} placeholder="Visit our website" /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <LogoField label="Logo" hint="PNG or SVG, transparent background" value={b.logo_url} testid="logo-drop" onFile={(f) => upload(f, "logo_url")} onUrl={(u) => saveLogo({ logo_url: u })} onClear={() => saveLogo({ logo_url: null })} />
            <LogoField label="Icon / favicon" hint="square works best" value={b.logo_mark_url} wide={false} testid="icon-drop" onFile={(f) => upload(f, "logo_mark_url")} onUrl={(u) => saveLogo({ logo_mark_url: u })} onClear={() => saveLogo({ logo_mark_url: null })} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-accent" checked={b.show_name_with_logo !== false} onChange={(e) => setBrand({ show_name_with_logo: e.target.checked })} />Show the community name next to the logo</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-accent" checked={!!b.logo_adapts} onChange={(e) => setBrand({ logo_adapts: e.target.checked })} />My logo is one colour: flip it automatically in light mode</label>
        </Card>

        <Card className="space-y-4">
          <p className="eyebrow">Look and feel</p>
          <div className="flex flex-wrap gap-2" data-testid="brand-presets">{presets.map((p) => (
            <button key={p.preset} onClick={() => pick(p)} data-testid={`preset-${p.preset}`} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${b.preset === p.preset ? "border-accent" : "border-line"}`}>
              <span className="flex overflow-hidden rounded-full border border-line">{[p.colors.background, p.colors.surface, p.colors.accent].map((c) => <span key={c} className="h-5 w-3.5" style={{ background: c }} />)}</span>{p.label}</button>))}
            {b.preset === "custom" && <Chip>Custom</Chip>}</div>
          <div className={embedded ? "grid grid-cols-2 gap-3" : "grid gap-3 sm:grid-cols-3"}>{COLOR_FIELDS.map(([k, l]) => <ColorField key={k} label={l} value={b.colors[k]} swatches={k === "accent"} onChange={(v) => setColor(k, v)} />)}</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Mode"><Select value={b.mode} onChange={(e) => setBrand({ mode: e.target.value })} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} /></Field>
            <Field label="Font"><Select value={b.font} onChange={(e) => setBrand({ font: e.target.value })} options={FONTS} /></Field>
            <Field label="Heading font"><Select value={b.heading_font || ""} onChange={(e) => setBrand({ heading_font: e.target.value })} options={[{ value: "", label: "Same as body" }, ...HEADING_FONTS]} /></Field>
            <Field label="Headings"><Select value={b.heading_style} onChange={(e) => setBrand({ heading_style: e.target.value })} options={[{ value: "uppercase", label: "Bold uppercase" }, { value: "normal", label: "Sentence case" }]} /></Field>
            <Field label="Corners"><Select value={b.radius} onChange={(e) => setBrand({ radius: e.target.value })} options={[{ value: "sharp", label: "Sharp" }, { value: "soft", label: "Soft" }, { value: "round", label: "Round" }]} /></Field>
            <Field label="Buttons"><Select value={b.button_shape} onChange={(e) => setBrand({ button_shape: e.target.value })} options={[{ value: "pill", label: "Pill" }, { value: "rounded", label: "Rounded" }, { value: "square", label: "Square" }]} /></Field>
          </div>
        </Card>

        <Card className="space-y-3" data-testid="profile-fields-card">
          <p className="eyebrow">Member profile</p>
          <p className="text-xs text-muted">Choose what each member card shows and what you call it. Members fill these in from “My profile”.</p>
          {(d.profile?.fields || DEFAULT_FIELDS).map((f, i) => (
            <div key={f.key} className="flex items-center gap-2">
              <input type="checkbox" className="accent-accent" checked={f.enabled !== false} onChange={(e) => setD({ ...d, profile: { fields: (d.profile?.fields || DEFAULT_FIELDS).map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)) } })} aria-label={`Show ${f.key}`} />
              <Input value={f.label} maxLength={30} onChange={(e) => setD({ ...d, profile: { fields: (d.profile?.fields || DEFAULT_FIELDS).map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) } })} />
              <span className="eyebrow w-24 shrink-0">{f.key.replace(/_/g, " ")}</span>
            </div>))}
          <p className="label pt-3">What you call your people</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{["founder", "mentor", "alumni", "partner"].map((t) => (
            <Field key={t} label={t === "founder" ? "Members" : t === "mentor" ? "Coaches / mentors" : t === "alumni" ? "Alumni" : "Staff"}>
              <Input value={(d.member_types || {})[t] ?? typeLabel(null, t)} maxLength={24} onChange={(e) => setD({ ...d, member_types: { ...(d.member_types || {}), [t]: e.target.value } })} /></Field>))}</div>
        </Card>

        <Card className="space-y-3">
          <p className="eyebrow">Dashboard photo carousel (4:5)</p>
          <p className="text-xs text-muted">Photos here slide through automatically at the top of your members' home dashboard. Drag and zoom to choose how each one sits in the frame before it's added.</p>
          <PhotoCarouselEditor value={d.gallery_photos || []} onChange={(v) => setD({ ...d, gallery_photos: v })} aspect={4 / 5} tileClass="aspect-[4/5]" testId="gallery-carousel" />
        </Card>

        <Card className="space-y-3">
          <p className="eyebrow">Events widget cover photo</p>
          <p className="text-xs text-muted">Shown behind "Browse events" on the dashboard whenever there's no upcoming event with its own photo. Until you add one, your logo is shown there instead.</p>
          <LogoField label="Cover photo" hint="wide photo works best" value={d.dashboard_cover_url} testid="dashboard-cover-drop" onFile={uploadCover} onUrl={(u) => saveCover(u)} onClear={() => saveCover(null)} />
        </Card>

        <Card className="space-y-4">
          <p className="eyebrow">Words</p>
          <Field label="Sign-in headline"><Input value={b.login_headline || ""} onChange={(e) => setBrand({ login_headline: e.target.value })} placeholder="Member portal" /></Field>
          <Field label="Sign-in subtitle"><Input value={b.login_subhead || ""} onChange={(e) => setBrand({ login_subhead: e.target.value })} /></Field>
          <Field label="Welcome line on the home page"><Input value={b.welcome_message || ""} onChange={(e) => setBrand({ welcome_message: e.target.value })} placeholder="Winter Cup registration closes Oct 14" /></Field>
          <Field label="Footer text"><Input value={b.footer_text || ""} onChange={(e) => setBrand({ footer_text: e.target.value })} /></Field>
        </Card>

        <Card className="space-y-3">
          <p className="eyebrow">Menu</p>
          <p className="text-xs text-muted">Rename, reorder or hide sections. Hidden sections disappear from your members' navigation.</p>
          {d.nav.map((n, i) => (
            <div key={n.key} className="flex items-center gap-2">
              <input type="checkbox" className="accent-accent" checked={n.enabled} onChange={(e) => setD({ ...d, nav: d.nav.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)) })} aria-label={`Show ${n.key}`} />
              <Input value={n.label} maxLength={24} onChange={(e) => setD({ ...d, nav: d.nav.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <span className="eyebrow w-20 shrink-0">{n.key}</span>
              <button className="p-1 text-muted hover:text-ink" onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
              <button className="p-1 text-muted hover:text-ink" onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
            </div>))}
          <p className="label pt-3">Custom links</p>
          {d.custom_links.map((l, i) => (
            <div key={i} className="flex items-center gap-2"><Input placeholder="Label" value={l.label} onChange={(e) => setD({ ...d, custom_links: d.custom_links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <Input placeholder="https://" value={l.url} onChange={(e) => setD({ ...d, custom_links: d.custom_links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
              <button className="p-1 text-muted hover:text-ink" onClick={() => setD({ ...d, custom_links: d.custom_links.filter((_, j) => j !== i) })} aria-label="Remove link"><Trash2 className="h-4 w-4" /></button></div>))}
          <Button variant="ghost" onClick={() => setD({ ...d, custom_links: [...d.custom_links, { label: "", url: "https://" }] })}>Add a link</Button>
        </Card>
        <div className={embedded ? "sticky bottom-0 -mx-1 border-t border-line bg-paper px-1 py-3" : ""}><Button onClick={save} loading={busy} data-testid="brand-save">Save branding</Button>{embedded && <span className="ml-3 text-xs text-muted">Changes preview on the page behind. Logos save instantly.</span>}</div>
      </div>
      {!embedded && <div className="lg:sticky lg:top-24 lg:self-start"><p className="eyebrow mb-3">Live preview</p><Preview draft={d} /></div>}
    </div>
  );
}
