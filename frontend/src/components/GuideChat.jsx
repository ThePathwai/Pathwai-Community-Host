import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUp, Compass, ExternalLink, Users } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { FIT_LABEL, FIT_STYLE, Status } from "./NavBits";
import { cx } from "./ui";
import { isStageLine } from "../lib/navigator";

// The Navigator's guide: ask about programs, deadlines, eligibility and communities. Signed in, it answers from the ONE profile
// on your account (so it already knows where your startup is at); signed out, from whatever the Navigator form holds.
// Answers are built from the program catalog by rules (backend/navigator_guide.py), so a program or date can't be made up.
// Backend: POST /navigator/chat.

const START = ["What should I do next?", "What is closing soon?", "Which communities fit me?"];

function Cards({ cards }) {
  if (!cards?.length) return null;
  return (
    <ul className="mt-3 space-y-2">
      {cards.map((c) => (
        <li key={c.id} className="rounded-xl border border-line bg-surface p-3" data-testid={`guide-card-${c.id}`}>
          <p className="text-sm font-semibold">{c.name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Status status={c.status} />
            {c.fit && <span className={cx("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", FIT_STYLE[c.fit])}>{FIT_LABEL[c.fit]}</span>}
          </div>
          {c.fit !== "skip" && (c.reasons || []).length > 0 && <p className="mt-1.5 text-xs text-muted">{c.reasons.find((r) => !isStageLine(r)) || c.reasons[0]}</p>}
          {c.apply_url && /^https?:/.test(c.apply_url) && <a href={c.apply_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--accent)" }}>Open the page <ExternalLink className="h-3 w-3" aria-hidden /></a>}
        </li>
      ))}
    </ul>
  );
}

function Communities({ list }) {
  if (!list?.length) return null;
  return <ul className="mt-3 flex flex-wrap gap-2">{list.map((c) => <li key={c.slug}><Link to={`/c/${c.slug}`} className="chip !px-3 !py-1.5 !text-sm"><Users className="mr-1.5 h-3.5 w-3.5" aria-hidden />{c.name}</Link></li>)}</ul>;
}

export default function GuideChat({ signedIn, hasProfile, formProfile, startupName, className, initialMessage }) {
  const [msgs, setMsgs] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState(null);
  const end = useRef(null);
  const box = useRef(null);
  const sentInitial = useRef(false);

  useEffect(() => {
    setMsgs([{ role: "bot", text: hasProfile
      ? `Hi${startupName ? `, I know ${startupName}` : ""}. I already have your startup profile, so ask me anything: what to apply for, when it closes, whether you qualify.`
      : "Hi, I'm your guide to Canadian innovation programs. Ask me what fits, when it closes or whether you qualify." + (signedIn ? " Add your startup to your profile and I'll remember it." : " Sign in and I'll remember your startup."),
      suggestions: START }]);
  }, [hasProfile, startupName, signedIn]);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs, busy]);

  const send = async (q) => {
    const message = (q ?? text).trim();
    if (!message || busy) return;
    setText(""); setBusy(true);
    setMsgs((m) => [...m, { role: "user", text: message }]);
    try {
      const r = (await api.post("/navigator/chat", { message, focus, profile: hasProfile ? undefined : formProfile })).data;
      setFocus(r.focus || null);
      setMsgs((m) => [...m, { role: "bot", text: r.reply, cards: r.cards, communities: r.communities, suggestions: r.suggestions }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "bot", text: errMsg(e, "I couldn't answer that just now. Please try again.") }]);
    } finally { setBusy(false); }
  };

  // Opened with a question already typed (from the Home bar, or a program's "Ask" button): ask it once, right away.
  useEffect(() => { if (msgs && initialMessage && !sentInitial.current) { sentInitial.current = true; send(initialMessage); } }, [msgs]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!msgs) return null;
  const last = msgs[msgs.length - 1];
  return (
    <section className={cx("flex min-h-0 flex-col rounded-2xl border border-line bg-surface", className)} aria-label="Ask the guide" data-testid="guide-chat">
      <div ref={box} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {msgs.map((m, i) => m.role === "user" ? (
          <div key={i} className="flex justify-end"><p className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm" style={{ background: "var(--accent)", color: "var(--on-accent)" }} data-testid="guide-user">{m.text}</p></div>
        ) : (
          <div key={i} className="flex gap-3" data-testid="guide-bot">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Compass className="h-4 w-4" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] leading-relaxed">{m.text}</p>
              <Cards cards={m.cards} /><Communities list={m.communities} />
            </div>
          </div>
        ))}
        {busy && <div className="flex gap-3"><span className="h-8 w-8 shrink-0" /><span className="flex items-center gap-1 pt-2" aria-label="Thinking">{[0, 1, 2].map((d) => <span key={d} className="h-2 w-2 animate-pulse rounded-full bg-ink/40" style={{ animationDelay: `${d * 150}ms` }} />)}</span></div>}
      </div>
      {last?.role === "bot" && last.suggestions?.length > 0 && !busy && (
        <div className="flex flex-wrap gap-2 px-4 pb-3">{last.suggestions.map((s) => <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-line px-3 py-1.5 text-sm text-muted transition hover:text-ink" data-testid="guide-suggestion">{s}</button>)}</div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2 border-t border-line p-3">
        <input className="input min-w-0 flex-1" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Ask about a program, a deadline, a community…" aria-label="Ask the guide" data-testid="guide-input" />
        <button type="submit" disabled={busy || !text.trim()} aria-label="Send" data-testid="guide-send" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><ArrowUp className="h-5 w-5" /></button>
      </form>
    </section>
  );
}
