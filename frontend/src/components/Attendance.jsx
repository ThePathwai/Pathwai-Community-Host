import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { Avatar, Button, SectionCard } from "./ui";

/** Admin-only checklist on an event: tick who actually came. This is what "turnout" in the Impact view and the reports counts. */
export default function Attendance({ eventId }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState("");
  const load = useCallback(() => api.get(`/admin/events/${eventId}/attendance`).then((r) => setD(r.data)).catch(() => setD({ error: true })), [eventId]);
  useEffect(() => { load(); }, [load]);
  if (!d || d.error) return null;
  const mark = async (ids, attended, key) => {
    setBusy(key);
    try { const { data } = await api.post(`/admin/events/${eventId}/attendance`, { user_ids: ids, attended }); setD(data); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(""); }
  };
  const going = d.people.filter((p) => p.rsvp);
  const notYet = going.filter((p) => !p.attended).map((p) => p.id);
  const pct = d.going ? Math.round((100 * going.filter((p) => p.attended).length) / d.going) : null;
  return (
    <div data-testid="attendance"><SectionCard title="Attendance">
      <p className="text-xs text-muted">Tick who came. This is the turnout in your Impact view and reports.</p>
      <p className="mt-3 text-sm" data-testid="attendance-summary"><span className="stat font-display text-2xl">{d.attended}</span> <span className="text-muted">came{d.going ? ` of ${d.going} who said yes${pct != null ? ` (${pct}%)` : ""}` : ""}</span></p>
      {d.people.length === 0 ? <p className="mt-3 text-sm text-muted">Nobody has said yes yet.</p> : (
        <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
          {d.people.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm hover:bg-ink/5">
                <input type="checkbox" className="accent-accent" checked={p.attended} disabled={busy === p.id} onChange={(e) => mark([p.id], e.target.checked, p.id)} data-testid={`attend-${p.id}`} />
                <Avatar src={p.avatar_url} name={p.name} size={24} /><span className="min-w-0 flex-1 truncate">{p.name}</span>
                {!p.rsvp && <span className="text-[11px] text-muted">walk-in</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
      {notYet.length > 0 && <Button variant="ghost" className="mt-3 w-full" loading={busy === "all"} onClick={() => mark(notYet, true, "all")} data-testid="attend-all">Mark everyone who said yes as came ({notYet.length})</Button>}
    </SectionCard></div>
  );
}
