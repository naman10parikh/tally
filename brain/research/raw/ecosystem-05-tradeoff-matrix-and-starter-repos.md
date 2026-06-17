---
title: "Ecosystem — Honest trade-off matrix + the best starter/template repos"
type: source
created: "2026-06-16"
updated: "2026-06-16"
tags: [tradeoff-matrix, starter-repos, posthog, growthbook, flagd, plausible, vercel-flags, decision, tally]
domain: product-analytics-feature-flags
researcher: ECOSYSTEM (CP123 Wave-R)
summary: "The honest competing-tools trade-off matrix with explicit taste + the 5 best starter/template repos (stars + last-commit + why), all star counts verified via gh on 2026-06-16."
related: ["[[ecosystem-01-versions-and-changelog-deltas]]", "[[ecosystem-02-agent-operator-clis-apis-mcps]]"]
---

# Honest Trade-off Matrix + Best Starter Repos

> Star counts + last-push dates verified via `gh api repos/<r>` on 2026-06-16. Taste is explicit
> and opinionated per the no-slop bar. The fleet has ALREADY chosen PostHog (ecosystem-00 §A) —
> this matrix justifies that and maps the field, it does NOT re-litigate it.

---

## 1. The honest trade-off matrix (product analytics + flags + experiments)

| Tool | Best at | Worst at / honest cost | OSS / self-host | Has flags | Has replay | Warehouse-native | Agent surface (MCP/CLI) | When to pick |
|---|---|---|---|---|---|---|---|---|
| **PostHog** ⭐default | Everything-in-one (analytics+flags+replay+experiments+errors+warehouse) | Breadth > depth: each module "good," none best-in-class; HogQL read rate-limit harsh (120/hr) | ✅ OSS (PostHog license) | ✅ | ✅ | ✅ ClickHouse/HogQL | **Best: full MCP (100+ tools) + agentic wizard** | Default for fleet; one tool, one stack, agent-operable |
| **GrowthBook** | Statistically serious experiments (CUPED/sequential/Bayesian) + flags, self-host | No session replay; analytics weaker than PostHog | ✅ OSS (MIT core) | ✅ | ❌ | ✅ | REST + 2026 custom-JS validation hooks; no prominent MCP | Want rigorous experiments + flags only, self-host, warehouse-native |
| **LaunchDarkly** | Enterprise flag governance, FDv2 determinism, AgentControl | Closed; most expensive; seat+context pricing | ❌ | ✅ (flags-first) | ❌ | partial | REST/SDK; FDv2 file-init; AgentControl = agent-runtime API; weak MCP | Enterprise mandate; need audit/approval workflows |
| **Statsig** | Warehouse-native experiments at scale | **Continuity risk** — Amplitude owns brand, builders → OpenAI (May 2026) | ❌ | ✅ | partial | ✅ | SDK/REST | Avoid net-new standardization; wrap in OpenFeature if inherited |
| **Amplitude** | Cross-surface persistent behavioral cohorts; AI Agents on first-party data | MTU pricing punishes many low-value users; two-product stitch (now owns Statsig) | ❌ | ✅ (bundled free) | ✅ | partial | Export API + vendor "AI Agents" (not your MCP) | Marketing+product team wants cohorts everywhere, closed-source OK |
| **Mixpanel** | Fast pure-event slice/dice; generous free (20M events) | No flags; pricing spikes past ~10M events/mo | ❌ | ❌ | ❌ | partial (connectors) | Export API (`from_date`/`to_date`) | Pure event analytics, no flags needed |
| **Segment** | Mature managed CDP, huge integration catalog | Cloud-only; warehouse = destination not core; opaque Profiles pricing | ❌ | ❌ | ❌ | ❌ | HTTP track/identify/group/page | Already on Twilio; need 100s of destinations, budget exists |
| **RudderStack** | Warehouse-first CDP; rETL free tier; OSS server | Still a CDP (collection/routing) not analytics; ops overhead self-hosted | ✅ OSS core | ❌ | ❌ | ✅ | HTTP API; self-host `rudder-server` | Want CDP routing with data in your own warehouse, cost-sensitive at scale |
| **OpenFeature + flagd** | Vendor-neutral flag eval; 100% OSS; CLI-first; zero SaaS | Spec gaps (metrics hook/isolation still open); flagd = flags only, no analytics | ✅ OSS (CNCF) | ✅ (via providers) | ❌ | n/a | **flagd POSIX CLI + OpenFeature CLI (typed accessors) + multi-provider** | Want anti-lock-in flag layer + fully-autonomous OSS flag loop |
| **Plausible** | Privacy-first web stats, AGPL self-host | Web analytics only (not product/funnel/flags); 2yr retention | ✅ AGPL CE | ❌ | ❌ | ❌ | Stats API | Privacy-first web stats, self-host, GA4 replacement |
| **Fathom** | Privacy-first web stats + compliance certs (SOC2/HIPAA) + funnels | **Closed, cloud-only, NO self-host**; 3yr retention | ❌ | ❌ | ❌ | ❌ | Stats API | Managed privacy web stats with compliance needs |
| **GA4** | Free, Google Ads attribution, BigQuery export | Sampling; **retention auto-collapses to 2mo past 25B events**; consent-mode mandatory; no self-host | ❌ | ❌ | ❌ | (BigQuery export) | Data API (quota-limited) | Only if marketing needs Google Ads attribution |

Sources for cells: ecosystem-01 (versions/changelog), ecosystem-02 (agent surfaces/rate limits), ecosystem-03 (stats/privacy/GA4), ecosystem-04 (breakage). All dated 2026.

### 1a. The decision tree (taste, opinionated)
1. **Want one tool, agent-operable, OSS, covers everything?** → **PostHog.** (Fleet default. The MCP + wizard make it uniquely agent-native.)
2. **Want only flags+experiments with serious stats, self-host?** → **GrowthBook.**
3. **Want anti-vendor-lock-in flag layer?** → **OpenFeature** as the app API, **PostHog or flagd** as the backend. (The Statsig saga is the proof you need this.)
4. **Want privacy-first WEB stats to replace GA4, self-host?** → **Plausible CE.** (Fathom if you need compliance certs and accept closed/cloud.)
5. **Need a CDP (≥3 destinations + identity resolution)?** → **RudderStack** (warehouse-first, cost-sensitive) or **Segment** (managed, integration breadth). NOTE: a CDP sits *in front of* PostHog, doesn't replace it — and is usually overkill until you have ≥3 destinations.
6. **Enterprise flag governance mandate?** → **LaunchDarkly.**

### 1b. The three load-bearing taste calls
- **PostHog's weakness is depth, not breadth.** If one module (say experiments) becomes load-bearing and you outgrow PostHog's stats, bolt on GrowthBook for *that* module via OpenFeature rather than abandoning PostHog. Don't rip-and-replace.
- **A CDP is not analytics.** The most common architecture mistake is treating Segment/RudderStack as a PostHog competitor. They're the pipe; PostHog/Amplitude/Mixpanel are the sink.
- **Privacy tools are not product analytics.** Plausible/Fathom replace GA4 (web stats), not PostHog (product events/funnels/flags). Don't conflate the two planes (mirrors ecosystem-00's product-analytics ≠ LLM-tracing warning).

---

## 2. The 5 best starter / template / example repos (verified stars + last commit)

> Verified via `gh api repos/<r>` on 2026-06-16. "Why" = what tally actually learns from it.

### #1 — `PostHog/posthog` — 28k+★, pushed daily (2026-06-17)
- **What:** the whole platform monorepo. **The MCP server now lives at `services/mcp`** inside it (the old `PostHog/mcp` is archived — ecosystem-02 §1a).
- **Why for tally:** canonical reference for event schema, HogQL, flag local-eval (read the Rust flag-eval code that caused #57183), and the MCP tool implementations. This is the source of truth, not a blog.
- Self-host: `posthog-foss` (read-only FOSS mirror, all proprietary code removed) for a clean self-host base.

### #2 — `PostHog/wizard` — 140★, pushed 2026-06-17 (very active)
- **What:** the agentic auto-instrumenter (`npx @posthog/wizard@latest`). Scans a codebase and writes events + dashboards + optionally installs the MCP.
- **Why for tally:** THE reference for "an agent that instruments analytics into a codebase" — exactly tally's job. Read how it scans architecture → derives events from real flows. NOTE the `--ci` headless wall (ecosystem-02 §2).

### #3 — `growthbook/growthbook` — 7,890★, pushed 2026-06-17 (very active)
- **What:** OSS flags + experiments + product analytics; warehouse-native; 3B+ evals/day self-hosted.
- **Why for tally:** the best-in-class OSS *experimentation engine* reference (CUPED, sequential, Bayesian implemented in the open) + the 2026 custom-JS validation hooks (governance-as-code → directly applicable to tally's flag-hygiene + anti-rot skills).

### #4 — `open-feature/flagd` — 931★, pushed 2026-06-15 (healthy)
- **What:** Unix-philosophy flag daemon; POSIX CLI; OFREP on port 8016; RPC + in-process resolvers; thousands of evals/sec.
- **Why for tally:** the fully-OSS, CLI-first, agent-operable flag backend. Read it to understand how a flag eval works at the protocol level (OFREP) and to build the zero-SaaS autonomous flag loop. Pairs with the OpenFeature CLI for typed accessors.

### #5 — `FrigadeHQ/trench` — 1,640★, pushed 2026-04-06
- **What:** OSS analytics *infrastructure* — single Docker image on ClickHouse + Kafka + Node.js for event tracking; build product analytics / LLM-RAG / observability on top.
- **Why for tally:** the reference for *building* an event-ingestion backend from scratch (the ClickHouse+Kafka pattern PostHog also uses). If tally ever needs its own lightweight ingest plane rather than a SaaS, this is the blueprint. Less active than the others (flag: last push Apr 2026) but architecturally the cleanest minimal example.

### Honorable mentions / important adjacents
- **`vercel/flags` (Flags SDK) + `@flags-sdk/posthog` adapter** — provider-agnostic flags for **Next.js/SvelteKit** with `isFeatureEnabled` / `featureFlagValue` / `featureFlagPayload`. **Directly relevant: the fleet is on Next.js 15 + Vercel.** PostHog joined the Vercel Marketplace; March-2026 PostHog↔Vercel integration. This is likely tally's *actual app-side flag API* in fleet products.
  - <https://flags-sdk.dev/docs/providers/posthog> · <https://vercel.com/changelog/posthog-joins-the-vercel-marketplace> · <https://posthog.com/blog/vercel-integration> · 2026
- **`plausible/analytics` — 27,180★, pushed 2026-06-16** — the privacy-first web-analytics reference (Elixir, AGPL, self-hostable). The canonical GA4 replacement.
- **`Unleash/unleash` — 13,589★** and **`flagsmith/flagsmith` — 6,413★** — the two biggest *standalone* OSS flag platforms (both healthy, pushed 2026-06-16). Alternatives to flagd if you want a full UI/admin layer for flags without PostHog. Unleash is the most-starred OSS feature-management platform.
- **`getsentry/sentry` — 44,113★** — the adjacent error/crash slot (ecosystem-00 lists Sentry as the error-tracking default, distinct from product analytics). Not tally's domain but the border.

### ⚠️ Dead-repo gotchas (don't clone these)
- `PostHog/mcp` — **ARCHIVED 2026-01-19** (moved to monorepo `services/mcp`).
- `PostHog/posthog-js-lite` — **ARCHIVED** (last push 2025-07); use mainline `posthog-js`.

---

## 3. tally's recommended posture (synthesis)
- **Backend default:** PostHog (self-host `posthog-foss` or cloud).
- **App-side flag API:** Vercel Flags SDK + `@flags-sdk/posthog` (fleet is Next.js/Vercel) OR OpenFeature for non-Vercel surfaces (anti-lock-in).
- **Fully-OSS escape hatch:** OpenFeature + flagd (CLI-first, zero SaaS) for agent-autonomous flag loops.
- **Experiments rigor when needed:** GrowthBook bolt-on for the specific metric, via OpenFeature.
- **Privacy web stats (optional):** Plausible CE.
- **Agent operating rules:** materialize recurring queries (avoid 120/hr HogQL limit); pass full props to local flag eval (avoid #57183/#28453 class); never reuse a flag key (Knight Capital); use Bayesian or sequential for legal peeking.
