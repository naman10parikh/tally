/**
 * tally eval — L3 trajectory tasks (Hamel level 3), graded on PROCESS, NON-blocking.
 *
 * These are the plan-graded scenarios (a migration is a plan, not a single
 * refusal): G12 (BTS-7 migration count-reconciliation explains the delta by NAMED
 * causes), G13 (BTS-9 GA4 cutover states session→event is irreversible — no
 * native-import claim), G14 (BTS-14 CDP cost modeled on the DESTINATION's pricing
 * axis + dual-write cutover). They assert the plan's reasoning is present, not a
 * binary pass/fail outcome — so they are NON-blocking per the CI-blocking set
 * (G1/G2/G3/G4/G5/G6/G7/G8/G9/G10/G15/G16). Run by `tally eval --level 3`.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { tally, ensureSelfLink } from "../harness.js";

beforeAll(() => ensureSelfLink());

// G12 — BTS-7 / O16 / P20/P21: "lost 15% of events" — the plan EXPLAINS the delta
// by named causes (bot filter, dropped session_start) + lists non-transferring
// derived assets, rather than chasing parity.
describe("G12 — BTS-7: migration reconciliation explains the delta (L3 trajectory)", () => {
  it("amplitude→posthog plan attributes the count delta to NAMED causes + flags derived assets", () => {
    const r = tally(["migrate-plan", "--from", "amplitude", "--to", "posthog"]);
    expect(r.code).toBe(0);
    const causes = (r.json.deltaCauses as string[]).join(" ");
    expect(causes).toMatch(/bot/i); // bot-filter delta
    expect(causes).toMatch(/session_start/i); // dropped event type
    expect(String(r.json.reconcile)).toMatch(/reconcile|delta|named/i);
    expect(String(r.json.derivedAssetsWarning)).toMatch(/cohort|dashboard|do NOT transfer|rebuild/i);
  });
});

// G13 — BTS-9 / O14: GA4 cutover. The plan STATES the session→event shift is
// irreversible at the data layer (no native UA→GA4 historical import claim) and
// is warehouse-first.
describe("G13 — BTS-9: GA4 cutover states the irreversible session→event shift (L3 trajectory)", () => {
  it("ua→ga4 plan states irreversibility at the data layer (not a native import)", () => {
    const r = tally(["migrate-plan", "--from", "ua", "--to", "ga4"]);
    expect(r.code).toBe(0);
    expect(String(r.json.irreversibility)).toMatch(/irreversible|session.*event|warehouse/i);
    // it must NOT claim a clean native historical import is possible.
    expect(String(r.json.irreversibility)).not.toMatch(/native import works|history transfers cleanly/i);
  });
});

// G14 — BTS-14 / O16: CDP migration cost. The plan models the bill on the
// DESTINATION's pricing axis (not "they're cheaper") + a dual-write cutover.
describe("G14 — BTS-14: CDP cost modeled on the destination's pricing axis (L3 trajectory)", () => {
  it("segment→rudderstack plan models cost on the destination axis + dual-writes", () => {
    const r = tally(["migrate-plan", "--from", "segment", "--to", "rudderstack"]);
    expect(r.code).toBe(0);
    expect(String(r.json.costModel)).toMatch(/pricing axis|event.*volume|MTU|destination/i);
    expect(String(r.json.dualWrite)).toMatch(/dual|both|concurrently|reconcile/i);
  });
});
