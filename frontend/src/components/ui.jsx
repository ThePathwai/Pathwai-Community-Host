import markWhite from "../assets/mark-white.png";
import wordmarkWhite from "../assets/wordmark-white.png";
import stackedWhite from "../assets/logo-stacked-white.png";
import React from "react";
import ScrollLock from "./ScrollLock";
import { Inline } from "./EditKit";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Loader2 } from "lucide-react";

export const cx = (...a) => a.filter(Boolean).join(" ");

export const Button = ({ variant = "primary", className, loading, children, ...p }) => (
  <button className={cx(variant === "primary" ? "btn-primary" : "btn-ghost", className)} disabled={loading || p.disabled} {...p}>
    {loading && <Loader2 className="h-4 w-4 animate-spin" />} {children}
  </button>
);

export const Card = ({ className, children, ...p }) => <div className={cx("card", className)} {...p}>{children}</div>;
// A photo slot for posts (news, events, perks...). With `aspect` set (width / height of the frame the photo
// is shown in), picking a photo opens the drag-and-zoom step so the poster chooses what stays in frame, and
// "Adjust" re-opens it later. The original is kept for the session so "Adjust" can widen the crop again.
export function PhotoField({ value, onChange, label = "Photo (optional)", aspect }) {
  const ref = React.useRef(null);
  const original = React.useRef({}); // cropped result -> the file it came from
  const [err, setErr] = React.useState("");
  const [pending, setPending] = React.useState(null); // a File, or a data: URL being re-adjusted
  const pick = async (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setErr("");
    if (aspect) { setPending(file); return; }
    try { const { resizePhoto } = await import("../lib/profile"); onChange(await resizePhoto(file)); } catch (ex) { setErr(ex.message || "Couldn't read that photo"); }
  };
  const canAdjust = aspect && value && (original.current[value] || value.startsWith("data:") || value.startsWith("/"));
  return (
    <Field label={label}>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={pick} data-testid="photo-input" />
      {value ? (
        <div className="relative overflow-hidden rounded-xl border border-line">
          <img src={value} alt="" className={aspect ? "w-full object-cover" : "max-h-48 w-full object-cover"} style={aspect ? { aspectRatio: String(aspect) } : undefined} />
          <div className="absolute right-2 top-2 flex gap-1.5">
            {canAdjust && <button type="button" className="rounded-full bg-black/70 px-3 py-1 text-xs text-white" onClick={() => setPending(original.current[value] || value)} data-testid="photo-adjust">Adjust</button>}
            <button type="button" className="rounded-full bg-black/70 px-3 py-1 text-xs text-white" onClick={() => ref.current?.click()}>Change</button>
            <button type="button" className="rounded-full bg-black/70 px-3 py-1 text-xs text-white" onClick={() => onChange("")} data-testid="photo-remove">Remove</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} data-testid="photo-add" className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-6 text-sm text-muted hover:bg-ink/5">
          <span aria-hidden>+</span> Add a photo
        </button>
      )}
      {err && <p className="mt-1 text-xs text-red-500">{err}</p>}
      {aspect && <PhotoCropModal open={!!pending} file={pending} aspect={aspect} outputMax={1200} maxBytes={620_000} onCancel={() => setPending(null)}
        onSave={(url) => { original.current[url] = typeof pending === "string" ? (original.current[value] || pending) : pending; onChange(url); setPending(null); }} />}
    </Field>
  );
}
export const Chip = ({ children, className, accent }) => <span className={cx("chip", accent && "chip-accent", className)}>{children}</span>;

// A small multi-photo gallery editor -- what turns a profile into something people actually browse
// (see the Hub's account profile editor and the People panel's profile view) instead of just a name
// and a bio. Deliberately simple: a 3-up grid, add via a hidden multi-file input, remove via a hover
// button -- no reordering or cropping, unlike AvatarUpload, since a portfolio-style grid doesn't need
// pixel-perfect framing the way a single avatar does.
export function PhotoGallery({ value = [], onChange, max = 9, label = "Photos", hint }) {
  const ref = React.useRef(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const pick = async (e) => {
    const files = Array.from(e.target.files || []); e.target.value = "";
    if (!files.length) return;
    setErr(""); setBusy(true);
    try {
      const { resizePhoto } = await import("../lib/profile");
      const room = Math.max(0, max - value.length);
      const next = await Promise.all(files.slice(0, room).map((f) => resizePhoto(f, 900)));
      onChange([...value, ...next]);
    } catch (ex) { setErr(ex.message || "Couldn't read one of those photos"); }
    finally { setBusy(false); }
  };
  return (
    <Field label={label} hint={hint || `Up to ${max} — shown on your profile and in the People feed.`}>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="sr-only" onChange={pick} data-testid="gallery-input" />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {value.map((src, i) => (
          <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-line" data-testid="gallery-photo">
            <img src={src} alt="" className="h-full w-full object-cover" />
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} data-testid="gallery-remove" aria-label="Remove photo"
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100">×</button>
          </div>
        ))}
        {value.length < max && (
          <button type="button" onClick={() => ref.current?.click()} disabled={busy} data-testid="gallery-add"
            className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-line text-muted hover:bg-ink/5 disabled:opacity-60">
            {busy ? <span className="text-xs">…</span> : <span aria-hidden className="text-xl">+</span>}
          </button>
        )}
      </div>
      {err && <p className="mt-1 text-xs text-red-500">{err}</p>}
    </Field>
  );
}

export const Field = ({ label, children, hint }) => (
  <label className="block">
    {label && <span className="label">{label}</span>}
    {children}
    {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
  </label>
);

export const Input = React.forwardRef((p, ref) => <input ref={ref} className={cx("input", p.className)} {...p} />);
export const Textarea = (p) => <textarea rows={3} className={cx("input", p.className)} {...p} />;
export const Select = ({ options = [], className, ...p }) => (
  <select className={cx("input", className)} {...p}>
    {options.map((o) => (typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
  </select>
);

// Interactive crop step shown after picking a photo. Lets the person drag to reposition and zoom
// within whatever frame the target actually needs — square for an avatar, 4:5 for a gallery photo,
// and so on — instead of us silently center-cropping whatever aspect ratio they uploaded (which
// chopped off heads/faces, or the wrong half of a group shot, on anything that didn't already match).
const CROP_VIEWPORT_MAX = 280; // longer on-screen side of the crop box, px
export function PhotoCropModal({ open, file, aspect = 1, outputMax = 480, maxBytes, onCancel, onSave }) {
  const [img, setImg] = React.useState(null);
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [err, setErr] = React.useState("");
  const dragRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);

  // aspect = frame width / height. Longer side of the box is pinned to the *_MAX constant so the
  // frame is always square-in-a-280px-box for aspect=1, or a 224x280 portrait box for aspect=0.8, etc.
  const wide = aspect > 1 ? Math.max(CROP_VIEWPORT_MAX, Math.min(360, (typeof window !== "undefined" ? window.innerWidth : 400) - 88)) : CROP_VIEWPORT_MAX;
  const vp = aspect <= 1 ? { w: Math.round(CROP_VIEWPORT_MAX * aspect), h: CROP_VIEWPORT_MAX } : { w: wide, h: Math.round(wide / aspect) };
  const out = aspect <= 1 ? { w: Math.round(outputMax * aspect), h: outputMax } : { w: outputMax, h: Math.round(outputMax / aspect) };

  React.useEffect(() => {
    if (!open || !file) { setImg(null); return; }
    setErr(""); setZoom(1); setImg(null);
    const isUrl = typeof file === "string";
    const url = isUrl ? file : URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const base = Math.max(vp.w / im.width, vp.h / im.height);
      setPan({ x: (vp.w - im.width * base) / 2, y: (vp.h - im.height * base) / 2 });
      setImg(im);
    };
    im.onerror = () => setErr("We couldn't open that photo. Use a JPG, PNG or WebP (iPhone HEIC files can't be read by every browser).");
    im.src = url;
    return () => { if (!isUrl) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, file]);

  if (!open) return null;
  const baseScale = img ? Math.max(vp.w / img.width, vp.h / img.height) : 1;
  const scale = baseScale * zoom;
  const dispW = img ? img.width * scale : 0;
  const dispH = img ? img.height * scale : 0;
  const clamp = (p, dw, dh) => ({ x: Math.min(0, Math.max(vp.w - dw, p.x)), y: Math.min(0, Math.max(vp.h - dh, p.y)) });

  const onPointerDown = (e) => {
    if (!img) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    setDragging(true);
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX, dy = e.clientY - dragRef.current.startY;
    setPan(clamp({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy }, dispW, dispH));
  };
  const endDrag = () => { dragRef.current = null; setDragging(false); };

  const changeZoom = (z) => {
    if (!img) return setZoom(z);
    const oldScale = baseScale * zoom, newScale = baseScale * z, cx0 = vp.w / 2, cy0 = vp.h / 2;
    const ix = (cx0 - pan.x) / oldScale, iy = (cy0 - pan.y) / oldScale;
    setZoom(z);
    setPan(clamp({ x: cx0 - ix * newScale, y: cy0 - iy * newScale }, img.width * newScale, img.height * newScale));
  };

  const confirm = () => {
    if (!img) return;
    const c = document.createElement("canvas");
    c.width = out.w; c.height = out.h;
    const ctx = c.getContext("2d");
    const sw = vp.w / scale, sh = vp.h / scale;
    ctx.drawImage(img, (0 - pan.x) / scale, (0 - pan.y) / scale, sw, sh, 0, 0, out.w, out.h);
    let q = 0.88, dataUrl = c.toDataURL("image/jpeg", q);
    if (maxBytes) while (dataUrl.length > maxBytes && q > 0.35) { q -= 0.08; dataUrl = c.toDataURL("image/jpeg", q); }
    onSave(dataUrl);
  };

  return (
    <Modal open={open} onClose={onCancel} title="Adjust photo">
      {err ? (<div className="space-y-4"><p className="text-sm text-red-400" data-testid="crop-error">{err}</p><div className="flex justify-end"><Button variant="ghost" onClick={onCancel}>Close</Button></div></div>) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">Drag to reposition, and zoom to fill the frame the way you want — it saves cropped to the shape shown here.</p>
          <div className="relative mx-auto touch-none select-none overflow-hidden rounded-xl border border-line bg-ink/5"
            style={{ width: vp.w, height: vp.h, cursor: img ? (dragging ? "grabbing" : "grab") : "default" }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerLeave={endDrag} data-testid="crop-viewport">
            {img ? (
              <img src={img.src} alt="" draggable={false}
                style={{ position: "absolute", left: pan.x, top: pan.y, width: dispW, height: dispH, maxWidth: "none" }} />
            ) : <Spinner />}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">Zoom</span>
            <input type="range" min={1} max={3} step={0.01} value={zoom} disabled={!img}
              onChange={(e) => changeZoom(parseFloat(e.target.value))} className="w-full" data-testid="crop-zoom" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel} data-testid="crop-cancel">Cancel</Button>
            <Button onClick={confirm} disabled={!img} data-testid="crop-save">Use this photo</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Avatar preview + upload trigger + the crop-adjust step above, bundled so every avatar-photo
// picker in the app (onboarding, edit profile, per-community profile) behaves the same way.
export function AvatarUpload({ photo, onChange, name, size = 64, testId = "avatar-upload", label = "Upload photo", variant = "ghost" }) {
  const [pending, setPending] = React.useState(null);
  const pick = (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) setPending(file); };
  return (
    <>
      <div className="flex items-center gap-4">
        <Avatar src={photo} name={name || "?"} size={size} square />
        <label className={cx(variant === "primary" ? "btn-primary" : "btn-ghost", "cursor-pointer text-sm")} data-testid={testId}>
          {label}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={pick} />
        </label>
      </div>
      <PhotoCropModal open={!!pending} file={pending} aspect={1} outputMax={480} onCancel={() => setPending(null)} onSave={(url) => { onChange(url); setPending(null); }} />
    </>
  );
}

// A small, fixed set of muted hues for the no-photo fallback below — deterministic per person
// (same name always lands on the same hue) so grids of initials still read with some rhythm
// instead of one flat gray repeated dozens of times. Kept independent of the community's own
// brand accent so it never clashes with a tenant's configured palette.
const AVATAR_HUES = [4, 24, 44, 84, 160, 195, 230, 265, 300, 335];
export const hueFromName = (name) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
};

export const Avatar = ({ src, name = "?", size = 40, square }) => {
  const rad = square ? "var(--r-card)" : "9999px";
  // A hairline ring lifts a photo off whatever surface it sits on — cards, list rows, the header —
  // instead of the image edge blending straight into the background.
  const ring = { boxShadow: `0 0 0 ${Math.max(1, Math.round(size / 32))}px rgb(var(--c-line) / 0.8)` };
  const [bad, setBad] = React.useState(false);
  return src && !bad ? (
    <img src={src} alt={name} width={size} height={size} onError={() => setBad(true)} className="object-cover" style={{ width: size, height: size, borderRadius: rad, ...ring }} />
  ) : (
    <div className="flex items-center justify-center font-semibold" style={{ width: size, height: size, borderRadius: rad, fontSize: Math.max(10, size * 0.36), background: `hsl(${hueFromName(name || "?")} 30% 26%)`, color: `hsl(${hueFromName(name || "?")} 45% 88%)`, ...ring }}>
      {name.split(" ").map((x) => x[0]).slice(0, 2).join("")}
    </div>
  );
};

export const Spinner = () => <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted" /></div>;

export const Empty = ({ title, hint, action }) => (
  <div className="rounded-xl2 border border-dashed border-line py-14 text-center">
    <p className="font-display text-lg">{title}</p>
    {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const PageHeader = ({ title, subtitle, actions, k }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div>
      {k ? <Inline as="h1" field={`page_text.${k}_title`} fallback={title} className="text-2xl font-semibold sm:text-3xl" /> : <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>}
      {k ? <Inline as="p" field={`page_text.${k}_subtitle`} fallback={subtitle} className="mt-1 text-sm text-muted" multiline /> : subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </div>
    <div className="flex gap-2">{actions}</div>
  </div>
);

export const Tabs = ({ tabs, value, onChange }) => {
  const ref = React.useRef(null);
  const [overflowing, setOverflowing] = React.useState(false);
  const recompute = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Only hint at more tabs while there's actually room to scroll further right —
    // this list can be short enough to fit (Matches' 3 tabs) or long enough to need
    // scrolling (Admin's 11 tabs), and the fade should track real overflow, not guess.
    setOverflowing(el.scrollWidth - el.scrollLeft - el.clientWidth > 4);
  }, []);
  React.useEffect(() => { recompute(); }, [recompute, tabs]);
  return (
    <div className="relative mb-5 max-w-full">
      <div ref={ref} onScroll={recompute} className="inline-flex max-w-full overflow-x-auto rounded-xl border border-line bg-surface p-1">
        {tabs.map((t) => {
          const v = typeof t === "string" ? t : t.value;
          const l = typeof t === "string" ? t : t.label;
          return (
            <button key={v} onClick={() => onChange(v)} data-testid={`tab-${v}`}
              className={cx("shrink-0 rounded-lg px-4 py-1.5 text-sm transition", value === v ? "text-onaccent" : "text-muted hover:bg-ink/5")}
              style={value === v ? { background: "var(--accent)" } : undefined}>
              {l}
            </button>
          );
        })}
      </div>
      {overflowing && <div className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-xl" style={{ background: "linear-gradient(to right, transparent, rgb(var(--c-surface)))" }} aria-hidden />}
    </div>
  );
};

export const Modal = ({ open, onClose, title, children }) =>
  !open ? null : (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <ScrollLock />
      <div className="max-h-modal w-full max-w-lg overflow-y-auto overscroll-contain rounded-xl2 bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );

export const TagInput = ({ value = [], onChange, placeholder, suggestions = [] }) => {
  const [t, setT] = React.useState("");
  const add = () => { const v = t.trim(); if (v && !value.includes(v)) onChange([...value, v]); setT(""); };
  // Every TagInput sits inside a <Field>, which is a <label>. A click on a button inside a label is
  // forwarded by the browser to the label's FIRST button, so tapping a "Quick add" suggestion added the
  // tag and then immediately "clicked" the new tag's × and removed it again. Cancelling the click's
  // default action here stops that forwarding (typing + Enter was never affected).
  return (
    <div onClick={(e) => e.preventDefault()}>
      <div className="mb-2 flex flex-wrap gap-1">
        {value.map((v) => (
          <Chip key={v}>{v}<button type="button" aria-label={`Remove ${v}`} className="ml-1 text-muted" onClick={() => onChange(value.filter((x) => x !== v))}>×</button></Chip>
        ))}
      </div>
      <input className="input" value={t} placeholder={placeholder || "Type and press Enter"} onChange={(e) => setT(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }} onBlur={add} />
      {suggestions.filter((x) => !value.includes(x)).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1"><span className="eyebrow mr-1 self-center">Quick add</span>
          {suggestions.filter((x) => !value.includes(x)).slice(0, 20).map((x) => <button type="button" key={x} className="chip hover:border-accent" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange([...value, x])}>+ {x}</button>)}
        </div>)}
    </div>
  );
};

export const Wordmark = ({ name, className = "", brand }) => {
  const { config } = useAuth();
  const b = brand || config?.brand || {};
  const own = !name || name === "Pathwai";
  const logo = b.logo_url || b.logo_mark_url;
  return (
    <span className={"inline-flex min-w-0 max-w-full items-center gap-2.5 font-black uppercase tracking-tight " + className} style={{ textTransform: "var(--heading-transform)" }}>
      {logo ? <img src={logo} alt="" className="h-[1.4em] w-auto max-w-[7em] object-contain sm:h-[2em] sm:max-w-[10em]" style={b.logo_adapts ? { filter: "var(--mark-filter, none)" } : undefined} /> : own && <img src={wordmarkWhite} alt="Pathwai" className="h-[1.2em] w-auto sm:h-[1.5em]" style={{ filter: "var(--mark-filter, none)" }} />}
      {(logo || !own) && (!b.logo_url || b.show_name_with_logo !== false) && <span className={"truncate " + (logo ? "max-sm:hidden" : "")}>{name || "Pathwai"}</span>}
    </span>
  );
};
export const PoweredBy = ({ className = "" }) => (
  <p className={"eyebrow flex flex-wrap items-center justify-center gap-x-2 gap-y-1 " + className}>
    <span className="inline-flex items-center gap-2">Powered by <img src={markWhite} alt="" className="h-3 w-auto" style={{ filter: "var(--mark-filter, none)" }} /><span className="font-black text-ink">Pathwai</span></span>
    <span aria-hidden>·</span>
    <Link to="/terms" className="underline-offset-2 hover:underline" data-testid="footer-terms">Terms</Link>
    <span aria-hidden>·</span>
    <Link to="/privacy" className="underline-offset-2 hover:underline" data-testid="footer-privacy">Privacy</Link>
  </p>
);
// "I agree to the Terms of Service and Privacy Policy" -- the required tick on every account-creating
// form. The links open in a new tab so nobody loses what they've typed.
export const TermsConsent = ({ checked, onChange, testId = "terms-consent", className = "" }) => (
  <label className={"flex cursor-pointer items-start gap-2.5 text-sm leading-snug " + className}>
    <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-accent" checked={!!checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
    <span>I agree to the <Link to="/terms" target="_blank" rel="noreferrer" className="underline" data-testid="consent-terms-link">Terms of Service</Link> and <Link to="/privacy" target="_blank" rel="noreferrer" className="underline" data-testid="consent-privacy-link">Privacy Policy</Link>.</span>
  </label>
);
export const StackedLogo = ({ className = "" }) => <img src={stackedWhite} alt="Pathwai" className={className} style={{ filter: "var(--mark-filter, none)" }} />;

const STATUS_STYLE = {
  overdue: "border-red-400/50 text-red-400", not_started: "border-line text-muted", in_progress: "border-amber-400/50 text-amber-300",
  submitted: "border-sky-400/50 text-sky-300", reviewed: "border-green-500/50 text-green-400", resolved: "border-green-500/50 text-green-400",
  closed: "border-line text-muted", pending: "border-amber-400/50 text-amber-300", approved: "border-green-500/50 text-green-400",
  rejected: "border-red-400/50 text-red-400", changes_requested: "border-amber-400/50 text-amber-300",
  in_review: "border-sky-400/50 text-sky-300", assigned: "border-sky-400/50 text-sky-300", waiting_on_member: "border-amber-400/50 text-amber-300",
};
export const StatusBadge = ({ status }) => (
  <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase", STATUS_STYLE[status] || "border-line text-muted")} style={{ letterSpacing: "0.12em" }}>
    {(status || "").replace(/_/g, " ")}
  </span>
);

// A join request's "what happens next" state, shared by every place someone can land in it right
// after asking to join a community: an existing member logging back in while still pending
// (Login.jsx's go()), AND a brand-new signup/join (Signup.jsx, Login.jsx's share-link apply, and
// the OAuth join flow in both) -- previously only Login's re-login path showed this card at all;
// everywhere else just fired a toast that vanished, leaving the Hub tile's pending pill as the
// only lasting sign anything happened. One card, one set of words, wherever "pending" shows up.
export const MembershipStatusCard = ({ status, communityName, testId = "membership-status" }) => (
  <div className="rounded-xl border border-line bg-ink/5 p-4 text-sm" data-testid={testId}>
    <p className="font-semibold">{status === "pending" ? "Your request is under review" : "Your request wasn't approved"}</p>
    {communityName && <p className="mt-0.5 text-xs text-muted">{communityName}</p>}
    <ol className="mt-3 space-y-2 text-xs text-muted">
      <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />Request submitted</li>
      <li className="flex items-center gap-2"><span className={"h-2 w-2 rounded-full " + (status === "pending" ? "animate-pulse" : "")} style={{ background: status === "pending" ? "#F5A524" : "#ef4444" }} />{status === "pending" ? "The team is reviewing it" : "Reviewed by the team"}</li>
      <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-ink/20" />{status === "pending" ? "You'll get a notification and can sign in once approved" : "Contact the team if you think this is a mistake"}</li>
    </ol>
  </div>
);

export const ProgressBar = ({ value }) => (
  <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <div className="h-full rounded-full" style={{ width: `${value}%`, background: "var(--accent)" }} />
  </div>
);

export const SectionCard = ({ title, action, children, className }) => (
  <Card className={className}>
    <div className="mb-3 flex items-center justify-between"><p className="eyebrow">{title}</p>{action}</div>
    {children}
  </Card>
);

export const BackButton = ({ fallback = "/", label = "Back", className = "" }) => {
  const nav = useNavigate();
  const go = () => {
    // react-router keeps an index in history.state; > 0 means there is an in-app page to go back to
    const idx = window.history.state?.idx;
    if (typeof idx === "number" && idx > 0) nav(-1); else nav(fallback, { replace: true });
  };
  return <button onClick={go} data-testid="back-btn" className={cx("mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink", className)}>← {label}</button>;
};
