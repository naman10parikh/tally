---
title: "Ecosystem — Versions & Last-6-Months Changelog Deltas (every canonical tool)"
type: source
created: "2026-06-16"
updated: "2026-06-16"
tags: [posthog, launchdarkly, statsig, growthbook, amplitude, mixpanel, segment, rudderstack, openfeature, ga4, plausible, fathom, versions, changelog, tally]
domain: product-analytics-feature-flags
researcher: ECOSYSTEM (CP123 Wave-R)
summary: "Current versions + Dec-2025→Jun-2026 changelog deltas for every canonical product-analytics + feature-flag tool, with the load-bearing AI-era shifts and the Statsig ownership saga."
related: ["[[ecosystem-00-internal-references]]", "[[field-01-event-taxonomy-disasters]]"]
---

# Versions & Changelog Deltas — Dec 2025 → Jun 2026

> Currency bar: prefer < 6 months. Anything older I still trust is flagged. Every claim = URL + date.
> The single biggest structural theme of this window: **every analytics/flag vendor pivoted to
> "control the AI agent at runtime."** Flags stopped being "show/hide a button" and became
> "swap the model / prompt / tool-set of a live agent without redeploy." tally inherits this framing.

---

## 0. The headline 2026 events (read these first)

1. **Statsig ownership whiplash (the migration story of the year).**
   - **Sep 2025:** OpenAI acquired Statsig for **$1.1B**; founder/CEO **Vijaye Raji → OpenAI CTO of Applications**, reporting to Fidji Simo.
     - <https://openai.com/index/vijaye-raji-to-become-cto-of-applications-with-acquisition-of-statsig/> · 2025-09
     - <https://www.statsig.com/blog/openai-acquisition> · 2025-09
   - **May 2026:** **Amplitude took over the Statsig brand, platform, and customer base** — but **the engineers stayed at OpenAI**. So the product that customers depend on is now run by a *different company than the one that built it*, and the builders are gone.
     - <https://martech.org/amplitude-and-statsig-deal-raises-questions-for-customers/> · 2026-05
     - <https://www.convert.com/blog/a-b-testing/statsig-moves-to-amplitude/> · 2026-05
     - <https://orm-tech.com/news/20260508-amplitude-takes-over-statsig-amid-openai-acquisition-raising/> · 2026-05-08
   - **Why it matters for tally (taste):** this is the textbook *vendor-continuity risk* argument. A team that standardized on Statsig's SDK in 2024 now has: (a) a new owner, (b) original authors gone, (c) open questions on roadmap/pricing/data-residency. The honest lesson for the fleet: **prefer an abstraction layer (OpenFeature) over a single vendor SDK** so a forced migration is a provider swap, not a rewrite. Cite this as the concrete reason OpenFeature exists. Why OpenAI paid $1.1B at all: experimentation infra is now core to shipping AI products fast — Flagsmith's teardown: <https://www.flagsmith.com/blog/why-openai-acquired-statsig> (2025/2026).

2. **Feature flags became "AI runtime control" across all vendors.**
   - **LaunchDarkly AgentControl** (May 2026): change a live agent's behavior at runtime — manage prompts, instructions, model settings *outside application code* — without redeploy. "agent mode" configures multi-step workflows via structured instructions.
     - <https://www.helpnetsecurity.com/2026/05/19/launchdarkly-agentcontrol/> · 2026-05-19
     - <https://launchdarkly.com/docs/home/ai-configs> · 2026
   - This is the same pattern Energy already specced in `INFRA-STACK.md` / Quartermaster: an agent that swaps its own model/prompt is a *flag evaluation*. tally is where that lands for the fleet.

---

## 1. PostHog (THE fleet default — OSS, bundles analytics + flags + replay + experiments)

**Repo:** `PostHog/posthog` (MIT/PostHog OSS license). **JS SDK:** `PostHog/posthog-js`.
**Array (web app) line:** 1.39.x in this window (e.g. "Array 1.39.0: Betas, persons, events and libraries").
- <https://posthog.com/blog/the-posthog-array-1-39-0>
- Changelog hub: <https://posthog.com/changelog> · Release-notes tag: <https://posthog.com/blog/tags/release-notes>

### Dec 2025 → Jun 2026 deltas (verbatim-sourced)
- **Endpoints GA (June 2026):** turn any saved insight or SQL query into a *fast, versioned, authenticated API* with **materialized queries + configurable cache TTL**. This is the load-bearing feature for an agent operator — it means tally can expose a metric as a stable HTTP endpoint instead of re-querying HogQL each time.
  - Source: PostHog changelog summary, June 2026 — <https://releasebot.io/updates/posthog> · 2026-06
- **Session replay survives `identify()` and `reset()` (June 2026):** replay stays active across identity transitions, preserves project-level config + survey definitions, and re-evaluates replay as feature flags load/reload. **Linked flags start/pause recording without an app restart.** (This was a real, recurring breakage — replay dropping on login — now fixed.)
  - <https://releasebot.io/updates/posthog> · 2026-06
- **Feature flags `early_exit` condition in local evaluation (June 2026):** evaluation stops and returns `false` as soon as a condition group's property filters match but the rollout percentage excludes the user. Perf win for high-cardinality local eval.
  - <https://releasebot.io/updates/posthog> · 2026-06
- **Product tours caching fix (June 2026):** clears cached tours blob when product tours disabled → fewer stale persistence writes + less cross-tab storage noise.
  - <https://releasebot.io/updates/posthog> · 2026-06
- **March 2026 batch (10 updates):** React Native JS support for **Error Tracking**; ability to **launch experiments without metrics**; **PostHog↔Vercel integration linking**.
  - <https://releasebot.io/updates/posthog> · 2026-03
- **posthog-js releases** are continuous; pin and watch <https://github.com/PostHog/posthog-js/releases>. SDK release index: <https://posthog.com/handbook/engineering/sdks/releases>.

**Taste / why PostHog is the right default:** one tool = autocapture + flags + replay + experiments + error tracking + data warehouse (HogQL/ClickHouse). The fleet already chose it (see ecosystem-00). The 2026 deltas above show it closing its historically-weakest seams (replay-on-identity, flag local-eval perf, queries-as-API). The risk it carries is breadth-over-depth (each module is "good enough," not best-in-class) — covered in the trade-off matrix file.

---

## 2. LaunchDarkly (the enterprise flag incumbent)

**Docs changelog:** <https://launchdarkly.com/docs/home/changelog> · Product updates: <https://launchdarkly.com/changelog/> · What's-new: <https://whatsnew.launchdarkly.com/en>

### Dec 2025 → Jun 2026 deltas
- **AgentControl (May 2026)** — the headline. Runtime control of AI agents in prod without redeploy. See §0.2.
  - <https://www.helpnetsecurity.com/2026/05/19/launchdarkly-agentcontrol/> · 2026-05-19
- **AI Configs updates (March 2026):** agent-based workflows, **tools**, and a **trends explorer for AI Insights**.
  - <https://launchdarkly.com/changelog/ai-configs-agents-tools-trends/> · 2026-03
  - Customizing AI Configs (per-SDK): <https://launchdarkly.com/docs/sdk/features/ai-config>
- **Flag Delivery v2 (FDv2) GA (May 2026)** for server-side SDKs (**Java, Python, Go, Node.js, .NET, Ruby**). Introduces **two-phase initialization**, **data-saving mode** (reduces bandwidth), and **file-based initialization** (init from a flag file → great for tests + air-gapped/agent envs).
  - LaunchDarkly product updates / changelog (May 2026) — <https://launchdarkly.com/changelog/>

**Taste:** LaunchDarkly is the "buy, don't build" enterprise answer; FDv2 file-based init is genuinely useful for agent/test determinism. But it's closed-source, seat+context-priced, and historically the most expensive. For the fleet's OSS-first posture it's the *alt*, not the default.

---

## 3. Statsig (warehouse-native experimentation — now Amplitude-owned, see §0.1)

- Architecture that made it famous: **warehouse-native experiments** running directly in **Snowflake / BigQuery / Databricks** (data never leaves your warehouse). Strong AI-company adoption.
  - <https://www.getunleash.io/blog/openai-statsig-feature-flags> · 2025/2026
  - <https://www.statsig.com/> (current marketing) · 2026
- **Status June 2026:** brand/platform/customers → Amplitude; builders → OpenAI. **Treat as continuity-risk** (see §0.1). Do NOT recommend net-new standardization on Statsig SDK for the fleet without an OpenFeature wrapper.

---

## 4. GrowthBook (OSS feature flags + experiments + product analytics)

**Repo:** `growthbook/growthbook` (MIT core). Releases: <https://github.com/growthbook/growthbook/releases>
**Docs (features/flags):** <https://docs.growthbook.io/app/features>

### Recent deltas (2026)
- **Custom JS validation hooks for self-hosted (2026):** write fully custom JS that hooks into validation — *require flags to have tags, block targeting rules containing PII, enforce custom naming conventions.* (This is governance-as-code — directly relevant to tally's anti-rot mandate; cf. field-01 naming-drift disaster.)
  - <https://www.growthbook.io/blog/how-to-implement-feature-flags-at-scale> · 2026
- **Perf + UI for scale:** faster load with **thousands of flags + large JSON values**; new API endpoints to manage **experiment dashboards + custom fields**; new **Project Admin role**.
  - GrowthBook releases — <https://github.com/growthbook/growthbook/releases> · 2026
- **Scale proof:** customers running **3+ billion evaluations/day on self-hosted**; warehouse-native experimentation (no third-party data egress).
  - <https://www.growthbook.io/products/feature-flags> · 2026

**Taste:** GrowthBook is the OSS answer when you want **rigorous experiment stats (CUPED, sequential, Bayesian) + flags** but DON'T want PostHog's whole platform. Its experimentation engine is more statistically serious than PostHog's. Best "flags+experiments only, self-host, warehouse-native" pick.

---

## 5. Amplitude (analytics incumbent, now also owns Statsig brand + has flags/replay)

**Pricing/changelog signal (2026):**
- **Amplitude Plus tier:** **from $49/mo for 1,000 MTUs**, scaling to 300,000 MTUs; includes unlimited product analytics, custom dashboards, behavioral cohorts, online support.
  - <https://userpilot.com/blog/amplitude-pricing/> · 2026
- **Free Starter:** 50,000 MTUs + 10M events + **unlimited feature flags + session replay** bundled.
  - <https://www.temperstack.com/versus/mixpanel-vs-amplitude/> · 2026-04
- **Behavioral cohorts now persist across Analytics, Web Experimentation, Feature Experimentation, Guides & Surveys**; **AI Agents** ground analysis in first-party product data.
  - <https://amplitude.com/compare/best-product-analytics-tools> · 2026
- Now also operates Statsig (see §0.1) — Amplitude is consolidating into a full analytics+experiment+flags suite.

**Taste:** MTU-based pricing punishes apps with many low-value users. The cross-surface persistent cohort is a genuine strength. Acquiring Statsig's brand makes Amplitude the closest closed-source rival to PostHog's "everything bundled" pitch — but as two stitched products, not one.

---

## 6. Mixpanel (event analytics)

- **Feb 2025: switched ENTIRELY to event-based pricing** (away from MTU) → more predictable, often cheaper for growing apps. **This is a recent, material change — flag it.**
  - <https://www.temperstack.com/versus/mixpanel-vs-amplitude/> · 2026-04
- **Free plan: 20M events/mo, unlimited data history, unlimited collaborators** — one of the most generous free tiers.
  - same · 2026-04
- **Enterprise from ~$1,167/mo (~$14k/yr):** SSO, data pipelines, advanced access controls, dedicated support.
  - <https://userpilot.com/blog/amplitude-pricing/> · 2026 (comparative)
- **Gotcha:** pricing **scales fast past ~10M events/mo** — teams re-evaluate at that line.
  - <https://adapty.io/blog/amplitude-vs-mixpanel-which-one-to-choose/> · 2026

**Taste:** Mixpanel is the "pure event analytics, fast slice-and-dice" pick. No flags. The Feb-2025 event-pricing flip is the key planning fact — model your event volume, not your user count.

---

## 7. Segment (Twilio) vs RudderStack (CDP layer — feeds analytics, doesn't replace it)

- **Segment:** cloud-only; warehouses treated as *destinations*, not core. Team plan ~**$120/mo**. Reverse-ETL via Profiles product, **opaque pricing, usually enterprise contracts**. Acquired by Twilio (2020).
  - <https://volument.com/blog/rudderstack-vs-segment-cdp-pricing-features-and-open-source/> · 2026
  - <https://www.stackscored.com/pricing/cdp/> · 2026
- **RudderStack:** **warehouse-native** (data lives in your Snowflake/BigQuery/Redshift; RudderStack runs the pipelines/transforms). Starter ~**$220/mo**; **Reverse ETL free tier with 10 connections**; OSS core. **50-80% cost savings vs Segment at high volume** (claimed).
  - same two sources · 2026
- Positioning: RudderStack = "warehouse-first" independent alt; Segment = managed cloud incumbent.

**Taste / scope note for tally:** A CDP is the **collection + routing + identity-resolution** layer that sits *in front of* PostHog/Amplitude/Mixpanel — NOT a competitor to them. The honest architecture: events → CDP (Segment/RudderStack) → fan-out to analytics + warehouse + marketing. For a small/agent-operated product, a CDP is often *overkill* until you have ≥3 destinations; PostHog's own ingestion + its warehouse can defer the CDP. Flag this in the trade-off matrix.

---

## 8. OpenFeature (the vendor-neutral flag SPEC — the anti-lock-in layer)

**Why it matters most for the fleet:** the Statsig saga (§0.1) is the exact failure OpenFeature prevents. Write to the spec, swap providers without a rewrite.
- **Stable:** a project is "stable" once it reaches **v1**. JS SDKs: `@openfeature/server-sdk`, `@openfeature/web-sdk`; plus .NET, Go, Java, Python, etc.
  - <https://openfeature.dev/docs/reference/sdks/server/javascript/>
  - <https://openfeature.dev/docs/reference/sdks/client/web/>
- **Multi-Provider (the 2026 delta):** wrap MULTIPLE flag providers behind one interface — route different flag keys to different providers, or apply evaluation strategies across them (e.g., first-match, comparison). **Go SDK multi-provider package published 2026-01-13** → active 2026 work.
  - <https://openfeature.dev/blog/openfeature-multi-provider-release/>
  - <https://github.com/open-feature/go-sdk/blob/main/openfeature/multi/README.md>
  - Go v2 multi pkg: <https://pkg.go.dev/go.openfeature.dev/openfeature/v2/providers/multi>
- Provider concept: <https://openfeature.dev/docs/reference/concepts/provider/>

**Taste:** OpenFeature is a *spec + thin SDK + provider adapters*, not a flag backend. You still need a backend (PostHog, GrowthBook, flagd, LaunchDarkly, Flagsmith). tally's correct posture: **default backend = PostHog; default app-side API = OpenFeature** so the backend is swappable. The CNCF home for `flagd` (the reference OSS provider) makes a fully-OSS OpenFeature stack possible with zero SaaS.

---

## 9. Privacy-first analytics (Plausible / Fathom) — covered in ecosystem-03

Pointer only here; full deltas + cookieless/GA4-migration angle in `ecosystem-03-privacy-ga4-and-experimentation.md`.

---

## 10. GA4 (Google Analytics 4) — covered in ecosystem-03

Pointer only; GA4 is *web/marketing analytics*, not product analytics — the distinction is load-bearing and detailed in ecosystem-03.

---

## Version quick-reference (as of 2026-06-16)

| Tool | Line/version this window | License | Bundles flags? | Bundles replay? | Warehouse-native? |
|---|---|---|---|---|---|
| PostHog | Array 1.39.x; posthog-js continuous | OSS (PostHog license) | ✅ | ✅ | ✅ (ClickHouse/HogQL) |
| LaunchDarkly | FDv2 GA (May 2026); AgentControl | Closed | ✅ (flags-first) | ❌ | partial |
| Statsig | (Amplitude-owned May 2026) | Closed | ✅ | partial | ✅ |
| GrowthBook | scale/perf + JS-validation (2026) | OSS (MIT core) | ✅ | ❌ | ✅ |
| Amplitude | Plus tier; persistent cohorts; AI Agents | Closed | ✅ (bundled free) | ✅ | partial |
| Mixpanel | event-pricing since Feb-2025 | Closed | ❌ | ❌ | partial (warehouse connectors) |
| Segment | Team ~$120/mo | Closed | ❌ | ❌ | ❌ (warehouse = destination) |
| RudderStack | Starter ~$220/mo; rETL free 10 conns | OSS core | ❌ | ❌ | ✅ |
| OpenFeature | v1 stable; Multi-Provider 2026 | OSS (CNCF) | spec only | n/a | n/a |

> NOTE: exact semver of PostHog server / GrowthBook / OpenFeature SDKs should be pinned at build time from the GitHub releases pages cited above — I deliberately cite the *line* + the dated delta rather than a point version that will be stale within weeks. (See GAPS doc for the ones I could not pin to an exact tag.)
