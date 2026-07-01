import { defineConfig } from "vitest/config";

// Vitest scope (G2). Before the cockpit landed there was no config — Vitest's default glob collected
// the unit/integration suite in tests/*.test.ts AND the eval pyramid in eval/l{1,2,3}/*.test.ts (52
// tests, what `pnpm test` and `tally eval` both run). The cockpit's Playwright specs live in
// tests/e2e/*.spec.ts and import `@playwright/test`, which CANNOT run under Vitest — so they must be
// excluded here (Playwright owns them via `pnpm test:e2e` / playwright.config.ts). The include keeps
// BOTH tests/ and eval/ so `vitest run` and `vitest run eval/lN` (the `tally eval` runner) are
// unchanged; only tests/e2e/ is carved out. Surgical: this is the minimum config that fixes the
// double-ownership collect without altering the pre-existing 52-test collection.
export default defineConfig({
  test: {
    include: ["tests/**/*.{test,spec}.ts", "eval/**/*.{test,spec}.ts"],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**", "eval/fixtures/**"],
    environment: "node",
    // Deterministic timeouts. The eval-pyramid golden tasks (eval/l{1,2,3}) drive the REAL tally CLI
    // via spawnSync (eval/harness.ts) — a single G1 task can spawn the binary several times (track-plan,
    // the generated CI check as a subprocess, then a planted-variant re-run). With 7 test files running
    // concurrently under CPU contention, those cold spawns intermittently blew past Vitest's default
    // 5000ms testTimeout → flaky "Test timed out in 5000ms" on G1/G4/G13 (never an assertion failure).
    // Raising the cap removes the flake without touching any test logic or the $0/no-creds layer.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
