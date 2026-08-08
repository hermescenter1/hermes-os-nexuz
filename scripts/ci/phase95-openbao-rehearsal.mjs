#!/usr/bin/env node
// PHASE 95 — disposable, real-OpenBao integration rehearsal (CI only).
//
// Drives the EXISTING Phase 94 opt-in launchers against a throwaway OpenBao dev
// server (in-memory storage, loopback HTTP, started by the CI job with
// `server -dev`). It provisions nothing durable, contacts nothing but the local
// dev server, and generates only DISPOSABLE material. It NEVER touches staging
// or production and NEVER prints a token, role id or secret id.
//
// What it proves end-to-end against a real server:
//   1. openbao-secret-manager-integration.mjs → the real create → resolve →
//      rotate (CAS) → revoke → delete lifecycle through the actual KV v2 adapter.
//   2. openbao-least-privilege-check.mjs → KV v2 enable, least-privilege policy
//      install, AppRole create, role-id/secret-id issuance, REAL AppRole login,
//      allowed prefix ops succeed, unrelated prefix / sys / token-lookup denied,
//      and SecretID/role lifecycle — all with per-run unique mount/role/policy
//      names so the setup is idempotent and self-cleaning.
//   3. A SECOND least-privilege run with fresh unique names → re-runnability.
//
// Node standard library only. Fail-closed: any non-zero child status aborts with
// a fixed, non-sensitive code. Secrets never appear here — the launchers own
// their own secret-free output (source-asserted by their unit tests).

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Emit a FIXED, non-sensitive marker only — never a value, token or path. */
function log(msg) {
  console.log(`[phase95-openbao] ${msg}`);
}
function fail(code) {
  console.error(`[phase95-openbao] FAILED ${code}`);
  process.exit(1);
}

const addr = process.env.BAO_ADDR;
const token = process.env.BAO_TOKEN;
if (!addr || !token) fail("ENV_MISSING");

// Loopback-only: a dev-server root token must never leave the box in the clear.
try {
  const url = new URL(addr);
  const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname);
  if (url.protocol !== "http:" && url.protocol !== "https:") fail("INSECURE_ENDPOINT");
  if (!loopback) fail("INSECURE_ENDPOINT");
} catch {
  fail("INSECURE_ENDPOINT");
}

/** A short, path-safe unique suffix for per-run OpenBao resource names. */
function suffix() {
  return randomBytes(4).toString("hex");
}

/** Wait for the dev server to report initialized + unsealed, bounded. */
async function waitForHealth() {
  const healthUrl = `${addr.replace(/\/+$/, "")}/v1/sys/health?standbyok=true`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(healthUrl, { redirect: "error" });
      if (res.status === 200) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  fail("OPENBAO_NOT_READY");
}

/**
 * Run a launcher with an env overlay. stdio is inherited: the launchers are
 * designed and unit-asserted to print no secret, so their output is safe in the
 * CI log. A non-zero status is fatal.
 */
function runLauncher(script, extraEnv, code) {
  const childEnv = { ...process.env, ...extraEnv };
  const result = spawnSync(process.execPath, [resolve(root, script)], {
    cwd: root,
    env: childEnv,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) fail(`${code}_SPAWN_ERROR`);
  if ((result.status ?? 1) !== 0) fail(code);
}

await waitForHealth();
log("dev server ready");

// 1) Real KV v2 lifecycle through the adapter, against the dev-mode `secret/`
//    KV v2 mount under a per-run prefix.
log("secret-manager lifecycle rehearsal");
runLauncher(
  "scripts/openbao-secret-manager-integration.mjs",
  { OPENBAO_LIVE: "1", BAO_MOUNT: "secret", BAO_PREFIX: `phase95ci-${suffix()}` },
  "SECRET_MANAGER_LIFECYCLE",
);

// 2) Least-privilege AppRole rehearsal — self-provisions and self-cleans a unique
//    mount/auth/policy/role. Proves allowed-vs-denied and the credential lifecycle.
function leastPrivilegeRun(code) {
  const s = suffix();
  runLauncher(
    "scripts/openbao-least-privilege-check.mjs",
    {
      OPENBAO_LEASTPRIV_LIVE: "1",
      BAO_MOUNT: `hermesci${s}`,
      BAO_AUTH_MOUNT: `approleci${s}`,
      BAO_PREFIX: "gateways",
      BAO_ROLE: `hermesgw${s}`,
      BAO_POLICY: `hermesgwkv${s}`,
    },
    code,
  );
}

log("least-privilege rehearsal (run 1)");
leastPrivilegeRun("LEAST_PRIVILEGE_RUN1");

// 3) Idempotency / re-runnability: a second run with fresh names must also pass.
log("least-privilege rehearsal (run 2 — re-runnability)");
leastPrivilegeRun("LEAST_PRIVILEGE_RUN2");

log("OK");
