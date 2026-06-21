#!/usr/bin/env node
/**
 * ACCEPTANCE ASSERT 1 (BTS-1 / O1) — the registry CI check FAILS on a case-variant.
 *
 * The bar (PLAN §5 step 1): "the failing CI check must exist; discussing naming
 * hygiene ≠ pass." This proves the artifact, not the description:
 *   1. run `tally track-plan` on the clean sample-app → a registry + a generated
 *      ci-check-events.mjs (the dedup ledger + the gate),
 *   2. plant `Checkout Started` (a case-variant of registered `checkout_started`)
 *      into the scanned tree,
 *   3. run the generated CI check against the planted tree,
 *   4. assert it EXITS NON-ZERO and reports a case-variant violation.
 *
 * Exit 0 only if the planted variant fails the gate; non-zero otherwise.
 *
 * Self-contained (sets up its own temp tree) so it runs identically in CI and
 * locally. The generated CI check imports `tally/dist/...`, so it is executed
 * with cwd = the tally repo root (where node_modules/tally resolves).
 */
import { cpSync, mkdtempSync, copyFileSync, rmSync, existsSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url)); // .../eval
const repoRoot = resolve(here, "..");
const sampleApp = join(here, "fixtures", "sample-app");
const variantFile = join(here, "fixtures", "variant", "planted-variant.js");
const tallyBin = join(repoRoot, "bin", "tally.js");

function die(msg) {
  console.error(`assert-ci-check-fails-on-variant: FAIL — ${msg}`);
  process.exit(1);
}

if (!existsSync(sampleApp)) die(`sample-app fixture missing at ${sampleApp}`);
if (!existsSync(variantFile)) die(`planted-variant fixture missing at ${variantFile}`);

// The generated CI check imports `tally/dist/...` (it stays in lockstep with the
// core validator). In a CONSUMING app, `tally` is an installed dependency; here,
// dogfooding, we ensure a self-link `node_modules/tally -> repoRoot` so the
// import resolves. Idempotent + harmless (this IS the tally package). The plan
// output is then written INSIDE the repo tree so Node walks up to that node_modules.
function ensureSelfLink() {
  const nm = join(repoRoot, "node_modules");
  const link = join(nm, "tally");
  if (existsSync(link)) return;
  try {
    mkdirSync(nm, { recursive: true });
    symlinkSync("..", link, "dir");
  } catch (e) {
    die(`could not create node_modules/tally self-link (needed so the generated CI check resolves 'tally'): ${e.message}`);
  }
}
ensureSelfLink();

// Temp scan tree = a copy of the clean sample-app (event call-sites only).
const scanDir = mkdtempSync(join(tmpdir(), "tally-civariant-"));
// Plan output lives INSIDE the repo (eval/.plan-civariant) so the generated CI
// check's `import "tally/..."` resolves via the repo's node_modules/tally.
const planDir = join(here, ".plan-civariant");
try {
  cpSync(sampleApp, scanDir, { recursive: true });

  // 1. track-plan the CLEAN tree → registry + CI check (no variant yet).
  const tp = spawnSync(process.execPath, [tallyBin, "track-plan", scanDir, "--app", "ci", "--out", planDir, "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (tp.status !== 0) die(`track-plan on clean tree exited ${tp.status}: ${tp.stderr || tp.stdout}`);
  const ciCheck = join(planDir, "ci-check-events.mjs");
  if (!existsSync(ciCheck)) die(`track-plan did not emit a CI check at ${ciCheck}`);

  // Sanity: the CLEAN tree must PASS the gate (else the test proves nothing).
  const clean = spawnSync(process.execPath, [ciCheck, scanDir], { cwd: repoRoot, encoding: "utf8" });
  if (clean.status !== 0) {
    die(`clean tree unexpectedly failed the CI gate (rc=${clean.status}) — the gate is over-strict: ${clean.stderr || clean.stdout}`);
  }

  // 2. PLANT the case-variant into the scanned tree.
  copyFileSync(variantFile, join(scanDir, "src", "planted-variant.js"));

  // 3. Re-run the SAME CI check against the now-planted tree.
  const planted = spawnSync(process.execPath, [ciCheck, scanDir], { cwd: repoRoot, encoding: "utf8" });

  // 4. It MUST fail (non-zero) AND name a case-variant violation.
  if (planted.status === 0) {
    die("the CI check PASSED on a planted case-variant — the taxonomy gate does not actually fail the build (discussing ≠ enforcing).");
  }
  const out = `${planted.stdout}\n${planted.stderr}`;
  if (!/case-variant/i.test(out) || !/Checkout Started/.test(out)) {
    die(`CI check failed (rc=${planted.status}) but did not report a case-variant for "Checkout Started":\n${out}`);
  }

  console.log(`assert-ci-check-fails-on-variant: PASS — clean tree green; planted "Checkout Started" → CI gate exited ${planted.status} with a case-variant violation.`);
  process.exit(0);
} finally {
  rmSync(scanDir, { recursive: true, force: true });
  rmSync(planDir, { recursive: true, force: true });
}
