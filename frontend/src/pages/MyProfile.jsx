import React, { useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Compass, MessageCircle, Pencil, Plus, Rocket } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { STAGE_LABEL } from "../lib/navigator";
import { Avatar, Button, Card, Chip, Modal, PoweredBy, Spinner, Wordmark } from "../components/ui";
import { AccountProfileForm, formFromAccount, profileBody, profileProblem } from "../components/AccountProfileForm";
import GuideChat from "../components/GuideChat";
import NextSteps from "../components/NextSteps";
import PitchCard from "../components/PitchCard";
import { ContactCard, List } from "./MemberProfile";

// "Your profile": the one profile on your Pathwai account (outside any community), laid out exactly like a member's card inside a
// community: photo card, the startup pitch, contact, photos, then skills / interests / goals / support. Everything here is editable in
// one tap, and this same profile is what the Navigator, "Your next steps" and the guide read from. Saves with PATCH /hub/profile.

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function EmptyCard({ title, hint, onAdd, testId }) {
  return (
    <button type="button" onClick={onAdd} data-testid={testId} className="card flex w-full items-center gap-3 !border-dashed text-left transition hover:border-ink/40">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgb(var(--c-ink) / 0.07)", color: "var(--accent)" }}><Plus className="h-4 w-4" aria-hidden /></span>
      <span className="min-w-0"><span className="block text-sm font-semibold">{title}</span><span className="block text-xs text-muted">{hint}</span></span>
    </button>
  );
}

export default function MyProfile({ embedded }) {
  const { account, user, loading, refresh } = useAuth();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [pf, setPf] = useState(null);
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const formRef = useRef(null);

  const startEdit = (addStartup) => { if (!account) return; setPf(formFromAccount(account, addStartup)); setPhoto(account.avatar_url || ""); setEditing(true); };
  // ?edit=startup (a link from anywhere) opens the editor with the startup section ready to fill in.
  useEffect(() => {
    if (!account || editing) return;
    const want = params.get("edit");
    if (want) { startEdit(want === "startup"); setParams({}, { replace: true }); }
  }, [account?.id, params]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = "Your profile · Pathwai"; }, []);
  useEffect(() => { if (editing) window.scrollTo({ top: 0 }); }, [editing]);

  if (loading) return <Spinner />;
  if (!account) return <Navigate to="/login" replace />;

  const save = async () => {
    const problem = profileProblem(pf);
    if (problem) return toast.error(problem);
    setBusy(true);
    try { await api.patch("/hub/profile", profileBody(pf, photo)); await refresh(); setVersion((v) => v + 1); toast.success("Profile saved"); setEditing(false); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const st = account.startup || {};
  const u = { startup_name: st.name, startup_one_liner: st.one_liner, stage: st.stage ? cap(STAGE_LABEL[st.stage] || st.stage) : "", industry: (st.sectors || []).map(cap).join(" · "), pitch: st.pitch || {}, documents: st.documents || [], company: account.company };
  const hasPitch = !!(st.name || st.one_liner || Object.keys(st.pitch || {}).length || (st.documents || []).length);
  const stats = [["Age", account.age], ["Stage", u.stage], ["Role", account.title]].filter(([, v]) => v);
  const contact = { contact: { email: account.email, ...(account.contact || {}) } };
  const photos = account.photos || [];

  const body = editing ? (
    <div className="mx-auto w-full max-w-2xl" data-testid="my-profile-edit">
      <Card className="space-y-1">
        <h1 className="text-2xl" style={{ textTransform: "none", letterSpacing: 0 }}>Edit your profile</h1>
        <p className="pb-3 text-sm text-muted">One profile for everything on Pathwai. Programs, deadlines and communities that fit you update as soon as you save.</p>
        <div ref={formRef}><AccountProfileForm f={pf} setF={setPf} photo={photo} setPhoto={setPhoto} /></div>
      </Card>
      {/* Inside a community the phone's bottom tab bar is showing, so the bar rides above it. */}
      <div className={`sticky z-10 -mx-1 mt-3 flex justify-end gap-2 border-t border-line bg-[rgb(var(--c-bg))] px-1 py-3 ${embedded ? "bottom-[calc(3.75rem+env(safe-area-inset-bottom))] md:bottom-0" : "bottom-0"}`}>
        <Button variant="ghost" onClick={() => setEditing(false)} data-testid="my-profile-cancel">Cancel</Button>
        <Button onClick={save} loading={busy} data-testid="my-profile-save">Save profile</Button>
      </div>
    </div>
  ) : (
    <div className="mx-auto w-full max-w-5xl space-y-5" data-testid="my-profile">
      <Card className="!p-0 overflow-hidden" data-testid="member-card">
        <div className="grid gap-0 md:grid-cols-[260px_1fr]">
          <div className="relative min-h-[260px] bg-ink/5">
            {account.avatar_url ? <img src={account.avatar_url} alt={account.name} className="absolute inset-0 h-full w-full object-cover" /> : <Avatar name={account.name} size={260} square />}
          </div>
          <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap gap-1.5"><Chip accent>{hasPitch ? "Founder" : "Member"}</Chip>{u.stage && <Chip>{u.stage}</Chip>}</div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl">{account.name}</h1>
                <p className="mt-1 text-sm text-muted">{[account.company, account.location].filter(Boolean).join(" · ") || "Add where you work and where you're based"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => startEdit(false)} data-testid="my-profile-edit-btn"><Pencil className="h-4 w-4" />Edit profile</Button>
                <button type="button" className="btn-ghost" onClick={() => setGuideOpen(true)} data-testid="my-profile-ask"><MessageCircle className="h-4 w-4" />Ask the guide</button>
              </div>
            </div>
            {stats.length > 0 && (
              <dl className="grid gap-px overflow-hidden border border-line bg-line" style={{ borderRadius: "var(--r-card)", gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
                {stats.map(([k, v]) => <div key={k} className="min-w-0 bg-surface px-4 py-3"><dt className="eyebrow">{k}</dt><dd className={"mt-1 " + (k === "Age" ? "font-display text-2xl" : "text-sm font-medium leading-snug")}>{v}</dd></div>)}
              </dl>
            )}
            {account.bio ? <p className="whitespace-pre-line text-sm leading-relaxed text-ink/90">{account.bio}</p> : <button type="button" onClick={() => startEdit(false)} className="self-start text-sm text-muted hover:text-ink">+ Add a short bio</button>}
          </div>
        </div>
      </Card>

      {hasPitch ? (
        <div className="relative">
          {/* On a phone the button sits above the card, so it never covers the startup's name. */}
          <div className="mb-2 flex justify-end sm:absolute sm:right-3 sm:top-3 sm:z-10 sm:mb-0"><button type="button" onClick={() => startEdit(false)} className="btn-ghost !px-3 !py-1.5 text-sm" aria-label="Edit your startup" data-testid="my-profile-edit-startup"><Pencil className="h-4 w-4" />Edit</button></div>
          <PitchCard u={u} />
        </div>
      ) : (
        <button type="button" onClick={() => startEdit(true)} data-testid="my-profile-add-startup" className="card flex w-full items-center gap-4 !border-dashed text-left transition hover:border-ink/40">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Rocket className="h-5 w-5" aria-hidden /></span>
          <span className="min-w-0"><span className="block text-base font-semibold">Add your startup</span><span className="block text-sm text-muted">Name it, say where it's at and what you need. The Navigator and the guide start from this.</span></span>
        </button>
      )}
      <p className="-mt-2 text-xs text-muted">Only you can see your startup details here. When you join a community, your startup's name and one line come with you.</p>

      <NextSteps version={version} onEditProfile={(add) => startEdit(add)} onAsk={() => setGuideOpen(true)} />

      <ContactCard u={contact} self={false} />

      {photos.length > 0 && (
        <Card data-testid="member-photos">
          <h3 className="label">Photos</h3>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6">{photos.map((src, i) => <img key={i} src={src} alt="" className="aspect-square w-full rounded-lg object-cover" />)}</div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {[["Skills", account.skill_set, false, "Add your skills", "What you're good at"], ["Interests", account.interests_hobbies, false, "Add interests", "What you do for fun"],
          ["Goals", account.goals, false, "Add your goals", "What you're working toward"], ["Support needed", account.support_needs, true, "Say what support helps", "What would help most right now"]]
          .map(([title, items, accent, cta, hint]) => items?.length ? <List key={title} title={title} items={items} accent={accent} /> : <EmptyCard key={title} title={cta} hint={hint} onAdd={() => startEdit(false)} testId={`my-profile-add-${title.split(" ")[0].toLowerCase()}`} />)}
      </div>

      <Modal open={guideOpen} onClose={() => setGuideOpen(false)} title="Ask the guide">
        <GuideChat className="h-[65dvh]" signedIn hasProfile={!!st.stage} startupName={st.name} />
      </Modal>
    </div>
  );

  if (embedded) return <div className="py-2">{body}</div>;
  return (
    <div className="min-h-[100dvh] px-4 py-5 sm:py-8" data-testid="my-profile-page">
      <header className="mx-auto mb-8 flex w-full max-w-5xl items-center justify-between gap-3">
        <Link to="/hub" className="text-xl"><Wordmark name="Pathwai" brand={{}} /></Link>
        <div className="flex items-center gap-2">
          <Link to="/navigator" className="btn-ghost !py-2 text-sm"><Compass className="h-4 w-4" />Navigator</Link>
          <Link to="/hub" className="btn-ghost !py-2 text-sm" data-testid="my-profile-back">Back to Hub</Link>
        </div>
      </header>
      {body}
      <PoweredBy className="mt-10 pb-2 text-center" />
    </div>
  );
}
