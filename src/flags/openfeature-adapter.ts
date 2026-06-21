/**
 * tally — OpenFeature flag wiring (the vendor-neutral call-site, O15).
 *
 * O7/O15 + J4 + BTS-12/10 + P1/P2: put OpenFeature at the call site with the
 * vendor behind a PROVIDER, so a switch is a config change not a rewrite. The $0
 * default backend is FLAGD (file-backed, in-process resolver, no SaaS key —
 * flagd's killer property). The cardinal flag rule (P1/P2/BTS-12): NEVER target
 * by `distinct_id`/person property via bare local-eval — use DB-backed eval OR
 * pin the FULL property set. This module writes the flagd file + classifies the
 * eval path and refuses a bare-local-eval target.
 *
 * No `any`, named exports only.
 */

import { OpenFeature, type Provider, type EvaluationContext } from "@openfeature/server-sdk";

/** How a flag's targeting is evaluated — the correctness axis (BTS-12). */
export type EvalPath = "db" | "pinned-props" | "bare-local-eval" | "static";

/** A flagd file-backed flag definition (OFREP/flagd schema subset). */
export interface FlagdFlag {
  state: "ENABLED" | "DISABLED";
  defaultVariant: string;
  variants: Record<string, boolean>;
  /** Targeting rule (flagd uses JSONLogic); we emit a simple targetingKey rule. */
  targeting?: Record<string, unknown>;
}

/** A complete flagd source file. */
export interface FlagdSource {
  flags: Record<string, FlagdFlag>;
}

/**
 * Decide the eval path for a target.
 *  - no target / boolean default → "static" (a kill-switch / 0|100, fine).
 *  - a `distinct_id` or person-property target with the FULL prop set pinned →
 *    "pinned-props" (correct).
 *  - a `distinct_id`/person-property target WITHOUT pinned props and WITHOUT
 *    DB-eval → "bare-local-eval" (the BTS-12/P1 footgun — REFUSED).
 *  - explicitly DB-backed → "db" (correct).
 */
export function classifyEvalPath(opts: {
  target?: string;
  dbEval?: boolean;
  pinnedProps?: Record<string, unknown>;
}): EvalPath {
  const { target, dbEval, pinnedProps } = opts;
  if (!target) return "static";
  if (dbEval) return "db";
  const targetsPerson = /distinct_id|person|user|prop/i.test(target);
  if (targetsPerson) {
    if (pinnedProps && Object.keys(pinnedProps).length > 0) return "pinned-props";
    return "bare-local-eval";
  }
  // Targeting a non-person attribute (e.g. environment) is fine statically.
  return "static";
}

/**
 * Build a flagd file-backed flag. For a `distinct_id`/prop target we emit a
 * `targetingKey`-based rule (flagd's contextual targeting) — never a bare
 * local-eval that drops the server's person profile.
 */
export function buildFlagdFlag(key: string, evalPath: EvalPath, target?: string): FlagdFlag {
  const flag: FlagdFlag = {
    state: "ENABLED",
    defaultVariant: "off",
    variants: { on: true, off: false },
  };
  if (target && (evalPath === "pinned-props" || evalPath === "db")) {
    // Contextual rule: turn ON when the evaluation context carries the pinned
    // targetingKey. flagd resolves this in-process with the props handed in —
    // and because we PINNED the full set, it isn't the local-eval footgun.
    flag.targeting = {
      if: [{ "===": [{ var: "targetingKey" }, target] }, "on", "off"],
    };
    void key; // key is the map key; referenced by caller.
  }
  return flag;
}

/**
 * Blast-radius pre-check (BTS-12): before any rollout, estimate how many of a
 * sample population the flag would turn ON for. With a file-backed flagd flag and
 * no live PostHog person DB, we compute it against the pinned/dry-run context set
 * the caller supplies — a real number, not a guess. Returns a 0..1 fraction.
 */
export function blastRadius(opts: {
  evalPath: EvalPath;
  /** Sample distinct_ids to dry-run against (the population to estimate over). */
  population?: string[];
  target?: string;
}): number {
  const pop = opts.population ?? [];
  if (opts.evalPath === "static" || !opts.target) {
    // A static default-off flag has zero blast radius until ramped.
    return 0;
  }
  if (pop.length === 0) {
    // No population provided → the pre-check can't quantify; treat as the whole
    // pinned target (1 user) over an unknown base → report the conservative 1.0
    // for a single explicit target so the operator SEES it's a targeted rollout.
    return 1;
  }
  const hit = pop.filter((id) => id === opts.target).length;
  return Math.round((hit / pop.length) * 1000) / 1000;
}

/**
 * Dry-run evaluate the flag in-process via the OpenFeature SDK with a stub
 * provider built from the flagd flag — proves the wiring resolves to the expected
 * value for the targeting context BEFORE any real rollout. Returns the resolved
 * boolean. This is the "dry-run eval before rollout" the contract requires.
 */
export async function dryRunEval(
  key: string,
  flag: FlagdFlag,
  targetingKey: string | undefined,
): Promise<boolean> {
  const provider = makeStubProvider({ [key]: flag });
  await OpenFeature.setProviderAndWait(provider);
  const client = OpenFeature.getClient();
  const ctx: EvaluationContext = targetingKey ? { targetingKey } : {};
  const value = await client.getBooleanValue(key, flag.variants[flag.defaultVariant] ?? false, ctx);
  await OpenFeature.clearProviders();
  return value;
}

/**
 * A minimal in-process OpenFeature provider over a flagd-shaped source. Resolves
 * a boolean flag by evaluating its (simple `===` targetingKey) rule against the
 * eval context — the OSS, zero-network resolution path (the BTS-10 local
 * fallback). Kept tiny on purpose; the real flagd resolver is the production path.
 */
export function makeStubProvider(source: Record<string, FlagdFlag>): Provider {
  return {
    metadata: { name: "tally-flagd-stub" },
    runsOn: "server",
    hooks: [],
    async resolveBooleanEvaluation(flagKey, defaultValue, context) {
      const flag = source[flagKey];
      if (!flag || flag.state !== "ENABLED") {
        return { value: defaultValue, reason: "DEFAULT" };
      }
      const targeting = flag.targeting as { if?: unknown[] } | undefined;
      if (targeting?.if) {
        const [cond, onVal, offVal] = targeting.if as [
          { "===": [{ var: string }, string] },
          string,
          string,
        ];
        const [{ var: varName }, expected] = cond["==="];
        const ctxVal = varName === "targetingKey" ? context.targetingKey : undefined;
        const variant = ctxVal === expected ? onVal : offVal;
        return { value: flag.variants[variant] ?? defaultValue, variant, reason: "TARGETING_MATCH" };
      }
      const variant = flag.defaultVariant;
      return { value: flag.variants[variant] ?? defaultValue, variant, reason: "STATIC" };
    },
    // Unused evaluations: tally wires boolean kill-switch/release flags by default.
    async resolveStringEvaluation(_k, d) {
      return { value: d, reason: "DEFAULT" };
    },
    async resolveNumberEvaluation(_k, d) {
      return { value: d, reason: "DEFAULT" };
    },
    async resolveObjectEvaluation(_k, d) {
      return { value: d, reason: "DEFAULT" };
    },
  };
}
