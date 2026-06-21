/**
 * tally wire-flag — THE acceptance test (leg 2). J4 · O7/O15 · BTS-12 · P1/P2.
 *
 * Create + wire a flag through OpenFeature (vendor behind a provider; flagd
 * file-backed is the $0 default). For `distinct_id`/prop targeting use DB-eval OR
 * pin the FULL property set — NEVER bare local-eval (the #1 PostHog footgun). Run
 * a blast-radius pre-check + a dry-run eval before any rollout, and REFUSE a
 * bare-local-eval target (tally is an enforcer, not a linter — O20).
 *
 * No `any`, named exports only. < 400 lines.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import chalk from "chalk";
import {
  classifyEvalPath,
  buildFlagdFlag,
  blastRadius,
  dryRunEval,
  type FlagdSource,
  type EvalPath,
} from "../flags/openfeature-adapter.js";
import { parsePropsArg, refuse, emit, fail } from "./output.js";
import { startRun } from "../observability/run-logger.js";

/** Options for `tally wire-flag`. */
export interface WireFlagOptions {
  provider: "posthog" | "flagd";
  target?: string;
  /** Pin the FULL property set for a person-property target (avoids local-eval footgun). */
  pinnedProps?: string;
  /** Use DB-backed eval (the other correct path). */
  dbEval?: boolean;
  /** flagd source file to write/update (default: flags/flags.json). */
  out?: string;
  /** Sample population for the blast-radius pre-check. */
  population?: string;
  json: boolean;
}

const FLAG_KEY = /^[a-z][a-z0-9_]*$/;

/** Load an existing flagd source, or start a fresh one. */
function loadFlagdSource(path: string): FlagdSource {
  if (existsSync(path)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (parsed && typeof parsed === "object" && "flags" in parsed) {
        return parsed as FlagdSource;
      }
    } catch {
      // fall through to fresh
    }
  }
  return { flags: {} };
}

function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, path);
}

/** Run `tally wire-flag <key>`. */
export async function runWireFlag(key: string, opts: WireFlagOptions): Promise<void> {
  const run = startRun("wire-flag");

  if (!FLAG_KEY.test(key)) {
    run.finish("error", "bad flag key");
    fail(opts.json, `flag key "${key}" must be lower snake_case starting with a letter`);
  }

  const pinnedProps = parsePropsArg(opts.json, opts.pinnedProps);
  const evalPath: EvalPath = classifyEvalPath({
    target: opts.target,
    dbEval: opts.dbEval,
    pinnedProps,
  });

  run.tool("classify-eval-path");

  // THE refusal (BTS-12 / P1 / P2): a bare local-eval target is correctness-
  // unsafe — local eval doesn't see the server's full person profile, so the
  // same user gets different flag values by path. Fail closed.
  if (evalPath === "bare-local-eval") {
    run.tool("refuse.bare-local-eval", false);
    run.finish("refused", "bare local-eval target");
    refuse(
      opts.json,
      `targeting "${opts.target}" by distinct_id/person-property via bare local-eval is unsafe (BTS-12/P1) — pass --db-eval OR pin the full property set with --pinned-props '{...}'`,
      { key, target: opts.target, evalPath, fix: ["--db-eval", "--pinned-props '{...}'"] },
    );
  }

  // Build the flagd flag + the blast-radius pre-check BEFORE any rollout.
  const flag = buildFlagdFlag(key, evalPath, opts.target);
  const population = opts.population
    ? opts.population.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  run.tool("blast-radius.precheck");
  const radius = blastRadius({ evalPath, population, target: opts.target });

  // Dry-run eval the flag in-process via OpenFeature for the targeting context —
  // proves the wiring resolves to the expected value before any real rollout.
  run.tool("dry-run.eval");
  let dryRun = false;
  try {
    dryRun = await dryRunEval(key, flag, opts.target);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    run.finish("error", `dry-run failed: ${msg}`);
    fail(opts.json, `dry-run evaluation failed: ${msg}`);
  }

  // Write the flagd file-backed flag (the $0, no-SaaS-key path). The PostHog
  // provider path is documented; flagd is the wired default for the merge gate.
  const outPath = resolve(opts.out ?? join(process.cwd(), "flags", "flags.json"));
  run.tool("flagd.write");
  if (opts.provider === "flagd") {
    const source = loadFlagdSource(outPath);
    source.flags[key] = flag;
    atomicWrite(outPath, JSON.stringify(source, null, 2) + "\n");
  }

  run.finish("ok");

  const result = {
    wired: true,
    key,
    provider: opts.provider,
    evalPath, // "db" | "pinned-props" | "static" — NEVER "bare-local-eval" (refused above)
    blastRadius: radius,
    dryRun,
    flagFile: opts.provider === "flagd" ? outPath : null,
    callSite: "openfeature", // vendor behind a provider (O15)
    trace: run.trace,
  };

  if (opts.json) {
    emit(true, result, "");
    return;
  }
  process.stdout.write(chalk.bold(`tally wire-flag · ${key}\n`));
  process.stdout.write(`  call site:    OpenFeature ${chalk.dim(`(provider: ${opts.provider})`)}\n`);
  process.stdout.write(`  eval path:    ${chalk.green(evalPath)} ${chalk.dim("(never bare local-eval — BTS-12)")}\n`);
  process.stdout.write(`  blast radius: ${chalk.cyan(String(radius))} ${chalk.dim("(pre-checked before rollout)")}\n`);
  process.stdout.write(`  dry-run:      resolves to ${chalk.cyan(String(dryRun))}\n`);
  if (result.flagFile) process.stdout.write(`  flagd file:   ${chalk.cyan(result.flagFile)}\n`);
}
