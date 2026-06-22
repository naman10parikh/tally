/**
 * tests/e2e/cockpit.spec.ts — tally cockpit E2E (G2, PLAN §9 E2E row + §10 design law).
 *
 * Drives the read-only cockpit (web/server.mjs) through all [removed] views and asserts each renders REAL
 * data, then writes a chairman-facing screenshot per view under content/screenshots/. Red-blocking:
 * the cockpit views must render. (PLAN §9 verify: brain-browser returns a query, run-log shows the
 * last `tally` run, the experiment-decisions view renders an SRM/peeking verdict, the flag-health
 * view lists zombies, ask-the-employee returns a scenario by ID. Plus the §10 warm-black design law:
 * #141312, no AI-purple, read-mostly Q7.)
 */

import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SHOTS = join(process.cwd(), "content", "screenshots");
test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

const shot = (name: string) => join(SHOTS, name);

test.describe("tally cockpit (read-mostly, warm-black)", () => {
  test("masthead + brain browser default view loads with warm-black design (no AI-purple)", async ({ page }) => {
    await page.goto("/");
    // Masthead + the agentmoney boundary pill (the three-plane boundary).
    await expect(page.locator(".brand .logo")).toHaveText("tally");
    await expect(page.locator(".boundary")).toContainText("token cost");
    // Design law: warm-black #141312 is the actual page background (not pure black, not AI-purple).
    const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    expect(bg).toBe("rgb(20, 19, 18)"); // #141312
    // The accent token is amber, NOT purple/indigo.
    const amber = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--amber").trim(),
    );
    expect(amber.toLowerCase()).toBe("#f5a623");
    // The six brain artifacts are listed.
    await expect(page.locator("#artifact-list button")).toHaveCount(6);
    await page.screenshot({ path: shot("01-brain-default.png"), fullPage: true });
  });

  test("brain browser returns a query → BTS-4 (peeking) top, click reads the scenario", async ({ page }) => {
    await page.goto("/");
    test.setTimeout(180_000); // the BM25 search dominates this test — give it a wide budget
    await page.fill("#brain-q", "peeking winner noise");
    await page.click("#brain-go");
    const hits = page.locator("#brain-hits .hit");
    await expect(hits.first()).toBeVisible({ timeout: 130_000 });
    // The top hit is BTS-4 (the differentiator scenario — the peeked-winner-shipped-as-noise class).
    await expect(hits.first().locator(".id")).toHaveText("BTS-4");
    await page.screenshot({ path: shot("02-brain-search.png"), fullPage: true });
    // Click the BTS-4 hit → the reader renders the scenario body (situation→trap→resolution→acceptance).
    await hits.first().click();
    await expect(page.locator("#brain-reader")).toContainText("BTS-4", { timeout: 20_000 });
    await expect(page.locator("#brain-reader")).toContainText("peeking");
    await page.screenshot({ path: shot("03-brain-read-BTS4.png"), fullPage: true });
  });

  test("run log shows a recent `tally` run (model + measured duration + trace.id)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Run log" }).click();
    const rows = page.locator("#runs-wrap table tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    // A recent run is on the model D14 pins, with a measured duration + a trace.id.
    await expect(rows.first()).toContainText("claude-opus-4-8[1m]");
    await expect(rows.first()).toContainText("ms"); // measured duration column
    // trace.id column is non-empty (truncated hex + ellipsis).
    const trace = await rows.first().locator("td").nth(4).innerText();
    expect(trace.replace("…", "").trim().length).toBeGreaterThan(6);
    await page.screenshot({ path: shot("04-runs.png"), fullPage: true });
  });

  test("tracking plan renders the typed registry + the CI gate (the taxonomy is code, not docs)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Tracking plan" }).click();
    const table = page.locator("#plan-wrap table tbody tr");
    await expect(table.first()).toBeVisible({ timeout: 30_000 });
    // The CI gate that fails the build on a case-variant is present (O1 — the differentiator vs a wiki).
    await expect(page.locator("#plan-wrap")).toContainText("CI gate present");
    // The registry carries the real sample-app events, typed + snake_cased.
    await expect(page.locator("#plan-wrap")).toContainText("checkout_started");
    await expect(page.locator("#plan-wrap")).toContainText("snake_case");
    // At least one event is "registered ✅".
    await expect(page.locator("#plan-wrap .badge.ok").first()).toBeVisible();
    await page.screenshot({ path: shot("05-tracking-plan.png"), fullPage: true });
  });

  test("experiment decisions renders the SRM/peeking verdicts — refuses the SRM-fail + the peeked winner (the differentiator)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Experiment decisions" }).click();
    const cards = page.locator(".exp-card");
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    // The SRM-fail fixture is REFUSED with the chi-squared shown (the SRM verdict rendered).
    const refused = page.locator(".exp-card.refused");
    await expect(refused.first()).toBeVisible();
    await expect(page.locator("#exp-wrap")).toContainText("χ²=640");
    await expect(page.locator("#exp-wrap")).toContainText("SRM fail");
    // The peeked-winner fixture is also refused (winner refused).
    await expect(page.locator("#exp-wrap")).toContainText("winner refused");
    // At least one non-refused (valid / valid-with-warnings) verdict renders too (the valid Bayesian
    // fixture, plus the segment-fishing + CUPED fixtures that pass SRM but carry warnings).
    await expect(page.locator(".exp-card.valid").first()).toBeVisible();
    await expect(page.locator("#exp-wrap")).toContainText("VALID");
    await page.screenshot({ path: shot("06-experiment-decisions.png"), fullPage: true });
  });

  test("flag health surfaces a zombie flag in red + a tombstoned key (J6 sweep)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Flag health" }).click();
    const zombie = page.locator(".flag-row.zombie");
    await expect(zombie.first()).toBeVisible({ timeout: 30_000 });
    // The zombie flag (no-expiry temporary) is surfaced with its key + reason.
    await expect(zombie.first()).toContainText("new_dashboard");
    await expect(page.locator(".flag-reason")).toContainText("no expiry");
    // The tombstoned key (never-reuse — Knight Capital) is listed.
    await expect(page.locator(".tombstone-list")).toContainText("power_peg");
    await page.screenshot({ path: shot("07-flag-health.png"), fullPage: true });
  });

  test("ask-the-employee returns a scenario by ID (BTS-4) + surfaces the three-plane boundary", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Ask the employee" }).click();
    await page.fill("#ask-q", "BTS-4");
    await page.click("#ask-go");
    const answer = page.locator("#ask-answer");
    await expect(answer).toContainText("BTS-4", { timeout: 20_000 });
    await expect(answer).toContainText("peeking");
    // The boundary: token cost is agentmoney's, not tally's (the cardinal refusal O18).
    await expect(answer.locator(".boundary-note")).toContainText("agentmoney");
    await expect(answer.locator(".boundary-note")).toContainText("gen_ai.usage");
    await page.screenshot({ path: shot("08-ask-BTS4.png"), fullPage: true });
  });

  test("read-mostly: a POST to a data endpoint is rejected (no mutate-from-browser, Q7)", async ({ request }) => {
    const res = await request.post("/api/brain");
    expect(res.status()).toBe(405);
  });
});
