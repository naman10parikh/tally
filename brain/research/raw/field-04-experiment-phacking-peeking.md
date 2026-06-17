---
title: "Field Intel — Experiment P-Hacking & Peeking (how A/B tests lie to you)"
type: source
created: "2026-06-16"
updated: "2026-06-16"
tags: [experimentation, ab-testing, peeking, p-hacking, srm, sample-ratio-mismatch, statsig, growthbook, optimizely, field-intelligence, tally]
domain: product-analytics-feature-flags
researcher: FIELD-INTELLIGENCE (CP123 Wave-R)
summary: "The statistical failure modes that make 'winning' experiments fake — peeking, multiple comparisons, SRM, Simpson's paradox — with exact false-positive numbers and contrarian expert taste."
sources: ["raw/field-04-experiment-phacking-peeking.md"]
related: ["[[field-01-event-taxonomy-disasters]]", "[[field-03-flag-debt-and-dead-code]]", "[[field-05-when-autocapture-hurts]]"]
---

# Experiment P-Hacking & Peeking — What Practitioners Learned the Hard Way

> Scope: the statistical mistakes that turn A/B-test results into noise dressed as signal. The single
> most common is **peeking** (stopping a test the moment it crosses p<0.05). The single most under-run
> integrity check is **SRM** (sample ratio mismatch). **Currency bar:** prefer < 6 months; the Atticus
> Li peeking essays and GrowthBook docs are 2025-2026; the canonical textbook (Kohavi et al.) is 2020
> but is THE reference and flagged historical-but-load-bearing.

---

## 1. The Peeking Problem — exact false-positive inflation numbers

This is the headline failure. The mechanism: every time you check a running test and decide whether to
stop, you perform another statistical comparison. The nominal 5% false-positive rate is per-look, not
per-experiment. Repeated looks compound it.

**The exact numbers (quote these — they are concrete and source-attributed):**
- *"Every additional peek inflates the false-positive rate above the nominal 5%."*
- *"Check the data every 500 visitors: about 26% false-positive rate under the null."*
- *"Check every 1,000 visitors: about 20% false-positive rate under the null."*
- *"Continuous monitoring of a fixed-horizon test pushes it past 30%."*
- *"false-positive rate climbs toward 40%+ over realistic test durations."*
  - Source: Atticus Li — *The Peeking Problem in A/B Testing: The Statistical Mistake That Inflates Your False-Positive Rate To 40%+* — <https://atticusli.com/replication-crisis/ab-testing-peeking-problem/> (read 2026-06-16)

**The killer limit-case (the most quotable line in the whole topic):**
- *"In the limit of continuous monitoring... the probability that the cumulative test statistic ever crosses the p = 0.05 threshold under the null is not 5%. It is 100%."*
  - Same source. **If you watch a dashboard long enough, a pure-noise A/A test WILL eventually show "significance." Guaranteed.**

**The statistical framing (why it's not just "more samples = better"):**
- *"You are computing a sequence of test statistics over time, and you are stopping the experiment whenever any of them happens to cross the rejection threshold."*
- *"The relevant probability is no longer 'what is the chance that a single test statistic falls in the tails?' It is 'what is the chance that the maximum of a sequence of correlated test statistics falls in the tails?'"*
  - Same source, 2026.

**The industry-wide impact estimate (cite as a claim, see GAPS — it's an estimate):**
- *"for any experimentation program still running on classical fixed-horizon NHST... a quarter to a third of the 'winning' tests are statistical artifacts."*
  - Same source. **Author's verdict: "the peeking problem is the most common statistical mistake in industry A/B testing."**

**The concrete org failure scenario (this is the real-world shape of the bug):**
> A PM launches a test Monday. By Wednesday the dashboard shows a significant p-value. The PM screenshots
> it, declares the variant a winner, ships it. *"Three weeks later, someone notices that the conversion
> metric did not actually improve."* Root cause: *"Early data is noisy. Small samples jump around... by
> stopping early, you're locking in that variance as your conclusion."*
> - Source: Atticus Li peeking essays + GrowthBook *Where Experimentation goes wrong* (below).

> TASTE for tally: a feature-flag/experiment harness MUST make peeking structurally impossible, not
> merely discouraged. Options: (a) hide the p-value/decision button until the pre-registered sample size
> is hit, OR (b) switch the math to **sequential testing** (always-valid p-values / mSPRT) or **Bayesian**
> so that looking *is* allowed. The wrong design is a frequentist dashboard with a live "ship it" button.

---

## 2. The full taxonomy of "where experimentation goes wrong" (GrowthBook, verbatim)

GrowthBook's docs enumerate the named failure modes. Vendor docs, but unusually complete and named —
useful as a checklist. All quotes from GrowthBook — *Where Experimentation goes wrong* —
<https://docs.growthbook.io/using/experimentation-problems> (read 2026-06-16):

1. **Multiple Testing Problem** — *"statistical hypothesis testing is performed on multiple variables simultaneously, leading to an increased likelihood of incorrectly rejecting a true null hypothesis."* Fix: *"Bonferroni correction, False Discovery Rate (FDR) correction, or the Benjamini-Hochberg procedure."*
2. **Texas Sharpshooter Fallacy** — *"cherry-picking data clusters to suit a particular argument"* / *"finding apparent patterns or correlations in data purely by chance."* This is segment-fishing: slice 20 segments, one will be "significant."
3. **P-Hacking** — *"manipulating or analyzing data in various ways until a statistically significant result is achieved."*
4. **Peeking** — *"making decisions about the results of an experiment based on early data"* increases *"false positive rates."* Fix: *"use a predetermined sample size or duration"* without changes, or *"Sequential testing"* or *"Bayesian with custom priors."*
5. **Simpson's Paradox** — *"a trend or pattern appears in different groups but disappears when groups are combined."* Fix: *"analyze the data by considering all relevant variables and subgroups."*
6. **Goodhart's Law** — *"when a measure becomes a target, it ceases to be a good measure."* Fix: *"a variety of metrics"* / real KPIs not proxies.
7. **Twyman's Law** — *"Any data or figure that looks interesting or different is usually wrong."* (i.e., a too-good result is more likely a bug than a win.)
8. **Trustworthiness / A/A tests** — *"Running A/A tests can help build trust that the platform is working correctly."*
9. **HiPPOs** — *"Highest paid person's opinion"* are *"no more likely to be right than anyone else's."*
10. **Confirmation bias / Semmelweis effect** — favoring data that confirms priors; *"rejecting new evidence... that challenges established beliefs."*

> TASTE for tally: items 2, 3, and the segment-fishing flavor of 1 are the same bug — **post-hoc
> hypotheses**. The structural fix is a pre-registered hypothesis + metric + segment list captured
> *before* data exists. An agent-native experiment harness should write that contract to disk at
> experiment-create time (mirrors the pre-registration norm in `feedback_live_interview_*` and the
> eval-before-code pattern in tally's own eval/).

---

## 3. Sample Ratio Mismatch (SRM) — the integrity check almost nobody runs

If peeking is the most common mistake, **SRM is the most under-used safeguard.** It answers a prior
question: "is this experiment even valid to read at all?"

- **Definition:** *"When traffic split consistency breaks in an experiment, you have a Sample Ratio Mismatch (SRM)... the observed traffic split in an A/B test deviates significantly from the intended allocation."* You asked for 50/50 and got 52/48 with large N → randomization is broken.
- **Why it's decisive (quote this):** *"SRM doesn't just suggest a problem — it proves one. When detected, the experiment's results are invalid. Whether you're using Frequentist or Bayesian methods, randomization is non-negotiable."*
- **Prevalence:** *"SRM occurs in an estimated 6–10% of A/B tests."* So 1 in ~12 experiments is silently corrupt.
- **Root-cause surface:** *"There are over 40 potential reasons why SRM occurs. Most of the time, the issues relate to improper set-up of the test, bugs with randomization, or tracking and reporting issues."*
- **The operational rule:** *"SRM should be the first check you run on every experiment... it takes 30 seconds to check."* And *"Don't treat SRM as a one-time check. If you only look at sample ratios at the end of a test, you risk wasting days, even weeks, on corrupted data."*
  - Sources: Statsig — *A quick guide to sample ratio mismatch* — <https://www.statsig.com/blog/sample-ratio-mismatch>; Microsoft Research — *Diagnosing Sample Ratio Mismatch in A/B Testing* — <https://www.microsoft.com/en-us/research/articles/diagnosing-sample-ratio-mismatch-in-a-b-testing/>; Lukas Vermeer's SRM Checker — <https://www.lukasvermeer.nl/srm/> (read 2026-06-16)

> TASTE for tally: SRM is the experiment-equivalent of field-01's identity-stitching fracture — it
> "throws no error and surfaces no obvious signal." A good harness runs a chi-squared SRM check
> automatically on every experiment and *refuses to report a winner* if SRM fires. This is the single
> highest-leverage automated guardrail in the whole experimentation surface.

---

## 4. EXPLICIT TASTE — what great experimentation practitioners believe that average ones don't

These are quoted from named, credentialed practitioners (X signal, captured live 2026-06-16 via
energy's x-content-intel session). They are deliberately *contrarian* — they cut against the cautious
folk-wisdom most teams operate on.

### 4a. Lukas Vermeer (ex-Booking.com experimentation lead; author of the SRM Checker)
- **On the stats zoo (7,949 likes, 2026-03-27):** *"Most stats 101 tests are simple linear models — including 'non-parametric' tests. It's so simple we should only teach regression. Avoid confusing students with a zoo of named [tests]."*
  - <https://x.com/lukasvermeer> (captured 2026-06-16). **TAKE: stop memorizing t-test vs Mann-Whitney vs chi-squared — it's all regression. A harness should expose one consistent modeling layer, not 12 named buttons.**
- **On overlapping tests (2026-04-15):** *"Unplanned interactions are incredibly rare. However, despite the rarity of such interactions, simply the fear of interactions often prevents many teams from fully leveraging the potential of running overlapping tests at scale."*
  - Same handle. **TAKE: the fear of test-interaction is mostly superstition; serialize less, parallelize more.**

### 4b. Ronny Kohavi (author of *Trustworthy Online Controlled Experiments*; ex-Amazon/Microsoft/Airbnb — the textbook author)
- **On 50/50 splits (2026-02-17):** *"Why you should default to running #ABTests at 50/50? You sometimes hear: this is a risky idea, so we should run it at 10%... The logic [is flawed]."* A 50/50 split reaches significance fastest for a fixed exposure budget.
  - <https://x.com/ronnyk> (captured 2026-06-16). **TAKE: the reflex to "run risky tests at 10%" trades statistical power for a false sense of safety. Use a kill-switch for safety, not a small allocation.**
- **On concurrency (2026-09-01 [note: future-dated artifact in feed; treat as the most-recent pinned/boosted statement]):** *"Many organizations hesitate to run experiments in parallel, fearing that they will interact, but the concerns are overstated... Concurrent testing is essential to scale."*
  - Same handle. Reinforces Vermeer's 4a take — two independent textbook-level authorities agree.

### 4c. Sean J. Taylor (ex-Lyft / ex-Facebook experimentation science)
- **On the academic-vs-industry replication divide (2026-10-21 boosted):** *"The company A/B testing imperative (to guide decisions) might create a more reliable empirical 'literature' than the academic imperative (to publish papers)."* He co-published peer-reviewed research on *"p-hacking, A/B testing, data-driven decision making."*
  - <https://x.com/SeanjTaylor> (captured 2026-06-16). **TAKE: industry experimentation, done right, can be MORE trustworthy than academia precisely because the incentive is a correct decision, not a publishable p-value. This is a direct rebuttal to "all A/B testing is p-hacking."**

> TASTE synthesis for tally: the expert consensus (Vermeer + Kohavi) is *less* cautious than folk
> wisdom on two axes — (1) run 50/50 not 10%, (2) parallelize tests, don't fear interaction — while
> being *more* rigorous on the things that actually matter (pre-registration, SRM, no peeking). Average
> teams have this exactly backwards: they ramp slowly and serialize (costing power) while peeking and
> segment-fishing (costing validity).

---

## 5. Where credible sources DISAGREE (feeds GAPS-AND-DISPUTES)

### Dispute A — "Is all industry A/B testing just p-hacking?"
- **Skeptic side:** the replication-crisis framing (Atticus Li's own series title is "replication-crisis") implies a large fraction of "wins" are artifacts — *"a quarter to a third of the 'winning' tests are statistical artifacts."*
  - <https://atticusli.com/replication-crisis/ab-testing-peeking-problem/>
- **Defender side:** Sean Taylor argues the opposite — the decision-driven incentive makes industry results *more* reliable than academia. *"might create a more reliable empirical 'literature' than the academic imperative."*
  - <https://x.com/SeanjTaylor> (2026-06-16)
- **Resolution for tally:** both can be true — *naive* fixed-horizon-with-peeking programs are ~30% artifact; *well-run* programs (pre-reg + SRM + sequential) are trustworthy. The fork is process, not the method. **This is exactly the gap a good harness closes.**

### Dispute B — Sequential/Bayesian vs classic fixed-horizon
- **Pro-sequential:** GrowthBook and Statsig push *"Sequential testing"* / mSPRT and Bayesian so that *looking is allowed* (peeking-proof by construction).
- **Pro-fixed-horizon caution:** the classic position (implied by Atticus Li / Kohavi textbook) is that fixed-horizon NHST is fine *if you don't peek* — the problem is human behavior, not the math. Sequential methods cost power (wider intervals) for the privilege of peeking.
- **Resolution for tally:** if your UI lets humans look (it will), you MUST use always-valid inference; if you can truly lock the look until N is hit, fixed-horizon is more powerful. Capture BOTH sides — this is a real, unsettled tradeoff.

### Dispute C — Allocation: 50/50 vs ramped (1% → 5% → 50%)
- **Kohavi:** default 50/50, ramping for *safety* not *learning* is a power-losing reflex.
- **SRE/ops convention (field-03 rollout playbook):** canary at *"5–10%"* first, widen after metrics validate.
- **Resolution:** these answer different questions — Kohavi optimizes statistical power; the canary optimizes blast-radius. A harness should ramp for safety (ops) AND, once safe, jump to 50/50 for the *measurement* phase. Conflating the two is the error.

---

## 6. What changed in 2026 that invalidates 2025 conventional wisdom

- **Agentic analytics is the new bottleneck, not coding.** Amplitude (2026-02-17): *"AI has collapsed the time it takes to ship a feature. Now it's all about shipping the right thing... As coding gets automated, agentic analytics becomes the bottleneck. Teams that win will build with [AI analytics]."* They shipped a *"Global Agent, Specialized Agents, and MCP"* analytics platform.
  - <https://x.com/Amplitude_HQ> (captured 2026-06-16). **Implication: the experiment-reading + insight loop is being handed to agents — which makes automated peeking/SRM/multiple-comparison guards MORE important, because an agent will happily declare a peeked winner unless the harness stops it.**
- **Statsig is wiring experiments into a code knowledge graph for agents.** Statsig (2026-01-29): *"a knowledge graph that connects your codebase to Statsig entities like metrics, feature gates, and experiments... foundational infrastructure that allows teams and AI agents to learn."*
  - <https://x.com/statsig> (captured 2026-06-16). This is essentially tally's thesis stated by an incumbent — agent-native experiment/flag infra. The 2025 assumption that experiment platforms are human-dashboards-only is dead.
- **Opus 4.8 is being embedded directly into analytics.** Amplitude (2026-05-28): *"Opus 4.8 is now available! - Great for complex analytics investigations - Better at finding hidden behavioral patterns - Reads screenshots and graphs too."*
  - <https://x.com/Amplitude_HQ>. The model reading your funnel charts is now the same class of model running tally.

---

## 7. Cross-reference to internal corpus

- `energy/scripts/x-content-intel/score.py` (lines ~36-49) shows the **luminary-set + topic-keyword** pattern used to surface high-signal voices. The experimentation analog: tally's harness should ship a curated `EXPERIMENT_LUMINARIES` set (Kohavi, Vermeer, Taylor, +Statsig/GrowthBook docs) so its self-improvement loop pulls from authorities, not listicles. This file's §4 was produced by exactly that method against the live X session.
  - Read-only ref: `~/energy/scripts/x-content-intel/score.py`.
- `energy/audit/HARNESS-CHECKLIST-2026.md` line 322: tally default = **PostHog** (analytics + flags + replay bundled), alts **Statsig / GrowthBook / LaunchDarkly** for flags+experiments. All three flag-platform alts named here ship sequential testing — confirming §5 Dispute B is the live design choice.
- Internal: this connects to tally's own `eval/` directory — the "pre-register the hypothesis before data exists" discipline (§2 TASTE) is the same shape as eval-before-code. An experiment contract == an eval contract.
