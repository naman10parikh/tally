---
name: experiment-rigor
description: THE differentiator — decide an A/B test correctly and REFUSE to ship a fake winner. SRM check first, peeking made structurally impossible (Bayesian/sequential), pre-registration as an eval contract, multiple-comparison correction, CUPED-only-with-covariate, bounded retention. Use when asked "is this A/B test significant", "can I ship the winner", "did my experiment win", "check this experiment", or "set up an A/B test". Encodes tally's O5/O6/O8/O9 + J5 + BTS-4/5/16/17 + P13–P17.
---

# experiment-rigor — SRM first, peeking impossible, refuse the fake winner

> **The differentiator.** Encodes **O5** (silent-failure guardrails are BLOCKING, never advisory),
> **O6** (make peeking structurally impossible, never merely discouraged), **O8** (50/50 for
> measurement; ramp is for safety, not power), **O9** (parallelize, don't serialize out of fear of
> interaction), **J5** (experiments decided correctly), **BTS-4/5/16/17**, **P13–P17**, all under the
> meta-stance **O20** (tally is an enforcer, not a linter; it fails closed on the irreversible).
>
> Why a wall, not a warning: "in the limit of continuous monitoring… the probability that the
> cumulative test statistic ever crosses p=0.05 under the null is not 5%. It is 100%" (O6/P13). Humans
> AND agents WILL peek; ~6–10% of tests have a sample-ratio mismatch that throws no error (P14). An
> agent makes this worse — it polls and ships instantly. The only safe design is to make the wrong move
> impossible.

## Trigger

Invoke this skill when the request is any of:

- "is this A/B test significant" / "did my experiment win" / "can I ship the winner"
- "check this experiment" / "is my result real" / "the result crossed p<0.05"
- "set up an A/B test" / "how should I allocate traffic" / "should I ramp to 5% first"
- "my 50/50 looks like 52/48" (the SRM symptom) / "I have 20 segments, one won"
- "should I turn on CUPED" / "what's my conversion-rate test"

Do **not** invoke for: flag wiring/rollout safety (that's `safe-feature-flags`) or LLM eval-pyramid
scoring (that's the `tally eval` harness, a different concept).

## Steps

1. **Run SRM FIRST, before any readout (O5/P14/BTS-5).** Chi-squared on observed vs intended split. If
   it fires (a "50/50" that's actually 52/48 at large N), randomization is broken → **the results are
   invalid** → BLOCK the readout. `tally check-experiment <spec> --json` runs SRM first and returns
   `srmPass:false` with the chi² + p-value; a failing SRM is a hard stop, not a footnote. "It takes 30
   seconds."
2. **Make peeking impossible, not discouraged (O6/P13/BTS-4).** On a fixed-horizon frequentist test,
   `check-experiment` REFUSES (exit 3) to declare a winner before the pre-registered N and recommends
   Bayesian (no peeking penalty) or a sequential boundary. The asymmetry: an agent may stop a **loser**
   early on a sequential boundary; it may NOT ship a **winner** early. Hide the decision/p-value until N
   if truly fixed-horizon, OR use math that makes looking valid.
3. **Require a pre-registration contract (O6/J5).** The hypothesis, primary metric, N, and decision
   rule must exist BEFORE the data does — pre-registration is the eval contract. A "winner" found by
   choosing the metric after seeing the data is segment-fishing, not a result.
4. **Apply multiple-comparison correction to segment readouts (BTS-17).** Reading 20 segments and
   reporting the one that crossed p<0.05 is a false-positive factory. `check-experiment` corrects across
   the family and kills the 1-of-20 fake winner. Never report a sliced segment as a headline result
   without correction.
5. **Allocate 50/50 for measurement; ramp only for safety (O8).** 50/50 reaches significance fastest
   per exposure budget ("the 10% logic is flawed", Kohavi). Ramp 5–10% to bound *blast radius* (an ops
   concern), then jump to 50/50 for *measurement* (a power concern). Don't conflate the safety canary
   with the statistical allocation.
6. **Parallelize, don't serialize (O9).** Unplanned interactions are incredibly rare; the fear of them
   prevents teams from running overlapping tests at scale. Default to concurrent testing — common
   practice has this backwards.
7. **Guard the metric-definition traps (P15/P16/P17/P18).** CUPED only with a strong pre-period
   covariate — on a one-shot/e-commerce conversion it can steer you wrong (P15), so default it OFF
   there. Use funnel/proportion methodology for a conversion-RATE metric, not a continuous-means t-test
   (P16). Use **bounded** (exact N-day) retention for tracked-over-time metrics — unbounded retention
   silently changes yesterday's number as new data arrives (P17). Set an explicit conversion window in
   the funnel definition (P18). `check-experiment` warns on each.
8. **Verify.** A peeked winner (p<0.05 on day 3, N < preReg) → `refused:true` rc=3 recommending
   wait-for-N/Bayesian. A 52/48-at-N=400k fixture → SRM fires first, readout BLOCKED rc=3. A valid
   pre-registered 50.1/49.9 → `srmPass:true`, `peekingSafe:true`, `verdict:"valid"` rc=0.

## Output

- A **decision verdict**: `valid` only when SRM passes, the look is statistically valid (Bayesian/
  sequential or past the pre-registered N), the hypothesis was pre-registered, and segment readouts are
  multiple-comparison-corrected — otherwise a **refusal** (exit 3) naming exactly which gate failed.
- An **SRM result first** (chi² + p-value) on every experiment; a failing SRM blocks the readout.
- A **peeking verdict** that refuses a fixed-horizon winner before N and recommends Bayesian/sequential,
  encoding the may-stop-loser / not-ship-winner asymmetry.
- **Warnings** for CUPED-without-covariate, means-test-on-conversion, unbounded retention, and missing
  conversion window — each keyed to its pitfall (P15/P16/P17/P18).
- Evidence the differentiator works: a refused peeked winner and an SRM-blocked readout, both fail-closed
  (rc 3), and a clean valid experiment passing (rc 0).
