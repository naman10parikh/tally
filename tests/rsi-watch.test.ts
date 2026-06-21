/**
 * tally — RSI deterministic watch test (D2 verify, the load-bearing detector).
 *
 * The rate-limit/archive watch (HARNESS-OVERRIDES "RSI" tally override) MUST
 * detect (a) a STALE HogQL rate-limit number (≠ the canonical 120/hr) and (b) a
 * reference to a known-ARCHIVED repo used as if live. This asserts the detector
 * fires on planted drift and stays quiet on canonical text — the $0/offline core
 * of the deterministic RSI loop. (The full 6-step run is exercised by the CLI
 * invocation recorded in IMPLEMENTATION-NOTES; this pins the detector logic.)
 *
 * The watch is plain ESM JS (workflows/rsi.workflow.js) — imported here directly.
 */

import { describe, it, expect } from "vitest";
// @ts-expect-error — plain JS workflow module, no .d.ts (intentionally dep-free).
import { scanForDrift } from "../workflows/rsi.workflow.js";

describe("tally RSI deterministic watch — scanForDrift", () => {
  it("flags a PLANTED stale HogQL rate-limit number (≠120/hr)", () => {
    const flags = scanForDrift("the HogQL 999/hour cap stalls the loop");
    const stale = flags.find((f: { kind: string; found?: number }) => f.kind === "stale-rate-limit");
    expect(stale).toBeDefined();
    expect(stale.found).toBe(999);
  });

  it("flags a PLANTED archived-repo string used as if live", () => {
    const flags = scanForDrift("fix: git clone PostHog/mcp and run it locally");
    const archived = flags.find((f: { kind: string; found?: string }) => f.kind === "archived-repo");
    expect(archived).toBeDefined();
    expect(String(archived.found)).toMatch(/PostHog\/mcp/);
  });

  it("flags posthog-js-lite (the other archived dead-repo)", () => {
    const flags = scanForDrift("import posthog from 'posthog-js-lite'");
    expect(flags.some((f: { kind: string }) => f.kind === "archived-repo")).toBe(true);
  });

  it("stays quiet on canonical text (no false positives)", () => {
    const flags = scanForDrift("HogQL is capped at 120/hr; use the hosted mcp.posthog.com endpoint and mainline posthog-js");
    expect(flags).toHaveLength(0);
  });
});
