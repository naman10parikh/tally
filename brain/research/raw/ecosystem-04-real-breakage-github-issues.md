---
title: "Ecosystem — Real-world breakage: high-engagement GitHub issues & version-specific gotchas"
type: source
created: "2026-06-16"
updated: "2026-06-16"
tags: [github-issues, breakage, posthog, flagd, openfeature, session-replay, local-evaluation, gotchas, tally]
domain: product-analytics-feature-flags
researcher: ECOSYSTEM (CP123 Wave-R)
summary: "The bugs that reveal how these tools actually break in production — local-eval flag inconsistency, replay drops, CSP violations, OpenFeature spec gaps — pulled from closed/open GitHub issues with engagement."
related: ["[[ecosystem-02-agent-operator-clis-apis-mcps]]", "[[ecosystem-01-versions-and-changelog-deltas]]"]
---

# Real-World Breakage — GitHub issues that reveal the sharp edges

> Listicles describe features; issues describe what breaks. All issue numbers verified via
> `gh api repos/<owner>/<repo>/issues/<n>` on 2026-06-16. These are the failure modes tally
> must defend against.

---

## 1. PostHog feature flags — the local-evaluation correctness class (the dangerous one)

### 1a. `distinct_id` inconsistent between local-eval and DB-eval — `PostHog/posthog#57183`
- **State:** closed 2026-06-08 (opened 2026-04-30). The bug existed in production for ~5 weeks.
- **The breakage (verbatim from issue body):** "Feature flag conditions targeting `distinct_id` behave inconsistently depending on evaluation path. — DB-backed evaluation: `distinct_id` is available as a person property. Local evaluation path: `distinct_id` may be missing. **This leads to flags evaluating differently for the same user depending on whether the system uses local or DB-backed evaluation.**"
- **Root cause (verbatim):** "Rust implementation only guaranteed `distinct_id` after DB-backed person p[roperties]…"
  - <https://github.com/PostHog/posthog/issues/57183>
- **⚠️ Why this is the scariest class for an agent:** an autonomous flag-flipper that relies on `distinct_id` targeting could roll a feature to the WRONG users — and the discrepancy is invisible unless you compare both eval paths. **tally rule:** when an agent targets `distinct_id`, prefer DB-backed eval for correctness, OR pin person properties explicitly (see 1b). Never assume local-eval has the same inputs as server-eval.

### 1b. Person/group properties NOT passed in local eval — `PostHog/posthog#28453`
- **State:** closed 2025-07-10. **The breakage (verbatim):** "When using local evaluation AND `sendFeatureFlags` in Node SDK, the flag values will be attached to events for any `capture` call, but **there is no way to pass person or group properties to all methods that produce these flag values** in order to get accurate evaluations."
  - <https://github.com/PostHog/posthog/issues/28453>
- **→ tally rule:** local evaluation is a *latency* optimization that trades *correctness* — it only sees the properties you hand it, not the server's full person profile. For property-based targeting, pass ALL relevant person/group props into the local-eval call or accept it will be wrong. This is the single most common PostHog flag footgun.

### 1c. Distributed cache for local eval — `PostHog/posthog#37584`
- **State:** closed 2026-03-10. Signals that **local-eval cache coherence across instances** was a real scaling pain (multiple app instances each holding their own flag-definition cache → skew). Relevant to any multi-pane/swarm deployment.
  - <https://github.com/PostHog/posthog/issues/37584>

### 1d. Client-side 401s — `PostHog/posthog#20337`
- **State:** closed 2026-03-11. Flag/decide endpoint returning 401 on the client — a reminder that the *public* (project) key vs *personal* key distinction (ecosystem-02 §6) is a frequent source of auth confusion.
  - <https://github.com/PostHog/posthog/issues/20337>

---

## 2. PostHog session replay — the "it silently stops recording" class

### 2a. CSP violation blocks replay media even when whitelisted — `PostHog/posthog#46227`
- **State:** closed 2026-02-06. "Media not showing correctly cuz CSP Violated even [though] posthog has added to whitelist CSP." → Content-Security-Policy interactions break replay asset capture even with PostHog allowlisted. A real deploy-time gotcha for any app with a strict CSP.
  - <https://github.com/PostHog/posthog/issues/46227>

### 2b. Safari intermittently not recording changes — `PostHog/posthog#27831`
- **State:** closed 2025-02-21. Browser-specific replay flakiness (Safari) — replay is not uniformly reliable across browsers. **→ tally rule:** never treat "replay is on" as "replay captured everything"; sample-verify per browser.
  - <https://github.com/PostHog/posthog/issues/27831>

### 2c. Recording button missing when event doesn't match trigger — `PostHog/posthog#55562`
- **State:** closed 2026-04-21. UI/linkage bug between trigger-based recording and the activity view. Confirms the June-2026 changelog fix (ecosystem-01 §1: "replay survives identify/reset; linked flags start/pause recording without restart") was fixing a *real, multi-issue* problem area.
  - <https://github.com/PostHog/posthog/issues/55562>

---

## 3. OpenFeature spec — the OPEN gaps that matter for experimentation

> These are OPEN as of 2026-06-16 → tally should NOT assume them.

### 3a. Official evaluation-metrics hook for experimentation — `open-feature/spec#371`
- **State:** OPEN (2026-05-23), tagged `enhancement`. The spec does NOT yet standardize an experimentation/metrics hook. → If you want OpenFeature to also emit experiment-exposure events in a portable way, that's still vendor-specific today.
  - <https://github.com/open-feature/spec/issues/371>

### 3b. Isolated API instances across SDKs — `open-feature/spec#374`
- **State:** OPEN (2026-06-15). OpenFeature today uses a global singleton API in most SDKs; isolated instances (needed for multi-tenant / multi-provider-per-context, and for a swarm where each agent wants its own provider) are NOT yet specced. **→ relevant to recursive-grid/swarm deployments** — multiple agents sharing one process can't cleanly isolate flag providers yet.
  - <https://github.com/open-feature/spec/issues/374>

### 3c. Subscribe to variable updates — `open-feature/spec#346`
- **State:** OPEN (2025-11-05). Reactive flag-change subscription is not yet standard across the spec.
  - <https://github.com/open-feature/spec/issues/346>

### Taste
OpenFeature is the right abstraction (ecosystem-02 §3-4) but it's still maturing on exactly the seams an experimentation agent cares about (metrics hooks, isolated instances, reactive updates). Use it for *evaluation portability* today; don't expect it to carry experiment telemetry or per-agent isolation yet.

---

## 4. flagd — small, healthy, but worth knowing

### 4a. Inconsistent error codes for edge cases — `open-feature/flagd#1679`
- **State:** closed 2026-06-09. Error-code normalization across sync/eval/OFREP services was still being tightened in mid-2026 (`#1814`, closed 2025-11-05). For an agent that branches on error codes, pin the flagd version and test the codes.
  - <https://github.com/open-feature/flagd/issues/1679>

---

## 5. The canonical feature-flag DISASTER (the one every flag system is haunted by)

### Knight Capital — $460M in 45 minutes from a reused stale flag bit (2012)
- "On August 1, 2012, Knight Capital Group deployed code that **reactivated an old feature flag controlling an obsolete trading algorithm** ('Power Peg'). In 45 minutes, the firm lost **$460 million**." They had deprecated Power Peg and switched users away — **but never removed the underlying code** — then **reused the flag bit for a new feature**. One server still ran the old code path. 397M shares traded incorrectly; the company was acquired.
  - <https://flagshark.com/learn/what-is-feature-flag-debt/> · 2026 (recounting the 2012 event)
  - <https://www.infoq.com/articles/feature-flags-gone-wrong/> · "When Feature Flags Go Wrong"
- **The two durable lessons (taste):**
  1. **A flag is not removed until its CODE PATH is removed.** Toggling off ≠ deleting. tally must track flag *and* dead-code lifecycle together (cf. GrowthBook's 2026 custom-JS validation hooks that can *block* risky flag states — ecosystem-01 §4).
  2. **Never reuse a flag key/bit.** Retired keys must be tombstoned, never recycled.
- **Stale-flag debt mechanism (verbatim):** "When stale flags pile up, merges get harder — more forks in the control flow, more conflicts… **High stale-flag counts and falling deployment frequency tend to travel together.**"
  - <https://flagshark.com/learn/cost-of-stale-flags/> · 2026
- **→ tally rule:** ship a "flag hygiene" skill — flag age, last-evaluation date, owner, and a `feature-flags-status-retrieve` (ecosystem-02) sweep to surface stale flags for removal. This is the flag-side analogue of the event-taxonomy-rot defense in field-01.

---

## 6. Summary: the failure-mode taxonomy tally must defend against

| Class | Concrete instance | Defense |
|---|---|---|
| Local-eval ≠ server-eval correctness | PostHog #57183, #28453 | Pass full props to local eval, or use DB-eval for targeting |
| Cache coherence across instances | PostHog #37584 | Distributed/shared flag-def cache for swarms |
| Replay silently stops | PostHog #46227 (CSP), #27831 (Safari) | Per-browser sample-verify; CSP test |
| Auth key confusion (public vs personal) | PostHog #20337 | Codify which key for capture vs read (ecosystem-02 §6) |
| Spec gaps (metrics/isolation/reactive) | OpenFeature #371, #374, #346 | Don't rely on these yet; vendor-specific fallback |
| Stale-flag / reused-bit catastrophe | Knight Capital | Flag+deadcode lifecycle tracking; never recycle keys |
| Event-schema rot | (see field-01) | Naming/type/identity governance |
