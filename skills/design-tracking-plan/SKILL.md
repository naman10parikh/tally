---
name: design-tracking-plan
description: Design an event taxonomy that won't rot — a canonical, machine-readable, CI-gated event registry (the dedup ledger). Use when asked to "design a tracking plan", "what events should I track", "instrument analytics", or "set up an event taxonomy". Encodes tally's O1/O2 + J1 + BTS-1: the tracking plan is CODE, not docs.
---

# design-tracking-plan — gate the taxonomy in CI, not a wiki

> Encodes **O1** (treat the tracking plan as code, never as docs), **O2** (a canonical
> machine-readable registry the second engineer cannot bypass), **J1** (event-taxonomy that won't
> rot), **BTS-1** (the `Song Played` / `song played` drift disaster), with **O12/O12b** (autocapture
> for discovery, never the API contract) and **O19** (weight by intent depth, not raw count).
>
> The throughline: naming drift is a tragedy of the commons — "the cumulative effect of many locally
> rational choices, made without coordination, produces a globally irrational system." A registry +
> a CI gate is the **only structural fix**; review and good intentions are not (O2). A plan in a
> spreadsheet drifts; a plan wired into CI holds.

## Trigger

Invoke this skill when the request is any of:

- "design a tracking plan" / "what events should I track" / "set up an event taxonomy"
- "instrument analytics for this app/feature" / "add product events"
- "our event names are a mess" / "we have `Song Played` AND `song_played`" (the BTS-1 symptom)
- "how do I stop my analytics from rotting" / "governance for events"

Do **not** invoke for: LLM token-spend tracing (that's agentmoney — `gen_ai.usage.*` NEVER goes into
PostHog, O18), app-health/error events (canary), or web pageview stats (the Plausible plane).

## Steps

1. **Inventory the real events from the codebase / brief — do not invent.** Run
   `tally track-plan <dir> --json`. It scans for event call-sites and product-brief verbs and proposes
   a typed registry. Read its output; the events must be the ones the product actually fires, not a
   generic list.
2. **Canonicalize to ONE casing rule (snake_case is tally's default, BTS-1/O1).** Every event name
   must satisfy `^[a-z][a-z0-9_]*$`. Two labels that normalize to the same key (`Checkout Started`,
   `checkoutStarted`, `checkout_started`) are the SAME canonical event — collapse them in the registry,
   never mint a second entry. Casing is a semantic boundary.
3. **Type every property (P12).** Each prop gets a type from `{string, number, boolean, timestamp}`.
   A typed registry is what lets the CI gate catch a `type-mutation` (an `amount` emitted as a string).
   Never leave props free-form — an LLM writing a query against a free-form schema hallucinates columns.
4. **Tag acquisition props for `$set_once` (O3, defer detail to `pii-safe-capture` / `experiment-rigor`
   siblings).** Mark first-touch/referral/utm props so capture writes them with `$set_once`, not `$set`
   — overwriting acquisition history is a retroactive-loss bug (BTS-3).
5. **Decide autocapture posture explicitly (O12/O12b).** Autocapture is a great prior and a terrible
   API contract. Default it OFF for load-bearing funnels and for auth/payment/health flows; allow it as
   an opt-in discovery mode behind the registry. NEVER let a funnel/retention/experiment metric depend
   on an autocaptured (DOM-coupled) event — promote it to a named, registered event the moment it
   matters.
6. **Emit the CI gate as an ARTIFACT, not advice (O1/O5).** `track-plan` writes a CI-check script that
   calls `validateEvents()` and **exits non-zero** on an unregistered / case-variant / type-mutated
   event. The failing check must EXIST in the repo's CI — "discussing naming hygiene ≠ a gate." Wire it
   red-blocking so the build fails on drift.
7. **If building an engagement/PQL score, weight by intent depth (O19).** `save > share > comment >
   like`; `invite_teammate > create_project > view_dashboard`. NEVER sum raw counts as if a pageview
   and a high-intent action are equal — the in-house `score.py` precedent (`bookmarks*2 + retweets*3 +
   replies*1.5 + likes`) is the pattern.
8. **Verify.** Plant a case-variant (`Checkout Started` next to registered `checkout_started`) and run
   the emitted CI check — it MUST fail. A green run on a planted variant means the gate is decorative.

## Output

- A canonical machine-readable **event registry** (`registry.json`): version, casing rule, and a typed
  event list (name, props[{name,type,identity?}], owner, registered) — the dedup ledger.
- **Typed accessors** (`events.ts`) so call-sites reference registered events by a typed function, not
  a string literal the next engineer can fat-finger.
- A **CI-check artifact** (`ci-check-events.mjs`) that fails the build on unregistered/case-variant/
  type-mutated events — the structural fix, wired red-blocking.
- A one-paragraph **autocapture posture** statement (off for load-bearing metrics, opt-in for
  discovery) and, if relevant, an intent-depth-weighted engagement-score spec.
- Evidence the gate fires: a planted-variant run that exits non-zero.
