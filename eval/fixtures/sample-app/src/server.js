// A small real Express app with a signup + a checkout flow.
//
// This is the fixture tally instruments for the acceptance test: the taxonomy
// has real events to register (signup_started / signup_completed /
// checkout_started / checkout_completed), the flag has a real call-site
// (new_checkout via OpenFeature), and capture-event has a real shape to validate.
//
// Event names are lower snake_case (the registry casing rule, O1). Capture calls
// keep the event name + props on ONE line so `tally track-plan` discovers the
// typed prop shape. No PII is passed to capture — PII masking is enforced at the
// edge by analytics.js (mask-all-then-allowlist), and identity uses the correct
// $set_once / $set split (identity.js, BTS-3).

import express from "express";
import { initAnalytics } from "./analytics.js";
import { onFirstLoad, onLogin } from "./identity.js";

const app = express();
app.use(express.json());

// A stub PostHog client (the local capture path — no SaaS key needed). In a real
// app this is `posthog-node`; here it appends to the local sink so the acceptance
// test can read events back.
const posthog = {
  init() {},
  identify() {},
  capture() {},
};
initAnalytics(posthog);

// --- signup flow ---
app.get("/", (_req, res) => {
  // First load: anonymous identify + $set_once acquisition (BTS-3).
  onFirstLoad(posthog, "organic");
  posthog.capture("signup_started", { plan: "free" });
  res.send("signup page");
});

app.post("/signup", (req, res) => {
  const userId = req.body?.userId ?? "u_1";
  onLogin(posthog, userId, "free");
  posthog.capture("signup_completed", { plan: "free" });
  res.json({ ok: true });
});

// --- checkout flow (the flag call-site lives here) ---
app.get("/checkout", (_req, res) => {
  posthog.capture("checkout_started", { plan: "pro", amount: 49 });
  res.send("checkout page");
});

app.post("/checkout", (req, res) => {
  const userId = req.body?.userId ?? "u_1";
  onLogin(posthog, userId, "pro");
  posthog.capture("checkout_completed", { plan: "pro", amount: 49 });
  res.json({ ok: true });
});

const port = Number(process.env.PORT ?? 3000);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => console.log(`sample-app on :${port}`));
}

export { app, posthog };
