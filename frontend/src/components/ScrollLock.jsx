import { useEffect } from "react";

// Freezes the page behind a popup so a swipe scrolls the popup, not the page underneath. Reference-counted, so
// two popups open at once (or one closing as another opens) never unlock the page too early.
let locks = 0;
let saved = null;

export default function ScrollLock() {
  useEffect(() => {
    if (locks++ === 0) {
      const { documentElement: html, body } = document;
      saved = { html: html.style.overflow, body: body.style.overflow, over: html.style.overscrollBehavior };
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
      html.style.overscrollBehavior = "none";
    }
    return () => {
      if (--locks === 0 && saved) {
        const { documentElement: html, body } = document;
        html.style.overflow = saved.html; body.style.overflow = saved.body; html.style.overscrollBehavior = saved.over;
        saved = null;
      }
    };
  }, []);
  return null;
}
