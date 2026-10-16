import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { exitDemo, isDemo, setDemoRole } from "../lib/demo";
import { useAuth } from "../lib/auth";

const PASSWORD = "Demo123!";
const SIDES = { member: "demo@yourcommunity.app", admin: "admin@yourcommunity.app" };

// Shown across the top while someone is in the practice copy of Pathwai. Inside a community it also lets you hop
// between the member side and the admin side without leaving: both sides share the same practice data, so what
// one does (an RSVP, a post, an approval) is visible from the other.
export default function DemoBanner() {
  const { user, config, login, enter } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!isDemo() || process.env.REACT_APP_PREVIEW === "true") return null;
  const side = user ? (user.role === "admin" ? "admin" : "member") : null;
  const other = side === "admin" ? "member" : "admin";
  const slug = config?.slug;
  const swap = async () => {
    if (!slug || busy) return;
    setBusy(true);
    try {
      await login(SIDES[other], PASSWORD);
      await enter(slug);
      setDemoRole(other);
      nav("/", { replace: true });
    } catch (e) { toast.error(`That demo has no ${other} side to switch to.`); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-accent px-3 py-1.5 text-center text-xs font-medium text-on-accent" style={{ background: "var(--accent, #F00F21)", color: "var(--on-accent, #fff)" }} data-testid="demo-banner">
      <span>{side && slug ? `You're in the demo as ${side === "admin" ? "the admin" : "a member"}. Both sides share the same practice data in this tab.` : "You're in the demo: made-up members and events. Nothing here is saved or shared."}</span>
      {side && slug && <button type="button" onClick={swap} disabled={busy} className="rounded-full bg-white/20 px-2.5 py-0.5 font-semibold underline-offset-2 hover:bg-white/30" data-testid="demo-switch">{busy ? "Switching…" : `View as ${other === "admin" ? "admin" : "member"}`}</button>}
      <button type="button" onClick={() => window.location.reload()} className="underline underline-offset-2" data-testid="demo-restart">Restart demo</button>
      <button type="button" onClick={exitDemo} className="underline underline-offset-2" data-testid="demo-exit">Exit demo</button>
    </div>
  );
}
