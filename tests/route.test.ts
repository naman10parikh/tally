/**
 * tally — dispatch routing-loop test (Component 8 routing / D1 verify).
 *
 * Asserts the internal routing loop runs the multi-step acceptance flow in the
 * DOCUMENTED order (track-plan → register → wire-flag → capture-event →
 * assert-captured → audit) and is fail-closed: a CLEAN instrumented surface
 * completes all 6 steps in order; a PII-leaky surface HALTS at `audit` (the
 * enforcer thesis — a half-instrumented/leaky surface is not a success, O20).
 *
 * Uses the built CLI via runRoute (the same runTallyCli bridge), so this is the
 * real routed flow. test-before-signal: green before D1 ✅.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRoute, ROUTE_ORDER } from "../src/dispatch/route.js";

let cleanDir: string;
let leakyDir: string;

beforeAll(() => {
  cleanDir = mkdtempSync(join(tmpdir(), "tally-route-clean-"));
  mkdirSync(join(cleanDir, "src"), { recursive: true });
  writeFileSync(
    join(cleanDir, "src", "app.ts"),
    [
      'import { capture } from "./analytics";',
      'export const a = () => capture("user_signed_up", { plan: "free", referral_source: "google" });',
      'export const b = () => capture("checkout_started", { plan: "pro", amount: 49 });',
      "",
    ].join("\n"),
  );

  leakyDir = mkdtempSync(join(tmpdir(), "tally-route-leaky-"));
  mkdirSync(join(leakyDir, "src"), { recursive: true });
  writeFileSync(
    join(leakyDir, "src", "replay.ts"),
    [
      'import posthog from "posthog-js";',
      'posthog.init("phc_x", { session_recording: { maskAllInputs: false } });',
      'export const id = (email: string) => posthog.identify(email, { email });',
      "",
    ].join("\n"),
  );
});

describe("tally dispatch routing loop", () => {
  it("runs the 6 steps in the documented order on a clean surface", () => {
    const r = runRoute({ dir: cleanDir, json: true });
    expect(r.ordered).toEqual([...ROUTE_ORDER]);
    expect(r.completed).toBe(true);
    expect(r.haltedAt).toBeUndefined();
    // Every step ok and strictly increasing order.
    r.steps.forEach((s, i) => {
      expect(s.order).toBe(i + 1);
      expect(s.outcome).toBe("ok");
    });
  }, 30_000);

  it("is fail-closed — halts at audit on a PII-leaky surface", () => {
    const r = runRoute({ dir: leakyDir, json: true });
    expect(r.completed).toBe(false);
    expect(r.haltedAt).toBe("audit");
    // The earlier steps still ran in order before the halt.
    const names = r.steps.map((s) => s.step);
    expect(names.slice(0, 5)).toEqual(ROUTE_ORDER.slice(0, 5));
    expect(r.steps.find((s) => s.step === "audit")?.outcome).toBe("error");
  }, 30_000);
});
