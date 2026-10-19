import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Check, Copy, MoreVertical, Plus, Share, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Wordmark, PoweredBy, cx } from "../components/ui";
import { startDemo } from "../lib/demo";

// /install -- public (no login). How to put Pathwai on a phone's Home Screen so it opens like an app, for sharing with testers.
// No app store involved: this is the web app saved to the Home Screen.

const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
const IOS = /iPhone|iPad|iPod/.test(ua) || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const ANDROID = /Android/.test(ua);
const IN_APP = /Instagram|FBAN|FBAV|Line\/|Twitter|LinkedInApp|Snapchat|TikTok|MicroMessenger/.test(ua);
const IOS_NOT_SAFARI = IOS && /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
const INSTALLED = typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);

const Ico = ({ children }) => <span className="mx-1 inline-flex translate-y-[3px] items-center justify-center rounded-md border border-line bg-surface p-1">{children}</span>;

const IPHONE = [
  ["Open this page in Safari", <>Install only works from Safari on iPhone. If you opened this link inside Instagram, Messages, Gmail or Chrome, copy the link and paste it into Safari.</>],
  ["Tap the Share button", <>It's the square with an arrow pointing up <Ico><Share className="h-3.5 w-3.5" /></Ico> at the bottom of the screen (top right on iPad).</>],
  ["Tap “Add to Home Screen”", <>Scroll the sheet up until you see <Ico><Plus className="h-3.5 w-3.5" /></Ico> <b>Add to Home Screen</b>, tap it, then tap <b>Add</b>.</>],
  ["Open Pathwai from its new icon", <>Find the Pathwai icon on your Home Screen and open it from there. Opening it from Safari again won't work for alerts.</>],
  ["Sign in, or try the demo", <>Sign in with your email, or tap <b>Try the demo</b> on the sign-in screen. No account needed for the demo.</>],
];
const ANDROID_STEPS = [
  ["Open this page in Chrome", <>Other browsers can install it too, but Chrome is the most reliable.</>],
  ["Open the menu", <>Tap the three dots <Ico><MoreVertical className="h-3.5 w-3.5" /></Ico> at the top right.</>],
  ["Tap “Install app”", <>If you see <b>Add to Home screen</b> instead, tap that, then <b>Install</b>.</>],
  ["Open Pathwai from its new icon", <>It sits with your other apps and opens full screen.</>],
  ["Sign in, or try the demo", <>Sign in with your email, or tap <b>Try the demo</b> on the sign-in screen.</>],
];

export default function Install() {
  const [tab, setTab] = useState(ANDROID ? "android" : "iphone");
  const steps = tab === "iphone" ? IPHONE : ANDROID_STEPS;
  const link = typeof window !== "undefined" ? `${window.location.origin}/install` : "/install";
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast.success("Link copied. Send it to your testers."); } catch { toast.message(link); }
  };
  return (
    <div className="min-h-screen" data-testid="install-page">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
        <Link to="/login" className="text-2xl"><Wordmark name="Pathwai" brand={{}} /></Link>
        <Link to="/login" className="btn-ghost" data-testid="install-back">Sign in</Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <p className="eyebrow mt-6">Install</p>
        <h1 className="mt-2 font-display text-4xl font-bold leading-tight sm:text-5xl">Get Pathwai on your phone</h1>
        <p className="mt-3 max-w-xl text-base text-muted">No app store and no download. Save it to your Home Screen and it opens full screen, like any other app. It takes about 30 seconds.</p>

        {INSTALLED && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-line bg-surface p-4" data-testid="install-done">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Check className="h-4 w-4" /></span>
            <p className="text-sm">You're already using the installed app. Share this page with anyone else you'd like to invite.</p>
          </div>)}
        {!INSTALLED && (IN_APP || IOS_NOT_SAFARI) && (
          <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-400/10 p-4 text-sm" data-testid="install-warning">
            <p className="font-medium">You're not in {IOS ? "Safari" : "your main browser"}.</p>
            <p className="mt-1 text-muted">{IOS ? "iPhone only lets Safari add apps to the Home Screen. " : ""}Copy this link and open it in {IOS ? "Safari" : "Chrome"}.</p>
            <button type="button" className="btn-ghost mt-3" onClick={copy}><Copy className="mr-1.5 h-4 w-4" aria-hidden />Copy link</button>
          </div>)}

        <div className="mt-8 inline-flex rounded-full border border-line p-1" role="tablist" aria-label="Phone type">
          {[["iphone", "iPhone / iPad"], ["android", "Android"]].map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} data-testid={`install-tab-${k}`} onClick={() => setTab(k)}
              className={cx("rounded-full px-4 py-1.5 text-sm font-medium transition", tab === k ? "text-on-accent" : "text-muted hover:text-ink")}
              style={tab === k ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{label}</button>))}
        </div>

        <ol className="mt-6 space-y-3" data-testid="install-steps">
          {steps.map(([title, body], i) => (
            <li key={title} className="flex gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">
              <span className="stat flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>{i + 1}</span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold">{title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
              </div>
            </li>))}
        </ol>

        <section className="mt-8 rounded-2xl bg-ink/[.045] p-5" data-testid="install-alerts">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Bell className="h-4 w-4 text-muted" aria-hidden />About alerts</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Once you've signed in from the Home Screen icon, go to <b>Notifications</b> and tap <b>Turn on</b>. {tab === "iphone" ? "On iPhone this needs iOS 16.4 or newer, and Apple decides when pop-ups arrive while the app is closed, so they can be late or missing. Keep Focus off and check Settings → Notifications → Pathwai." : "On Android, alerts arrive even when the app is closed."}
          </p>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" className="btn-primary" data-testid="install-demo" onClick={() => startDemo("member")}><Smartphone className="mr-1.5 inline h-4 w-4" aria-hidden />Try the demo first</button>
          <button type="button" className="btn-ghost" data-testid="install-copy" onClick={copy}><Copy className="mr-1.5 h-4 w-4" aria-hidden />Copy link to share</button>
        </div>
        <PoweredBy className="mt-14 text-center" />
      </main>
    </div>
  );
}
