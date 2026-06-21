/**
 * tally — MCP server round-trip test (Component 7 / C1 verify, reproducible).
 *
 * Spawns tally's OWN MCP server over stdio (the primary Q6 path), connects a
 * real MCP `Client`, and asserts:
 *   1. `tools/list` returns ALL 9 documented tool names (PLAN §4).
 *   2. `tools/call track_plan` round-trips with a valid arg/return shape
 *      (registryPath / ciCheckPath / typedAccessors / events[]).
 *   3. The enforcer signal survives the MCP hop — a tombstoned-key reuse comes
 *      back `isError:true` + `{refused:true}` (O20 fail-closed, not a silent ok).
 *
 * Uses the built `dist/mcp/server.js`, so `pnpm build` must run first (it does
 * in CI + `prepublishOnly`). test-before-signal: this is green before C1 ✅.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = resolve(REPO, "dist/mcp/server.js");

const EXPECTED = [
  "track_plan",
  "wire_flag",
  "capture_event",
  "check_experiment",
  "audit_pii",
  "flag_sweep",
  "migrate_plan",
  "explain",
  "search_brain",
];

let client: Client;
let fixtureDir: string;

beforeAll(async () => {
  // A tiny fixture app with a couple of analytics call-sites for track_plan.
  fixtureDir = mkdtempSync(join(tmpdir(), "tally-mcp-"));
  mkdirSync(fixtureDir, { recursive: true });
  writeFileSync(
    join(fixtureDir, "app.ts"),
    [
      'import { capture } from "./analytics";',
      "export function onSignup() {",
      '  capture("user_signed_up", { plan: "free", referral_source: "google" });',
      "}",
      "export function onCheckout() {",
      '  capture("checkout_started", { plan: "pro", amount: 49 });',
      "}",
      "",
    ].join("\n"),
  );

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    cwd: REPO,
  });
  client = new Client({ name: "tally-test", version: "0.0.0" });
  await client.connect(transport);
}, 30_000);

afterAll(async () => {
  await client?.close();
});

describe("tally MCP server", () => {
  it("requires a built server (dist/mcp/server.js)", () => {
    expect(existsSync(SERVER)).toBe(true);
  });

  it("tools/list returns all 9 documented tool names", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const expected of EXPECTED) {
      expect(names).toContain(expected);
    }
    expect(names.length).toBeGreaterThanOrEqual(9);
  });

  it("tools/call track_plan round-trips with a valid return shape", async () => {
    const out = await client.callTool({
      name: "track_plan",
      arguments: { dir: fixtureDir, app: "fixture", out: join(fixtureDir, "out") },
    });
    expect(out.isError).not.toBe(true);
    const sc = (out.structuredContent ?? {}) as Record<string, unknown>;
    expect(typeof sc.registryPath).toBe("string");
    expect(typeof sc.ciCheckPath).toBe("string");
    expect(typeof sc.typedAccessors).toBe("string");
    expect(Array.isArray(sc.events)).toBe(true);
  });

  it("enforcer signal survives the MCP hop — a peeked winner is refused", async () => {
    // The differentiator (O6/BTS-4): a fixed-horizon test, declaring a winner
    // before the pre-registered N. The CLI refuses (exit 3, {refused:true}); the
    // MCP hop must preserve that as isError:true + structured refused:true, so an
    // agent calling over MCP gets the wall, not a silent success.
    const out = await client.callTool({
      name: "check_experiment",
      arguments: {
        spec: JSON.stringify({
          method: "frequentist-fixed-horizon",
          declaringWinner: true,
          currentN: 1200,
          preRegisteredN: 40000,
          direction: "winner",
        }),
      },
    });
    expect(out.isError).toBe(true);
    const sc = (out.structuredContent ?? {}) as Record<string, unknown>;
    expect(sc.refused).toBe(true);
  });
});
