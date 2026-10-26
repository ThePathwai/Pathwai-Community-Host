// How many text segments a message takes (what texting costs, 1 credit per segment per person). Mirrors
// backend/messaging.py: plain text is 160 characters, then 153 per segment; an emoji or other non-GSM
// character drops that to 70, then 67 (counted in UTF-16 units, so an emoji is two).
const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€";
const GSM_SET = new Set(GSM.split(""));
const GSM_EXT = new Set("^{}\\[~]|€".split(""));
export function segments(text) {
  const t = text || "";
  if (!t) return 0;
  const chars = Array.from(t);
  if (chars.every((c) => GSM_SET.has(c))) {
    const n = chars.reduce((k, c) => k + (GSM_EXT.has(c) ? 2 : 1), 0);
    return n <= 160 ? 1 : Math.ceil(n / 153);
  }
  const n = t.length; // UTF-16 units: an emoji is two
  return n <= 70 ? 1 : Math.ceil(n / 67);
}

// The text as it is sent: who it is from, the message, and the opt-out line (unless already written).
export function smsBody(communityName, message) {
  const m = (message || "").trim();
  return `${communityName || "Your community"}: ${m}` + (m.toLowerCase().includes("stop") ? "" : " Reply STOP to opt out.");
}
