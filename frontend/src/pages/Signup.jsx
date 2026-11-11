import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { applyBrand } from "../lib/theme";
import { inDemoTab, leaveDemo } from "../lib/demo";
import { AvatarUpload, Button, Card, Field, Input, MembershipStatusCard, Select, TagInput, Textarea, TermsConsent, Wordmark, cx } from "../components/ui";
import { SUGGEST, ageFromBirthday, oldestISO, todayISO } from "../lib/profile";
import StartupFields, { BLANK_STARTUP, startupToApi } from "../components/StartupFields";
import SocialAuthButtons from "../components/SocialAuthButtons";

// Asked once, right after account creation — before landing in the hub or in the new community's
// setup wizard — so every "request to join" from here on starts pre-filled instead of asking the
// same standard questions (occupation, bio, skills, interests) fresh for each community.
function BuildProfileStep({ account, onDone, joinInfo, founder }) {
  const [f, setF] = useState({
    name: account?.name || "", birthday: "", title: "", company: "", location: "", bio: "", skill_set: [], interests_hobbies: [], goals: [], support_needs: [], startup: founder ? { ...BLANK_STARTUP } : null,
    contact: { phone: "", linkedin: "", instagram: "", website: "" },
  });
  const [photo, setPhoto] = useState(account?.avatar_url || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setContact = (k) => (e) => setF({ ...f, contact: { ...f.contact, [k]: e.target.value } });
  const save = async () => {
    if (f.name.trim().length < 2) return setErr("Enter your name.");
    if (!f.birthday) return setErr("Enter your birthday.");
    const yrs = ageFromBirthday(f.birthday);
    if (yrs === null || yrs > 120) return setErr("Check the year of your birthday.");
    if (yrs < 13) return setErr("You need to be at least 13 to use Pathwai.");
    setBusy(true); setErr("");
    try { await api.patch("/hub/profile", { ...f, startup: startupToApi(f.startup), avatar_url: photo || null }); onDone(); }
    catch (ex) { setErr(errMsg(ex)); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <span className="mb-6 text-2xl"><Wordmark name={joinInfo?.name || "Pathwai"} brand={joinInfo?.brand || {}} /></span>
      <h1 className="mb-1 text-2xl font-bold sm:text-3xl">{founder ? "Tell us about you and your startup" : "Build your Pathwai profile"}</h1>
      <p className="mb-6 text-sm text-muted">A few standard questions, asked once. From here on, every community you apply to starts with this instead of asking again — you can still adjust it per community afterward.</p>
      <Card>
        <div className="space-y-4">
          <AvatarUpload photo={photo} onChange={setPhoto} name={f.name} testId="profile-photo-upload" />
          <Field label="Name"><Input data-testid="profile-name" value={f.name} onChange={set("name")} required minLength={2} maxLength={120} /></Field>
          <Field label="Birthday *"><Input data-testid="profile-birthday" type="date" min={oldestISO()} max={todayISO()} value={f.birthday} onChange={set("birthday")} required /></Field>
          <p className="-mt-2 text-xs text-muted">Your age is worked out from this and keeps updating on its own. Other members see your age, never your birthday.</p>
          <Field label="What do you do?"><Input data-testid="profile-title" value={f.title} onChange={set("title")} placeholder="e.g. Physiotherapist, teacher, chef" maxLength={120} /></Field>
          <Field label="Employer or school"><Input data-testid="profile-company" value={f.company} onChange={set("company")} maxLength={120} /></Field>
          <Field label="Neighbourhood or city"><Input data-testid="profile-location" value={f.location} onChange={set("location")} maxLength={120} /></Field>
          <Field label="About you"><Textarea data-testid="profile-bio" rows={3} value={f.bio} onChange={set("bio")} maxLength={1000} /></Field>
          <StartupFields value={f.startup} onChange={(v) => setF({ ...f, startup: v })} testPrefix="profile-startup" />
          <Field label="Skills"><TagInput value={f.skill_set} suggestions={SUGGEST.skill_set} onChange={(v) => setF({ ...f, skill_set: v })} /></Field>
          <Field label="Interests"><TagInput value={f.interests_hobbies} suggestions={SUGGEST.interests_hobbies} onChange={(v) => setF({ ...f, interests_hobbies: v })} /></Field>
          <Field label="Goals"><TagInput value={f.goals} suggestions={SUGGEST.goals} onChange={(v) => setF({ ...f, goals: v })} /></Field>
          <Field label="Support needed"><TagInput value={f.support_needs} suggestions={SUGGEST.support_needs} onChange={(v) => setF({ ...f, support_needs: v })} /></Field>
          <div>
            <p className="label">Contact info <span className="font-normal normal-case text-muted">(optional — shown to members you're connected with)</span></p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Input data-testid="profile-phone" placeholder="Phone" value={f.contact.phone} onChange={setContact("phone")} />
              <Input data-testid="profile-linkedin" type="url" placeholder="LinkedIn" value={f.contact.linkedin} onChange={setContact("linkedin")} />
              <Input data-testid="profile-instagram" placeholder="Instagram (@you)" value={f.contact.instagram} onChange={setContact("instagram")} />
              <Input data-testid="profile-website" type="url" placeholder="Website" value={f.contact.website} onChange={setContact("website")} />
            </div>
          </div>
          {err && <p className="text-sm text-red-400" data-testid="profile-error">{err}</p>}
          <div className="flex items-center justify-end gap-3 pt-1">
            <Button onClick={save} loading={busy} data-testid="profile-submit">Save and continue</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Same persistent "under review" card Login.jsx shows an existing member who re-logs-in while
// still pending -- previously a brand-new signup only got a toast here, which vanishes, leaving
// the Hub tile's pending pill as the only lasting sign the request actually went in. One card,
// one set of words, wherever "pending" shows up in the join flow.
function PendingStep({ communityName, onContinue }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <span className="mb-6 text-2xl"><Wordmark name={communityName || "Pathwai"} brand={{}} /></span>
      <h1 className="mb-1 text-2xl font-bold sm:text-3xl">Request sent</h1>
      <p className="mb-6 text-sm text-muted">Your account is set up. Here's where things stand with {communityName || "the community"}.</p>
      <MembershipStatusCard status="pending" communityName={communityName} testId="signup-pending-status" />
      <Button className="mt-6 w-full" onClick={onContinue} data-testid="pending-continue">Go to your Hub</Button>
    </div>
  );
}

export default function Signup() {
  const { account, signup, applySession, refresh } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const joinSlug = params.get("join") || null;
  const [intent] = useState(joinSlug ? "member" : "founder"); // "founder" (the default) or "member" (arrived on a community's invite link)
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [agreed, setAgreed] = useState(false); // "I agree to the Terms of Service and Privacy Policy"
  const [busy, setBusy] = useState(false);
  const [showProfile, setShowProfile] = useState(false); // account exists; standard-profile step before landing anywhere
  const [showPending, setShowPending] = useState(false); // profile step done; join request came back pending approval
  const [joinInfo, setJoinInfo] = useState(null); // the target community's public info, when arriving via a share link
  const [joinResult, setJoinResult] = useState(null); // {slug, status} echoed back by signup when join_slug was sent

  // Creating a real account must never go to the demo's stand-in server (nothing there is saved): leave the demo first.
  const inDemo = inDemoTab();
  useEffect(() => { if (inDemo) leaveDemo("/signup" + window.location.search); }, [inDemo]);

  useEffect(() => {
    if (!joinSlug) return;
    api.get(`/hub/communities/${joinSlug}/public`)
      .then((r) => { setJoinInfo(r.data); applyBrand({ community_name: r.data.name, brand: r.data.brand }); })
      .catch(() => {}); // bad/stale link -- fall back to the plain Pathwai signup, silently
  }, [joinSlug]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // Runs once the standard profile step is done (saved or skipped) — this is where the
  // pre-signup "where do they land" logic actually happens, so the founding community entry
  // created below picks up whatever profile info was just saved.
  const afterProfile = async () => {
    {
      await refresh(); // picks up whatever was just saved in the standard profile step
      if (joinResult?.status === "approved") {
        // signup already dropped the pw_community cookie for us -- straight into the community
        nav("/", { replace: true });
      } else if (joinResult?.status === "pending") {
        setShowProfile(false);
        setShowPending(true);
      } else if (intent === "founder") {
        nav("/navigator", { replace: true }); // the point of this sign-up: programs matched to the profile just made
      } else {
        nav("/navigator", { replace: true });
      }
    }
  };

  const submit = async (e) => {
    e.preventDefault(); setErr("");
    if (f.password.length < 10 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) return setErr("Password needs 10+ characters with a letter and a number.");
    if (!agreed) return setErr("Please agree to the Terms of Service and Privacy Policy to create your account.");
    setBusy(true);
    try {
      const payload = { ...f, accepted_terms: true, ...(intent === "member" && joinSlug ? { join_slug: joinSlug } : {}) };
      const data = await signup(payload);
      setJoinResult(data?.joined || null);
      setShowProfile(true);
    } catch (ex) { setErr(errMsg(ex)); } finally { setBusy(false); }
  };

  const onSocialSignedIn = (data) => { applySession(data); setJoinResult(data?.joined || null); setShowProfile(true); };

  if (showPending) return <PendingStep communityName={joinInfo?.name} onContinue={() => nav("/navigator", { replace: true })} />;
  if (showProfile) return <BuildProfileStep account={account} onDone={afterProfile} joinInfo={joinInfo} founder={intent === "founder"} />;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <span className="mb-6 text-2xl"><Wordmark name={joinInfo?.name || "Pathwai"} brand={joinInfo?.brand || {}} /></span>
      <h1 className="mb-1 text-2xl font-bold sm:text-3xl">{intent === "founder" ? "Create your founder profile" : "Create your Pathwai account"}</h1>
      <p className="mb-6 text-sm text-muted">
        {joinInfo
          // Every community requires admin approval now -- no community can auto-approve a join request.
          ? <>You're creating your Pathwai account to join <strong>{joinInfo.name}</strong> — an admin will need to approve you.</>
          : "First your account. Next, a short profile about you and your startup. Then your programs."}
      </p>
      <Card>
        <SocialAuthButtons onSignedIn={onSocialSignedIn} disabled={busy} joinSlug={joinSlug} acceptedTerms={agreed} />
        <div className="my-5 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Full name"><Input data-testid="signup-name" value={f.name} onChange={set("name")} required minLength={2} /></Field>
          <Field label="Email"><Input data-testid="signup-email" type="email" value={f.email} onChange={set("email")} required /></Field>
          <Field label="Password" hint="10+ characters, with a letter and a number"><Input data-testid="signup-password" type="password" value={f.password} onChange={set("password")} required /></Field>
          <TermsConsent checked={agreed} onChange={(v) => { setAgreed(v); if (v) setErr(""); }} testId="signup-accept-terms" />
          {err && <p className="text-sm text-red-400" data-testid="signup-error">{err}</p>}
          <Button type="submit" loading={busy} className="w-full" data-testid="signup-submit">Create account</Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">Have an account? <Link className="underline" to="/login">Sign in</Link></p>
      </Card>
    </div>
  );
}
