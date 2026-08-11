#!/usr/bin/env node
/**
 * PHASE 99 — OFFICIAL closure evaluation.
 *
 *   npm run eval:phase99:closure
 *
 * This is the gate that decides whether Phase 99 is actually finished, and it is
 * deliberately impossible to satisfy from inside the repository. Three of its
 * inputs — an independent penetration test, external application and API
 * security reviews — and one more — a pilot customer's acceptance — are acts
 * performed by people who are not this codebase and not the agent that wrote it.
 *
 * So the evaluator consumes EVIDENCE, not assertions, and it distinguishes three
 * outcomes with care:
 *
 *   PASS    — real, validated, owner-verified external evidence exists.
 *   BLOCKED — the evidence does not exist yet. This is the correct state during
 *             internal engineering. It is NOT a failure of the product and it is
 *             NOT a pass; it never silently becomes one.
 *   FAIL    — evidence was supplied and did not validate, or a gate that the
 *             repository does own (open CRITICAL, release blockers) is unmet.
 *
 * The process exits non-zero whenever any required gate is not PASS, so this can
 * never be mistaken for a green build.
 *
 * PHASE 100 amendment: the decision logic now lives in
 * `scripts/security/phase99/closure-core.mjs` so the Phase 100 GA evaluator can
 * consume the same verdict rather than re-deriving it. This file is the Phase 99
 * CLI: identical output, identical artifact, identical exit code.
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { evaluatePhase99Closure } from "../security/phase99/closure-core.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const rel = (p) => join(REPO, ...p.split("/"));
const read = (p) => (existsSync(rel(p)) ? readFileSync(rel(p), "utf8") : null);
const readJson = (p) => { const t = read(p); if (!t) return null; try { return JSON.parse(t); } catch { return null; } };

/** The commit the external evidence must be about. */
function expectedReleaseCommit() {
  if (process.env.PHASE99_RELEASE_COMMIT) return process.env.PHASE99_RELEASE_COMMIT.trim();
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const result = evaluatePhase99Closure({
  readText: read,
  readJson,
  expectedCommitSha: expectedReleaseCommit(),
  nowMs: Date.now(),
});

for (const ev of result.events) {
  console.log(`RESULT phase99_${ev.name}=${ev.state}`);
  if (ev.reason) console.log(`  ~ ${ev.reason}`);
  for (const e of ev.errors.slice(0, 6)) console.log(`  - ${e}`);
}

console.log("");
console.log("── PHASE 99 OFFICIAL CLOSURE OUTPUTS ──");
for (const [k, v] of Object.entries(result.officialOutputs)) console.log(`${k}=${v}`);

const summary = {
  phase: "99",
  schemaVersion: 1,
  kind: "OFFICIAL_CLOSURE",
  expectedCommitSha: result.expectedCommitSha,
  gates: result.gates,
  reasons: result.reasons,
  officialOutputs: result.officialOutputs,
  blockedOrFailedGates: result.blockedOrFailedGates,
  phase99Complete: result.closed,
};
try {
  writeFileSync(join(REPO, "phase99-closure.json"), JSON.stringify(summary, null, 2) + "\n");
} catch { /* non-fatal */ }

console.log("");
console.log(`RESULT phase99_closure=${result.closed ? "PASS" : "BLOCKED"}`);
console.log(`RESULT phase99_external_gates_complete=${result.closed ? "YES" : "NO"}`);
if (!result.closed) {
  console.log(`RESULT phase99_outstanding=${summary.blockedOrFailedGates.join(",")}`);
  console.error("");
  console.error("[phase99-closure] Phase 99 is NOT closed. Missing external evidence is BLOCKED, not PASS —");
  console.error("[phase99-closure] it must be supplied by an authorised external reviewer and a pilot acceptance");
  console.error("[phase99-closure] authority, then validated here. Do not convert BLOCKED into PASS.");
}
process.exit(result.closed ? 0 : 1);
