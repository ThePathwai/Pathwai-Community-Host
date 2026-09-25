import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { AvatarUpload, Button, Card, Field, Input, Select, TagInput, Textarea, Wordmark, cx } from "../components/ui";
import { SUGGEST } from "../lib/profile";
import SocialAuthButtons from "../components/SocialAuthButtons";

const INTENTS = [
  { key: "member", title: "I'm joining a community", body: "Browse communities on Pathwai and request to join the ones that fit you." },
  { key: "admin", title: "I'm starting a new community", body: "Set up your own space — a church, a club, a wellness brand — with your own members, events and look." },
];

function IntentPicker({ onPick }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <span className="mb-6 text-2xl"><Wordmark name="Pathwai" brand={{}} /></span>
      <h1 className="mb-1 text-2xl font-bold sm:text-3xl">Welcome to Pathwai</h1>
      <p className="mb-6 text-sm text-muted">First, what brings you here?</p>
      <div className="space-y-3">
        {INTENTS.map((o) => (
          <button key={o.key} onClick={() => onPick(o.key)} data-testid={`intent-${o.key}`}
            className="w-full rounded-xl border border-line bg-surface p-5 text-left transition hover:border-ink/40 hover:bg-ink/5">
            <p className="text-base font-semibold">{o.title}</p>
            <p className="mt-1 text-sm text-muted">{o.body}</p>
          </button>
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-muted">Have an account? <Link className="underline" to="/login">Sign in</Link></p>
    </div>
  );
}

// Asked once, right after account creation — before landing in the hub or in the new community's
// setup wizard — so every "request to join" from here on starts pre-filled instead of asking the
// same standard questions (occupation, bio, skills, interests) fresh for each community.
function BuildProfileStep({ account, onDone }) {
  const [f, setF] = useState({
    name: account?.name || "", age: "", title: "", company: "", location: "", bio: "", skill_set: [], interests_hobbies: [], goals: [], support_needs: [],
    contact: { phone: "", linkedin: "", instagram: "", website: "" },
  });
  const [photo, setPhoto] = useState(account?.avatar_url || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setContact = (k) => (e) => setF({ ...f, contact: { ...f.contact, [k]: e.target.value } });
  const save = async () => {
    if (f.name.trim().length < 2) return setErr("Enter your name.");
    setBusy(true); setErr("");
    try { await api.patch("/hub/profile", { ...f, age: f.age ? parseInt(f.age, 10) : null, avatar_url: photo || null }); onDone(); }
    catch (ex) { setErr(errMsg(ex)); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <span className="mb-6 text-2xl"><Wordmark name="Pathwai" brand={{}} /></span>
      <h1 className="mb-1 text-2xl font-bold sm:text-3xl">Build your Pathwai profile</h1>
      <p className="mb-6 text-sm text-muted">A few standard questions, asked once. From here on, every community you apply to starts with this instead of asking again — you can still adjust it per community afterward.</p>
      <Card>
        <div className="space-y-4">
          <AvatarUpload photo={photo} onChange={setPhoto} name={f.name} testId="profile-photo-upload" />
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <Field label="Name"><Input data-testid="profile-name" value={f.name} onChange={set("name")} required minLength={2} maxLength={120} /></Field>
            <Field label="Age"><Input data-testid="profile-age" type="number" min={13} max={120} value={f.age} onChange={set("age")} placeholder="e.g. 29" /></Field>
          </div>
          <Field label="What do you do?"><Input data-testid="profile-title" value={f.title} onChange={set("title")} placeholder="e.g. Physiotherapist, teacher, chef" maxLength={120} /></Field>
          <Field label="Employer or school"><Input data-testid="profile-company" value={f.company} onChange={set("company")} maxLength={120} /></Field>
          <Field label="Neighbourhood or city"><Input data-testid="profile-location" value={f.location} onChange={set("location")} maxLength={120} /></Field>
          <Field label="About you"><Textarea data-testid="profile-bio" rows={3} value={f.bio} onChange={set("bio")} maxLength={1000} /></Field>
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
          <div className="flex items-center justify-between gap-3 pt-1">
            <button type="button" className="text-xs font-medium text-muted underline" onClick={onDone} data-testid="profile-skip">Skip for now</button>
            <Button onClick={save} loading={busy} data-testid="profile-submit">Save and continue</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function Signup() {
  const { account, signup, applySession, refresh } = useAuth();
  const nav = useNavigate();
  const [intent, setIntent] = useState(null); // null | "member" | "admin"
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [community, setCommunity] = useState({ name: "", category: "other" });
  const [categories, setCategories] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showProfile, setShowProfile] = useState(false); // account exists; standard-profile step before landing anywhere

  useEffect(() => { api.get("/hub/community-categories").then((r) => setCategories(r.data.categories)).catch(() => {}); }, []);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setC = (k) => (e) => setCommunity({ ...community, [k]: e.target.value });

  // Runs once the standard profile step is done (saved or skipped) — this is where the
  // pre-signup "where do they land" logic actually happens, so the founding community entry
  // created below picks up whatever profile info was just saved.
  const afterProfile = async () => {
    if (intent === "admin") {
      setBusy(true);
      try {
        await api.post("/hub/communities", { name: community.name.trim(), category: community.category });
        await refresh(); // picks up the admin role in the community the call above just created
        nav("/setup", { replace: true });
      } catch (ex) { setErr(errMsg(ex)); setBusy(false); setShowProfile(false); }
    } else {
      await refresh(); // picks up whatever was just saved in the standard profile step
      nav("/hub", { replace: true });
    }
  };

  const submit = async (e) => {
    e.preventDefault(); setErr("");
    if (f.password.length < 10 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) return setErr("Password needs 10+ characters with a letter and a number.");
    if (intent === "admin" && community.name.trim().length < 2) return setErr("Give your community a name.");
    setBusy(true);
    try {
      await signup(f);
      setShowProfile(true);
    } catch (ex) { setErr(errMsg(ex)); } finally { setBusy(false); }
  };

  const onSocialSignedIn = (data) => { applySession(data); setShowProfile(true); };

  if (showProfile) return <BuildProfileStep account={account} onDone={afterProfile} />;
  if (!intent) return <IntentPicker onPick={setIntent} />;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <span className="mb-6 text-2xl"><Wordmark name="Pathwai" brand={{}} /></span>
      <button className="mb-3 w-fit text-xs font-medium text-muted underline" onClick={() => setIntent(null)} data-testid="intent-back">← Back</button>
      <h1 className="mb-1 text-2xl font-bold sm:text-3xl">{intent === "admin" ? "Set up your community" : "Create your Pathwai account"}</h1>
      <p className="mb-6 text-sm text-muted">
        {intent === "admin" ? "First your account, then a couple of quick choices for your community — you can change any of it later." : "One login for every community. After this you can browse communities and ask to join the ones that fit you."}
      </p>
      <Card>
        <SocialAuthButtons onSignedIn={onSocialSignedIn} disabled={busy} />
        <div className="my-5 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Full name"><Input data-testid="signup-name" value={f.name} onChange={set("name")} required minLength={2} /></Field>
          <Field label="Email"><Input data-testid="signup-email" type="email" value={f.email} onChange={set("email")} required /></Field>
          <Field label="Password" hint="10+ characters, with a letter and a number"><Input data-testid="signup-password" type="password" value={f.password} onChange={set("password")} required /></Field>
          {intent === "admin" && (
            <div className={cx("space-y-4 rounded-xl border border-dashed border-line p-4")}>
              <p className="label">Your community</p>
              <Field label="Community name"><Input data-testid="signup-community-name" value={community.name} onChange={setC("name")} placeholder="e.g. Riverside Run Club" required minLength={2} maxLength={80} /></Field>
              <Field label="What kind of community is it?">
                <Select data-testid="signup-community-category" value={community.category} onChange={setC("category")} options={categories.map((c) => ({ value: c.key, label: c.label }))} />
              </Field>
            </div>
          )}
          {err && <p className="text-sm text-red-400" data-testid="signup-error">{err}</p>}
          <Button type="submit" loading={busy} className="w-full" data-testid="signup-submit">{intent === "admin" ? "Create account & community" : "Create account"}</Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">Have an account? <Link className="underline" to="/login">Sign in</Link></p>
      </Card>
    </div>
  );
}
