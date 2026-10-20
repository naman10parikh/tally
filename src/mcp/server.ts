#!/usr/bin/env node
/**
 * tally MCP server (Component 7). tally's OWN server exposing the
 * product-analytics + flags + experiments vertical's *expertise operations* —
 * the opinionated, fail-closed ops tally DOES — distinct from the PostHog hosted
 * MCP it CONSUMES (the query/operate lens, O13). 9 tools (PLAN §4), each a thin
 * wrapper over the `tally` CLI (Q6 stdio CLI-wrapper).
 *
 * Dual-mode (HARNESS-OVERRIDES §7):
 *   • stdio (PRIMARY) — `node dist/mcp/server.js` → the local dev-tool path that
 *     `.mcp.json` launches. This is what `tools/list`/`tools/call` exercise.
 *   • Streamable-HTTP (the hosted variant) — `createHttpServer()` is exported +
 *     documented; run with `MCP_HTTP=1 node dist/mcp/server.js`. Kept minimal
 *     (documented, not over-built — Q6).
 *
 * Boundary (O18): every tool is product-analytics/flags/experiments ONLY. tally
 * NEVER exposes an LLM-token-cost op (agentmoney's plane) or an app-health op
 * (canary's plane). The tool list is the boundary made executable.
 *
 * No `any`, named exports only.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { TOOLS } from "./tools/index.js";
import { runTallyCli } from "./run-cli.js";

/** Server identity advertised on `initialize`. */
const SERVER_INFO = { name: "tally", version: "0.1.0" } as const;

/**
 * Build a fully-wired `McpServer` with all 9 tools registered. Each tool's
 * callback maps its args → CLI argv → runs the binary → returns the parsed JSON
 * as BOTH a text block (universal MCP client compat) AND `structuredContent`
 * (typed result). A refusal/error (non-zero exit) is returned with
 * `isError:true` so the enforcer signal (O20) survives the MCP hop — the agent
 * sees "REFUSED: peeked winner", not a silent success.
 */
export function buildTallyMcpServer(): McpServer {
  const server = new McpServer(SERVER_INFO, {
    instructions:
      "tally — product-analytics + feature-flags + experiments employee. Use these tools to design a CI-gated event taxonomy (track_plan), wire vendor-neutral flags without the local-eval footgun (wire_flag), capture PII-masked typed events (capture_event), and decide experiments fail-closed (check_experiment: SRM-first + peeking-impossible). Boundary: NEVER for LLM token spend (agentmoney) or app health (canary). A non-zero/refused result is a deliberate guardrail, not a bug.",
  });

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      (args: Record<string, unknown>): CallToolResult => {
        const argv = tool.toArgv(args ?? {});
        const res = runTallyCli(argv);
        const isError = res.exitCode !== 0;
        // Prefer the parsed JSON; fall back to raw/stderr so the caller always
        // gets a readable signal even if a command emitted non-JSON.
        const payload =
          res.json !== null ? res.json : { error: res.stderr.trim() || res.raw.trim() || "no output", exitCode: res.exitCode };
        const text =
          res.json !== null ? JSON.stringify(res.json, null, 2) : `tally ${tool.name} exited ${res.exitCode}\n${res.stderr || res.raw}`;
        return {
          content: [{ type: "text", text }],
          structuredContent: payload as Record<string, unknown>,
          isError,
        };
      },
    );
  }

  return server;
}

/** Start the stdio server (the primary, `.mcp.json`-launched path). */
export async function startStdio(): Promise<void> {
  const server = buildTallyMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio servers stay alive on the transport; nothing else to do.
}

/**
 * The documented Streamable-HTTP path (the hosted variant). Minimal on purpose:
 * one stateful transport bound to a fresh server, mounted at POST /mcp. Run with
 * `MCP_HTTP=1 [PORT=8765] node dist/mcp/server.js`. (Dual-mode obligation per
 * HARNESS-OVERRIDES §7 — documented, not the default.)
 */
export async function startHttp(port: number): Promise<void> {
  const { StreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/streamableHttp.js"
  );
  const { createServer } = await import("node:http");

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = buildTallyMcpServer();
  await server.connect(transport);

  const http = createServer((req, res) => {
    if (req.url === "/mcp") {
      void transport.handleRequest(req, res);
      return;
    }
    res.writeHead(404).end();
  });
  http.listen(port, "127.0.0.1", () => {
    process.stderr.write(`tally MCP (Streamable-HTTP) listening on http://127.0.0.1:${port}/mcp\n`);
  });
}

// Run when invoked directly or through the `tally-mcp` bin (npm links a bin under its own name, so
// argv[1] ends in "tally-mcp"); stdio by default, HTTP if MCP_HTTP=1.
const invokedDirectly =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("server.js") ||
    process.argv[1].endsWith("server.ts") ||
    process.argv[1].endsWith("tally-mcp"));
if (invokedDirectly && (process.argv.includes("--help") || process.argv.includes("-h"))) {
  process.stdout.write(
    "tally-mcp: tally's MCP server over stdio (9 tools). Register it in an MCP client; " +
      "MCP_HTTP=1 serves Streamable HTTP on PORT (8765), `--version` prints the version.\n",
  );
} else if (invokedDirectly && process.argv.includes("--version")) {
  process.stdout.write(`${SERVER_INFO.version}\n`);
} else if (invokedDirectly) {
  const run = process.env.MCP_HTTP === "1" ? startHttp(Number(process.env.PORT ?? 8765)) : startStdio();
  run.catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`tally-mcp: ${msg}\n`);
    process.exit(1);
  });
}
