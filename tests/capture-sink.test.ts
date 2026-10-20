/**
 * tally — capture-event sinks. The PostHog sink is not built yet, so `--sink posthog` must say so
 * and exit non-zero, never report the event as captured. The local sink is unchanged.
 */

import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tally } from "../eval/harness.js";

describe("capture-event sinks", () => {
  it("--sink posthog says the sink is not built, exits 1, and stores nothing", () => {
    const out = join(mkdtempSync(join(tmpdir(), "tally-posthog-")), "events.jsonl");
    const r = tally(["capture-event", "checkout_started", "--sink", "posthog", "--out", out]);
    expect(r.code).toBe(1);
    expect(String(r.json.error)).toMatch(/PostHog sink is not built yet/);
    expect(r.json.captured).toBeUndefined();
    expect(existsSync(out)).toBe(false);
  });

  it("--sink local still captures and reads the event back", () => {
    const out = join(mkdtempSync(join(tmpdir(), "tally-local-")), "events.jsonl");
    const r = tally(["capture-event", "checkout_started", "--sink", "local", "--out", out]);
    expect(r.code).toBe(0);
    expect(r.json.captured).toBe(true);
    expect(existsSync(out)).toBe(true);
  });
});
