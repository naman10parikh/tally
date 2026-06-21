#!/usr/bin/env node
/**
 * ACCEPTANCE ASSERT 6 (BTS-2 / P8 / O4) — tally's own instrumentation passes tally's own audit.
 *
 * The bar (PLAN §5 step 6): "tally audit-pii eval/fixtures/sample-app finds ZERO
 * critical PII surfaces on tally's own instrumentation (mask-all-then-allowlist
 * set, before_send URL-scrub present, all-three-platform opt-out) — i.e. tally's
 * own capture passes tally's own audit."
 *
 * Reads `tally audit-pii --json` from stdin (or a path arg). PASS iff
 * critical === 0 (clean === true). A single critical finding is a FAIL.
 */
import { readFileSync } from "node:fs";

function die(msg) {
  console.error(`assert-no-critical-pii: FAIL — ${msg}`);
  process.exit(1);
}

const arg = process.argv[2];
const raw = arg ? readFileSync(arg, "utf8") : readFileSync(0, "utf8");
if (!raw.trim()) die("no input (pipe `tally audit-pii … --json` into this script)");

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  die(`input is not valid JSON: ${e.message}`);
}

if (typeof data.critical !== "number") die("output has no numeric `critical` count — not a tally audit-pii result?");
if (data.critical > 0) {
  const crit = (data.findings ?? []).filter((f) => f.severity === "critical");
  const lines = crit.map((f) => `  [${f.surface}] ${f.file}:${f.line} — ${f.message}`).join("\n");
  die(`${data.critical} CRITICAL PII finding(s) — tally's own instrumentation must pass tally's own audit:\n${lines}`);
}
if (data.clean !== true) die(`critical=0 but clean!==true — inconsistent audit result`);

console.log(`assert-no-critical-pii: PASS — 0 critical PII surfaces (mask-all-then-allowlist holds; tally's own capture passes tally's own audit).`);
process.exit(0);
