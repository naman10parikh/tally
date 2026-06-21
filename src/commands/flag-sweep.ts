/**
 * tally flag-sweep — J6 · O10/O11 · BTS-6 · P27. Flag-debt lifecycle.
 *
 * Surface zombie flags (age + last-eval + owner), distinguish temporary(expire)
 * vs permanent(kill-switch), generate a removal diff, and REFUSE to reuse a
 * retired key (tombstone forever — the Knight Capital $440M class). "Deprecate"
 * is THREE steps: ramp 0/100 → remove config → DELETE the code branch.
 *
 * No `any`, named exports only. < 400 lines.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import chalk from "chalk";
import { z } from "zod";
import { emit, refuse } from "./output.js";
import { startRun } from "../observability/run-logger.js";

/** Flag metadata tally sweeps (a `tally-flags.json` ledger, or inferred). */
const FlagMetaSchema = z.object({
  key: z.string(),
  type: z.enum(["temporary", "permanent"]).default("temporary"),
  owner: z.string().optional(),
  /** ISO date the flag was created. */
  createdAt: z.string().optional(),
  /** ISO date of last evaluation (staleness signal). */
  lastEval: z.string().optional(),
  /** ISO expiry for a temporary flag (O10 — debt by construction without one). */
  expiry: z.string().optional(),
});

const LedgerSchema = z.object({
  flags: z.array(FlagMetaSchema).default([]),
  /** Retired keys — NEVER reusable (P27 tombstone). */
  tombstones: z.array(z.string()).default([]),
});

export type FlagMeta = z.infer<typeof FlagMetaSchema>;

export interface FlagSweepOptions {
  dir?: string;
  /** Check whether reusing this key is allowed (refuses if tombstoned). */
  reuse?: string;
  json: boolean;
}

const STALE_DAYS = 90;

function daysSince(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
}

/** Load the flag ledger (tally-flags.json), or an empty one. */
function loadLedger(dir: string): z.infer<typeof LedgerSchema> {
  for (const name of ["tally-flags.json", join(".tally-plan", "flags.json")]) {
    const p = resolve(dir, name);
    if (existsSync(p)) {
      try {
        return LedgerSchema.parse(JSON.parse(readFileSync(p, "utf8")));
      } catch {
        // fall through
      }
    }
  }
  return { flags: [], tombstones: [] };
}

/** Run `tally flag-sweep`. */
export function runFlagSweep(opts: FlagSweepOptions): void {
  const run = startRun("flag-sweep");
  const dir = resolve(opts.dir ?? process.cwd());
  const ledger = loadLedger(dir);

  // The reuse refusal (P27/BTS-6) — fail closed on a recycled key.
  if (opts.reuse) {
    run.tool("reuse.check");
    if (ledger.tombstones.includes(opts.reuse)) {
      run.tool("refuse.key-reuse", false);
      run.finish("refused", "flag key reuse");
      refuse(
        opts.json,
        `flag key "${opts.reuse}" is tombstoned and must NEVER be reused (the Knight Capital class — $440M/45min, P27). Mint a FRESH key; the cost of a fresh key is zero, the cost of reuse is unbounded.`,
        { tombstoned: opts.reuse, freshKeySuggestion: `${opts.reuse}_v2` },
      );
    }
    // Not tombstoned but a live flag with the same key is also reuse.
    if (ledger.flags.some((f) => f.key === opts.reuse)) {
      run.finish("refused", "key in use");
      refuse(opts.json, `flag key "${opts.reuse}" is already in use — pick a unique key.`, { inUse: opts.reuse });
    }
  }

  run.tool("sweep.zombies");
  const zombies = ledger.flags
    .map((f) => {
      const age = daysSince(f.createdAt);
      const sinceEval = daysSince(f.lastEval);
      const expired = f.expiry ? daysSince(f.expiry) !== null && (daysSince(f.expiry) ?? -1) > 0 : false;
      const noExpiry = f.type === "temporary" && !f.expiry;
      const stale =
        f.type === "temporary" &&
        ((sinceEval !== null && sinceEval > STALE_DAYS) || (age !== null && age > STALE_DAYS));
      return {
        key: f.key,
        type: f.type,
        owner: f.owner ?? null,
        ageDays: age,
        lastEvalDays: sinceEval,
        expiry: f.expiry ?? null,
        // Only TEMPORARY flags are debt; kill-switches/entitlement gates live
        // forever and are NOT zombies (O10 — don't conflate the two).
        zombie: f.type === "temporary" && (stale || expired || noExpiry),
        reason: noExpiry ? "no expiry (debt by construction)" : expired ? "past expiry" : stale ? `stale >${STALE_DAYS}d` : "",
      };
    })
    .filter((f) => f.zombie || f.type === "temporary");

  const removable = zombies.filter((z) => z.zombie);

  // The removal diff (Piranha-style): the 3-step deprecation per zombie.
  const removalDiff = removable.map((z) => ({
    key: z.key,
    steps: [
      `1. ramp ${z.key} to 0% (or 100% if fully launched)`,
      `2. remove the flag config / dashboard entry for ${z.key}`,
      `3. DELETE the code branch \`if (flags.${z.key})\` — a flag isn't removed until its branch is (P27)`,
      `4. tombstone "${z.key}" — never reuse the key`,
    ],
  }));

  run.finish("ok");

  const result = {
    dir,
    zombies: zombies.filter((z) => z.zombie),
    temporaryFlags: zombies.length,
    removalDiff,
    tombstones: ledger.tombstones,
    reusedKeys: [] as string[], // populated only by the --reuse refusal path (which exits above)
    trace: run.trace,
  };

  if (opts.json) {
    emit(true, result, "");
    return;
  }
  process.stdout.write(chalk.bold(`tally flag-sweep · ${dir}\n`));
  process.stdout.write(`  temporary flags: ${zombies.length}, zombies: ${chalk.red(String(removable.length))}\n`);
  for (const z of removable) {
    process.stdout.write(chalk.red(`  ⚰ ${z.key} (${z.reason}, owner: ${z.owner ?? "?"})\n`));
  }
  if (ledger.tombstones.length > 0) {
    process.stdout.write(chalk.dim(`  tombstoned (never reuse): ${ledger.tombstones.join(", ")}\n`));
  }
  if (removable.length === 0) process.stdout.write(chalk.green(`  no zombie flags.\n`));
}
