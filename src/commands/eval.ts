/**
 * tally eval — run the eval pyramid (Hamel L1/L2/L3).
 *
 * The eval entrypoint. The golden-task suite itself (G1–G17 ← BTS-1–BTS-17) is
 * the Evals cluster's deliverable under `eval/`; this command is the runner the
 * CLI exposes (so `tally eval` is a real surface and `--help` lists it). It shells
 * out to the project's vitest suite (the `noSelfGrading:true` binary gate) when an
 * `eval/` dir is present, and reports honestly when the suite hasn't landed yet.
 *
 * No `any`, named exports only.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { emit } from "./output.js";
import { startRun } from "../observability/run-logger.js";

export interface EvalOptions {
  level?: number;
  json: boolean;
}

/** Run `tally eval [--level N]`. */
export function runEval(opts: EvalOptions): void {
  const run = startRun("eval");
  const evalDir = resolve(process.cwd(), "eval");
  const hasSuite = existsSync(evalDir);

  if (!hasSuite) {
    run.finish("ok", "eval suite not present");
    const note = "eval/ suite not present yet (golden tasks G1–G17 are the Evals-cluster deliverable). The CLI eval runner is wired; the binary gate runs `vitest` over eval/ once it lands.";
    if (opts.json) {
      emit(true, { ran: false, hasSuite: false, note, trace: run.trace }, "");
    } else {
      process.stdout.write(chalk.yellow(`tally eval: ${note}\n`));
    }
    return;
  }

  run.tool("vitest.run");
  // Filter to the level dir when --level is given (eval/l1, eval/l2, ...).
  const args = ["run"];
  if (opts.level) args.push(`eval/l${opts.level}`);
  const res = spawnSync("npx", ["vitest", ...args], { stdio: opts.json ? "pipe" : "inherit", cwd: process.cwd() });
  const ok = res.status === 0;
  run.finish(ok ? "ok" : "error");

  if (opts.json) {
    emit(true, { ran: true, hasSuite: true, level: opts.level ?? "all", passed: ok, trace: run.trace }, "");
  }
  process.exit(res.status ?? 1);
}
