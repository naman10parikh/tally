/**
 * tally migrate-plan — J8 · O16 · BTS-7/8/9/14 · P19–P23. Provider migration plan.
 *
 * "Dual-write, reconcile, explain the delta, then cut over." Every migration
 * "loses" data: dedup is NOT automatic (a paused-then-resumed run doubles data —
 * carry an event-id idempotency key), defaults differ → counts drop ~15% (bot
 * filter + dropped session_start — explain, don't chase parity), derived assets
 * (cohorts/dashboards) don't transfer, `$set`/`$set_once` re-map by hand, GA4
 * session→event is irreversible, cost on the DESTINATION's pricing axis, flush()
 * for >10k.
 *
 * No `any`, named exports only. < 400 lines.
 */

import chalk from "chalk";
import { emit } from "./output.js";
import { startRun } from "../observability/run-logger.js";

export interface MigratePlanOptions {
  from: string;
  to: string;
  json: boolean;
}

/** Named delta causes per common source (BTS-7/P20 — explain, don't chase parity). */
function deltaCauses(from: string, to: string): string[] {
  const f = from.toLowerCase();
  const t = to.toLowerCase();
  const causes: string[] = [];
  if (t.includes("posthog")) {
    causes.push("PostHog blocks bot traffic by default → counts legitimately ~10-15% lower (not a broken import, BTS-7/P20).");
  }
  if (f.includes("amplitude")) {
    causes.push("Amplitude `session_start` events are dropped (not imported) — expected, not data loss (P20).");
  }
  if (f.includes("mixpanel")) {
    causes.push("Mixpanel events with no resolvable distinct_id are dropped on import (P20).");
  }
  if (f.includes("ua") || f.includes("universal") || t.includes("ga4")) {
    causes.push("UA→GA4 is a session→event MODEL rupture — historical UA data is irreversible at the data layer; needs custom ETL into a warehouse, NOT a native import (BTS-9).");
  }
  if (causes.length === 0) {
    causes.push("Default filtering/dedup/bot-handling differs between providers — reconcile and EXPLAIN the delta rather than assuming the numbers must match (O16).");
  }
  return causes;
}

/** Run `tally migrate-plan --from --to`. */
export function runMigratePlan(opts: MigratePlanOptions): void {
  const run = startRun("migrate-plan");
  run.tool("plan.build");

  const isCdp = /segment|rudderstack/i.test(opts.from) || /segment|rudderstack/i.test(opts.to);
  const isGa4 = /ga4|universal|ua/i.test(opts.from) || /ga4/i.test(opts.to);

  const plan = {
    from: opts.from,
    to: opts.to,
    // The non-negotiable spine (O16).
    dualWrite: "Run BOTH providers concurrently; do NOT hard-cut. Reconcile counts before removing the legacy path.",
    idempotencyKey: "event-id (a per-event idempotency/dedup key) — managed migrations do NOT deduplicate; a paused-then-resumed run silently doubles data (BTS-8/P19). Resume from a checkpoint keyed on imported IDs, never re-run blindly.",
    reconcile: "Compare source-vs-destination counts; attribute the delta to NAMED causes (below); don't chase parity.",
    deltaCauses: deltaCauses(opts.from, opts.to),
    derivedAssetsWarning: "Cohorts, dashboards, charts, computed properties do NOT transfer — only raw events. Plan to rebuild every saved view by hand (P21).",
    identityRemap: "Re-map person properties by hand: `$set_once` for first-touch/acquisition, `$set` only for mutable state — `$set` on referral source destroys acquisition history forever (P23).",
    flush: "For bulk ingest >10,000 events call `flush()` after each batch or you lose the tail (default queue size 10,000, P22).",
    // Cost model on the DESTINATION's pricing axis (BTS-14).
    costModel: isCdp
      ? "Model the bill on the DESTINATION's pricing axis using YOUR real event/MTU shape — Segment prices on MTUs, RudderStack on event volume; a low-MTU/high-event app gets MORE expensive on RudderStack. 'They're cheaper' is not a cost model (BTS-14)."
      : "Model the destination's cost on its own pricing axis with your real volumes before cutover (don't assume 'cheaper for them' = 'cheaper for you').",
    irreversibility: isGa4
      ? "GA4: the session→event shift is irreversible at the data layer — store events warehouse-first/exportable so a future switch is a re-pipe, not a bereavement (BTS-9/O14)."
      : "Own the raw event stream warehouse-first so any future switch is a re-pipe, not a data funeral (O14).",
    testFirst: "Run a SUBSET test migration first; verify reconciliation on the sample before the full run.",
  };

  run.finish("ok");

  const result = { ...plan, trace: run.trace };
  if (opts.json) {
    emit(true, result, "");
    return;
  }
  process.stdout.write(chalk.bold(`tally migrate-plan · ${opts.from} → ${opts.to}\n`));
  process.stdout.write(`  ${chalk.cyan("dual-write")}:    ${plan.dualWrite}\n`);
  process.stdout.write(`  ${chalk.cyan("idempotency")}:   ${plan.idempotencyKey}\n`);
  process.stdout.write(`  ${chalk.cyan("delta causes")}:\n`);
  for (const c of plan.deltaCauses) process.stdout.write(`     - ${c}\n`);
  process.stdout.write(`  ${chalk.cyan("derived assets")}: ${plan.derivedAssetsWarning}\n`);
  process.stdout.write(`  ${chalk.cyan("identity remap")}: ${plan.identityRemap}\n`);
  process.stdout.write(`  ${chalk.cyan("cost model")}:    ${plan.costModel}\n`);
}
