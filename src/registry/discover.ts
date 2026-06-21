/**
 * tally — event + instrumentation discovery over a target directory.
 *
 * `track-plan` and `audit-pii` both need to find what a codebase is ALREADY
 * doing: which event names it captures, which props it sets, where `$set` vs
 * `$set_once` is used, and the four PII hiding places. This module is the shared,
 * dependency-free scanner. It is deliberately conservative (regex over source,
 * not a full AST) — its job is discovery for a HUMAN/agent to register, not to be
 * the API contract (autocapture discipline, O12: a great prior, a terrible
 * contract).
 *
 * No `any`, named exports only.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { extname, join } from "node:path";

/** Source extensions worth scanning for instrumentation calls. */
const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"]);
/** Dirs never worth walking. */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage"]);

/** A discovered event-capture call site. */
export interface DiscoveredEvent {
  /** The event name string as written in code. */
  name: string;
  /** File the call was found in (relative to the scanned root). */
  file: string;
  /** 1-based line number. */
  line: number;
  /** Props object literal keys, if statically extractable. */
  props?: Record<string, unknown>;
}

/** A discovered identity call (`identify`, `$set`, `$set_once`). */
export interface DiscoveredIdentity {
  file: string;
  line: number;
  /** Which operator: a raw identify(), a $set, or a $set_once. */
  op: "identify" | "set" | "set_once";
  /** The property key the operator targeted, if extractable. */
  prop?: string;
  /** The raw matched line (trimmed) for evidence. */
  raw: string;
}

/** Recursively list scannable source files under `dir`. */
function walk(dir: string, root: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, root, out);
    } else if (CODE_EXTS.has(extname(name))) {
      out.push(full);
    }
  }
  return out;
}

/** Match `capture("name"` / `track('name'` / `.capture(\n  "name"` event calls. */
const EVENT_CALL = /\b(?:capture|track)\s*\(\s*['"`]([^'"`]+)['"`]/g;
/** Match `identify(`, `$set_once`, `$set` operators. */
const IDENTIFY_CALL = /\bidentify\s*\(/;
const SET_ONCE = /\$set_once\b/;
const SET_PROP = /\$set\b(?!_once)/;
/** Pull a prop key out of `$set('referral_source'` / `$set: { referral_source:`. */
const SET_KEY = /\$set(?:_once)?\s*[:(]\s*\{?\s*['"]?([A-Za-z0-9_]+)['"]?/;

/**
 * Scan `dir` for event-capture call sites. If the dir contains a declared plan
 * file (`tracking-plan.json` / `events.json`), those names are merged in too —
 * a product brief can declare events explicitly, not just via call sites.
 */
export function discoverEvents(dir: string): DiscoveredEvent[] {
  const out: DiscoveredEvent[] = [];

  // 1. Declared plan files (a product brief's explicit event list).
  for (const planName of ["tracking-plan.json", "events.json"]) {
    const planPath = join(dir, planName);
    if (existsSync(planPath)) {
      try {
        const parsed: unknown = JSON.parse(readFileSync(planPath, "utf8"));
        const names = extractDeclaredNames(parsed);
        for (const name of names) out.push({ name, file: planName, line: 1 });
      } catch {
        // Malformed plan file: skip (track-plan still scans call sites).
      }
    }
  }

  // 2. Call sites in source.
  for (const file of walk(dir, dir)) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      EVENT_CALL.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = EVENT_CALL.exec(lines[i])) !== null) {
        out.push({
          name: m[1],
          file: file.slice(dir.length + 1),
          line: i + 1,
          props: extractInlineProps(lines[i]),
        });
      }
    }
  }
  return out;
}

/** Pull declared event names from a tracking-plan JSON of a few common shapes. */
function extractDeclaredNames(parsed: unknown): string[] {
  if (Array.isArray(parsed)) {
    return parsed
      .map((e) => (typeof e === "string" ? e : isRecord(e) && typeof e.name === "string" ? e.name : null))
      .filter((n): n is string => !!n);
  }
  if (isRecord(parsed)) {
    if (Array.isArray(parsed.events)) return extractDeclaredNames(parsed.events);
    // { "song_played": {...}, "checkout_started": {...} }
    return Object.keys(parsed);
  }
  return [];
}

/** Best-effort: extract a `{ plan: "pro", email: "..." }` literal on one line. */
function extractInlineProps(line: string): Record<string, unknown> | undefined {
  const objMatch = line.match(/\{[^{}]*\}/);
  if (!objMatch) return undefined;
  const props: Record<string, unknown> = {};
  const kv = /['"]?([A-Za-z0-9_]+)['"]?\s*:\s*(['"][^'"]*['"]|true|false|-?\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = kv.exec(objMatch[0])) !== null) {
    const key = m[1];
    const rawVal = m[2];
    props[key] = parseLiteral(rawVal);
  }
  return Object.keys(props).length > 0 ? props : undefined;
}

function parseLiteral(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d/.test(raw)) return Number(raw);
  return raw.slice(1, -1); // strip quotes
}

/** Scan `dir` for identity calls (`identify`/`$set`/`$set_once`). */
export function discoverIdentity(dir: string): DiscoveredIdentity[] {
  const out: DiscoveredIdentity[] = [];
  for (const file of walk(dir, dir)) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const rel = file.slice(dir.length + 1);
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const keyMatch = line.match(SET_KEY);
      const prop = keyMatch?.[1];
      if (SET_ONCE.test(line)) {
        out.push({ file: rel, line: i + 1, op: "set_once", prop, raw: line.trim() });
      } else if (SET_PROP.test(line)) {
        out.push({ file: rel, line: i + 1, op: "set", prop, raw: line.trim() });
      } else if (IDENTIFY_CALL.test(line)) {
        out.push({ file: rel, line: i + 1, op: "identify", raw: line.trim() });
      }
    }
  }
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
