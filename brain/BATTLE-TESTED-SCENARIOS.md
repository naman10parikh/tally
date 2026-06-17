---
title: "tally — Battle-Tested Scenarios (golden eval seeds)"
type: synthesis
created: "2026-06-16"
updated: "2026-06-16"
tags: [scenarios, eval, golden-tasks, postmortems, migrations, production, tally]
domain: product-analytics-feature-flags
sources:
  - "raw/ecosystem-02-agent-operator-clis-apis-mcps.md"
  - "raw/ecosystem-03-experimentation-stats-privacy-ga4-funnels.md"
  - "raw/ecosystem-04-real-breakage-github-issues.md"
  - "raw/field-01-event-taxonomy-disasters.md"
  - "raw/field-02-pii-in-analytics-leaks.md"
  - "raw/field-03-flag-debt-and-dead-code.md"
  - "raw/field-04-experiment-phacking-peeking.md"
  - "raw/field-05-when-autocapture-hurts.md"
  - "raw/field-06-migration-war-stories.md"
related: ["[[EXPERTISE-MAP]]", "[[KNOWN-PITFALLS]]", "[[OPINIONS]]"]
summary: "≥15 real, specific failure/migration/production scenarios with the resolution and a verifiable acceptance criterion. These seed the golden eval tasks in Wave S."
---

# tally — Battle-Tested Scenarios

> Each scenario is a **real, specific** situation (cited to a postmortem, a maintainer doc, or a
> verified GitHub issue) shaped as a golden eval task: **Situation → Trap → Correct resolution →
> Acceptance criterion (verifiable) → Source.** A fresh Claude that can resolve all of these is
> dangerous in this vertical. Severity: 🔴 catastrophic / irreversible · 🟠 silent-but-bad · 🟡 costly.
>
> **How Wave S should use this:** the *Acceptance criterion* line is the grader. An eval passes only
> if tally's output produces that criterion — not if it merely "discusses" the topic.

---

## BTS-1 🟠 Naming drift fragments a core metric

**Situation.** Engineer A logs `Song Played`. Six weeks later Engineer B, unaware, logs `song played`.
Amplitude/PostHog treat capitalization as a semantic boundary → two irreconcilable event streams; the
"songs played" dashboard now under-counts by ~half and nobody notices. [field-01 §1a]

**Trap.** "Fix" it by renaming one event to match the other. "Renaming an event without a migration
plan does not fix a naming problem — it creates two broken time series where there was one." [field-01 §4]

**Correct resolution.** (1) Define a single canonical event in a **machine-readable registry** with a
fixed casing convention; (2) **alias** both historical streams to the canonical event (don't rename —
merge at query time); (3) add a **CI gate** that rejects any new event not matching the registry
casing rule, so Engineer C can't re-mint a third variant. [field-01 §3, §6]

**Acceptance criterion.** tally emits a registry entry + a CI check that *fails the build* on an
unregistered or case-variant event name, AND a query that unions the two legacy streams without
mutating either. Discussing naming hygiene ≠ pass; the failing CI check must exist.

**Source.** field-01 §1a/§3/§4/§6 (digitalapplied 2026-06-10).

---

## BTS-2 🔴 Session replay leaks PII because masking was opt-out, not opt-in

**Situation.** A team enables PostHog session replay with defaults. The signup form's `<div>` echoes
the user's typed email, and the checkout page shows the last-4 of a card. Replay captures "the complete
DOM structure including form values unless explicitly masked." Inputs are masked by default; **free
text is not** — the email-in-a-div and the card-in-a-div are recorded. PII is now in the replay store.
[field-02 §1, §4]

**Trap.** Patch reactively by adding `ph-no-capture` to the two known fields. New leak surfaces appear
on every redesign; meanwhile the already-captured PII can't be un-stored ("you cannot un-ring the
bell"). [field-02 §5]

**Correct resolution.** Configure **mask-all-then-allowlist** from day one:
```js
{
  maskAllInputs: true,
  maskTextSelector: "*",
  maskTextFn: (text, element) =>
    element?.dataset['capture'] === 'true'
      ? text
      : '*'.repeat(text.trim().length)
}
```
Plus a `before_send` hook to null out `$current_url` (strips `?email=…&token=…`). Apply the opt-out on
**all three platforms** (web `ph-no-capture` class, iOS accessibility identifier, RN prop). Run a
person-deletion job for the already-leaked data and flag that any downstream export is out of your
control. [field-02 §3]

**Acceptance criterion.** tally's replay config has `maskAllInputs: true` + `maskTextSelector: "*"`,
a `before_send` URL-scrub, and explicitly addresses iOS + RN opt-out — not just the web class. A
config that masks inputs but leaves text default is a FAIL.

**Source.** field-02 §1/§3/§4/§5 (PostHog data-collection docs 2026; Lokker 2026; Amplitude 2026).

---

## BTS-3 🔴 Identity stitch done wrong → one human becomes many

**Situation.** The app calls `identify()` only after login. Pre-login behavior is attributed to
anonymous `distinct_id`s that never get stitched to the known user → "one human shows up as several,
and every funnel, retention curve, and cohort built on top is wrong in ways no alert will catch."
[field-01 §2]

**Trap.** Assume the analytics tool auto-stitches on login. It does not, reliably, unless you call
`identify()` correctly at both moments — and the damage is retroactive (the fractured graph for past
users can't be re-stitched cleanly).

**Correct resolution.** Call `identify()` at **first load** (anonymous) AND **after login** (known) so
the anonymous→known link is made at the right moment. Use **`$set_once`** for first-touch/acquisition
props and **`$set`** only for mutable state — "if you use `$set` for referral source, every later
session overwrites the original acquisition channel." Enforce both at **instrumentation time**, not
review. [field-01 §2]

**Acceptance criterion.** tally's instrumentation emits an `identify()` call at first load and after
login, AND uses `$set_once` for acquisition props. An implementation that only identifies post-login,
or uses `$set` for referral source, is a FAIL.

**Source.** field-01 §2 (digitalapplied 2026-06-10).

---

## BTS-4 🔴 The PM ships a "winning" experiment that was just noise (peeking)

**Situation.** PM launches a test Monday. Wednesday the dashboard crosses p<0.05. PM screenshots it,
ships the variant. "Three weeks later, someone notices that the conversion metric did not actually
improve." Root cause: early data is noisy; stopping early locks in variance as the conclusion. With
continuous monitoring of a fixed-horizon test, the false-positive rate climbs past 30–40%; in the
limit, crossing p=0.05 under the null is **guaranteed (100%)**. [field-04 §1]

**Trap.** Treat "we hit significance" as "we have a winner" on a frequentist fixed-horizon test that
allows mid-flight looking. An *agent* operator makes this worse — it will poll and ship the instant it
sees significance. [field-04 §6]

**Correct resolution.** Make peeking **structurally impossible**: either (a) hide the
decision/p-value until the pre-registered sample size is hit, OR (b) switch the math to **sequential
(always-valid / mSPRT)** or **Bayesian** so looking *is* valid. For an agent, default to **Bayesian**
(PostHog default — "check results at any time without statistical penalties") or frequentist-with-
sequential. Encode the asymmetry: an agent may **stop a loser early** on a sequential boundary but must
**not ship a winner** before the pre-registered N unless using a proper always-valid method.
[field-04 §1; ecosystem-03 §1a/§1c]

**Acceptance criterion.** Given a "result crossed p<0.05 on day 3 of a fixed-horizon frequentist
test," tally **refuses to declare a winner** and either waits for N or recommends switching to
sequential/Bayesian. Declaring the winner is a FAIL.

**Source.** field-04 §1/§6; ecosystem-03 §1a/§1c (Atticus Li; Statsig; PostHog docs).

---

## BTS-5 🟠 Experiment is silently corrupt — SRM never checked

**Situation.** An experiment requested 50/50 but the observed split is 52/48 at N=400k. The PM reads
the (favorable) result and ships. The randomization was actually broken (a redirect dropped some users
before assignment) → "When detected, the experiment's results are invalid." SRM occurs in ~6–10% of
tests and "throws no error and surfaces no obvious signal." [field-04 §3]

**Trap.** Read experiment results without first asking "is this experiment even valid to read?" Or run
SRM only once at the end, after "wasting days, even weeks, on corrupted data."

**Correct resolution.** Run a **chi-squared SRM check as the FIRST step on every experiment, and
continuously** (not once at the end). If SRM fires, **refuse to report a winner** and surface the
randomization bug. "SRM should be the first check you run… it takes 30 seconds." [field-04 §3]

**Acceptance criterion.** tally runs an SRM check before reporting any experiment result and **blocks
the readout** when the split deviates significantly from intended allocation. Reporting a winner on an
SRM-failing experiment is a FAIL.

**Source.** field-04 §3 (Statsig; Microsoft Research; Lukas Vermeer's SRM Checker).

---

## BTS-6 🔴 Knight Capital — the reused flag bit ($440M, 45 min)

**Situation.** A deprecated flag ("Power Peg") had its dashboard config removed and users switched
away, **but the server code path was never deleted.** Years later an engineer **reused the flag bit**
for a new feature (RLP), assuming Power Peg would never run. One server missed the deploy, interpreted
the reused bit as the old Power Peg instruction, and auto-refreshed orders in a loop → 397M shares,
$7.65B uncontrolled positions, **$440M loss in 45 minutes**, company acquired. The rollback made it
*worse* — it re-deployed the same dead-code-bearing binary. [field-03 §3; ecosystem-04 §5]

**Trap.** (1) Believe "deprecate the flag" = one step (toggle off). It's THREE: ramp to 0/100, remove
config, **delete the code branch.** (2) Reuse a retired flag key/bit because a fresh one feels like
overhead. (3) Trust "rollback to known-good" when the binary still carries the dead code path.

**Correct resolution.** **Never reuse a flag key/bit** — tombstone retired keys forever (the flag
analog of the `processed-index.jsonl` "never re-mint a stable ID" rule). Track flag *and* dead-code
lifecycle together; a flag is removed only when its code branch is removed. Ship a flag-hygiene sweep
(age + last-eval + owner) and prefer Piranha-style automation that *generates the removal diff*.
[field-03 §3/§6; ecosystem-04 §5]

**Acceptance criterion.** Given a request to "free up a flag bit / reuse an old flag key," tally
**refuses to recycle** and mints a fresh tombstoned key; and its deprecation procedure includes the
explicit code-branch-deletion step. Reusing a retired key is a FAIL.

**Source.** field-03 §3 (specbranch; Henrico Dolfing); ecosystem-04 §5.

---

## BTS-7 🟠 "We migrated to PostHog and lost 15% of events" (defaults differ)

**Situation.** A team imports Amplitude → PostHog. Post-migration counts are ~15% lower. Panic: "the
import is broken." Actually: "PostHog blocks bot traffic by default, while Amplitude doesn't" →
**lower counts by design**, plus Amplitude `session_start` events are "dropped (not imported)." The
numbers won't match — and that's correct. [field-06 §2]

**Trap.** Treat count parity as the migration success criterion and either re-run the import (causing
dupes — BTS-8) or roll back a *correct* migration.

**Correct resolution.** **Reconcile source-vs-dest counts and EXPLAIN the delta** (bot filtering +
dropped `session_start`), don't chase parity. Map `[Amplitude] Page Viewed`→`$pageview`,
`[Amplitude] Page Location`→`$current_url`, `EMPTY`→`null`, timestamps→ISO 8601. Expect cohorts /
dashboards / charts / computed properties to **NOT transfer** — rebuild every saved view by hand. Run a
**subset test migration first**. [field-06 §2]

**Acceptance criterion.** tally produces a count-reconciliation report that *attributes* the delta to
named causes (bot filter, dropped event types) and explicitly lists derived assets that won't migrate.
"Counts dropped, investigate the importer" without explaining the expected delta is a FAIL.

**Source.** field-06 §2 (PostHog managed-migrations + migrate-from-amplitude docs 2026).

---

## BTS-8 🔴 A paused-then-resumed migration silently doubles the data

**Situation.** A managed migration is paused (rate limit / network blip) and re-run against the same
dataset. "Managed migrations do not deduplicate events… running another migration against the same data
set will result in duplicate events." Every funnel and count is now inflated, invisibly. [field-06 §2]

**Trap.** Assume the migration tool is idempotent and "just re-run it." It isn't.

**Correct resolution.** Carry an **idempotency key per event** (event-id) and dedup on it — the
migration analog of the `processed-index.jsonl` dedup ledger. Never re-run a migration blindly; if a
run is interrupted, resume from a checkpoint keyed on already-imported IDs. Also: for bulk ingest the
"default queue size is 10,000 — if importing more than 10,000 events, call `posthog.flush()`" or you
lose the tail. [field-06 §2, §5]

**Acceptance criterion.** tally's migration plan includes an event-id idempotency/dedup step and a
flush for >10k batches. A re-run-on-failure plan with no dedup key is a FAIL.

**Source.** field-06 §2/§5 (PostHog managed-migrations docs 2026).

---

## BTS-9 🔴 GA4 cutover: history can't come along (session→event rupture)

**Situation.** A team must move off Universal Analytics. They expect to "import historical UA data into
GA4." They can't: "those are two different systems using different data structures. Universal Analytics
uses a session data model, while GA4 uses an event model." UA stopped processing hits July 1, 2023;
access sunset by July 2024; deprecation finalized Nov 2025. Years of history are stranded. [field-06 §1]

**Trap.** Plan the migration assuming the platform will bridge the data model. It won't — "the
platforms won't bridge it for you." The only escape is custom ETL (Supermetrics/Fivetran) into a
warehouse.

**Correct resolution.** Accept the session→event shift is **irreversible at the data layer**. Store
events in an **event-native, exportable, vendor-neutral shape from day one** (warehouse-first / an
`events` table you own) so a future switch is a *re-pipe, not a data bereavement.* For the historical
UA data specifically, build a custom ETL into the warehouse before the access sunset. [field-06 §1]

**Acceptance criterion.** tally's analytics architecture stores raw events in a warehouse-owned,
exportable shape, and any GA4-related plan explicitly states UA history requires custom ETL (not a
native import). Proposing a native UA→GA4 historical import is a FAIL.

**Source.** field-06 §1 (Google Analytics Help; OWOX; Oreate AI; sranalytics.io — 2026).

---

## BTS-10 🟠 The kill-switch you can't reach (LaunchDarkly/AWS outage)

**Situation.** Oct 2025: an AWS US-East-1 outage took LaunchDarkly offline. Teams "couldn't update or
create flags, causing rollback delays and prolonged production incidents because their release control
tool itself was unavailable." The flag system meant to *contain* incidents *became* one. [field-06 §4]

**Trap.** Treat a SaaS flag provider as an always-available kill-switch. "The kill-switch you can't
reach during an incident is worse than no kill-switch — it gives false confidence."

**Correct resolution.** Target **OpenFeature** as the call-site API from line one with the vendor
behind a provider, so a switch is a config change not a rewrite ("every LaunchDarkly SDK call ties you
to the platform"). For the kill-switch path specifically, have a **self-host or multi-provider
fallback** (e.g., flagd in-process resolver evaluates locally with zero network) so a vendor outage
doesn't strand your release control. During the OpenFeature migration, note the API breaks:
`client.variation('flag', ctx, false)` → `client.getBooleanValue('flag', false, ctx)` and the context
key rename `key`→`targetingKey` (every call site changes — run both implementations concurrently to
verify identical results before removing the legacy SDK). [field-06 §4]

**Acceptance criterion.** tally's flag architecture uses OpenFeature at the call site and specifies a
local/offline fallback for the kill-switch path. A design with the SaaS provider as the sole
kill-switch is a FAIL.

**Source.** field-06 §4 (Flagsmith migration guide; FlagShark — 2026).

---

## BTS-11 🟠 The autonomous agent stalls on the HogQL rate limit

**Situation.** tally runs a loop that re-executes a raw HogQL query (`execute-sql`) every iteration to
read a metric. It hits the **120/hour** HogQL limit and stalls — the loop dies mid-shift. [ecosystem-02 §6]

**Trap.** Treat reads as cheap like capture. Capture (ingest) is effectively unmetered (project key),
but **reads on a personal key are rate-limited**, and raw HogQL is the *harshest* surface (120/hr).

**Correct resolution.** **Materialize the recurring query once via "Endpoints GA"** → poll the
materialized endpoint (1,200/min burst, **12,000/hour sustained**, 10 concurrent) instead of re-running
HogQL. Prefer typed queries (`query-funnel`/`query-retention`/`query-trends`) over `execute-sql` where
possible. This is the "persist, don't recompute" discipline. [ecosystem-02 §6; ecosystem-00 §B.5]

**Acceptance criterion.** Given "an agent needs to read metric X every N minutes," tally proposes a
materialized endpoint (not a per-loop `execute-sql`). A design that loops raw HogQL is a FAIL.

**Source.** ecosystem-02 §6 (PostHog rate-limits docs 2026).

---

## BTS-12 🔴 Flag rolled to the wrong users (local-eval ≠ DB-eval)

**Situation.** An agent flips a flag targeting `distinct_id` using PostHog **local evaluation** for
latency. Local eval doesn't have the same inputs as DB-eval — "`distinct_id` may be missing" on the
local path (PostHog #57183, in prod ~5 weeks), or person/group properties can't be passed to all
local-eval methods (#28453). The flag evaluates differently for the same user depending on path → the
feature rolls to the **wrong** users, invisibly. [ecosystem-04 §1a/§1b]

**Trap.** Assume local eval (a latency optimization) is correctness-equivalent to server eval. "Local
evaluation is a latency optimization that trades correctness — it only sees the properties you hand it."

**Correct resolution.** For correctness-critical targeting, **use DB-backed eval**, OR **pass ALL
relevant person/group properties explicitly** into the local-eval call. Never assume local-eval has the
server's full person profile. Before any rollout, dry-run with `feature-flags-test-evaluation-create`
and check reach with `feature-flags-user-blast-radius-create`. [ecosystem-04 §1a/§1b; ecosystem-02 §1b]

**Acceptance criterion.** When tally targets a flag by `distinct_id`/person property, it either uses
DB-eval or passes the full property set to local eval, AND runs a blast-radius pre-check. Targeting via
bare local-eval is a FAIL.

**Source.** ecosystem-04 §1a/§1b (PostHog #57183, #28453 — verified 2026-06-16).

---

## BTS-13 🟡 Autocapture turns a funnel into a refactor casualty

**Situation.** Activation funnel step 2 depends on an **autocaptured** click on `button.cta-primary`.
A frontend refactor renames the class to `button.primary-action`. The autocaptured event "shifts in
ways that quietly break the dashboards… with no error." The funnel silently drops to ~0 at step 2; the
team thinks activation cratered. [field-05 §2; field-01 §1c]

**Trap.** Let a load-bearing metric (funnel/retention/experiment) depend on an autocaptured event.
"Autocapture couples your metrics to your CSS/DOM."

**Correct resolution.** **Promote the step into a named, typed, CI-registered event** (e.g.,
`signup_cta_clicked`) the moment it matters — decoupled from the DOM. Keep autocapture for *discovery*
only. "Autocapture is a great prior and a terrible API contract." [field-05 §5, §6]

**Acceptance criterion.** tally's funnel/experiment metrics reference named registered events, not
autocaptured selectors; and tally flags any metric built on an autocaptured event as fragile. A funnel
keyed on a CSS selector is a FAIL.

**Source.** field-05 §2/§5/§6; field-01 §1c (digitalapplied 2026-06-10; Mixpanel 2026).

---

## BTS-14 🟡 CDP migration to "save money" raises the bill (wrong pricing axis)

**Situation.** A team migrates Segment → RudderStack to cut cost. Segment prices on **MTUs**;
RudderStack prices on **event volume**. Their app is low-MTU/high-event → RudderStack is *more*
expensive. "Migrating to 'save money' can increase the bill if your shape is wrong." [field-06 §3]

**Trap.** Assume "cheaper for them" = "cheaper for you." Different pricing axes invert the comparison
depending on your event-per-user shape.

**Correct resolution.** Before any switch, **model the bill under the NEW pricing axis using YOUR
actual event/MTU shape.** And never hard-cut — **dual-write to both, reconcile counts, then cut over.**
[field-06 §3]

**Acceptance criterion.** tally's migration recommendation includes a cost model on the destination's
pricing axis using the team's real volumes, plus a dual-write+reconcile cutover. A switch justified
only by "they're cheaper" is a FAIL.

**Source.** field-06 §3 (Volument 2026; CDP Institute 2022 — directional).

---

## BTS-15 🟠 Unbounded retention metric "changes" overnight

**Situation.** tally tracks "Day-7 retention" across loops using the **unbounded** ("Day-7 or later")
definition. Yesterday's reported Day-7 number changes today as new days of data arrive — "unbounded can
constantly change as new days of data arrive." The agent flags a "regression" that's actually just the
metric's instability. [ecosystem-03 §2a]

**Trap.** Use unbounded retention for a metric an agent compares across time, then react to its drift
as if it were a real change.

**Correct resolution.** Use **bounded** (exact N-day) retention for any metric tracked across loops so
"yesterday's number doesn't silently change today." Tie the window to trial/subscription length for
SaaS. Also: always set an explicit **conversion window** on funnels (omitting it silently counts
conversions weeks later, inflating the rate). [ecosystem-03 §2a/§2c]

**Acceptance criterion.** tally uses bounded retention for tracked-over-time metrics and sets explicit
conversion windows on funnels. An unbounded retention metric used for loop-over-loop comparison is a FAIL.

**Source.** ecosystem-03 §2a/§2c (Permutable/Amplitude; Lenny's primer).

---

## BTS-16 🟡 CUPED applied to e-commerce backfires

**Situation.** A team enables **CUPED** on an e-commerce conversion experiment to "reach significance
faster." But CUPED "only shines when your users come back again and again like on streaming platforms"
— "if you have an e-commerce site, CUPED can actually steer you wrong, leading to misleading results."
The variance reduction injects bias instead of power. [ecosystem-03 §1b]

**Trap.** Treat CUPED as a free always-on speedup. It needs a strong pre-period covariate (returning
users / repeat usage).

**Correct resolution.** Only apply CUPED when there's a strong pre-experiment covariate. On
low-repeat / one-shot-conversion products, **leave CUPED off** — it adds bias, not power. Don't blindly
enable variance reduction. [ecosystem-03 §1b]

**Acceptance criterion.** Given a one-shot-conversion (e-commerce) experiment, tally does **not** apply
CUPED (or explicitly justifies a strong covariate). Blanket-enabling CUPED is a FAIL.

**Source.** ecosystem-03 §1b (ABTasty 2026).

---

## BTS-17 🟡 Segment-fishing manufactures a fake "winning segment"

**Situation.** A flat experiment (no overall lift) is sliced across 20 segments; one segment shows
p<0.05. The team ships "for that segment." This is the **Texas Sharpshooter / multiple-testing** bug —
"slice 20 segments, one will be 'significant'" by chance. [field-04 §2]

**Trap.** Form the hypothesis *after* seeing the data (post-hoc) and treat one-of-twenty as a finding.

**Correct resolution.** **Pre-register** the hypothesis + metric + segment list *before data exists*
(write the contract to disk at experiment-create — an experiment contract == an eval contract). For any
post-hoc segment exploration, apply a **multiple-comparison correction** (Bonferroni / Benjamini-
Hochberg / FDR) and treat results as hypothesis-generating, not confirmatory. [field-04 §2]

**Acceptance criterion.** tally writes a pre-registration contract at experiment creation, and any
multi-segment readout applies an explicit correction. Shipping an unplanned 1-of-20 segment as a
confirmed win is a FAIL.

**Source.** field-04 §2 (GrowthBook — Where Experimentation goes wrong, 2026).

---

## Coverage map (scenario → job → severity)

| # | Scenario | Job | Severity |
|---|---|---|---|
| BTS-1 | Naming drift fragments a metric | J1 | 🟠 |
| BTS-2 | Replay leaks PII (opt-out vs opt-in) | J3 | 🔴 |
| BTS-3 | Identity stitch → one human, many | J2 | 🔴 |
| BTS-4 | Peeked "winner" was noise | J5 | 🔴 |
| BTS-5 | SRM never checked → corrupt test | J5 | 🟠 |
| BTS-6 | Knight Capital reused flag bit | J6 | 🔴 |
| BTS-7 | "Lost 15% of events" (defaults differ) | J8 | 🟠 |
| BTS-8 | Paused migration doubles data | J8 | 🔴 |
| BTS-9 | GA4 session→event rupture | J8 | 🔴 |
| BTS-10 | Unreachable kill-switch (LD outage) | J8/J4 | 🟠 |
| BTS-11 | Agent stalls on HogQL 120/hr | J8 | 🟠 |
| BTS-12 | Flag to wrong users (local≠DB eval) | J4 | 🔴 |
| BTS-13 | Autocapture funnel refactor casualty | J7 | 🟡 |
| BTS-14 | CDP migration raises the bill | J8 | 🟡 |
| BTS-15 | Unbounded retention drifts | J5/J1 | 🟠 |
| BTS-16 | CUPED backfires on e-commerce | J5 | 🟡 |
| BTS-17 | Segment-fishing fake winner | J5 | 🟡 |

17 scenarios across all 8 jobs; 7 🔴 irreversible/catastrophic, 6 🟠 silent-but-bad, 4 🟡 costly.
