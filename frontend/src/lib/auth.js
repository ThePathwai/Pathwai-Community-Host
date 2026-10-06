import { applyBrand, HUB_BRAND, setThemeScope } from "./theme";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { forgetThisDevice } from "./webNotify";

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

  const refresh = useCallback(async () => {
    let acc = null; let u = null;
    try { acc = (await api.get("/hub/me")).data.account; } catch { acc = null; }
    if (acc) { try { u = (await api.get("/auth/me")).data; } catch { u = null; } }
    setAccount(acc); setUser(u);
    if (u) await loadConfig(); else showHubTheme();
    setLoading(false);
  }, [loadConfig, showHubTheme]);

  useEffect(() => { refresh(); }, [refresh]);

  const applySession = (data) => {
    setAccount(data.account || data.user); setUser(data.user || null);
    return data;
  };
  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    return applySession(data);
  };
  const signup = async (payload) => {
    const { data } = await api.post("/hub/signup", payload);
    setAccount(data.account); setUser(null);
    return data;
  };
  const enter = async (slug) => {
    await api.post("/hub/enter", { slug });
    const { data } = await api.get("/auth/me");
    setUser(data);
    await loadConfig();
    return data;
  };
  const logout = async () => { await forgetThisDevice(); await api.post("/auth/logout"); setUser(null); setAccount(null); showHubTheme(); };

  return (
    <Ctx.Provider value={{ account, user, setUser, config, loading, login, applySession, signup, enter, logout, refresh, loadConfig, showHubTheme }}>
      {children}
    </Ctx.Provider>
  );
}
