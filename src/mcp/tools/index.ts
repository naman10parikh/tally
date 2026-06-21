/**
 * tally MCP — the 9-tool surface (PLAN §4 "MCP server tool list"). Each tool is
 * a thin, declarative mapping {name, description, Zod inputSchema, argv-builder}
 * over the SAME `tally` CLI command (Q6 CLI-wrapper). The server (server.ts)
 * registers each one and routes calls through `runTallyCli`.
 *
 * This is the vertical's OWN expertise surface — the opinionated, fail-closed
 * operations tally *does* (distinct from the PostHog hosted MCP it *consumes*,
 * which is the query/operate lens, O13). The refusals (peeked winner, SRM fail,
 * reused flag key, PII-leak) survive the MCP hop because the CLI's non-zero exit
 * + `{refused:true}` payload is returned verbatim (run-cli.ts).
 *
 * No `any`, named exports only. Tool defs kept in one module (9 near-identical
 * thin wrappers as separate files would be gold-plating — Karpathy simplicity).
 */

import { z } from "zod";

/** A single MCP tool: its name, human description, input shape, and argv map. */
export interface ToolDef {
  /** The MCP tool name (snake_case, matches PLAN §4). */
  name: string;
  /** One-line description surfaced in `tools/list`. */
  description: string;
  /** Zod raw shape for the tool's input (validated by the SDK before the cb). */
  inputSchema: z.ZodRawShape;
  /** Map validated args → the `tally` CLI argv (the command + flags). */
  toArgv: (args: Record<string, unknown>) => string[];
}

/** Coerce an optional string arg to a `--flag value` pair (or nothing). */
function opt(flag: string, value: unknown): string[] {
  if (value === undefined || value === null || value === "") return [];
  return [flag, String(value)];
}

/** Coerce a props/object arg to a `--props '<json>'` pair (or nothing). */
function jsonOpt(flag: string, value: unknown): string[] {
  if (value === undefined || value === null) return [];
  return [flag, JSON.stringify(value)];
}

/**
 * The 9 tools, in PLAN §4 order. Arg sketches (PLAN §4):
 *  track_plan      { dir, app?, out? }                 → registry + ciCheck + accessors
 *  wire_flag       { key, provider?, target? }         → { wired, evalPath, blastRadius, dryRun }
 *  capture_event   { name, props?, sink? }             → { captured, shape, piiMasked }
 *  check_experiment{ id|spec }                         → { srmPass, peekingSafe, preRegistered, verdict, warnings }
 *  audit_pii       { dir }                             → { findings, maskAllInputs, platforms }
 *  flag_sweep      { dir? }                            → { zombies, removalDiff, reusedKeys }
 *  migrate_plan    { from, to }                        → { dualWrite, idempotencyKey, costModel, deltaCauses }
 *  explain         { id }                              → { situation, trap, resolution, acceptance, source }
 *  search_brain    { query }                           → ranked hits
 */
export const TOOLS: ToolDef[] = [
  {
    name: "track_plan",
    description:
      "Acceptance leg 1 (J1/O1/O2/BTS-1): scan a dir → emit a canonical typed event registry + typed accessors + a CI check that FAILS the build on a case-variant/unregistered/type-mutated event. Returns registryPath, ciCheckPath, typedAccessors, events[].",
    inputSchema: {
      dir: z.string().describe("directory (product brief / codebase) to scan"),
      app: z.string().optional().describe("app name for the generated artifacts"),
      out: z.string().optional().describe("output directory (default: <dir>/.tally-plan)"),
    },
    toArgv: (a) => ["track-plan", String(a.dir), ...opt("--app", a.app), ...opt("--out", a.out)],
  },
  {
    name: "wire_flag",
    description:
      "Acceptance leg 2 (J4/O7/O15/BTS-12/P1/P2): wire a flag through OpenFeature using DB-eval or pinned props — NEVER bare local-eval (refused) — with a blast-radius pre-check + dry-run. Returns { wired, evalPath:'db'|'pinned-props', blastRadius, dryRun }.",
    inputSchema: {
      key: z.string().describe("flag key (lower snake_case)"),
      provider: z.enum(["posthog", "flagd"]).optional().describe("flag provider (default flagd)"),
      target: z.string().optional().describe("targeting key (distinct_id or a property)"),
      pinnedProps: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("pin the FULL property set for a person-property target (avoids the #1 footgun)"),
      dbEval: z.boolean().optional().describe("use DB-backed evaluation"),
      population: z.array(z.string()).optional().describe("sample ids for the blast-radius pre-check"),
    },
    toArgv: (a) => [
      "wire-flag",
      String(a.key),
      ...opt("--provider", a.provider),
      ...opt("--target", a.target),
      ...jsonOpt("--pinned-props", a.pinnedProps),
      ...(a.dbEval === true ? ["--db-eval"] : []),
      ...opt("--population", Array.isArray(a.population) ? (a.population as string[]).join(",") : a.population),
    ],
  },
  {
    name: "capture_event",
    description:
      "Acceptance leg 3 (J2/J3/BTS-2/3/O3/O4/P8): fire a registry-conformant typed event → capture sink with PII masked at the edge + the two-call identify ($set_once acquisition / $set mutable). Returns { captured, shape, piiMasked, droppedKeys, identify }.",
    inputSchema: {
      name: z.string().describe("event name"),
      props: z.record(z.string(), z.unknown()).optional().describe("event properties object"),
      sink: z.enum(["local", "posthog"]).optional().describe("capture sink (default local)"),
      distinctId: z.string().optional().describe("distinct_id to attribute the event to"),
      allow: z.array(z.string()).optional().describe("keys to allow past the PII mask (explicit allowlist)"),
    },
    toArgv: (a) => [
      "capture-event",
      String(a.name),
      ...jsonOpt("--props", a.props),
      ...opt("--sink", a.sink),
      ...opt("--distinct-id", a.distinctId),
      ...opt("--allow", Array.isArray(a.allow) ? (a.allow as string[]).join(",") : a.allow),
    ],
  },
  {
    name: "check_experiment",
    description:
      "THE differentiator (J5/O5/O6/BTS-4/5/16/17/P13-P17): decide an experiment fail-closed — SRM-first (refuse readout on mismatch), peeking guard (refuse a winner before N on a fixed-horizon test; recommend Bayesian/sequential), pre-registration, multiple-comparison. Returns { srmPass, peekingSafe, preRegistered, verdict, warnings }.",
    inputSchema: {
      spec: z.string().describe("experiment spec: a path to a JSON file, or inline JSON"),
    },
    toArgv: (a) => ["check-experiment", String(a.spec)],
  },
  {
    name: "audit_pii",
    description:
      "Scan the four PII hiding places (autocapture input meta / replay DOM / URLs / identify() props) + verify mask-all-then-allowlist across web/iOS/RN + before_send URL-scrub (J3/O4/BTS-2/P8). Returns { findings[], maskAllInputs, platforms }.",
    inputSchema: {
      dir: z.string().describe("directory to audit"),
    },
    toArgv: (a) => ["audit-pii", String(a.dir)],
  },
  {
    name: "flag_sweep",
    description:
      "Surface zombie flags (age + last-eval + owner), distinguish temporary-vs-permanent, emit a removal diff, and REFUSE to reuse a retired/tombstoned key (J6/O10/O11/BTS-6/P27 — the Knight Capital class). Returns { zombies[], removalDiff, reusedKeys }.",
    inputSchema: {
      dir: z.string().optional().describe("directory with the flag ledger"),
      reuse: z.string().optional().describe("check whether reusing this key is allowed (refuses if tombstoned)"),
    },
    toArgv: (a) => ["flag-sweep", ...opt("--dir", a.dir), ...opt("--reuse", a.reuse)],
  },
  {
    name: "migrate_plan",
    description:
      "Plan a provider migration (J8/O16/BTS-7/8/9/14/P19-P22): dual-write + reconcile + EXPLAIN-the-delta (bot-filter / dropped types) + an event-id idempotency key (no silent doubling) + a cost model on the destination axis. Returns { dualWrite, idempotencyKey, costModel, deltaCauses[], derivedAssetsWarning }.",
    inputSchema: {
      from: z.string().describe("source provider (e.g. amplitude)"),
      to: z.string().describe("destination provider (e.g. posthog)"),
    },
    toArgv: (a) => ["migrate-plan", "--from", String(a.from), "--to", String(a.to)],
  },
  {
    name: "explain",
    description:
      "Print a scenario/pitfall/opinion/job by ID (BTS-/P-/O-/J-id) with situation/trap/resolution/acceptance + source. The reasoning-trace tool for an agent.",
    inputSchema: {
      id: z.string().describe("e.g. P27, BTS-4, O6, J5"),
    },
    toArgv: (a) => ["explain", String(a.id)],
  },
  {
    name: "search_brain",
    description:
      "BM25 search over the expertise brain/ (the Memory layer) — ranked pitfalls/scenarios/opinions for a natural-language query.",
    inputSchema: {
      query: z.string().describe("search query"),
      limit: z.number().int().positive().optional().describe("max hits (default 5)"),
    },
    toArgv: (a) => [
      "brain",
      String(a.query),
      ...(typeof a.limit === "number" ? ["--limit", String(a.limit)] : []),
    ],
  },
];

/** The 9 documented tool names (used by tests + the dual-mode HTTP doc). */
export const TOOL_NAMES: string[] = TOOLS.map((t) => t.name);
