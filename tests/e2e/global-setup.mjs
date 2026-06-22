/* tests/e2e/global-setup.mjs — Playwright global setup for the tally cockpit E2E (G2).
 *
 * Guarantees the cockpit renders REAL data before the spec runs:
 *   1. The CLI is built (the cockpit's brain/plan/experiment/flag views shell `dist/cli/index.js`
 *      via the bin shim; the dev fallback is tsx, but a built CLI is faster + deterministic).
 *   2. At least one `tally` wide event exists in logs/runs.jsonl, so the Run-log view has a
 *      deterministic newest row to assert on (rather than depending on cross-run state).
 *
 * This is setup, not a test — it runs once before the suite. It is idempotent and $0 (the seed
 * command is a read-only `tally brain` query against the committed brain corpus, no creds).
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = join(REPO, "dist", "cli", "index.js");

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: REPO, encoding: "utf8", stdio: "pipe", ...opts });
}

export default async function globalSetup() {
  // 1) Build if needed (the cockpit shells the built CLI for the fast path).
  if (!existsSync(CLI)) {
    const b = run("pnpm", ["build"]);
    if (b.status !== 0) throw new Error(`pnpm build failed in global-setup:\n${b.stderr || b.stdout}`);
  }

  // 2) Seed one wide event so the Run-log view has data (idempotent — append-only log). A `tally
  //    brain` query is $0, read-only, and always succeeds against the committed corpus.
  const r = run(process.execPath, [CLI, "brain", "peeking winner noise", "--json"]);
  if (r.status !== 0) {
    process.stderr.write(`[global-setup] warn: seed brain run rc=${r.status}: ${(r.stderr || "").slice(0, 200)}\n`);
  }
}
