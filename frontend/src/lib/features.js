// Build-time feature flags, so a feature can be turned on for a deploy without touching code.
// Set the matching REACT_APP_* env var to "true" to enable.
export const AI_CHAT_ENABLED = process.env.REACT_APP_AI_CHAT_ENABLED === "true";
