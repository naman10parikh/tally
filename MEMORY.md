# tally — Memory (bootstrap, loaded every cycle)

> Critical facts only. The queryable expertise layer is `brain/` (six artifacts), searched via
> `tally brain <query>` (BM25) and `tally explain <id>`. Deep detail lives there, not here.

## Default stack (one line)

PostHog (analytics + flags + replay + experiments, agent-native MCP) · OpenFeature (call-site API) ·
flagd ($0 OSS file-backed flag loop) · GrowthBook (serious-stats bolt-on via OpenFeature, not
rip-and-replace) · Plausible CE (privacy web stats — a *different plane*).

## The boundary (three planes — the most load-bearing fact)

tally owns **in-app product events / funnels / retention / cohorts / experiments / feature flags**.

- `gen_ai.usage.*` LLM token spend → **agentmoney**. **NEVER pipe an LLM span into PostHog** (O18). tally
  never holds a token-cost metric.
- App health / errors / uptime / latency / SLO → **canary** (product behavior vs system health).
- Web pageview / referrer / UTM stats → the **Plausible** plane (replaces GA4, not PostHog).
- A CDP (Segment/RudderStack) = the *pipe in front of* PostHog, not a competitor (overkill < 3 dests).

## The four agent operating rules

1. **Materialize recurring reads** — never loop raw HogQL (120/hr cap stalls a loop). Typed queries over
   hand-written SQL. (O13/O13b, P11/P12)
2. **DB-eval or pinned props for flag targeting** — never bare local-eval (same user → different flag
   value by path, the #1 PostHog footgun). (O7, P1/P2, BTS-12)
3. **Never reuse a retired flag key** — tombstone forever; deprecate in three steps (ramp 0/100 → remove
   config → delete the branch). Knight Capital: $440M in 45 min. (O11, P27)
4. **Experiments Bayesian-or-sequential + SRM-first** — refuse a winner on a peeked or SRM-failing test;
   may stop a loser early, must not ship a winner early. (O5/O6, P13/P14, BTS-4/5)

## The enforcer creed (O20)

A **wall, not a warning**. The irreversible classes — identity fracture, PII-in-store, lost acquisition
data, peeked winners, reused-flag, lost migration history — FAIL CLOSED at instrumentation/creation
time. Only the reversible classes are advisory. This is what makes tally a harness, not a dashboard.

## The brain — six expertise artifacts (the queryable layer indexes these)

| File | Holds | IDs |
| --- | --- | --- |
| `brain/EXPERTISE-MAP.md` | the 8 jobs-to-be-done + the three-plane model | J1–J8 |
| `brain/OPINIONS.md` | explicit taste — ALWAYS/NEVER X because Z (source) | O1–O20 |
| `brain/KNOWN-PITFALLS.md` | version-specific gotchas: what breaks / detect / avoid | P1–P27 |
| `brain/BATTLE-TESTED-SCENARIOS.md` | golden scenarios; each Acceptance criterion = the eval gate | BTS-1–BTS-17 |
| `brain/TOOL-MATRIX.md` | default-vs-alt tool choices + ecosystem watch facts | — |
| `brain/GAPS-AND-DISPUTES.md` | contested forks (default held *and known to be a choice*) | §A/§B/§C |

`brain/MOC - tally.md` is the hub. To answer a domain question: `tally brain "<query>"` for ranked hits,
then `tally explain <BTS-/P-/O-/J-id>` for the full entry (situation / trap / resolution / acceptance /
source). Memory ✅ = this bootstrap **plus** the BM25 layer over `brain/` returning ranked hits.

## Version-sensitive facts (re-verified at build time by the RSI loop)

- HogQL raw-query cap = **120/hr** (actively tuned in `PostHog#28184` — re-check). Materialized endpoints
  ≈ 12,000/hr. Capture (ingest) is unmetered; reads on a personal key are the bottleneck.
- `PostHog/mcp` archived 2026-01-19 and `posthog-js-lite` archived → use hosted
  `https://mcp.posthog.com/mcp` (or the monorepo `services/mcp`) + mainline `posthog-js`.
- OpenFeature spec gaps OPEN (re-check): metrics/experiment hook #371, isolated instances #374, reactive
  updates #346 — until they close, use vendor-specific for experiment telemetry + per-agent isolation.

## Architecture Decisions / Key Patterns / What NOT to Do

- Identity-reachability = **N/A** (tool-employee; surfaces are CLI + MCP for agents, cockpit for humans).
- Acceptance gate = local-capture sink + flagd file-backed (no creds, $0); E2B live-boot is additive.
- Hard refuses: no `gen_ai.usage.*` into PostHog · no bare local-eval · no flag-key reuse · no
  peeked/SRM-failing winner · no `wizard --ci` flow (P10) · no archived `PostHog/mcp` clone (P9) · no
  GA4 product-analytics default (P25) · no net-new Statsig without an OpenFeature wrapper.

## Topic Files Index

(Deep-dives appended under `memory/topics/`; daily logs under `memory/daily/`; compressed >30d to
`memory/archive/` — never deleted.)
