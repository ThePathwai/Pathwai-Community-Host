import React, { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Link } from "react-router-dom";
import { Button, Chip, PageHeader, cx } from "../components/ui";
import { AI_CHAT_ENABLED } from "../lib/features";

export default function Copilot() {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [sid, setSid] = useState(null);
  const [starts, setStarts] = useState([]);
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  // Hooks always run (rules-of-hooks) — the feature-flag check below just skips firing the network calls and gates the JSX.
  useEffect(() => { if (AI_CHAT_ENABLED) api.get("/chat/quick-starts", { params: { role: user.role } }).then((r) => setStarts(r.data.prompts)); }, [user.role]);
  useEffect(() => { if (AI_CHAT_ENABLED) end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async (m) => {
    const t = (m ?? text).trim(); if (!t) return;
    setText(""); setMsgs((x) => [...x, { role: "user", content: t }]); setBusy(true);
    try { const { data } = await api.post("/chat/message", { message: t, session_id: sid, role: user.role }); setSid(data.session_id); setMsgs((x) => [...x, { role: "assistant", content: data.reply, actions: data.actions }]); }
    catch (e) { setMsgs((x) => [...x, { role: "assistant", content: `⚠️ ${errMsg(e)}` }]); } finally { setBusy(false); }
  };
  const reset = async () => { if (sid) await api.post("/chat/reset", { session_id: sid }); setSid(null); setMsgs([]); };

  if (!AI_CHAT_ENABLED) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader k="ask" title="Ask the League" subtitle="This assistant isn't turned on for this community yet." />
        <div className="rounded-xl2 border border-dashed border-line bg-surface p-8 text-center text-sm text-muted" data-testid="chat-disabled">
          Check back soon.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader k="ask" title="Ask the League" subtitle="Find a member who can help, a perk or your next event." actions={<Button variant="ghost" onClick={reset}>New chat</Button>} />
      <div className="min-h-[50vh] space-y-3 rounded-xl2 border border-line bg-surface p-4" data-testid="chat-log">
        {msgs.length === 0 && <div className="py-8 text-center"><Sparkles className="mx-auto mb-3 h-6 w-6" /><p className="mb-4 text-sm text-muted">Try one of these:</p>
          <div className="flex flex-wrap justify-center gap-2">{starts.map((s) => <button key={s} className="chip hover:bg-ink/5" onClick={() => send(s)}>{s}</button>)}</div></div>}
        {msgs.map((m, i) => <div key={i} className={cx("max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm", m.role === "user" ? "ml-auto bg-accent text-onaccent" : "bg-ink/5")}>{m.content}{m.actions?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{m.actions.map((a) => <Link key={a.to} to={a.to} className="btn-ghost !py-1 text-xs">{a.label} →</Link>)}</div>}</div>)}
        {busy && <Chip>Thinking…</Chip>}<div ref={end} />
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input className="input" placeholder="Who can help with my career goals? Which events fit me? What do I still need to do?" value={text} onChange={(e) => setText(e.target.value)} data-testid="chat-input" />
        <Button type="submit" disabled={busy} aria-label="Send"><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
