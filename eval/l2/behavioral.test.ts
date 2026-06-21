/**
 * tally eval — L2 binary behavioral tasks (Hamel level 2).
 *
 * Each test runs the REAL `tally` CLI and asserts a BINARY pass/fail behavior the
 * scenario's Acceptance criterion demands (the refuse/block/produce gates), no
 * self-grading. Golden tasks: G1 (THE acceptance test — track-plan+flag+capture),
 * G2 (BTS-1 naming-drift CI fails), G5 (BTS-4 peeked winner REFUSED — the
 * differentiator), G8 (BTS-8 migration idempotency key), G10 (BTS-13 named
 * registered event, not a CSS selector), G11 (BTS-8 paused-migration dedup),
 * G15 (BTS-17 segment-fishing → multiple-comparison correction kills the
 * 1-of-20), G17 (BTS-16 CUPED off for one-shot).
 *
 * Several of these run the E2 assert scripts (the same binary gates the
 * acceptance CI uses) so the eval pyramid and the merge gate share one source.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { tally, runNode, ensureSelfLink, SAMPLE_APP, FIXTURES, REPO_ROOT } from "../harness.js";

beforeAll(() => ensureSelfLink());

const assert = (name: string) => join(REPO_ROOT, "eval", name);

// G1 — THE acceptance test (EXPERTISE J1/J4, BTS-1/12). The full triad runs and
// each leg's binary gate (the E2 assert) passes.
describe("G1 — THE acceptance test: track-plan + flag + capture (L2 behavior)", () => {
  it("track-plan emits a registry + a CI check that fails on a planted variant", () => {
    const r = runNode([assert("assert-ci-check-fails-on-variant.mjs")]);
    expect(r.code).toBe(0);
  });
  it("wire-flag is never bare-local-eval (db/pinned/static + blast-radius)", () => {
    const w = tally(["wire-flag", "new_checkout", "--provider", "flagd", "--target", "distinct_id", "--db-eval"]);
    const r = runNode([assert("assert-not-bare-local-eval.mjs")], JSON.stringify(w.json));
    expect(r.code).toBe(0);
  });
  it("capture-event lands a typed, PII-masked event read back from the sink", () => {
    const sink = join(mkdtempSync(join(tmpdir(), "tally-g1-")), "events.jsonl");
    const c = tally(["capture-event", "checkout_started", "--props", JSON.stringify({ plan: "pro", email: "a@b.com" }), "--sink", "local", "--out", sink]);
    expect(c.code).toBe(0);
    const r = runNode([assert("assert-event-captured-pii-masked.mjs"), sink]);
    expect(r.code).toBe(0);
  });
});

// G2 — BTS-1 / O1/O2: naming drift fragments a metric. The CI check FAILS on a
// case-variant (the failing-check artifact, not a discussion).
describe("G2 — BTS-1: naming-drift CI check fails the build (L2 behavior)", () => {
  it("the generated CI check exits non-zero on a planted 'Checkout Started' variant", () => {
    const r = runNode([assert("assert-ci-check-fails-on-variant.mjs")]);
    expect(r.code).toBe(0); // the assert PASSES iff the CI check FAILED on the variant
    expect(r.out).toMatch(/case-variant/i);
  });
});

// G5 — BTS-4 / O6 / P13 (the differentiator): refuse to ship a peeked winner.
describe("G5 — BTS-4: peeked winner is REFUSED (L2 behavior, the differentiator)", () => {
  it("a fixed-horizon test peeked before N → refuse + recommend Bayesian/sequential", () => {
    const r = tally(["check-experiment", join(FIXTURES, "peeked-test.json")]);
    expect(r.code).toBe(3);
    expect(r.json.refused).toBe(true);
    expect(String(r.json.reason)).toMatch(/bayesian|sequential|wait for n|pre-registered n/i);
  });
  it("the assert script (same gate the acceptance CI uses) passes on the refusal", () => {
    const r = tally(["check-experiment", join(FIXTURES, "peeked-test.json")]);
    const a = runNode([assert("assert-refuses-peeked-winner.mjs")], JSON.stringify(r.json));
    expect(a.code).toBe(0);
  });
});

// G8 + G11 — BTS-8 / P19/P22: a paused migration silently doubles data. The plan
// carries an event-id idempotency/dedup key + a flush for >10k.
describe("G8/G11 — BTS-8: migration carries an idempotency/dedup key (L2 behavior)", () => {
  it("migrate-plan amplitude→posthog includes an event-id idempotency key + flush", () => {
    const r = tally(["migrate-plan", "--from", "amplitude", "--to", "posthog"]);
    expect(r.code).toBe(0);
    expect(String(r.json.idempotencyKey)).toMatch(/event-id|dedup/i);
    expect(String(r.json.flush)).toMatch(/flush/i);
    const causes = r.json.deltaCauses as string[];
    expect(causes.length).toBeGreaterThan(0);
    expect(causes.join(" ")).toMatch(/bot|session_start/i);
  });
});

// G10 — BTS-13 / O12: autocapture funnel casualty → tally's output uses NAMED,
// registered events (never a CSS selector). track-plan registers the named event.
describe("G10 — BTS-13: funnel references a named registered event (L2 behavior)", () => {
  it("track-plan registers signup-flow events as named registered events (registered:true)", () => {
    const r = tally(["track-plan", SAMPLE_APP, "--app", "g10", "--out", join(REPO_ROOT, "eval", ".plan-acc")]);
    expect(r.code).toBe(0);
    const events = r.json.events as Array<{ name: string; registered: boolean }>;
    expect(events.length).toBeGreaterThan(0);
    // every emitted event is a snake_case NAMED event, not a CSS selector.
    for (const ev of events) {
      expect(ev.registered).toBe(true);
      expect(ev.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(ev.name).not.toMatch(/[.#]/); // no CSS selector chars
    }
  });
});

// G15 — BTS-17 / O5: segment-fishing manufactures a fake winner. A 1-of-20
// raw-significant readout does NOT survive multiple-comparison correction.
describe("G15 — BTS-17: multiple-comparison correction kills the 1-of-20 (L2 behavior)", () => {
  it("20 segments with one raw p<0.05 → 0 survive Benjamini-Hochberg correction", () => {
    const r = tally(["check-experiment", join(FIXTURES, "segment-fishing.json")]);
    expect(r.code).toBe(0);
    const correction = r.json.correction as { rawSignificant: number; survivors: number };
    expect(correction.rawSignificant).toBe(1);
    expect(correction.survivors).toBe(0);
    const warnings = r.json.warnings as string[];
    expect(warnings.join(" ")).toMatch(/multiple-comparison|survive/i);
  });
});

// G17 — BTS-16 / P15: CUPED on a one-shot/e-commerce product backfires.
describe("G17 — BTS-16: CUPED is flagged OFF for one-shot products (L2 behavior)", () => {
  it("CUPED enabled on a one-shot product → a warning to leave CUPED off", () => {
    const r = tally(["check-experiment", join(FIXTURES, "cuped-one-shot.json")]);
    expect(r.code).toBe(0);
    const warnings = r.json.warnings as string[];
    expect(warnings.join(" ")).toMatch(/CUPED/i);
  });
});
