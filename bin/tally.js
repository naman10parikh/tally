#!/usr/bin/env node
/**
 * tally — bin shim. Prefers the built `dist/cli/index.js` (the published path).
 * In a dev checkout where `dist/` isn't built, falls back to running the TS
 * source via the local `tsx` so `tally` works without a build step.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "..", "dist", "cli", "index.js");
const src = resolve(here, "..", "src", "cli", "index.ts");

if (existsSync(dist)) {
  // Published / built path: import the compiled CLI (it self-dispatches on argv).
  await import(pathToFileURL(dist).href);
} else if (existsSync(src)) {
  // Dev path: run the TS source via the local tsx runner.
  const tsx = resolve(here, "..", "node_modules", ".bin", "tsx");
  const runner = existsSync(tsx) ? tsx : "tsx";
  const res = spawnSync(runner, [src, ...process.argv.slice(2)], { stdio: "inherit" });
  process.exit(res.status ?? 1);
} else {
  process.stderr.write("tally: neither dist/ nor src/ found — reinstall the package.\n");
  process.exit(1);
}
