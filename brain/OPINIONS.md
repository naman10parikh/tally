---
title: "tally — Opinions (explicit taste, the anti-slop layer)"
type: synthesis
created: "2026-06-16"
updated: "2026-06-16"
tags: [opinions, taste, stances, anti-slop, product-analytics, feature-flags, tally]
domain: product-analytics-feature-flags
sources:
  - "raw/ecosystem-00-internal-references.md"
  - "raw/ecosystem-01-versions-and-changelog-deltas.md"
  - "raw/ecosystem-02-agent-operator-clis-apis-mcps.md"
  - "raw/ecosystem-03-experimentation-stats-privacy-ga4-funnels.md"
  - "raw/ecosystem-05-tradeoff-matrix-and-starter-repos.md"
  - "raw/field-01-event-taxonomy-disasters.md"
  - "raw/field-02-pii-in-analytics-leaks.md"
  - "raw/field-03-flag-debt-and-dead-code.md"
  - "raw/field-04-experiment-phacking-peeking.md"
  - "raw/field-05-when-autocapture-hurts.md"
  - "raw/field-06-migration-war-stories.md"
related: ["[[EXPERTISE-MAP]]", "[[KNOWN-PITFALLS]]", "[[GAPS-AND-DISPUTES]]", "[[TOOL-MATRIX]]"]
summary: "tally's explicit taste stances — always X / never Y, because Z, with source. The layer that makes tally opinionated instead of a neutral wiki. Disputed stances cross-ref GAPS."
---

# tally — Opinions (the anti-slop layer)

> A neutral encyclopedia is useless to an operator. These are tally's **stances** — defaults it
> applies unless a specific reason overrides. Format: **Always/Never X — because Z [source].** Where a
> stance sits on a genuinely contested fork, it's marked **⚖️ DISPUTED** and points to
> [[GAPS-AND-DISPUTES]] for both sides. tally holds a default *and* knows it's a choice.

---

## Stack & architecture

### O1 — Always treat the tracking plan as code, never as docs
**Always** wire the event taxonomy into a **CI gate** that fails the build on an unregistered or
mistyped event. **Never** keep the tracking plan in a Notion/spreadsheet wiki.
**Because:** "A plan in a spreadsheet drifts; a plan wired into CI holds… Treat it like documentation
and you are simply choosing how quickly it will rot." The 2026 reframing of governance is "gate the
taxonomy in CI, not a wiki." [field-01 §3, field-05 §4]

### O2 — Always keep a canonical machine-readable event registry (the dedup ledger)
**Always** maintain a single registry that the *second* engineer cannot bypass — the events analog of
`processed-index.jsonl` in `energy/scripts/x-content-intel/score.py`.
**Because:** naming drift is a tragedy of the commons — "the cumulative effect of many locally rational
choices, made without coordination, produces a globally irrational system." A registry is the only
structural fix; review and good intentions are not. [field-01 §1a/§6, ecosystem-00 §B.3]

### O3 — Always enforce identity & first-touch at instrumentation time, never at review
**Always** call `identify()` at first load AND after login, and use **`$set_once`** for acquisition
props / `$set` only for mutable state. **Never** treat these as things a code review can catch later.
**Because:** identity-stitching and `$set`/`$set_once` are retroactive-loss bugs — "they cannot be
fixed after the fact (the original value is gone)." Detect-at-review is too late by definition.
[field-01 §2]

### O4 — Always mask-all-then-allowlist for replay/capture, never allow-all-then-denylist; fail closed
**Always** start with `maskAllInputs: true` + `maskTextSelector: "*"` and unmask by explicit
data-attribute; drop properties matching PII patterns at the SDK/edge **before storage**. **Never**
capture-everything-and-redact-later.
**Because:** "PostHog will make a best effort to not capture sensitive information by default. This is
not always sufficient." PII is a one-way door — once stored/exported "you cannot un-ring the bell."
Denylists are whack-a-mole; the data is already stored before you patch. [field-02 §2/§3/§5]

### O5 — Always make the silent-failure guardrails BLOCKING, never advisory
**Always** make SRM-check, peeking-lock, multiple-comparison correction, and PII-scan **block** (refuse
to report a winner / fail CI / drop the event). **Never** ship them as warnings.
**Because:** the silent-failure class (SRM, identity-fracture, PII-in-replay) "throws no error and
surfaces no obvious signal" — and "warnings get ignored." This is the core "harness as enforcer, not
linter" decision. [field-02/§4 taste; field-04 §3; GAPS §C6]

### O6 — Always make peeking structurally impossible, never merely discouraged
**Always** either hide the decision/p-value until the pre-registered N, OR use sequential/Bayesian math
so looking is valid. **Never** ship a frequentist dashboard with a live "ship it" button.
**Because:** "in the limit of continuous monitoring… the probability that the cumulative test statistic
ever crosses p=0.05 under the null is not 5%. It is 100%." Humans (and agents) WILL peek; the wrong
design guarantees false positives. [field-04 §1]

---

## Feature flags

### O7 — Never assume local-eval equals server-eval for correctness
**Never** target a flag by `distinct_id`/person property using bare PostHog local eval. **Always**
either use DB-backed eval or pass the full property set into the local-eval call.
**Because:** local eval "only sees the properties you hand it, not the server's full person profile" —
PostHog #57183 (`distinct_id` missing locally) and #28453 (props not passable) prove the same user gets
different flag values by path. Local eval is a latency win that trades correctness. [ecosystem-04 §1a/§1b]

### O8 — ⚖️ Always default experiments to 50/50, never ramp small "for safety" of the *measurement*
**Always** run the measurement phase at **50/50**; use a **kill-switch** for safety, not a small
allocation. **Never** conflate a safety canary with the statistical allocation.
**Because:** Kohavi (the textbook author): "the 10% logic is flawed" — 50/50 reaches significance
fastest per exposure budget. Ramp 5–10% to bound *blast radius* (an ops concern), then jump to 50/50
for *measurement* (a power concern). Conflating the two is the error.
**⚖️ Contested:** the canary convention says ramp slowly; resolution = they optimize different things.
See [[GAPS-AND-DISPUTES]] §A4. [field-04 §4b/§5C]

### O9 — Always parallelize experiments, never serialize out of fear of interaction
**Always** run overlapping tests at scale. **Never** serialize "to be safe" by default.
**Because:** two textbook-level authorities agree — Vermeer: "Unplanned interactions are incredibly
rare… the fear of interactions often prevents many teams from fully leveraging… overlapping tests";
Kohavi: "the concerns are overstated… Concurrent testing is essential to scale." Common practice has
this backwards. [field-04 §4a/§4b, GAPS §A5]

### O10 — Always attach a mandatory expiry + owner to every temporary flag at creation
**Always** require an expiry date + owner on release/temporary flags; auto-PR removal when stale.
**Never** create a temporary flag without an expiry ("debt by construction").
**Because:** "a feature is not done when it ships, it is done when the flag is gone." "High stale-flag
counts and falling deployment frequency travel together." But — **distinguish temporary from permanent
flags**: kill-switches/entitlement gates live forever and are NOT debt; "delete all old flags" scripts
cause outages by conflating the two. [field-03 §4]

### O11 — Never reuse a retired flag key/bit — tombstone forever
**Never** recycle a flag key or bit. **Always** mint a fresh key and tombstone retired ones; and treat
"deprecate" as THREE steps (ramp 0/100 → remove config → **delete the code branch**).
**Because:** Knight Capital — a reused deprecated flag bit + un-deleted code path = **$440M in 45
minutes**. "The cost of a fresh key is zero; the cost of reuse is potentially unbounded." [field-03 §3, ecosystem-04 §5]

---

## Instrumentation strategy

### O12 — Always use autocapture for discovery, never as the API contract for a load-bearing metric
**Always** let autocapture power exploration; **never** let a funnel, retention curve, or experiment
metric depend on an autocaptured event — promote it to a named, typed, CI-registered event the moment
it matters.
**Because:** "autocapture is a great prior and a terrible API contract." Even PostHog (which *builds*
it) lands on hybrid. Autocapture couples metrics to the DOM — "a button is renamed… and the captured
events shift in ways that quietly break the dashboards… with no error." [field-05 §1/§5/§6]

### O12b — Autocapture default: OFF for funnels/auth/payments, opt-in for exploration
**Default autocapture OFF** for core funnels and for forms/auth/payment/health flows; allow it as an
opt-in discovery mode behind the CI-gated registry. **(PostHog ships it ON; the field's hard-won taste
says start off.)**
**Because:** the decision table — autocapture *hurts* on stable named metrics and is *dangerous* on PII
surfaces; it *helps* only pre-PMF exploration or with a registry + AI triage in place. [field-05 §5, GAPS §C2]

---

## Agent-operator discipline

### O13 — Always materialize recurring reads, never loop raw HogQL
**Always** materialize a recurring query via "Endpoints GA" and poll the materialized endpoint
(12,000/hr). **Never** put `execute-sql` (raw HogQL) inside an autonomous loop.
**Because:** raw HogQL is capped at **120/hour** — an agent loop stalls. Capture (ingest) is unmetered;
reads on a personal key are the bottleneck. "Persist, don't recompute." This is the single most
important rate-limit insight for an agent operator. [ecosystem-02 §6, ecosystem-00 §B.5]

### O13b — Prefer typed query tools over hand-written SQL
**Always** reach for `query-funnel`/`query-retention`/`query-trends` before `execute-sql`. **Never**
hand-write HogQL unless the typed tools can't express the query.
**Because:** typed tools constrain the surface and avoid hallucinated columns (LLM SQL invents columns,
worsened by naming-drift). `execute-sql` is a deliberate escape hatch, not the default. [ecosystem-02 §1b]

### O14 — Always own the raw event stream (warehouse-first), never trust only the vendor's store
**Always** store events in an event-native, exportable, vendor-neutral shape (a warehouse `events`
table you own) from day one. **Never** make the vendor's proprietary store your only copy.
**Because:** every migration "loses" data — GA4's session→event shift is "irreversible at the data
layer." Owning the raw stream makes a future switch "a re-pipe, not a data bereavement," and is the
single best insurance against this class of disaster. [field-06 §1/§5]

### O15 — Always target OpenFeature at the flag call-site, never bind call sites to a vendor SDK
**Always** put OpenFeature (or Vercel Flags SDK on Next.js/Vercel surfaces) at the call site with the
vendor behind a provider. **Never** sprinkle vendor-specific SDK calls across the codebase.
**Because:** "every LaunchDarkly SDK call ties you to the platform"; the Statsig ownership whiplash
(OpenAI bought it, builders left, Amplitude now runs the brand) and the Oct-2025 LaunchDarkly/AWS
outage are the proof-costs. A provider swap should be a config change, not a rewrite — "HTTP for
feature flags." **Caveat:** OpenFeature's spec still has gaps (metrics hook, isolation, reactive
updates) — use it for *evaluation portability*, not yet for experiment telemetry. [field-06 §4, ecosystem-01 §0.1, KNOWN-PITFALLS P26]

### O16 — Always dual-write + reconcile + explain-the-delta before any provider cutover; never hard-cut
**Always** run old and new providers concurrently, reconcile counts, and *explain* any delta before
removing the legacy path. **Never** trust a one-shot migration or assume the numbers will match.
**Because:** "PostHog blocks bot traffic by default" → counts legitimately drop ~15% post-migration;
re-running a paused migration "results in duplicate events" (no auto-dedup); derived assets don't
transfer. The meta-lesson: "dual-write, reconcile, explain the delta, then cut over." [field-06 §2/§3/§5]

---

## Tool choice (defaults — full matrix in [[TOOL-MATRIX]])

### O17 — PostHog is the default backend; its weakness is depth, not breadth — bolt on, don't rip out
**Default to PostHog** for the whole plane (analytics + flags + replay + experiments + errors +
warehouse). If one module becomes load-bearing and you outgrow its stats (e.g., experiments), **bolt on
GrowthBook for that module via OpenFeature** — do NOT rip-and-replace.
**Because:** PostHog is uniquely agent-native (full MCP + agentic wizard) and the fleet already chose
it; its honest cost is "breadth > depth: each module 'good,' none best-in-class." Rip-and-replace
throws away a working stack to fix one seam. [ecosystem-05 §1b/§3, ecosystem-00 §A]

### O18 — Never conflate the three planes (product analytics ≠ web stats ≠ LLM traces); CDP ≠ analytics
**Never** pipe LLM `gen_ai.usage.*` spans into PostHog; **never** use Plausible/Fathom as a PostHog
replacement; **never** treat Segment/RudderStack (a CDP) as an analytics competitor.
**Because:** these are distinct planes constantly confused. Product analytics (PostHog) ≠ LLM tracing
(Langfuse) ≠ privacy web stats (Plausible/Fathom). A CDP is the *pipe in front of* the analytics
*sink*, and is usually overkill until you have ≥3 destinations. [ecosystem-00 §A, ecosystem-03 §3, ecosystem-05 §1b]

### O19 — Weight event value by intent depth, never by raw count
**Always** weight in-app actions by *intent depth* when building an engagement/PQL score (save > share
> comment > like; invite-teammate > create-project > view-dashboard). **Never** sum raw event counts as
if all actions are equal.
**Because:** the in-house precedent — `score.py` weights `bookmarks*2 + retweets*3 + replies*1.5 +
likes` — is exactly how a good engagement/PQL score should weight events. A raw count treats a
high-intent action and a pageview identically. [ecosystem-00 §B.2]

---

## The disputed stances tally holds a default on (pointer)

These are real, unsettled forks where tally picks a default *and documents it's a choice* — see
[[GAPS-AND-DISPUTES]] §A and §C for both sides:

- **Sequential/Bayesian vs fixed-horizon frequentist** → default **sequential/Bayesian** *if the UI
  ever shows a live result* (humans peek); fixed-horizon only if the look is truly locked. [O6; GAPS §A3/§C1]
- **Autocapture weighting** → default **off for load-bearing metrics, opt-in for discovery.** [O12b; GAPS §A1/§C2]
- **50/50 vs ramped allocation** → ramp for *safety*, 50/50 for *measurement*. [O8; GAPS §A4]
- **Own the raw stream vs trust the vendor** → default **own it** (warehouse-first). [O14; GAPS §C5]
- **Guardrails blocking vs advisory** → default **blocking** for the silent-failure class. [O5; GAPS §C6]

---

## Meta-stance (the one that governs all the others)

### O20 — tally is an enforcer, not a linter; it fails closed on the irreversible classes
The throughline across O3, O4, O5, O6, O11, O14: the failures that **cannot be repaired after the
fact** — identity fracture, PII-in-store, lost acquisition data, peeked winners shipped to prod,
reused-flag catastrophe, lost history on migration — must be **prevented at instrumentation/creation
time and fail closed**, not surfaced as advice in a review. Everything reversible can be a warning;
everything irreversible must be a wall. This is what makes tally a *harness* and not a dashboard.
