---
title: "tally — Known Pitfalls (the gotcha list, version-specific)"
type: synthesis
created: "2026-06-16"
updated: "2026-06-16"
tags: [pitfalls, gotchas, version-specific, posthog, openfeature, flagd, ga4, segment, tally]
domain: product-analytics-feature-flags
sources:
  - "raw/ecosystem-01-versions-and-changelog-deltas.md"
  - "raw/ecosystem-02-agent-operator-clis-apis-mcps.md"
  - "raw/ecosystem-03-experimentation-stats-privacy-ga4-funnels.md"
  - "raw/ecosystem-04-real-breakage-github-issues.md"
  - "raw/field-01-event-taxonomy-disasters.md"
  - "raw/field-02-pii-in-analytics-leaks.md"
  - "raw/field-03-flag-debt-and-dead-code.md"
  - "raw/field-06-migration-war-stories.md"
related: ["[[BATTLE-TESTED-SCENARIOS]]", "[[EXPERTISE-MAP]]", "[[TOOL-MATRIX]]", "[[GAPS-AND-DISPUTES]]"]
summary: "The version-specific gotcha list — each pitfall with how to DETECT it and how to AVOID it. The negative knowledge an agent needs to not break production."
---

# tally — Known Pitfalls

> Every entry: **What breaks → How to detect → How to avoid → Version/source.** This is the
> negative-knowledge layer: the traps that "the docs say it works but it doesn't," the silent
> failures, and the version-specific landmines. Currency bar: most are 2026; historical-but-load-
> bearing ones are flagged. Severity: 🔴 irreversible/correctness · 🟠 silent · 🟡 operational.

---

## A. PostHog feature-flag evaluation correctness (the dangerous class)

### P1 🔴 `distinct_id` evaluates inconsistently: local-eval vs DB-eval
- **Breaks:** flag conditions targeting `distinct_id` "behave inconsistently depending on evaluation
  path" — DB-eval has `distinct_id` as a person property; local-eval "may be missing" it → the same
  user gets different flag values. An autonomous flag-flipper rolls a feature to the **wrong** users,
  invisibly.
- **Detect:** compare a flag's evaluation for the same user via local-eval and DB-eval; if they differ,
  you have it. There is no error — only the discrepancy.
- **Avoid:** for `distinct_id`/property targeting prefer **DB-backed eval**, or pin person properties
  explicitly into the local-eval call. Never assume local-eval has the server's inputs.
- **Version/source:** PostHog #57183 (opened 2026-04-30, closed 2026-06-08 — **in prod ~5 weeks**);
  root cause: "Rust implementation only guaranteed `distinct_id` after DB-backed person properties."
  [ecosystem-04 §1a]

### P2 🔴 Person/group properties can't be passed to all local-eval methods
- **Breaks:** with local eval + `sendFeatureFlags` (Node SDK), "there is no way to pass person or group
  properties to all methods that produce these flag values" → property-based targeting is wrong. **The
  single most common PostHog flag footgun.**
- **Detect:** property-targeted flags returning unexpected values under local eval despite correct
  server-side definitions.
- **Avoid:** pass ALL relevant person/group props into the local-eval call, or accept it will be wrong
  and use DB-eval. Local eval is a *latency* optimization that trades *correctness.*
- **Version/source:** PostHog #28453 (closed 2025-07-10). [ecosystem-04 §1b]

### P3 🟠 Local-eval cache incoherence across instances (swarm skew)
- **Breaks:** multiple app instances each hold their own flag-definition cache → flags evaluate
  differently across instances. Bites multi-pane / recursive-grid / swarm deployments.
- **Detect:** same flag, same user, different result depending on which instance served the request.
- **Avoid:** use a distributed/shared flag-definition cache for swarms; pin flagd version if using it.
- **Version/source:** PostHog #37584 (closed 2026-03-10). [ecosystem-04 §1c]

### P4 🟡 Public (project) key vs personal API key confusion → 401s + rate limits
- **Breaks:** using the wrong key class. Capture/flag-decide uses the **project (public)** key;
  reads/flag-management use a **personal** key. Mixing them → client 401s on decide, or unexpected
  rate-limiting on capture.
- **Detect:** 401 on the flag/decide endpoint client-side; or capture calls getting rate-limited
  (capture should be effectively unmetered).
- **Avoid:** codify which key is for what — project key for capture/decide, personal key for
  reads/management. "A rule of thumb for whether rate limits apply is if the personal API key is used."
- **Version/source:** PostHog #20337 (closed 2026-03-11); rate-limits doc 2026. [ecosystem-04 §1d, ecosystem-02 §6]

---

## B. PostHog session replay (the "it silently stops / leaks" class)

### P5 🟠 Replay drops on identity transition (login) — historically
- **Breaks:** session replay dropping when a user logs in (`identify()`/`reset()`), losing the
  post-login session. This was a real, recurring breakage.
- **Detect:** replays that end exactly at the login moment; missing logged-in sessions.
- **Avoid:** upgrade to the **June 2026** posthog-js line where "replay survives `identify()` and
  `reset()`," preserves project config + survey defs, and re-evaluates as flags load; "linked flags
  start/pause recording without an app restart." Pin a version that includes this fix.
- **Version/source:** PostHog changelog June 2026; corroborated by issues #55562 (closed 2026-04-21).
  [ecosystem-01 §1, ecosystem-04 §2c]

### P6 🟠 CSP violation blocks replay media even when PostHog is allowlisted
- **Breaks:** "Media not showing correctly cuz CSP Violated even [though] posthog has added to
  whitelist CSP" — Content-Security-Policy interactions break replay asset capture despite allowlisting.
- **Detect:** CSP violation reports referencing replay asset URLs; blank/broken media in replays on a
  strict-CSP app.
- **Avoid:** explicitly test replay under your production CSP; allowlist the specific asset/media
  origins PostHog uses, not just the API origin.
- **Version/source:** PostHog #46227 (closed 2026-02-06). [ecosystem-04 §2a]

### P7 🟠 Replay is not uniformly reliable across browsers (Safari)
- **Breaks:** Safari "intermittently not recording changes" — browser-specific replay flakiness.
- **Detect:** lower replay capture rates / missing interactions on Safari vs Chrome.
- **Avoid:** "never treat 'replay is on' as 'replay captured everything'; sample-verify per browser."
- **Version/source:** PostHog #27831 (closed 2025-02-21). [ecosystem-04 §2b]

---

## C. PII leak surfaces (irreversible — see [[BATTLE-TESTED-SCENARIOS]] BTS-2)

### P8 🔴 The four default PII hiding places (autocapture meta / replay DOM / URLs / `identify()`)
- **Breaks:** PostHog by default captures `<input>` `name`/`id`/`class` (field identity leaks even when
  value masked), full DOM in replay (form values unless masked), full URLs incl. query strings into
  `$current_url`, and whatever you pass to `identify()`. Free text is NOT masked by default. Once
  stored/exported, it's a one-way door.
- **Detect:** grep replays/events for property keys/URLs matching PII patterns (`email`, `phone`,
  `ssn`, `card`, `password`, `token`, `dob`); inspect a replay of a form page.
- **Avoid:** **mask-all-then-allowlist** (`maskAllInputs: true`, `maskTextSelector: "*"`),
  `before_send` to null `$current_url`, opt-out on all 3 platforms (web class / iOS accessibility id /
  RN prop). Fail-closed at the SDK/edge **before** storage. Note: EU orgs default IP-capture OFF; US
  orgs default it ON — region-dependent.
- **Version/source:** PostHog data-collection docs © 2026; iOS "best-effort" PII detection is "not
  always sufficient." [field-02 §1/§3/§4]

---

## D. Agent-operator surface traps (the "docs say it works but it doesn't" class)

### P9 🟡 Cloning the archived PostHog MCP repo (dead-repo loop)
- **Breaks:** an agent following a pre-2026 blog/README `git clone`s `PostHog/mcp` — **archived
  2026-01-19** (148★, read-only) — and wastes a loop. "The MCP server has been moved into the PostHog
  Monorepo."
- **Detect:** `gh api repos/PostHog/mcp` → `"archived": true`; or the repo's archive notice.
- **Avoid:** use the **hosted endpoint** `https://mcp.posthog.com/mcp` (HTTP) or the monorepo path
  `PostHog/posthog/tree/master/services/mcp`. Install:
  `claude mcp add --transport http posthog https://mcp.posthog.com/mcp -s user`.
- **Version/source:** verified `gh api` 2026-06-16; archived 2026-01-19. [ecosystem-02 §1a] · Also
  dead: `PostHog/posthog-js-lite` (archived) → use mainline `posthog-js`. [ecosystem-05 §2]

### P10 🟡 Building an autonomous flow on `wizard --ci` (headless wall)
- **Breaks:** "CI mode is currently disabled in published builds. PostHog's LLM gateway doesn't yet
  grant the scopes the wizard needs to personal API keys for most users, so non-interactive `--ci`
  runs fail at the gateway." An autonomous flow built on `wizard --ci` fails today.
- **Detect:** `npx @posthog/wizard --ci …` failing at the gateway with a scope error.
- **Avoid:** run the **interactive** wizard once (human-in-loop) OR instrument via SDK + MCP
  (`create-feature-flag`, `insight-create`) directly. Don't design tally's loop around `wizard --ci`.
- **Version/source:** `PostHog/wizard` README, read 2026-06-16. [ecosystem-02 §2]

### P11 🟠 Looping raw HogQL → 120/hour stall
- **Breaks:** an autonomous loop calling `execute-sql` (raw HogQL) exhausts the **120/hour** HogQL
  limit and stalls. (General analytics endpoints = 240/min, 1,200/hr; `/query` = 2,400/hr; HogQL is
  the harsh one.)
- **Detect:** 429s on the HogQL endpoint; loop dies after ~120 reads in an hour.
- **Avoid:** **materialize** the recurring query via "Endpoints GA" → poll the materialized endpoint
  (12,000/hr sustained, 10 concurrent). Prefer typed `query-funnel`/`query-retention`/`query-trends`
  over `execute-sql`. Capture (ingest) is unmetered — only reads bite.
- **Version/source:** PostHog rate-limits docs 2026; open tuning PR `PostHog/posthog#28184` (re-check —
  limits are actively changing). [ecosystem-02 §6]

### P12 🟡 LLM hallucinates columns in hand-written HogQL
- **Breaks:** an LLM writing raw SQL invents non-existent columns/properties (worsened by the
  property-mutation/naming-drift class — the schema it assumes may not be the schema that exists).
- **Detect:** query errors on unknown columns; or worse, silently-wrong results from a column that
  exists but means something else.
- **Avoid:** prefer **typed query tools** (`query-funnel`, `query-retention`, `query-trends`,
  `query-paths`, `query-stickiness`) which constrain the surface; use `execute-sql` only as a
  deliberate escape hatch and validate columns against the actual schema/registry first.
- **Version/source:** [ecosystem-02 §1b], cross-ref field-01 §1b.

---

## E. Experimentation statistics (correctness — full treatment in [[EXPERTISE-MAP]] J5)

### P13 🔴 Peeking on a fixed-horizon frequentist test
- **Breaks:** checking a running fixed-horizon test and stopping on first significance inflates
  false-positives to 20–40%+; "in the limit of continuous monitoring… crossing p=0.05 under the null
  is 100%." An agent makes this worse — it polls and ships instantly.
- **Detect:** a "winner" declared before the pre-registered N on a frequentist test; a result that
  fails to replicate weeks later.
- **Avoid:** Bayesian (no peeking penalty) or frequentist-with-sequential; hide the decision until N if
  truly fixed-horizon. Agents may stop **losers** early on a sequential boundary, not ship **winners.**
- **Version/source:** Atticus Li 2026; Statsig 2026; PostHog docs 2026. [field-04 §1, ecosystem-03 §1a]

### P14 🟠 Not running SRM (the silent-corruption check)
- **Breaks:** ~6–10% of tests have a sample-ratio mismatch → randomization broken → "results are
  invalid," with no error surfaced.
- **Detect:** chi-squared on observed vs intended split; a 50/50 that's actually 52/48 at large N.
- **Avoid:** run SRM as the **first** check on every experiment, **continuously**; refuse to report a
  winner if it fires. "It takes 30 seconds."
- **Version/source:** Statsig; Microsoft Research; Vermeer's SRM Checker (2026). [field-04 §3]

### P15 🟡 CUPED enabled on a low-repeat/e-commerce product
- **Breaks:** CUPED "can actually steer you wrong" without a strong pre-period covariate → bias, not
  power.
- **Detect:** CUPED-on for a one-shot-conversion experiment with no returning-user covariate.
- **Avoid:** only enable CUPED with a strong pre-experiment covariate (repeat usage). Off by default
  for e-commerce/one-shot.
- **Version/source:** ABTasty 2026. [ecosystem-03 §1b]

### P16 🟠 Means-based test applied to a conversion-rate metric
- **Breaks:** proportion/ratio metrics need different statistics than continuous means; applying a
  t-test-style means comparison to a conversion rate is wrong.
- **Detect:** a funnel/conversion metric analyzed with a continuous-mean test.
- **Avoid:** use funnel-specific methodology for proportion metrics.
- **Version/source:** PostHog funnels-statistics docs 2026. [ecosystem-03 §1d]

---

## F. Metric definition traps

### P17 🟠 Unbounded retention used for loop-over-loop tracking
- **Breaks:** unbounded ("Day-7 or later") retention "can constantly change as new days of data
  arrive" → yesterday's number silently changes today; an agent flags a phantom regression.
- **Detect:** a tracked retention number that moves without any product change.
- **Avoid:** use **bounded** (exact N-day) retention for tracked-over-time metrics; tie window to
  trial/subscription length.
- **Version/source:** Permutable/Amplitude 2026. [ecosystem-03 §2a]

### P18 🟡 Funnel with no explicit conversion window
- **Breaks:** omitting the conversion window "silently counts conversions that happened weeks later,
  inflating the rate."
- **Detect:** suspiciously high funnel conversion; conversions attributed long after the entry event.
- **Avoid:** set the conversion window as part of the funnel **definition** (e.g., "within 24h"), not
  an afterthought.
- **Version/source:** [ecosystem-03 §2c].

---

## G. Migration traps (full scenarios in [[BATTLE-TESTED-SCENARIOS]] BTS-7–10, 14)

### P19 🔴 Paused/re-run managed migration → duplicate events
- **Breaks:** "Managed migrations do not deduplicate events… running another migration against the same
  data set will result in duplicate events." A paused-then-resumed migration silently doubles data.
- **Detect:** post-migration counts higher than source; duplicate event-ids.
- **Avoid:** dedup on an event-id idempotency key; resume from a checkpoint, never re-run blindly.
- **Version/source:** PostHog managed-migrations docs 2026. [field-06 §2]

### P20 🟠 Expecting counts to match post-migration (defaults differ)
- **Breaks:** "PostHog blocks bot traffic by default, while Amplitude doesn't" → lower counts by
  design; Amplitude `session_start` dropped; Mixpanel events with no resolvable ID dropped.
- **Detect:** ~10–15% count drop after a clean migration → false "import broken" alarm.
- **Avoid:** reconcile and **explain** the delta (bot filter, dropped event types); don't chase parity.
- **Version/source:** PostHog migrate-from-amplitude docs 2026. [field-06 §2]

### P21 🟠 Assuming derived assets migrate (they don't)
- **Breaks:** cohorts, dashboards, charts, computed properties are "conspicuously absent from the
  migration process" — only raw events come over.
- **Detect:** empty dashboards/cohorts post-migration.
- **Avoid:** plan to rebuild every saved view by hand; set expectations up front.
- **Version/source:** PostHog managed-migrations docs 2026. [field-06 §2]

### P22 🟡 Forgetting `posthog.flush()` on bulk ingest >10k events
- **Breaks:** "The default queue size for ingesting is 10,000. If you are importing more than 10,000
  events, call `posthog.flush()`" — forget it and you lose the tail.
- **Detect:** bulk import missing the last <10k events.
- **Avoid:** call `flush()` after bulk batches; verify final count.
- **Version/source:** PostHog docs 2026. [field-06 §2/§5]

### P23 🔴 `$set` vs `$set_once` mis-mapped during migration → acquisition history destroyed
- **Breaks:** person properties "Must use `$set` and `$set_once` operators"; using `$set` for
  first-touch overwrites the original acquisition channel forever.
- **Detect:** acquisition-source property changing on later sessions; can't answer "where did this user
  come from."
- **Avoid:** `$set_once` for first-touch/acquisition; `$set` only for mutable current-state. Map by
  hand carefully.
- **Version/source:** PostHog migrate-from-amplitude docs 2026; field-01 §2. [field-06 §2]

---

## H. Cross-platform & governance divergence

### P24 🟠 Governance that's cloud-mode-only (Segment device-mode silent gap)
- **Breaks:** with Segment Protocols, "property omission plus schema-violation blocking are
  cloud-mode-only — unplanned properties are not stripped when sending to device-mode destinations."
  You think you have governance; mobile doesn't.
- **Detect:** unplanned/blocked properties appearing in a device-mode (mobile) destination despite a
  tracking plan.
- **Avoid:** verify governance applies to device-mode destinations; don't assume cloud-mode rules
  cover mobile. (Same multi-platform-divergence shape as the PII opt-out P8.)
- **Version/source:** digitalapplied 2026-06-10 (re: Segment Protocols). [field-01 §4]

### P25 🟡 GA4 hard limits (case-sensitive, enforced) + retention auto-collapse
- **Breaks:** GA4 enforces event name ≤40 chars (must start with a letter), ≤25 params/event, ≤500
  distinct app-stream event names/user; custom-dimension deletion has a **48-hour archive delay** before
  the slot reopens. And event-level retention **auto-collapses to 2 months** past 25B billable
  events/31 days (standard) — silently losing granular history.
- **Detect:** events silently not appearing (name too long / over param limit); granular history
  vanishing at high volume.
- **Avoid:** respect GA4's hard limits if using it; don't rely on GA4 for long-horizon granular
  history at scale. (And don't default to GA4 for product events at all — see [[TOOL-MATRIX]].)
- **Version/source:** GA4 docs via digitalapplied 2026-06-10; practicetestgeeks 2026-06. [field-01 §5, ecosystem-03 §4]

---

## I. OpenFeature / flagd spec maturity (don't assume these yet)

### P26 🟡 Relying on OpenFeature for experiment telemetry / per-agent isolation / reactive updates
- **Breaks:** OpenFeature does NOT yet standardize: an experimentation/metrics hook (#371, OPEN),
  isolated API instances for multi-provider-per-context / swarm (#374, OPEN — most SDKs use a global
  singleton), or reactive variable-update subscription (#346, OPEN). Building on these today = building
  on vendor-specific behavior.
- **Detect:** a design that assumes portable exposure events, or that two agents in one process can
  cleanly hold different providers.
- **Avoid:** use OpenFeature for **evaluation portability** today; fall back to vendor-specific APIs for
  experiment telemetry and per-agent isolation until the spec lands. flagd error codes were still being
  normalized mid-2026 (#1679) — pin the flagd version and test the codes you branch on.
- **Version/source:** open-feature/spec #371/#374/#346 (OPEN as of 2026-06-15/2026-05-23/2025-11-05);
  flagd #1679 (closed 2026-06-09). [ecosystem-04 §3/§4]

---

## J. The single highest-stakes lifecycle pitfall

### P27 🔴 Reusing a retired flag key/bit (the Knight Capital class)
- **Breaks:** reusing a deprecated flag bit while the old code path still exists → a stale instance
  interprets the new bit as the old instruction. Knight Capital: **$440M in 45 minutes.** And "deprecate
  the flag" is THREE steps (ramp 0/100, remove config, **delete the code branch**) — skipping the third
  is the universal non-catastrophic version.
- **Detect:** a flag key being recycled; a flag toggled-off whose `if (flags.X)` branch is still
  compiled in (code-only/orphan zombie); a "rollback to known-good" that re-deploys the dead-code
  binary.
- **Avoid:** **never reuse a flag key/bit** — tombstone retired keys forever. Track flag + dead-code
  lifecycle together; a flag isn't removed until its branch is. Use Piranha-style automation to generate
  removal diffs.
- **Version/source:** specbranch / Henrico Dolfing (2012 event, canonical); field-03 §3; ecosystem-04 §5.

---

## Quick-scan index

| # | Pitfall | Class | Sev |
|---|---|---|---|
| P1 | `distinct_id` local≠DB eval | flag correctness | 🔴 |
| P2 | props not passable to local eval | flag correctness | 🔴 |
| P3 | local-eval cache skew (swarm) | flag correctness | 🟠 |
| P4 | project vs personal key | auth/limits | 🟡 |
| P5 | replay drops on login | replay | 🟠 |
| P6 | CSP blocks replay media | replay | 🟠 |
| P7 | Safari replay flaky | replay | 🟠 |
| P8 | four PII default surfaces | PII | 🔴 |
| P9 | archived PostHog/mcp clone | agent surface | 🟡 |
| P10 | `wizard --ci` headless wall | agent surface | 🟡 |
| P11 | raw HogQL 120/hr stall | rate limit | 🟠 |
| P12 | LLM hallucinates HogQL columns | query | 🟡 |
| P13 | peeking on fixed-horizon | stats | 🔴 |
| P14 | no SRM check | stats | 🟠 |
| P15 | CUPED on low-repeat | stats | 🟡 |
| P16 | means-test on conversion rate | stats | 🟠 |
| P17 | unbounded retention drift | metric def | 🟠 |
| P18 | no conversion window | metric def | 🟡 |
| P19 | re-run migration → dupes | migration | 🔴 |
| P20 | expect counts to match | migration | 🟠 |
| P21 | derived assets don't migrate | migration | 🟠 |
| P22 | forget `flush()` >10k | migration | 🟡 |
| P23 | `$set` vs `$set_once` mis-map | migration | 🔴 |
| P24 | cloud-mode-only governance | governance | 🟠 |
| P25 | GA4 hard limits + retention collapse | GA4 | 🟡 |
| P26 | OpenFeature spec gaps | flag spec | 🟡 |
| P27 | reuse retired flag key | flag lifecycle | 🔴 |

27 pitfalls · 8 🔴 irreversible/correctness · 11 🟠 silent · 8 🟡 operational.
