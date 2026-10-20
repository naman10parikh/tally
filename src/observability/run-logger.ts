/**
 * tally — Observability layer (a): the dogfooded `runs.jsonl` wide event.
 *
 * Every `tally` run appends ONE wide event to `logs/runs.jsonl` with a REAL
 * `trace.id` (crypto UUID) + a MEASURED `durationMs` (not an all-zero marker —
 * that is the explicit 🟡 in HARNESS-OVERRIDES §10) + model + command + tool
 * calls + outcome. This is tally dogfooding the wide-event discipline it preaches
 * (O19) — and it is the shared logger EVERY CLI command wraps, so it is built in
 * the B-CLI stream as the early cross-cluster dependency (E3's named file).
 *
 * Boundary (load-bearing, O18): this is tally's OWN run telemetry — it is NOT a
 * `gen_ai.usage.*` LLM cost/token trace (that is agentmoney's plane) and it is
 * NOT an app-health span (canary's). It records what a `tally` invocation did.
 *
 * No `any`, named exports only, zero deps beyond node stdlib so it is independent
 * of any other command.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

/** The model tally runs under (D14: always Opus 4.8, max effort). */
const TALLY_MODEL = process.env.ANTHROPIC_MODEL ?? "default";

/** A single tool/sub-step a command invoked, for the wide event. */
export interface ToolCall {
  /** Tool/step name, e.g. "registry.write", "flagd.eval", "srm.chi-squared". */
  name: string;
  /** Optional outcome marker for this step. */
  ok?: boolean;
}

/** The wide event appended to `logs/runs.jsonl`. */
export interface RunEvent {
  /** ISO-8601 timestamp of the run. */
  ts: string;
  /** tally command, e.g. "track-plan". */
  command: string;
  /** The model marker (boundary: tally's own run, not an LLM token trace). */
  model: string;
  /** Wide-event trace block — a REAL uuid, not a zero marker. */
  trace: { id: string };
  /** MEASURED wall-clock duration in ms (Date.now delta — never hard-coded 0). */
  durationMs: number;
  /** Tool/sub-step calls this run made. */
  toolCalls: ToolCall[];
  /** Terminal outcome. */
  outcome: "ok" | "error" | "refused";
  /** Optional short note (e.g. the refusal reason). */
  note?: string;
}

/** Resolve the repo root's `logs/` dir from this module's location. */
function defaultLogPath(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // .../src/observability
  return resolve(here, "..", "..", "logs", "runs.jsonl");
}

/**
 * Append one wide event to `logs/runs.jsonl`. Creates `logs/` if missing.
 * Append-only (never rewrites); a write failure is logged to stderr, not thrown —
 * telemetry must never crash the command it observes.
 */
export function appendRun(event: RunEvent, logPath: string = defaultLogPath()): void {
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, JSON.stringify(event) + "\n", "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[run-logger] could not append run event: ${msg}\n`);
  }
}

/**
 * A live run handle: opened at command start (captures the start time + a real
 * trace.id), accumulates tool calls, and flushed once at command end with the
 * MEASURED duration. The pattern every command uses:
 *
 *   const run = startRun("track-plan");
 *   run.tool("registry.write");
 *   ...
 *   run.finish("ok");
 */
export class RunHandle {
  private readonly start: number;
  private readonly traceId: string;
  private readonly toolCalls: ToolCall[] = [];
  private finished = false;

  constructor(
    private readonly command: string,
    private readonly logPath: string = defaultLogPath(),
  ) {
    this.start = Date.now();
    this.traceId = randomUUID();
  }

  /** This run's real trace id (so a command can echo it in `--json` output). */
  get trace(): string {
    return this.traceId;
  }

  /** Record a tool/sub-step call for the wide event. */
  tool(name: string, ok = true): void {
    this.toolCalls.push({ name, ok });
  }

  /**
   * Flush the wide event with the measured duration. Idempotent (a second call
   * is a no-op) so finishing in both a success and a finally block is safe.
   */
  finish(outcome: RunEvent["outcome"], note?: string): RunEvent {
    const event: RunEvent = {
      ts: new Date().toISOString(),
      command: this.command,
      model: TALLY_MODEL,
      trace: { id: this.traceId },
      durationMs: Math.max(0, Date.now() - this.start),
      toolCalls: this.toolCalls,
      outcome,
      ...(note ? { note } : {}),
    };
    if (!this.finished) {
      this.finished = true;
      appendRun(event, this.logPath);
    }
    return event;
  }
}

/** Open a run handle for `command`. */
export function startRun(command: string, logPath?: string): RunHandle {
  return new RunHandle(command, logPath);
}

/**
 * O19 — weight event value by INTENT DEPTH, never by raw count. The in-house
 * precedent is `score.py`'s `bookmarks*2 + retweets*3 + replies*1.5 + likes`. A
 * raw count treats a high-intent action (invite-teammate) and a pageview the
 * same; this scorer does not. Used by the Observability/engagement surface and
 * documented here so the weighting lives with the run telemetry.
 */
export const INTENT_WEIGHTS: Readonly<Record<string, number>> = {
  invite: 3,
  save: 2.5,
  create: 2,
  share: 1.5,
  comment: 1.5,
  click: 1,
  view: 0.5,
};

/**
 * Score a bag of `{ action: count }` by intent depth (O19). Unknown actions get
 * a neutral weight of 1 (counted, but not boosted) so the score never silently
 * drops an event it doesn't recognize.
 */
export function intentDepthScore(counts: Readonly<Record<string, number>>): number {
  let total = 0;
  for (const [action, n] of Object.entries(counts)) {
    const key = action.toLowerCase();
    const weight =
      INTENT_WEIGHTS[key] ??
      Object.entries(INTENT_WEIGHTS).find(([k]) => key.includes(k))?.[1] ??
      1;
    total += weight * n;
  }
  return Math.round(total * 100) / 100;
}

/** Re-export the default log path so commands/tests can target it explicitly. */
export function runsLogPath(): string {
  return defaultLogPath();
}

/** Join a base dir to the conventional `logs/runs.jsonl` (for the sandbox path). */
export function runsLogPathIn(baseDir: string): string {
  return join(baseDir, "logs", "runs.jsonl");
}
