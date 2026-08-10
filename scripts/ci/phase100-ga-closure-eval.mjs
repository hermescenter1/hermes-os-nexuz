#!/usr/bin/env node
/**
 * PHASE 100 — OFFICIAL GA / v1.0.0 release closure evaluation.
 *
 *   npm run eval:phase100:closure
 *
 * This is the gate that decides whether Hermes OS is genuinely eligible for a
 * GA release. It exists because a green CI result answers a much smaller
 * question than "may we ship v1.0.0?", and the two were being conflated — the
 * Phase 93 go/no-go matrix asserted `V1_RELEASE_READY: YES` beside three unfilled
 * placeholders, and stayed that way through five subsequent phases.
 *
 * Every decision is made by the canonical evaluation in
 * `scripts/security/phase100/closure-evaluation.mjs` — the same function the
 * test suite calls in memory, so there is exactly one implementation of the
 * release verdict. This file only prints the ledger, writes the summary through
 * `serializeClosureSummary`, and maps failures to an exit code.
 *
 * EXIT CODE CONTRACT (deliberately different from Phase 99's):
 *
 *   0 — the evaluator behaved correctly. This INCLUDES `PHASE100_CLOSURE=BLOCKED`,
 *       which is the honest and expected state while genuine owner/external
 *       evidence is absent. A green CI run means the gate works, NOT that GA
 *       was approved.
 *   1 — the evaluator could not do its job, or something is actually wrong:
 *       the Phase 100 implementation self-check failed, evidence WAS supplied
 *       and failed validation, a repository-owned engineering gate failed, or
 *       the output contradicts itself.
 *
 * NETWORK/SIDE-EFFECT CONTRACT: this script reads repository files and runs one
 * offline child process (the Phase 99 readiness evaluator). It never contacts
 * Production, OpenBao, Stripe, a model provider or a customer, and it writes
 * only `phase100-ga-closure.json`.
 */

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluatePhase100GaClosure,
  serializeClosureSummary,
} from "../security/phase100/closure-evaluation.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const { ledger, verdict, summary, failures } = evaluatePhase100GaClosure({ repoRoot: REPO });
const { blockers, releaseBlockerCount, gaReleaseReady, closure, officialOutputs } = verdict;

for (const g of ledger) {
  console.log(`RESULT phase100_${g.name}=${g.state}`);
  if (g.reason) console.log(`  ~ ${g.reason}`);
  for (const e of g.errors) console.log(`  - ${e}`);
}

console.log("");
console.log("── PHASE 100 OFFICIAL GA CLOSURE OUTPUTS ──");
for (const [k, v] of Object.entries(officialOutputs)) console.log(`${k}=${v}`);

console.log("");
console.log(`RELEASE_BLOCKER_MATRIX (${releaseBlockerCount})`);
for (const b of blockers) console.log(`  ${b.state} ${b.group}/${b.name}${b.reason ? ` — ${b.reason}` : ""}`);

try {
  writeFileSync(join(REPO, "phase100-ga-closure.json"), serializeClosureSummary(summary));
} catch { /* non-fatal */ }

// ── Exit code ─────────────────────────────────────────────────────────────────
//
// BLOCKED is the expected state and does NOT fail the build: the workflow proves
// the gate works, not that GA was approved. What DOES fail the build is the
// evaluator being unable to judge, evidence being supplied and invalid, or a
// repository-owned engineering gate failing.

console.log("");
console.log(`RESULT phase100_ga_closure=${closure}`);
console.log(`RESULT phase100_ga_release_ready=${gaReleaseReady ? "YES" : "NO"}`);
console.log(`RESULT phase100_release_blocker_count=${releaseBlockerCount}`);
console.log(`RESULT phase100_evaluator_ok=${failures.length === 0 ? "YES" : "NO"}`);
console.log("RESULT phase100_production_contacted=False");
console.log("RESULT phase100_openbao_contacted=False");
console.log("RESULT phase100_external_reviewer_contacted=False");
console.log("RESULT phase100_customer_contacted=False");

if (failures.length > 0) {
  console.error("");
  console.error(`[phase100-ga-closure] EVALUATOR FAILURE: ${failures.join(", ")}`);
  console.error("[phase100-ga-closure] This is not a pending decision — either the closure mechanism is broken,");
  console.error("[phase100-ga-closure] or evidence was supplied that does not validate. Fix it; do not relax the gate.");
  process.exit(1);
}

if (!gaReleaseReady) {
  console.error("");
  console.error("[phase100-ga-closure] GA is NOT authorised. Missing owner or external evidence is BLOCKED, not PASS.");
  console.error("[phase100-ga-closure] A green CI result means this gate behaved correctly — it is not a release approval.");
}
process.exit(0);
