/**
 * tally read — J8 · O13/O13b · BTS-11/15 · P11/P12/P17/P18. Read a metric the
 * agent way.
 *
 * Prefer typed queries (`query-funnel`/`query-retention`/`query-trends`) over raw
 * HogQL. MATERIALIZE recurring reads — never loop `execute-sql` (raw HogQL is
 * capped at 120/hr; an agent loop stalls). Use BOUNDED retention + an explicit
 * conversion window (unbounded retention drifts; a missing window inflates the
 * funnel). Capture (ingest) is unmetered; reads on a personal key are the
 * bottleneck.
 *
 * No `any`, named exports only. < 400 lines.
 */

import chalk from "chalk";
import { emit, fail } from "./output.js";
import { startRun } from "../observability/run-logger.js";

export interface ReadOptions {
  query: "funnel" | "retention" | "trends";
  /** Materialize this as a polled endpoint instead of a per-loop raw query. */
  materialize?: boolean;
  /** Bounded N-day retention window (default 7) — never unbounded (P17). */
  retentionDays?: number;
  /** Funnel conversion window (default "24h") — never omitted (P18). */
  conversionWindow?: string;
  json: boolean;
}

const TYPED_QUERY = {
  funnel: "query-funnel",
  retention: "query-retention",
  trends: "query-trends",
} as const;

/** HogQL raw-read rate cap (P11) — the number the RSI loop re-verifies. */
const HOGQL_RATE_LIMIT_PER_HOUR = 120;
/** Materialized-endpoint sustained rate (the "persist, don't recompute" path). */
const MATERIALIZED_RATE_PER_HOUR = 12000;

/** Run `tally read --query <kind>`. */
export function runRead(opts: ReadOptions): void {
  const run = startRun("read");
  run.tool("read.plan");

  const typedTool = TYPED_QUERY[opts.query];
  if (!typedTool) fail(opts.json, `unknown query kind: ${opts.query}`);

  // Bounded retention + explicit conversion window (P17/P18). Defaults are
  // bounded/explicit on purpose — tally never emits an unbounded read.
  const retentionDays = opts.retentionDays ?? 7;
  const conversionWindow = opts.conversionWindow ?? "24h";

  // The materialization decision (O13/P11). For a recurring/looped read, emit a
  // MATERIALIZED endpoint plan, not a raw-HogQL loop.
  const endpoint = opts.materialize
    ? {
        kind: "materialized-endpoint",
        tool: "create-endpoint (Endpoints GA)",
        poll: `poll the materialized endpoint (${MATERIALIZED_RATE_PER_HOUR}/hr sustained, 10 concurrent) — NOT a per-loop execute-sql (capped ${HOGQL_RATE_LIMIT_PER_HOUR}/hr, BTS-11/P11).`,
        rawHogqlLoop: false,
      }
    : {
        kind: "typed-query",
        tool: typedTool,
        poll: `single typed read via ${typedTool} (prefer typed tools over execute-sql — avoids hallucinated columns, P12).`,
        rawHogqlLoop: false,
      };

  run.finish("ok");

  const result = {
    query: opts.query,
    typedTool,
    materialized: !!opts.materialize,
    endpoint,
    retention: { kind: "bounded", days: retentionDays }, // never "unbounded" (P17)
    conversionWindow, // always explicit (P18)
    keyClass: "personal API key for reads (project key is for capture — P4); reads are the rate-limited surface.",
    rawHogqlLoop: false, // tally NEVER loops raw HogQL
    trace: run.trace,
  };

  if (opts.json) {
    emit(true, result, "");
    return;
  }
  process.stdout.write(chalk.bold(`tally read · ${opts.query}\n`));
  process.stdout.write(`  typed tool:        ${chalk.cyan(typedTool)} ${chalk.dim("(over raw HogQL — P12)")}\n`);
  process.stdout.write(`  materialized:      ${opts.materialize ? chalk.green("yes") : chalk.dim("no (single read)")}\n`);
  process.stdout.write(`  ${endpoint.poll}\n`);
  process.stdout.write(`  retention:         ${chalk.cyan(`bounded ${retentionDays}d`)} ${chalk.dim("(never unbounded — P17)")}\n`);
  process.stdout.write(`  conversion window: ${chalk.cyan(conversionWindow)} ${chalk.dim("(always explicit — P18)")}\n`);
}
