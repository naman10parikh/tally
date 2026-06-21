// tally-instrumented analytics config for the sample app.
//
// This file is what `tally audit-pii` scans — it MUST pass tally's own audit
// with ZERO critical findings (the acceptance test, PLAN §5 step 6: "tally's own
// capture passes tally's own audit"). So it follows tally's O4/BTS-2/P8 doctrine:
// mask-all-then-allowlist across web/iOS/RN + a before_send URL-scrub.

// --- Session replay: mask-all-then-allowlist (never allow-all-then-denylist) ---
// maskAllInputs:true + maskTextSelector:"*" — free text is NOT masked by default,
// so both are required (BTS-2). Unmask only by explicit data-attribute.
export const replayConfig = {
  maskAllInputs: true,
  maskTextSelector: "*",
  maskTextFn: (text, element) =>
    element?.dataset?.capture === "true" ? text : "*".repeat(text.trim().length),
  // session_recording marker — the web-platform opt-out surface.
  session_recording: { maskAllInputs: true },
};

// --- before_send URL-scrub: null $current_url query (strips ?email=&token=) ---
// P8 surface 3: full URLs incl. query strings land in $current_url by default.
export function before_send(event) {
  if (event?.properties?.$current_url) {
    try {
      const u = new URL(event.properties.$current_url);
      event.properties.$current_url = `${u.origin}${u.pathname}`;
    } catch {
      // leave as-is if unparseable
    }
  }
  return event;
}

// --- Three-platform opt-out (web / iOS / RN), not just the web class (BTS-2) ---
// Web uses the `ph-no-capture` class on PII-bearing nodes:
export const WEB_NO_CAPTURE_CLASS = "ph-no-capture";
// iOS opt-out is the accessibilityIdentifier on PII fields:
export const IOS_OPT_OUT = { accessibilityIdentifier: "ph-no-capture" };
// React Native opt-out masks all text inputs (maskAllTextInputs) on native:
export const RN_CONFIG = { maskAllTextInputs: true, platform: "react-native" };

// --- PostHog client init (project/public key for capture — never the personal
// key; P4). Capture is unmetered; reads bite. ---
export function initAnalytics(posthog) {
  posthog.init(process.env.POSTHOG_PROJECT_API_KEY ?? "phc_local_stub", {
    api_host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
    session_recording: replayConfig.session_recording,
    before_send,
    // autocapture OFF for the core funnel — load-bearing metrics are named,
    // registered events, not DOM-coupled autocapture (O12/O12b/BTS-13).
    autocapture: false,
  });
}
