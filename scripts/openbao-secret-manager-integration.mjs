#!/usr/bin/env node
// PHASE 94D0C — thin launcher for the live OpenBao integration test.
//
//   BAO_ADDR=http://127.0.0.1:8200 BAO_TOKEN=... node scripts/openbao-secret-manager-integration.mjs
//
// This does NOT import any TypeScript. It validates the environment, then runs
// the opt-in live Vitest file through the project's own Vitest, which transforms
// the `.ts` adapter. The launcher only sets `OPENBAO_LIVE=1`, spawns Vitest with
// shell:false, inherits its (secret-free) output, and propagates the exit code.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Fail with a FIXED code only — never a message, body, token, secret or path. */
function fail(code) {
  console.error(`[openbao] FAILED ${code}`);
  process.exit(1);
}

const addr = process.env.BAO_ADDR;
const token = process.env.BAO_TOKEN;
if (!addr || !token) fail("ENV_MISSING");

// Refuse non-loopback HTTP — the same rule the adapter and test enforce, so a
// token is never sent in the clear off-box.
try {
  const url = new URL(addr);
  const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname);
  if (url.protocol === "http:") {
    if (!loopback) fail("INSECURE_ENDPOINT");
  } else if (url.protocol !== "https:") {
    fail("INSECURE_ENDPOINT");
  }
} catch {
  fail("INSECURE_ENDPOINT");
}

const vitest = resolve(root, "node_modules/vitest/vitest.mjs");
const testFile = "src/lib/ot-edge/__tests__/openbao-secret-manager.live.test.ts";

const result = spawnSync(
  process.execPath,
  [vitest, "run", testFile],
  {
    cwd: root,
    // OPENBAO_LIVE=1 flips the test from skipped to active. BAO_* pass through.
    env: { ...process.env, OPENBAO_LIVE: "1" },
    stdio: "inherit",
    shell: false,
  },
);

if (result.error) fail("SPAWN_ERROR");
process.exit(result.status ?? 1);
