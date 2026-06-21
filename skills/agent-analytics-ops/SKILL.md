---
name: agent-analytics-ops
description: Operate analytics as an autonomous agent — materialize recurring reads (never loop raw HogQL → 120/hr stall), prefer typed queries over hand-written SQL, use the right key class, own the raw event stream, and migrate providers safely (dual-write + reconcile + explain-the-delta + idempotency). Use when asked about "rate limits", "HogQL stall", "migrate analytics", "which API key", "warehouse", or "the PostHog MCP". Encodes tally's O13/O14/O16 + J8 + BTS-7/8/9/11/14 + P9/P10/P11/P19–P23.
---

# agent-analytics-ops — materialize reads, own the stream, migrate safely

> Encodes **O13/O13b** (materialize recurring reads, never loop raw HogQL; typed queries over SQL),
> **O14** (own the raw event stream, warehouse-first), **O16** (dual-write + reconcile + explain-the-
> delta before any cutover, never hard-cut), **J8** (operate as an agent), **BTS-7/8/9/11/14**, and the
> dead-repo / `wizard --ci` / migration traps **P9/P10/P11/P12/P19–P23**.
>
> The single most important rate-limit fact for an agent operator: **raw HogQL is capped at 120/hour**
> — an autonomous loop calling `execute-sql` stalls. Capture (ingest) is unmetered; reads on a personal
> key are the bottleneck. "Persist, don't recompute."

## Trigger

Invoke this skill when the request is any of:

- "my analytics loop hit a rate limit" / "HogQL is stalling" / "429 on the query endpoint"
- "migrate from Amplitude/Mixpanel/GA4 to PostHog" / "plan an analytics migration"
- "which API key do I use" / "I'm getting 401s on decide / capture is rate-limited"
- "should I own the raw events" / "warehouse-first" / "export my event stream"
- "set up the PostHog MCP" / "the PostHog MCP repo is archived" / "can I use `wizard --ci`"
- "read a funnel/retention/trends metric the agent way"

Do **not** invoke for: experiment statistics (`experiment-rigor`), flag wiring (`safe-feature-flags`),
or LLM-cost/token operations (agentmoney).

## Steps

1. **Materialize recurring reads — NEVER loop raw HogQL (O13/P11/BTS-11).** Materialize a recurring
   query via "Endpoints GA" and poll the materialized endpoint (12,000/hr sustained, 10 concurrent)
   instead of calling `execute-sql` (raw HogQL, 120/hr) inside a loop. `tally read --query <kind>
   --materialize` emits a materialized endpoint, not a per-loop raw query. An agent loop on raw HogQL
   dies after ~120 reads in an hour.
2. **Prefer typed query tools over hand-written SQL (O13b/P12).** Reach for `query-funnel` /
   `query-retention` / `query-trends` / `query-paths` / `query-stickiness` before `execute-sql`. Typed
   tools constrain the surface and avoid hallucinated columns — an LLM writing raw HogQL invents
   non-existent columns (worsened by naming drift). `execute-sql` is a deliberate escape hatch, not the
   default; validate columns against the registry/schema first.
3. **Use the right key class (P4).** Capture/flag-decide uses the **project (public)** key;
   reads/flag-management use a **personal** key. Mixing them → 401s on decide or unexpected
   rate-limiting on capture (which should be effectively unmetered). "A rule of thumb for whether rate
   limits apply is if the personal API key is used."
4. **Own the raw event stream, warehouse-first (O14/BTS-9).** Store events in an event-native,
   exportable, vendor-neutral shape (an `events` table you own) from day one. Never make the vendor's
   proprietary store your only copy — every migration "loses" data; owning the raw stream makes a future
   switch "a re-pipe, not a data bereavement."
5. **Don't build on dead surfaces (P9/P10).** Use the **hosted** PostHog MCP endpoint
   `https://mcp.posthog.com/mcp` or the monorepo `services/mcp` path — NEVER `git clone` the archived
   `PostHog/mcp` repo (archived 2026-01-19) or `posthog-js-lite` (archived → use mainline `posthog-js`).
   Don't design an autonomous flow on `wizard --ci` — CI mode is disabled in published builds and fails
   at the LLM gateway; run the interactive wizard once (human-in-loop) or instrument via SDK + MCP.
6. **Migrate safely: dual-write + reconcile + explain-the-delta, NEVER hard-cut (O16/BTS-7/8/14).**
   `tally migrate-plan --from <v> --to <v>` produces a plan that runs old + new concurrently, reconciles
   counts, and EXPLAINS the delta — because the numbers will NOT match by design:
   - **Counts legitimately drop ~10–15%** post-migration (PostHog blocks bot traffic by default,
     Amplitude doesn't; `session_start` dropped; no-resolvable-ID events dropped) → reconcile and
     explain, don't chase parity (P20).
   - **Re-running a paused migration duplicates events** (no auto-dedup) → carry an event-id
     **idempotency key** (P19).
   - **Derived assets (cohorts/dashboards/charts) do NOT transfer** — only raw events come over; plan to
     rebuild them by hand (P21).
   - **`$set` vs `$set_once` mis-map destroys acquisition history** — `$set_once` for first-touch, `$set`
     for mutable; map by hand (P23).
   - **Call `posthog.flush()` on bulk ingest >10k** or lose the tail (P22).
   - Model the **cost on the destination's pricing axis**, not the source's (BTS-14).
7. **Verify.** `tally read --query retention --materialize --json` → `materialized-endpoint`,
   `rawHogqlLoop:false`. `tally migrate-plan --from amplitude --to posthog --json` → output carries an
   `idempotencyKey` + named-cause `deltaCauses` (bot-filter, dropped `session_start`) + derived-assets/
   identity warnings.

## Output

- A **materialized read** plan (materialized endpoint, no raw-HogQL loop) with bounded retention + an
  explicit conversion window, using typed query tools over hand-written SQL.
- A **key-class** statement (project key for capture/decide, personal key for reads/management) that
  avoids the 401 / unexpected-rate-limit traps.
- A **warehouse-first** posture (own the raw, exportable event stream) so a future provider switch is a
  re-pipe, not a data loss.
- A **migration plan** that dual-writes, reconciles, and EXPLAINS the delta — carrying an event-id
  idempotency key, named delta-causes, the derived-assets-don't-transfer warning, the `$set_once`
  acquisition mapping, the `flush()`-on-bulk note, and a cost model on the destination's axis.
- The dead-surface refusals: hosted MCP endpoint (not the archived `PostHog/mcp` repo), and no
  `wizard --ci` autonomous flow.
