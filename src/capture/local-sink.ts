/**
 * tally — local capture sink (the $0, no-creds capture receiver).
 *
 * D15/Q0: the merge-gating acceptance path captures into a LOCAL file sink (the
 * SDK's `before_send`-to-file path) so "captured verifiably" is provable with
 * ZERO PostHog creds. Events are appended as JSONL and read back for assertion
 * ("captured verifiably", not "capture was attempted"). The live-PostHog sink is
 * the additional, secret-gated path.
 *
 * No `any`, named exports only.
 */

import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** A captured event as stored in the local sink. */
export interface CapturedEvent {
  /** ISO-8601 capture time. */
  ts: string;
  /** Canonical (registry-conformant) event name. */
  event: string;
  /** The distinct_id the event is attributed to. */
  distinctId: string;
  /** The typed, PII-MASKED properties. */
  properties: Record<string, unknown>;
}

/** Default sink path under a base dir (`.capture/events.jsonl`). */
export function defaultSinkPath(baseDir: string = process.cwd()): string {
  return resolve(baseDir, ".capture", "events.jsonl");
}

/** Resolve a sink path inside a given base dir (sandbox uses this). */
export function sinkPathIn(baseDir: string): string {
  return join(baseDir, ".capture", "events.jsonl");
}

/** Append one captured event to the local JSONL sink (creates the dir). */
export function captureToSink(event: CapturedEvent, sinkPath: string = defaultSinkPath()): void {
  mkdirSync(dirname(sinkPath), { recursive: true });
  appendFileSync(sinkPath, JSON.stringify(event) + "\n", "utf8");
}

/** Read every captured event back from the sink (for verification). */
export function readSink(sinkPath: string = defaultSinkPath()): CapturedEvent[] {
  if (!existsSync(sinkPath)) return [];
  const text = readFileSync(sinkPath, "utf8");
  return text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as CapturedEvent);
}

/** Find the most recent captured event with a given name (verification helper). */
export function lastCaptured(name: string, sinkPath: string = defaultSinkPath()): CapturedEvent | null {
  const all = readSink(sinkPath);
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].event === name) return all[i];
  }
  return null;
}
