/**
 * tally dispatch · routing (Component 8 — routing half). The internal routing
 * loop that runs the multi-step acceptance flow IN DEPENDENCY ORDER:
 *
 *   track-plan → register → wire-flag → capture-event → assert-captured → audit
 *
 * Each step shells out via the same `runTallyCli` bridge the MCP uses (one source
 * of truth), so the routed flow is exactly what an agent would run by hand. The
 * ordering is the load-bearing property (the verify): the run log records each
 * step in sequence, and a step that REFUSES/ERRORS halts the flow fail-closed
 * (O20) — you cannot capture before the plan is registered, cannot audit before
 * the event is captured. No `tmux select-pane` (no terminal focus-steal); this is
 * a pure in-process loop.
 *
 * No `any`, named exports only.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runTallyCli } from "../mcp/run-cli.js";
import { startRun } from "../observability/run-logger.js";

/** A single routed step: its ordinal, name, the CLI it ran, and the outcome. */
export interface RouteStep {
  order: number;
  step: string;
  cli: string;
  outcome: "ok" | "refused" | "error" | "skipped";
  detail?: unknown;
}

/** Options for the routing loop. */
export interface RouteOptions {
  /** Target dir the flow instruments (track-plan + audit-pii scan it). */
  dir: string;
  /** Flag key to wire (default a fresh demo key). */
  flagKey?: string;
  /** Event to capture (default a registry-conformant demo event). */
  event?: string;
  /** Emit machine-readable JSON. */
  json?: boolean;
}

/** The full routed-flow result: the ordered steps + whether the flow completed. */
export interface RouteResult {
  ordered: string[];
  steps: RouteStep[];
  completed: boolean;
  haltedAt?: string;
  trace: string;
}

/** The documented step order (the contract the verify checks). */
export const ROUTE_ORDER = [
  "track-plan",
  "register",
  "wire-flag",
  "capture-event",
  "assert-captured",
  "audit",
] as const;

/** Classify a CLI result into a route outcome. */
function outcomeOf(exitCode: number): RouteStep["outcome"] {
  if (exitCode === 0) return "ok";
  if (exitCode === 3) return "refused";
  return "error";
}

/**
 * Run the routing loop. Returns the ordered steps + completion. Stops at the
 * first refusal/error (fail-closed) — a half-instrumented surface is not a
 * success. Each step is appended to the shared run log (the ordering evidence).
 */
export function runRoute(opts: RouteOptions): RouteResult {
  const run = startRun("route");
  const dir = resolve(opts.dir);
  const flagKey = opts.flagKey ?? "route_demo_flag";
  const event = opts.event ?? "user_signed_up";
  const steps: RouteStep[] = [];

  /** Run one step, record it (ordered) + log it, and return whether to continue. */
  const step = (name: string, argv: string[]): boolean => {
    run.tool(`route.${name}`);
    const res = runTallyCli(argv);
    const outcome = outcomeOf(res.exitCode);
    steps.push({ order: steps.length + 1, step: name, cli: `tally ${argv.join(" ")}`, outcome, detail: res.json });
    return outcome === "ok";
  };

  let completed = false;
  let haltedAt: string | undefined;

  do {
    // 1. track-plan — emit the registry + CI check (the registration artifact).
    if (!step("track-plan", ["track-plan", dir, "--app", "routed"])) {
      haltedAt = "track-plan";
      break;
    }

    // 2. register — confirm the registry artifact landed (the dedup ledger O2).
    const registryPath = resolve(dir, ".tally-plan", "registry.json");
    const registered = existsSync(registryPath);
    steps.push({
      order: steps.length + 1,
      step: "register",
      cli: `verify ${registryPath}`,
      outcome: registered ? "ok" : "error",
      detail: { registryPath, registered },
    });
    run.tool("route.register", registered);
    if (!registered) {
      haltedAt = "register";
      break;
    }

    // 3. wire-flag — OpenFeature, pinned-props (never bare local-eval), flagd.
    if (
      !step("wire-flag", [
        "wire-flag",
        flagKey,
        "--provider",
        "flagd",
        "--target",
        "plan",
        "--pinned-props",
        JSON.stringify({ plan: "pro" }),
        "--population",
        "a,b,c",
      ])
    ) {
      haltedAt = "wire-flag";
      break;
    }

    // 4. capture-event — fire a typed, PII-masked event into the local sink.
    if (
      !step("capture-event", [
        "capture-event",
        event,
        "--props",
        JSON.stringify({ plan: "pro", referral_source: "google" }),
        "--sink",
        "local",
      ])
    ) {
      haltedAt = "capture-event";
      break;
    }

    // 5. assert-captured — the capture step already reads back; confirm the flag.
    const captureStep = steps.find((s) => s.step === "capture-event");
    const cap = (captureStep?.detail ?? {}) as Record<string, unknown>;
    const captured = cap.captured === true;
    steps.push({
      order: steps.length + 1,
      step: "assert-captured",
      cli: "assert capture.captured === true",
      outcome: captured ? "ok" : "error",
      detail: { captured, piiMasked: cap.piiMasked },
    });
    run.tool("route.assert-captured", captured);
    if (!captured) {
      haltedAt = "assert-captured";
      break;
    }

    // 6. audit — tally's own PII audit must pass on the instrumented surface.
    //    `audit-pii` exits 0 even with findings (it's a report), so fail-closed
    //    HERE on a non-clean result (critical PII present) — the route's "done"
    //    is a CLEAN surface, not merely a completed scan (O20 — a wall).
    run.tool("route.audit");
    const auditRes = runTallyCli(["audit-pii", dir]);
    const audit = (auditRes.json ?? {}) as Record<string, unknown>;
    const auditClean = auditRes.exitCode === 0 && audit.clean !== false && (audit.critical ?? 0) === 0;
    steps.push({
      order: steps.length + 1,
      step: "audit",
      cli: `tally audit-pii ${dir}`,
      outcome: auditClean ? "ok" : "error",
      detail: audit,
    });
    if (!auditClean) {
      haltedAt = "audit";
      break;
    }

    completed = true;
  } while (false);

  run.finish(completed ? "ok" : "error", haltedAt ? `halted at ${haltedAt}` : undefined);

  return {
    ordered: steps.map((s) => s.step),
    steps,
    completed,
    ...(haltedAt ? { haltedAt } : {}),
    trace: run.trace,
  };
}

// Run directly: `node dist/dispatch/route.js <dir> [--json]`.
const invokedDirectly =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("route.js") || process.argv[1].endsWith("route.ts"));
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const dir = args.find((a) => !a.startsWith("--")) ?? process.cwd();
  const result = runRoute({ dir, json });
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(`tally route · ${dir}\n`);
    for (const s of result.steps) {
      const mark = s.outcome === "ok" ? "✓" : s.outcome === "refused" ? "⛔" : "✗";
      process.stdout.write(`  ${s.order}. ${mark} ${s.step} ${s.outcome === "ok" ? "" : `(${s.outcome})`}\n`);
    }
    process.stdout.write(result.completed ? "routed flow COMPLETE (ordering held)\n" : `routed flow HALTED at ${result.haltedAt}\n`);
  }
  process.exit(result.completed ? 0 : 1);
}
