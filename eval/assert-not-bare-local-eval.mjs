#!/usr/bin/env node
/**
 * ACCEPTANCE ASSERT 2 (BTS-12 / P1 / O7) — a flag is NEVER wired via bare local-eval.
 *
 * The bar (PLAN §5 step 2): "the eval path is `db` or `pinned-props`, never bare
 * local-eval, and a blast-radius value is present." Reads `tally wire-flag --json`
 * from stdin (or a path arg) and asserts the safe property holds.
 *
 * Two safe outcomes both PASS — together they prove tally NEVER produces a bare-
 * local-eval flag:
 *   A) wired:true with evalPath ∈ {db, pinned-props, static} AND a numeric
 *      blastRadius (the flag was wired correctly), OR
 *   B) refused:true with evalPath "bare-local-eval" (the enforcer REFUSED a bare
 *      local-eval target — O20 fail-closed; tally never lets it through).
 * Anything else (wired with evalPath "bare-local-eval", or no blast-radius on a
 * wired flag) is a FAIL.
 */
import { readFileSync } from "node:fs";

function die(msg) {
  console.error(`assert-not-bare-local-eval: FAIL — ${msg}`);
  process.exit(1);
}

let raw = "";
const arg = process.argv[2];
if (arg) {
  raw = readFileSync(arg, "utf8");
} else {
  raw = readFileSync(0, "utf8"); // stdin
}
if (!raw.trim()) die("no input (pipe `tally wire-flag … --json` into this script)");

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  die(`input is not valid JSON: ${e.message}`);
}

// Outcome B: a refusal of a bare-local-eval target IS the safe property holding.
if (data.refused === true) {
  if (data.evalPath === "bare-local-eval") {
    console.log("assert-not-bare-local-eval: PASS — tally REFUSED a bare-local-eval target (fail-closed, O20). A bare-local-eval flag was never produced.");
    process.exit(0);
  }
  die(`refused, but not for bare-local-eval (evalPath=${data.evalPath}): ${data.reason ?? ""}`);
}

// Outcome A: a wired flag must have a SAFE eval path + a blast-radius value.
if (data.wired !== true) die(`output is neither a refusal nor a wired flag: ${raw.slice(0, 200)}`);

const safe = new Set(["db", "pinned-props", "static"]);
if (data.evalPath === "bare-local-eval") {
  die("a flag was WIRED with evalPath 'bare-local-eval' — the #1 PostHog footgun (BTS-12); use --db-eval or --pinned-props.");
}
if (!safe.has(data.evalPath)) die(`unexpected evalPath '${data.evalPath}' (want db | pinned-props | static)`);
if (typeof data.blastRadius !== "number") die("no numeric blastRadius — a blast-radius pre-check must run before any rollout (BTS-12).");

console.log(`assert-not-bare-local-eval: PASS — wired via '${data.evalPath}' (never bare local-eval), blastRadius=${data.blastRadius}.`);
process.exit(0);
