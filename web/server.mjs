#!/usr/bin/env node
/**
 * web/server.mjs — tally cockpit HTTP server (G1, PLAN §10, DECISIONS D3).
 *
 * Zero-dependency Node stdlib `node:http` server (NOT Python — tally is a pnpm/Node repo; this is
 * the faithful adaptation of the "proven sentinel/talent-intel stdlib pattern" to the repo's actual
 * toolchain, the same call canary's Cluster G made — and the same single-source-of-truth discipline
 * tally's MCP server uses: every data view shells the SAME `tally` CLI the cockpit wraps, so the
 * cockpit can never drift from the CLI, O2's dedup-ledger principle applied to tally itself).
 * No build step. Serves the vanilla-JS SPA + routes read-only JSON endpoints.
 *
 * READ-MOSTLY (PLAN Q7 / DECISIONS D3): the server NEVER creates a flag, fires a capture, or
 * declares a winner from the browser. The only CLI it shells is the read/analyze surface —
 * `tally brain`, `tally explain`, `tally check-experiment` (a pure analyzer over a committed spec —
 * no provider mutation), `tally flag-sweep` (a pure read of the flag ledger), and `tally track-plan`
 * scaffolded into a throwaway temp dir and read back (a pure read of tally's deterministic generator
 * output — no provider, no creds). All other views are plain file reads (brain/*.md, logs/runs.jsonl).
 *
 * Security:
 *   - Static files are served only from web/ (resolve + prefix-check → path-traversal guard).
 *   - The brain query + explain ID + experiment fixture name flow to the CLI as an argv ARRAY via
 *     spawnSync (never a shell string), and the explain ID + fixture name are validated against a
 *     strict allow-pattern / allow-list first.
 *   - Bound to 127.0.0.1 only; no auth (the chairman's eyes only, D3).
 *   - Only GET/HEAD accepted (Q7 — no mutate-from-browser); a POST to a data endpoint is a 405.
 *
 * Error contract: a typed JSON body {error} always; 400 bad input, 404 not found, 502 CLI failure,
 * 504 CLI timeout, 500 otherwise. The server boots even if dist/ is unbuilt — the CLI shim falls
 * back to tsx, but if neither resolves the endpoints return an honest 502, never a crash.
 */

import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, extname } from "node:path";
import { tmpdir } from "node:os";

// ----------------------------------------------------------------- bootstrap ---
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), ".."); // web/ → repo root
const WEB = join(REPO, "web");
// The cockpit shells the `tally` binary shim — it prefers dist/cli/index.js but falls back to tsx in
// a dev checkout, so the cockpit works with or without a build (matches bin/tally.js's own logic).
const BIN = join(REPO, "bin", "tally.js");
const PORT = Number(process.env.TALLY_WEB_PORT ?? "7788");
const HOST = "127.0.0.1";

/** The six brain artifacts, in the stable display order (mirrors brain/MOC + bm25 ID patterns). */
const BRAIN_FILES = [
  "EXPERTISE-MAP.md",
  "OPINIONS.md",
  "KNOWN-PITFALLS.md",
  "BATTLE-TESTED-SCENARIOS.md",
  "TOOL-MATRIX.md",
  "GAPS-AND-DISPUTES.md",
];

/**
 * The committed experiment fixtures the Experiment-decisions view renders (the differentiator).
 * An allow-list — the `spec` query param is matched against these names only, never an arbitrary
 * path (no traversal, no shell). Each is a real fixture under eval/fixtures/ the eval suite uses.
 */
const EXPERIMENT_FIXTURES = {
  "peeked-test": "the PM peeks a fixed-horizon test on day 3 (BTS-4)",
  "srm-fail": "a 52/48 split at N=400k — sample-ratio mismatch (BTS-5)",
  "valid-experiment": "a pre-registered Bayesian experiment, read safely",
  "segment-fishing": "20 segment readouts, one 'significant' (BTS-17)",
  "cuped-one-shot": "CUPED applied to a one-shot metric (BTS-16)",
};

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/** A carried HTTP status for the error contract. */
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ------------------------------------------------------------------- helpers ---

/**
 * Run the tally CLI with the given argv (array — never a shell string). Returns parsed JSON.
 * `timeoutMs` defaults to 30s (plenty for explain / check-experiment / flag-sweep / track-plan) —
 * pass a larger value for the BM25 brain search.
 *
 * The CLI exits non-zero on a REFUSAL (rc=3 for a peeked winner / SRM-fail / tombstoned key) — that
 * is a SUCCESSFUL analysis, not a failure, and its stdout carries the `{refused:true, ...}` JSON we
 * want to render. So we never treat a non-zero rc as an error here; we only fail on non-parseable
 * stdout. (This mirrors the enforcer contract O20 — the refusal IS the product.)
 */
function runTallyJson(args, timeoutMs = 30_000) {
  if (!existsSync(BIN)) {
    throw new ApiError(502, `tally binary missing — looked for ${BIN}`);
  }
  const res = spawnSync(process.execPath, [BIN, ...args, "--json"], {
    cwd: REPO,
    encoding: "utf8",
    timeout: timeoutMs,
  });
  if (res.error && res.error.code === "ETIMEDOUT") {
    throw new ApiError(504, `tally CLI timed out after ${timeoutMs}ms: ${args.join(" ")}`);
  }
  if (res.signal === "SIGTERM") {
    throw new ApiError(504, `tally CLI was killed (timeout ${timeoutMs}ms): ${args.join(" ")}`);
  }
  if (res.error) throw new ApiError(502, `tally CLI failed: ${res.error.message}`);
  // tally's `--json` output is a single PRETTY-PRINTED JSON document (multi-line, no pino prelude),
  // so parse the whole trimmed stdout. If anything precedes/follows the document, fall back to the
  // first-`{`…last-`}` slice. (A line-by-line "last { line" heuristic does NOT work for pretty JSON.)
  const out = (res.stdout ?? "").trim();
  if (!out) {
    throw new ApiError(502, `tally CLI emitted no output (rc=${res.status}): ${(res.stderr ?? "").slice(0, 200)}`);
  }
  try {
    return JSON.parse(out);
  } catch {
    const first = out.indexOf("{");
    const last = out.lastIndexOf("}");
    if (first !== -1 && last > first) {
      try {
        return JSON.parse(out.slice(first, last + 1));
      } catch {
        /* fall through to the typed error */
      }
    }
    throw new ApiError(502, "tally CLI emitted unparseable JSON");
  }
}

/** Read a brain artifact's raw markdown (one of the six — never an arbitrary path). */
function readBrainFile(name) {
  if (!BRAIN_FILES.includes(name)) throw new ApiError(400, `not a brain artifact: ${name}`);
  const p = join(REPO, "brain", name);
  if (!existsSync(p)) throw new ApiError(404, `brain artifact missing: ${name}`);
  return readFileSync(p, "utf8");
}

/**
 * Tail the last N lines of logs/runs.jsonl as parsed wide-events (newest first). tally's logger
 * writes `trace` as an object `{id}` and `toolCalls` as an array of `{name, ok}` — normalize both to
 * cockpit-friendly scalars (traceId string + toolCalls count) so the SPA renders without surprises.
 */
function readRunLog(limit = 60) {
  const p = join(REPO, "logs", "runs.jsonl");
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, "utf8").split("\n").filter((l) => l.trim().startsWith("{"));
  const tail = lines.slice(-limit).reverse();
  const rows = [];
  for (const line of tail) {
    try {
      const r = JSON.parse(line);
      const traceId = r.trace && typeof r.trace === "object" ? r.trace.id : r.trace ?? "";
      const toolCount = Array.isArray(r.toolCalls) ? r.toolCalls.length : (r.toolCalls ?? 0);
      rows.push({
        ts: r.ts ?? "",
        command: r.command ?? "",
        model: r.model ?? "",
        durationMs: typeof r.durationMs === "number" ? r.durationMs : null,
        traceId: traceId ?? "",
        toolCount,
        outcome: r.outcome ?? "",
        note: r.note ?? "",
      });
    } catch {
      /* skip a corrupt line — the run log is append-only but be defensive */
    }
  }
  return rows;
}

/**
 * Scaffold the tracking-plan registry by running `tally track-plan` over the committed sample-app
 * fixture into a throwaway temp dir, then read the registry back. This is a pure read of tally's
 * deterministic J1 generator output (the same artifact the acceptance test gates) — no provider, no
 * creds, no mutation (mirrors canary's scaffoldSloPreview pattern). The CI-check ARTIFACT existing is
 * what makes the taxonomy "code, not docs" (O1) — we report its path + existence as the gate status.
 */
function trackingPlanPreview() {
  const sampleApp = join(REPO, "eval", "fixtures", "sample-app");
  if (!existsSync(sampleApp)) throw new ApiError(404, "sample-app fixture missing (eval/fixtures/sample-app)");
  const out = mkdtempSync(join(tmpdir(), "tally-plan-"));
  try {
    const summary = runTallyJson(["track-plan", sampleApp, "--app", "demo", "--out", out]);
    // Read the full registry (typed props) back from the generated file.
    let registry = null;
    if (summary.registryPath && existsSync(summary.registryPath)) {
      try {
        registry = JSON.parse(readFileSync(summary.registryPath, "utf8"));
      } catch {
        /* keep registry null — the summary still carries the event list */
      }
    }
    const ciCheckExists = Boolean(summary.ciCheckPath && existsSync(summary.ciCheckPath));
    return {
      app: summary.app ?? "demo",
      casing: registry?.casing ?? "snake_case",
      events: registry?.events ?? summary.events ?? [],
      discovered: summary.discovered ?? (summary.events?.length ?? 0),
      mergedVariants: summary.mergedVariants ?? [],
      ciCheck: { present: ciCheckExists, path: summary.ciCheckPath ?? null },
      typedAccessors: Boolean(summary.typedAccessors),
    };
  } finally {
    rmSync(out, { force: true, recursive: true });
  }
}

/** Run `tally check-experiment` on a committed fixture (allow-listed). The refusal IS the product. */
function experimentDecision(name) {
  if (!Object.prototype.hasOwnProperty.call(EXPERIMENT_FIXTURES, name)) {
    throw new ApiError(400, `not a known experiment fixture: ${name}`);
  }
  const spec = join(REPO, "eval", "fixtures", `${name}.json`);
  if (!existsSync(spec)) throw new ApiError(404, `fixture missing: ${name}.json`);
  const result = runTallyJson(["check-experiment", spec]);
  return { fixture: name, label: EXPERIMENT_FIXTURES[name], result };
}

/** The full set of experiment decisions (the differentiator view renders all of them). */
function allExperimentDecisions() {
  return Object.keys(EXPERIMENT_FIXTURES).map((name) => experimentDecision(name));
}

/** Run `tally flag-sweep` over the committed flag-ledger fixture (a pure read of the ledger). */
function flagHealth() {
  const ledger = join(REPO, "eval", "fixtures", "flag-ledger");
  const args = existsSync(ledger) ? ["flag-sweep", "--dir", ledger] : ["flag-sweep"];
  return runTallyJson(args);
}

// -------------------------------------------------------------------- routes ---

function apiBrain(query) {
  const q = (query ?? "").trim();
  if (!q) throw new ApiError(400, "missing query (?q=)");
  if (q.length > 200) throw new ApiError(400, "query too long");
  // argv array — the query never touches a shell. The BM25 search over the full corpus can be slow;
  // allow a generous window so a cold corpus still completes (the default 30s could kill it).
  return runTallyJson(["brain", q], 120_000);
}

function apiExplain(id) {
  const raw = (id ?? "").trim();
  // Strict ID shapes: BTS-<n> | P<n> | O<n>[a-z] | J<n> | [A-E]<n> (the GAPS sections). Reject else.
  if (!/^(BTS-\d+|P\d+|O\d+[a-z]?|J\d+|[A-Ea-e]\d+)$/.test(raw)) {
    throw new ApiError(400, `not a valid brain ID: ${raw} (expected BTS-4, P27, O6, J5, or A3)`);
  }
  return runTallyJson(["explain", raw]);
}

function serveStatic(req, res, pathname) {
  // Map "/" → index.html; resolve and confine to web/.
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const target = resolve(WEB, rel);
  if (target !== WEB && !target.startsWith(WEB + "/")) {
    res.writeHead(403, { "content-type": "text/plain" });
    res.end("forbidden");
    return;
  }
  if (!existsSync(target)) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }
  const type = STATIC_TYPES[extname(target)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  res.end(readFileSync(target));
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(payload);
}

const server = createServer((req, res) => {
  try {
    // Read-only surface: only GET (+HEAD) is accepted (Q7 — no mutate-from-browser).
    if (req.method !== "GET" && req.method !== "HEAD") {
      throw new ApiError(405, "read-only cockpit — only GET is allowed (PLAN Q7 / DECISIONS D3)");
    }
    const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
    const p = url.pathname;

    if (p === "/api/health") return sendJson(res, 200, { ok: true, repo: "tally", cli: existsSync(BIN) });
    if (p === "/api/brain-files") return sendJson(res, 200, { files: BRAIN_FILES });
    if (p === "/api/brain-file") return sendJson(res, 200, { name: url.searchParams.get("name"), markdown: readBrainFile(url.searchParams.get("name")) });
    if (p === "/api/brain") return sendJson(res, 200, apiBrain(url.searchParams.get("q")));
    if (p === "/api/explain") return sendJson(res, 200, apiExplain(url.searchParams.get("id")));
    if (p === "/api/runs") return sendJson(res, 200, { runs: readRunLog(Number(url.searchParams.get("limit") ?? "60")) });
    if (p === "/api/tracking-plan") return sendJson(res, 200, trackingPlanPreview());
    if (p === "/api/experiments") return sendJson(res, 200, { decisions: allExperimentDecisions() });
    if (p === "/api/flags") return sendJson(res, 200, flagHealth());

    // Anything else is a static asset request.
    return serveStatic(req, res, p);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof Error ? err.message : String(err);
    sendJson(res, status, { error: message });
  }
});

server.listen(PORT, HOST, () => {
  // One structured line — tally dogfoods its own run telemetry; emit a clean machine line.
  process.stdout.write(
    JSON.stringify({ event: "cockpit.listening", url: `http://${HOST}:${PORT}`, cli: existsSync(BIN) }) + "\n",
  );
});

// Honest shutdown on SIGINT/SIGTERM (the serve.sh launcher + Playwright webServer both send these).
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
