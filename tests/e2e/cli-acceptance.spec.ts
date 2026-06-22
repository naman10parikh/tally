/**
 * tests/e2e/cli-acceptance.spec.ts — the full tally CLI acceptance flow, E2E (G2, PLAN §9 CLI-E2E row).
 *
 * The acceptance bar (CLAUDE.md / PLAN §5): `tally track-plan <product>` emits a typed event taxonomy
 * + a CI gate → `tally wire-flag` wires a flag via OpenFeature (DB-eval/pinned-props, never bare
 * local-eval) → `tally capture-event` captures a sample event verifiably (PII masked at the edge).
 * This drives that exact 3-leg chain through the BUILT CLI (the same binary the cockpit + acceptance.yml
 * use), from a clean output dir, $0, no provider creds (local capture sink + flagd file-backed flag).
 * Plus the differentiator: `tally check-experiment` REFUSES a peeked winner + blocks an SRM-fail.
 *
 * Red-blocking: the acceptance CLI flow must complete. This is the Playwright peer of the
 * acceptance.yml merge gate (E5) — it proves the chairman-facing E2E, not just CI.
 */

import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = process.cwd();
const CLI = join(REPO, "dist", "cli", "index.js");
const SAMPLE = join(REPO, "eval", "fixtures", "sample-app");

/** Run a node CLI invocation, returning { code, stdout, stderr }. The CLI emits pretty JSON. */
function cli(args: string[], opts: { cwd?: string } = {}) {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    cwd: opts.cwd ?? REPO,
    encoding: "utf8",
    timeout: 60_000,
  });
  return { code: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

/** Parse the (pretty-printed, single-document) JSON from a CLI run's stdout. */
function parse(stdout: string): Record<string, unknown> {
  const out = stdout.trim();
  try {
    return JSON.parse(out);
  } catch {
    const first = out.indexOf("{");
    const last = out.lastIndexOf("}");
    return JSON.parse(out.slice(first, last + 1));
  }
}

test.describe("tally CLI acceptance flow (the PLAN §5 bar, from a clean dir)", () => {
  test.skip(!existsSync(SAMPLE), "sample-app fixture (E2) not present");

  test("leg 1 — track-plan emits a typed registry + a CI check that fails on a case-variant", async () => {
    const out = mkdtempSync(join(tmpdir(), "tally-acc-plan-"));
    try {
      const r = cli(["track-plan", SAMPLE, "--app", "demo", "--out", out, "--json"]);
      expect(r.code, r.stderr).toBe(0);
      const j = parse(r.stdout);
      // A real registry file + a CI-check artifact + typed accessors were written.
      expect(typeof j.registryPath).toBe("string");
      expect(existsSync(j.registryPath as string), "registry file written").toBeTruthy();
      expect(existsSync(j.ciCheckPath as string), "CI-check artifact written").toBeTruthy();
      expect(existsSync(j.typedAccessors as string), "typed accessors written").toBeTruthy();
      // The registry carries the sample-app's typed, snake_cased events.
      const reg = JSON.parse(readFileSync(j.registryPath as string, "utf8"));
      expect(reg.casing).toBe("snake_case");
      const names = reg.events.map((e: { name: string }) => e.name);
      expect(names).toContain("checkout_started");
    } finally {
      rmSync(out, { force: true, recursive: true });
    }
  });

  test("leg 2 — wire-flag produces a DB-eval/pinned-props flag via OpenFeature (NEVER bare local-eval)", async () => {
    // A bare-local-eval target is REFUSED (rc=3) — the enforcer differentiator (BTS-12/P1).
    const refused = cli(["wire-flag", "new_checkout", "--provider", "flagd", "--target", "distinct_id", "--json"]);
    expect(refused.code, "bare-local-eval refused with rc=3").toBe(3);
    const rj = parse(refused.stdout);
    expect(rj.refused).toBe(true);

    // The DB-eval path is accepted (rc=0) and reports a non-bare eval path + a blast-radius value.
    const ok = cli(["wire-flag", "new_checkout", "--provider", "flagd", "--target", "distinct_id", "--db-eval", "--json"]);
    expect(ok.code, ok.stderr).toBe(0);
    const oj = parse(ok.stdout);
    expect(oj.evalPath).toBe("db");
    expect(oj.evalPath).not.toBe("bare-local-eval");
  });

  test("leg 3 — capture-event lands a typed, PII-masked event in the local sink (verifiably)", async () => {
    const out = mkdtempSync(join(tmpdir(), "tally-acc-cap-"));
    const sink = join(out, "events.jsonl");
    try {
      const r = cli([
        "capture-event",
        "checkout_started",
        "--props",
        '{"plan":"pro","email":"a@b.com","referral_source":"google","amount":49}',
        "--sink",
        "local",
        "--out",
        sink,
        "--json",
      ]);
      expect(r.code, r.stderr).toBe(0);
      const j = parse(r.stdout);
      expect(j.captured).toBe(true);
      expect(j.piiMasked).toBe(true);
      // Read the sink back — the email is masked at the edge BEFORE storage (the one-way-door guard).
      const stored = readFileSync(sink, "utf8");
      expect(stored, "raw email must NOT be present in the sink").not.toContain("a@b.com");
      expect(stored, "email masked to ***").toContain('"email":"***"');
    } finally {
      rmSync(out, { force: true, recursive: true });
    }
  });

  test("differentiator — check-experiment REFUSES a peeked winner + blocks an SRM-fail readout", async () => {
    const peeked = cli(["check-experiment", join(REPO, "eval", "fixtures", "peeked-test.json"), "--json"]);
    expect(peeked.code, "peeked winner refused rc=3").toBe(3);
    expect((parse(peeked.stdout) as { refused?: boolean }).refused).toBe(true);

    const srm = cli(["check-experiment", join(REPO, "eval", "fixtures", "srm-fail.json"), "--json"]);
    expect(srm.code, "SRM-fail blocked rc=3").toBe(3);
    const sj = parse(srm.stdout) as { refused?: boolean; srm?: { pass?: boolean } };
    expect(sj.refused).toBe(true);
    expect(sj.srm?.pass).toBe(false);
  });

  test("audit-pii finds zero critical PII surfaces on tally's own sample-app instrumentation", async () => {
    const r = cli(["audit-pii", SAMPLE, "--json"]);
    expect(r.code, r.stderr).toBe(0);
    const j = parse(r.stdout) as { critical?: number; clean?: boolean };
    expect(j.critical).toBe(0);
  });
});
