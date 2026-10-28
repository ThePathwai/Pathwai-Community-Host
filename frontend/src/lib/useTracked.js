import { useCallback, useState } from "react";
import { api } from "./api";

// The programs a founder is in now, or has been part of at an earlier stage. Lives on the account (POST /navigator/track);
// `track(body)` saves one change and keeps the list in step. Returns a message instead of throwing so the UI can show it.
export function useTracked() {
  const [tracked, setTracked] = useState([]);
  const [error, setError] = useState("");
  const track = useCallback(async (body) => {
    try {
      const r = await api.post("/navigator/track", body);
      setTracked(r.data.tracked || []);
      setError("");
      return true;
    } catch (e) {
      setError(e?.response?.data?.detail || "Could not save that. Please try again.");
      return false;
    }
  }, []);
  return { tracked, setTracked, track, error };
}
