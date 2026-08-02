#!/usr/bin/env node
// PHASE 95 — offline AI-governance evaluation runner (CI-safe).
//
// Runs the deterministic governance test suite (registry static gate, provider
// policy, prompt-injection, RAG poisoning, citation integrity, unsafe output,
// evidence/router, and the synthetic adversarial dataset with zero-tolerance
// budgets) through the project's Vitest. It makes NO external provider call and
// touches no network. It also runs a secret-leak scan over the governance files.
// Node standard library only; exit code propagated.

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function fail(code) {
  console.error(`[phase95-ai-eval] FAILED ${code}`);
  process.exit(1);
}

// 1) Secret-leak scan over the governance source + fixtures. A committed
//    provider key / obvious secret must never appear.
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9]{20,}/, // OpenAI-style key
  /sk-ant-[A-Za-z0-9-]{20,}/, // Anthropic-style key
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
const scanRoots = [
  resolve(root, "src/lib/ai-governance"),
  resolve(root, "tests/fixtures/ai-governance"),
];
for (const base of scanRoots) {
  for (const file of walk(base)) {
    const text = readFileSync(file, "utf8");
    if (SECRET_PATTERNS.some((re) => re.test(text))) fail("SECRET_LEAK");
  }
}
console.log("[phase95-ai-eval] secret-leak scan clean");

// 2) Run the governance Vitest suite (offline, deterministic).
const vitest = resolve(root, "node_modules/vitest/vitest.mjs");
const result = spawnSync(
  process.execPath,
  [vitest, "run", "src/lib/ai-governance/__tests__/"],
  { cwd: root, env: { ...process.env, NODE_ENV: "test" }, stdio: "inherit", shell: false },
);
if (result.error) fail("SPAWN_ERROR");
if ((result.status ?? 1) !== 0) fail("EVAL_SUITE");
console.log("[phase95-ai-eval] OK");
