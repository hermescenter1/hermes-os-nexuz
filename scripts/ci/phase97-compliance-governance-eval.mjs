#!/usr/bin/env node
// PHASE 97 — offline compliance-governance evaluation runner (CI-safe).
//
// Runs the deterministic Phase 97 compliance suite (processing inventory, privacy-request
// lifecycle, legal-document governance, retention + legal holds, subject export/erasure
// governance, subprocessor/transfer governance, compliance incidents, evidence packs +
// canonicalisation, trilingual UI localisation, tenant isolation, audit hygiene, migration
// integrity, destructive-execution-disabled) through the project's Vitest, plus the
// fourteen-group invariant summary (phase97-eval.test.ts). It makes NO external call,
// contacts no network, needs no service container, no secrets and no Production access, and
// runs a secret-leak scan over the compliance source. Node stdlib only; exit code propagated.

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
function fail(code) { console.error(`[phase97-compliance-eval] FAILED ${code}`); process.exit(1); }

// 1) Secret-leak scan — no committed key / signing secret / private key in compliance source.
const SECRET_PATTERNS = [
  /sk_(live|test)_[A-Za-z0-9]{16,}/,
  /whsec_[A-Za-z0-9]{16,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
];
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
const scanRoots = [
  resolve(root, "src/lib/compliance"),
  resolve(root, "src/app/api/compliance"),
  resolve(root, "src/components/compliance"),
];
for (const base of scanRoots) {
  for (const file of walk(base)) {
    const text = readFileSync(file, "utf8");
    if (SECRET_PATTERNS.some((re) => re.test(text))) fail(`SECRET_LEAK:${file}`);
  }
}
console.log("[phase97-compliance-eval] secret-leak scan clean");

// 2) Run the Phase 97 compliance Vitest suite (offline, deterministic; *.pg.test.ts are
//    excluded by the root vitest config and run only in the PostgreSQL rehearsal job).
const vitest = resolve(root, "node_modules/vitest/vitest.mjs");
const result = spawnSync(
  process.execPath,
  [vitest, "run",
    "src/lib/compliance/__tests__/",
    "src/app/api/compliance/__tests__/",
    "src/i18n/__tests__/compliance-center-parity.test.ts",
    "src/components/compliance/__tests__/",
  ],
  { cwd: root, env: { ...process.env, NODE_ENV: "test" }, stdio: "inherit", shell: false },
);
if (result.error) fail("SPAWN_ERROR");
if ((result.status ?? 1) !== 0) fail("EVAL_SUITE");
console.log("[phase97-compliance-eval] OK");
