---
title: "Field Intel — Event Taxonomy Disasters & The Rot Mechanism"
type: source
created: "2026-06-16"
updated: "2026-06-16"
tags: [event-taxonomy, analytics, posthog, amplitude, segment, ga4, field-intelligence, tally]
domain: product-analytics-feature-flags
researcher: FIELD-INTELLIGENCE (CP123 Wave-R)
summary: "How event data rots in production — naming drift, type mutation, identity-stitching fracture — with verbatim practitioner taste."
---

# Event Taxonomy Disasters — What Practitioners Learned the Hard Way

> Scope: how product-analytics event schemas decay in production. Sourced from postmortems,
> maintainer guidance, and practitioner essays. **Currency bar:** prefer < 6 months; flagged if older.

---

## 1. The Core Rot Mechanisms (concrete, reproducible failures)

### 1a. Naming drift → split metrics
- **Failure:** "One engineer logs `Song Played`; another, six weeks later and unaware, logs `song played`. Amplitude treats those as two entirely separate events." The platform "treats capitalization as a semantic boundary, fragmenting what should be a unified metric into two irreconcilable streams."
  - Source: digitalapplied.com — *Product Analytics: An Event Taxonomy That Won't Rot* — **2026-06-10** — <https://www.digitalapplied.com/blog/product-analytics-event-taxonomy-tracking-plan-2026>
- **Why it's insidious (the structural-decay take, verbatim):** Atticus Li — *"Each engineer makes a locally rational naming choice at the moment of implementation, but the cumulative effect of many locally rational choices, made without coordination, produces a globally irrational system where the shared namespace degradation imposes costs on everyone who needs to use the data downstream."*
  - Same source, 2026-06-10. **This is the canonical "tragedy of the commons" framing for event schemas — quote it.**

### 1b. Property TYPE mutation → silent aggregation breakage
- **Failure:** "an `amount` field arrives as a number in one event and a string in another," causing "aggregations [to] break or silently coerce." No error is thrown.
  - Source: same, 2026-06-10.
- **Gotcha:** the coercion is *silent* — the dashboard keeps rendering, just wrong. No alert fires.

### 1c. Autocapture schema shift → dashboards break on a CSS rename
- **Failure:** "When a button is renamed or a page restructured, the captured events shift in ways that quietly break the dashboards and analyses built on them."
  - Source: same, 2026-06-10. **This is the central argument against blind autocapture (see field-05).**

---

## 2. Identity-Stitching Fracture — "the silent killer"

This is, per the source, **one of only two failure modes that "throw no error and surface no obvious signal"** (the other being owner-departure). Treat as P0 for any analytics harness.

- **The mechanism (verbatim):** *"When a user is anonymous, your analytics tool assigns a `distinct_id`. When they log in, that anonymous identity has to be stitched to their known identity — and if that stitch is done inconsistently, or at the wrong moment, the result is not an error. It is a quietly fractured user graph where one human shows up as several, and every funnel, retention curve, and cohort built on top is wrong in ways no alert will catch."*
  - Source: digitalapplied, 2026-06-10.
- **The implementation rule (concrete):** Call `identify()` at **first load** AND **after login**. *"Skip the first call and you lose pre-login behavior; skip the second and your logged-in users fragment from their anonymous selves."*
- **The `$set` vs `$set_once` landmine (concrete data-loss bug):** *"if you use `$set` for referral source, every later session overwrites the original acquisition channel, and you lose the ability to ever say where a user truly came from."* → Use `$set_once` for acquisition/first-touch props; `$set` only for mutable current-state props.
  - Source: same, 2026-06-10.

> TASTE for tally: identity stitching + `$set` vs `$set_once` are the two bugs that destroy retroactive
> data. They cannot be fixed after the fact (the original value is gone). A good analytics harness MUST
> enforce these at instrumentation time, not flag them in review.

---

## 3. The "treat it like code, not docs" doctrine (strong opinion)

- **Verbatim:** *"A plan in a spreadsheet drifts; a plan wired into CI holds... Treat tracking like code and the taxonomy becomes durable infrastructure. Treat it like documentation and you are simply choosing how quickly it will rot."*
  - Source: digitalapplied, 2026-06-10.
- **Server-side-first stance (PostHog best practice, quoted by the source):** *"Where possible, it's a good idea to log events on your server instead of your client. Backend analytics are more reliable than frontend analytics because many users have tracking disabled or blocked on their browsers."*
  - Source: same, 2026-06-10 (attributed to PostHog best practice).

---

## 4. Recovery anti-patterns (what makes the hole deeper)

1. **Rename without migration:** *"Renaming an event without a migration plan does not fix a naming problem — it creates two broken time series where there was one."* (digitalapplied, 2026-06-10)
2. **Over-tracking:** events grow past navigable size; "consumers cannot find the right event." → discoverability collapse.
3. **Owner departure:** no recovery path when the event author leaves — tied with identity fragmentation as the **highest-cost** failure because both surface no signal.
4. **Device-mode silent gap (Segment Protocols):** "property omission plus schema-violation blocking are **cloud-mode-only** — unplanned properties are *not* stripped when sending to device-mode destinations." → you can think you have governance and not have it on mobile.
   - Source: digitalapplied, 2026-06-10 (re: Segment Protocols behavior).

---

## 5. Version / platform-specific gotchas (2026 currency)

- **GA4 hard limits (case-sensitive, ENFORCED):** event name ≤ 40 chars, must start with a letter; ≤ 25 event params per event; ≤ 500 distinct app-stream event names per user; custom-dimension deletion has a **48-hour archive delay** before the slot reopens.
  - Source: digitalapplied, 2026-06-10 (citing GA4 docs).
- **Mixpanel Data Standards:** governance tooling is "Enterprise tier; launched Apr 16, 2025" → schema enforcement is **paywalled** on the incumbent. (Opening for an OSS/agent-native approach.)
- **Client-side loss estimate:** vendors cite "25–40% of client-side traffic affected by ad blockers" but the source explicitly warns: *"treat that range as directional, not gospel — it is vendor-stated and not independently audited."* → see GAPS (the real ad-blocker loss number is disputed).

---

## 6. Cross-reference to internal corpus

- `energy/scripts/x-content-intel/score.py` encodes the **event-signal pattern** tally should mirror: a flat `TOPIC_KEYWORDS` dict + a `LUMINARIES` set + a `processed-index.jsonl` dedup ledger. The *dedup ledger* idea is directly transferable: an event taxonomy needs a **canonical registry** (the equivalent of `processed-index.jsonl`) so the second engineer can't accidentally re-mint `song played`. The rot mechanism in §1a is exactly "no dedup ledger for event names."
  - Read-only ref: `~/energy/scripts/x-content-intel/score.py` (lines ~20-55: `TOPIC_KEYWORDS`, `LUMINARIES`, `load_processed_index`).
- `energy/audit/HARNESS-CHECKLIST-2026.md` §"Product analytics + feature flags" (line 320-323) confirms tally's default = **PostHog** (bundles analytics + flags + replay), alts Amplitude/Mixpanel + LaunchDarkly/GrowthBook/Statsig. Currently **GAP** in the fleet.
