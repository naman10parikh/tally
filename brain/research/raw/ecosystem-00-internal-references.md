# ecosystem-00 — Internal Energy References (READ-ONLY corpus, quoted)

> Researcher: tally ECOSYSTEM. Date: 2026-06-16. These are READ-ONLY internal files I
> mined for event-signal / event-taxonomy patterns and the canonical analytics decision.
> I quote them; I did NOT edit them.

## A. Checklist Analytics section — the canonical fleet decision

Source: `~/energy/audit/HARNESS-CHECKLIST-2026.md` (lines 76, 320-323, 395).
Read 2026-06-16.

Verbatim (line 76):
> "**Product analytics + feature flags** — PostHog (bundles both) / Amplitude +
> LaunchDarkly·GrowthBook·Statsig — **GAP**"

Verbatim (lines 320-323, "Product analytics + feature flags"):
> "**Default:** **PostHog** — one tool bundling product analytics + feature flags +
> session replay (PostHog MCP). Alts: **Amplitude / Mixpanel** (analytics) +
> **LaunchDarkly / GrowthBook / Statsig** (flags). **GAP.**"

**Implication for tally:** the fleet has ALREADY chosen PostHog as the default product-
analytics+flags primitive, explicitly because it bundles analytics + flags + session
replay and ships an MCP server. tally is the domain-expert harness for this exact slot
("Switch=flags folded in here" per my mission). My research must default to PostHog and
treat Amplitude/Mixpanel/Segment/RudderStack/LaunchDarkly/Statsig/GrowthBook as the
honest-trade-off field, NOT re-litigate the choice. The "GAP" tag = no repo owns this
yet → tally is the repo that closes it.

Adjacent slots tally borders (same checklist §, lines 75-79):
- Error/crash/uptime: Sentry / Better Stack (separate from LLM observability)
- Transactional email + notifications: Resend / Postmark / Loops + Knock/Novu
- Background jobs/queues/webhooks: Inngest / Trigger.dev / BullMQ + Svix/Hookdeck
- Object storage/CDN: Cloudflare R2 / S3 / UploadThing / Supabase Storage

LLM-observability note (line 176, DISTINCT domain — do NOT conflate with product analytics):
> "emit **OpenTelemetry GenAI** spans (semantic conventions exited experimental;
> Datadog ingests v1.37+ `gen_ai.usage.*`) … **Langfuse v3** moved trace storage
> PG→ClickHouse (p95 1.6s→0.2s)"

This matters: product analytics (PostHog/tally) ≠ LLM tracing (Langfuse/agentmoney).
An agent operator must not pipe `gen_ai.usage.*` spans into PostHog as product events —
they are two planes. (Cross-reference for GAPS doc.)

## B. x-content-intel — a REAL, in-house event-taxonomy + weighted-scoring system

Source: `~/energy/scripts/x-content-intel/score.py` (read 2026-06-16, ~210 lines).
This is the single best internal analogue to "event taxonomy design + funnel scoring"
that tally will operationalize. It is a working, shipped pipeline — not a toy.

### B.1 The event/property schema (what a "tracked object" looks like here)
Each tweet (≈ an "event") carries typed properties that mirror a product-analytics event:
- engagement metrics: `likes`, `bookmarks`, `retweets`, `replies`, `view_counts`
- derived/computed props: `engagement_score`, `bookmark_ratio`, `topics[]`,
  `is_luminary` (bool), `has_article` (bool), `final_score`, `tier`
- identity props: `author`, `author_bio`, `name` (≈ a `$user` / distinct_id)

### B.2 The weighted engagement formula (a hand-rolled "event value" model)
Verbatim from `compute_engagement_score`:
```python
return (
    tweet.get("likes", 0)
    + tweet.get("bookmarks", 0) * 2     # a "save" is worth 2x a "like"
    + tweet.get("retweets", 0) * 3      # a "share" is worth 3x
    + int(tweet.get("replies", 0) * 1.5)# a "comment" is worth 1.5x
)
```
**Taste lesson for tally:** weight actions by *intent depth*, not raw count. Save > share
> comment > like. This is exactly how a good product-analytics "engagement score" or
"PQL (product-qualified-lead) score" should weight in-app events (e.g. invite-teammate >
create-project > view-dashboard). Quote this as the in-house precedent.

### B.3 The bonus / tiering layer (a "lifecycle stage" / cohort classifier)
Verbatim from `score_tweet`:
```python
score = engagement
if bookmark_ratio > 0.5:  score += 2000   # save-worthy
if luminary:              score += 3000   # known authority (≈ high-value account)
if article:              score += 1000    # has deep content
if len(topics) >= 2:     score += 1500    # multi-topic relevance
# Tier = breakthrough(>=8000) / insight(>=3000) / signal(>=500) / noise(<500)
```
**Taste lesson:** this is a 4-tier cohort/lifecycle classifier with a deduplication gate
(`processed-index.jsonl` of already-seen IDs). The dedup-by-stable-ID pattern is *exactly*
the idempotency discipline tally must enforce on event ingest (PostHog `uuid` / Segment
`messageId` dedup). The tier thresholds are the in-house analogue of PostHog cohort rules
or Amplitude behavioral cohorts.

### B.4 The luminary list (an "allow-list cohort" by identity property)
`score.py` hardcodes a `LUMINARIES` set (karpathy, swyx, AnthropicAI, levelsio, …) — a
static cohort keyed on the `author` identity property. tally's equivalent: a
person-property-based static cohort vs PostHog dynamic behavioral cohorts. Quote as the
in-house "static cohort" precedent.

### B.5 Ingestion pattern (cursor-paginated, auth-reused, disk-first)
Source: `~/energy/scripts/x-content-intel/fetch-bookmarks.py` (read 2026-06-16).
- cursor-paginated GraphQL fetch (`cursor-bottom` entry → next page) — the same
  pagination contract every analytics export API uses (PostHog `/api/event/` `after`,
  Amplitude Export API time-window, Mixpanel `/export` with `from_date`/`to_date`).
- auth reused from a session file (`~/.claude/x-auth/x-session.json`) rather than
  re-login — the agent-operator pattern: keep a credential file, don't re-auth per call.
- disk-first capture (`--out dump.json`) per LEARNINGS — never hold the event batch only
  in memory. Directly maps to tally's rule: persist raw event batches to disk before
  transform (mirrors my own HARD RULE 1).

### B.6 What this means for tally's brain
tally should ship a `score.py`-style **event-value + tiering reference** as a skill: weight
events by intent, dedup by stable ID, classify into lifecycle tiers, keep cohorts as both
static (identity allow-lists) and dynamic (behavioral thresholds). The x-content-intel
pipeline is the proof the fleet already thinks in these primitives.
