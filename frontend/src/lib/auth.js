import { applyBrand, HUB_BRAND, setThemeScope } from "./theme";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, renewSession } from "./api";
import { forgetThisDevice } from "./webNotify";
import { inDemoTab, isDemo, leaveDemo, setDemoRole } from "./demo";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

// One Pathwai account (`account`) → a separate profile in each community (`user`, scoped to the active community).
export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadConfig = useCallback(async () => {
    try {
      const { data } = await api.get("/community/config");
      setConfig(data);
      applyBrand(data);
      document.title = data.community_name || "Pathwai";
    } catch { /* ignore */ }
  }, []);

  const showHubTheme = useCallback(() => {
    setThemeScope("hub");
    applyBrand({ community_name: "hub", brand: HUB_BRAND });
    document.title = "Pathwai";
  }, []);

  const seen = useRef({ account: null, user: null });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Only a definite "not signed in" (401) signs anyone out of the screen. A dropped connection, a phone waking
  // from sleep or a server blip keeps whatever we already know, and on a cold start is retried a few times
  // before giving up, so a flaky moment never throws a signed-in person back to the login page.
  const refresh = useCallback(async () => {
    const unsure = (e) => !e?.response || e.response.status >= 500;
    let acc = null; let u = null; let bad = false;
    for (let i = 0; i < 4; i++) {
      bad = false;
      try { acc = (await api.get("/hub/me")).data.account; } catch (e) { acc = null; bad = unsure(e); }
      // /hub/me answers "no account" (not an error) once the 1-hour access cookie has lapsed. Before treating that
      // as signed out, try to renew it from the long-lived refresh cookie. Someone who really isn't signed in
      // gets a quick 401 here and carries on to the login page.
      if (!acc && !bad && !isDemo()) {
        try { await renewSession(); acc = (await api.get("/hub/me")).data.account; } catch (e) { acc = null; bad = unsure(e); }
      }
      if (acc && !bad) { try { u = (await api.get("/auth/me")).data; } catch (e) { u = null; bad = unsure(e); } }
      if (!bad) break;
      if (seen.current.account) break; // already showing the app: keep it as is
      await sleep(1200 * (i + 1));
    }
    if (bad && seen.current.account) { setLoading(false); return; }
    seen.current = { account: acc, user: u };
    setAccount(acc); setUser(u);
    if (u) await loadConfig(); else showHubTheme();
    setLoading(false);
  }, [loadConfig, showHubTheme]);

  useEffect(() => { refresh(); }, [refresh]);
  // Opened with no connection: once it's back, pick the session up again instead of leaving the login page showing.
  useEffect(() => {
    const back = () => { if (!seen.current.account) refresh(); };
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, [refresh]);

  // Keep the sign-in topped up while the app is in use, and whenever the phone brings it back to the front.
  useEffect(() => {
    let last = Date.now();
    const keep = () => {
      if (document.hidden || !seen.current.account || Date.now() - last < 20 * 60 * 1000) return;
      last = Date.now();
      renewSession().catch(() => {});
    };
    document.addEventListener("visibilitychange", keep);
    window.addEventListener("online", keep);
    const t = setInterval(keep, 5 * 60 * 1000);
    return () => { document.removeEventListener("visibilitychange", keep); window.removeEventListener("online", keep); clearInterval(t); };
  }, []);

  const applySession = (data) => {
    seen.current = { account: data.account || data.user, user: data.user || null };
    setAccount(data.account || data.user); setUser(data.user || null);
    // Sign-in answers with just id, name and email. Fetch the whole account (profile, startup details) right behind it, so the
    // profile editor never opens half empty and then saves blanks over what is already stored.
    api.get("/hub/me").then((r) => { const a = r.data.account; if (a) { seen.current.account = a; setAccount(a); } }).catch(() => {});
    return data;
  };
  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    return applySession(data);
  };
  const signup = async (payload) => {
    const { data } = await api.post("/hub/signup", payload);
    seen.current = { account: data.account, user: null };
    setAccount(data.account); setUser(null);
    return data;
  };
  const enter = async (slug) => {
    await api.post("/hub/enter", { slug });
    const { data } = await api.get("/auth/me");
    seen.current = { ...seen.current, user: data };
    setUser(data);
    await loadConfig();
    return data;
  };
  const logout = async () => {
    const wasDemo = inDemoTab();
    setDemoRole(null); await forgetThisDevice(); await api.post("/auth/logout"); seen.current = { account: null, user: null }; setUser(null); setAccount(null); showHubTheme();
    if (wasDemo) leaveDemo("/login");  // signing out of the demo ends it: the next sign-in or sign-up must be the real thing
  };

  return (
    <Ctx.Provider value={{ account, user, setUser, config, loading, login, applySession, signup, enter, logout, refresh, loadConfig, showHubTheme }}>
      {children}
    </Ctx.Provider>
  );
}
