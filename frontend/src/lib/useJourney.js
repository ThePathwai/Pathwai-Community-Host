import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

// The founder's own plan (GET/POST /navigator/journey). `act(body)` sends one change (add, add_many, update, remove) and the server
// answers with the whole journey again, so what is on screen is always what is saved. Returns false and an `error` message instead of throwing.
export function useJourney(enabled = true) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { const r = await api.get("/navigator/journey"); setData(r.data); setError(""); } catch (e) { setError(e?.response?.data?.detail || "The journey could not load. Please try again."); }
  }, []);
  const act = useCallback(async (body) => {
    try { const r = await api.post("/navigator/journey", body); setData(r.data); setError(""); return true; } catch (e) { setError(e?.response?.data?.detail || "Could not save that. Please try again."); return false; }
  }, []);
  useEffect(() => { if (enabled) load(); }, [enabled, load]);
  return { data, error, act, load };
}
