#!/usr/bin/env bash
# scripts/serve.sh — launch the tally cockpit (G1, PLAN §10, DECISIONS D3).
#
# The cockpit is a zero-dependency Node stdlib server (web/server.mjs) + a vanilla-JS SPA
# (web/index.html + web/app.js + web/styles.css). No build step. The cockpit is READ-MOSTLY
# (PLAN Q7) — it shells the read-only `tally brain`/`tally explain`/`tally check-experiment`/
# `tally flag-sweep`/`tally track-plan` CLI and reads brain/*.md + logs/runs.jsonl; it never
# creates a flag, fires a capture, or declares a winner from the browser.
#
# Usage: bash scripts/serve.sh            # serves on http://127.0.0.1:7788
#        TALLY_WEB_PORT=8080 bash scripts/serve.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${TALLY_WEB_PORT:-7788}"

# The data views shell the `tally` binary shim (bin/tally.js), which prefers dist/cli/index.js but
# falls back to tsx in a dev checkout — so the cockpit works with or without a build. Warn (don't
# fail) if dist/ is absent so the chairman knows the views run via the slower tsx path.
if [ ! -f "$REPO/dist/cli/index.js" ]; then
  echo "tally: dist/ not built — the brain/plan/experiment/flag views run via tsx (slower). Run: pnpm build" >&2
fi

echo "tally cockpit → http://127.0.0.1:${PORT}  (Ctrl-C to stop)"
exec node "$REPO/web/server.mjs"
