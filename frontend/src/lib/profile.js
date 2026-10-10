// Profile field labels come from the community config so an admin can rename them (Age → "Years", etc).
export const DEFAULT_FIELDS = [
  { key: "age", label: "Age", enabled: true }, { key: "height", label: "Height", enabled: true }, { key: "title", label: "Profession", enabled: true },
  { key: "skill_set", label: "Skills", enabled: true }, { key: "interests_hobbies", label: "Interests", enabled: true },
  { key: "goals", label: "Goals", enabled: true }, { key: "support_needs", label: "Support needed", enabled: true },
];
// Birthdays are what we store; age is worked out from them (the server also refreshes it daily).
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const oldestISO = () => `${new Date().getFullYear() - 120}-01-01`;
export const ageFromBirthday = (b) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(b || ""); if (!m) return null;
  const t = new Date(); let a = t.getFullYear() - +m[1];
  if (t.getMonth() + 1 < +m[2] || (t.getMonth() + 1 === +m[2] && t.getDate() < +m[3])) a -= 1;
  return a >= 0 ? a : null;
};
export const prettyDate = (b) => { const d = new Date(`${b}T12:00:00`); return isNaN(d) ? b : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }); };
export const profileFields = (config) => (config?.profile?.fields?.length ? config.profile.fields : DEFAULT_FIELDS);
export const fieldLabel = (config, key) => profileFields(config).find((f) => f.key === key)?.label || DEFAULT_FIELDS.find((f) => f.key === key)?.label || key;
export const fieldOn = (config, key) => profileFields(config).find((f) => f.key === key)?.enabled !== false;
export const typeLabel = (config, t) => (config?.member_types || {})[t] || { founder: "Member", mentor: "Host", alumni: "Alumni", partner: "Staff", guest: "Guest" }[t] || t;
export const LEVELS = ["Beginner", "Intermediate", "Advanced", "Competitive"];
export const SUGGEST = {
  skill_set: ["Public speaking", "Leadership", "Mentorship", "Networking", "Data analysis", "Marketing", "Sales", "Branding", "Web development", "Project management", "Event production", "Legal advice", "Accounting & bookkeeping", "Photography", "Video production"],
  interests_hobbies: ["Running", "Cooking", "Gaming", "Music", "Photography", "Hiking", "Travel", "Film", "Reading", "Coffee"],
  goals: ["Get promoted", "Change careers", "Start a business", "Grow my business", "Land a new job", "Build my network", "Learn a new skill", "Find a mentor"],
  support_needs: ["Career coaching", "Interview prep", "Business strategy", "Fundraising", "Marketing", "Sales", "Legal advice", "Accounting & bookkeeping", "Web development", "Branding", "Public speaking", "Networking"],
};

// Resize a post photo (keeps aspect ratio, max 1200px wide) so it stays under ~250 KB.
export function resizePhoto(file, maxW = 1200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, maxW / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let q = 0.82, out = c.toDataURL("image/jpeg", q);
      while (out.length > 600000 && q > 0.4) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("We couldn't open that photo. Use a JPG, PNG or WebP (iPhone HEIC files can't be read by every browser).")); };
    img.src = url;
  });
}

// Resize a photo in the browser so profile pictures stay small (≈30 KB) and load fast.
export function resizeImage(file, size = 360) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const c = document.createElement("canvas");
      c.width = c.height = size;
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("We couldn't open that photo. Use a JPG, PNG or WebP (iPhone HEIC files can't be read by every browser).")); };
    img.src = url;
  });
}
