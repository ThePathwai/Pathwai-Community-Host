import React from "react";
import { SUGGEST, ageFromBirthday, oldestISO, todayISO } from "../lib/profile";
import { AvatarUpload, Field, Input, PhotoGallery, TagInput, Textarea } from "./ui";
import StartupFields, { BLANK_STARTUP, startupToApi, startupToForm } from "./StartupFields";

// The standard profile saved once on the account (not per community -- see BuildProfileStep in Signup.jsx). One form, used by the
// "Your profile" page (/me) and by the Hub's quick editor, so the two can never drift apart. Saved with PATCH /hub/profile.

export function AccountProfileForm({ f, setF, photo, setPhoto }) {
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setContact = (k) => (e) => setF({ ...f, contact: { ...f.contact, [k]: e.target.value } });
  return (
    <div className="space-y-4">
      <AvatarUpload photo={photo} onChange={setPhoto} name={f.name} testId="account-profile-photo-upload" />
      <Field label="Name"><Input data-testid="account-profile-name" value={f.name} onChange={set("name")} required minLength={2} maxLength={120} /></Field>
      <Field label="Birthday"><Input data-testid="account-profile-birthday" type="date" min={oldestISO()} max={todayISO()} value={f.birthday} onChange={set("birthday")} /></Field>
      <p className="-mt-2 text-xs text-muted">{ageFromBirthday(f.birthday) !== null ? `You're ${ageFromBirthday(f.birthday)}. ` : ""}Your age is worked out from this and updates on its own. Other members see your age, never your birthday.</p>
      <Field label="What do you do?"><Input value={f.title} onChange={set("title")} placeholder="e.g. Physiotherapist, teacher, chef" maxLength={120} /></Field>
      <Field label="Employer or school"><Input value={f.company} onChange={set("company")} maxLength={120} /></Field>
      <Field label="Neighbourhood or city"><Input value={f.location} onChange={set("location")} maxLength={120} /></Field>
      <Field label="About you"><Textarea rows={3} value={f.bio} onChange={set("bio")} maxLength={1000} /></Field>
      <StartupFields value={f.startup} onChange={(v) => setF({ ...f, startup: v })} testPrefix="account-startup" />
      <PhotoGallery value={f.photos} onChange={(v) => setF({ ...f, photos: v })} />
      <Field label="Skills"><TagInput value={f.skill_set} suggestions={SUGGEST.skill_set} onChange={(v) => setF({ ...f, skill_set: v })} /></Field>
      <Field label="Interests"><TagInput value={f.interests_hobbies} suggestions={SUGGEST.interests_hobbies} onChange={(v) => setF({ ...f, interests_hobbies: v })} /></Field>
      <Field label="Goals"><TagInput value={f.goals} suggestions={SUGGEST.goals} onChange={(v) => setF({ ...f, goals: v })} /></Field>
      <Field label="Support needed"><TagInput value={f.support_needs} suggestions={SUGGEST.support_needs} onChange={(v) => setF({ ...f, support_needs: v })} /></Field>
      <div>
        <p className="label">Contact info <span className="font-normal normal-case text-muted">(optional — shown to members you're connected with)</span></p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Input placeholder="Phone" value={f.contact.phone} onChange={setContact("phone")} />
          <Input type="url" placeholder="LinkedIn" value={f.contact.linkedin} onChange={setContact("linkedin")} />
          <Input placeholder="Instagram (@you)" value={f.contact.instagram} onChange={setContact("instagram")} />
          <Input type="url" placeholder="Website" value={f.contact.website} onChange={setContact("website")} />
        </div>
      </div>
    </div>
  );
}

export const BLANK_PROFILE = { name: "", birthday: "", title: "", company: "", location: "", bio: "", skill_set: [], interests_hobbies: [], goals: [], support_needs: [],
  photos: [], startup: null, contact: { phone: "", linkedin: "", instagram: "", website: "" } };

// The form's starting values, from the signed-in account. `addStartup` opens the startup section ready to fill in.
export const formFromAccount = (account, addStartup) => ({
  name: account.name || "", birthday: account.birthday || "", title: account.title || "", company: account.company || "", location: account.location || "", bio: account.bio || "",
  skill_set: account.skill_set || [], interests_hobbies: account.interests_hobbies || [], goals: account.goals || [], support_needs: account.support_needs || [],
  photos: account.photos || [], startup: startupToForm(account.startup) || (addStartup === true ? { ...BLANK_STARTUP } : null),
  contact: { phone: "", linkedin: "", instagram: "", website: "", ...(account.contact || {}) },
});

// Returns an error message to show, or "" when the form is fine to save.
export function profileProblem(pf) {
  if (pf.name.trim().length < 2) return "Enter your name.";
  const yrs = ageFromBirthday(pf.birthday);
  if (pf.birthday && (yrs === null || yrs > 120)) return "Check the year of your birthday.";
  if (pf.birthday && yrs < 13) return "You need to be at least 13 to use Pathwai.";
  return "";
}
export const profileBody = (pf, photo) => ({ ...pf, startup: startupToApi(pf.startup), avatar_url: photo || null });
