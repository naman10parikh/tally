---
title: "Ecosystem — Experimentation stats, privacy-first analytics, GA4, funnels/retention/cohorts"
type: source
created: "2026-06-16"
updated: "2026-06-16"
tags: [ab-testing, sequential, cuped, bayesian, frequentist, ga4, plausible, fathom, retention, cohort, funnel, tally]
domain: product-analytics-feature-flags
researcher: ECOSYSTEM (CP123 Wave-R)
summary: "The statistics an experiment agent must not get wrong (peeking, CUPED, sequential, Bayesian-vs-frequentist), GA4's 2026 traps, the privacy-first field (Plausible AGPL vs Fathom closed), and the bounded/unbounded retention gotcha."
related: ["[[ecosystem-02-agent-operator-clis-apis-mcps]]", "[[field-01-event-taxonomy-disasters]]"]
---

# Experimentation statistics, privacy analytics, GA4, funnels/retention/cohorts

> An agent that ships experiment winners or reads retention curves WILL produce wrong
> decisions if it gets these four things wrong. Each section = the trap + the fix + the taste.

---

## 1. A/B experimentation statistics — the traps an agent must encode

### 1a. The peeking problem (the #1 false-positive source)
- **The math (verbatim):** "Checking results 20 times instead of once can inflate your false positive rate from 5% to potentially **40% or higher**." Repeated interim looks implicitly create multiple-hypothesis testing → family-wise error rate explodes.
  - <https://www.statsig.com/perspectives/sequential-testing-ab-peek> · 2026
  - <https://www.mida.so/blog/what-is-peeking-ab-testing> · 2026
- **The fix:** **sequential testing** — the *frequentist* solution to peeking. "Allows you to look at your experiment results as many times as you like while still keeping the number of false positives below the expected rate," adjusting the math on the fly.
  - same statsig source · 2026
- **⚠️ The asymmetry an agent must encode (taste, verbatim):** "Sequential testing is fantastic for **spotting losers early**, but it's **not meant for declaring winners ahead of schedule** — using it to crown champions too soon risks falling for false positives."
  - same · 2026. **→ tally rule: an autonomous experiment agent may STOP a loser early on a sequential boundary, but must NOT ship a winner before the pre-registered sample size unless using a proper always-valid method.**

### 1b. CUPED — the variance-reduction tool that can BACKFIRE
- **What it is:** CUPED (Controlled-experiment Using Pre-Experiment Data) uses pre-experiment data to reduce noise → reach significance faster.
- **⚠️ The gotcha (verbatim):** "CUPED only shines when your users come back again and again like on streaming platforms, but **if you have an e-commerce site, CUPED can actually steer you wrong, leading to misleading results.**"
  - <https://www.abtasty.com/blog/best-statistical-model-for-ab-testing/> · 2026
- **→ tally rule:** only apply CUPED when there's a strong pre-period covariate (returning users / repeat usage). On low-repeat / one-shot-conversion products it adds bias, not power. Don't blindly enable it.

### 1c. Bayesian vs Frequentist — what each forbids (PostHog-specific)
Source: PostHog docs · read 2026-06-16:
- <https://posthog.com/docs/experiments/statistics> (Bayesian) · <https://posthog.com/docs/experiments/frequentist-method>
- **Bayesian (PostHog default):** quantifies **win probability + credible intervals**; lets you "**check results at any time without statistical penalties**" (no peeking penalty by construction).
- **Frequentist:** asks "if there were no real difference, how likely is a result like this?"; **requires predefined sample size** and "prevents you from updating probabilities as new data arrives." PostHog's **Frequentist mode includes sequential-testing options**.
  - <https://posthog.com/docs/experiments/experiment-significance> · 2026
- **Taste:** for an AGENT operator, **Bayesian is the safer default** precisely because it has no peeking penalty — the agent can poll `experiment-results-get` / `experiment-stats` (see ecosystem-02 §1b) on every loop without inflating error. If the org mandates frequentist, the agent MUST switch to sequential to legally peek. GrowthBook's sequential docs are the best OSS reference: <https://docs.growthbook.io/statistics/sequential> · 2026.

### 1d. Funnel-metric statistics
- PostHog publishes a distinct methodology for **funnel** metrics (proportion/ratio metrics need different treatment than continuous means): <https://posthog.com/docs/experiments/funnels-statistics> · 2026. tally should not apply a means-based test to a conversion-rate metric.

---

## 2. Funnels, retention, cohorts — the definition traps

### 2a. Bounded vs unbounded retention (the stability trap)
- **Bounded ("Day-7 exactly"):** counts a user only if they return *on* the specified day. More undulating curve.
- **Unbounded ("Day-7 or later"):** counts return *on or after* the day. Smoother curve.
- **⚠️ The gotcha (verbatim):** "Generally bounded retention is preferred, because **unbounded can constantly change as new days of data arrive**" — i.e. **unbounded retention metrics are NOT stable over time** as the dataset grows.
  - <https://medium.com/permutable-analytics/...d500a77eae04> (Permutable Analytics, Amplitude D1/D7/D30) · 2026
- **→ tally rule:** for a metric an agent tracks across loops, use **bounded** (N-day) retention so yesterday's number doesn't silently change today. For SaaS, tie the window to trial/subscription length.
  - Lenny's primer (canonical practitioner ref): <https://www.lennysnewsletter.com/p/measuring-cohort-retention> · (older but still the standard — flagged as pre-2026 but foundational).

### 2b. Cohort definition
- A **cohort** = users who performed a specific action *for the first time* in the same period ("signed up last week"). Static (identity allow-list — cf. ecosystem-00 §B.4 LUMINARIES) vs dynamic (behavioral threshold — cf. ecosystem-00 §B.3 tiering). PostHog supports both; behavioral cohorts re-evaluate as events arrive.
  - <https://mixpanel.com/blog/retention-analytics-primer/> · 2026
- **Taste:** the in-house x-content-intel `score.py` already implements both cohort types (static LUMINARIES set + dynamic tier thresholds). tally should expose this duality as a skill.

### 2c. Conversion window on funnels
- A funnel needs an explicit **conversion window** (e.g. "completed checkout within 24h of add-to-cart"). Omitting it → the funnel silently counts conversions that happened weeks later, inflating the rate. The window is part of the funnel *definition*, not an afterthought.

---

## 3. Privacy-first analytics — Plausible vs Fathom (the cookieless field)

> Distinct from product analytics: these are **web/marketing analytics** (pageviews, referrers,
> sources) — NOT in-app event/funnel analytics. They're the GA4 replacement, not the PostHog replacement.

| | Plausible | Fathom |
|---|---|---|
| License | **AGPL — self-hostable Community Edition (free)** | **Closed-source, cloud-only, NO self-host** |
| Entry price | $9/mo (10k pageviews) → $19/mo (100k pv, 50 sites) | $15/mo (100k pv, unlimited sites) |
| Data retention | 2 years | **3 years** |
| Compliance | GDPR by design, EU-hosted, no consent banner | SOC 2 Type II, HIPAA, EU isolation by default, no consent banner |
| Funnels/UTM | Basic | **Nicer goal funnels + UTM attribution** (closer to GA4) |
| Setup | 1 script, ~4 min | 1 script, ~4 min |

- Source: <https://dev.to/alanwest/google-analytics-alternatives-umami-vs-plausible-vs-fathom-in-2026-280i> · 2026
- Source: <https://vucense.com/.../privacy-analytics-alternatives-ga4-plausible-fathom-matomo-2026/> · 2026
- **Also in field:** **Umami** (OSS, MIT-ish, self-host), **Matomo** (OSS, heaviest/most GA-like).
- **Taste for the fleet:** if the requirement is "privacy-first web stats we can self-host with zero SaaS," **Plausible CE (AGPL)** is the pick — it matches the fleet's OSS-first posture. Fathom is the better *managed* choice (compliance certs + funnels) but you can never self-host it, which is a hard no for the "agent earns its own compute / owns its stack" thesis. For *product* analytics (events/funnels/flags) you still want PostHog — privacy tools don't replace it.
  - Solopreneur-stack take (PostHog vs Plausible vs Fathom): <https://f3fundit.com/the-solopreneur-analytics-stack-2026...> · 2026

---

## 4. GA4 — the 2026 state + the traps (why the fleet should NOT default to it)

Source: <https://practicetestgeeks.com/google/google-analytics-updates> · 2026-06; SearchEngineLand retention update; Medium "Doing GA4 in 2026" (2026-01).

### 4a. 2026 changes
- **Cross-channel data-driven attribution is now the DEFAULT** model (Google deprecated last-click defaults).
- **Data retention got two new options: 14 months and 38 months** (replacing the old binary 2/14-month choice).
  - <https://searchengineland.com/google-analytics-explorations-data-retention-update-435560>
- **Consent Mode v2 is MANDATORY for EEA traffic** — non-compliant properties **lose access to audience-based features**.

### 4b. ⚠️ The traps an agent/operator must know
- **Event-level retention auto-collapses to 2 MONTHS** if a property exceeds **25 billion billable events / 31 days (standard)** or **250 billion (360)**. A high-traffic product silently loses granular history → can't backfill cohorts. This is a real, under-publicized landmine.
  - <https://practicetestgeeks.com/google/google-analytics-updates> · 2026-06
- **UA is fully dead:** UA stopped processing hits **July 1, 2023** (360: Oct 1, 2023); historical data read-only by **Jan 1, 2024**; access sunset by **July 2024**. No path back to UA-style sessions.
- **UI limitations / sampling** remain a perennial complaint vs product-analytics tools.
  - <https://supermetrics.com/blog/ga4-ui-limitations>

### 4c. Taste
GA4 is *free web analytics with Google's reach + Looker/BigQuery export* — fine as a marketing-attribution layer. But: sampling, the 2-month retention collapse at scale, mandatory consent-mode, and no self-host make it the WRONG default for a privacy-first, product-event, agent-operated stack. The fleet's correct posture: **PostHog for product events/funnels/flags; optionally Plausible CE for privacy-first web stats; GA4 only if a marketing team specifically needs Google Ads attribution.** Do not pipe product events into GA4.

---

## 5. Cross-references
- Event-taxonomy rot that breaks all of the above → `field-01-event-taxonomy-disasters.md` (sibling researcher).
- The in-house weighted-event + tiering precedent → `ecosystem-00-internal-references.md` §B.
- The agent's actual API tools to RUN these analyses → `ecosystem-02` §1b (`query-funnel`, `query-retention`, `experiment-stats`).
