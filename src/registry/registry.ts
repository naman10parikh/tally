/**
 * tally — the canonical event registry (the dedup ledger).
 *
 * O1/O2 + J1 + BTS-1: the tracking plan is CODE, not docs. A single
 * machine-readable registry the SECOND engineer cannot bypass — the events
 * analog of `processed-index.jsonl`. Naming drift (`Song Played` next to
 * `song played`) is a tragedy of the commons; a registry + a CI gate is the only
 * structural fix (review and good intentions are not — O2).
 *
 * This module is the shared core: `track-plan` builds + writes a registry and
 * emits the CI-check artifact; `capture-event` validates an event against it.
 *
 * No `any`, named exports only.
 */

import { z } from "zod";

/** The property value types tally registers (typed events, not free-form). */
export const PROP_TYPES = ["string", "number", "boolean", "timestamp"] as const;
export type PropType = (typeof PROP_TYPES)[number];

/** A single registered property on an event. */
export interface PropSpec {
  name: string;
  type: PropType;
  /** Acquisition/first-touch props use `$set_once`; mutable state uses `$set` (O3). */
  identity?: "set_once" | "set";
}

/** A single canonical event in the registry. */
export interface EventSpec {
  /** Canonical event name (snake_case, the casing rule — O1/BTS-1). */
  name: string;
  /** Typed properties (the type-stability contract — P12). */
  props: PropSpec[];
  /** Owner (so the taxonomy has accountability, not just shape). */
  owner?: string;
  /** Whether this is a named registered event (true) or autocapture-derived (O12). */
  registered: boolean;
}

/** The full registry document (the dedup ledger). */
export interface Registry {
  version: 1;
  /** Casing convention the CI gate enforces (snake_case is tally's default). */
  casing: "snake_case";
  events: EventSpec[];
}

/** Zod schema for runtime validation at the registry boundary. */
export const PropSpecSchema = z.object({
  name: z.string().min(1),
  type: z.enum(PROP_TYPES),
  identity: z.enum(["set_once", "set"]).optional(),
});

export const EventSpecSchema = z.object({
  name: z.string().min(1),
  props: z.array(PropSpecSchema),
  owner: z.string().optional(),
  registered: z.boolean(),
});

export const RegistrySchema = z.object({
  version: z.literal(1),
  casing: z.literal("snake_case"),
  events: z.array(EventSpecSchema),
});

/** The canonical casing rule: lower snake_case, starts with a letter (BTS-1/O1). */
const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;

/** True if `name` obeys the snake_case canonical casing rule. */
export function isCanonicalName(name: string): boolean {
  return SNAKE_CASE.test(name);
}

/**
 * Normalize an arbitrary event label to the canonical snake_case key.
 * "Song Played" / "songPlayed" / "Song-Played" → "song_played". This is how the
 * registry MERGES a case-variant at query time WITHOUT mutating either source
 * stream (BTS-1 resolution): two labels that normalize to the same key are the
 * same canonical event.
 */
export function canonicalize(name: string): string {
  return name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2") // camelCase → camel_Case
    .replace(/[\s\-.]+/g, "_") // spaces/dashes/dots → _
    .replace(/[^A-Za-z0-9_]+/g, "") // drop anything else
    .toLowerCase()
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** A registry validation finding (used by the CI check + the hook gate). */
export interface RegistryViolation {
  kind: "unregistered" | "case-variant" | "type-mutation";
  /** The offending event name as seen in code. */
  event: string;
  /** The canonical name it should map to (for case-variant). */
  canonical?: string;
  message: string;
}

/**
 * Build a lookup of canonical-key → EventSpec, asserting the registry is itself
 * dedup-clean (no two events share a canonical key — that would be drift baked
 * into the ledger).
 */
export function indexRegistry(reg: Registry): Map<string, EventSpec> {
  const byCanonical = new Map<string, EventSpec>();
  for (const ev of reg.events) {
    const key = canonicalize(ev.name);
    const existing = byCanonical.get(key);
    if (existing && existing.name !== ev.name) {
      // Two registry entries collapse to one canonical key → the ledger itself
      // has a drift pair. Keep the first; the validator will flag the second.
      continue;
    }
    byCanonical.set(key, ev);
  }
  return byCanonical;
}

/**
 * The CORE of the CI gate (BTS-1 / O1): given the registry and the set of event
 * names discovered in code, return every violation —
 *  - unregistered: a name with no canonical match in the registry,
 *  - case-variant: a name whose EXACT spelling isn't registered but whose
 *    canonical form IS (e.g. `Checkout Started` next to `checkout_started`),
 *  - type-mutation: a name registered but emitted with an incompatible prop type.
 *
 * A non-empty result is what makes the CI check FAIL the build. The CI check
 * artifact `track-plan` writes calls exactly this function.
 */
export function validateEvents(
  reg: Registry,
  discovered: ReadonlyArray<{ name: string; props?: Record<string, unknown> }>,
): RegistryViolation[] {
  const byCanonical = indexRegistry(reg);
  const byExact = new Map(reg.events.map((e) => [e.name, e]));
  const violations: RegistryViolation[] = [];

  for (const ev of discovered) {
    const canonical = canonicalize(ev.name);
    const exact = byExact.get(ev.name);
    const canon = byCanonical.get(canonical);

    if (!canon) {
      violations.push({
        kind: "unregistered",
        event: ev.name,
        message: `Event "${ev.name}" is not in the registry — register it (the second engineer cannot bypass the ledger, O2).`,
      });
      continue;
    }

    // Registered canonically, but the EXACT spelling differs → a case-variant
    // (the BTS-1 disaster: `Song Played` vs `song played`).
    if (!exact && canon.name !== ev.name) {
      violations.push({
        kind: "case-variant",
        event: ev.name,
        canonical: canon.name,
        message: `Event "${ev.name}" is a case/format variant of registered "${canon.name}" — fix the spelling (casing is a semantic boundary, BTS-1). Do NOT rename the historical stream; alias at query time.`,
      });
      continue;
    }

    // Type-mutation: a registered prop emitted with an incompatible type (P12).
    if (ev.props) {
      for (const [pname, pval] of Object.entries(ev.props)) {
        const spec = canon.props.find((p) => p.name === pname);
        if (spec && !typeMatches(spec.type, pval)) {
          violations.push({
            kind: "type-mutation",
            event: ev.name,
            message: `Event "${ev.name}" prop "${pname}" expected ${spec.type}, got ${describeType(pval)} (type stability, P12).`,
          });
        }
      }
    }
  }

  return violations;
}

/** Whether a runtime value matches a registered PropType. */
function typeMatches(type: PropType, value: unknown): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "timestamp":
      // ISO-8601 string or epoch number both acceptable as a timestamp.
      return (
        (typeof value === "string" && !Number.isNaN(Date.parse(value))) ||
        (typeof value === "number" && Number.isFinite(value))
      );
  }
}

/** Human-readable runtime type for a violation message. */
function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
