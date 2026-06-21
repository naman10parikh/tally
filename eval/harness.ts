/**
 * tally eval harness — run the real `tally` CLI and capture its output for the
 * golden-task pyramid (G1–G17 ← BTS-1–BTS-17).
 *
 * The grading rule (dsip `noSelfGrading:true`, from BATTLE-TESTED-SCENARIOS.md):
 * "an eval passes only if tally's output produces that criterion — not if it
 * merely discusses the topic." So every golden task runs the ACTUAL binary
 * (via bin/tally.js) and asserts the JSON it emits, never a mock.
 *
 * No `any`, named exports only.
 */

import { spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, existsSync, symlinkSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url)); // .../eval
export const REPO_ROOT = resolve(here, "..");
export const TALLY_BIN = join(REPO_ROOT, "bin", "tally.js");
export const SAMPLE_APP = join(here, "fixtures", "sample-app");
export const FIXTURES = join(here, "fixtures");

/** The result of one `tally` CLI invocation. */
export interface CliResult {
  /** Exit code (0 = ok, 3 = refusal, 1 = error). */
  code: number;
  /** Parsed JSON from stdout (commands here always run with --json). */
  json: Record<string, unknown>;
  /** Raw stdout (for the rare non-JSON assertion). */
  stdout: string;
  /** Raw stderr. */
  stderr: string;
}

/**
 * The generated CI check imports `tally/dist/...`; dogfooding, ensure a
 * `node_modules/tally → repoRoot` self-link so it resolves (in a consuming app
 * tally is an installed dep). Idempotent + harmless.
 */
export function ensureSelfLink(): void {
  const link = join(REPO_ROOT, "node_modules", "tally");
  if (existsSync(link)) return;
  try {
    mkdirSync(join(REPO_ROOT, "node_modules"), { recursive: true });
    symlinkSync("..", link, "dir");
  } catch {
    // best-effort; the few tasks that need it will surface the failure clearly
  }
}

/** Run `tally <args...> --json` and parse the result. Always adds --json. */
export function tally(args: string[]): CliResult {
  const finalArgs = args.includes("--json") ? args : [...args, "--json"];
  const res = spawnSync(process.execPath, [TALLY_BIN, ...finalArgs], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const stdout = res.stdout ?? "";
  let json: Record<string, unknown> = {};
  // The CLI prints exactly one JSON document on stdout with --json. Parse the
  // first balanced JSON object (tolerant of any trailing newline).
  try {
    json = JSON.parse(stdout.trim()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { code: res.status ?? 1, json, stdout, stderr: res.stderr ?? "" };
}

/** Run an arbitrary node script (an assert .mjs) and return its exit code. */
export function runNode(scriptArgs: string[], stdin?: string): { code: number; out: string } {
  const res = spawnSync(process.execPath, scriptArgs, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    input: stdin,
  });
  return { code: res.status ?? 1, out: `${res.stdout ?? ""}\n${res.stderr ?? ""}` };
}
