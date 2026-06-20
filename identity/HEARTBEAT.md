# tally — Heartbeat

> The real cadence tally runs — its dogfood discipline. This is NOT a generic "scan for opportunities"
> loop; it is the flag-debt-sweep + brain-pin re-verify check-in that the deterministic RSI loop
> executes (the proof the analytics employee obeys analytics rules on its own repo).

## Schedule

| Check | Frequency | Action on anomaly |
| --- | --- | --- |
| **Flag-debt sweep** (zombie flags: age + last-eval + owner; temporary≠permanent; reused-key tombstone) | Nightly (GitHub Actions `workflow_dispatch`/`schedule`) + on-demand `tally flag-sweep` | If a temporary flag is past expiry OR a retired key is recycled → open a removal-diff PR; **block** any reuse of a retired key (O11/P27) |
| **Brain-pin re-verify** (version-sensitive facts in `brain/`) | Nightly, in the RSI deterministic loop | If a planted-stale check fires (HogQL 120/hr cap moved in `PostHog#28184`, an archived repo like `PostHog/mcp`/`posthog-js-lite`, an OpenFeature spec gap #371/#374/#346 closed) → flag the brain note for refresh, propose a diff (no auto-commit unless the eval gate passes) |
| **Eval pyramid** (L1 structural + L2 golden behavioral from BTS-1–BTS-17) | Nightly + pre-ship | If any CI-blocking golden task (G1–G10, G15, G16) regresses → fail the loop, do not ship |
| **Tool-matrix watch** (changelogs / issues / X per `brain/TOOL-MATRIX.md`) | Nightly | If a default-shift is detected (e.g. an OpenFeature gap closes, flipping a "use vendor-specific" stance) → record it, propose the brain/OPINIONS update |
| **Run-telemetry health** (`logs/runs.jsonl` integrity) | Every run | If `durationMs` is all-zero or `trace.id` missing → the run is non-conformant; fix the logger (tally must dogfood the wide event it preaches, O19) |

## Health Indicators

- **Healthy:** last RSI loop < 24h ago, eval pyramid green, no zombie flag past expiry, no stale brain pin.
- **Warning:** last loop > 24h ago, OR a flag-debt-sweep finding open, OR a planted-stale brain check fired.
- **Critical:** a CI-blocking golden task is red, OR a retired flag key was reused, OR a critical-PII
  finding (P8) is unmasked → halt ship, fail closed.

## Recovery

1. Read the last failure from the RSI loop output / `logs/runs.jsonl`.
2. Check `memory/LEARNINGS.md` + `brain/KNOWN-PITFALLS.md` for the matching P-ID and its avoid-recipe.
3. If fixable deterministically (re-verify a number, re-run a typed query, regenerate a removal diff):
   apply, re-run the eval gate, resume.
4. If it needs a model (the Claude RSI half, gated behind `CLAUDE_CODE_OAUTH_TOKEN`): propose a diff,
   leave it for the gated run; never ship past a failed gate.
