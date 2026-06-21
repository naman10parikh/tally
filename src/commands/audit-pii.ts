/**
 * tally audit-pii — J3 · O4 · BTS-2 · P8. Scan the four PII hiding places.
 *
 * The four default PII surfaces: (1) autocapture input meta (`name`/`id`/`class`),
 * (2) replay DOM (form values unless masked), (3) URLs (`$current_url` query
 * strings), (4) `identify()` props. Verify mask-all-then-allowlist
 * (`maskAllInputs:true` + `maskTextSelector:"*"`) across web/iOS/RN + a
 * `before_send` URL-scrub; findings keyed by P-ID. Fail closed BEFORE storage.
 *
 * No `any`, named exports only. < 400 lines.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import chalk from "chalk";
import { discoverIdentity } from "../registry/discover.js";
import { isPiiKey, scrubUrl } from "../capture/pii-mask.js";
import { emit, fail } from "./output.js";
import { startRun } from "../observability/run-logger.js";

/** A single PII finding, keyed by pitfall ID. */
export interface PiiFinding {
  pitfall: "P8";
  surface: "autocapture-input-meta" | "replay-dom" | "url" | "identify-props" | "config";
  severity: "critical" | "warning";
  file: string;
  line: number;
  message: string;
}

export interface AuditPiiOptions {
  json: boolean;
}

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte", ".json"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage"]);

function walk(dir: string, out: string[] = []): string[] {
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
    if (st.isDirectory()) walk(full, out);
    else if (CODE_EXTS.has(extname(name))) out.push(full);
  }
  return out;
}

/** Run `tally audit-pii <dir>`. */
export function runAuditPii(dir: string, opts: AuditPiiOptions): void {
  const run = startRun("audit-pii");
  const target = resolve(dir);
  if (!existsSync(target)) {
    run.finish("error", "dir missing");
    fail(opts.json, `directory not found: ${dir}`);
  }

  const findings: PiiFinding[] = [];
  const files = walk(target);
  let sawReplayConfig = false;
  let maskAllInputs = false;
  let maskTextStar = false;
  let beforeSend = false;
  const platforms = { web: false, ios: false, rn: false };

  run.tool("scan.config");
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const rel = file.slice(target.length + 1);
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // (config) replay masking posture.
      if (/maskAllInputs/.test(line)) {
        sawReplayConfig = true;
        if (/maskAllInputs\s*:\s*true/.test(line)) maskAllInputs = true;
        if (/maskAllInputs\s*:\s*false/.test(line)) {
          findings.push({
            pitfall: "P8",
            surface: "replay-dom",
            severity: "critical",
            file: rel,
            line: i + 1,
            message: "replay config has maskAllInputs:false — masking is opt-out; switch to mask-all-then-allowlist (BTS-2/O4).",
          });
        }
      }
      if (/maskTextSelector\s*:\s*["']\*["']/.test(line)) maskTextStar = true;
      if (/before_send|beforeSend/.test(line)) beforeSend = true;

      // (config) three-platform opt-out signals.
      if (/ph-no-capture|maskAllInputs|session_recording/.test(line)) platforms.web = true;
      if (/accessibilityIdentifier|ph-no-capture.*ios|PostHogConfig.*ios/i.test(line)) platforms.ios = true;
      if (/maskAllTextInputs|ph-no-capture.*native|react-native/i.test(line)) platforms.rn = true;

      // (3 · url) a literal URL with a query string that includes a PII param.
      const urlMatch = line.match(/https?:\/\/[^\s"'`]+\?[^\s"'`]+/);
      if (urlMatch && /[?&](email|token|ssn|phone|card|password)=/i.test(urlMatch[0])) {
        const scrubbed = scrubUrl(urlMatch[0]);
        if (scrubbed !== urlMatch[0]) {
          findings.push({
            pitfall: "P8",
            surface: "url",
            severity: "critical",
            file: rel,
            line: i + 1,
            message: `URL carries PII query params (${urlMatch[0].slice(0, 60)}…) — null \`$current_url\` query via before_send (P8).`,
          });
        }
      }

      // (1 · autocapture input meta) inputs with PII-named name/id without opt-out.
      const inputMatch = line.match(/<input[^>]*\b(?:name|id)\s*=\s*["']([^"']+)["']/i);
      if (inputMatch && isPiiKey(inputMatch[1]) && !/ph-no-capture/.test(line)) {
        findings.push({
          pitfall: "P8",
          surface: "autocapture-input-meta",
          severity: "warning",
          file: rel,
          line: i + 1,
          message: `<input> name/id "${inputMatch[1]}" matches a PII pattern and has no ph-no-capture — autocapture leaks the field identity (P8).`,
        });
      }
    }
  }

  // (4 · identify props) acquisition/identify props with PII keys.
  run.tool("scan.identify");
  for (const id of discoverIdentity(target)) {
    if (id.prop && isPiiKey(id.prop)) {
      findings.push({
        pitfall: "P8",
        surface: "identify-props",
        severity: "warning",
        file: id.file,
        line: id.line,
        message: `identify() ${id.op} prop "${id.prop}" matches a PII pattern — mask/allow-list before sending (P8).`,
      });
    }
  }

  // mask-all-then-allowlist completeness: if replay is configured but not fully
  // masked, that is itself a critical gap.
  if (sawReplayConfig && !(maskAllInputs && maskTextStar)) {
    findings.push({
      pitfall: "P8",
      surface: "config",
      severity: maskAllInputs ? "warning" : "critical",
      file: "(replay config)",
      line: 0,
      message: "replay masking is incomplete — need BOTH maskAllInputs:true AND maskTextSelector:'*' (free text isn't masked by default, BTS-2).",
    });
  }

  run.finish("ok");

  const critical = findings.filter((f) => f.severity === "critical").length;
  const result = {
    dir: target,
    findings,
    critical,
    maskAllInputs,
    maskTextSelector: maskTextStar,
    beforeSendUrlScrub: beforeSend,
    platforms,
    clean: critical === 0,
    trace: run.trace,
  };

  if (opts.json) {
    emit(true, result, "");
    return;
  }
  process.stdout.write(chalk.bold(`tally audit-pii · ${target}\n`));
  process.stdout.write(`  mask-all-then-allowlist: ${maskAllInputs && maskTextStar ? chalk.green("yes") : chalk.red("incomplete")}\n`);
  process.stdout.write(`  before_send URL-scrub:   ${beforeSend ? chalk.green("yes") : chalk.yellow("missing")}\n`);
  process.stdout.write(`  platforms (web/iOS/RN):  ${platforms.web ? "✓" : "✗"}/${platforms.ios ? "✓" : "✗"}/${platforms.rn ? "✓" : "✗"}\n`);
  process.stdout.write(`  findings: ${findings.length} (${critical} critical)\n`);
  for (const f of findings) {
    const c = f.severity === "critical" ? chalk.red : chalk.yellow;
    process.stdout.write(c(`  [${f.surface}] ${f.file}:${f.line} — ${f.message}\n`));
  }
}
