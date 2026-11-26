import posthog from "posthog-js";

const posthogKey = process.env.REACT_APP_POSTHOG_KEY;
const posthogHost = process.env.REACT_APP_POSTHOG_HOST;

export const posthogEnabled = Boolean(posthogKey && posthogHost);

if (posthogEnabled) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    capture_exceptions: true,
    defaults: "2026-08-30",
    logs: {
      serviceName: "pathwai-community-web",
      environment: process.env.NODE_ENV,
    },
  });
} else if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  const missingVariable = posthogKey ? "REACT_APP_POSTHOG_HOST" : "REACT_APP_POSTHOG_KEY";
  throw new Error(`${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`);
}

export const posthogLogger = {
  info(message, attributes) {
    if (posthogEnabled) posthog.logger.info(message, attributes);
  },
};

export default posthog;
