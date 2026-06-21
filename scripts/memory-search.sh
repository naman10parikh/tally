#!/bin/bash
# memory-search.sh — tally's queryable Memory layer (BM25F over the expertise brain).
#
# tally's Memory is its expertise `brain/` (the six Wave-R artifacts), not code or
# commit history (HARNESS-OVERRIDES §2). This script is the shell surface of the
# Memory ✅ criterion's OR-branch — it delegates to the shared BM25F engine in
# `src/memory/bm25.ts` (the same engine the B-track `tally brain`/`tally explain`
# CLI wraps). It is independent of B1 (no package.json/bin needed — runs via tsx).
#
# Usage:
#   ./scripts/memory-search.sh "<query>" [--limit N] [--json]   ranked brain hits
#   ./scripts/memory-search.sh explain <BTS-/P-/O-/J-/A-id> [--json]
#   ./scripts/memory-search.sh --legacy "<query>"               old grep over memory/ (fallback)
#
# Examples:
#   ./scripts/memory-search.sh "peeking winner noise"   -> BTS-4 + O6 in the top hits
#   ./scripts/memory-search.sh "reuse flag key"         -> BTS-6 + P27
#   ./scripts/memory-search.sh explain P27              -> the Knight Capital pitfall

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BM25_ENGINE="$PROJECT_DIR/src/memory/bm25.ts"
BRAIN_DIR="$PROJECT_DIR/brain"

# Resolve a tsx runner (local node_modules first, then npx as a fallback).
find_tsx() {
  if [ -x "$PROJECT_DIR/node_modules/.bin/tsx" ]; then
    echo "$PROJECT_DIR/node_modules/.bin/tsx"
  elif command -v tsx >/dev/null 2>&1; then
    echo "tsx"
  else
    echo ""
  fi
}

# ---------------------------------------------------------------------------
# Legacy mode: the inherited Energy grep over memory/ + .claude/rules/ (kept as a
# documented fallback so the generic behavior isn't lost; brain search is primary).
# ---------------------------------------------------------------------------
legacy_search() {
  local QUERY="$1"
  local MEMORY_DIR="$PROJECT_DIR/memory"
  local RULES_DIR="$PROJECT_DIR/.claude/rules"
  if [ -z "$QUERY" ]; then
    echo "Error: No query provided" >&2
    exit 1
  fi
  echo "=== Legacy memory grep: \"$QUERY\" ==="
  local found=0
  for dir in "$MEMORY_DIR" "$RULES_DIR"; do
    [ -d "$dir" ] || continue
    while IFS= read -r line; do
      [ -n "$line" ] && { echo "$line"; found=1; }
    done < <(grep -rni "$QUERY" "$dir" --include='*.md' 2>/dev/null | head -20)
  done
  [ "$found" -eq 0 ] && echo "No results found for: $QUERY"
}

# --- arg parse ---
if [ "$#" -eq 0 ] || [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi

if [ "${1:-}" = "--legacy" ]; then
  shift
  legacy_search "${1:-}"
  exit 0
fi

TSX="$(find_tsx)"
if [ -z "$TSX" ] || [ ! -f "$BM25_ENGINE" ]; then
  echo "[memory-search] BM25 engine unavailable (need tsx + src/memory/bm25.ts) — falling back to legacy grep." >&2
  legacy_search "${*:-}"
  exit 0
fi

# explain <id> passthrough
if [ "${1:-}" = "explain" ]; then
  shift
  exec "$TSX" "$BM25_ENGINE" explain "$@"
fi

# default: BM25F brain search. Pass through --limit / --json untouched.
exec "$TSX" "$BM25_ENGINE" search "$@"
