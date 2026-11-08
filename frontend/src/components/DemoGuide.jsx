import React, { useEffect, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { EyeOff, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { useAuth } from "../lib/auth";
import { isDemo, walkthroughOn } from "../lib/demo";
import { SCENES, bindTour, getTour, subscribeTour, tour } from "../lib/tour";
import { cx } from "./ui";

// Demo only. The player for the guided walkthrough (lib/tour.js): it plays the whole journey by itself, with a caption for each part.
// Play / Pause, previous / next part, restart. "Hide" removes the bar so it never shows up in a recording; press G to bring it back.
const HUMBER = "humber-innovation-network";
const KEY = "pw_guide_hidden";
const readHidden = () => { try { return window.sessionStorage.getItem(KEY) === "1"; } catch { return false; } };
const writeHidden = (v) => { try { v ? window.sessionStorage.setItem(KEY, "1") : window.sessionStorage.removeItem(KEY); } catch { /* ignore */ } };

export default function DemoGuide() {
  const { user, config, refresh } = useAuth();
  const nav = useNavigate();
  const t = useSyncExternalStore(subscribeTour, getTour);
  const [hidden, setHidden] = useState(readHidden);
  const on = isDemo() && walkthroughOn() && !!user && user.role !== "admin" && config?.slug === HUMBER;
  useEffect(() => { bindTour(nav, refresh); });   // every render, so the player always has a live way to move between screens
  useEffect(() => { if (on && t.pending) tour.launch(); }, [on, t.pending]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key !== "g" && e.key !== "G") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(input|textarea|select)$/i.test((e.target && e.target.tagName) || "") || (e.target && e.target.isContentEditable)) return;
      setHidden((h) => { writeHidden(!h); return !h; });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const shown = on && !hidden;
  // Tells the Home page the bar is taking room, so it can drop its least important rows a little sooner (index.css).
  useEffect(() => {
    if (!shown) return undefined;
    document.body.dataset.guide = "1";
    return () => { delete document.body.dataset.guide; };
  }, [shown]);
  if (!shown) return null;
  const idle = !t.playing && !t.paused && !t.done && !t.pending;
  const cur = SCENES[t.scene] || SCENES[0];
  const btn = "inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-muted transition hover:text-ink disabled:opacity-40";
  return (
    <div className="sticky top-[64px] z-[9500] mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 shadow-sm lg:mb-4" data-testid="demo-guide" role="region" aria-label="Demo walkthrough">
      <div className="min-w-0 flex-1 basis-72">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold" data-testid="demo-guide-step">
          <span className="flex gap-1" aria-hidden>{SCENES.map((s, i) => <span key={s.key} className={cx("h-1.5 w-5 rounded-full", i <= t.scene ? "" : "bg-ink/15")} style={i <= t.scene ? { background: "var(--accent)" } : undefined} />)}</span>
          {t.done ? "Done" : `Step ${t.scene + 1} of ${SCENES.length}`} · {cur.title}
          {t.playing && <span className="text-[11px] font-medium uppercase text-muted" style={{ letterSpacing: "0.1em" }}>Playing</span>}
          {t.paused && <span className="text-[11px] font-medium uppercase text-muted" style={{ letterSpacing: "0.1em" }}>Paused</span>}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-muted sm:text-[13px]" data-testid="demo-guide-say">{idle ? "Press Play and the walkthrough runs by itself, from the founder's profile to a decision plan." : t.caption}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <button type="button" className={btn} onClick={() => tour.back()} disabled={t.scene === 0 && !t.done} data-testid="tour-back" aria-label="Previous part"><SkipBack className="h-3.5 w-3.5" aria-hidden /></button>
        {t.playing
          ? <button type="button" className={cx(btn, "!border-transparent")} style={{ background: "var(--accent)", color: "var(--on-accent)" }} onClick={() => tour.pause()} data-testid="tour-pause"><Pause className="h-3.5 w-3.5" aria-hidden />Pause</button>
          : <button type="button" className={cx(btn, "!border-transparent")} style={{ background: "var(--accent)", color: "var(--on-accent)" }} onClick={() => tour.play()} data-testid="tour-play"><Play className="h-3.5 w-3.5" aria-hidden />{t.done || t.error ? "Replay" : t.paused ? "Resume" : "Play"}</button>}
        <button type="button" className={btn} onClick={() => tour.next()} disabled={t.scene >= SCENES.length - 1} data-testid="tour-next" aria-label="Next part"><SkipForward className="h-3.5 w-3.5" aria-hidden /></button>
        <button type="button" className={btn} onClick={() => tour.restart()} data-testid="tour-restart"><RotateCcw className="h-3.5 w-3.5" aria-hidden /><span className="max-sm:hidden">Restart</span></button>
        <button type="button" className={btn} onClick={() => { writeHidden(true); setHidden(true); }} title="Hide (press G to bring it back)" data-testid="demo-guide-hide"><EyeOff className="h-3.5 w-3.5" aria-hidden /><span className="max-sm:hidden">Hide</span></button>
      </div>
    </div>
  );
}
