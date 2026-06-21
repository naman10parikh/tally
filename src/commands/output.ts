/**
 * tally — shared CLI output helper. Every data command supports `--json` (the
 * agent contract, J8/O13: deterministic, parseable, non-interactive); the human
 * form uses chalk. One place so the JSON contract is uniform across commands.
 *
 * No `any`, named exports only.
 */

import chalk from "chalk";

/** Emit a result either as raw JSON (--json) or a human line, on stdout. */
export function emit(json: boolean, data: unknown, humanLine: string): void {
  if (json) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  } else {
    process.stdout.write(humanLine + "\n");
  }
}

/** A refusal — tally is an enforcer, not a linter (O20). Non-zero exit. */
export function refuse(json: boolean, reason: string, detail: unknown = {}): never {
  if (json) {
    process.stdout.write(JSON.stringify({ refused: true, reason, ...asObject(detail) }, null, 2) + "\n");
  } else {
    process.stderr.write(chalk.red(`REFUSED: ${reason}\n`));
  }
  process.exit(3);
}

/** A typed error (bad input), distinct from a refusal. Non-zero exit. */
export function fail(json: boolean, message: string, code = 1): never {
  if (json) {
    process.stdout.write(JSON.stringify({ error: message }, null, 2) + "\n");
  } else {
    process.stderr.write(chalk.red(`error: ${message}\n`));
  }
  process.exit(code);
}

function asObject(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Parse a `--props '{"k":"v"}'` JSON string, failing cleanly on bad JSON. */
export function parsePropsArg(json: boolean, raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      fail(json, "--props must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    return fail(json, "--props is not valid JSON");
  }
}
