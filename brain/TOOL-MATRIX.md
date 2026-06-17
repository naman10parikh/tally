---
title: "tally — Tool Matrix (default vs alts, agent surface, secrets)"
type: synthesis
created: "2026-06-16"
updated: "2026-06-16"
tags: [tool-matrix, posthog, openfeature, flagd, growthbook, launchdarkly, secrets, mcp, cli, tally]
domain: product-analytics-feature-flags
sources:
  - "raw/ecosystem-00-internal-references.md"
  - "raw/ecosystem-01-versions-and-changelog-deltas.md"
  - "raw/ecosystem-02-agent-operator-clis-apis-mcps.md"
  - "raw/ecosystem-03-experimentation-stats-privacy-ga4-funnels.md"
  - "raw/ecosystem-05-tradeoff-matrix-and-starter-repos.md"
  - "raw/field-06-migration-war-stories.md"
related: ["[[EXPERTISE-MAP]]", "[[OPINIONS]]", "[[KNOWN-PITFALLS]]", "[[GAPS-AND-DISPUTES]]"]
summary: "The canonical tools — default vs alternatives, when-to-use-which, the agent-access surface (CLI/API/MCP), and the exact env vars/secrets each needs. Feeds the Required-Secrets manifest in Wave P."
---

# tally — Tool Matrix

> Every tool tally might operate, with: **role**, **default-or-alt**, **agent surface** (how an *agent*
> drives it — MCP/CLI/API), **OSS/self-host**, and **secrets** (exact env-var names for Wave P's
> Required-Secrets manifest). The fleet has **already chosen PostHog** as the default
> ([ecosystem-00 §A]); this matrix justifies that and maps the field — it does not re-litigate it.
> Verified star counts + last-push dates are from `gh` on 2026-06-16. **Pin exact SDK semver at build
> time** from the cited releases pages — this domain moves weekly ([[GAPS-AND-DISPUTES]] §B).

---

## 0. The recommended stack at a glance

| Layer | tally default | Why | Fully-OSS escape hatch |
|---|---|---|---|
| **Analytics + flags + replay + experiments backend** | **PostHog** | one tool, agent-native (100+ MCP tools + agentic wizard), fleet default | self-host `posthog-foss` |
| **App-side flag API (Next.js/Vercel)** | **Vercel Flags SDK + `@flags-sdk/posthog`** | fleet is Next.js 15 + Vercel; PostHog is in the Vercel Marketplace | — |
| **App-side flag API (non-Vercel / anti-lock-in)** | **OpenFeature** | provider-swappable; Statsig saga + LD outage are the proof-cost | flagd as the provider |
| **Autonomous OSS flag loop (zero SaaS)** | **OpenFeature + flagd** | CLI-first, file-backed, hot-reload, no API key | (this *is* the OSS path) |
| **Serious experiment stats (when PostHog's aren't enough)** | **GrowthBook** (bolt-on for that metric, via OpenFeature) | CUPED/sequential/Bayesian in the open; don't rip-and-replace | self-host (MIT core) |
| **Privacy-first WEB stats (optional, ≠ product analytics)** | **Plausible CE** | AGPL self-host, GA4 replacement | (this *is* the OSS path) |
| **CDP (only at ≥3 destinations)** | **RudderStack** (warehouse-first) | data in your warehouse; cost-sensitive at scale | self-host `rudder-server` |

**The two cardinal agent rules** ([[OPINIONS]] O13/O14): **materialize reads** (never loop raw HogQL —
120/hr cap) and **own the raw event stream** (warehouse-first — migration insurance).

---

## 1. PostHog — THE default (analytics + flags + replay + experiments + errors + warehouse)

- **Role:** the whole product-analytics+flags plane in one tool. Fleet default. [ecosystem-00 §A]
- **OSS/self-host:** ✅ OSS (PostHog license); `posthog-foss` is the read-only FOSS mirror for a clean
  self-host base. Repo `PostHog/posthog` ~28k★, pushed daily. [ecosystem-05 §2]
- **Honest cost:** breadth > depth — each module is "good," none best-in-class; the HogQL read limit is
  harsh (120/hr). If one module is outgrown, bolt on a specialist via OpenFeature; don't rip out. [ecosystem-05 §1b]

### Agent surface — PostHog MCP (the primary surface, 100+ tools / 8 categories)
- **Install (current 2026):** `claude mcp add --transport http posthog https://mcp.posthog.com/mcp -s user`
  — or `npx @posthog/wizard mcp add`, or `claude plugin install posthog`. Endpoint
  `https://mcp.posthog.com/mcp` (HTTP) / `…/sse` (legacy). [ecosystem-02 §1a]
- **⚠️ Dead-repo trap:** `PostHog/mcp` is **archived** (2026-01-19) → use the hosted endpoint or the
  monorepo `services/mcp`. ([[KNOWN-PITFALLS]] P9.)
- **Tool categories (exact counts):** Feature Flags (21), Experiments (24), Query/HogQL (13),
  Dashboards (15), Error Tracking (17), Insights (9), Org/Project (3), Docs Search (1). [ecosystem-02 §1b]
- **Agent-gold tools to know by name:**
  - Safe rollout: `feature-flags-user-blast-radius-create` (reach pre-check),
    `feature-flags-test-evaluation-create` (dry-run eval), `scheduled-changes-*` (queue, don't flip live).
  - Experiments: `experiment-stats`, `experiment-results-get`, `experiment-ship-variant`,
    `experiment-timeseries-results` (detect a peeking trap).
  - Query: typed `query-funnel`/`query-retention`/`query-trends`/`query-paths`/`query-stickiness`
    (prefer these); `execute-sql` (raw HogQL escape hatch — rate-limited, use sparingly).
- **Auth/scopes:** personal API key with at least **`Query Read`** (PostHog suggests the prebuilt
  **Zapier scope** + Read on Insights). [ecosystem-02 §1c]
- **Rate limits (the numbers an autonomous loop hits):** analytics 240/min · 1,200/hr; `/query`
  2,400/hr; **HogQL 120/hr ⚠️**; project-level 3 concurrent queries; **materialized "Endpoints"
  1,200/min burst / 12,000/hr / 10 concurrent**; **capture (ingest) effectively unmetered** (project
  key, not personal). Rule: "rate limits apply if the personal API key is used." [ecosystem-02 §6]

### Agent surface — PostHog Wizard (`@posthog/wizard`, ~140★, very active)
- The agentic auto-instrumenter: scans a codebase, derives events from real flows, writes `.env`,
  instruments client+server, generates dashboards, optionally installs the MCP. **THE reference for "an
  agent that instruments analytics into a codebase"** — exactly tally's job. [ecosystem-02 §2, ecosystem-05 §2]
- **⚠️ Headless wall:** `--ci` mode is **disabled in published builds** (LLM gateway won't grant scopes)
  → do NOT build tally's autonomous loop on `wizard --ci`; run interactive once or use SDK+MCP.
  ([[KNOWN-PITFALLS]] P10.)

### Secrets (PostHog) — for Wave P
| Env var | What | Used by | Notes |
|---|---|---|---|
| `POSTHOG_PERSONAL_API_KEY` | personal API key (`phx_…`) | MCP reads, flag mgmt, queries, wizard | rate-limited surface; scope ≥ Query Read + Zapier |
| `POSTHOG_PROJECT_API_KEY` | project (public) key (`phc_…`) | capture/ingest + flag `decide` | **unmetered** ingest; never use the personal key for capture |
| `POSTHOG_HOST` | instance URL | all | `https://us.i.posthog.com` / `https://eu.i.posthog.com` / self-host URL |
| `POSTHOG_PROJECT_ID` | numeric project id | query endpoints | needed for `/api/project/:id/query` |
| (wizard alt) `POSTHOG_WIZARD_API_KEY` | wizard auth | `@posthog/wizard` | env alias for `--api-key` |

> **Key-class rule (encode it):** capture/decide → **project** key (`phc_`); reads/management →
> **personal** key (`phx_`). Mixing them → 401s + unexpected rate limits ([[KNOWN-PITFALLS]] P4).

---

## 2. OpenFeature + flagd — the vendor-neutral flag layer / fully-OSS escape hatch

- **Role:** OpenFeature is the *spec + thin SDK + provider adapters* (the anti-lock-in call-site API);
  **flagd** is the OSS reference *backend* (the actual flag daemon). OpenFeature needs a backend behind
  it (PostHog, flagd, GrowthBook, LaunchDarkly, Flagsmith). [ecosystem-01 §8, ecosystem-02 §3/§4]
- **When to use:** OpenFeature at every flag call-site from line one (provider-swappable —
  [[OPINIONS]] O15). flagd when you want a 100%-OSS, CLI-first, agent-autonomous flag loop with zero
  SaaS. **The Statsig ownership saga + Oct-2025 LaunchDarkly/AWS outage are the proof-costs.** [field-06 §4]
- **OSS/self-host:** ✅ CNCF. OpenFeature is "stable" at v1 (`@openfeature/server-sdk`,
  `@openfeature/web-sdk`, + .NET/Go/Java/Python). flagd `open-feature/flagd` ~931★, healthy. [ecosystem-01 §8]

### Agent surface
- **flagd POSIX CLI** — runs as sidecar / in-process / central service; serves **OFREP on port 8016**
  (`--ofrep-port` to change); supports boolean/integer/float/object flags. Two resolver modes: **RPC**
  (remote over gRPC) vs **In-Process** (download rules, evaluate locally — **zero network per eval,
  ideal for an agent that can't tolerate latency/outage**). **Agent-gold:** write a flag JSON file →
  flagd hot-reloads → eval changes, no SaaS/dashboard/API key. [ecosystem-02 §4]
- **OpenFeature CLI** (`generate`, **experimental — "expect breaking changes"**) — reads a JSON flag
  manifest → emits **strongly-typed flag accessors** (C#/Go/Java/NestJS/Node/Python/React, all alpha),
  killing string-literal flag keys (a removed flag becomes a *compile error*). [ecosystem-02 §3]
- **Multi-Provider (2026 delta):** wrap multiple providers behind one interface (route keys to
  providers / first-match / comparison). Go SDK multi-provider published 2026-01-13. Lets tally A/B
  between flagd and a SaaS provider. [ecosystem-01 §8]
- **⚠️ Spec maturity:** metrics-hook (#371), isolated instances (#374), reactive updates (#346) are
  **OPEN** — use OpenFeature for *evaluation portability* only; vendor-specific for experiment
  telemetry / per-agent isolation ([[KNOWN-PITFALLS]] P26).

### Secrets (OpenFeature/flagd)
| Env var | What | Notes |
|---|---|---|
| `FLAGD_HOST` / `FLAGD_PORT` | flagd endpoint | default OFREP port **8016** |
| `FLAGD_RESOLVER` | `rpc` \| `in-process` | in-process for offline/low-latency agent loops |
| `FLAGD_SOURCE_PATH` | path to the flag JSON file(s) | file-backed → hot-reload (no key needed) |

> flagd's killer property for an agent: **no secret needed** for the file-backed local loop — it's a
> JSON file you write and flagd watches. The fully-autonomous, fully-OSS flag path.

---

## 3. Vercel Flags SDK + `@flags-sdk/posthog` — the fleet's actual app-side flag API

- **Role:** provider-agnostic flags for **Next.js / SvelteKit** (`isFeatureEnabled`,
  `featureFlagValue`, `featureFlagPayload`). **Directly relevant: the fleet is on Next.js 15 + Vercel.**
  PostHog joined the Vercel Marketplace; March-2026 PostHog↔Vercel integration. **Likely tally's actual
  app-side flag API in fleet products.** [ecosystem-05 §2]
- **Agent surface:** code-level SDK (an agent edits the flag definition in code / via the PostHog MCP
  backend). Pairs PostHog-as-backend with a Vercel-native call site.
- **Secrets:** uses the PostHog keys above (§1) as the provider backend; no new secret class.

---

## 4. GrowthBook — the serious-experiment-stats bolt-on

- **Role:** OSS flags + experiments + product analytics; **warehouse-native**; statistically the most
  serious OSS experimentation engine (CUPED / sequential / Bayesian in the open). **Use as a bolt-on
  for a specific load-bearing metric via OpenFeature — don't rip out PostHog.** [ecosystem-05 §1b]
- **OSS/self-host:** ✅ MIT core; `growthbook/growthbook` ~7,890★, very active; 3B+ evals/day
  self-hosted. [ecosystem-05 §2]
- **2026 delta (agent-relevant):** **custom-JS validation hooks** (self-hosted) — write JS that hooks
  into validation: *require flags to have tags, block targeting rules containing PII, enforce naming
  conventions.* This is **governance-as-code** — directly applicable to tally's flag-hygiene + anti-rot
  skills. [ecosystem-01 §4]
- **Agent surface:** REST API + per-language SDKs. **No prominent first-party MCP found** (verify —
  [[GAPS-AND-DISPUTES]] §D4).
- **Secrets:**
  | Env var | What |
  |---|---|
  | `GROWTHBOOK_API_HOST` | self-host/cloud API base |
  | `GROWTHBOOK_CLIENT_KEY` | SDK client key (read flags) |
  | `GROWTHBOOK_API_KEY` | management/admin API |

---

## 5. LaunchDarkly — the enterprise flag incumbent (alt, not default)

- **Role:** enterprise flag governance (audit/approval workflows), FDv2 determinism, **AgentControl**
  (runtime control of AI agents in prod without redeploy — "swap model/prompt/tool-set of a live agent"
  = a flag evaluation). [ecosystem-01 §2]
- **OSS/self-host:** ❌ closed; most expensive; seat+context pricing. Pick only on an enterprise
  mandate (audit/approval). [ecosystem-05 §1]
- **2026 delta:** **FDv2 GA (May 2026)** for server SDKs (Java/Python/Go/Node/.NET/Ruby) — two-phase
  init, data-saving mode, **file-based initialization** (init from a flag file → deterministic for
  tests/agents/air-gapped). [ecosystem-01 §2]
- **Agent surface:** REST + per-language SDKs; FDv2 file-init; AgentControl is itself an agent-runtime
  API. **No prominent first-party MCP** (as of 2026-06; verify — [[GAPS-AND-DISPUTES]] §D4).
- **⚠️ Lock-in + outage:** "every LaunchDarkly SDK call ties you to the platform"; Oct-2025 AWS outage
  took it offline (unreachable kill-switch). → if used, **wrap in OpenFeature**, keep a local fallback.
  [field-06 §4]
- **Secrets:**
  | Env var | What |
  |---|---|
  | `LAUNCHDARKLY_SDK_KEY` | server-side SDK key |
  | `LAUNCHDARKLY_CLIENT_ID` | client-side id |
  | `LAUNCHDARKLY_API_TOKEN` | REST/management |

---

## 6. Statsig — warehouse-native experiments (⚠️ continuity risk — avoid net-new)

- **Role:** warehouse-native experiments at scale (runs in Snowflake/BigQuery/Databricks; data never
  leaves your warehouse). Strong AI-company adoption. [ecosystem-01 §3]
- **⚠️ Continuity risk (the migration story of the year):** OpenAI acquired Statsig $1.1B (Sep-2025) →
  **Amplitude took the brand/platform/customers (May-2026) but the engineers stayed at OpenAI.** The
  product is now run by a *different company than built it.* **Do NOT recommend net-new standardization
  on the Statsig SDK without an OpenFeature wrapper.** If inherited, wrap and plan an exit. [ecosystem-01 §0.1/§3]
- **Agent surface:** SDK/REST. **Secrets:** `STATSIG_SERVER_SECRET_KEY`, `STATSIG_CLIENT_SDK_KEY`.

---

## 7. Amplitude — analytics incumbent (alt; now also owns Statsig brand)

- **Role:** cross-surface persistent behavioral cohorts (persist across Analytics / Web Experimentation
  / Feature Experimentation / Guides & Surveys); ships **vendor "AI Agents"** that query first-party
  data; bundles flags + replay free. [ecosystem-01 §5]
- **OSS/self-host:** ❌ closed; **MTU-based pricing punishes apps with many low-value users**; now a
  two-product stitch (owns Statsig). Pick when a marketing+product team wants cohorts everywhere and
  closed-source is OK. [ecosystem-05 §1]
- **Agent surface:** Export API (time-windowed) + ingestion API + warehouse connectors; the "AI Agents"
  are *vendor-internal*, not an MCP you operate ([[GAPS-AND-DISPUTES]] §D4).
- **Secrets:** `AMPLITUDE_API_KEY`, `AMPLITUDE_SECRET_KEY` (Export API uses both).

---

## 8. Mixpanel — pure event analytics (alt; no flags)

- **Role:** fast pure-event slice/dice; one of the most generous free tiers (20M events/mo). **No
  flags.** [ecosystem-01 §6, ecosystem-05 §1]
- **2026 planning fact:** switched **entirely to event-based pricing (Feb 2025)** — model your event
  *volume*, not user count; pricing spikes past ~10M events/mo. [ecosystem-01 §6]
- **Agent surface:** Export API (`from_date`/`from_date` time-window — same cursor/time-window contract
  as every analytics export). **Secrets:** `MIXPANEL_PROJECT_TOKEN`, `MIXPANEL_API_SECRET`.

---

## 9. CDP layer — Segment vs RudderStack (the pipe *in front of* analytics, not a replacement)

- **Role:** collection + routing + identity-resolution that fans events out to analytics + warehouse +
  marketing. **NOT an analytics competitor** — usually **overkill until ≥3 destinations.** [ecosystem-01 §7, ecosystem-05 §1b]
- **Segment (Twilio):** managed, huge integration catalog; cloud-only (warehouse = destination, not
  core); **MTU-priced** (~$120/mo Team); opaque Profiles pricing. ❌ OSS.
- **RudderStack:** **warehouse-first** (data in your Snowflake/BigQuery/Redshift); **event-volume
  priced** (~$220/mo Starter; rETL free 10 connections); OSS core `rudderlabs/rudder-server` ~4,437★.
- **⚠️ Migration trap:** different pricing axes (MTU vs event-volume) can *invert* the cost comparison —
  model the bill on the destination's axis with YOUR shape; dual-write+reconcile before cutover
  ([[BATTLE-TESTED-SCENARIOS]] BTS-14). [field-06 §3]
- **Agent surface:** HTTP tracking API (Segment spec: `track`/`identify`/`group`/`page`/`screen`).
- **Secrets:** `SEGMENT_WRITE_KEY` · `RUDDERSTACK_WRITE_KEY` + `RUDDERSTACK_DATA_PLANE_URL`.

---

## 10. Privacy-first WEB analytics — Plausible vs Fathom (GA4 replacement, ≠ product analytics)

> **Plane note:** these are **web/marketing** analytics (pageviews/referrers/UTM), NOT in-app
> event/funnel/flag analytics. They replace **GA4**, not PostHog. [ecosystem-03 §3]

| | **Plausible** (tally default for web stats) | **Fathom** |
|---|---|---|
| License | **AGPL — self-hostable CE (free)** | **closed, cloud-only, NO self-host** |
| Entry | $9/mo (10k pv) → $19/mo (100k pv, 50 sites) | $15/mo (100k pv, unlimited sites) |
| Retention | 2 years | 3 years |
| Compliance | GDPR by design, EU-hosted, no consent banner | SOC2 Type II, HIPAA, no consent banner |
| Funnels/UTM | basic | **nicer goal funnels + UTM** (closer to GA4) |

- **Pick:** **Plausible CE** for "privacy-first web stats, self-host, zero SaaS" (matches fleet OSS-first
  posture; `plausible/analytics` ~27,180★). Fathom only if you need compliance certs + accept
  closed/cloud (you can *never* self-host it — a hard no for the "agent owns its stack" thesis). Also in
  field: Umami (OSS), Matomo (heaviest/most GA-like). [ecosystem-03 §3, ecosystem-05 §2]
- **Agent surface:** Stats API. **Secrets:** `PLAUSIBLE_API_KEY` + `PLAUSIBLE_SITE_ID` · `FATHOM_API_TOKEN`.

---

## 11. GA4 — only if marketing needs Google Ads attribution (NOT a product-analytics default)

- **Role:** free web analytics with Google's reach + Looker/BigQuery export; cross-channel data-driven
  attribution is now the default model. [ecosystem-03 §4]
- **⚠️ Why NOT the default:** sampling; **event-level retention auto-collapses to 2 months** past 25B
  billable events/31 days (silent history loss); **Consent Mode v2 mandatory for EEA** (non-compliant
  → lose audience features); no self-host; hard limits (event name ≤40 chars, ≤25 params, ≤500 names/
  user, 48h dim-deletion delay). **Do not pipe product events into GA4.** [ecosystem-03 §4, KNOWN-PITFALLS P25]
- **Agent surface:** Data API (quota-limited). **Secrets:** `GA4_PROPERTY_ID` + a service-account JSON
  (`GOOGLE_APPLICATION_CREDENTIALS`).

---

## 12. Adjacent / build-your-own references (not tally's domain, but the border)

- **`FrigadeHQ/trench`** (~1,640★) — OSS analytics *infrastructure*: single Docker image on
  ClickHouse+Kafka+Node for event tracking. The blueprint if tally ever needs its *own* lightweight
  ingest plane (the ClickHouse+Kafka pattern PostHog also uses). [ecosystem-05 §2]
- **`Unleash/unleash`** (~13,589★, most-starred OSS feature-management platform) and
  **`flagsmith/flagsmith`** (~6,413★) — standalone OSS flag platforms with full UI/admin, alternatives
  to flagd when you want an admin layer without PostHog. [ecosystem-05 §2]
- **`getsentry/sentry`** (~44,113★) — the adjacent error/crash slot (the fleet's error-tracking
  default per ecosystem-00; **distinct** from product analytics). The border, not tally's domain. [ecosystem-05 §2]
- **Langfuse v3** — the LLM-observability plane (`gen_ai.usage.*` OpenTelemetry spans).
  **Do NOT conflate with tally** — product analytics ≠ LLM tracing ([[OPINIONS]] O18). [ecosystem-00 §A]

---

## 13. Required-Secrets manifest seed (for Wave P)

> **Minimum to be operational on the default stack** = the PostHog block. Everything else is opt-in by
> capability. tally inherits the generic Energy `.env.example` (which has no analytics secrets yet) —
> these are the **net-new** secrets tally must add.

**Tier 0 — REQUIRED (default stack, PostHog):**
```
POSTHOG_PERSONAL_API_KEY=phx_...      # reads / flags / experiments / queries / wizard (rate-limited)
POSTHOG_PROJECT_API_KEY=phc_...       # capture/ingest + flag decide (unmetered)
POSTHOG_HOST=https://us.i.posthog.com # or eu / self-host URL
POSTHOG_PROJECT_ID=12345              # for /api/project/:id/query
```

**Tier 1 — OSS flag escape hatch (no secret needed for the file-backed loop):**
```
FLAGD_HOST=localhost
FLAGD_PORT=8016
FLAGD_RESOLVER=in-process
FLAGD_SOURCE_PATH=./flags/flags.json
```

**Tier 2 — opt-in alternates (only if that capability is chosen):**
```
# Experiment-stats bolt-on
GROWTHBOOK_API_HOST=... ; GROWTHBOOK_CLIENT_KEY=... ; GROWTHBOOK_API_KEY=...
# Enterprise flags (wrap in OpenFeature)
LAUNCHDARKLY_SDK_KEY=... ; LAUNCHDARKLY_CLIENT_ID=... ; LAUNCHDARKLY_API_TOKEN=...
# Inherited/avoid-net-new (continuity risk)
STATSIG_SERVER_SECRET_KEY=... ; STATSIG_CLIENT_SDK_KEY=...
# Analytics incumbents (Export APIs)
AMPLITUDE_API_KEY=... ; AMPLITUDE_SECRET_KEY=...
MIXPANEL_PROJECT_TOKEN=... ; MIXPANEL_API_SECRET=...
# CDP (only at ≥3 destinations)
SEGMENT_WRITE_KEY=... | RUDDERSTACK_WRITE_KEY=... ; RUDDERSTACK_DATA_PLANE_URL=...
# Privacy web stats (≠ product analytics)
PLAUSIBLE_API_KEY=... ; PLAUSIBLE_SITE_ID=... | FATHOM_API_TOKEN=...
# GA4 (only for Google Ads attribution)
GA4_PROPERTY_ID=... ; GOOGLE_APPLICATION_CREDENTIALS=/path/sa.json
```

**MCP wiring note:** tally's `.mcp.json` currently has github/context7/memory/obsidian (vault=`./brain`).
To make tally agent-operable on its own domain, **add the PostHog MCP**:
```
claude mcp add --transport http posthog https://mcp.posthog.com/mcp -s user
```
(uses `POSTHOG_PERSONAL_API_KEY`). This is the single highest-value MCP addition for this employee.

---

## 14. The decision tree (one screen)

1. **One tool, agent-operable, OSS, covers everything?** → **PostHog** (fleet default).
2. **Only flags+experiments with serious stats, self-host?** → **GrowthBook.**
3. **Anti-vendor-lock-in flag layer?** → **OpenFeature** app-API + **PostHog or flagd** backend.
4. **Privacy-first WEB stats to replace GA4, self-host?** → **Plausible CE.**
5. **Need a CDP (≥3 destinations + identity resolution)?** → **RudderStack** (warehouse-first) /
   **Segment** (managed) — *in front of* PostHog, not instead of it.
6. **Enterprise flag governance mandate?** → **LaunchDarkly** (wrapped in OpenFeature).
7. **Inherited Statsig?** → wrap in OpenFeature, plan an exit (continuity risk).
[ecosystem-05 §1a]
