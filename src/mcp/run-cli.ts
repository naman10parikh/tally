/**
 * tally MCP — the CLI-wrapper bridge (Q6 default: stdio CLI-wrapper, NOT a
 * reimplementation). Every MCP tool shells out to the SAME `tally` binary an
 * agent would call by hand and parses its `--json` output, so the MCP surface
 * stays in perfect lockstep with the CLI (one source of truth for every
 * opinion/refusal — no duplicated logic that could drift, O2's dedup-ledger
 * principle applied to our own code).
 *
 * A refusal (exit 3, `{refused:true,…}`) or a typed error (exit 1, `{error:…}`)
 * is a MEANINGFUL result, not a transport failure — we return it to the caller
 * with the exit code so the fail-closed guardrails (O20) survive the MCP hop.
 *
 * No `any`, named exports only.
 */

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Resolve the repo's `bin/tally.js` from this module's location (dist or src). */
function resolveBin(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/mcp/run-cli.ts  → ../../bin/tally.js
  // dist/mcp/run-cli.js → ../../bin/tally.js
  return resolve(here, "..", "..", "bin", "tally.js");
}

/** The outcome of a wrapped CLI invocation. */
export interface CliResult {
  /** Process exit code: 0 ok · 1 typed error · 3 refusal (the enforcer signal). */
  exitCode: number;
  /** Parsed `--json` payload (the command's result object), or null if unparseable. */
  json: unknown;
  /** Raw stdout (kept for the rare non-JSON path / debugging). */
  raw: string;
  /** stderr, surfaced when the JSON parse fails so the caller sees the real error. */
  stderr: string;
}

/**
 * Run `tally <args> --json` and return the parsed result + exit code.
 * `--json` is appended unless the caller already passed it. We never throw on a
 * non-zero exit — a refusal IS the answer for an enforcer tool.
 */
export function runTallyCli(args: string[]): CliResult {
  const argv = args.includes("--json") ? args : [...args, "--json"];
  const res = spawnSync(process.execPath, [resolveBin(), ...argv], {
    encoding: "utf8",
    // No shell, args passed as an array → no shell-injection surface (a flag value
    // like `; rm -rf` is an inert argv element, never interpreted).
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  });

  const raw = res.stdout ?? "";
  const stderr = res.stderr ?? "";
  const exitCode = res.status ?? 1;

  let json: unknown = null;
  if (raw.trim().length > 0) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
  }

  return { exitCode, json, raw, stderr };
}
