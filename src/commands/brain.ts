/**
 * tally brain / tally explain — the Memory queryable layer CLI (B6 wrappers).
 *
 * Thin command wrappers over the shared BM25F engine in `src/memory/bm25.ts`
 * (already built + verified). `tally brain <query>` = ranked hits over the six
 * `brain/` artifacts; `tally explain <id>` = the full chunk by ID. This is the
 * `tally brain`-literal-CLI form the B6 board item awaited (it `needs B1`'s
 * binary, now present). Per HARNESS-OVERRIDES §2 the layer indexes the EXPERTISE
 * BRAIN, not code history.
 *
 * No `any`, named exports only.
 */

import chalk from "chalk";
import { search, explain } from "../memory/bm25.js";
import { emit } from "./output.js";
import { startRun } from "../observability/run-logger.js";

export interface BrainOptions {
  limit?: number;
  json: boolean;
}

/** Run `tally brain <query>` — ranked BM25F hits over brain/. */
export function runBrain(query: string, opts: BrainOptions): void {
  const run = startRun("brain");
  run.tool("bm25.search");
  const hits = search(query, opts.limit ?? 5);
  run.finish("ok");

  if (opts.json) {
    emit(true, { query, hits, trace: run.trace }, "");
    return;
  }
  if (hits.length === 0) {
    process.stdout.write(`No brain hits for: ${query}\n`);
    return;
  }
  process.stdout.write(chalk.bold(`=== brain search: "${query}" ===\n\n`));
  hits.forEach((h, i) => {
    process.stdout.write(
      `${chalk.dim(`[${i + 1}]`)} ${chalk.cyan(h.file)} ${chalk.bold(h.id)} ${chalk.dim(`(score ${h.score})`)}\n` +
        `    ${h.title}\n` +
        `    ${chalk.dim("> " + h.snippet)}\n\n`,
    );
  });
}

export interface ExplainOptions {
  json: boolean;
}

/** Run `tally explain <BTS-/P-/O-/J-/A-id>` — the full chunk by ID. */
export function runExplain(id: string, opts: ExplainOptions): void {
  const run = startRun("explain");
  run.tool("bm25.explain");
  const chunk = explain(id);
  if (!chunk) {
    run.finish("error", "unknown id");
    if (opts.json) {
      emit(true, { error: `no brain entry for ID "${id}"` }, "");
    } else {
      process.stderr.write(chalk.red(`error: no brain entry for ID "${id}"\n`));
    }
    process.exit(2);
  }
  run.finish("ok");
  if (opts.json) {
    emit(true, { ...chunk, trace: run.trace }, "");
    return;
  }
  process.stdout.write(chalk.bold(`# ${chunk.file} · ${chunk.id}\n\n`) + chunk.body + "\n");
}
