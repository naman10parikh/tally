---
title: "Field Intel — PII-in-Analytics Leaks (the data you didn't mean to capture)"
type: source
created: "2026-06-16"
updated: "2026-06-16"
tags: [pii, privacy, gdpr, session-replay, autocapture, posthog, amplitude, field-intelligence, tally]
domain: product-analytics-feature-flags
researcher: FIELD-INTELLIGENCE (CP123 Wave-R)
summary: "Where personal data hides in analytics pipelines, the defaults that leak it, and the maintainer-stated controls — with verbatim warnings."
sources: ["raw/field-02-pii-in-analytics-leaks.md"]
related: ["[[field-01-event-taxonomy-disasters]]", "[[field-05-when-autocapture-hurts]]"]
---

# PII-in-Analytics Leaks — What Practitioners Learned the Hard Way

> Scope: how personally-identifiable info (and PHI) leaks INTO analytics tools as a side effect
> of default capture, then becomes a compliance + retroactive-deletion nightmare.
> **Currency bar:** prefer < 6 months; flagged if older. The most concrete sources here are the
> PostHog (2026) and Amplitude privacy docs — vendor-authored but operationally specific.

---

## 1. The four hiding places for PII (concrete, from the maintainers)

PostHog's own data-collection docs enumerate what they capture **by default** that can be PII:

1. **Autocapture form/input metadata** — "Pageviews, pageleaves, clicks, changes of inputs, and form submissions." By default it captures the `name`, `id`, and `class` attributes from `<input>` tags. A field named `id="ssn"` or `name="email"` leaks the *field identity* even when the value is masked.
2. **Session-replay DOM snapshots** — "Clicks, mouse movements, scrolling, and snapshots of the DOM." The replay captures the **complete DOM structure including form values unless explicitly masked.** This is the single highest-risk surface.
3. **URLs (incl. query strings)** — "Full URLs captured in pageview events by default." A `?email=a@b.com&token=...` in the URL lands in `$current_url` on every pageview.
4. **Person properties via `identify()`** — "Information you pass to `posthog.identify()` will be sent to PostHog servers." Whatever you stuff into the user profile (email, phone, plan, internal IDs) is now stored.
   - Source: PostHog — *Controlling data collection* — © 2026 — <https://posthog.com/docs/privacy/data-collection> (read 2026-06-16)

**IP address default split (a real GDPR gotcha):** PostHog captures client IP by default at project level, BUT "EU organizations: Automatically default to IP data capture disabled for GDPR compliance." → behavior **differs by org region**, so a US-seated org silently captures IP while an EU one doesn't. Same source, 2026.

---

## 2. The defaults that leak (verbatim maintainer warnings)

- **The "best effort is not enough" admission (quote this):** *"PostHog will make a best effort to not capture sensitive information by default. This is not always sufficient, so you can disable autocapture for specific elements."*
- **The consent landmine on `identify()`:** *"Do not send data that could be used to identify users (e.g. setting an email address as a person property if they have not given consent)."*
- **iOS best-effort PII detection is NOT a guarantee:** the iOS SDK "will attempt automatic PII detection for password, credit card, OTP, and any other fields related to Personally Identifiable Information" — but this is explicitly **best-effort only**. Custom-styled fields slip through.
  - All: PostHog data-collection docs, 2026.

> TASTE for tally: the maintainer's own framing is "private by default, selectively unmask." The
> *opposite* of how most teams configure it (capture-everything, redact-later). tally's harness
> default MUST be mask-all-then-allowlist, not allow-all-then-denylist — because denylists are
> a never-ending game of whack-a-mole and the leaked data is already stored before you patch.

---

## 3. The "private-by-default" recipe (the strong-opinion config)

PostHog's recommended safe-start, verbatim: *"If you have data that should never be captured, a safe way to start with PostHog is to mask all inputs and text, only selectively unmasking elements that you need to capture."*

Concrete session-replay config (from the docs):
```js
{
  maskAllInputs: true,
  maskTextSelector: "*",            // mask ALL text, then unmask by data-attr
  maskTextFn: (text, element) =>
    element?.dataset['capture'] === 'true'
      ? text
      : '*'.repeat(text.trim().length)
}
```
And the JS-only `before_send` hook to strip URL PII at the edge:
```js
before_send: function(event) {
  if (event.properties['$current_url']) event.properties['$current_url'] = null;
  return event;
}
```
- Source: PostHog data-collection docs, 2026.

**Element-level opt-out across platforms (gotcha: it's three different mechanisms):**
- Web: add CSS class `ph-no-capture`
- iOS: set `accessibilityLabel`/`accessibilityIdentifier` to `ph-no-capture`
- React Native: add a `ph-no-capture` prop
→ A team that only knows the web class will leak on mobile. (Same multi-platform-divergence pattern as Segment device-mode in field-01 §4.)

---

## 4. Amplitude's stance — same shape, different knobs

Amplitude ships session replay with a privacy framing too: their docs let you "specify user data types shown during replay with privacy settings flexible enough to meet legal and security requirements," and they describe a **block/mask/unmask** model for elements.
- Source: Amplitude — *Building a Privacy-first Session Replay* — <https://amplitude.com/blog/session-replay-privacy>; *Manage privacy settings for Session Replay* — <https://amplitude.com/docs/session-replay/manage-privacy-settings-for-session-replay> (read 2026-06-16)

**Cross-vendor taste:** every major replay tool (PostHog, Amplitude, plus FullStory/LogRocket per the Lokker comparison) has converged on mask-by-default for inputs but **NOT for free text** — i.e., a `<div>` showing the user's name or a chat message is captured unless you mask text too. The Lokker 2026 comparison frames this as the central differentiator between "GDPR-compliant" and "compliant-if-you-configure-it."
- Source: Lokker — *GDPR-Compliant Session Replay Tools with PII Masking: Full Comparison 2026* — <https://lokker.com/compare/session-replay-tools> (read 2026-06-16)

---

## 5. Why this is uniquely unfixable (the retroactive-deletion trap)

- Once PII is in the event store / replay store, you cannot un-ring the bell: you must run a **deletion job** (PostHog/Amplitude both have person-deletion APIs), but anything already exported downstream (warehouse, BI, a partner's Segment destination) is gone from your control.
- This is the **same retroactive-loss property** as the `$set`/`$set_once` and identity-stitching bugs in field-01 §2: instrumentation-time mistakes that no review step can repair. PII-leak and identity-fracture are the two "you can't fix it later" classes.

> TASTE for tally: treat PII like a one-way door. The harness should fail-closed: if an event's
> property key matches a PII pattern (`email`, `phone`, `ssn`, `card`, `password`, `token`, `dob`)
> and isn't on an explicit allowlist, DROP it at the SDK/edge — before it's stored — and log a
> warning. Detect-at-review is too late by definition.

---

## 6. Cross-reference to internal corpus

- `energy/audit/HARNESS-CHECKLIST-2026.md` line 176 separates **product analytics (PostHog/tally)** from **LLM observability (Langfuse)** which emits `gen_ai.usage.*` OpenTelemetry spans. PII rule applies to BOTH planes but they're distinct: do not pipe LLM traces into PostHog. (Read-only ref.)
- `energy/scripts/x-content-intel/fetch-bookmarks.py` already follows the agent-operator credential pattern (reuse `~/.claude/x-auth/x-session.json`, never re-login) and **disk-first capture** — the same discipline that, applied to analytics, means raw event batches hit disk where a PII-scrub pass can run *before* upload. (Read-only ref.)
