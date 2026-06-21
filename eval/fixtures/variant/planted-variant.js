// PLANTED case-variant (BTS-1 / O1) — used ONLY by
// eval/assert-ci-check-fails-on-variant.mjs.
//
// `Checkout Started` is a capitalized/spaced variant of the canonical
// `checkout_started` already in the registry. Casing is a semantic boundary:
// PostHog/Amplitude treat these as two irreconcilable streams. The registry CI
// check MUST FAIL the build when it discovers this next to the canonical event —
// that failing check is the artifact (discussing naming hygiene ≠ pass, BTS-1).
//
// This is intentionally a NON-canonical event call so `track-plan`'s generated
// ci-check-events.mjs flags it as a case-variant. Do not "fix" it.

export function brokenCheckout(posthog) {
  // capital + space → canonicalizes to checkout_started, but the EXACT spelling
  // is unregistered → a case-variant violation.
  posthog.capture("Checkout Started", { plan: "pro" });
}
