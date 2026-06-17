---
title: "Ecosystem — What an AGENT (not a human) needs: CLIs, APIs, MCP servers"
type: source
created: "2026-06-16"
updated: "2026-06-16"
tags: [mcp, posthog-mcp, openfeature-cli, flagd, posthog-wizard, api, rate-limits, agent-operator, tally]
domain: product-analytics-feature-flags
researcher: ECOSYSTEM (CP123 Wave-R)
summary: "The agent-operator layer — every MCP/CLI/API surface for product analytics + flags, with the verbatim PostHog MCP tool inventory (100+ tools), the wizard's headless gotcha, and the exact rate limits an agent will hit."
related: ["[[ecosystem-01-versions-and-changelog-deltas]]", "[[ecosystem-00-internal-references]]"]
---

# Agent-Operator Layer — CLIs, APIs, MCP Servers

> This is tally's most load-bearing file: tally is an AGENT, not a human dashboard user.
> What an agent needs ≠ what a PM needs. Below: every programmable surface, the verbatim
> tool inventories, the headless gotchas, and the rate limits that will bite an autonomous loop.

---

## 1. PostHog MCP Server — THE primary agent surface (verbatim tool inventory)

### 1a. Install (current, 2026) — and the dead-repo gotcha
- **Current install (Claude Code, manual):**
  `claude mcp add --transport http posthog https://mcp.posthog.com/mcp -s user`
  - Source: <https://posthog.com/docs/model-context-protocol/claude-code> · 2026-06
- **Via wizard:** `npx @posthog/wizard mcp add` — or as a plugin: `claude plugin install posthog` (plugin = same MCP tools + built-in slash commands).
  - same source · 2026-06
- **Endpoint:** `https://mcp.posthog.com/mcp` (HTTP transport) or `…/sse` (legacy SSE). Auth = **personal API key**.
  - <http://mcp.posthog.com/> · 2026
- **⚠️ VERSION-SPECIFIC GOTCHA (real breakage):** the old standalone repo **`PostHog/mcp` was ARCHIVED 2026-01-19** (148★, read-only) and **moved into the monorepo at `PostHog/posthog/tree/master/services/mcp`**. An agent that follows a pre-2026 blog/README will `git clone` a dead repo and waste a loop. Canonical now = the hosted endpoint + monorepo path.
    - Verified via `gh api repos/PostHog/mcp` → `"archived": true, "pushed": "2026-01-19"`, 148 stars (read 2026-06-16).
    - Repo notice: "The MCP server has been moved into the PostHog Monorepo."

### 1b. The FULL tool inventory (verbatim, 100+ tools across 8 categories)
Source: <https://posthog.com/docs/model-context-protocol/tools> · read 2026-06-16. **Quote these names exactly** — they are the agent's actual API surface.

**Feature Flags (21 tools):**
`create-feature-flag`, `delete-feature-flag`, `feature-flag-get-all`, `feature-flag-get-definition`, `feature-flags-activity-retrieve`, `feature-flags-bulk-delete-create`, `feature-flags-bulk-keys-retrieve`, `feature-flags-bulk-update-tags-create`, `feature-flags-copy-flags-create`, `feature-flags-dependent-flags-retrieve`, `feature-flags-evaluation-reasons-retrieve`, `feature-flags-my-flags-retrieve`, `feature-flags-status-retrieve`, `feature-flags-test-evaluation-create`, `feature-flags-user-blast-radius-create`, `scheduled-changes-create`, `scheduled-changes-delete`, `scheduled-changes-get`, `scheduled-changes-list`, `scheduled-changes-update`, `update-feature-flag`
  - **Agent-gold:** `feature-flags-user-blast-radius-create` (how many users a flag change will hit — a safety pre-check before rollout) and `feature-flags-test-evaluation-create` (dry-run a flag eval for a synthetic user) are exactly what an autonomous flag-flipper needs to NOT cause an incident. `scheduled-changes-*` lets an agent queue a rollout instead of flipping live.

**Insights & Analytics (9):**
`insight-create`, `insight-delete`, `insight-get`, `insight-query`, `insight-update`, `insights-activity-retrieve`, `insights-all-activity-retrieve`, `insights-list`, `insights-trending-retrieve`

**Dashboards (15):**
`dashboard-create`, `dashboard-create-text-tile`, `dashboard-delete`, `dashboard-delete-tile`, `dashboard-get`, `dashboard-insights-run`, `dashboard-reorder-tiles`, `dashboard-tile-copy`, `dashboard-update`, `dashboard-update-text-tile`, `dashboard-widget-catalog-list`, `dashboard-widgets-batch-add`, `dashboard-widgets-run`, `dashboards-get-all`, `dashboards-move-tile-partial-update`

**Error Tracking (17):**
`error-tracking-assignment-rules-create`, `error-tracking-assignment-rules-list`, `error-tracking-grouping-rules-create`, `error-tracking-grouping-rules-list`, `error-tracking-grouping-rules-update`, `error-tracking-issues-merge-create`, `error-tracking-issues-partial-update`, `error-tracking-issues-split-create`, `error-tracking-suppression-rules-create`, `error-tracking-suppression-rules-list`, `error-tracking-suppression-rules-update`, `error-tracking-symbol-sets-download-retrieve`, `error-tracking-symbol-sets-list`, `error-tracking-symbol-sets-retrieve`, `query-error-tracking-issue`, `query-error-tracking-issue-events`, `query-error-tracking-issues-list`

**Experiments (24):**
`experiment-archive`, `experiment-copy-to-project`, `experiment-create`, `experiment-delete`, `experiment-duplicate`, `experiment-end`, `experiment-get`, `experiment-get-all`, `experiment-launch`, `experiment-list`, `experiment-pause`, `experiment-reset`, `experiment-results-get`, `experiment-resume`, `experiment-saved-metrics-create`, `experiment-saved-metrics-destroy`, `experiment-saved-metrics-list`, `experiment-saved-metrics-partial-update`, `experiment-saved-metrics-retrieve`, `experiment-ship-variant`, `experiment-stats`, `experiment-timeseries-results`, `experiment-unarchive`, `experiment-update`
  - **Agent-gold:** `experiment-stats` + `experiment-results-get` + `experiment-ship-variant` = an agent can read significance and ship the winner without a human. `experiment-timeseries-results` enables the agent to detect a peeking/early-stop trap (see ecosystem-03 stats).

**Query / HogQL (13):**
`execute-sql`, `query-funnel`, `query-lifecycle`, `query-lifecycle-actors`, `query-logs`, `query-metrics`, `query-paths`, `query-paths-actors`, `query-retention`, `query-stickiness`, `query-trends`, `query-trends-actors`
  - **Agent-gold:** `execute-sql` = arbitrary HogQL (the escape hatch). But the *typed* `query-funnel` / `query-retention` / `query-trends` are safer for an LLM to call than hand-writing SQL (fewer hallucinated columns — cf. field-01 property-mutation disaster). Prefer typed queries; fall back to `execute-sql`.

**Org/Project (3):** `projects-get`, `switch-organization`, `switch-project`
**Docs Search (1):** `docs-search` — agent can RAG PostHog's own docs in-loop.

### 1c. Auth & scopes (what the key must carry)
- The MCP/Query path requires a **personal API key with `Query Read`** at minimum; PostHog suggests "the prebuilt **Zapier scope** plus Read access to **Insights**."
  - <https://posthog.com/docs/api/query> · 2026
- **Rule of thumb (verbatim):** "if the personal API key is used for authentication" → rate limits apply. So an agent on a personal key is ALWAYS rate-limited (unlike capture, see §4).

---

## 2. PostHog Wizard — the agentic auto-instrumenter (and its headless wall)

**Repo:** `PostHog/wizard` (140★, last push 2026-06-17 — actively maintained). npm: `@posthog/wizard`.
- <https://github.com/PostHog/wizard> · <https://www.npmjs.com/package/@posthog/wizard>

### What it does (it IS an agent itself)
`npx @posthog/wizard@latest` — an **agentic CLI** that: (1) authenticates + installs the right SDKs; (2) **scans your codebase + architecture and creates custom events from real product flows**; (3) writes `.env` + instruments client- and server-side; (4) generates insights/dashboards in-app; (5) optionally installs the PostHog MCP server.
  - <https://github.com/PostHog/wizard/blob/main/README.md> · 2026

### Headless / CI flags (for tally to invoke another agent)
```
npx @posthog/wizard --ci --api-key $POSTHOG_PERSONAL_API_KEY --install-dir .
npx @posthog/wizard --ci --signup --email you@example.com --install-dir .
```
Flags: `--ci`, `--api-key` (phx_xxx) | env `POSTHOG_WIZARD_API_KEY`, `--install-dir`, `--signup`, `--email`, `--name`, `--region us|eu` (default us), `--integration nextjs|…` (else auto-detected).

### **⚠️ HEADLESS GOTCHA (real, current):**
> "**CI mode is currently disabled in published builds.** PostHog's LLM gateway doesn't yet grant the scopes the wizard needs to personal API keys for most users, so non-interactive `--ci` runs fail at the gateway."
  - <https://github.com/PostHog/wizard/blob/main/README.md> · read 2026-06-16.
- **Implication for tally:** do NOT design an autonomous flow that depends on `wizard --ci` today — it will fail at the gateway. Either run the *interactive* wizard once (human-in-loop) or instrument via the SDK + MCP `create-feature-flag`/`insight-create` directly. This is the kind of "the docs say it works but it doesn't" trap the mission asked me to surface.

---

## 3. OpenFeature CLI — typed flag accessors (the anti-stringly-typed-flags tool)

**Status:** **experimental** ("expect breaking changes"), CNCF incubating, current through 2026.
  - <https://openfeature.dev/docs/tutorials/open-feature-cli/> · 2026
- **Command:** `generate` — reads a **JSON flag manifest** and emits **strongly-typed flag accessors**, eliminating string-literal flag keys (the #1 source of flag typos in code).
- **Targets (all alpha):** C#, Go, Java, NestJS, Node.js, Python, React.
- **Taste:** even experimental, this is the right pattern for tally — a flag key as a typed symbol can't be misspelled, and a removed flag becomes a compile error. Pair with `flagd` (below) for a 100% OSS, agent-operable flag stack.

---

## 4. flagd — the OSS, Unix-philosophy flag daemon (agent's local flag backend)

**Repo:** `open-feature/flagd` (931★, last push 2026-06-15 — healthy). Go.
  - <https://github.com/open-feature/flagd> · <https://flagd.dev/>
- **What it is:** a ready-made OpenFeature-compliant flag **backend**, configurable entirely via a **POSIX-style CLI**. Runs as a **sidecar**, **in-process engine**, or **central service** evaluating *thousands of flags/sec*.
- **OFREP (OpenFeature Remote Evaluation Protocol):** flagd serves OFREP on **port 8016 by default** (`--ofrep-port` to change). Supports **boolean, integer, float, object** flag types.
  - <https://flagd.dev/reference/flagd-ofrep/> · 2026
- **Two resolver modes:** **RPC** (evaluate remotely over gRPC) vs **In-Process** (download flag-set rules, evaluate locally — zero network per eval, ideal for an agent that can't tolerate latency/outage).
  - <https://flagd.dev/reference/specifications/providers/> · 2026
- **Agent-gold:** because flagd is CLI-first + file-backed, an agent can **write a flag JSON file → flagd hot-reloads → eval changes** with no SaaS, no dashboard, no API key. This is the fully-autonomous, fully-OSS flag loop. Pairs with OpenFeature multi-provider to A/B between flagd and a SaaS provider.

---

## 5. Other vendors' agent surfaces (honest coverage)

- **LaunchDarkly:** REST API + per-language SDKs; **FDv2 file-based initialization** (init flags from a file → deterministic for tests/agents/air-gapped). **AgentControl** is itself the "agent runtime control" API. No first-party MCP as prominent as PostHog's (as of 2026-06; verify in GAPS).
  - <https://launchdarkly.com/docs/sdk/features/ai-config> · 2026
- **GrowthBook:** REST API + SDKs; **2026 self-host custom-JS validation hooks** let an agent enforce naming/PII/tag rules programmatically at flag-create time (governance-as-code). No prominent first-party MCP found (GAPS).
  - <https://www.growthbook.io/blog/how-to-implement-feature-flags-at-scale> · 2026
- **Amplitude / Mixpanel:** Export APIs (time-windowed) + ingestion APIs + warehouse connectors. Amplitude has "**AI Agents**" that query first-party data (vendor-internal agent, not an MCP you operate). Mixpanel `/export` uses `from_date`/`to_date` (same cursor/time-window contract as ecosystem-00 §B.5).
  - <https://amplitude.com/compare/best-product-analytics-tools> · 2026
- **RudderStack/Segment:** HTTP tracking APIs (Segment spec: `track`/`identify`/`group`/`page`/`screen`); RudderStack OSS server is self-hostable (`rudderlabs/rudder-server`, 4,437★).

---

## 6. PostHog API rate limits — the numbers an autonomous loop WILL hit

Source: <https://posthog.com/docs/endpoints/rate-limits>, <https://posthog.com/docs/api/query>, archived API queries doc · read 2026-06-16.

| Surface | Limit | Notes |
|---|---|---|
| Analytics endpoints (insights/persons/recordings) | **240/min, 1,200/hour** | per personal API key |
| Query endpoint (`/query`) | **2,400/hour** | higher than general analytics |
| **HogQL query endpoint** (`/api/project/:id/query`) | **120/hour** ⚠️ | the HARSH one — an agent doing per-event SQL will exhaust this fast |
| Project-level (archived doc) | 1,200/hr, 120/min, **3 concurrent queries** | concurrency cap matters for a swarm |
| **Materialized endpoints** (the new "Endpoints GA" feature) | **1,200/min burst, 12,000/hour sustained, 10 concurrent** | ← why "Endpoints GA" matters: 10x the throughput of raw HogQL |
| **Event capture / ingestion** | effectively unmetered for normal use | capture uses the *project* (public) key, NOT a personal key → **not subject to the personal-key rate limits above** |

- **Verbatim rule:** "A rule of thumb for whether rate limits apply is if the personal API key is used for authentication."
  - <https://posthog.com/docs/endpoints/rate-limits> · 2026
- There is an open PR for a **custom `/query` rate limit when using a personal API key** (`PostHog/posthog#28184`) — limits are actively being tuned, so pin and re-check.
  - <https://github.com/PostHog/posthog/pull/28184>

### **Taste / the load-bearing operating rule for tally:**
An autonomous analytics agent that loops `execute-sql` (raw HogQL) will hit **120/hour** and stall. The correct agent pattern is: **materialize the recurring query once via "Endpoints GA" → poll the materialized endpoint (12,000/hr) instead of re-running HogQL.** This is the single most important rate-limit insight for an agent operator and directly mirrors ecosystem-00 §B.5's "persist, don't recompute" discipline. Capture (ingest) is cheap; *reads* are the bottleneck.
