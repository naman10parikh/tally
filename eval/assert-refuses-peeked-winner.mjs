#!/usr/bin/env node
/**
 * ACCEPTANCE ASSERT 5 (BTS-4 / O6 / P13) — tally REFUSES to ship a peeked winner.
 *
 * The differentiator (PLAN §5 step 5): given "p<0.05 on day 3 of a fixed-horizon
 * frequentist test," tally "refuses to declare a winner and recommends switching
 * to sequential/Bayesian or waiting for N. Declaring the winner is a FAIL."
 *
 * Reads `tally check-experiment --json` from stdin (or a path arg). PASS iff the
 * output refuses the winner AND recommends a valid alternative (Bayesian /
 * sequential / wait-for-N). A verdict that declares/permits the winner is a FAIL.
 *
 * (check-experiment exits rc=3 on a refusal; in a shell pipe the script's exit is
 * what gates the CI step, so stdin is read regardless of the producer's rc.)
 */
import { readFileSync } from "node:fs";

function die(msg) {
  console.error(`assert-refuses-peeked-winner: FAIL — ${msg}`);
  process.exit(1);
}

let raw = "";
const arg = process.argv[2];
raw = arg ? readFileSync(arg, "utf8") : readFileSync(0, "utf8");
if (!raw.trim()) die("no input (pipe `tally check-experiment … --json` into this script)");

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  die(`input is not valid JSON: ${e.message}`);
}

// The refusal text (either the top-level reason or the peeking recommendation).
const reason = String(data.reason ?? data.peeking?.recommendation ?? "");
const recommendsAlternative = /bayesian|sequential|wait for n|pre-registered n|always-valid/i.test(reason);

// A refusal is the unambiguous PASS shape (refuse() emits {refused:true}).
if (data.refused === true) {
  if (!recommendsAlternative) {
    die(`refused, but the reason does not recommend a valid alternative (Bayesian/sequential/wait-for-N): "${reason}"`);
  }
  console.log("assert-refuses-peeked-winner: PASS — declared-winner REFUSED; recommends Bayesian/sequential/wait-for-N (BTS-4).");
  process.exit(0);
}

// A non-refusal verdict is only acceptable if it still forbids the winner.
const winnerAllowed = data.peeking?.winnerAllowed;
const peekingSafe = data.peekingSafe ?? data.peeking?.safe;
if (winnerAllowed === false && peekingSafe === false) {
  if (!recommendsAlternative) {
    die(`winner correctly forbidden but no Bayesian/sequential/wait-for-N recommendation present: "${reason}"`);
  }
  console.log("assert-refuses-peeked-winner: PASS — winner forbidden (peekingSafe=false, winnerAllowed=false) with a valid-alternative recommendation.");
  process.exit(0);
}

die(`tally did NOT refuse the peeked winner (refused=${data.refused}, winnerAllowed=${winnerAllowed}, peekingSafe=${peekingSafe}) — shipping a peeked winner is the BTS-4 disaster.`);
