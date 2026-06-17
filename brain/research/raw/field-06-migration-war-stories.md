---
title: "Field Intel — Migration War Stories (provider A→B, what breaks)"
type: source
created: "2026-06-16"
updated: "2026-06-16"
tags: [migration, ga4, universal-analytics, posthog, amplitude, mixpanel, segment, rudderstack, launchdarkly, openfeature, field-intelligence, tally]
domain: product-analytics-feature-flags
researcher: FIELD-INTELLIGENCE (CP123 Wave-R)
summary: "What actually breaks when you switch analytics/flag providers: the GA4 data-model rupture, PostHog import dedup landmines, CDP billing surprises, and the LaunchDarkly outage that made vendor lock-in real."
sources: ["raw/field-06-migration-war-stories.md"]
related: ["[[field-01-event-taxonomy-disasters]]", "[[field-03-flag-debt-and-dead-code]]", "[[field-07-gaps-and-disputes]]"]
---

# Migration War Stories — What Breaks When You Switch Providers

> Scope: real provider-to-provider migration failures, sourced from maintainer docs (highest trust) and
> deprecation postmortems. The pattern across all of them: **you cannot migrate history losslessly**, and
> the new tool's *defaults* silently make the numbers not match. **Currency bar:** GA4 cutover finalized
> Nov 2025; LaunchDarkly outage Oct 2025; PostHog migration docs current 2026.

---

## 1. THE canonical analytics migration disaster — Universal Analytics → GA4

This is the largest forced analytics migration in history (every GA user on Earth), and it is the
reference case for "the data model changed underneath you."

- **The rupture (why history can't come along):** *"It's not possible to import historical UA data into GA4... those are two different systems using different data structures. Universal Analytics uses a session data model, while Google Analytics 4 uses an event model, which makes dimensions and metrics... defined and calculated differently."*
  - Source: search synthesis citing OWOX / Google Analytics Help — *Migration Q&A* — <https://support.google.com/analytics/answer/14196937> (read 2026-06-16).
- **The failure rate (cite as an industry estimate — see GAPS):** *"81% of GA4 migrations fail due to misconfigured events & tracking gaps,"* and *"most missed critical events and conversion data during the 2024 migration rush."*
  - Source: Upgrow — *GA4 Migration Service* — <https://www.upgrow.io/blog/ga4-migration-service> (read 2026-06-16). **Vendor-stated; treat the 81% as directional.**
- **The timeline of loss:** *"The final shutdown commenced on 1 July 2024... By July 1, 2024, most users lost access to current and historical Universal Analytics data."* The deprecation finalized in **November 2025**.
  - Sources: Oreate AI — *The Final Whistle for Universal Analytics: What November 2025 Means* — <https://www.oreateai.com/blog/the-final-whistle-for-universal-analytics-what-november-2025-means-for-your-data/> ; anotherconcept.co.uk — <https://anotherconcept.co.uk/insights/google-shuts-down-ua-everything-you-need-to-know> (read 2026-06-16).
- **The only escape hatch:** *"if events were missed when you migrated from UA to GA4, you can import the backdated data using custom ETL pipelines... third-party connectors like Supermetrics, Fivetran etc."* — i.e., you must build your own ETL; the platforms won't bridge it for you.
  - Source: sranalytics.io — *Recover Lost GA4 Data in 2026* — <https://sranalytics.io/blog/ga4-migration-and-data-recovery-2025/> (read 2026-06-16).

> TASTE for tally: the GA4 lesson is that **the session→event model shift is irreversible at the data
> layer.** Any analytics harness should store events in an event-native, exportable, vendor-neutral shape
> from day one (warehouse-first / `events` table you own) so a future provider switch is a re-pipe, not a
> data bereavement. Owning the raw event stream is the single best insurance against this class of disaster.

---

## 2. Migrating analytics INTO PostHog — the maintainer's own gotcha list

PostHog's migration docs are unusually honest about what breaks. These are the highest-trust source in
this file (the vendor documenting its own import failure modes). All quotes from PostHog —
*Managed migrations* — <https://posthog.com/docs/migrate/managed-migrations> and *Migrate from Amplitude*
— <https://posthog.com/docs/migrate/migrate-from-amplitude> (read 2026-06-16):

- **The duplicate-events landmine (the #1 import bug):** *"Managed migrations do not deduplicate events. If a migration is paused or stopped, running another migration against the same data set will result in duplicate events."* → a paused-then-resumed migration silently doubles your data.
- **Source export caps force a harder path:** *"The Amplitude and Mixpanel export endpoints do not support exporting large datasets."* → big accounts can't use the easy direct import at all; they must do S3 + manual formatting.
- **Direct import is the unreliable path:** *"Direct imports are currently less reliable than S3 imports for some datasets and customers. Rate limits and data export size limits vary by customer... making it hard to gracefully handle the full range of API export failure modes."*
- **Events get silently dropped in transform:** Amplitude `session_start` events are *"dropped (not imported)"*; Mixpanel events with no resolvable distinct ID are dropped — *"If no ID remains and you choose to skip events without IDs, the event is dropped."*
- **The numbers won't match — by design:** *"PostHog blocks bot traffic by default, while Amplitude doesn't"* → **lower event counts post-migration.** This is the classic "we migrated and the dashboard dropped 15%, is it broken?!" panic — and the answer is "no, the new tool's defaults differ."
- **Identity & first-touch must be re-mapped by hand:** person properties *"Must use `$set` and `$set_once` operators"*; `"[Amplitude] Page Viewed"` → `"$pageview"`, `"[Amplitude] Page Location"` → `"$current_url"`, `"EMPTY"` → `null`, timestamps → ISO 8601. **Get `$set` vs `$set_once` wrong here and you destroy acquisition-source history (field-01 §2).**
- **What does NOT migrate at all:** cohorts, dashboards, charts, and computed properties are *"conspicuously absent from the migration process"* — only raw events come over. You rebuild every saved view by hand.
- **Migrations are import-only:** *"Managed migrations are not for data enrichment... designed to import historical events as-is, not to enrich or modify existing data."*
- **The bulk-ingest data-loss trap:** *"The default queue size for ingesting is 10,000. If you are importing more than 10,000 events, call `posthog.flush()`"* — forget the flush and you lose the tail.
- **The maintainer's own advice:** *"Before migrating your full dataset, we highly recommend you run a small test migration with a subset of your data against a new project."*

> TASTE for tally: every one of these is a *silent* failure (dup events, dropped session_start, count
> drift, lost cohorts). A migration harness must (a) dedupe by event-id idempotency key, (b) reconcile
> source-vs-dest counts and *explain* the delta (bot filtering, dropped event types), and (c) explicitly
> warn that derived assets (cohorts/dashboards) don't transfer. "Run a subset first" should be enforced,
> not suggested.

---

## 3. CDP migration — Segment → RudderStack (the billing-model trap)

- **The cost-model mismatch (this is the real war story):** Segment prices on **Monthly Tracked Users (MTUs)**; RudderStack prices on **event volume**. *"cost efficiency depends on your usage pattern"* — a low-MTU/high-event app gets crushed on RudderStack; a high-MTU/low-event app gets crushed on Segment. Migrating to "save money" can *increase* the bill if your shape is wrong.
  - Source: Volument — *RudderStack vs Segment: CDP Pricing* — <https://volument.com/blog/rudderstack-vs-segment-cdp-pricing-features-and-open-source/> (read 2026-06-16).
- **The cost-growth trajectory (cite as a 2022 report — older, flagged):** *"companies using Segment experienced an average annual cost increase of 65% as their user base expanded, while RudderStack customers saw approximately 30% annual increases."*
  - Source: search synthesis citing CDP Institute 2022 report. **Historical (2022) — directional only.**
- **The standard safe-migration mechanic:** *"many organizations implementing parallel tracking during migration — sending data to both platforms temporarily — to validate data accuracy."* → dual-write, reconcile, then cut over.
  - Source: same, 2026.

> TASTE for tally: before any provider switch, model the bill under the NEW pricing axis using YOUR
> actual event/MTU shape. "Cheaper for them" ≠ "cheaper for you." And never hard-cut — dual-write and
> reconcile counts first (same discipline as the OpenFeature "run both concurrently" step below).

---

## 4. Feature-flag migration — LaunchDarkly → OpenFeature (the outage that made lock-in real)

The flag-side equivalent of the GA4 story. The forcing function was an outage, not a deprecation.

- **The outage (the concrete "why this matters now" event):** *"an AWS US-East-1 outage took LaunchDarkly offline, along with much of the internet. Businesses that were using the platform had no fallback."* Teams *"couldn't update or create flags, causing rollback delays and prolonged production incidents because their release control tool itself was unavailable."* — **October 2025.**
  - Source: Flagsmith — *How to Migrate from LaunchDarkly to OpenFeature in 6 Steps* — <https://www.flagsmith.com/blog/migrate-from-launchdarkly-to-openfeature> (read 2026-06-16). **The kill-switch you can't reach during an incident is worse than no kill-switch — it gives false confidence.**
- **The lock-in mechanism (quote):** *"Every LaunchDarkly SDK call in your codebase ties you to the platform."* As code scales, *"switching costs compound, giving vendors negotiating leverage at renewal."*
  - Same source.
- **The concrete API-semantic breaks during migration:**
  - `client.variation('flag-name', context, false)` → `client.getBooleanValue('flag-name', false, context)` (one untyped method becomes four typed ones: `getBooleanValue` / `getStringValue` / `getNumberValue` / `getObjectValue`).
  - **Context key rename:** `key` → `targetingKey` — *every* flag-eval call site changes.
  - Migration step that prevents silent drift: *"Run both implementations concurrently to verify identical results"* before removing the legacy SDK.
  - Same source (6-step guide).
- **The standard's pitch (verbatim):** OpenFeature is *"the great equalizer because you can start with one provider and move to LaunchDarkly or self-hosted Unleash without rewriting your call sites — this is the 'HTTP for feature flags' effect where your application code targets the standard, not the vendor."*
  - Source: FlagShark — *Open Source Feature Flag Tools Compared* — <https://flagshark.com/blog/open-source-feature-flag-tools-compared-2026/> (read 2026-06-16).

> TASTE for tally: a flag harness should target **OpenFeature** as the call-site API from line one, with
> the vendor behind a provider. This makes provider switch a config change, not a codebase rewrite — and
> the Oct-2025 LaunchDarkly outage is the proof-cost of not doing it. (Cross-ref field-03 §"vendor lock-in".)

---

## 5. The universal pattern (synthesized) — why every migration "loses" data

| Break | Where it bites | Mitigation |
|---|---|---|
| **Data-model mismatch** (session→event, MTU→event-volume) | GA4, CDP billing | Own the raw event stream (warehouse-first); model new pricing on real data |
| **Defaults differ → counts drop** | PostHog bot-filtering vs Amplitude | Reconcile source-vs-dest counts; *explain* the delta, don't panic |
| **Derived assets don't transfer** | cohorts/dashboards/charts | Expect to rebuild every saved view by hand |
| **Dedup is not automatic** | PostHog paused-migration dup events | Idempotency key per event; never re-run blindly |
| **Identity/first-touch re-map** | `$set` vs `$set_once` | Map by hand carefully — getting it wrong destroys acquisition history |
| **Call-site lock-in** | LaunchDarkly SDK everywhere | OpenFeature abstraction from day one |
| **No fallback during outage** | Oct-2025 LD/AWS | Self-host or multi-provider for the kill-switch path |

> THE migration meta-lesson for tally: **dual-write, reconcile, explain the delta, then cut over.** Never
> trust a one-shot migration; never assume the numbers will match; never let derived assets be an
> afterthought. Own your raw events so the next switch is a re-pipe, not a funeral.

---

## 6. Cross-reference to internal corpus

- `energy/audit/HARNESS-CHECKLIST-2026.md` line 322 lists tally's default (PostHog) AND its alts (Amplitude/Mixpanel, LaunchDarkly/GrowthBook/Statsig) — i.e., every migration path in this file is a *live* possibility for tally's harness to support. The PostHog import gotchas (§2) are the ones tally will hit first if it starts on an alt and consolidates.
- `energy/scripts/x-content-intel/score.py`'s `processed-index.jsonl` dedup ledger (§load_processed_index) is *exactly* the idempotency-key mechanism §2 prescribes for dedup-safe migrations. The "running another migration results in duplicate events" bug is "no processed-index" applied to event import.
  - Read-only ref: `~/energy/scripts/x-content-intel/score.py`.
- Connects to field-03 (flag debt): the OpenFeature migration is *also* the cleanest moment to audit and kill zombie flags — you touch every call site anyway.
