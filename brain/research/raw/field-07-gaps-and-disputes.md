---
title: "Field Intel — GAPS & DISPUTES (what's unsettled, contested, or unverified)"
type: source
created: "2026-06-16"
updated: "2026-06-16"
tags: [gaps, disputes, contested, taste, product-analytics, feature-flags, experimentation, field-intelligence, tally]
domain: product-analytics-feature-flags
researcher: FIELD-INTELLIGENCE (CP123 Wave-R)
summary: "The synthesis file: where credible sources disagree (both sides verbatim), which numbers are vendor-stated and unverified, and the open design questions tally must decide deliberately."
sources: ["raw/field-07-gaps-and-disputes.md"]
related: ["[[field-01-event-taxonomy-disasters]]", "[[field-02-pii-in-analytics-leaks]]", "[[field-03-flag-debt-and-dead-code]]", "[[field-04-experiment-phacking-peeking]]", "[[field-05-when-autocapture-hurts]]", "[[field-06-migration-war-stories]]"]
---

# GAPS & DISPUTES — Product Analytics + Feature Flags

> This is the synthesis file the FIELD-INTELLIGENCE mission feeds into. Three sections:
> **A.** Genuine disagreements between credible sources (both sides quoted verbatim).
> **B.** Claims I could NOT independently confirm (vendor-stated numbers, second-hand reports).
> **C.** Open design questions tally must decide *deliberately* (not by default).

---

## A. DISPUTES — where credible sources disagree (both sides verbatim)

### A1. Autocapture: "the future" vs "the only path is manual"
- **Pro-autocapture (FullStory/Heap):** FullStory's blog is titled *"Why autocapture is the future of Product Analytics"* — argument is retroactive analysis (answer questions you didn't pre-instrument). <https://www.fullstory.com/blog/autocapture-is-the-future-of-product-analytics/>
- **Pro-manual (Amplitude, historically):** *"others, including Amplitude, argued that manual instrumentation was the only path to reliable data."* <https://amplitude.com/explore/data/autocapture-vs-manual-tracking>
- **The convergence (2026):** *"the right strategy for most teams involves combining both approaches"* + *"pair automatic collection with a labeling layer."* (Mixpanel, 2026.)
- **Status:** RESOLVED toward hybrid by 2026, but the *weighting* (how much autocapture vs how much manual) is still team-specific and contested. See field-05 §3, §5.

### A2. Is industry A/B testing mostly p-hacking, or more trustworthy than academia?
- **Pessimist (Atticus Li):** classic fixed-horizon programs are ~30% artifact — *"a quarter to a third of the 'winning' tests are statistical artifacts."* <https://atticusli.com/replication-crisis/ab-testing-peeking-problem/>
- **Optimist (Sean J. Taylor, ex-Lyft):** *"The company A/B testing imperative (to guide decisions) might create a more reliable empirical 'literature' than the academic imperative (to publish papers)."* <https://x.com/SeanjTaylor> (2026-06-16)
- **Status:** UNRESOLVED but reconcilable — naive programs are artifact-heavy; well-run ones (pre-reg + SRM + sequential) beat academia. The disagreement is really about *which* programs you're talking about. See field-04 §5 Dispute A.

### A3. Sequential/Bayesian vs fixed-horizon frequentist
- **Pro-sequential (GrowthBook, Statsig):** use *"Sequential testing"* / mSPRT / Bayesian so *looking is allowed* — peeking-proof by construction. <https://docs.growthbook.io/using/experimentation-problems>
- **Pro-fixed-horizon (classic, Kohavi-textbook lineage):** fixed-horizon NHST is more *powerful* (tighter intervals); the peeking problem is a *human-behavior* problem, not a math problem — solve it by hiding the decision until N is hit.
- **Status:** GENUINELY UNSETTLED tradeoff. Sequential trades power for safe-peeking. The right answer depends on whether your UI lets humans look (it usually does → sequential wins in practice). See field-04 §5 Dispute B.

### A4. Allocation: 50/50 vs ramped canary (1%→5%→50%)
- **Kohavi (textbook author):** *"Why you should default to running #ABTests at 50/50?... [the 10% logic is flawed]."* 50/50 maximizes power per exposure. <https://x.com/ronnyk> (2026-06-16)
- **SRE/rollout convention:** canary at *"5–10%"* first, widen after metrics validate (field-03 rollout playbook). <https://www.digitalapplied.com/blog/feature-flag-rollout-strategies-2026-engineering-playbook>
- **Status:** Resolvable — they optimize different things (Kohavi=statistical power; canary=blast radius). Ramp for *safety*, then jump to 50/50 for *measurement*. Conflating them is the error. See field-04 §5 Dispute C.

### A5. Test interaction: real risk vs superstition
- **Vermeer (ex-Booking.com):** *"Unplanned interactions are incredibly rare... the fear of interactions often prevents many teams from fully leveraging... overlapping tests at scale."* <https://x.com/lukasvermeer> (2026-04-15)
- **Kohavi:** agrees — *"the concerns are overstated... Concurrent testing is essential to scale."* <https://x.com/ronnyk>
- **The cautious-default crowd:** most orgs still serialize tests "to be safe."
- **Status:** Two textbook-level authorities say the fear is mostly superstition; common practice disagrees with them. This is expert-consensus-vs-folk-wisdom, not source-vs-source. See field-04 §4.

### A6. The "stats zoo" — many named tests vs "it's all regression"
- **Vermeer:** *"Most stats 101 tests are simple linear models — including 'non-parametric' tests... we should only teach regression. Avoid confusing students with a zoo of named [tests]."* (7,949♥) <https://x.com/lukasvermeer> (2026-03-27)
- **Conventional teaching:** t-test, Mann-Whitney, chi-squared, ANOVA as distinct tools.
- **Status:** Pedagogical dispute with real product implications — should tally expose one regression layer or a menu of named tests? Vermeer's high engagement suggests the field is moving his way.

---

## B. UNCONFIRMED / VENDOR-STATED claims (do NOT treat as gospel)

These appear across field-01..06. Each is flagged where it occurs; consolidated here as the "trust but
verify" ledger.

1. **"25–40% of client-side traffic affected by ad blockers."** Vendor-stated; the source itself warns *"treat that range as directional, not gospel — it is vendor-stated and not independently audited."* (digitalapplied, 2026-06-10). **The true ad-blocker loss rate is genuinely disputed and varies wildly by audience (B2B-dev audiences are far higher than mainstream consumer).** → field-01 §5.
2. **"81% of GA4 migrations fail."** Vendor-stated (Upgrow, a GA4 migration *service* — incentivized to inflate). Directional only. <https://www.upgrow.io/blog/ga4-migration-service> → field-06 §1.
3. **"SRM occurs in 6–10% of A/B tests."** Widely cited (Statsig/Microsoft) but the range is broad and the denominator (which tests, which orgs) is unclear. Trustworthy as "common, not rare"; the exact % is soft. → field-04 §3.
4. **"a quarter to a third of 'winning' tests are statistical artifacts."** An estimate from Atticus Li's modeling, not a measured industry census. Plausible mechanism, unmeasured magnitude. → field-04 §1.
5. **Segment cost growth "65%/yr vs RudderStack 30%/yr."** From a **2022** CDP Institute report — old, and CDP-vendor-adjacent. Pricing has changed since. → field-06 §3.
6. **PostHog `$rageclick`-on-datepicker bug.** Second-hand: the dev.to author *paraphrases a GitHub issue* with *"no direct link or username."* The failure shape is credible and matches PostHog's reactive "drop events" design, but the specific incident is unverified. → field-05 §2.
7. **Ronny Kohavi tweet dates (e.g. "2026-09-01", "2026-10-11").** These appear future-dated relative to the 2026-06-16 capture — likely pinned/boosted older posts surfacing in the timeline, or feed-ordering artifacts. The *content* is consistent with his published textbook positions, so the claims are trustworthy; the *exact dates* are not reliable. → field-04 §4b.
8. **PostHog autocapture self-critique is dated 2022-07-25.** Older than the < 6-month bar. Retained because it is the *maintainer's own* canonical articulation and the objections are unchanged in 2026 — flagged historical-but-load-bearing. → field-05 §1.

### Things I could NOT confirm at all (true gaps — needs a human or deeper dig):
- **A first-party, named, recent (2025-2026) engineering postmortem** with a company name attached for an *analytics* (not flag) disaster. Most analytics-failure material is vendor blogs + practitioner essays, not "Acme Corp's incident report." The Knight Capital postmortem (field-03) is the one named, dated, company-attributed disaster — but it's a *flag* story from 2012, not analytics. **Gap: a Cloudflare-style "here's exactly how our event pipeline broke" writeup in this vertical was not found in this pass.**
- **Hard numbers on flag-debt cost.** Everyone agrees flag debt is expensive ("gradual and distributed"); nobody I found puts a defensible dollar/hour figure on it the way Knight Capital quantifies the catastrophic tail. The "80% of flag removals touch >1 file" stat (digitalapplied) is the closest concrete metric. → field-03.
- **Independent (non-vendor) measurement of post-migration count drift.** The PostHog "bot-filtering → lower counts" gotcha is maintainer-stated and credible, but I found no neutral third-party benchmark quantifying typical drift % across a real migration.

---

## C. OPEN DESIGN QUESTIONS for tally (decide deliberately, not by default)

These are the forks where the research says "it depends" — tally must pick a position and document why.

1. **Frequentist+hidden-decision vs always-valid sequential.** If tally's UI ever shows a live result, it MUST be sequential/Bayesian (humans WILL peek — field-04 §1 proves a long-enough look guarantees false significance). Only choose fixed-horizon if the decision is *truly* locked until N. → likely: **sequential by default.**
2. **Autocapture default: on or off?** field-05 §5 decision table says off for funnels/auth/payments, on for exploration. tally's safest default = **off, with autocapture as an opt-in discovery mode** + a CI-gated named-event registry. (PostHog ships it on; the field's hard-won taste says start off.)
3. **Where does the event registry live + is it CI-enforced?** The 2026 consensus: *"taxonomies need to be gated in CI rather than filed in a wiki"* (field-01/05). Decision: tally should ship a **machine-readable event schema that fails the build** on unregistered/mistyped events — the `processed-index.jsonl`/`TOPIC_KEYWORDS` pattern from energy's score.py, applied to events.
4. **OpenFeature as the flag call-site API — yes/no?** field-06 §4 + field-03 argue strongly **yes** (the Oct-2025 LaunchDarkly outage is the proof-cost). Decision likely settled: target OpenFeature, vendor behind a provider.
5. **Own the raw event stream (warehouse-first) or trust the vendor's store?** field-06 §1 (GA4 irreversibility) argues **own it**. The cost is more infra; the benefit is migration insurance + no data bereavement. Deliberate tradeoff.
6. **Automated guardrails as blocking or advisory?** SRM check, peeking-lock, multiple-comparison correction, PII scan — should these *block* (refuse to report a winner / fail CI) or merely *warn*? field-02/04 taste says **block** for the silent-failure class (SRM, identity-stitch, PII-in-replay) because warnings get ignored. This is the core "harness as enforcer not linter" decision.
7. **Flag-debt prevention: TTL/expiry enforced or cultural?** field-03 says flags rot without forced cleanup; the maintainer norm is "archive quarterly, 90–120 day TTL." Decision: tally should **attach a mandatory expiry/owner to every flag at creation** and surface/auto-PR removals — "a feature is not done when it ships, it is done when the flag is gone."

---

## D. The 2026 currency note (what invalidated 2025 wisdom — consolidated)

- **Agent-native analytics is now the incumbents' direction, not a thesis.** Amplitude shipped Global/Specialized Agents + MCP + Opus 4.8; Statsig shipped a code-knowledge-graph "for teams and AI agents"; PostHog shipped Replay Vision (AI watches replays for you) + org-wide skills in workflows. (All captured live via X, 2026-06-16.) → This *validates* tally's existence AND raises the stakes on the guardrails (an agent will happily ship a peeked winner unless the harness blocks it). → field-04 §6, field-05 §4.
- **OpenFeature went from "nice abstraction" to "the standard," forced by the Oct-2025 LaunchDarkly/AWS outage.** Vercel Flags SDK shipped a native OpenFeature adapter (Mar 2025). → field-06 §4.
- **"Gate the taxonomy in CI, not a wiki" is the 2026 reframing** of tracking-plan governance — the doc-in-Notion era is over. → field-01/05.

---

## E. Cross-reference to internal corpus
- `energy/audit/HARNESS-CHECKLIST-2026.md` line 322 (tally = PostHog default; **GAP** in fleet). Every dispute here maps to a config tally's harness must expose.
- `energy/scripts/x-content-intel/score.py` — the live X session used to capture §A practitioner taste (Vermeer/Kohavi/Taylor) and §D currency (Amplitude/Statsig/PostHog) ran through this exact pattern. Read-only ref: `~/energy/scripts/x-content-intel/score.py`.
- All six sibling field files (01-06) are the evidence base; this file is the adjudication layer.
