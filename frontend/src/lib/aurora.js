// Feeds the page-wide aurora (index.css) a 0 to 1 scroll position so the colour shifts as you move down the page.
export function startAurora() {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  let raf = 0;
  const set = () => {
    raf = 0;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    root.style.setProperty("--sy", Math.min(1, Math.max(0, window.scrollY / max)).toFixed(3));
  };
  const tick = () => { if (!raf) raf = requestAnimationFrame(set); };
  window.addEventListener("scroll", tick, { passive: true });
  window.addEventListener("resize", tick, { passive: true });
  set();
}
