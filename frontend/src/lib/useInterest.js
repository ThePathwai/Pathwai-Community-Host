import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "./api";

// "Are you interested?" for programs. Lives on the account (POST /navigator/interest): yes puts a program on the shortlist,
// no stops it being suggested. `mark(program, "yes" | "no")` toggles (pressing the same answer again clears it).
// `sig` changes whenever the hidden set changes, so a page can use it to ask for fresh suggestions.
export function useInterest() {
  const [interest, setInterest] = useState([]);
  const byId = useMemo(() => Object.fromEntries(interest.map((i) => [i.id, i.state])), [interest]);
  const sig = useMemo(() => interest.filter((i) => i.state === "no").map((i) => i.id).sort().join(","), [interest]);

  const send = useCallback(async (p, state) => {
    try {
      const r = await api.post("/navigator/interest", { id: p.id, name: p.name || "", org: p.org || "", type: p.type || "", state });
      setInterest(r.data.interest || []);
      return true;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save that. Please try again.");
      return false;
    }
  }, []);

  const mark = useCallback(async (p, want) => {
    const now = byId[p.id];
    const next = now === want ? "none" : want;
    const ok = await send(p, next);
    if (!ok) return false;
    if (next === "no") toast("Hidden from your suggestions", { description: p.name, action: { label: "Undo", onClick: () => send(p, "none") } });
    else if (next === "yes") toast.success("Added to your interested list", { description: p.name });
    return next;
  }, [byId, send]);

  return { interest, setInterest, byId, sig, mark };
}
