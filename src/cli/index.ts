#!/usr/bin/env node
/**
 * tally — CLI entry. The employee's hands (J8/O13): every operation an agent
 * needs has a deterministic, `--json`, non-interactive path. commander wires the
 * full command tree (PLAN §4); `--help` lists EVERY command, `--version` exits 0.
 *
 * Boundary (load-bearing, O18): tally owns product analytics + flags +
 * experiments ONLY. LLM token spend = agentmoney; app health = canary; web
 * pageview stats = the Plausible plane. tally never pipes `gen_ai.usage.*` into
 * PostHog.
 *
 * No `any`, named exports only.
 */

import { Command } from "commander";
import { runTrackPlan } from "../commands/track-plan.js";
import { runWireFlag } from "../commands/wire-flag.js";
import { runCaptureEvent } from "../commands/capture-event.js";
import { runCheckExperiment } from "../commands/check-experiment.js";
import { runAuditPii } from "../commands/audit-pii.js";
import { runFlagSweep } from "../commands/flag-sweep.js";
import { runMigratePlan } from "../commands/migrate-plan.js";
import { runRead } from "../commands/read.js";
import { runBrain, runExplain } from "../commands/brain.js";
import { runEval } from "../commands/eval.js";

/** Build the commander program (exported so tests can introspect the tree). */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name("tally")
    .description(
      "Product-analytics + feature-flags + experiments employee. Count what matters, once, correctly; fail closed on the irreversible. Boundary: LLM token spend = agentmoney, app health = canary, web stats = Plausible. Powered by Energy.",
    )
    .version("0.1.0", "-v, --version", "print tally version");

  program
    .command("track-plan")
    .description("emit a canonical typed event registry + typed accessors + a CI check that fails the build on a case-variant (acceptance leg 1; J1/O1/O2/BTS-1)")
    .argument("<dir>", "directory (product brief / codebase) to scan")
    .option("--app <name>", "app name for the generated artifacts")
    .option("--out <dir>", "output directory (default: <dir>/.tally-plan)")
    .option("--json", "machine-readable JSON output", false)
    .action((dir: string, o: { app?: string; out?: string; json: boolean }) =>
      runTrackPlan(dir, { app: o.app, out: o.out, json: o.json }),
    );

  program
    .command("wire-flag")
    .description("wire a flag through OpenFeature (DB-eval/pinned-props, never bare local-eval) + blast-radius pre-check (acceptance leg 2; J4/O7/BTS-12)")
    .argument("<key>", "flag key (lower snake_case)")
    .option("--provider <provider>", "posthog | flagd", "flagd")
    .option("--target <target>", "targeting key (distinct_id or property)")
    .option("--pinned-props <json>", "pin the FULL property set for a person-property target")
    .option("--db-eval", "use DB-backed evaluation", false)
    .option("--population <ids>", "comma-separated sample ids for the blast-radius pre-check")
    .option("--out <file>", "flagd source file (default: flags/flags.json)")
    .option("--json", "machine-readable JSON output", false)
    .action(
      (
        key: string,
        o: {
          provider: "posthog" | "flagd";
          target?: string;
          pinnedProps?: string;
          dbEval?: boolean;
          population?: string;
          out?: string;
          json: boolean;
        },
      ) =>
        void runWireFlag(key, {
          provider: o.provider,
          target: o.target,
          pinnedProps: o.pinnedProps,
          dbEval: o.dbEval,
          population: o.population,
          out: o.out,
          json: o.json,
        }),
    );

  program
    .command("capture-event")
    .description("fire a registry-conformant typed event → capture sink with PII masked + two-call identify ($set_once acquisition) (acceptance leg 3; J2/J3/BTS-2/3)")
    .argument("<name>", "event name")
    .option("--props <json>", "event properties as a JSON object")
    .option("--sink <sink>", "local | posthog", "local")
    .option("--distinct-id <id>", "distinct_id to attribute the event to")
    .option("--registry <file>", "registry to validate against")
    .option("--out <file>", "local sink file (default: .capture/events.jsonl)")
    .option("--allow <keys>", "comma-separated keys to allow past the PII mask")
    .option("--json", "machine-readable JSON output", false)
    .action(
      (
        name: string,
        o: {
          props?: string;
          sink: "local" | "posthog";
          distinctId?: string;
          registry?: string;
          out?: string;
          allow?: string;
          json: boolean;
        },
      ) =>
        runCaptureEvent(name, {
          props: o.props,
          sink: o.sink,
          distinctId: o.distinctId,
          registry: o.registry,
          out: o.out,
          allow: o.allow,
          json: o.json,
        }),
    );

  program
    .command("check-experiment")
    .description("decide an experiment: SRM-first, peeking guard, pre-registration, multiple-comparison, CUPED/means/retention checks — fail closed (J5/O5/O6/BTS-4/5/16/17)")
    .argument("<id|spec>", "experiment spec JSON file or inline JSON")
    .option("--json", "machine-readable JSON output", false)
    .action((idOrSpec: string, o: { json: boolean }) => runCheckExperiment(idOrSpec, { json: o.json }));

  program
    .command("audit-pii")
    .description("scan the four PII hiding places + verify mask-all-then-allowlist across web/iOS/RN + before_send URL-scrub (J3/O4/BTS-2/P8)")
    .argument("<dir>", "directory to audit")
    .option("--json", "machine-readable JSON output", false)
    .action((dir: string, o: { json: boolean }) => runAuditPii(dir, { json: o.json }));

  program
    .command("flag-sweep")
    .description("surface zombie flags (age+last-eval+owner), temp-vs-permanent, removal diff; REFUSE to reuse a retired key (J6/O11/BTS-6/P27)")
    .option("--dir <dir>", "directory with the flag ledger")
    .option("--reuse <key>", "check whether reusing this key is allowed (refuses if tombstoned)")
    .option("--json", "machine-readable JSON output", false)
    .action((o: { dir?: string; reuse?: string; json: boolean }) =>
      runFlagSweep({ dir: o.dir, reuse: o.reuse, json: o.json }),
    );

  program
    .command("migrate-plan")
    .description("plan a provider migration: dual-write + reconcile + explain-delta + event-id idempotency + cost-on-destination-axis (J8/O16/BTS-7/8/9/14)")
    .requiredOption("--from <vendor>", "source provider")
    .requiredOption("--to <vendor>", "destination provider")
    .option("--json", "machine-readable JSON output", false)
    .action((o: { from: string; to: string; json: boolean }) =>
      runMigratePlan({ from: o.from, to: o.to, json: o.json }),
    );

  program
    .command("read")
    .description("read a metric the agent way: typed queries, MATERIALIZE recurring reads (never loop raw HogQL), bounded retention + explicit conversion window (J8/O13/BTS-11/P11)")
    .requiredOption("--query <kind>", "funnel | retention | trends")
    .option("--materialize", "emit a materialized endpoint instead of a per-loop raw query", false)
    .option("--retention-days <n>", "bounded retention window (default 7)", (v) => Number(v))
    .option("--conversion-window <window>", "funnel conversion window (default 24h)")
    .option("--json", "machine-readable JSON output", false)
    .action(
      (o: {
        query: "funnel" | "retention" | "trends";
        materialize?: boolean;
        retentionDays?: number;
        conversionWindow?: string;
        json: boolean;
      }) =>
        runRead({
          query: o.query,
          materialize: o.materialize,
          retentionDays: o.retentionDays,
          conversionWindow: o.conversionWindow,
          json: o.json,
        }),
    );

  program
    .command("brain")
    .description("BM25F search over the expertise brain/ — ranked pitfalls/scenarios/opinions (Memory layer)")
    .argument("<query...>", "search query")
    .option("--limit <n>", "max hits (default 5)", (v) => Number(v))
    .option("--json", "machine-readable JSON output", false)
    .action((queryParts: string[], o: { limit?: number; json: boolean }) =>
      runBrain(queryParts.join(" "), { limit: o.limit, json: o.json }),
    );

  program
    .command("explain")
    .description("print a scenario/pitfall/opinion/job by ID (BTS-/P-/O-/J-/A-id) with situation/trap/resolution/source")
    .argument("<id>", "e.g. P27, BTS-4, O6, J5")
    .option("--json", "machine-readable JSON output", false)
    .action((id: string, o: { json: boolean }) => runExplain(id, { json: o.json }));

  program
    .command("eval")
    .description("run the eval pyramid (Hamel L1/L2/L3; golden tasks G1–G17 ← BTS-1–BTS-17)")
    .option("--level <n>", "1 | 2 | 3", (v) => Number(v))
    .option("--json", "machine-readable JSON output", false)
    .action((o: { level?: number; json: boolean }) => runEval({ level: o.level, json: o.json }));

  return program;
}

/** Parse argv and dispatch. Exposed so tests can drive it; called on CLI run. */
export async function main(argv: string[]): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(argv);
}

// Run only when invoked as the binary / via tsx (not when imported by a test). npm links the bin as
// `.bin/tally` (no extension), so that name counts too; without it `npx ... tally` printed nothing.
const invokedDirectly =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("index.ts") ||
    process.argv[1].endsWith("index.js") ||
    process.argv[1].endsWith("tally.js") ||
    /[\\/]tally$/.test(process.argv[1]));
if (invokedDirectly) {
  main(process.argv).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`tally: ${msg}\n`);
    process.exit(1);
  });
}
