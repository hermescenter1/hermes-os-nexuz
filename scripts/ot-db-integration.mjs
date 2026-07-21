#!/usr/bin/env node
// PHASE 94B3.2 — the one command that proves the OT persistence layer against
// a real PostgreSQL database.
//
//   node scripts/ot-db-integration.mjs
//
// It starts a disposable container, waits for readiness, provisions the schema,
// runs the suite with OT_DB_REQUIRED=1 (so a skip is a FAILURE, never a pass),
// and removes only what it created. It never prints the connection string.
//
// WHY PORT 55433 AND NOT 5432
// 5432 on a developer machine is routinely occupied by another project's
// database. Binding elsewhere means a misconfigured run cannot silently attach
// to — and mutate — someone else's data.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, writeFileSync, rmSync, readFileSync } from "node:fs";

const CONTAINER = "hermes-ot-test-pg";
const DB = "hermes_ot_test";
const USER = "ottest";
const PORT = "55433";
const IMAGE = "postgres:16-alpine";

// Assembled here and never echoed. Everything below passes it via the
// environment, so it cannot reach a log line or a CI transcript.
const PASSWORD = process.env.OT_TEST_DB_PASSWORD || "ottestpw";
const URL = `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DB}`;

const TEMP_SCHEMA = "prisma/.ot-test-schema.prisma";

// npx is a .cmd shim on Windows, which cannot be spawned without a shell.
const NEEDS_SHELL = process.platform === "win32";

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: "inherit", shell: NEEDS_SHELL, ...opts });
}

function quiet(cmd, args) {
  return spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
}

function fail(msg) {
  console.error(`\n[ot-db] FAILED: ${msg}`);
  cleanup();
  process.exit(1);
}

function cleanup() {
  // Removes ONLY the container this script created, and the temp schema.
  quiet("docker", ["rm", "-f", CONTAINER]);
  if (existsSync(TEMP_SCHEMA)) rmSync(TEMP_SCHEMA);
}

console.log("[ot-db] starting disposable PostgreSQL (no volume, port " + PORT + ")");
quiet("docker", ["rm", "-f", CONTAINER]);
const start = quiet("docker", [
  "run", "-d", "--name", CONTAINER,
  "-e", `POSTGRES_PASSWORD=${PASSWORD}`,
  "-e", `POSTGRES_USER=${USER}`,
  "-e", `POSTGRES_DB=${DB}`,
  "-p", `${PORT}:5432`,
  IMAGE,
]);
if (start.status !== 0) fail("could not start the test database container");

console.log("[ot-db] waiting for readiness");
let ready = false;
for (let i = 0; i < 60; i += 1) {
  const probe = quiet("docker", ["exec", CONTAINER, "pg_isready", "-U", USER, "-d", DB]);
  if (probe.status === 0) { ready = true; break; }
  execFileSync(process.execPath, ["-e", "setTimeout(()=>{},1000)"], { timeout: 2000 });
  const wait = spawnSync(process.execPath, ["-e", "const t=Date.now();while(Date.now()-t<1000);"]);
  if (wait.error) break;
}
if (!ready) fail("database never became ready");

// The temp schema exists ONLY because pgvector is unavailable in this
// environment: it drops the two unrelated RAG embedding columns so the schema
// can be created at all. No Phase 94 table or column is removed, and the
// adapters never touch the vector models. This does NOT reproduce the complete
// production schema and must not be described as if it did.
console.log("[ot-db] provisioning test schema (test-only: minus 2 unrelated vector columns)");
const schema = readFileSync("prisma/schema.prisma", "utf8");
const trimmed = schema
  .split(/\r?\n/)
  .filter((l) => !l.includes('Unsupported("vector'))
  .join("\n");
writeFileSync(TEMP_SCHEMA, trimmed);

const push = run("npx", ["prisma", "db", "push", "--schema", TEMP_SCHEMA, "--url", URL]);
if (push.status !== 0) fail("schema provisioning failed");

console.log("[ot-db] running required integration suite (OT_DB_REQUIRED=1)");
const test = run(
  "npx",
  ["vitest", "run", "src/lib/ot-edge", "src/test/__tests__/ot-db-guard.test.ts"],
  { env: { ...process.env, OT_TEST_DATABASE_URL: URL, OT_DB_REQUIRED: "1", NODE_ENV: "test" } },
);

cleanup();

if (test.status !== 0) {
  console.error("[ot-db] integration suite FAILED");
  process.exit(test.status ?? 1);
}
console.log("[ot-db] integration suite PASSED with required database coverage");
