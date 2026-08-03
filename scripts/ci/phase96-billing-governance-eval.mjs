#!/usr/bin/env node
// PHASE 96 — offline billing-governance evaluation runner (CI-safe).
//
// Runs the deterministic billing-governance suite (entitlement resolver,
// subscription state machine, Stripe event mapper + offline signature proof,
// webhook idempotency/replay/out-of-order, money/refund, audit redaction, and
// the synthetic adversarial datasets with zero-tolerance budgets) through the
// project's Vitest. It makes NO external provider call, contacts no network,
// needs no service container, no secrets and no Production access. It also runs
// a secret-leak scan over the governance source + fixtures. Node stdlib only;
// exit code propagated.

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function fail(code) {
  console.error(`[phase96-billing-eval] FAILED ${code}`);
  process.exit(1);
}

// 1) Secret-leak scan. No committed provider key / signing secret / private key
//    may appear in the governance source or fixtures.
const SECRET_PATTERNS = [
  /sk_(live|test)_[A-Za-z0-9]{16,}/, // Stripe secret key
  /whsec_[A-Za-z0-9]{16,}/, // Stripe webhook signing secret
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
// Allow the deliberately fake, clearly-labelled test values used by offline
// signature/redaction fixtures (they are not real secrets).
const ALLOWED_FAKE = [
  "whsec_phase96_test_only_secret_do_not_use_in_prod",
  "sk_test_offline_dummy_key",
];
function scrub(text) {
  let t = text;
  for (const fake of ALLOWED_FAKE) t = t.split(fake).join("");
  // Neutralise the short illustrative fixture strings (ABCDEF… placeholders).
  t = t.replace(/whsec_ABCDEFGHIJKLMNOP[A-Z]*/g, "").replace(/sk_live_ABCDEFGHIJKLMNOP[A-Z]*/g, "");
  return t;
}
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
  resolve(root, "src/lib/billing-governance"),
  resolve(root, "tests/fixtures/billing-governance"),
  resolve(root, "src/app/api/billing/webhooks/stripe"),
];
for (const base of scanRoots) {
  for (const file of walk(base)) {
    const text = scrub(readFileSync(file, "utf8"));
    if (SECRET_PATTERNS.some((re) => re.test(text))) fail(`SECRET_LEAK:${file}`);
  }
}
console.log("[phase96-billing-eval] secret-leak scan clean");

// 2) Run the billing-governance Vitest suite (offline, deterministic).
const vitest = resolve(root, "node_modules/vitest/vitest.mjs");
const result = spawnSync(
  process.execPath,
  [vitest, "run", "src/lib/billing-governance/__tests__/", "src/app/api/industrial/__tests__/entitlement-gating.test.ts"],
  { cwd: root, env: { ...process.env, NODE_ENV: "test" }, stdio: "inherit", shell: false },
);
if (result.error) fail("SPAWN_ERROR");
if ((result.status ?? 1) !== 0) fail("EVAL_SUITE");
console.log("[phase96-billing-eval] OK");
