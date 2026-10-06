import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { Button, TermsConsent, cx } from "./ui";

// Real Google/Apple SDKs live on hosts the bundled preview's sandbox can't load, so the preview
// always uses the simulated click-through below; a real deployment (REACT_APP_PREVIEW unset)
// loads the real SDKs and only falls back to the simulated button if a provider's client ID
// hasn't been configured yet (see backend/routes/oauth.py).
const PREVIEW = process.env.REACT_APP_PREVIEW === "true";
const GOOGLE_SDK = "https://accounts.google.com/gsi/client";
const APPLE_SDK = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("couldn't load " + src));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error("timed out loading " + src)), 4000);
  });
}

const GoogleMark = () => (
  <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden>
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9C16.66 14.2 17.64 11.9 17.64 9.2Z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18Z" />
    <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.16.29-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33Z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
  </svg>
);

const AppleMark = ({ className }) => (
  <svg viewBox="0 0 384 512" className={className || "h-4 w-4"} fill="currentColor" aria-hidden>
    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141 0 184.5 0 273c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-57.7-90-57.7-91.4zM256.8 88.3c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
  </svg>
);

export default function SocialAuthButtons({ onSignedIn, disabled, joinSlug, acceptedTerms = false }) {
  const [providers, setProviders] = useState({ google: { configured: false }, apple: { configured: false } });
  const [busy, setBusy] = useState("");
  const googleBoxRef = useRef(null);
  const googleRendered = useRef(false);
  // A first-ever social sign-in creates an account, which needs the Terms/Privacy agreement. If the
  // parent form already has it ticked we send it along; otherwise the server answers 428 and we ask
  // right here, then retry the very same sign-in.
  const [consent, setConsent] = useState(null); // { provider, credential, name } waiting for the tick
  const [consentTick, setConsentTick] = useState(false);
  const acceptedRef = useRef(acceptedTerms);
  acceptedRef.current = acceptedTerms;

  useEffect(() => { api.get("/auth/oauth/providers").then((r) => setProviders(r.data)).catch(() => {}); }, []);

  const finish = async (provider, credential, name, accepted) => {
    setBusy(provider);
    try {
      // Carries a share-link's "I'm here to join X" context through social sign-in the same way
      // the email form attaches it -- see Signup.jsx/Login.jsx's joinSlug.
      const { data } = await api.post(`/auth/oauth/${provider}`, { credential, name, join_slug: joinSlug || undefined, accepted_terms: (accepted ?? acceptedRef.current) || undefined });
      setConsent(null);
      onSignedIn(data);
    } catch (ex) {
      if (ex?.response?.status === 428) { setConsent({ provider, credential, name }); setConsentTick(false); return; }
      toast.error(errMsg(ex, `Couldn't sign you in with ${provider === "google" ? "Google" : "Apple"}.`));
    } finally {
      setBusy("");
    }
  };

  // Real Google button: render Google's own widget once the SDK loads and a client ID is configured.
  useEffect(() => {
    if (PREVIEW || !providers.google?.configured || !providers.google?.client_id || googleRendered.current) return;
    let cancelled = false;
    loadScript(GOOGLE_SDK)
      .then(() => {
        if (cancelled || !window.google?.accounts?.id || !googleBoxRef.current) return;
        window.google.accounts.id.initialize({
          client_id: providers.google.client_id,
          callback: (resp) => finish("google", resp.credential),
        });
        window.google.accounts.id.renderButton(googleBoxRef.current, { theme: "outline", size: "large", shape: "pill", width: 328 });
        googleRendered.current = true;
      })
      .catch(() => { /* blocked/offline — the simulated button below still works */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers.google?.client_id, providers.google?.configured]);

  const clickGoogle = () => {
    if (PREVIEW) return finish("google", "preview-demo-credential");
    // Not configured (or the SDK never loaded): still let it hit the backend, which explains why.
    return finish("google", "unconfigured");
  };

  const clickApple = async () => {
    if (PREVIEW) return finish("apple", "preview-demo-credential");
    if (!providers.apple?.configured || !providers.apple?.client_id) return finish("apple", "unconfigured");
    try {
      await loadScript(APPLE_SDK);
      window.AppleID.auth.init({ clientId: providers.apple.client_id, scope: "name email", redirectURI: window.location.origin, usePopup: true });
      const res = await window.AppleID.auth.signIn();
      const n = res.user?.name;
      await finish("apple", res.authorization.id_token, n ? `${n.firstName} ${n.lastName}`.trim() : undefined);
    } catch (ex) {
      if (ex?.error === "popup_closed_by_user") return;
      toast.error("Couldn't reach Apple sign-in right now.");
    }
  };

  // A live site only shows a provider once its client ID is set (see DEPLOY.md section 6): a button that
  // can only answer "isn't configured" would just confuse people. The preview keeps simulated buttons.
  const showGoogleFallback = PREVIEW;
  const showApple = PREVIEW || !!providers.apple?.configured;

  return (
    <div className="space-y-2.5">
      {showGoogleFallback && (
        <button type="button" onClick={clickGoogle} disabled={disabled || busy === "google"} data-testid="oauth-google"
          className={cx("flex w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-surface py-2.5 text-sm font-medium transition hover:bg-ink/5", (disabled || busy === "google") && "cursor-not-allowed opacity-60")}>
          <GoogleMark /> Continue with Google
        </button>
      )}
      <div ref={googleBoxRef} className={cx("flex justify-center", (PREVIEW || !providers.google?.configured) && "hidden")} />
      {showApple && <button type="button" onClick={clickApple} disabled={disabled || busy === "apple"} data-testid="oauth-apple"
        className={cx("flex w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-ink py-2.5 text-sm font-medium text-paper transition hover:opacity-90", (disabled || busy === "apple") && "cursor-not-allowed opacity-60")}>
        <AppleMark /> Continue with iCloud
      </button>}
      {consent && (
        <div className="space-y-3 rounded-xl border border-line bg-ink/5 p-3.5" data-testid="oauth-consent">
          <p className="text-sm font-medium">One more step</p>
          <p className="text-xs text-muted">This is your first time here, so we'll create your Pathwai account with your {consent.provider === "google" ? "Google" : "Apple"} details once you agree.</p>
          <TermsConsent checked={consentTick} onChange={setConsentTick} testId="oauth-accept-terms" />
          <div className="flex gap-2">
            <Button className="flex-1" disabled={!consentTick || !!busy} loading={!!busy} onClick={() => finish(consent.provider, consent.credential, consent.name, true)} data-testid="oauth-consent-continue">Agree and continue</Button>
            <Button variant="ghost" onClick={() => setConsent(null)} data-testid="oauth-consent-cancel">Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
