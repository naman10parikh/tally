/**
 * tally capture-event — THE acceptance test (leg 3). J2/J3 · O3/O4 · BTS-2/3 · P8.
 *
 * Fire a registry-conformant, typed event into the capture sink (local file
 * default) with PII MASKED at the edge + the two-call `identify()` pattern
 * (`$set_once` acquisition / `$set` mutable). A planted `email`/`phone`/`card`
 * prop is dropped/masked BEFORE storage. Verifiable — the event is readable back
 * from the sink (captured verifiably, not capture-attempted).
 *
 * No `any`, named exports only. < 400 lines.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { canonicalize, type Registry, RegistrySchema } from "../registry/registry.js";
import { maskProps } from "../capture/pii-mask.js";
import { captureToSink, defaultSinkPath, lastCaptured, type CapturedEvent } from "../capture/local-sink.js";
import { buildIdentify } from "../identity/identify.js";
import { parsePropsArg, emit, fail } from "./output.js";
import { startRun } from "../observability/run-logger.js";

/** Options for `tally capture-event`. */
export interface CaptureEventOptions {
  props?: string;
  sink: "local" | "posthog";
  /** distinct_id to attribute the event to (default: an anonymous id). */
  distinctId?: string;
  /** Registry to validate against (default: ./.tally-plan/registry.json if present). */
  registry?: string;
  /** Sink file (default: .capture/events.jsonl). */
  out?: string;
  /** Comma-separated keys to ALLOW past the PII mask (the explicit allowlist). */
  allow?: string;
  json: boolean;
}

/** Load a registry file if present (capture is registry-conformant when one exists). */
function loadRegistry(registryPath: string | undefined): Registry | null {
  const candidates = registryPath
    ? [resolve(registryPath)]
    : [resolve(process.cwd(), ".tally-plan", "registry.json"), resolve(process.cwd(), "registry.json")];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return RegistrySchema.parse(JSON.parse(readFileSync(p, "utf8")));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Run `tally capture-event <name>`. */
export function runCaptureEvent(name: string, opts: CaptureEventOptions): void {
  const run = startRun("capture-event");

  // Canonicalize to the registry casing rule (so capture can't introduce a
  // variant the CI gate would later reject — O1/BTS-1).
  const canonical = canonicalize(name);
  if (!canonical) {
    run.finish("error", "empty event name");
    fail(opts.json, `event name "${name}" canonicalizes to empty`);
  }

  // Only the local sink is built. Fail before anything runs, so no other sink is ever reported
  // as "captured" while nothing was sent or stored.
  if (opts.sink !== "local") {
    run.finish("error", `sink "${opts.sink}" not built`);
    fail(
      opts.json,
      opts.sink === "posthog"
        ? "the PostHog sink is not built yet, so nothing was sent or stored. Use --sink local (the default)."
        : `unknown sink "${String(opts.sink)}". Use --sink local (the default).`,
    );
  }

  const rawProps = parsePropsArg(opts.json, opts.props);
  const allowlist = new Set(
    (opts.allow ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );

  // Registry conformance (when a registry exists): warn-and-canonicalize, never
  // silently store a mismatched name. The CI gate is the hard block; capture
  // canonicalizes so it stays conformant.
  run.tool("registry.conform");
  const reg = loadRegistry(opts.registry);
  const registered = reg ? reg.events.some((e) => e.name === canonical) : null;

  // PII MASK at the edge, BEFORE storage (O4/P8 — fail closed, one-way door).
  run.tool("pii.mask");
  const { masked, droppedKeys } = maskProps(rawProps, allowlist);

  // Two-call identify(): route acquisition props to `$set_once` (O3/BTS-3). We
  // mask the identify props too — acquisition props can also carry PII.
  const identify = buildIdentify(opts.distinctId ?? "anon", maskProps(rawProps, allowlist).masked);

  const distinctId = opts.distinctId ?? "anon";
  const captured: CapturedEvent = {
    ts: new Date().toISOString(),
    event: canonical,
    distinctId,
    properties: masked,
  };

  const sinkPath = opts.sink === "local" ? resolve(opts.out ?? defaultSinkPath()) : defaultSinkPath();

  if (opts.sink === "local") {
    run.tool("sink.capture");
    captureToSink(captured, sinkPath);
    // Read back to PROVE it landed (captured verifiably).
    const readBack = lastCaptured(canonical, sinkPath);
    if (!readBack) {
      run.finish("error", "capture not readable back");
      fail(opts.json, `capture-event wrote to the sink but the event could not be read back`);
    }
  }

  run.finish("ok");

  const result = {
    captured: true,
    event: canonical,
    sink: opts.sink,
    sinkPath: opts.sink === "local" ? sinkPath : null,
    piiMasked: droppedKeys.length > 0,
    droppedKeys,
    identify: {
      // $set_once carries acquisition props; $set carries mutable state (O3).
      setOnceKeys: Object.keys(identify.$set_once),
      setKeys: Object.keys(identify.$set),
    },
    registered, // true | false | null (no registry present)
    shape: Object.fromEntries(Object.entries(masked).map(([k, v]) => [k, typeof v])),
    trace: run.trace,
  };

  if (opts.json) {
    emit(true, result, "");
    return;
  }
  process.stdout.write(chalk.bold(`tally capture-event · ${canonical}\n`));
  process.stdout.write(`  sink:       ${chalk.cyan(opts.sink)}${result.sinkPath ? " " + chalk.dim(result.sinkPath) : ""}\n`);
  process.stdout.write(`  PII masked: ${droppedKeys.length > 0 ? chalk.green(droppedKeys.join(", ")) : chalk.dim("none present")}\n`);
  if (result.identify.setOnceKeys.length > 0) {
    process.stdout.write(`  $set_once:  ${chalk.green(result.identify.setOnceKeys.join(", "))} ${chalk.dim("(acquisition — never overwritten, O3)")}\n`);
  }
  if (registered === false) {
    process.stdout.write(chalk.yellow(`  warning: "${canonical}" is not in the registry — run \`tally track-plan\` to register it.\n`));
  }
}
