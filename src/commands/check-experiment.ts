/**
 * tally check-experiment — the differentiator. J5 · O5/O6/O8/O9 · BTS-4/5/16/17.
 *
 * Decide an experiment correctly, fail closed:
 *  1. SRM chi-squared check FIRST → refuse-to-report on failure (BTS-5/P14).
 *  2. Peeking guard → refuse to declare a winner before N on a fixed-horizon
 *     frequentist test; recommend Bayesian/sequential (BTS-4/O6).
 *  3. Pre-registration contract required (BTS-17).
 *  4. Multiple-comparison correction on segment readouts (BTS-17).
 *  5. Flag CUPED-on-one-shot (BTS-16), means-test-on-conversion (P16),
 *     unbounded retention (P17/P18).
 *
 * No `any`, named exports only. < 400 lines.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { z } from "zod";
import { srmCheck } from "../stats/srm.js";
import { peekingGuard, type ExperimentMethod } from "../stats/peeking-guard.js";
import { benjaminiHochberg, type SegmentResult } from "../stats/multiple-comparison.js";
import { emit, refuse, fail } from "./output.js";
import { startRun } from "../observability/run-logger.js";

/** Zod schema for an experiment spec (the file/inline tally checks). */
const ExperimentSchema = z.object({
  id: z.string().optional(),
  method: z
    .enum(["frequentist-fixed-horizon", "frequentist-sequential", "bayesian"])
    .default("frequentist-fixed-horizon"),
  /** Observed user counts per variant (for SRM). */
  observed: z.array(z.number()).min(2).optional(),
  /** Intended allocation weights (default even split across variants). */
  intended: z.array(z.number()).min(2).optional(),
  /** Is the caller trying to declare a winner? */
  declaringWinner: z.boolean().default(false),
  currentN: z.number().optional(),
  preRegisteredN: z.number().optional(),
  direction: z.enum(["winner", "loser"]).optional(),
  /** Pre-registration contract (hypothesis + metric + segments written before data). */
  preRegistration: z
    .object({
      hypothesis: z.string(),
      metric: z.string(),
      segments: z.array(z.string()).optional(),
    })
    .optional(),
  /** Per-segment p-values for a post-hoc readout (triggers correction). */
  segments: z.array(z.object({ segment: z.string(), pValue: z.number() })).optional(),
  /** Experiment shape flags for the shibboleth checks. */
  cupedEnabled: z.boolean().optional(),
  productType: z.enum(["one-shot", "repeat-usage"]).optional(),
  metricType: z.enum(["conversion", "continuous"]).optional(),
  statTest: z.enum(["means", "proportion"]).optional(),
  retention: z.enum(["bounded", "unbounded"]).optional(),
  conversionWindow: z.string().optional(),
});

export type ExperimentSpec = z.infer<typeof ExperimentSchema>;

/** Options for `tally check-experiment`. */
export interface CheckExperimentOptions {
  json: boolean;
}

/** Load the spec from a JSON file path or an inline JSON string. */
function loadSpec(idOrSpec: string, json: boolean): ExperimentSpec {
  let raw: unknown;
  const asPath = resolve(idOrSpec);
  if (existsSync(asPath)) {
    try {
      raw = JSON.parse(readFileSync(asPath, "utf8"));
    } catch {
      return fail(json, `could not parse experiment spec file: ${idOrSpec}`);
    }
  } else if (idOrSpec.trim().startsWith("{")) {
    try {
      raw = JSON.parse(idOrSpec);
    } catch {
      return fail(json, "inline experiment spec is not valid JSON");
    }
  } else {
    // A bare id with no file → can't check without data; refuse cleanly.
    return fail(json, `no experiment spec file found at "${idOrSpec}" (pass a JSON file or inline spec)`);
  }
  const parsed = ExperimentSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(json, `invalid experiment spec: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  return parsed.data;
}

/** Run `tally check-experiment <id|spec>`. */
export function runCheckExperiment(idOrSpec: string, opts: CheckExperimentOptions): void {
  const run = startRun("check-experiment");
  const spec = loadSpec(idOrSpec, opts.json);
  const warnings: string[] = [];

  // 1. SRM FIRST — is this experiment even valid to read? (BTS-5/P14)
  let srmPass = true;
  let srm: ReturnType<typeof srmCheck> | null = null;
  if (spec.observed) {
    run.tool("srm.chi-squared");
    const intended = spec.intended ?? spec.observed.map(() => 1);
    srm = srmCheck(spec.observed, intended);
    srmPass = srm.pass;
    if (!srmPass) {
      // Fail closed: block the readout, surface the randomization bug.
      run.tool("refuse.srm-fail", false);
      run.finish("refused", "SRM mismatch");
      refuse(
        opts.json,
        `SRM detected (chi²=${srm.chiSquared}, p=${srm.pValue} < ${srm.threshold}) — the randomization is broken; the experiment is invalid to read. Fix the assignment before reporting any result (BTS-5/P14).`,
        { srm },
      );
    }
  } else {
    warnings.push("No observed split provided — SRM could not be run (it should be the FIRST check, P14).");
  }

  // 2. Peeking guard — refuse a peeked winner on a fixed-horizon test (BTS-4/O6).
  run.tool("peeking.guard");
  const peeking = peekingGuard({
    method: spec.method as ExperimentMethod,
    declaringWinner: spec.declaringWinner,
    currentN: spec.currentN ?? 0,
    preRegisteredN: spec.preRegisteredN,
    direction: spec.direction,
  });
  if (spec.declaringWinner && !peeking.winnerAllowed) {
    run.tool("refuse.peeked-winner", false);
    run.finish("refused", "peeked winner");
    refuse(opts.json, peeking.recommendation, { peeking, method: spec.method });
  }

  // 3. Pre-registration contract (BTS-17). Missing → a warning the readout can't
  //    be confirmatory (an unplanned slice is hypothesis-generating only).
  const preRegistered = !!spec.preRegistration;
  if (!preRegistered) {
    warnings.push(
      "No pre-registration contract — write hypothesis+metric+segments BEFORE data (an experiment contract == an eval contract, BTS-17). Any segment readout is hypothesis-generating, not confirmatory.",
    );
  }

  // 4. Multiple-comparison correction on segment readouts (BTS-17).
  let correction: ReturnType<typeof benjaminiHochberg> | null = null;
  if (spec.segments && spec.segments.length > 1) {
    run.tool("multiple-comparison");
    correction = benjaminiHochberg(spec.segments as SegmentResult[]);
    if (correction.rawSignificant > 0 && correction.survivors < correction.rawSignificant) {
      warnings.push(
        `${correction.rawSignificant} segment(s) looked significant raw, but only ${correction.survivors} survive multiple-comparison correction — do not ship a 1-of-N segment without correction (BTS-17).`,
      );
    }
  }

  // 5. Shibboleths: CUPED-on-one-shot (BTS-16), means-on-conversion (P16),
  //    unbounded retention / missing conversion window (P17/P18).
  if (spec.cupedEnabled && spec.productType === "one-shot") {
    warnings.push("CUPED is enabled on a one-shot/e-commerce product — leave CUPED OFF or justify a strong covariate; it adds bias, not power (BTS-16/P15).");
  }
  if (spec.metricType === "conversion" && spec.statTest === "means") {
    warnings.push("A means-based test is applied to a conversion-rate metric — use proportion/funnel methodology (P16).");
  }
  if (spec.retention === "unbounded") {
    warnings.push("Unbounded retention used for a tracked metric — switch to bounded N-day retention; yesterday's number silently changes today (P17).");
  }
  if (spec.metricType === "conversion" && !spec.conversionWindow) {
    warnings.push("Funnel/conversion metric has no explicit conversion window — set one in the definition or conversions weeks later inflate the rate (P18).");
  }

  run.finish("ok");

  const verdict = warnings.length === 0 ? "valid" : "valid-with-warnings";
  const result = {
    id: spec.id ?? null,
    srmPass,
    srm,
    peekingSafe: peeking.safe,
    peeking,
    preRegistered,
    correction,
    verdict,
    warnings,
    trace: run.trace,
  };

  if (opts.json) {
    emit(true, result, "");
    return;
  }
  process.stdout.write(chalk.bold(`tally check-experiment${spec.id ? " · " + spec.id : ""}\n`));
  process.stdout.write(`  SRM:      ${srm ? (srmPass ? chalk.green("pass") : chalk.red("FAIL")) + chalk.dim(` (p=${srm.pValue})`) : chalk.dim("not run")}\n`);
  process.stdout.write(`  peeking:  ${peeking.safe ? chalk.green("safe") : chalk.red("unsafe")} ${chalk.dim(`(${spec.method})`)}\n`);
  process.stdout.write(`  pre-reg:  ${preRegistered ? chalk.green("yes") : chalk.yellow("missing")}\n`);
  if (correction) {
    process.stdout.write(`  segments: ${correction.survivors}/${correction.segments.length} survive correction ${chalk.dim(`(raw sig: ${correction.rawSignificant})`)}\n`);
  }
  for (const w of warnings) process.stdout.write(chalk.yellow(`  ⚠ ${w}\n`));
  if (warnings.length === 0) process.stdout.write(chalk.green(`  verdict:  valid to report.\n`));
}
