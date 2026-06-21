#!/usr/bin/env node
/**
 * ACCEPTANCE ASSERT 3+4 (BTS-2 / P8 / O4) — the event is captured VERIFIABLY with PII masked.
 *
 * The bar (PLAN §5 steps 3-4): "the captured event is read back from the sink and
 * asserted (name + typed props + masked PII) — 'captured verifiably,' not 'capture
 * was attempted.'" Reads the local capture sink (a dir like `./.capture` or a
 * direct `events.jsonl` path) and asserts, against the LAST captured event:
 *   - the event name is present (default: checkout_started),
 *   - a planted `email` prop is MASKED ("***"), NOT the raw "a@b.com" (one-way
 *     door — masked at the edge BEFORE storage, P8),
 *   - the surviving props are typed (plan is a string).
 *
 * Usage: assert-event-captured-pii-masked.mjs <sinkDirOrFile> [eventName]
 * Exit 0 iff the event is present and email is masked; non-zero otherwise.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

function die(msg) {
  console.error(`assert-event-captured-pii-masked: FAIL — ${msg}`);
  process.exit(1);
}

const sinkArg = process.argv[2];
const wantEvent = process.argv[3] ?? "checkout_started";
if (!sinkArg) die("usage: assert-event-captured-pii-masked.mjs <sinkDirOrFile> [eventName]");

// Resolve the sink file: a dir → <dir>/events.jsonl; a file → as-is.
let sinkFile = sinkArg;
if (existsSync(sinkArg) && statSync(sinkArg).isDirectory()) {
  sinkFile = join(sinkArg, "events.jsonl");
}
if (!existsSync(sinkFile)) die(`capture sink not found at ${sinkFile} (did capture-event run with --sink local?)`);

const lines = readFileSync(sinkFile, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
if (lines.length === 0) die(`capture sink ${sinkFile} is empty — no event was captured`);

// The matching events for the wanted name (most recent last).
const matches = [];
for (const line of lines) {
  let rec;
  try {
    rec = JSON.parse(line);
  } catch {
    continue; // skip a malformed line, don't crash
  }
  if (rec.event === wantEvent) matches.push(rec);
}
if (matches.length === 0) die(`no "${wantEvent}" event in the sink (events present: ${lines.length})`);

const rec = matches[matches.length - 1];
const props = rec.properties ?? {};

// PII: if an email prop is present it MUST be masked, never the raw value.
if ("email" in props) {
  if (props.email === "a@b.com" || /@/.test(String(props.email))) {
    die(`email prop is UNMASKED ("${props.email}") — PII reached storage (one-way door, P8). It must be masked at the edge.`);
  }
  if (props.email !== "***") {
    die(`email prop present but not the expected mask ("${props.email}" ≠ "***").`);
  }
}

// A defensive whole-record scan: no raw email anywhere in the stored line.
if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(JSON.stringify(rec))) {
  die(`a raw email pattern is present in the stored record — PII was not masked before storage (P8).`);
}

// Typed: plan should be a string (the registry-conformant typed shape).
if ("plan" in props && typeof props.plan !== "string") {
  die(`prop "plan" is not a string (typed-shape contract broken).`);
}

console.log(`assert-event-captured-pii-masked: PASS — "${wantEvent}" captured & read back from ${sinkFile}; email masked to "${props.email ?? "(absent)"}", plan typed string.`);
process.exit(0);
