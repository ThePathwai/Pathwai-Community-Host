import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Expand, ImagePlus, Move, Trash2 } from "lucide-react";
import { Button, Input, PhotoCropModal, cx } from "./ui";
import ScrollLock from "./ScrollLock";

// Auto-sliding display carousel — shown on the community dashboard once an admin has added photos.
// Clicking a photo (or the expand hint) opens it full-size in a lightbox; the same prev/next/dots
// controls work there too, so browsing doesn't reset back to the thumbnail strip.
export function PhotoCarousel({ photos = [], intervalMs = 5000, className = "" }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const prev = () => setI((x) => (x - 1 + photos.length) % photos.length);
  const next = () => setI((x) => (x + 1) % photos.length);
  useEffect(() => { if (i >= photos.length) setI(0); }, [photos.length]); // eslint-disable-line
  useEffect(() => {
    if (photos.length < 2 || paused || expanded) return undefined;
    const t = setInterval(next, intervalMs);
    return () => clearInterval(t);
  }, [photos.length, paused, expanded, intervalMs]); // eslint-disable-line
  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setExpanded(false);
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, photos.length]); // eslint-disable-line
  if (photos.length === 0) return null;
  return (
    <>
      <div className={cx("group relative overflow-hidden rounded-2xl bg-ink/5", className)} data-testid="dashboard-carousel"
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        {photos.map((src, idx) => (
          <img key={idx} src={src} alt="" onClick={() => setExpanded(true)} data-testid="carousel-photo"
            className="absolute inset-0 h-full w-full cursor-zoom-in object-cover transition-opacity duration-700 ease-in-out" style={{ opacity: idx === i ? 1 : 0 }} />
        ))}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
        <span className="pointer-events-none absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition group-hover:opacity-100">
          <Expand className="h-3.5 w-3.5" />
        </span>
        {photos.length > 1 && (
          <>
            <button type="button" aria-label="Previous photo" data-testid="carousel-prev" onClick={(e) => { e.stopPropagation(); prev(); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"><ArrowLeft className="h-4 w-4" /></button>
            <button type="button" aria-label="Next photo" data-testid="carousel-next" onClick={(e) => { e.stopPropagation(); next(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"><ArrowRight className="h-4 w-4" /></button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {photos.map((_, idx) => (
                <button key={idx} type="button" aria-label={`Show photo ${idx + 1}`} data-testid="carousel-dot" onClick={(e) => { e.stopPropagation(); setI(idx); }}
                  className="h-1.5 rounded-full transition-all" style={{ width: idx === i ? "1.25rem" : "0.375rem", background: idx === i ? "#fff" : "rgba(255,255,255,.55)" }} />
              ))}
            </div>
          </>
        )}
      </div>
      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setExpanded(false)} data-testid="carousel-lightbox">
          <ScrollLock />
          <button type="button" aria-label="Close" data-testid="carousel-lightbox-close" onClick={() => setExpanded(false)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20">✕</button>
          <img src={photos[i]} alt="" onClick={(e) => e.stopPropagation()} className="max-h-modal max-w-[92vw] rounded-lg object-contain shadow-2xl" />
          {photos.length > 1 && (
            <>
              <button type="button" aria-label="Previous photo" data-testid="carousel-lightbox-prev" onClick={(e) => { e.stopPropagation(); prev(); }}
                className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20 sm:left-6"><ArrowLeft className="h-5 w-5" /></button>
              <button type="button" aria-label="Next photo" data-testid="carousel-lightbox-next" onClick={(e) => { e.stopPropagation(); next(); }}
                className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20 sm:right-6"><ArrowRight className="h-5 w-5" /></button>
              <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-1.5" onClick={(e) => e.stopPropagation()}>
                {photos.map((_, idx) => (
                  <button key={idx} type="button" aria-label={`Show photo ${idx + 1}`} data-testid="carousel-lightbox-dot" onClick={() => setI(idx)}
                    className="h-1.5 rounded-full transition-all" style={{ width: idx === i ? "1.25rem" : "0.375rem", background: idx === i ? "#fff" : "rgba(255,255,255,.55)" }} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

// Admin editor used in onboarding and in Branding: add via file upload or an https link, reorder, remove.
// Pass `aspect` (width/height, e.g. 0.8 for a 4:5 portrait carousel) to have each upload go through
// the crop-adjust step so the admin picks where the photo sits in the frame, instead of leaving it
// to a blind CSS center-crop wherever it's later displayed. Without `aspect`, behaves as before
// (photos keep their natural shape, no forced crop) — used by the existing wide dashboard banner.
export function PhotoCarouselEditor({ value = [], onChange, max = 10, aspect, tileClass = "aspect-[4/3]", outputMax = 1200, maxBytes = 650_000, testId = "carousel" }) {
  const ref = useRef(null);
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const [pending, setPending] = useState(null); // file awaiting placement, only used when `aspect` is set
  const [redo, setRedo] = useState(null); // index of a photo being re-positioned
  const originals = useRef({}); // cropped result -> the file it came from, kept for this editing session
  const addFile = async (file) => {
    setErr("");
    if (aspect) { setPending(file); return; }
    try {
      const { resizePhoto } = await import("../lib/profile");
      onChange([...value, await resizePhoto(file)]);
    } catch (e) { setErr(e.message || "Couldn't read that photo"); }
  };
  const addUrl = () => { if (!url.startsWith("https://")) return; onChange([...value, url]); setUrl(""); };
  const remove = (i) => onChange(value.filter((_, j) => j !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const n = [...value]; [n[i], n[j]] = [n[j], n[i]]; onChange(n);
  };
  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {value.map((src, i) => (
            <div key={i} className={cx("group relative overflow-hidden rounded-xl border border-line", tileClass)}>
              <img src={src} alt="" className="h-full w-full object-cover" />
              <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{i + 1}</span>
              <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100 [@media(hover:none)]:bg-black/35 [@media(hover:none)]:opacity-100">
                <button type="button" className="rounded-full bg-white/90 p-1.5 disabled:opacity-40" disabled={i === 0} aria-label="Move earlier" onClick={() => move(i, -1)}><ArrowLeft className="h-3.5 w-3.5" /></button>
                <button type="button" className="rounded-full bg-white/90 p-1.5 disabled:opacity-40" disabled={i === value.length - 1} aria-label="Move later" onClick={() => move(i, 1)}><ArrowRight className="h-3.5 w-3.5" /></button>
                {aspect && (src.startsWith("data:") || src.startsWith("/")) && <button type="button" className="rounded-full bg-white/90 p-1.5" aria-label="Adjust photo" data-testid={`${testId}-adjust`} onClick={() => { setRedo(i); setPending(originals.current[src] || src); }}><Move className="h-3.5 w-3.5" /></button>}
                <button type="button" className="rounded-full bg-white/90 p-1.5" aria-label="Remove photo" data-testid={`${testId}-remove`} onClick={() => remove(i)}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {value.length < max && (
        <button type="button" onClick={() => ref.current?.click()} data-testid={`${testId}-add`}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-6 text-sm text-muted hover:bg-ink/5">
          <ImagePlus className="h-4 w-4" /> Add a photo · {value.length}/{max}
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" hidden data-testid={`${testId}-file`} onChange={(e) => { e.target.files[0] && addFile(e.target.files[0]); e.target.value = ""; }} />
      {value.length < max && !aspect && (
        <div className="flex gap-2">
          <Input placeholder="…or paste an image link (https://…)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button variant="ghost" disabled={!url.startsWith("https://")} onClick={addUrl}>Add</Button>
        </div>
      )}
      {err && <p className="text-xs text-red-500">{err}</p>}
      {value.length > 1 && <p className="text-xs text-muted">Slides through automatically on your dashboard, in this order.</p>}
      {aspect && (
        <PhotoCropModal open={!!pending} file={pending} aspect={aspect} outputMax={outputMax} maxBytes={maxBytes}
          onCancel={() => { setPending(null); setRedo(null); }}
          onSave={(cropped) => {
            originals.current[cropped] = typeof pending === "string" ? (originals.current[value[redo]] || pending) : pending;
            onChange(redo != null ? value.map((v, j) => (j === redo ? cropped : v)) : [...value, cropped]);
            setPending(null); setRedo(null);
          }} />
      )}
    </div>
  );
}
