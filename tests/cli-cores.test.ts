/**
 * tally — unit tests for the B-CLI command cores (the risky pure logic).
 *
 * Covers the detectors the acceptance test and the golden tasks depend on:
 * registry case-variant/type-mutation validation (BTS-1), SRM chi-squared
 * (BTS-5), the peeking guard asymmetry (BTS-4), PII mask-at-edge (BTS-2/P8), the
 * two-call identify $set_once routing (BTS-3/O3), the OpenFeature eval-path
 * classifier (BTS-12/P1), and the multiple-comparison correction (BTS-17). These
 * are unit tests of MY command cores; the full golden-task pyramid (G1–G17) is
 * the Evals cluster's `eval/` deliverable. test-before-signal: this is green
 * before B-CLI flips to ✅.
 */

import { describe, it, expect } from "vitest";
import { validateEvents, canonicalize, type Registry } from "../src/registry/registry.js";
import { srmCheck } from "../src/stats/srm.js";
import { peekingGuard } from "../src/stats/peeking-guard.js";
import { maskProps, scrubUrl, isPiiKey } from "../src/capture/pii-mask.js";
import { buildIdentify } from "../src/identity/identify.js";
import { classifyEvalPath } from "../src/flags/openfeature-adapter.js";
import { benjaminiHochberg } from "../src/stats/multiple-comparison.js";

const REG: Registry = {
  version: 1,
  casing: "snake_case",
  events: [
    { name: "checkout_started", props: [{ name: "amount", type: "number" }], registered: true },
    { name: "signup_completed", props: [], registered: true },
  ],
};

describe("registry — BTS-1 case-variant + type-mutation (the CI gate engine)", () => {
  it("passes on registered events", () => {
    expect(validateEvents(REG, [{ name: "checkout_started" }])).toHaveLength(0);
  });
  it("FAILS on a case-variant (Checkout Started ≠ checkout_started)", () => {
    const v = validateEvents(REG, [{ name: "Checkout Started" }]);
    expect(v.some((x) => x.kind === "case-variant")).toBe(true);
  });
  it("FAILS on an unregistered event", () => {
    expect(validateEvents(REG, [{ name: "random_event" }]).some((x) => x.kind === "unregistered")).toBe(true);
  });
  it("FAILS on a type-mutation (amount as string)", () => {
    const v = validateEvents(REG, [{ name: "checkout_started", props: { amount: "forty-nine" } }]);
    expect(v.some((x) => x.kind === "type-mutation")).toBe(true);
  });
  it("canonicalizes camelCase / spaces / dashes to one key", () => {
    expect(canonicalize("Song Played")).toBe("song_played");
    expect(canonicalize("songPlayed")).toBe("song_played");
    expect(canonicalize("song-played")).toBe("song_played");
  });
});

describe("SRM — BTS-5 chi-squared (block on real mismatch, pass on noise)", () => {
  it("blocks a 52/48 split at N=400k", () => {
    const r = srmCheck([208000, 192000], [0.5, 0.5]);
    expect(r.pass).toBe(false);
    expect(r.chiSquared).toBeGreaterThan(100);
  });
  it("passes a 50.1/49.9 split (random noise)", () => {
    const r = srmCheck([50100, 49900], [0.5, 0.5]);
    expect(r.pass).toBe(true);
  });
  it("passes an exact 50/50 split", () => {
    expect(srmCheck([1000, 1000], [1, 1]).pass).toBe(true);
  });
});

describe("peeking guard — BTS-4 asymmetry (refuse winner early, allow loser/Bayesian)", () => {
  it("REFUSES a winner on a fixed-horizon test before N", () => {
    const r = peekingGuard({ method: "frequentist-fixed-horizon", declaringWinner: true, currentN: 1200, preRegisteredN: 40000 });
    expect(r.winnerAllowed).toBe(false);
    expect(r.safe).toBe(false);
  });
  it("ALLOWS a winner once the pre-registered N is reached", () => {
    const r = peekingGuard({ method: "frequentist-fixed-horizon", declaringWinner: true, currentN: 40000, preRegisteredN: 40000 });
    expect(r.winnerAllowed).toBe(true);
  });
  it("ALLOWS looking under Bayesian (no peeking penalty)", () => {
    expect(peekingGuard({ method: "bayesian", declaringWinner: true, currentN: 100 }).winnerAllowed).toBe(true);
  });
  it("ALLOWS stopping a loser early (the asymmetry)", () => {
    const r = peekingGuard({ method: "frequentist-fixed-horizon", declaringWinner: false, currentN: 100, direction: "loser" });
    expect(r.loserStopAllowed).toBe(true);
  });
});

describe("PII mask — BTS-2/P8 mask-at-edge before storage", () => {
  it("masks an email prop, keeps a non-PII prop", () => {
    const { masked, droppedKeys } = maskProps({ email: "a@b.com", plan: "pro" });
    expect(masked.email).toBe("***");
    expect(masked.plan).toBe("pro");
    expect(droppedKeys).toContain("email");
  });
  it("honors an explicit allowlist", () => {
    const { masked } = maskProps({ email: "a@b.com" }, new Set(["email"]));
    expect(masked.email).toBe("a@b.com");
  });
  it("scrubs URL query strings (before_send)", () => {
    expect(scrubUrl("https://app.x.com/checkout?email=a@b.com&token=xyz")).toBe("https://app.x.com/checkout");
  });
  it("flags PII keys", () => {
    expect(isPiiKey("phone")).toBe(true);
    expect(isPiiKey("plan")).toBe(false);
  });
});

describe("identify — BTS-3/O3 two-call $set_once routing", () => {
  it("routes acquisition props to $set_once, mutable to $set", () => {
    const p = buildIdentify("u1", { referral_source: "google", plan: "pro" });
    expect(p.$set_once).toHaveProperty("referral_source");
    expect(p.$set).toHaveProperty("plan");
    expect(p.$set).not.toHaveProperty("referral_source");
  });
});

describe("eval-path classifier — BTS-12/P1 (refuse bare local-eval)", () => {
  it("flags a bare-local-eval person-property target", () => {
    expect(classifyEvalPath({ target: "distinct_id" })).toBe("bare-local-eval");
  });
  it("accepts DB-eval", () => {
    expect(classifyEvalPath({ target: "distinct_id", dbEval: true })).toBe("db");
  });
  it("accepts pinned-props", () => {
    expect(classifyEvalPath({ target: "user_42", pinnedProps: { plan: "pro" } })).toBe("pinned-props");
  });
  it("treats a non-person target as static", () => {
    expect(classifyEvalPath({ target: "environment" })).toBe("static");
  });
});

describe("multiple-comparison — BTS-17 (segment-fishing correction)", () => {
  it("kills a 1-of-20 fake winner after correction", () => {
    const segments = Array.from({ length: 20 }, (_, i) => ({ segment: `s${i}`, pValue: i === 0 ? 0.04 : 0.6 }));
    const r = benjaminiHochberg(segments);
    expect(r.rawSignificant).toBe(1);
    expect(r.survivors).toBe(0);
  });
});
