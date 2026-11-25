import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, Clock, LogOut, Pencil, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import AccountShell from "../components/AccountShell";
import { Modal, Spinner, cx } from "../components/ui";
import { isInnovation } from "../lib/communityGroup";
import { MEMBERS_VISIBLE } from "../lib/flags";

// Communities: the hubs, accelerators and founder networks you can join with the one profile on your account.
//   Yours      the ones you are in (open one) and the ones waiting to be confirmed
//   Open to you  the rest, each with "Apply with my profile". Applying sends what your profile already says; a community's own extra
//              questions are asked once, and an answer you gave to the same question elsewhere is filled in for you.
// Pathwai's practice community (c.open) has no waiting: it opens at once and only ever receives your name.

const heading = { textTransform: "none", letterSpacing: "-0.01em", fontWeight: 700 };
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const STAGE = { idea: "Idea", mvp: "Early product", prototype: "Prototype", launched: "Launched", early_revenue: "Early revenue", revenue: "Revenue", growth: "Growth" };

const answersKey = (id) => `pw-answers:${id}`;
const loadAnswers = (id) => { try { return JSON.parse(localStorage.getItem(answersKey(id)) || "{}"); } catch { return {}; } };
const saveAnswers = (id, a) => { try { localStorage.setItem(answersKey(id), JSON.stringify({ ...loadAnswers(id), ...a })); } catch { /* storage blocked: answers are just not remembered */ } };

function Logo({ c, size = 44 }) {
  return <span className="flex shrink-0 items-center justify-center rounded-xl text-sm font-bold" style={{ width: size, height: size, background: c.brand?.colors?.accent || "var(--accent)", color: c.brand?.colors?.on_accent || "#fff" }} aria-hidden>{(c.name || "?").slice(0, 1)}</span>;
}

function Chip({ children, tone = "bg-ink/[.06] text-muted" }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tone)}>{children}</span>;
}

// What an application will carry from the profile, one row each, so it is clear nothing has to be retyped and what is still missing.
function profileRows(a) {
  const st = a?.startup || {};
  const list = (v) => (Array.isArray(v) && v.length ? v.slice(0, 4).join(", ") : "");
  return [
    ["Name", a?.name || ""],
    ["Your startup", [st.name, st.one_liner].filter(Boolean).join(" · ")],
    ["Stage and sector", [STAGE[st.stage], (st.sectors || [])[0]].filter(Boolean).join(" · ")],
    ["About you", a?.bio ? (a.bio.length > 90 ? `${a.bio.slice(0, 90)}…` : a.bio) : ""],
    ["Skills", list(a?.skill_set)],
    ["Goals", list(a?.goals)],
    ["Where you need help", list(a?.support_needs)],
    ["Location", a?.location || ""],
  ];
}

function ApplySheet({ c, account, onClose, onSent }) {
  const questions = c.apply_questions || [];
  const saved = useMemo(() => loadAnswers(account.id), [account.id]);
  const [ans, setAns] = useState(() => Object.fromEntries(questions.map((q) => [q.key, saved[norm(q.label)] || ""])));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = profileRows(account);
  const missing = rows.filter(([, v]) => !v).length;
  const reused = questions.filter((q) => saved[norm(q.label)]).length;
  const send = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const answers = Object.fromEntries(questions.map((q) => [q.label, (ans[q.key] || "").trim()]).filter(([, v]) => v));
      const { data } = await api.post(`/hub/communities/${c.slug}/apply`, { answers, message: note.trim() });
      saveAnswers(account.id, Object.fromEntries(questions.map((q) => [norm(q.label), (ans[q.key] || "").trim()]).filter(([, v]) => v)));
      onSent(data.status || "pending");
    } catch (ex) { toast.error(errMsg(ex, "Could not send your application. Please try again.")); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Apply to ${c.name}`}>
      <form onSubmit={send} className="space-y-5" data-testid="apply-sheet">
        <section aria-label="From your profile">
          <div className="flex items-baseline justify-between gap-3"><p className="text-sm font-semibold">Sent from your profile</p><Link to="/me" className="inline-flex items-center gap-1 text-xs font-semibold text-muted underline underline-offset-2 hover:text-ink"><Pencil className="h-3 w-3" aria-hidden />Edit profile</Link></div>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
            {rows.map(([k, v]) => (
              <li key={k} className="flex items-start gap-2.5 px-3 py-2 text-sm" data-testid="apply-row" data-done={v ? "1" : "0"}>
                {v ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /> : <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border border-dashed border-ink/40" aria-hidden />}
                <span className="w-28 shrink-0 text-muted">{k}</span>
                <span className={cx("min-w-0 flex-1", !v && "text-muted")}>{v || "Not added yet"}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">{missing ? `${missing} of ${rows.length} are empty. Add them once in your profile and every community you apply to gets them. ` : "Your profile covers everything. "}Your startup's needs, next step and plan stay private to you.</p>
        </section>

        {questions.length > 0 && (
          <section aria-label={`Questions from ${c.name}`} className="space-y-3">
            <p className="text-sm font-semibold">Questions from {c.name}</p>
            {questions.map((q) => (
              <label key={q.key} className="block text-sm">
                <span className="mb-1 block text-muted">{q.label}</span>
                <input value={ans[q.key] || ""} onChange={(e) => setAns({ ...ans, [q.key]: e.target.value })} placeholder={q.placeholder || ""} maxLength={300} data-testid={`apply-q-${q.key}`}
                  className="w-full rounded-xl border border-line bg-transparent px-3 py-2.5 text-sm outline-none focus:border-ink/50" />
              </label>
            ))}
            {reused > 0 && <p className="text-xs text-muted" data-testid="apply-reused">{reused === 1 ? "One answer is" : `${reused} answers are`} filled in from an earlier application. Change anything you like.</p>}
          </section>
        )}

        <label className="block text-sm"><span className="mb-1 block text-muted">Anything to add? (optional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className="w-full resize-none rounded-xl border border-line bg-transparent px-3 py-2.5 text-sm outline-none focus:border-ink/50" /></label>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className="btn-primary !px-5 !py-2.5 text-sm" data-testid="apply-send">{busy ? "Sending…" : "Send my application"}<ArrowRight className="h-4 w-4" aria-hidden /></button>
          <p className="min-w-0 flex-1 basis-48 text-xs text-muted">The Pathwai team confirms your request with {c.name}. You will see it under Your communities.</p>
        </div>
      </form>
    </Modal>
  );
}

function Card({ c, children, testId }) {
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4" data-testid={testId || `community-${c.slug}`} data-status={c.my?.status || "none"}>
      <Logo c={c} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{c.name}</p>
        <p className="truncate text-xs text-muted">{[c.kind, MEMBERS_VISIBLE && c.members ? `${c.members} ${c.members === 1 ? "member" : "members"}` : ""].filter(Boolean).join(" · ")}</p>
        {c.tagline && <p className="mt-1.5 line-clamp-2 text-sm text-ink/80">{c.tagline}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </li>
  );
}

export default function Communities({ embedded }) {
  const { account, user, config, loading, enter, leave } = useAuth();
  const nav = useNavigate();
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [apply, setApply] = useState(null);
  const [busy, setBusy] = useState("");
  useEffect(() => { document.title = "Communities · Pathwai"; }, []);

  const load = useCallback(() => api.get("/hub/communities").then((r) => { setList(r.data.communities || []); setError(""); }).catch((e) => setError(errMsg(e, "Could not load communities. Please try again."))), []);
  useEffect(() => { if (!loading && account) load(); }, [loading, account, load]);

  const mine = useMemo(() => (list || []).filter((c) => isInnovation(c) && c.my?.status === "approved"), [list]);
  const waiting = useMemo(() => (list || []).filter((c) => isInnovation(c) && c.my?.status === "pending"), [list]);
  const more = useMemo(() => (list || []).filter((c) => isInnovation(c) && !["approved", "pending"].includes(c.my?.status)).sort((a, b) => (b.open ? 1 : 0) - (a.open ? 1 : 0) || (b.members || 0) - (a.members || 0)), [list]);

  const open = async (c) => {
    setBusy(c.slug);
    try { await enter(c.slug); nav("/", { replace: true }); } catch (e) { toast.error(errMsg(e, "Could not open this community.")); setBusy(""); }
  };
  // The practice community has no waiting list, so it is one tap: join with only a name, then walk in.
  const tryOpen = async (c) => {
    setBusy(c.slug);
    try {
      await api.post(`/hub/communities/${c.slug}/apply`, {});
      await enter(c.slug);
      toast.success(`Welcome to ${c.name}. Same account, its own programs, events and people.`);
      nav("/", { replace: true });
    } catch (e) { toast.error(errMsg(e, "Could not open this community.")); setBusy(""); }
  };
  const goBack = async () => { setBusy("leave"); try { await leave(); nav("/navigator", { replace: true }); } catch (e) { toast.error(errMsg(e, "Could not switch.")); setBusy(""); } };
  const sent = (status) => {
    const c = apply; setApply(null);
    if (status === "approved") { open(c); return; }
    toast.success(`Application sent to ${c.name}. We will confirm it with them.`);
    load();
  };

  if (loading) return <Spinner />;
  const page = (
    <div className="mx-auto w-full max-w-3xl" data-testid="communities-page">
      <p className="eyebrow">Communities</p>
      <h1 className="mt-2 text-3xl sm:text-4xl" style={{ textTransform: "none", letterSpacing: "-0.03em", fontWeight: 800, textWrap: "balance" }}>One profile, every community</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">Join a hub with the profile you already have. Each community adds its own programs, events, people and resources on top of Pathwai.</p>

      {user && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 p-4" style={{ borderColor: "var(--accent)" }} data-testid="communities-current">
          <p className="min-w-0 text-sm"><span className="text-muted">You are in</span> <span className="font-semibold">{config?.community_name || "a community"}</span></p>
          <button type="button" onClick={goBack} disabled={busy === "leave"} className="btn-ghost !py-2 text-sm" data-testid="communities-leave"><LogOut className="h-4 w-4" aria-hidden />Back to all of Pathwai</button>
        </div>
      )}

      {error && <p className="mt-4 rounded-xl border border-red-500/40 p-3 text-sm text-red-500" role="alert">{error}</p>}
      {!list && !error ? <div className="mt-10"><Spinner /></div> : list && (
        <div className="mt-7 space-y-8">
          <section aria-label="Your communities">
            <h2 className="text-lg" style={heading}>Your communities</h2>
            {mine.length + waiting.length === 0
              ? <p className="mt-3 rounded-2xl border border-dashed border-line p-4 text-sm text-muted" data-testid="communities-none">You have not joined a community yet. Pick one below and apply with your profile.</p>
              : <ul className="mt-3 space-y-3">
                  {mine.map((c) => (
                    <Card key={c.slug} c={c}>
                      {user && config?.community_name === c.name
                        ? <Chip tone="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><Check className="h-3 w-3" aria-hidden />You are here</Chip>
                        : <button type="button" onClick={() => open(c)} disabled={busy === c.slug} className="btn-primary !px-4 !py-2 text-sm" data-testid={`community-open-${c.slug}`}>{busy === c.slug ? "Opening…" : "Open"}<ArrowRight className="h-4 w-4" aria-hidden /></button>}
                    </Card>
                  ))}
                  {waiting.map((c) => (
                    <Card key={c.slug} c={c}><Chip><Clock className="h-3 w-3" aria-hidden />Waiting for confirmation</Chip><span className="text-xs text-muted">We are confirming your request with them.</span></Card>
                  ))}
                </ul>}
          </section>

          {more.length > 0 && (
            <section aria-label="Open to you">
              <h2 className="text-lg" style={heading}>Open to you</h2>
              <ul className="mt-3 space-y-3">
                {more.map((c) => (
                  <Card key={c.slug} c={c}>
                    {c.open
                      ? <><button type="button" onClick={() => tryOpen(c)} disabled={busy === c.slug} className="btn-primary !px-4 !py-2 text-sm" data-testid={`community-try-${c.slug}`}><Sparkles className="h-4 w-4" aria-hidden />{busy === c.slug ? "Opening…" : "Try it now"}</button><span className="text-xs text-muted">Practice community. Made-up people and events. It only ever receives your name.</span></>
                      : <button type="button" onClick={() => setApply(c)} className="btn-primary !px-4 !py-2 text-sm" data-testid={`community-apply-${c.slug}`}>Apply with my profile<ArrowRight className="h-4 w-4" aria-hidden /></button>}
                  </Card>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {apply && account && <ApplySheet c={apply} account={account} onClose={() => setApply(null)} onSent={sent} />}
    </div>
  );
  return embedded ? page : <AccountShell active="communities">{page}</AccountShell>;
}
