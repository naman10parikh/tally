/**
 * tally eval — L1 structural-invariant assertions (Hamel level 1).
 *
 * Each test runs the REAL `tally` CLI and asserts the STRUCTURAL invariant the
 * scenario's Acceptance criterion demands — not that the topic is discussed
 * (dsip noSelfGrading:true). Golden tasks: G3 (BTS-2 PII mask), G4 (BTS-3
 * identity $set_once), G6 (BTS-5 SRM chi-squared), G7 (BTS-6 fresh-key + 3-step
 * deprecation), G9 (BTS-11 materialized endpoint), G16 (BTS-15 bounded retention
 * + conversion window). pass^k: these are deterministic, so stable across runs.
 *
 * No `any`, named exports only (the test file exports nothing — vitest collects).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { tally, ensureSelfLink, SAMPLE_APP, FIXTURES } from "../harness.js";

beforeAll(() => ensureSelfLink());

// G3 — BTS-2 / O4 / P8: replay leaks PII unless mask-all-then-allowlist. tally's
// own sample-app instrumentation MUST pass its own audit with zero critical, and
// the structural flags (maskAllInputs + maskTextSelector + all 3 platforms) hold.
describe("G3 — BTS-2: PII masking is mask-all-then-allowlist (L1 structural)", () => {
  it("audit-pii on tally's own instrumentation: maskAllInputs:true + maskTextSelector:true + web/iOS/RN + 0 critical", () => {
    const r = tally(["audit-pii", SAMPLE_APP]);
    expect(r.code).toBe(0);
    expect(r.json.maskAllInputs).toBe(true);
    expect(r.json.maskTextSelector).toBe(true);
    expect(r.json.beforeSendUrlScrub).toBe(true);
    const platforms = r.json.platforms as Record<string, boolean>;
    expect(platforms.web).toBe(true);
    expect(platforms.ios).toBe(true);
    expect(platforms.rn).toBe(true);
    expect(r.json.critical).toBe(0);
    expect(r.json.clean).toBe(true);
  });
});

// G4 — BTS-3 / O3 / P23: identity stitch. capture-event must route acquisition
// props ($set_once) distinctly from mutable state ($set) — the retroactive-loss
// class. A referral_source must land in $set_once, never $set.
describe("G4 — BTS-3: identity uses $set_once for acquisition (L1 structural)", () => {
  it("capture-event routes referral_source to $set_once (acquisition), not $set", () => {
    const sink = join(mkdtempSync(join(tmpdir(), "tally-g4-")), "events.jsonl");
    const r = tally([
      "capture-event",
      "signup_started",
      "--props",
      JSON.stringify({ plan: "free", referral_source: "google" }),
      "--sink",
      "local",
      "--out",
      sink,
    ]);
    expect(r.code).toBe(0);
    const identify = r.json.identify as { setOnceKeys: string[]; setKeys: string[] };
    expect(identify.setOnceKeys).toContain("referral_source");
    expect(identify.setKeys).not.toContain("referral_source");
  });
});

// G6 — BTS-5 / P14: SRM chi-squared. A 52/48 split at N=400k must FAIL the SRM
// check (chi-squared with a real p-value) and BLOCK the readout (refuse, rc=3).
describe("G6 — BTS-5: SRM chi-squared blocks a 52/48 readout (L1 structural)", () => {
  it("a 52/48 split at N=400k → SRM fires (chi² with p-value) and the readout is refused", () => {
    const r = tally(["check-experiment", join(FIXTURES, "srm-fail.json")]);
    expect(r.code).toBe(3); // refusal
    expect(r.json.refused).toBe(true);
    const srm = r.json.srm as { pass: boolean; chiSquared: number; pValue: number } | undefined;
    expect(srm).toBeTruthy();
    expect(srm?.pass).toBe(false);
    expect(srm?.chiSquared).toBeGreaterThan(10); // a real, large chi-squared
    expect(srm?.pValue).toBeLessThan(0.001);
  });
});

// G7 — BTS-6 / O11 / P27: never reuse a retired flag key; the deprecation is a
// 3-step (ramp → remove config → DELETE branch) + tombstone. Reusing a
// tombstoned key is REFUSED; a fresh key is suggested.
describe("G7 — BTS-6: fresh key + 3-step deprecation (L1 structural)", () => {
  it("reusing the tombstoned 'power_peg' is REFUSED with a fresh-key suggestion", () => {
    const r = tally(["flag-sweep", "--dir", join(FIXTURES, "flag-ledger"), "--reuse", "power_peg"]);
    expect(r.code).toBe(3);
    expect(r.json.refused).toBe(true);
    expect(r.json.tombstoned).toBe("power_peg");
    expect(String(r.json.freshKeySuggestion)).toMatch(/power_peg/);
  });
  it("the removal diff includes the explicit code-branch-deletion step (the 3rd step)", () => {
    const r = tally(["flag-sweep", "--dir", join(FIXTURES, "flag-ledger")]);
    expect(r.code).toBe(0);
    const diff = r.json.removalDiff as Array<{ key: string; steps: string[] }>;
    expect(diff.length).toBeGreaterThan(0);
    const steps = diff[0].steps.join(" ");
    expect(steps).toMatch(/DELETE the code branch/i);
    expect(steps).toMatch(/tombstone/i);
  });
});

// G9 — BTS-11 / O13 / P11: agent stalls on raw HogQL (120/hr). A recurring read
// must use a MATERIALIZED endpoint, never a per-loop execute-sql.
describe("G9 — BTS-11: recurring reads materialize, never loop raw HogQL (L1 structural)", () => {
  it("read --materialize emits a materialized-endpoint with rawHogqlLoop:false", () => {
    const r = tally(["read", "--query", "retention", "--materialize"]);
    expect(r.code).toBe(0);
    const endpoint = r.json.endpoint as { kind: string; rawHogqlLoop: boolean };
    expect(endpoint.kind).toBe("materialized-endpoint");
    expect(endpoint.rawHogqlLoop).toBe(false);
    expect(r.json.rawHogqlLoop).toBe(false);
  });
});

// G16 — BTS-15 / P17 / P18: unbounded retention drifts. tally reads use BOUNDED
// N-day retention + an explicit conversion window.
describe("G16 — BTS-15: bounded retention + explicit conversion window (L1 structural)", () => {
  it("read emits bounded retention (kind:bounded, numeric days) + a conversion window", () => {
    const r = tally(["read", "--query", "retention"]);
    expect(r.code).toBe(0);
    const retention = r.json.retention as { kind: string; days: number };
    expect(retention.kind).toBe("bounded");
    expect(typeof retention.days).toBe("number");
    expect(r.json.conversionWindow).toBeTruthy();
  });
});
