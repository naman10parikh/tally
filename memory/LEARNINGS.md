# tally — LEARNINGS (append-only)

Every error → root cause → rule. Auto-compressed when >500 lines (memory-compress.sh).

## 2026-06-20 · A brain chunk ends at the next heading of its level
- **What broke:** `tally explain O6` leaked the next section of the brain file.
- **Root cause:** a chunk ended only at the next heading with the same ID.
- **Rule:** a chunk ends at any heading whose level is equal or higher than its own.

## 2026-06-21 · Test the generated artifact, not only the engine behind it
- **What broke:** the CI check that `track-plan` writes could not run: it imports `tally/dist/...`, which
  only resolves where `tally` is installed.
- **Root cause:** the proof tested the validator directly and never ran the generated file.
- **Rule:** run what the tool generates, the way a consuming app would (here, with a `node_modules/tally`
  self-link).

## 2026-06-21 · Check a sibling's `--json` shape before reusing its parser
- **What broke:** the cockpit read "unparseable JSON" from `tally --json`.
- **Root cause:** the parser came from canary, which prints one compact line; tally prints pretty JSON.
- **Rule:** parse the whole output, then fall back to the first `{` to last `}` slice.

## 2026-06-21 · Vitest and Playwright must not share a glob
- **What broke:** adding `@playwright/test` made `pnpm test` load the e2e specs and fail two suites.
- **Rule:** `vitest.config.ts` excludes `tests/e2e/**` and keeps `tests/**` and `eval/**`.

## 2026-09-22 · Never write a model ID
- **What broke:** `scripts/budget-manager.sh apply` wrote a model ID into `.claude/settings.local.json`,
  which outranks the client default and froze new sessions on an old model.
- **Rule:** never write a model ID into a setting, flag or script. Leave the model to the client default.

## 2026-10-19 · Darwin's checker is the DSIP gate
- **What broke:** `dsip.json` said `selection: "eval-gated"` with an array `snapback`, to satisfy a
  one-off June build check; Darwin's checker rejected it at L0.
- **Rule:** write `dsip.json` in DSIP vocabulary (`selection` performance, novelty or
  performance-novelty; `loop.steps` include `validate` and `ship`; `snapback` is `{granularity, vcs: "git"}`)
  and run `darwin-check dsip.json` after every change. A start guard that matches file names must also
  match the bin names (`.bin/tally`, `tally-mcp`): before CP158, `npx ... tally --help` printed nothing.
