# AGENTS.md — tally (product analytics + feature flags + experiments)

> How an agent uses tally. tally is a **tool-employee** consumed by coding agents (Claude Code, the
> energy hub, sibling employees) via **CLI + MCP**, and by humans via a read-mostly cockpit. Identity
> reachability is **N/A** — the surfaces are CLI + MCP (agents) and the cockpit (the chairman).

## What tally is

A product-analytics + feature-flags + experiments employee. It treats the tracking plan as code
(a CI-gated event registry), fails closed on the irreversible classes, and operates as an agent
(materialized reads, typed queries). It is an **enforcer, not a linter** — a wall, not a warning.

**Stack:** PostHog (analytics + flags + replay + experiments, agent-native MCP) · OpenFeature
(call-site API) · flagd ($0 OSS file-backed flag loop) · GrowthBook (serious-stats bolt-on via
OpenFeature, NOT rip-and-replace) · Plausible CE (privacy web stats — a *different plane*).

## The boundary (three planes — the most load-bearing fact)

tally owns **in-app product events / funnels / retention / cohorts / experiments / feature flags**.

- `gen_ai.usage.*` LLM token spend / $/call / cost-per-model → **agentmoney**. **NEVER pipe an LLM span
  into PostHog as a product event** (the cardinal refusal, O18). tally never holds a token-cost metric.
- App health / errors / uptime / latency / SLO / on-call → **canary** (product behavior vs system
  health — both can fire on one user action; different stores, different questions).
- Web pageview / referrer / UTM marketing stats → the **Plausible/Fathom plane** (replaces GA4, not
  PostHog). Web stats are not product events.
- A CDP (Segment/RudderStack) = the *collection pipe in front of* PostHog, not an analytics competitor
  (usually overkill below ≥3 destinations).

## Tools — the CLI (`tally`)

Every operation has a deterministic, `--json`, non-interactive path. Browser/computer-use is N/A —
tally operates PostHog/flagd via MCP/CLI/REST, not a web browser.

| Command | What it does | Brain anchors |
| --- | --- | --- |
| `tally track-plan <dir> [--app] [--out] [--json]` | Emit a typed, CI-gated canonical event registry (the dedup ledger) + a CI check that **fails the build** on an unregistered/case-variant/type-mutated event | J1, O1/O2, BTS-1 |
| `tally wire-flag <key> [--provider posthog|flagd] [--target …] [--json]` | Wire a flag through OpenFeature using **DB-eval or pinned props (never bare local-eval)** + a blast-radius pre-check | J4, O7/O15, BTS-12, P1/P2 |
| `tally capture-event <name> [--props <json>] [--sink local|posthog] [--json]` | Fire a registry-conformant typed event with **PII masked at the edge** + two-call `identify()` (`$set_once` acquisition) | J2/J3, O3/O4, BTS-2/3, P8 |
| `tally check-experiment <id|spec> [--json]` | **SRM-first → peeking-guard → pre-registration → multiple-comparison → CUPED/means/retention checks.** Fails closed, never advisory (the differentiator) | J5, O5/O6, BTS-4/5/16/17, P13–P17 |
| `tally audit-pii <dir> [--json]` | Scan the four PII hiding places (autocapture input meta / replay DOM / URLs / `identify()` props); verify mask-all-then-allowlist across web/iOS/RN | J3, O4, BTS-2, P8 |
| `tally flag-sweep [--json]` | Surface zombie flags (age + last-eval + owner), temporary≠permanent, removal diff, **refuse to reuse a retired key** (tombstone) | J6, O10/O11, BTS-6, P27 |
| `tally migrate-plan --from --to [--json]` | Dual-write + reconcile + **explain the delta** + event-id idempotency key + `flush()` >10k + derived-assets warning | J8, O16, BTS-7/8/14, P19–P23 |
| `tally read --query funnel|retention|trends [--materialize] [--json]` | Typed queries, **materialize recurring reads** (never loop raw HogQL → 120/hr), bounded retention + explicit conversion windows | J8, O13, BTS-11, P11/P17/P18 |
| `tally brain <query>` | BM25 search over the six `brain/` artifacts → ranked hits (file + ID + snippet) | the Memory queryable layer |
| `tally explain <BTS-/P-/O-/J-id>` | Print the scenario/pitfall/opinion/job by ID (situation / trap / resolution / acceptance / source) | the brain index |
| `tally eval` | Run the eval pyramid (L1 structural + L2 golden behavioral from BTS-1–BTS-17) | the dsip gate |

`--help` lists every command; `--version` exits 0; data commands take `--json`; exit 0 on success,
non-zero on failure.

## Tools — the MCP server

tally ships its **own** MCP server (stdio + a documented Streamable-HTTP path) exposing the
expertise operations: `track_plan` · `wire_flag` · `capture_event` · `check_experiment` · `audit_pii`
· `flag_sweep` · `migrate_plan` · `explain` · `search_brain`. It also **consumes** the hosted PostHog
MCP (`https://mcp.posthog.com/mcp`) for the query/operate lens — **never the archived `PostHog/mcp`
repo** (P9). Keys are env refs only; never committed.

## The four agent operating rules

1. **Materialize recurring reads** — never loop raw HogQL (120/hr cap). Typed queries over raw SQL.
2. **DB-eval or pinned props for flag targeting** — never bare local-eval (same user → different value).
3. **Never reuse a retired flag key** — tombstone forever; deprecate in three steps.
4. **Experiments Bayesian-or-sequential + SRM-first** — refuse a peeked / SRM-failing winner.

## What tally REFUSES (hard)

No `gen_ai.usage.*` into PostHog · no bare local-eval targeting · no flag-key reuse · no peeked/
SRM-failing winner shipped · no `wizard --ci` autonomous flow (headless wall, P10) · no cloning the
archived `PostHog/mcp` repo (use hosted endpoint, P9) · no GA4 as a product-analytics default (P25) ·
no net-new Statsig standardization without an OpenFeature wrapper.

## The brain (authoritative, queryable)

`brain/EXPERTISE-MAP.md` (J1–J8) · `brain/OPINIONS.md` (O1–O20) · `brain/KNOWN-PITFALLS.md` (P1–P27) ·
`brain/BATTLE-TESTED-SCENARIOS.md` (BTS-1–BTS-17, each Acceptance criterion = the eval gate) ·
`brain/TOOL-MATRIX.md` · `brain/GAPS-AND-DISPUTES.md`. Hub: `brain/MOC - tally.md`. Query it with
`tally brain` / `tally explain`. Version-sensitive facts are re-verified at build time.

## Whose vertical tally does NOT own

It *instruments analytics + flags into* what they produce: frontend → pixel · mobile → pebble ·
backend/runtime → turbo · DB → acorn · auth → badge · payments → penny · deploy/CI → rocket · secrets →
hush · errors/uptime → canary · email → pigeon · jobs/queues → bee · storage → shelf · rate-limit/cache
→ echo · search → truffle · compliance/SSO → stamp · i18n → parrot.
