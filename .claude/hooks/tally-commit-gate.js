#!/usr/bin/env node
/**
 * tally — dogfood commit-gate (PreToolUse grep-gate). Hooks component (B8).
 *
 * THE DOGFOOD: the analytics employee's own harness obeys the analytics rules it
 * preaches — and proves the "gate the taxonomy in CI, not a wiki" thesis (O1) on
 * itself. This is a PreToolUse hook on Write|Edit that FAILS CLOSED (blocks the
 * write) when the content introduces an anti-pattern tally preaches against. It
 * is a WALL, not a warning (O5/O20: everything irreversible must be a wall).
 *
 * It greps STANDALONE — no build, no import of the CLI, no network — so it fires
 * the instant a session starts, before `dist/` exists. The seven rules gate the
 * anti-patterns from PLAN/HARNESS-OVERRIDES §5: case-variant event names,
 * `$set`-on-acquisition, reused flag keys, no-expiry/owner temp flags,
 * `maskAllInputs:false`, un-allowlisted PII keys, and `gen_ai.usage` → PostHog.
 * The regexes are kept in lockstep with the CLI source of truth:
 *   - acquisition keys  ← src/identity/identify.ts  ACQUISITION_KEY
 *   - PII keys          ← src/capture/pii-mask.ts    PII_KEY_PATTERN
 *   - snake_case rule   ← src/registry/registry.ts   SNAKE_CASE
 *
 * Input: PreToolUse JSON on stdin — { tool_name, tool_input: { file_path, content } }.
 * Output: on a hit, JSON with hookSpecificOutput.permissionDecision="deny"
 *         (the PreToolUse block contract) + a reason; also appends one line to
 *         .claude/tally-gate.log (the observable side effect). On no hit, exits 0
 *         silently (allow).
 *
 * No `any`-equivalent shortcuts; fail OPEN only on its OWN errors (a broken gate
 * must never wedge the repo), fail CLOSED on a real violation.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";

/** The anti-patterns tally refuses to let into a commit, each → an OPINION/PITFALL. */
const RULES = [
  {
    id: "case-variant-event",
    // A capture/track/$capture call whose event-name string literal is NOT canonical
    // snake_case → the BTS-1 drift class (`Checkout Started` next to `checkout_started`).
    // Canonical = ^[a-z][a-z0-9_]*$ (mirrors src/registry/registry.ts SNAKE_CASE). Fires
    // only when the literal contains a space, a dash, or an uppercase letter (an
    // unambiguous variant), so legit snake_case names pass.
    test: (line) => {
      const m = line.match(/(?:capture|track|\$capture)\s*\(\s*["']([^"']+)["']/);
      if (!m) return false;
      const name = m[1];
      return /^[a-z][a-z0-9_]*$/.test(name) === false && /[A-Z \-]/.test(name);
    },
    why: "this event name is not canonical snake_case — it is a case/format variant (BTS-1/O1/O2). Casing is a semantic boundary; `Checkout Started` next to `checkout_started` is the tragedy-of-the-commons drift. Register the canonical `snake_case` name; alias historical streams at query time, never re-mint.",
  },
  {
    id: "set-on-acquisition",
    // `$set(` (NOT `$set_once(`) carrying an acquisition/first-touch key → BTS-3/O3/P23.
    // Acquisition keys mirror src/identity/identify.ts ACQUISITION_KEY.
    test: (line) =>
      /\$set\s*(?:\(|:)/.test(line) &&
      !/\$set_once/.test(line) &&
      /(referral_source|referrer|utm_|first_touch|first_seen|initial_|acquisition|signup_source|landing_page|original_)/i.test(
        line,
      ),
    why: "`$set` on an acquisition/first-touch prop overwrites the original channel forever — use `$set_once` (O3/BTS-3/P23). Acquisition history is a retroactive-loss class; once overwritten it cannot be recovered.",
  },
  {
    id: "reused-flag-key",
    // A flag key marked reused/recycled, or a TODO to reuse a retired key → O11/P27/BTS-6.
    test: (line) =>
      /(reuse|recycle|re-use)[\w\s-]*flag\s*key/i.test(line) ||
      /flag\s*key[\w\s-]*(reuse|recycle|tombston)/i.test(line),
    why: "never reuse/recycle a retired flag key — tombstone forever and mint a fresh key (O11/P27). A reused deprecated bit + an un-deleted code path is the Knight Capital class ($440M/45min); the cost of a fresh key is zero.",
  },
  {
    id: "flag-no-expiry-owner",
    // A temporary/release flag created without an expiry+owner → O10.
    // Fires when a temp flag is declared but the line has neither expiry nor owner.
    test: (line) =>
      /(temporary|temp|release)\s*flag/i.test(line) &&
      /(createFlag|create_flag|new\s*Flag|addFlag|flag\s*:)/i.test(line) &&
      !/(expiry|expires|expire|owner|ownedBy|owned_by)/i.test(line),
    why: "a temporary flag MUST have an expiry + owner at creation (O10) — without one it is debt by construction. (Permanent kill-switches/entitlement gates are exempt — mark them permanent.)",
  },
  {
    id: "mask-all-inputs-false",
    // Session-replay capture-everything posture → O4/BTS-2/P8.
    test: (line) =>
      /maskAllInputs\s*:\s*false/.test(line) ||
      /maskTextSelector\s*:\s*["'](?:none|)["']/.test(line),
    why: "`maskAllInputs:false` makes replay capture-everything-then-redact — PII is a one-way door (O4/BTS-2/P8). Mask all, then allowlist back by explicit attribute; never the reverse.",
  },
  {
    id: "pii-key-no-allowlist",
    // A PII property key passed into capture/identify without an explicit allowlist → J3/P8.
    // Mirrors src/capture/pii-mask.ts PII_KEY_PATTERN. Fires on a capture/identify/$set
    // call-site carrying a raw PII key, when no allowlist marker is on the line.
    test: (line) =>
      /(capture|identify|\$set|\$set_once)\s*(?:\(|:)/.test(line) &&
      /["']?(email|phone|ssn|social_security|card|cc_number|password|passwd|secret|api_key|dob|date_of_birth)["']?\s*:/i.test(
        line,
      ) &&
      !/(allowlist|allow_list|allowList|pii-ok|pii_ok|@pii-allow)/i.test(line),
    why: "a PII property key (email/phone/ssn/card/password/token/dob) is being captured without an explicit allowlist (J3/P8) — drop/mask it at the edge BEFORE storage, or mark an explicit allowlist. Once stored you cannot un-ring the bell.",
  },
  {
    id: "gen-ai-usage-into-posthog",
    // The cardinal boundary refusal: piping LLM token spend into the product-analytics plane → O18.
    test: (line) =>
      /gen_ai\.usage|gen_ai_usage/i.test(line) &&
      /(posthog|capture\s*\(|product[_\s-]?event)/i.test(line),
    why: "NEVER pipe `gen_ai.usage.*` LLM token spend into PostHog as a product event (O18 — the cardinal boundary refusal). That plane belongs to agentmoney; tally owns product behavior only.",
  },
];

/** Files whose CONTENT we gate. Other files (md/json config/lockfiles) are skipped. */
const GATED_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|kt|swift|energy)$/i;

/** A file is exempt from gating if it's the gate itself, a test, a fixture, or a doc — they legitimately
 * NAME the anti-patterns to test/document them (e.g. this very file, the unit tests, the SKILL.md). */
function isExemptPath(filePath) {
  const p = filePath.replace(/\\/g, "/");
  return (
    /tally-commit-gate\.(js|sh)$/.test(p) ||
    /\.(test|spec)\.[a-z]+$/i.test(p) ||
    /\/(tests?|__tests__|eval\/fixtures|fixtures)\//.test(p) ||
    /\/skills\//.test(p) ||
    /\/brain\//.test(p) ||
    /\.md$/i.test(p)
  );
}

/** Read all of stdin (the PreToolUse payload). */
function readStdin() {
  return new Promise((resolveStdin) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      buf += chunk;
    });
    process.stdin.on("end", () => resolveStdin(buf));
    // If nothing pipes in within a tick, resolve empty (don't hang the tool).
    setTimeout(() => resolveStdin(buf), 2000).unref?.();
  });
}

/** Append one line to the gate log (the observable side effect). Best-effort. */
function logLine(obj) {
  try {
    const dir = process.env.CLAUDE_PROJECT_DIR
      ? resolve(process.env.CLAUDE_PROJECT_DIR, ".claude")
      : resolve(dirname(new URL(import.meta.url).pathname), "..");
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      resolve(dir, "tally-gate.log"),
      `${JSON.stringify({ ts: new Date().toISOString(), ...obj })}\n`,
    );
  } catch {
    // A logging failure must never block or crash the gate.
  }
}

/** Allow the tool call (PreToolUse: silent exit 0 = no objection). */
function allow() {
  process.exit(0);
}

/** Block the tool call with a reason (the deny contract for PreToolUse). */
function deny(reason, hits, filePath) {
  logLine({ decision: "deny", file: basename(filePath || "?"), rules: hits.map((h) => h.id), reason });
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0); // The deny is carried in the JSON; exit 0 so the JSON is honored.
}

async function main() {
  const raw = await readStdin();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    // No/!JSON payload (e.g. invoked manually without stdin) → nothing to gate.
    return allow();
  }

  const tool = payload.tool_name ?? "";
  if (tool !== "Write" && tool !== "Edit" && tool !== "MultiEdit") return allow();

  const input = payload.tool_input ?? {};
  const filePath = String(input.file_path ?? input.filePath ?? "");
  if (filePath && isExemptPath(filePath)) return allow();
  if (filePath && !GATED_EXT.test(filePath)) return allow();

  // Gather the candidate text from Write (content) or Edit (new_string / edits[].new_string).
  const parts = [];
  if (typeof input.content === "string") parts.push(input.content);
  if (typeof input.new_string === "string") parts.push(input.new_string);
  if (Array.isArray(input.edits)) {
    for (const e of input.edits) if (typeof e?.new_string === "string") parts.push(e.new_string);
  }
  const text = parts.join("\n");
  if (!text) return allow();

  const hits = [];
  const lines = text.split("\n");
  for (const rule of RULES) {
    for (const line of lines) {
      if (rule.test(line)) {
        hits.push(rule);
        break; // one hit per rule is enough
      }
    }
  }

  if (hits.length === 0) {
    logLine({ decision: "allow", file: basename(filePath || "?") });
    return allow();
  }

  const reason =
    `tally commit-gate BLOCKED this write — it introduces ${hits.length} anti-pattern(s) tally enforces against:\n` +
    hits.map((h, i) => `  ${i + 1}. [${h.id}] ${h.why}`).join("\n") +
    `\nFix the line(s) above, then re-attempt. (This is the dogfood: tally's own harness obeys tally's rules — a wall, not a warning, O5/O20.)`;
  return deny(reason, hits, filePath);
}

main().catch(() => {
  // The gate failing is not a reason to block legitimate work — fail OPEN on our own bug.
  process.exit(0);
});
