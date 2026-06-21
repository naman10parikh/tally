---
name: pii-safe-capture
description: Keep PII out of your analytics and session-replay store — mask-all-then-allowlist (never denylist-after), the four default hiding places, before_send URL-scrub, three-platform opt-out (web/iOS/RN), fail-closed at the edge BEFORE storage. Use when asked to "set up session replay", "is my analytics GDPR-safe", "mask inputs", "audit for PII", "before_send", or "we leaked emails into PostHog". Encodes tally's O4 + J3 + BTS-2 + P8.
---

# pii-safe-capture — mask everything, allow back; it's a one-way door

> Encodes **O4** (mask-all-then-allowlist for replay/capture, never allow-all-then-denylist; fail
> closed), **J3** (PII/privacy fail-closed capture), **BTS-2** (the PII-in-replay leak), and **P8**
> (the four default PII hiding places). Under the meta-stance **O20** — PII is an irreversible class,
> so it gets a wall.
>
> Why mask-first: "PostHog will make a best effort to not capture sensitive information by default.
> This is not always sufficient." Free text is NOT masked by default. Once stored/exported, "you cannot
> un-ring the bell." Denylists are whack-a-mole — the data is already stored before you patch the list.
> The only correct posture is mask everything, then allow specific fields back by explicit attribute.

## Trigger

Invoke this skill when the request is any of:

- "set up session replay" / "turn on replay" / "record sessions"
- "is my analytics GDPR/CCPA-safe" / "are we leaking PII" / "privacy review of our tracking"
- "mask inputs" / "before_send" / "scrub URLs" / "redact form fields"
- "audit for PII" / "we found emails in PostHog" / "a replay showed a credit card"
- a property bag about to be captured that contains `email`/`phone`/`ssn`/`card`/`password`/`token`/`dob`

Do **not** invoke for: secret-scanning of source/config (that's hush) or LLM-prompt redaction
(agentmoney). This skill is about PII in the **product-analytics + replay** plane only.

## Steps

1. **Set the mask-all default (O4/P8).** `maskAllInputs: true` + `maskTextSelector: "*"` for session
   replay. Start from "nothing is captured" and unmask specific elements by an explicit data-attribute —
   NEVER start from "everything is captured" and try to redact back. `tally audit-pii <dir>` flags a
   replay config with `maskAllInputs:false` as a critical finding (BTS-2/O4).
2. **Cover all FOUR default hiding places (P8) — this is the part teams miss:**
   - **Autocapture input metadata:** PostHog captures `<input>` `name`/`id`/`class` (field identity
     leaks even when the value is masked) — opt these out.
   - **Replay DOM:** full DOM incl. form values unless masked — covered by step 1.
   - **URLs:** full URLs incl. query strings flow into `$current_url` — add a `before_send` that nulls
     or scrubs `$current_url` query strings (`?email=…&token=…`).
   - **`identify()` props:** whatever you pass is stored verbatim — mask before passing.
3. **Drop/mask PII property keys at the SDK/edge BEFORE storage (O4/J3).** Any property key matching the
   PII pattern (`email|phone|ssn|card|password|token|dob|...`) is redacted to `***` unless explicitly
   allow-listed. `tally capture-event` masks at the edge: a planted `email` prop is `***` in the sink —
   `grep` for the raw value finds NOTHING. Fail closed: a key is kept verbatim only if it is not PII OR
   is on the explicit `--allow` list.
4. **Opt out on all THREE platforms — governance that's web-only silently leaks on mobile (P8/P24).**
   Web (the `ph-no-capture` class), iOS (accessibility-id based; iOS "best-effort" PII detection is "not
   always sufficient"), and React Native (the prop-based opt-out). `audit-pii` checks web/iOS/RN
   coverage; a cloud-mode-only governance posture is the P24 trap — verify it applies to device-mode/
   mobile destinations too.
5. **Add the `before_send` URL-scrub (P8).** A `before_send` hook that strips query strings from
   URL-shaped values is the structural fix for the URL hiding place — `audit-pii` confirms its presence.
6. **Mind region defaults (P8).** EU orgs default IP-capture OFF; US orgs default it ON — set it
   explicitly rather than relying on the region default.
7. **Verify.** `tally capture-event checkout_started --props '{"email":"a@b.com","plan":"pro"}' --sink
   local --json` → `piiMasked:true`, `droppedKeys:["email"]`; read the sink back: `grep "a@b.com"` finds
   NOTHING, `grep '"email":"***"'` matches. `tally audit-pii <dir> --json` → `critical:0` only when
   mask-all + before_send + three-platform opt-out are all present.

## Output

- A **mask-all-then-allowlist** replay/capture config (`maskAllInputs:true`, `maskTextSelector:"*"`),
  with specific fields unmasked by explicit attribute — never a denylist.
- **Edge masking** so PII property keys are redacted to `***` BEFORE storage; a planted `email` is
  unreadable in the sink (verified by grep), kept only if explicitly allow-listed.
- A **`before_send` URL-scrub** that strips query strings from `$current_url`, plus opt-outs on the
  autocapture-input-metadata and `identify()`-props hiding places.
- **Three-platform coverage** (web/iOS/RN) with the cloud-mode-only governance gap (P24) called out.
- A `tally audit-pii` report with `critical:0` on tally's own instrumentation (the dogfood: tally's
  capture passes tally's own audit) — and evidence the mask fires (raw PII absent from the sink).
