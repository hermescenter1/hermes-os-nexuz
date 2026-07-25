#!/usr/bin/env node
// PHASE 94D0F — thin launcher for the opt-in OpenBao least-privilege live test.
//
//   OPENBAO_LEASTPRIV_LIVE=1 BAO_ADDR=http://127.0.0.1:8200 BAO_TOKEN=... \
//   BAO_MOUNT=hermes-lab BAO_AUTH_MOUNT=approle \
//   node scripts/openbao-least-privilege-check.mjs
//
// Node standard libraries only. It imports no TypeScript: it validates the
// environment, then runs ONLY the least-privilege live Vitest file through the
// project's own Vitest (which transforms the .ts modules), with shell:false,
// inherited (secret-free) output, and the exit code propagated. It never prints
// an environment value or credential — only a stable, non-sensitive error code.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Fail with a FIXED code only — never a message, value, token or path. */
function fail(code) {
  console.error(`[openbao-leastpriv] FAILED ${code}`);
  process.exit(1);
}

// Explicit opt-in flag — without it the launcher refuses to run a live test.
if (process.env.OPENBAO_LEASTPRIV_LIVE !== "1") fail("FLAG_MISSING");

const addr = process.env.BAO_ADDR;
const token = process.env.BAO_TOKEN;
if (!addr || !token) fail("ENV_MISSING");

// Loopback-only endpoint for this phase — a bootstrap/admin token must never
// leave the box in the clear.
try {
  const url = new URL(addr);
  const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname);
  if (url.protocol !== "http:" && url.protocol !== "https:") fail("INSECURE_ENDPOINT");
  if (!loopback) fail("INSECURE_ENDPOINT");
} catch {
  fail("INSECURE_ENDPOINT");
}

// Names that reach OpenBao paths must be safe (no whitespace, traversal,
// wildcards, quotes, backslashes or separators).
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,126}$/;
for (const key of ["BAO_MOUNT", "BAO_AUTH_MOUNT"]) {
  const value = process.env[key];
  if (!value) fail("ENV_MISSING");
  if (!SAFE_NAME.test(value)) fail("UNSAFE_NAME");
}
for (const key of ["BAO_PREFIX", "BAO_ROLE", "BAO_POLICY"]) {
  const value = process.env[key];
  if (value !== undefined && !SAFE_NAME.test(value)) fail("UNSAFE_NAME");
}

const vitest = resolve(root, "node_modules/vitest/vitest.mjs");
const testFile = "src/lib/ot-edge/__tests__/openbao-approle-least-privilege.live.test.ts";

// One explicit admin-token contract. The validated BAO_TOKEN value is handed to
// the child ONLY as OPENBAO_LEASTPRIV_ADMIN_TOKEN; BAO_TOKEN is removed from the
// child so the privileged token exists downstream under exactly one name (no
// fallback). childEnv is a COPY — the parent environment is never mutated. The
// token is never an argv, never printed, never persisted.
const childEnv = { ...process.env };
delete childEnv.BAO_TOKEN;
childEnv.OPENBAO_LEASTPRIV_ADMIN_TOKEN = token;

// Test seam: with OPENBAO_LEASTPRIV_SELFTEST=1 the child is a fixed one-liner
// that reports ONLY the presence (booleans, never values) of the token
// variables, so the env mapping can be verified without OpenBao and without
// printing any secret.
const childArgs =
  process.env.OPENBAO_LEASTPRIV_SELFTEST === "1"
    ? [
        "-e",
        "console.log(JSON.stringify({admin:!!process.env.OPENBAO_LEASTPRIV_ADMIN_TOKEN,baoToken:process.env.BAO_TOKEN!==undefined,addr:!!process.env.BAO_ADDR}))",
      ]
    : [vitest, "run", testFile];

const result = spawnSync(process.execPath, childArgs, {
  cwd: root,
  env: childEnv,
  stdio: "inherit",
  shell: false,
});

if (result.error) fail("SPAWN_ERROR");
process.exit(result.status ?? 1);
