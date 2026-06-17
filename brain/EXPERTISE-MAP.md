---
title: "tally — Expertise Map (everything this employee must master)"
type: synthesis
created: "2026-06-16"
updated: "2026-06-16"
tags: [expertise-map, product-analytics, feature-flags, experimentation, posthog, openfeature, tally]
domain: product-analytics-feature-flags
sources:
  - "raw/ecosystem-00-internal-references.md"
  - "raw/ecosystem-01-versions-and-changelog-deltas.md"
  - "raw/ecosystem-02-agent-operator-clis-apis-mcps.md"
  - "raw/ecosystem-03-experimentation-stats-privacy-ga4-funnels.md"
  - "raw/ecosystem-04-real-breakage-github-issues.md"
  - "raw/ecosystem-05-tradeoff-matrix-and-starter-repos.md"
  - "raw/field-01-event-taxonomy-disasters.md"
  - "raw/field-02-pii-in-analytics-leaks.md"
  - "raw/field-03-flag-debt-and-dead-code.md"
  - "raw/field-04-experiment-phacking-peeking.md"
  - "raw/field-05-when-autocapture-hurts.md"
  - "raw/field-06-migration-war-stories.md"
  - "raw/field-07-gaps-and-disputes.md"
related: ["[[OPINIONS]]", "[[BATTLE-TESTED-SCENARIOS]]", "[[KNOWN-PITFALLS]]", "[[TOOL-MATRIX]]", "[[GAPS-AND-DISPUTES]]"]
summary: "The structured map of every job tally must do — organized by job-to-be-done, not by tool — each node citing its raw source. Read this first."
---

# tally — Expertise Map

> **What tally is.** The fleet's domain-expert harness for **product analytics + feature flags**
> (the slot the fleet calls "Switch=flags folded in here"). The fleet has **already chosen PostHog**
> as the default primitive because it bundles analytics + flags + session replay + experiments +
> error tracking + a data warehouse, and ships an MCP server (100+ tools). This slot is tagged
> **GAP** in `energy/audit/HARNESS-CHECKLIST-2026.md` (lines 76, 320-323) — meaning no repo owns it
> yet. **tally is the repo that closes it.** [ecosystem-00 §A]
>
> **Who tally is.** An **AGENT operator**, not a human dashboard user. What an agent needs ≠ what a
> PM needs: programmable surfaces, idempotency discipline, rate-limit-aware read patterns, and
> guardrails that *block* silent-failure classes rather than merely warn. This map is organized by
> the jobs an agent does, then mapped to the tools that do them (full tool detail → [[TOOL-MATRIX]]).
>
> **How to read this map.** Eight jobs (J1–J8). Each job has: what it is, the sub-skills to master,
> the load-bearing taste, and the failure modes it defends against (full pitfalls → [[KNOWN-PITFALLS]],
> full scenarios → [[BATTLE-TESTED-SCENARIOS]]). Stances are in [[OPINIONS]]; unsettled forks in
> [[GAPS-AND-DISPUTES]].

---

## The three "do not conflate" planes (the load-bearing mental model)

Before any job: tally operates on **one** of three planes that are constantly confused. Getting the
plane wrong is the most common architecture mistake in this domain.

| Plane | What it is | Canonical tool | NOT this |
|---|---|---|---|
| **Product analytics + flags** (tally's plane) | In-app *events*, funnels, retention, cohorts, experiments, feature flags | **PostHog** | not LLM traces, not web pageview stats |
| **LLM / agent observability** | `gen_ai.usage.*` OpenTelemetry GenAI spans, token/cost/latency of model calls | Langfuse v3 (agentmoney's slot) | **NEVER pipe `gen_ai.usage.*` spans into PostHog as product events** [ecosystem-00 §A, field-02 §6] |
| **Privacy-first WEB analytics** | Pageviews, referrers, UTM, sources — marketing attribution | Plausible CE (AGPL) / Fathom | replaces GA4, **not** PostHog; web stats are not product events [ecosystem-03 §3] |

A fourth boundary inside tally's own plane: a **CDP** (Segment/RudderStack) is the *collection +
routing + identity-resolution pipe* that sits **in front of** PostHog/Amplitude/Mixpanel — it is
**not** an analytics competitor. The most common architecture mistake is treating Segment/RudderStack
as a PostHog replacement. [ecosystem-01 §7, ecosystem-05 §1b]

---

## J1 — Event taxonomy design that won't rot

**The job.** Design and *enforce* the event schema (the "tracking plan") so it stays a single,
queryable namespace as N engineers ship over months. This is the foundation every other job stands on
— a rotted taxonomy makes funnels, retention, cohorts, and experiments all silently wrong.

**Sub-skills to master:**
- **Naming as a shared namespace.** `Song Played` vs `song played` are two separate events on
  Amplitude — capitalization is a semantic boundary. The rot is a *tragedy of the commons*: "each
  engineer makes a locally rational naming choice… the cumulative effect… produces a globally
  irrational system." [field-01 §1a — quote the Atticus Li framing]
- **Type stability.** An `amount` field that arrives as number in one event and string in another
  causes "aggregations [to] break or silently coerce" — **no error thrown.** [field-01 §1b]
- **A canonical event registry (the dedup ledger).** The structural fix for naming drift is a
  machine-readable registry the second engineer *can't* bypass — the events-equivalent of the
  `processed-index.jsonl` dedup ledger in `energy/scripts/x-content-intel/score.py`. [field-01 §6, ecosystem-00 §B.3]
- **Treat it like code, not docs.** "A plan in a spreadsheet drifts; a plan wired into CI holds."
  The 2026 reframing: **gate the taxonomy in CI, not a wiki** — fail the build on an
  unregistered/mistyped event. [field-01 §3, field-05 §4]
- **Server-side-first.** "Backend analytics are more reliable than frontend… many users have tracking
  disabled or blocked." Log events server-side where possible. [field-01 §3]
- **Recovery anti-patterns.** "Renaming an event without a migration plan… creates two broken time
  series where there was one." Over-tracking collapses discoverability. [field-01 §4]

**Load-bearing taste:** an event taxonomy is *durable infrastructure* only if it's enforced at
instrumentation time by a CI-gated registry. A tracking plan in Notion is "choosing how quickly it
will rot." → [[OPINIONS]] O1, O2.

**Defends against:** naming drift, type mutation, autocapture schema-shift, owner-departure orphans.

---

## J2 — Identity resolution & the "you can't fix it later" class

**The job.** Stitch anonymous → known identity correctly, and protect first-touch/acquisition data.
This is **P0** because, alongside PII leaks, it's one of the only failure modes that "throw no error
and surface no obvious signal" — and the damage is **retroactive and unrepairable.** [field-01 §2]

**Sub-skills to master:**
- **The stitch mechanism.** When anonymous, the tool assigns a `distinct_id`; on login it must be
  stitched to the known identity. Done wrong, "one human shows up as several, and every funnel,
  retention curve, and cohort built on top is wrong in ways no alert will catch." [field-01 §2 — quote it]
- **The two-call rule.** Call `identify()` at **first load** AND **after login**. "Skip the first
  call and you lose pre-login behavior; skip the second and your logged-in users fragment from their
  anonymous selves." [field-01 §2]
- **`$set` vs `$set_once` (the data-loss landmine).** Use **`$set_once`** for acquisition/first-touch
  props (referral source, first campaign); **`$set`** only for mutable current-state. "if you use
  `$set` for referral source, every later session overwrites the original acquisition channel, and
  you lose the ability to ever say where a user truly came from." [field-01 §2]
- **`distinct_id` targeting is eval-path-dependent.** Flag conditions on `distinct_id` can behave
  differently in local-eval vs DB-eval (PostHog #57183) — see J4 and [[KNOWN-PITFALLS]] P1.

**Load-bearing taste:** identity stitching and `$set`/`$set_once` "cannot be fixed after the fact (the
original value is gone)." The harness MUST enforce these at instrumentation time, **not** flag them in
review. Detect-at-review is too late *by definition.* → [[OPINIONS]] O3.

**Defends against:** fractured user graph, lost acquisition attribution, wrong funnels/retention/cohorts.

---

## J3 — PII / privacy: fail-closed capture

**The job.** Keep personal data (and PHI) *out* of the event store and replay store. Like identity,
this is a **one-way door**: once PII is stored/exported, "you cannot un-ring the bell." [field-02 §5]

**Sub-skills to master — the four hiding places (from PostHog's own docs):** [field-02 §1]
1. **Autocapture input metadata** — captures `name`/`id`/`class` of `<input>` tags; `id="ssn"` leaks
   field identity even when value is masked.
2. **Session-replay DOM snapshots** — captures "the complete DOM structure including form values
   unless explicitly masked." **The single highest-risk surface.**
3. **URLs incl. query strings** — `?email=a@b.com&token=…` lands in `$current_url` on every pageview.
4. **Person properties via `identify()`** — whatever you stuff into the profile is now stored; "Do not
   send data that could be used to identify users… if they have not given consent."

**The private-by-default recipe** (PostHog's own strong-opinion config): "mask all inputs and text,
only selectively unmasking elements that you need to capture." Concrete config → [[TOOL-MATRIX]] /
[[BATTLE-TESTED-SCENARIOS]] BTS-2. The `before_send` hook strips URL PII at the edge. [field-02 §3]

**Cross-platform gotcha:** element opt-out is **three different mechanisms** — web CSS class
`ph-no-capture`, iOS `accessibilityLabel`/`accessibilityIdentifier`, React Native a `ph-no-capture`
prop. A team that only knows the web class leaks on mobile. [field-02 §3]

**Regional default split:** PostHog captures client IP by default for US-seated orgs but **defaults IP
capture OFF for EU orgs (GDPR).** Behavior differs by region. [field-02 §1]

**Load-bearing taste:** mask-all-then-allowlist, **never** allow-all-then-denylist. Denylists are
whack-a-mole and the data is already stored before you patch. The harness should **fail-closed**: a
property key matching a PII pattern (`email`, `phone`, `ssn`, `card`, `password`, `token`, `dob`) and
not on an explicit allowlist is **dropped at the SDK/edge before storage**, with a warning logged.
→ [[OPINIONS]] O4.

**Defends against:** GDPR/HIPAA exposure, irreversible PII-in-store, the retroactive-deletion trap.

---

## J4 — Feature flags: targeting, evaluation correctness, and rollout safety

**The job.** Create, target, evaluate, and roll out flags — *safely*, as an autonomous operator. The
scariest class here is **evaluation correctness**: a flag that evaluates differently depending on the
eval path can roll a feature to the WRONG users, invisibly.

**Sub-skills to master:**
- **Local-eval vs DB-eval is a correctness tradeoff, not just latency.** Local eval "only sees the
  properties you hand it, not the server's full person profile." For property/`distinct_id` targeting,
  **pass ALL relevant person/group props into the local-eval call, or use DB-backed eval.** (PostHog
  #57183 = `distinct_id` inconsistent; #28453 = props not passable in local eval — the single most
  common PostHog flag footgun.) [ecosystem-04 §1, field-… → [[KNOWN-PITFALLS]] P1, P2]
- **Cache coherence across instances.** Multiple app instances each cache their own flag definitions →
  skew. Matters for any multi-pane/swarm deployment. (PostHog #37584.) [ecosystem-04 §1c]
- **Public (project) key vs personal key.** Capture uses the *project* key; reads/flag-management use a
  *personal* key. Confusing them → client 401s and unexpected rate limits. (PostHog #20337.) [ecosystem-04 §1d, ecosystem-02 §6]
- **Safe rollout primitives (agent-gold MCP tools).** `feature-flags-user-blast-radius-create`
  (how many users a change hits — a pre-flight safety check), `feature-flags-test-evaluation-create`
  (dry-run an eval for a synthetic user), `scheduled-changes-*` (queue a rollout instead of flipping
  live). An autonomous flag-flipper uses these to *not* cause an incident. [ecosystem-02 §1b]
- **Ramp for safety, not for measurement.** Canary at 5–10% to bound blast radius; this is an *ops*
  concern, distinct from the *statistical* allocation question (J5). [field-04 §5 Dispute C]
- **Two flag TYPES, two lifecycles** — release/temporary (must expire) vs permanent/operational
  (kill-switches, entitlement gates — live forever, NOT debt). Conflating them is why "delete all old
  flags" scripts cause outages. [field-03 §4] → J6.

**Load-bearing taste:** never assume local-eval has the same inputs as server-eval. For correctness-
critical targeting, prefer DB-eval or pin properties explicitly. → [[OPINIONS]] O7.

**Defends against:** rolling features to wrong users, swarm cache skew, auth-key confusion, incidents
from live flips.

---

## J5 — Experimentation statistics (the part an agent gets wrong by default)

**The job.** Run experiments and **decide winners correctly.** An agent that reads significance and
ships winners WILL produce wrong decisions unless it encodes four things. This is the highest-density
expertise node in tally — an LLM operator will *happily declare a peeked winner* unless the harness
stops it. [field-04 §6]

**Sub-skills to master:**

- **Peeking (the #1 false-positive source).** "Checking results 20 times instead of once can inflate
  your false positive rate from 5% to potentially 40% or higher." Exact numbers: check every 500
  visitors → ~26%; every 1,000 → ~20%; continuous monitoring of a fixed-horizon test → 30%+, climbing
  toward 40%+. The killer limit-case: "In the limit of continuous monitoring… the probability that the
  cumulative test statistic ever crosses p=0.05 under the null is **not 5%. It is 100%.**" A long-enough
  look at a pure-noise A/A test is *guaranteed* to show significance. [field-04 §1, ecosystem-03 §1a]
  - **Fix:** sequential testing (always-valid / mSPRT) OR Bayesian — so *looking is allowed*. The
    wrong design is a frequentist dashboard with a live "ship it" button. [field-04 §1]
  - **The asymmetry to encode:** sequential is "fantastic for spotting losers early… not meant for
    declaring winners ahead of schedule." → an agent may STOP a loser early on a sequential boundary,
    but must NOT ship a winner before the pre-registered N unless using a proper always-valid method.
    [ecosystem-03 §1a]
- **SRM — Sample Ratio Mismatch (the most under-run, highest-leverage safeguard).** "is this
  experiment even valid to read at all?" You asked 50/50, got 52/48 at large N → randomization is
  broken. "SRM doesn't just suggest a problem — it proves one… results are invalid." Occurs in ~6–10%
  of tests (1 in ~12 silently corrupt). "SRM should be the first check you run on every experiment…
  takes 30 seconds." Run it *continuously*, not once at the end. [field-04 §3] → the experiment analog
  of identity-stitching: throws no error, surfaces no signal.
- **CUPED — the variance-reducer that can BACKFIRE.** Uses pre-experiment data to cut noise, but "if
  you have an e-commerce site, CUPED can actually steer you wrong." Only apply when there's a strong
  pre-period covariate (returning users / repeat usage); on low-repeat/one-shot-conversion products it
  adds bias, not power. [ecosystem-03 §1b]
- **Bayesian vs Frequentist — what each forbids.** Bayesian (PostHog default): win probability +
  credible intervals, "check results at any time without statistical penalties" (no peeking penalty by
  construction). Frequentist: requires predefined sample size, no mid-flight updates — but PostHog's
  frequentist mode includes sequential options. For an agent, **Bayesian is the safer default**
  because it can poll results every loop without inflating error. [ecosystem-03 §1c]
- **The named-failure taxonomy** (GrowthBook): Multiple Testing, Texas Sharpshooter (segment-fishing),
  P-Hacking, Peeking, Simpson's Paradox, Goodhart's Law, Twyman's Law ("any figure that looks
  interesting is usually wrong"), A/A trust tests, HiPPOs, confirmation bias. Items 2, 3, and
  segment-fishing are the *same* bug: **post-hoc hypotheses.** [field-04 §2]
- **Funnel-metric stats ≠ means.** Proportion/ratio metrics (conversion rates) need different
  treatment than continuous means. Don't apply a means-based test to a conversion-rate metric.
  [ecosystem-03 §1d]
- **Pre-registration as an eval contract.** Write the hypothesis + metric + segment list to disk
  *before data exists* (mirrors tally's own eval-before-code discipline). An experiment contract == an
  eval contract. [field-04 §2, §7]

**Expert-consensus taste (contrarian — average teams have it backwards):** Vermeer + Kohavi (textbook
authorities) are *less* cautious than folk wisdom on two axes — (1) run **50/50**, not 10% ("the 10%
logic is flawed"; 50/50 reaches significance fastest per exposure; use a kill-switch for safety, not a
small allocation); (2) **parallelize** tests, don't fear interaction ("unplanned interactions are
incredibly rare"). And *more* rigorous on what matters: pre-registration, SRM, no peeking. [field-04
§4] → [[OPINIONS]] O8, O9.

**Load-bearing taste:** make peeking *structurally impossible*, not discouraged. Make SRM, multiple-
comparison correction, and pre-registration **blocking guardrails**, not advisory linters — warnings
get ignored. → [[OPINIONS]] O5, O6.

**Defends against:** fake winners, corrupt randomization, biased variance reduction, segment-fishing.

---

## J6 — Flag-debt & dead-code lifecycle

**The job.** Prevent flags from rotting into branching hell — and, at the catastrophic tail, a
$440M outage. A flag is **not removed until its CODE PATH is removed.** [field-03 §3]

**Sub-skills to master:**
- **The three zombie-flag categories.** (1) **Permanent-100%** flags (feature fully released, both
  branches still in source); (2) **Code-only/orphan** flags (config gone, `if (flags.X)` still
  compiled in — *the Knight Capital class*); (3) **Abandoned-but-active** (owner left, intent lost).
  [field-03 §2]
- **The Knight Capital postmortem (the canonical disaster).** They reused a deprecated flag bit
  ("Power Peg") for a new feature, never removed the old code path, one server missed the deploy → it
  interpreted the reused bit as the old instruction → **$440M / 397M shares in 45 minutes**, company
  acquired. The verbatim lesson: "they never took the last step: removing the server code." And the
  contrarian twist: **the rollback made it worse** (re-deployed the same dead-code-bearing binary).
  [field-03 §3, ecosystem-04 §5] → [[BATTLE-TESTED-SCENARIOS]] BTS-6.
- **"Deprecate" is THREE steps, not one:** (1) ramp to 0/100, (2) remove dashboard config, (3)
  **delete the code branch.** Most flag-debt is the skipped third step at non-catastrophic scale.
  [field-03 §3]
- **Never reuse a flag key/bit.** Retired keys are **tombstoned**, never recycled — the flag analog of
  the `processed-index.jsonl` "never re-mint a stable ID" property. [field-03 §6, ecosystem-04 §5]
- **The cleanup playbook:** Uber's **Piranha** (scans source, *generates the removal diff* — doesn't
  just flag debt); hardwire removal into Definition of Done; "Flag Friday"; mandatory **expiry +
  owner** at flag-creation; "High stale-flag counts and falling deployment frequency travel together."
  [field-03 §4, ecosystem-04 §5]
- **Agent operationalization:** a flag-hygiene sweep using `feature-flags-status-retrieve` + age +
  last-evaluation date + owner → surface/auto-PR removals. GrowthBook's 2026 custom-JS validation
  hooks can *block* risky flag states at create time (governance-as-code). [ecosystem-04 §5, ecosystem-01 §4]

**Load-bearing taste:** "a feature is not done when it ships, it is done when the flag is gone."
Attach a mandatory expiry + owner to every temporary flag at creation. → [[OPINIONS]] O10, O11.

**Defends against:** branching hell, the reused-bit catastrophe, owner-departure zombies.

---

## J7 — Autocapture vs explicit instrumentation (when each helps/hurts)

**The job.** Decide, per surface, whether to autocapture or hand-instrument. The "either-or" is a
false binary the whole industry abandoned by 2026; the winning architecture is **autocapture-for-
discovery + a named-event registry + a labeling layer** — NOT raw autocapture as a strategy. [field-05 §3]

**Sub-skills to master:**
- **The four objections (conceded by PostHog itself, the vendor that *builds* autocapture):**
  information overload, data-quality issues, time-investment-deferred-to-cleanup, security risk. Even
  the strongest advocate lands on **hybrid**: "Autocapture to get you started… but with manual
  instrumentation for the nitty gritty." [field-05 §1]
- **The three failure axes of autocapture:** **noise** (generic-name problem — a "click" on pricing
  and a "click" on a help link "look structurally identical until someone labels them"),
  **brittleness** (a CSS rename / page restructure "quietly break[s] the dashboards… with no error" —
  it couples your metrics to your DOM), **PII** (it's the #1 PII hiding place — J3). A tally harness
  must answer all three. [field-05 §2, §6]
- **The decision table** (when autocapture helps vs hurts): [field-05 §5]
  - Pre-PMF exploration → **helps** (retroactive analysis, zero setup)
  - Core funnels (activation/retention/conversion) → **hurts** (needs stable named events)
  - Forms/auth/payment/health → **hurts, dangerous** (PII)
  - High-volume billed-per-event apps → **hurts** (noise becomes a literal bill)
  - With a CI-gated registry + AI triage → **neutral-to-helps**
- **The 2026 shift that changes the cost-benefit (but not the hard problems):** AI can now do the
  retroactive labeling/triage (PostHog "Replay Vision" watches replays for you; Amplitude Opus-4.8
  "reads screenshots and graphs"). This *weakens* the noise objection — but does **not** fix
  brittleness or PII. [field-05 §4]

**Load-bearing taste (the one-liner):** "autocapture is a great prior and a terrible API contract."
Use it to discover; never let a funnel, retention curve, or experiment metric depend on an
autocaptured event. Promote anything that matters into a named, typed, CI-registered event the moment
it matters. → [[OPINIONS]] O12.

**Defends against:** noise tax, refactor-breaks-funnel, PII-by-default, per-event billing surprise.

---

## J8 — Agent-operator mechanics: surfaces, rate limits, migrations

**The job.** Operate all of the above *programmatically and autonomously* — the layer that makes tally
an agent, not a dashboard. Full surfaces → [[TOOL-MATRIX]]; this node is the *operating discipline*.

**Sub-skills to master:**
- **The agent surface inventory.** PostHog MCP (100+ tools across 8 categories: 21 flags, 24
  experiments, 13 query/HogQL, 15 dashboards, 17 error-tracking, 9 insights, 3 org, 1 docs-search) is
  the primary surface. flagd (POSIX CLI, OFREP on port 8016) is the fully-OSS local flag backend.
  OpenFeature CLI generates typed flag accessors. [ecosystem-02 §1–4]
- **The rate-limit operating rule (the single most important agent insight).** An autonomous loop that
  re-runs raw HogQL (`execute-sql`) hits **120/hour** and stalls. The correct pattern: **materialize
  the recurring query once via "Endpoints GA" → poll the materialized endpoint (12,000/hr sustained,
  10 concurrent) instead of re-running HogQL.** Capture (ingest) is effectively unmetered (uses the
  *project* key, not the personal key); **reads are the bottleneck.** "A rule of thumb for whether
  rate limits apply is if the personal API key is used for authentication." [ecosystem-02 §6] →
  [[OPINIONS]] O13. This mirrors the in-house "persist, don't recompute" discipline. [ecosystem-00 §B.5]
- **Prefer typed queries over hand-written SQL.** `query-funnel`/`query-retention`/`query-trends` are
  safer for an LLM than `execute-sql` (fewer hallucinated columns — cf. the property-mutation
  disaster). Use `execute-sql` as the escape hatch only. [ecosystem-02 §1b]
- **Migration discipline — "dual-write, reconcile, explain the delta, then cut over."** Every
  provider migration "loses" data: data-model mismatch (GA4 session→event is irreversible), defaults
  differ → counts drop (PostHog bot-filtering vs Amplitude), derived assets (cohorts/dashboards)
  **don't transfer**, dedup is **not** automatic (a paused-then-resumed PostHog migration silently
  doubles data), identity/first-touch must be re-mapped by hand, call-site lock-in (every
  LaunchDarkly SDK call ties you to the platform). [field-06 §1–5] → [[BATTLE-TESTED-SCENARIOS]] BTS-7–10.
- **The dead-repo / headless traps.** `PostHog/mcp` is **archived** (moved to monorepo `services/mcp`)
  — an agent following a pre-2026 README clones a dead repo. The wizard's `--ci` mode is **disabled in
  published builds** (LLM gateway won't grant scopes) — do NOT build an autonomous flow on
  `wizard --ci` today. [ecosystem-02 §1a, §2] → [[KNOWN-PITFALLS]] P9, P10.
- **Anti-lock-in posture.** Target **OpenFeature** as the flag call-site API from line one (vendor
  behind a provider); the Oct-2025 LaunchDarkly/AWS outage is the proof-cost (teams "couldn't update
  or create flags… because their release control tool itself was unavailable"). [field-06 §4]

**Load-bearing taste:** an agent operator's two cardinal rules — **materialize reads** (never loop raw
HogQL) and **own the raw event stream** (warehouse-first, so a future switch is a re-pipe, not a
funeral). → [[OPINIONS]] O13, O14.

**Defends against:** rate-limit stalls, migration data-loss, dead-repo loops, vendor lock-in.

---

## The recommended default stack (synthesis — see [[TOOL-MATRIX]] for full justification)

- **Backend default:** **PostHog** (self-host `posthog-foss` or cloud) — analytics + flags + replay +
  experiments + errors + warehouse, one stack, agent-operable via MCP. [ecosystem-05 §3]
- **App-side flag API:** **Vercel Flags SDK + `@flags-sdk/posthog`** (the fleet is Next.js 15 +
  Vercel) OR **OpenFeature** for non-Vercel surfaces (anti-lock-in). [ecosystem-05 §3]
- **Fully-OSS escape hatch:** **OpenFeature + flagd** (CLI-first, zero SaaS) for agent-autonomous flag
  loops. [ecosystem-05 §3]
- **Experiment rigor when needed:** **GrowthBook** bolt-on for the *specific* metric (its
  experimentation engine is more statistically serious than PostHog's) — via OpenFeature, don't
  rip-and-replace. [ecosystem-05 §1b]
- **Privacy web stats (optional):** **Plausible CE** (AGPL, self-host) — GA4 replacement, *not* a
  PostHog replacement. [ecosystem-03 §3]

**The four agent operating rules (memorize):** (1) materialize recurring queries — avoid the 120/hr
HogQL limit; (2) pass full props to local flag eval — avoid the #57183/#28453 correctness class; (3)
never reuse a flag key — Knight Capital; (4) use Bayesian or sequential for legal peeking. [ecosystem-05 §3]
