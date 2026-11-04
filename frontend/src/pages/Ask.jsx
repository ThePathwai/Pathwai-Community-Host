import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, ArrowUp, Check, MessageCircle, Plus, Sparkles } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useEcosystem } from "../lib/ecosystem";
import { ask, actionText, SUGGESTIONS } from "../lib/ask";
import { buildPlan } from "../lib/planner";
import { Avatar, Spinner, cx } from "../components/ui";
import { KindTile, VerdictBadge, V, KIND, dayShort, heading } from "../components/hub/HubKit";

// Ask (/assistant), not to be confused with the Copilot at /ask: say what you are trying to make happen, in your own words. The chat answers in a sentence, and the screen shows the person or
// resource at the hub who can help most, with why and what it takes. Rules in lib/ask.js, matches from GET /navigator/moves.

const ACCENT = { background: "var(--accent)", color: "var(--on-accent)" };
const LINKS = { person: (m) => `/members/${m.id}`, event: (m) => `/events/${m.id}`, resource: () => "/resources", program: () => "/navigator", grant: () => "/navigator" };
const CTA = { person: "View profile & say hi", event: "See the event", resource: "Open resource", program: "See details", grant: "See details" };
const when = (m) => (m.at ? new Date(m.at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : m.deadline ? `Closes ${dayShort(m.deadline)}` : "");

// One answer: who or what, why it helps with this, whether it suits you right now, and the two things you can do with it.
function Answer({ r, topic, added, onAdd, lead }) {
  const m = r.item;
  const v = V[m.verdict];
  const person = m.kind === "person";
  return (
    <article className={cx("relative overflow-hidden rounded-2xl border border-line bg-surface shadow-sm", lead && "shadow-md")} data-testid={lead ? "ask-lead" : "ask-other"} data-kind={m.kind} data-verdict={m.verdict}>
      <span aria-hidden className={cx("absolute inset-y-0 left-0 w-1.5", v.bar)} />
      <div className={cx("flex flex-col gap-3.5 p-4 pl-5 sm:p-5 sm:pl-6", lead && "sm:gap-4 sm:p-6 sm:pl-7")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{lead ? "Best match for this" : "Also worth a look"} · {KIND[m.kind].label}</span>
          <VerdictBadge verdict={m.verdict} short />
        </div>
        <div className="flex items-start gap-3.5">
          {person ? <Avatar src={m.avatar} name={m.title} size={lead ? 60 : 48} /> : <KindTile kind={m.kind} size={lead ? 56 : 44} />}
          <div className="min-w-0 flex-1">
            <h3 className={cx("font-bold leading-snug", lead ? "text-2xl" : "text-lg")} style={{ letterSpacing: "-0.02em" }}>{m.title}</h3>
            <p className="mt-0.5 text-[13px] text-muted">{[m.sub, when(m)].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <p className={cx("leading-snug text-ink/90", lead ? "text-base" : "text-sm")}><span className="font-semibold">How it helps. </span>{r.helps}</p>
        <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-ink/[.06] px-2.5 py-1 text-xs font-semibold text-ink/75"><Sparkles className="h-3.5 w-3.5" aria-hidden />{r.because}</p>
        {m.gap && m.verdict !== "now" && (
          <div className={cx("rounded-xl border px-3.5 py-2.5 text-sm leading-snug", v.tint, v.ring)} data-testid="ask-gap">
            <span className={cx("mr-1.5 text-[11px] font-bold uppercase", v.text)} style={{ letterSpacing: "0.1em" }}>{v.label}</span><span className="text-ink/90">{m.gap}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Link to={LINKS[m.kind](m)} className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold hover:opacity-90" style={ACCENT} data-testid="ask-open">{CTA[m.kind]}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
          <button type="button" onClick={() => onAdd(m)} disabled={added} data-testid="ask-add" className={cx("inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-sm font-semibold transition", added ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-line hover:bg-ink/5")}>
            {added ? <><Check className="h-4 w-4" aria-hidden />In your plan</> : <><Plus className="h-4 w-4" aria-hidden />Add to my plan</>}
          </button>
        </div>
      </div>
    </article>
  );
}

function Results({ msg, added, onAdd }) {
  if (!msg) return null;
  return (
    <div className="space-y-3.5" data-testid="ask-results">
      {msg.results.map((r, i) => <Answer key={`${r.item.kind}-${r.item.id}`} r={r} topic={msg.topic} lead={i === 0} added={added.has(`${r.item.kind}:${r.item.id}`)} onAdd={onAdd} />)}
    </div>
  );
}

export default function Ask() {
  const { account } = useAuth();
  const eco = useEcosystem();
  const [qs, setQs] = useSearchParams();
  const [moves, setMoves] = useState(null);
  const [plan, setPlan] = useState({});
  const [startup, setStartup] = useState({});
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [added, setAdded] = useState(() => new Set());
  const state = useRef({});
  const lastRef = useRef(null);
  const ran = useRef(false);
  useEffect(() => { document.title = "Ask · Pathwai"; }, []);
  useEffect(() => {
    api.get("/navigator/moves").then((r) => setMoves(r.data)).catch(() => setMoves({ lists: {} }));
    api.get("/navigator/plan").then((r) => { setPlan(r.data.plan || {}); setStartup(r.data.startup || {}); }).catch(() => {});
  }, [account?.startup]); // eslint-disable-line react-hooks/exhaustive-deps
  const lists = moves?.lists || {};
  const today = moves?.as_of || new Date().toISOString().slice(0, 10);
  const doing = useMemo(() => buildPlan({ direction: plan.direction, lists, plan, today }).filter((s) => s.status === "doing" && s.kind !== "advisor").slice(0, 1), [plan, moves]); // eslint-disable-line react-hooks/exhaustive-deps
  const chips = useMemo(() => [...(doing[0] ? [`Help me with: ${doing[0].title.replace(/^(Apply to|Ask|Use|Go to) /, "")}`] : []), ...SUGGESTIONS].slice(0, 5), [doing]);

  const send = (t) => {
    const q = String(t ?? text).trim();
    if (!q || typing) return;
    setText("");
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setTyping(true);
    window.setTimeout(() => {
      const a = ask(q, { lists, startup, plan, state: state.current });
      state.current = a ? a.state : state.current;
      setMsgs((m) => [...m, { role: "bot", ...(a || {}), text: a ? a.reply : "", q }]);
      setTyping(false);
    }, 450);
  };
  useEffect(() => {
    const q = qs.get("q");
    if (q && moves && !ran.current) { ran.current = true; setQs({}, { replace: true }); send(q); }
  }, [moves]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (msgs.length) lastRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }, [msgs]);

  const addToPlan = async (m) => {
    const topic = [...msgs].reverse().find((x) => x.role === "bot" && x.results?.some((r) => r.item === m))?.topic || "";
    try {
      await api.post("/navigator/plan", { add: { title: actionText(m, topic), horizon: "soon" } });
      setAdded((s) => new Set(s).add(`${m.kind}:${m.id}`));
      toast.success(plan.direction ? "Added to your plan" : "Saved to your plan. Pick a direction to see it with the rest.");
    } catch (e) { toast.error(errMsg(e)); }
  };

  if (!moves) return <Spinner />;
  const first = (account?.name || "").split(/\s+/)[0];
  const latest = [...msgs].reverse().find((m) => m.role === "bot" && m.results?.length);
  const lastBot = [...msgs].reverse().find((m) => m.role === "bot");
  return (
    <div className="mx-auto max-w-6xl" data-testid="ask">
      <header className="mb-6">
        <p className="eyebrow">Ask{eco?.hub ? ` · ${eco.hub}` : ""}</p>
        <h1 className="mt-2 text-3xl sm:text-4xl" style={{ ...heading, letterSpacing: "-0.03em", textWrap: "balance" }}>What do you want to make happen{first ? `, ${first}` : ""}?</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">Say it the way you would to a friend. I'll show you the one person or resource who can help most, and why.</p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,25rem)_1fr]">
        <section className="flex min-w-0 flex-col rounded-3xl border border-line bg-surface shadow-sm" aria-label="Chat">
          <div className="flex min-h-[10rem] flex-1 flex-col gap-4 p-4 sm:p-5 lg:max-h-[34rem] lg:min-h-[18rem] lg:overflow-y-auto" data-testid="ask-thread" aria-live="polite">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={ACCENT}><MessageCircle className="h-4 w-4" aria-hidden /></span>
              <p className="max-w-[88%] rounded-2xl rounded-tl-md bg-ink/[.06] px-3.5 py-2.5 text-sm leading-snug">Hi{first ? ` ${first}` : ""}. Tell me what you are trying to make happen, and I'll point you to who or what can help.</p>
            </div>
            {msgs.map((m, i) => m.role === "user" ? (
              <div key={i} className="scroll-mt-24 flex justify-end" ref={i === msgs.length - 1 ? lastRef : null}><p className="max-w-[88%] rounded-2xl rounded-tr-md px-3.5 py-2.5 text-sm leading-snug" style={ACCENT} data-testid="ask-user">{m.text}</p></div>
            ) : (
              <div key={i} className="scroll-mt-24 space-y-3" data-testid="ask-bot" ref={i === msgs.length - 1 ? lastRef : null}>
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={ACCENT}><MessageCircle className="h-4 w-4" aria-hidden /></span>
                  <div className="min-w-0 max-w-[88%] space-y-2.5">
                    <p className="rounded-2xl rounded-tl-md bg-ink/[.06] px-3.5 py-2.5 text-sm leading-snug">{m.text}</p>
                    {m.link && <Link to={m.link.to} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold" style={ACCENT}>{m.link.label}<ArrowRight className="h-4 w-4" aria-hidden /></Link>}
                  </div>
                </div>
                {m.results?.length > 0 && <div className="lg:hidden"><Results msg={m} added={added} onAdd={addToPlan} /></div>}
              </div>
            ))}
            {typing && <div className="flex items-center gap-2 pl-10 text-muted" data-testid="ask-typing" aria-label="Thinking"><span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-ink/30" style={{ animationDelay: `${i * 120}ms` }} />)}</span></div>}
          </div>
          <div className="sticky bottom-[4.5rem] z-10 space-y-3 rounded-b-3xl border-t border-line bg-surface p-3.5 sm:p-4 lg:static">
            <div className={cx("flex flex-wrap gap-2", !msgs.length && "lg:hidden")} data-testid="ask-chips">
              {((lastBot && lastBot.chips && lastBot.chips.length ? lastBot.chips : chips)).map((c) => (
                <button key={c} type="button" onClick={() => send(c)} className="rounded-full border border-line px-3.5 py-1.5 text-left text-sm text-ink/80 transition hover:bg-ink/5">{c}</button>
              ))}
            </div>
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <input className="input !rounded-full !py-3" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. I need my first paying customers" aria-label="What do you want to make happen?" data-testid="ask-input" maxLength={300} autoComplete="off" />
              <button type="submit" disabled={!text.trim() || typing} aria-label="Send" data-testid="ask-send" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40" style={ACCENT}><ArrowUp className="h-5 w-5" aria-hidden /></button>
            </form>
          </div>
        </section>
        <section className="hidden min-w-0 lg:block" aria-label="Best match" data-testid="ask-panel">
          {latest ? (
            <div className="space-y-4">
              <p className="text-sm text-muted">For: <span className="font-semibold text-ink" data-testid="ask-for">{latest.q}</span></p>
              <Results msg={latest} added={added} onAdd={addToPlan} />
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-line p-8 text-center" data-testid="ask-empty">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={ACCENT}><Sparkles className="h-5 w-5" aria-hidden /></span>
              <h2 className="mt-4 text-xl font-bold" style={heading}>Your best match shows up here</h2>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">Ask in the chat, or tap one of these. You'll see who or what can help, why, and what it would take if it isn't a fit yet.</p>
              <div className="mx-auto mt-5 flex max-w-md flex-col gap-2">
                {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => send(s)} className="rounded-xl border border-line px-4 py-3 text-left text-sm font-medium transition hover:bg-ink/5" data-testid="ask-suggest">{s}</button>)}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
