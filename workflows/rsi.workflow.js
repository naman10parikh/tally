#!/usr/bin/env node
/**
 * tally RSI — the deterministic, $0/tokenless 6-step DSIP loop (RSI L2 +
 * Dispatch · routine). Honors `dsip.json` (`loop.steps`, D4). Run:
 *
 *   node workflows/rsi.workflow.js --deterministic
 *
 * The 6 steps (D8 / HARNESS-OVERRIDES "RSI"):
 *   1. refresh-brain          — re-read brain/TOOL-MATRIX.md pins.
 *   2. re-verify-tool-matrix  — the RATE-LIMIT/ARCHIVE/SPEC-GAP WATCH (the
 *      tally-specific override): re-check the HogQL 120/hr cap (PostHog#28184),
 *      the archived/dead-repo set (PostHog/mcp 2026-01-19, posthog-js-lite), and
 *      the OpenFeature spec gaps (#371/#374/#346). Detects DRIFT in our brain AND
 *      proves its detector fires on a planted stale number + a planted archived
 *      repo string (the verify). Live gh/npm checks are best-effort (non-fatal
 *      offline — the loop is $0/tokenless and must run in a hermetic CI).
 *   3. run-eval-pyramid       — `tally eval` (the eval gate; E1's suite when present).
 *   4. propose                — write a candidate diff to a GATED branch dir (no commit).
 *   5. test-gate              — must pass (acceptance + no-regression) before any commit.
 *   6. commit                 — gated; ONLY if the gate passed. The Claude half
 *      (LLM-authored improvement) is DEFERRED behind CLAUDE_CODE_OAUTH_TOKEN —
 *      dark is EXPECTED, not a miss (D8).
 *
 * Boundary: this loop improves tally's OWN harness. It never touches another
 * employee's plane.
 *
 * Zero deps beyond node stdlib. Exits 0 when the deterministic loop completes
 * (proposing without committing unless the gate passes is success).
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

/** Canonical watchlist — the facts that MOVE and must be re-verified each loop. */
const WATCHLIST = {
  // The HogQL read cap (the single most important agent-operator rate limit, P11).
  hogqlPerHour: 120,
  // Repos that were archived mid-research-window — must NOT be used as live (P9).
  archivedRepos: ["PostHog/mcp", "PostHog/posthog-js-lite", "posthog-js-lite"],
  // OpenFeature spec gaps that are OPEN and WILL close, flipping our stances (P26).
  openFeatureSpecGaps: ["#371", "#374", "#346"],
  // The active tuning PR for the HogQL cap — re-check it each loop.
  hogqlTuningPr: "PostHog/posthog#28184",
};

/** A regex that finds a HogQL rate-limit number anywhere in a text. */
const HOGQL_NUM = /HogQL[^.\n]*?(\d{2,5})\s*\/\s*(?:hour|hr)\b|(\d{2,5})\s*\/\s*(?:hour|hr)[^.\n]*?HogQL/gi;
/** A regex that finds a clone/use of an archived repo. */
const ARCHIVED_REF = /(?:git\s+clone|github\.com\/|clone\s+)?\b(PostHog\/mcp|PostHog\/posthog-js-lite|posthog-js-lite)\b/gi;

/** Step result row. */
function rec(steps, step, status, detail) {
  steps.push({ order: steps.length + 1, step, status, ...(detail ? { detail } : {}) });
}

/**
 * The drift detector (the heart of the watch). Scans a text for:
 *   (a) a HogQL rate-limit number that DIFFERS from the canonical 120 → STALE.
 *   (b) a reference to a known-archived repo used as if live → STALE.
 * Returns the list of flags (empty = clean).
 */
export function scanForDrift(text) {
  const flags = [];

  let m;
  HOGQL_NUM.lastIndex = 0;
  while ((m = HOGQL_NUM.exec(text)) !== null) {
    const num = Number(m[1] ?? m[2]);
    if (Number.isFinite(num) && num !== WATCHLIST.hogqlPerHour) {
      flags.push({
        kind: "stale-rate-limit",
        found: num,
        canonical: WATCHLIST.hogqlPerHour,
        message: `HogQL rate limit ${num}/hr ≠ canonical ${WATCHLIST.hogqlPerHour}/hr — re-verify ${WATCHLIST.hogqlTuningPr}`,
      });
    }
  }

  ARCHIVED_REF.lastIndex = 0;
  while ((m = ARCHIVED_REF.exec(text)) !== null) {
    flags.push({
      kind: "archived-repo",
      found: m[1],
      message: `"${m[1]}" is archived (dead-repo trap P9) — use the hosted mcp.posthog.com endpoint / mainline posthog-js`,
    });
  }

  return flags;
}

/** Best-effort live check (non-fatal): is PostHog/mcp still archived? */
function liveArchiveCheck() {
  const gh = spawnSync("gh", ["api", "repos/PostHog/mcp", "--jq", ".archived"], {
    encoding: "utf8",
    timeout: 8000,
  });
  if (gh.status === 0 && gh.stdout) {
    return { reachable: true, archived: gh.stdout.trim() === "true" };
  }
  return { reachable: false };
}

/** Run `tally eval` (the eval gate). $0 — exits 0 even if E1's suite isn't built. */
function runEval() {
  const res = spawnSync(process.execPath, [resolve(REPO, "bin", "tally.js"), "eval", "--json"], {
    encoding: "utf8",
    timeout: 60000,
  });
  let parsed = null;
  try {
    parsed = JSON.parse(res.stdout ?? "");
  } catch {
    parsed = null;
  }
  return { exitCode: res.status ?? 1, result: parsed };
}

/** The deterministic 6-step loop. */
function runDeterministic() {
  const steps = [];

  // ── Step 1: refresh-brain ──────────────────────────────────────────────────
  const toolMatrixPath = resolve(REPO, "brain", "TOOL-MATRIX.md");
  const pitfallsPath = resolve(REPO, "brain", "KNOWN-PITFALLS.md");
  const toolMatrix = existsSync(toolMatrixPath) ? readFileSync(toolMatrixPath, "utf8") : "";
  const pitfalls = existsSync(pitfallsPath) ? readFileSync(pitfallsPath, "utf8") : "";
  rec(steps, "refresh-brain", toolMatrix && pitfalls ? "ok" : "warn", {
    toolMatrixBytes: toolMatrix.length,
    pitfallsBytes: pitfalls.length,
  });

  // ── Step 2: re-verify-tool-matrix + rate-limit/archive/spec-gap watch ───────
  // 2a. Confirm OUR brain still pins the canonical facts (drift-on-our-brain).
  const brainText = `${toolMatrix}\n${pitfalls}`;
  const pinsIntact = {
    hogql120: brainText.includes("120/hr") || brainText.includes("120/hour"),
    posthogMcpArchived: /PostHog\/mcp[^]*archived/i.test(brainText) || brainText.includes("archived") && brainText.includes("PostHog/mcp"),
    specGapsPresent: WATCHLIST.openFeatureSpecGaps.every((g) => brainText.includes(g)),
  };
  // 2b. THE DETECTOR SELF-TEST (the verify): feed a PLANTED stale HogQL number
  //     AND a PLANTED archived-repo string; the watch MUST flag both. This proves
  //     the detector fires deterministically, $0, offline.
  const plantedSample =
    "An agent loop calling execute-sql exhausts the HogQL 999/hour cap and stalls. " +
    "Fix: git clone PostHog/mcp and run it locally.";
  const plantedFlags = scanForDrift(plantedSample);
  const caughtStaleRate = plantedFlags.some((f) => f.kind === "stale-rate-limit" && f.found === 999);
  const caughtArchived = plantedFlags.some((f) => f.kind === "archived-repo" && /PostHog\/mcp/i.test(f.found));
  // 2c. Best-effort live check (non-fatal offline).
  const live = liveArchiveCheck();
  const watchOk = pinsIntact.hogql120 && pinsIntact.specGapsPresent && caughtStaleRate && caughtArchived;
  rec(steps, "re-verify-tool-matrix", watchOk ? "ok" : "fail", {
    pinsIntact,
    detector: { caughtStaleRate, caughtArchived, planted: plantedFlags },
    liveArchiveCheck: live,
    watchlist: WATCHLIST,
  });

  // ── Step 3: run-eval-pyramid ────────────────────────────────────────────────
  const evalRes = runEval();
  rec(steps, "run-eval-pyramid", evalRes.exitCode === 0 ? "ok" : "fail", {
    evalExit: evalRes.exitCode,
    hasSuite: evalRes.result?.hasSuite ?? false,
    note: evalRes.result?.note,
  });

  // ── Step 4: propose ─────────────────────────────────────────────────────────
  // Write a candidate diff to a GATED, gitignored branch dir — NEVER committed
  // here. (The deterministic loop proposes; the Claude half authors the actual
  // improvement when CLAUDE_CODE_OAUTH_TOKEN is set.)
  const proposalDir = resolve(REPO, ".rsi", "proposals");
  mkdirSync(proposalDir, { recursive: true });
  const proposalPath = resolve(proposalDir, `proposal-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const watchStep = steps.find((s) => s.step === "re-verify-tool-matrix");
  const proposal = {
    ts: new Date().toISOString(),
    kind: "deterministic-watch",
    findings: watchStep?.detail?.detector?.planted ?? [],
    pinsIntact: watchStep?.detail?.pinsIntact,
    note: "Deterministic RSI proposal (no LLM). The Claude half authors real diffs when CLAUDE_CODE_OAUTH_TOKEN is set.",
  };
  writeFileSync(proposalPath, JSON.stringify(proposal, null, 2) + "\n", "utf8");
  rec(steps, "propose", "ok", { proposalPath, committed: false });

  // ── Step 5: test-gate ───────────────────────────────────────────────────────
  // The gate: the watch passed AND evals didn't regress. Only a passing gate
  // permits a commit (step 6).
  const gatePassed = watchOk && evalRes.exitCode === 0;
  rec(steps, "test-gate", gatePassed ? "ok" : "fail", {
    gate: "watch-ok && eval-no-regression",
    gatePassed,
  });

  // ── Step 6: commit (GATED) ──────────────────────────────────────────────────
  // Deterministic mode NEVER auto-commits — it proposes. A real commit is the
  // Claude half's job, gated behind the token. We record the gate decision.
  const claudeHalfArmed = Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN);
  rec(steps, "commit", "skipped", {
    committed: false,
    reason: gatePassed
      ? claudeHalfArmed
        ? "gate passed + CLAUDE_CODE_OAUTH_TOKEN set → Claude half would author+commit a gated PR (deferred path)"
        : "gate passed but CLAUDE_CODE_OAUTH_TOKEN unset → Claude half DEFERRED (D8 — dark is expected); deterministic loop proposes only, does not commit"
      : "gate did not pass → no commit (fail-closed)",
    claudeHalfArmed,
    gatePassed,
  });

  const completed = steps.every((s) => s.status === "ok" || s.status === "skipped" || s.status === "warn");
  return { mode: "deterministic", steps, completed, gatePassed, claudeHalfArmed };
}

// ── Entrypoint ────────────────────────────────────────────────────────────────
// Run only when invoked directly as the binary — NOT when imported by a test
// (so `import { scanForDrift }` doesn't trigger the loop + process.exit).
const invokedDirectly =
  process.argv[1] !== undefined && process.argv[1].endsWith("rsi.workflow.js");
const args = process.argv.slice(2);
if (invokedDirectly && (args.includes("--deterministic") || args.length === 0)) {
  const out = runDeterministic();
  if (args.includes("--json")) {
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } else {
    process.stdout.write("tally RSI · deterministic loop\n");
    for (const s of out.steps) {
      const mark = s.status === "ok" ? "✓" : s.status === "skipped" ? "·" : s.status === "warn" ? "!" : "✗";
      process.stdout.write(`  ${s.order}. ${mark} ${s.step} (${s.status})\n`);
    }
    const watch = out.steps.find((s) => s.step === "re-verify-tool-matrix");
    if (watch) {
      process.stdout.write(
        `  watch: stale-rate-limit caught=${watch.detail.detector.caughtStaleRate}, archived-repo caught=${watch.detail.detector.caughtArchived}\n`,
      );
    }
    process.stdout.write(
      out.completed
        ? `deterministic loop COMPLETE — gatePassed=${out.gatePassed}, committed=false (Claude half ${out.claudeHalfArmed ? "armed" : "DEFERRED"})\n`
        : "deterministic loop INCOMPLETE — see steps\n",
    );
  }
  // Completing the deterministic loop (propose-without-commit-unless-gate) is success.
  process.exit(out.completed ? 0 : 1);
} else if (invokedDirectly) {
  process.stderr.write("usage: node workflows/rsi.workflow.js --deterministic [--json]\n");
  process.exit(2);
}
