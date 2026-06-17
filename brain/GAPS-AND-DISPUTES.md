---
title: "tally — Gaps & Disputes (the unsettled, contested, unverified)"
type: synthesis
created: "2026-06-16"
updated: "2026-06-16"
tags: [gaps, disputes, unverified, open-questions, taste, product-analytics, feature-flags, tally]
domain: product-analytics-feature-flags
sources:
  - "raw/field-07-gaps-and-disputes.md"
  - "raw/field-04-experiment-phacking-peeking.md"
  - "raw/field-05-when-autocapture-hurts.md"
  - "raw/field-06-migration-war-stories.md"
  - "raw/ecosystem-01-versions-and-changelog-deltas.md"
  - "raw/ecosystem-02-agent-operator-clis-apis-mcps.md"
related: ["[[OPINIONS]]", "[[EXPERTISE-MAP]]", "[[KNOWN-PITFALLS]]", "[[TOOL-MATRIX]]"]
summary: "Where credible sources disagree (both sides), where no good source exists (tally must form its own view via experiments), and what could not be confirmed. The intellectual honesty layer."
---

# tally — Gaps & Disputes

> Three layers: **A.** genuine disagreements between credible sources (both sides, verbatim where
> possible) — tally must pick a default *and know it's a choice*; **B.** claims that are vendor-stated
> or second-hand and must not be treated as gospel; **C.** open design questions tally decides
> *deliberately*; **D.** true gaps where no good source exists — tally must form its own view by
> **experiment**. The "DECIDE-BY-EXPERIMENT" tag marks where tally should run its own probe rather
> than cite a source.

---

## A. DISPUTES — credible sources disagree (both sides)

### A1 ⚖️ Autocapture: "the future" vs "manual is the only reliable path"
- **Pro-autocapture (FullStory/Heap):** FullStory's blog is literally titled "Why autocapture is the
  future of Product Analytics" — argument: retroactive analysis answers questions you didn't
  pre-instrument. Heap built its whole identity on "capture everything, retroactively define."
- **Pro-manual (Amplitude, historically):** "manual instrumentation was the only path to reliable data."
- **Convergence (2026):** "the right strategy for most teams involves combining both approaches" +
  "pair automatic collection with a labeling layer."
- **Status:** RESOLVED toward hybrid — but the *weighting* (how much autocapture vs manual) is still
  team-specific and contested. **tally's default:** off for load-bearing metrics, opt-in for discovery
  ([[OPINIONS]] O12/O12b). [field-05 §3/§5, field-07 §A1]

### A2 ⚖️ Is industry A/B testing mostly p-hacking, or *more* trustworthy than academia?
- **Pessimist (Atticus Li):** classic fixed-horizon programs are ~30% artifact — "a quarter to a third
  of the 'winning' tests are statistical artifacts."
- **Optimist (Sean J. Taylor, ex-Lyft):** "The company A/B testing imperative (to guide decisions)
  might create a more reliable empirical 'literature' than the academic imperative (to publish papers)."
- **Status:** UNRESOLVED but reconcilable — *naive* programs are artifact-heavy; *well-run* ones
  (pre-reg + SRM + sequential) beat academia. The disagreement is about *which programs* you mean. "The
  fork is process, not the method." **This is exactly the gap a good harness closes** — tally's value
  proposition is making the well-run path the default. [field-04 §5 Dispute A, field-07 §A2]

### A3 ⚖️ Sequential/Bayesian vs fixed-horizon frequentist (the core stats fork)
- **Pro-sequential (GrowthBook, Statsig):** use sequential / mSPRT / Bayesian so "looking is allowed" —
  peeking-proof by construction.
- **Pro-fixed-horizon (classic, Kohavi-textbook lineage):** fixed-horizon NHST is *more powerful*
  (tighter intervals); the peeking problem is a *human-behavior* problem, not a math problem — solve it
  by hiding the decision until N is hit. Sequential "cost[s] power (wider intervals) for the privilege
  of peeking."
- **Status:** GENUINELY UNSETTLED tradeoff. **tally's default:** sequential/Bayesian *if the UI ever
  shows a live result* (it usually does → humans WILL peek, and field-04 §1 proves a long-enough look
  guarantees false significance); fixed-horizon only when the look is *truly* locked until N. [field-04
  §5 Dispute B, field-07 §A3, ecosystem-03 §1c]

### A4 ⚖️ Allocation: 50/50 vs ramped canary (1%→5%→50%)
- **Kohavi (textbook author):** default 50/50 — "the 10% logic is flawed"; 50/50 maximizes power per
  exposure.
- **SRE/rollout convention:** canary at 5–10% first, widen after metrics validate.
- **Status:** RESOLVABLE — they optimize *different things* (Kohavi = statistical power; canary = blast
  radius). **tally's resolution:** ramp for *safety*, then jump to 50/50 for *measurement*. Conflating
  them is the error. [field-04 §5 Dispute C, field-07 §A4]

### A5 ⚖️ Test interaction: real risk vs superstition
- **Vermeer (ex-Booking.com):** "Unplanned interactions are incredibly rare… the fear of interactions
  often prevents many teams from fully leveraging… overlapping tests at scale."
- **Kohavi:** agrees — "the concerns are overstated… Concurrent testing is essential to scale."
- **Common practice:** most orgs still serialize "to be safe."
- **Status:** expert-consensus (two textbook authorities) vs folk-wisdom, not source-vs-source. **tally
  sides with the experts:** parallelize ([[OPINIONS]] O9). [field-04 §4, field-07 §A5]

### A6 ⚖️ The "stats zoo" — many named tests vs "it's all regression"
- **Vermeer (7,949♥):** "Most stats 101 tests are simple linear models — including 'non-parametric'
  tests… we should only teach regression. Avoid confusing students with a zoo of named [tests]."
- **Conventional teaching:** t-test, Mann-Whitney, chi-squared, ANOVA as distinct tools.
- **Status:** pedagogical dispute with a real product implication — should tally expose **one
  regression layer** or a menu of named tests? **DECIDE-BY-EXPERIMENT:** Vermeer's high engagement +
  the simplicity-first principle lean toward one consistent modeling layer; tally should prototype both
  and see which produces fewer operator errors. [field-04 §4a, field-07 §A6]

---

## B. UNCONFIRMED / VENDOR-STATED claims (trust-but-verify ledger)

> Each is flagged where it occurs across the raw files; consolidated here. **Do not cite these as
> fact in tally's outputs** — cite them as "vendor-stated / directional."

| # | Claim | Why suspect | Use as |
|---|---|---|---|
| B1 | "25–40% of client-side traffic lost to ad blockers" | Vendor-stated; source itself says "directional, not gospel… not independently audited." Varies wildly — B2B-dev audiences far higher than consumer | "ad-blocker loss is real and audience-dependent," not a number |
| B2 | "81% of GA4 migrations fail" | From Upgrow, a GA4-migration *service* (incentivized to inflate) | "GA4 migrations commonly fail," directional |
| B3 | "SRM occurs in 6–10% of A/B tests" | Widely cited (Statsig/Microsoft) but broad range, unclear denominator | "common, not rare"; exact % soft |
| B4 | "a quarter-to-third of winning tests are artifacts" | Atticus Li's *modeling*, not a measured census | plausible mechanism, unmeasured magnitude |
| B5 | "Segment cost grows 65%/yr vs RudderStack 30%/yr" | 2022 CDP Institute report — old, CDP-vendor-adjacent; pricing changed since | directional, dated |
| B6 | PostHog `$rageclick`-on-datepicker bug | Second-hand: dev.to author paraphrases a GitHub issue "no direct link or username" | failure *shape* credible; specific incident unverified |
| B7 | Kohavi tweet dates ("2026-09-01", "2026-10-11") | Future-dated vs the 2026-06-16 capture — likely pinned/boosted older posts or feed artifacts | *content* trustworthy (matches his textbook); *dates* not |
| B8 | PostHog autocapture self-critique dated 2022-07-25 | Older than the <6-month bar | retained — maintainer's own canonical articulation, objections unchanged in 2026 |

**Pinning gap (ecosystem):** the researcher deliberately cited tool *lines* + dated deltas rather than
exact semver for PostHog server / GrowthBook / OpenFeature SDKs, because point versions go stale within
weeks. **tally must pin exact tags at build time** from the GitHub releases pages (cited in
[[TOOL-MATRIX]]). The PostHog `/query` rate limit is *actively being tuned* (open PR
`PostHog/posthog#28184`) — re-check before relying on the 120/hr HogQL number. [ecosystem-01 quick-ref note, ecosystem-02 §6]

---

## C. OPEN DESIGN QUESTIONS — tally decides deliberately (not by default)

These are the forks where the research says "it depends." Each lists tally's *likely* position and the
tradeoff being accepted.

1. **Frequentist+hidden-decision vs always-valid sequential.** If tally's UI ever shows a live result,
   it MUST be sequential/Bayesian (humans peek → guaranteed false significance). Fixed-horizon only if
   the look is truly locked. → likely **sequential by default.** [A3]
2. **Autocapture default on or off?** Off for funnels/auth/payments, on for exploration, behind a
   CI-gated registry. (PostHog ships it on; the field's hard-won taste says start off.) → **off,
   opt-in.** [A1]
3. **Where does the event registry live + is it CI-enforced?** 2026 consensus: "gated in CI rather than
   filed in a wiki." → **machine-readable schema that fails the build** on unregistered/mistyped events
   (the `processed-index.jsonl`/`TOPIC_KEYWORDS` pattern applied to events). [field-01/05]
4. **OpenFeature as the flag call-site API — yes/no?** The Oct-2025 LaunchDarkly outage is the
   proof-cost. → **yes**, vendor behind a provider — *but* only for evaluation portability (spec gaps
   on metrics/isolation/reactive — KNOWN-PITFALLS P26). [field-06 §4]
5. **Own the raw event stream (warehouse-first) or trust the vendor's store?** GA4 irreversibility
   argues own it; cost is more infra. → **own it** (migration insurance). [field-06 §1]
6. **Automated guardrails blocking or advisory?** SRM, peeking-lock, multiple-comparison, PII-scan. →
   **block** for the silent-failure class (warnings get ignored) — "harness as enforcer not linter."
   [field-02/04]
7. **Flag-debt prevention: TTL/expiry enforced or cultural?** → **mandatory expiry + owner at
   creation**, surface/auto-PR removals. [field-03]

---

## D. TRUE GAPS — no good source exists → tally must form its own view (DECIDE-BY-EXPERIMENT)

These are where the research came up empty. tally cannot cite an authority; it must **run a probe and
record the result** (the "if it is recorded, it happened to the AI" discipline).

### D1 — No named, recent, first-party *analytics* (not flag) postmortem
The one named/dated/company-attributed disaster in the whole corpus is **Knight Capital — a *flag*
story from 2012.** There is **no** Cloudflare-style "here's exactly how our *event pipeline* broke"
writeup for an analytics failure in this pass. → **DECIDE-BY-EXPERIMENT:** tally's own production
incidents become the missing corpus. Every real analytics break tally hits (a fractured identity graph,
a count-drift panic, an SRM-failed experiment) should be written up as a first-party postmortem in
`brain/` — tally generates the literature that doesn't exist. [field-07 §B "things I could not confirm"]

### D2 — No defensible dollar/hour figure for flag-debt cost
Everyone agrees flag debt is expensive ("gradual and distributed"); nobody puts a defensible number on
the non-catastrophic case the way Knight Capital quantifies the tail. Closest concrete metric: "80% of
flag removals touch >1 file" (digitalapplied). → **DECIDE-BY-EXPERIMENT:** tally should *measure* its
own flag-debt cost — track time-to-remove, files-touched-per-removal, and stale-flag-count vs
deploy-frequency on real repos, and publish the number the field lacks. [field-07 §B]

### D3 — No independent (non-vendor) measurement of post-migration count drift
The PostHog "bot-filtering → lower counts" gotcha is maintainer-stated and credible, but there's **no
neutral third-party benchmark** quantifying typical drift %. → **DECIDE-BY-EXPERIMENT:** when tally
runs a real migration, it should reconcile source-vs-dest and **record the measured drift + its
attribution** — building the neutral benchmark that doesn't exist. [field-07 §B]

### D4 — No first-party MCP for the non-PostHog vendors (confirm before relying)
The research found **no prominent first-party MCP** for LaunchDarkly, GrowthBook, Amplitude, or
Mixpanel (Amplitude has *internal* "AI Agents," not an MCP you operate). This was flagged "verify in
GAPS." → **DECIDE-BY-EXPERIMENT / VERIFY:** before tally commits to operating any non-PostHog vendor
agentically, confirm the current MCP/CLI surface (it may have shipped since 2026-06-16). PostHog remains
the only confirmed full agent surface. [ecosystem-02 §5, §1]

### D5 — The "stats zoo vs one regression layer" product decision (A6, restated as a build probe)
Vermeer argues one regression layer; convention says a menu. tally's *operator-error rate* is the real
arbiter. → **DECIDE-BY-EXPERIMENT:** prototype both an "expose one modeling layer" and a "menu of named
tests" path and measure which yields fewer wrong calls in eval. [A6]

---

## E. What changed in 2026 that invalidates 2025 wisdom (currency — affects every dispute above)

- **Agent-native analytics is now the incumbents' *direction*, not a thesis.** Amplitude shipped
  Global/Specialized Agents + MCP + Opus 4.8; Statsig shipped a code-knowledge-graph "for teams and AI
  agents"; PostHog shipped Replay Vision + org-wide skills. This **validates tally's existence AND
  raises the stakes on guardrails** — "an agent will happily ship a peeked winner unless the harness
  blocks it." [field-07 §D, field-04 §6, field-05 §4]
- **OpenFeature went from "nice abstraction" to "the standard,"** forced by the Oct-2025
  LaunchDarkly/AWS outage; Vercel Flags SDK shipped a native OpenFeature adapter. [field-07 §D, field-06 §4]
- **"Gate the taxonomy in CI, not a wiki" is the 2026 reframing** of tracking-plan governance — the
  doc-in-Notion era is over. [field-07 §D, field-01/05]
- **Statsig continuity whiplash** (OpenAI acquired it $1.1B Sep-2025 → Amplitude took the brand/
  platform/customers May-2026, builders stayed at OpenAI) is the textbook *vendor-continuity-risk*
  argument and the concrete reason OpenFeature exists. Do NOT recommend net-new Statsig standardization
  without an OpenFeature wrapper. [ecosystem-01 §0.1]

---

## F. How tally should treat this file operationally

1. **Never present a B-ledger number as fact.** Say "vendor-stated / directional."
2. **On a C-question, state the default AND the tradeoff** — never silently pick a side (Karpathy
   "Think Before Coding": if multiple readings exist, present them).
3. **On a D-gap, run the probe and record it** — tally is the harness that *generates* the missing
   literature, not one that waits for it. Write first-party postmortems into `brain/`.
4. **Re-check the version-sensitive items** (rate limits, SDK semver, vendor MCP availability) at build
   time — this domain moves fast; the ecosystem researcher deliberately avoided pinning point versions
   for that reason.
