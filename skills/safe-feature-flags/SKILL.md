---
name: safe-feature-flags
description: Wire feature flags safely — OpenFeature at the call-site, DB-eval or pinned-props (never bare local-eval), blast-radius pre-check, expiry+owner at creation, and NEVER reuse a retired flag key. Use when asked to "add a feature flag", "wire a rollout", "target users with a flag", "set up a kill switch", or "clean up flag debt". Encodes tally's O7/O11/O15 + J4/J6 + BTS-6/10/12 + P27 (Knight Capital).
---

# safe-feature-flags — DB-eval-or-pinned, expiry+owner, never reuse a key

> Encodes **O7** (never assume local-eval equals server-eval), **O11** (never reuse a retired flag
> key/bit — tombstone forever), **O15** (target OpenFeature at the call-site, vendor behind a
> provider), **O10** (mandatory expiry + owner on every temporary flag), **J4/J6** (flag targeting /
> rollout safety + flag-debt lifecycle), **BTS-6/10/12** and **P1/P2/P27**.
>
> The two walls this skill puts up: (1) **bare local-eval is a correctness trap** — it only sees the
> properties you hand it, not the server's full person profile, so the same user gets different flag
> values by path (PostHog #57183/#28453); (2) **reusing a retired flag key is the Knight Capital
> class** — a reused deprecated bit + an un-deleted code path = **$440M in 45 minutes** (P27).

## Trigger

Invoke this skill when the request is any of:

- "add a feature flag" / "wire a rollout" / "gate this feature" / "release flag"
- "target users with a flag" / "roll out to 10% / to these accounts"
- "set up a kill switch" / "I need an offline fallback for flags"
- "clean up our flag debt" / "remove this old flag" / "can I reuse this flag key"
- "OpenFeature" / "flagd" / "should we pick LaunchDarkly / Statsig"

Do **not** invoke for: experiment statistics / A/B significance (that's `experiment-rigor` — flags and
experiments are different surfaces) or LLM/cost concerns (agentmoney).

## Steps

1. **Put OpenFeature at the call-site, vendor behind a provider (O15).** NEVER sprinkle vendor-specific
   SDK calls across the codebase — every vendor SDK call ties you to the platform (the Statsig ownership
   whiplash and the Oct-2025 LaunchDarkly/AWS outage are the proof-costs). A provider swap should be a
   config change, not a rewrite. Use `tally wire-flag <key> --provider flagd|posthog`.
2. **Choose the eval path: DB-eval OR pinned full property set — NEVER bare local-eval (O7/P1/P2).**
   For `distinct_id`/person-property targeting, either use `--db-eval` or pass the COMPLETE property set
   via `--pinned-props '{...}'`. `tally wire-flag` REFUSES (exit 3) a bare-local-eval target. Local eval
   is a latency optimization that trades correctness; treat it as wrong unless you pin its inputs.
3. **Run a blast-radius pre-check + dry-run BEFORE any rollout (J4/O7).** Pass `--population a,b,c` so
   `wire-flag` reports the fraction of the sample the flag would flip, resolved in-process through
   OpenFeature — a number you see before flipping, not after. (Separate `--population` for safety from
   the 50/50 measurement allocation — that's an experiment concern, see `experiment-rigor` / O8.)
4. **Attach a mandatory expiry + owner at creation for a TEMPORARY flag (O10).** A temporary flag
   without an expiry is debt by construction — "a feature is not done when it ships, it is done when the
   flag is gone." But **distinguish temporary from permanent**: kill-switches and entitlement gates live
   forever and are NOT debt; a "delete all old flags" script that conflates the two causes outages.
5. **Mint a FRESH key — NEVER recycle a retired key/bit (O11/P27).** `tally flag-sweep --reuse <key>`
   REFUSES (exit 3) a tombstoned key and suggests a fresh one. The cost of a fresh key is zero; the cost
   of reuse is potentially unbounded (Knight Capital). Tombstone retired keys forever.
6. **Deprecate in THREE steps, not one (O11/BTS-6).** (a) ramp the flag to 0 or 100, (b) remove the
   flag config, (c) **delete the code branch**. Skipping step (c) leaves a code-only/orphan zombie — an
   `if (flags.X)` branch still compiled in that a "rollback to known-good" can re-animate. `tally
   flag-sweep` generates the Piranha-style removal diff carrying all three steps.
7. **For swarms/multi-instance, beware local-eval cache skew (P3).** Multiple instances each cache flag
   defs → the same flag/user evaluates differently per instance. Use a shared flag-def cache or pin the
   flagd version and test the codes you branch on.
8. **Mind the OpenFeature spec gaps (P26).** Use OpenFeature for **evaluation portability** today; it
   does NOT yet standardize experiment-telemetry hooks (#371), per-context provider isolation (#374), or
   reactive updates (#346). For those, fall back to vendor-specific APIs until the spec lands — don't
   build on a gap.
9. **Verify.** `tally wire-flag <key> --target distinct_id --json` → `refused:true` rc=3 (bare local-eval
   blocked); add `--db-eval` → `evalPath:"db"` rc=0 with a blast-radius value. `tally flag-sweep --reuse
   <tombstoned-key>` → `refused:true` rc=3.

## Output

- A flag wired through **OpenFeature** with the vendor behind a provider (flagd file-backed for the $0
  path; PostHog for the hosted path) and a flagd `flags.json` carrying a real `targetingKey` rule.
- An **eval path that is `db` or `pinned-props`, never bare local-eval**, with a reported blast-radius
  fraction from a dry-run before any rollout.
- For temporary flags: an **expiry + owner** recorded at creation; a `flag-sweep` report distinguishing
  temporary (expire) from permanent (kill-switch) flags and flagging zombies — but never tombstoning a
  permanent kill-switch as debt.
- On any retire/reuse: a **refusal to recycle the key** (fresh-key suggestion) + a three-step
  deprecation diff (ramp → remove config → delete branch).
- Evidence the walls fire: a refused bare-local-eval target (rc 3) and a refused tombstoned-key reuse.
