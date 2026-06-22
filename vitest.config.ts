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
  },
});
