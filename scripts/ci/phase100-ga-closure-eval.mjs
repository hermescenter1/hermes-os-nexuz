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
 * So this evaluator separates the things that were being blurred together:
 *
 *   implementation completeness  — did Phase 100 build a working closure gate?
 *   internal technical readiness — is the engineering work finished?
 *   owner configuration          — has the owner decided the things only they can?
 *   externally issued evidence   — did outside parties actually attest?
 *   pilot / UAT acceptance       — did a real customer accept?
 *   legal / privacy approval     — did external counsel approve?
 *   production operations        — has the production system actually done it?
 *   GA authorization             — did the owner finally authorise the release?
 *
 * Only the first two are things this repository can earn. The rest are acts by
 * people who are not this codebase, and their absence is BLOCKED — never a
 * warning, never a synthetic PASS, never silently upgraded.
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

import { readFileSync, existsSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { evaluatePhase99Closure } from "../security/phase99/closure-core.mjs";
import { resolveGate } from "../security/phase99/external-evidence.mjs";
import { RESOLVED_STATUSES } from "../security/phase99/finding-contract.mjs";
import {
  legalPrivacyGateInputs,
  liveModelEvaluationGateInput,
  backupOperationalGateInputs,
  commercialGateInputs,
  infrastructurePrerequisiteGateInputs,
  gaAuthorizationGateInput,
  validateResidualRiskAcceptance,
  isNonProductionFixture,
} from "../security/phase100/ga-evidence.mjs";
import { createLedger, aggregate, assembleVerdict, evaluatorFailures } from "../security/phase100/verdict.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const rel = (p) => join(REPO, ...p.split("/"));
const read = (p) => (existsSync(rel(p)) ? readFileSync(rel(p), "utf8") : null);
const readJson = (p) => { const t = read(p); if (!t) return null; try { return JSON.parse(t); } catch { return null; } };

const NOW_MS = Date.now();

/** The commit every piece of evidence must be about. */
function expectedReleaseCommit() {
  const env = process.env.PHASE100_RELEASE_COMMIT ?? process.env.PHASE99_RELEASE_COMMIT;
  if (env && env.trim()) return env.trim();
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}
const expectedCommitSha = expectedReleaseCommit();

// ── Gate ledger ───────────────────────────────────────────────────────────────
//
// Every gate is recorded once, in a stable order, with the reason it is not PASS
// and the group it belongs to. Nothing is aggregated before it has been recorded
// individually, so no blocker can hide behind another.

const { ledger, gateIndex, record } = createLedger();

/**
 * Resolve one evidence-backed gate through the shared Phase 99 contract.
 *
 * The shared `resolveGate` says "no external evidence supplied" when evidence is
 * absent, which is accurate for Phase 99 (where every blocked gate is external)
 * and misleading for Phase 100 (where pricing, key custody and backend
 * activation are the OWNER's decisions, not an outside party's). The state is
 * taken verbatim; only the wording is made accurate for the gate at hand.
 */
function recordEvidenceGate(group, { gate, evidence, validator }) {
  const supplied = evidence !== null && evidence !== undefined;
  const resolved = resolveGate(evidence, validator);
  const reason = !supplied ? "no evidence recorded for this gate" : resolved.reason;
  return record(gate, group, resolved.state, reason, resolved.errors, supplied);
}

// ── 1. Phase 100 implementation self-check ────────────────────────────────────
//
// "Is the closure MECHANISM built?" is a separate question from "may we ship?",
// and it is the only one this repository can answer on its own.

const REQUIRED_ARTIFACTS = [
  "scripts/security/phase99/closure-core.mjs",
  "scripts/security/phase100/ga-evidence.mjs",
  "scripts/ci/phase100-ga-closure-eval.mjs",
  ".github/workflows/phase100-ga-closure.yml",
  "docs/release/phase100-ga-closure-contract.md",
  "docs/release/phase100-evidence-schemas.md",
  "docs/release/phase100-existing-state-matrix.md",
];
const EXAMPLE_DIR = "docs/release/phase100-evidence-examples";

const implementationErrors = [];
for (const artifact of REQUIRED_ARTIFACTS) {
  if (!existsSync(rel(artifact))) implementationErrors.push(`missing required Phase 100 artifact: ${artifact}`);
}

// The Phase 99 CLI must DELEGATE to the shared engine rather than carry a second
// copy of the decision logic — a forked engine is how two evaluators start
// disagreeing about whether a release may proceed.
const phase99Cli = read("scripts/ci/phase99-closure-eval.mjs") ?? "";
if (!phase99Cli.includes("closure-core.mjs")) {
  implementationErrors.push("scripts/ci/phase99-closure-eval.mjs no longer delegates to the shared closure engine");
}

// Every shipped example must be rejected by its own contract. If an example
// could ever satisfy a gate, the repository would contain its own approval.
let exampleCount = 0;
if (!existsSync(rel(EXAMPLE_DIR))) {
  implementationErrors.push(`missing required Phase 100 example directory: ${EXAMPLE_DIR}`);
} else {
  for (const file of readdirSync(rel(EXAMPLE_DIR)).sort()) {
    if (!file.endsWith(".json")) continue;
    exampleCount += 1;
    const doc = readJson(`${EXAMPLE_DIR}/${file}`);
    if (!doc) { implementationErrors.push(`${file}: not parseable JSON`); continue; }
    if (!isNonProductionFixture(doc)) {
      implementationErrors.push(`${file}: is not marked as a non-production fixture — an example must never be usable as evidence`);
    }
  }
  if (exampleCount === 0) implementationErrors.push(`${EXAMPLE_DIR} contains no example documents`);
}

record(
  "PHASE100_IMPLEMENTATION",
  "IMPLEMENTATION",
  implementationErrors.length === 0 ? "PASS" : "FAIL",
  implementationErrors.length === 0 ? `${exampleCount} example document(s), all rejected by contract` : "Phase 100 closure mechanism is incomplete",
  implementationErrors,
  true,
);

// ── 2. Internal technical readiness (reuses the Phase 99 readiness evaluator) ──

let readinessState = "UNAVAILABLE";
let readinessBlockedOn = [];
try {
  const out = execFileSync(process.execPath, [rel("scripts/ci/phase99-security-readiness-eval.mjs")], {
    cwd: REPO,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  readinessState = /RESULT phase99_readiness=(\S+)/.exec(out)?.[1] ?? "UNAVAILABLE";
  readinessBlockedOn = (/RESULT phase99_blocked_on_owner=(\S+)/.exec(out)?.[1] ?? "").split(",").filter(Boolean);
} catch (err) {
  // A non-zero exit is the NORMAL state while owner groups are blocked; the
  // evaluator still printed its verdict on stdout.
  const out = String(err?.stdout ?? "");
  readinessState = /RESULT phase99_readiness=(\S+)/.exec(out)?.[1] ?? "UNAVAILABLE";
  readinessBlockedOn = (/RESULT phase99_blocked_on_owner=(\S+)/.exec(out)?.[1] ?? "").split(",").filter(Boolean);
}

record(
  "PHASE100_INTERNAL_TECHNICAL_READINESS",
  "INTERNAL_READINESS",
  readinessState === "PASS" ? "PASS" : readinessState === "UNAVAILABLE" ? "FAIL" : readinessState === "FAIL" ? "FAIL" : "BLOCKED",
  readinessState === "UNAVAILABLE"
    ? "the Phase 99 readiness evaluator could not be run — its verdict cannot be assumed"
    : readinessState === "PASS"
      ? null
      : `phase99_readiness=${readinessState}${readinessBlockedOn.length ? ` (blocked on: ${readinessBlockedOn.join(",")})` : ""}`,
  [],
  true,
);

// ── 3. Phase 99 closure gates (external security + pilot), reused verbatim ─────

const phase99 = evaluatePhase99Closure({
  readText: read,
  readJson,
  expectedCommitSha,
  nowMs: NOW_MS,
});

const EXTERNAL_SECURITY_MEMBERS = [
  "INDEPENDENT_PENETRATION_TEST",
  "EXTERNAL_APPLICATION_SECURITY_REVIEW",
  "EXTERNAL_API_SECURITY_REVIEW",
  "FINDING_REGISTER",
  "CRITICAL_FINDINGS_ZERO",
  "HIGH_FINDINGS_RESOLVED",
];
const PILOT_MEMBERS = [
  "PILOT_CUSTOMER_SELECTED",
  "PILOT_ACCEPTANCE",
  "PILOT_ACCEPTANCE_DECISION",
  "PILOT_UAT",
  "PILOT_WORKFLOW_VALIDATION",
  "PILOT_PERFORMANCE_OBSERVATION",
  "PILOT_INCIDENT_SIMULATION",
  "PILOT_ONBOARDING",
  "PILOT_SUPPORT_PROCESS",
  "INDUSTRIAL_ENGINEER_FEEDBACK",
];

for (const ev of phase99.events) {
  const group = EXTERNAL_SECURITY_MEMBERS.includes(ev.name)
    ? "EXTERNAL_SECURITY"
    : PILOT_MEMBERS.includes(ev.name)
      ? "PILOT_ACCEPTANCE"
      : "PHASE99_AGGREGATE";
  // INDUSTRIAL_ENGINEER_FEEDBACK's success state is RECORDED, not PASS.
  const state = ev.name === "INDUSTRIAL_ENGINEER_FEEDBACK" && ev.state === "RECORDED" ? "PASS" : ev.state;
  record(ev.name, group, state, ev.reason, ev.errors, ev.state !== "BLOCKED");
}

// `RELEASE_BLOCKERS_ZERO` is a Phase 99 AGGREGATE: it folds the missing pilot
// acceptance into the finding-register blocker count and reports the sum as
// FAIL. Phase 100 already reports the pilot absence as ten individually named
// BLOCKED gates, so counting the aggregate again would both double-count the
// same fact and mislabel an absence as a failure. The aggregate is therefore
// reported for continuity but excluded from the Phase 100 required set, and the
// part of it Phase 100 does NOT otherwise cover — findings explicitly flagged as
// release blockers — is re-derived here as its own gate.
const openBlockingFindings = phase99.registrySummary?.releaseBlockers ?? null;
record(
  "OPEN_RELEASE_BLOCKING_FINDINGS_ZERO",
  "EXTERNAL_SECURITY",
  openBlockingFindings === null ? "FAIL" : openBlockingFindings === 0 ? "PASS" : "FAIL",
  openBlockingFindings === null
    ? "the finding register could not be summarised"
    : `OPEN_RELEASE_BLOCKING_FINDINGS=${openBlockingFindings}`,
  [],
  true,
);

// ── 4. Residual risk acceptance for unresolved lower-severity findings ─────────
//
// Phase 99 requires a formal acceptance only for HIGH. A GA release must also
// account for every unresolved MEDIUM/LOW/INFO finding — individually, so a
// silent accumulation of "just a medium" cannot reach production unowned.

const registryDoc = readJson("docs/security/phase99-findings.json");
const residualAcceptances = readJson("docs/security/phase99-risk-acceptances.json")?.residualAcceptances ?? {};
const unresolvedResidual = (registryDoc?.findings ?? []).filter(
  (f) => ["MEDIUM", "LOW", "INFO"].includes(f?.severity) && !RESOLVED_STATUSES.includes(f?.status),
);

if (unresolvedResidual.length === 0) {
  record("RESIDUAL_FINDING_RISK_ACCEPTED", "EXTERNAL_SECURITY", "PASS", "no unresolved lower-severity finding", [], true);
} else {
  const missing = [];
  const invalid = [];
  for (const f of unresolvedResidual) {
    const acc = residualAcceptances?.[f.findingId] ?? null;
    if (!acc) { missing.push(f.findingId); continue; }
    const v = validateResidualRiskAcceptance(acc, { nowMs: NOW_MS, expectedFindingId: f.findingId });
    if (!v.ok) invalid.push(...v.errors.map((e) => `${f.findingId}: ${e}`));
  }
  const state = invalid.length > 0 ? "FAIL" : missing.length > 0 ? "BLOCKED" : "PASS";
  record(
    "RESIDUAL_FINDING_RISK_ACCEPTED",
    "EXTERNAL_SECURITY",
    state,
    state === "PASS"
      ? `${unresolvedResidual.length} unresolved lower-severity finding(s), all formally accepted`
      : `${unresolvedResidual.length} unresolved lower-severity finding(s); ${missing.length} without an owner acceptance`,
    invalid.length > 0 ? invalid : missing.map((id) => `${id}: no residual risk acceptance recorded`),
    Object.keys(residualAcceptances).length > 0,
  );
}

// ── 5. Legal and privacy ──────────────────────────────────────────────────────

const legalDoc = readJson("docs/legal/phase100-legal-privacy-approvals.json");
for (const input of legalPrivacyGateInputs(legalDoc, { expectedCommitSha, nowMs: NOW_MS })) {
  recordEvidenceGate("LEGAL_PRIVACY", input);
}

// ── 6. Live model evaluation ──────────────────────────────────────────────────

const liveEvalDoc = readJson("docs/ai-governance/phase100-live-model-evaluation.json");
recordEvidenceGate("LIVE_MODEL_EVALUATION", liveModelEvaluationGateInput(liveEvalDoc, { expectedCommitSha, nowMs: NOW_MS }));

// ── 7. Backup and disaster-recovery operations ────────────────────────────────

const backupDoc = readJson("docs/release/phase100-backup-operations.json");
for (const input of backupOperationalGateInputs(backupDoc, { expectedCommitSha, nowMs: NOW_MS })) {
  recordEvidenceGate("BACKUP_OPERATIONAL", input);
}

// ── 8. Commercial owner decisions ─────────────────────────────────────────────

const commercialDoc = readJson("docs/release/phase100-commercial-decisions.json");
for (const input of commercialGateInputs(commercialDoc, { expectedCommitSha, nowMs: NOW_MS })) {
  recordEvidenceGate("COMMERCIAL_OWNER", input);
}

// ── 9. OpenBao / production infrastructure prerequisites ──────────────────────

const infraDoc = readJson("docs/release/phase100-infrastructure-prerequisites.json");
for (const input of infrastructurePrerequisiteGateInputs(infraDoc, { expectedCommitSha, nowMs: NOW_MS })) {
  recordEvidenceGate("OPENBAO_PRODUCTION_PREREQUISITES", input);
}

// ── 10. Final GA authorization ────────────────────────────────────────────────

const gaDoc = readJson("docs/release/phase100-ga-authorization.json");
recordEvidenceGate("GA_AUTHORIZATION", gaAuthorizationGateInput(gaDoc, { expectedCommitSha, nowMs: NOW_MS }));

// ── Verdict ───────────────────────────────────────────────────────────────────

for (const g of ledger) {
  console.log(`RESULT phase100_${g.name}=${g.state}`);
  if (g.reason) console.log(`  ~ ${g.reason}`);
  for (const e of g.errors) console.log(`  - ${e}`);
}

const verdict = assembleVerdict(ledger);
const { blockers, releaseBlockerCount, gaReleaseReady, closure, officialOutputs, contradictions } = verdict;

console.log("");
console.log("── PHASE 100 OFFICIAL GA CLOSURE OUTPUTS ──");
for (const [k, v] of Object.entries(officialOutputs)) console.log(`${k}=${v}`);

console.log("");
console.log(`RELEASE_BLOCKER_MATRIX (${releaseBlockerCount})`);
for (const b of blockers) console.log(`  ${b.state} ${b.group}/${b.name}${b.reason ? ` — ${b.reason}` : ""}`);

const summary = {
  phase: "100",
  schemaVersion: 1,
  kind: "OFFICIAL_GA_CLOSURE",
  expectedCommitSha,
  officialOutputs,
  gates: Object.fromEntries(ledger.map((g) => [g.name, g.state])),
  reasons: Object.fromEntries(ledger.filter((g) => g.reason).map((g) => [g.name, g.reason])),
  groups: { ...verdict.groups, PHASE99_AGGREGATE: aggregate(ledger, "PHASE99_AGGREGATE") },
  releaseBlockerMatrix: blockers.map((b) => ({ gate: b.name, group: b.group, state: b.state, reason: b.reason })),
  gaReleaseReady,
  phase100Closure: closure,
};
try {
  writeFileSync(join(REPO, "phase100-ga-closure.json"), JSON.stringify(summary, null, 2) + "\n");
} catch { /* non-fatal */ }

// ── Exit code ─────────────────────────────────────────────────────────────────
//
// BLOCKED is the expected state and does NOT fail the build: the workflow proves
// the gate works, not that GA was approved. What DOES fail the build is the
// evaluator being unable to judge, evidence being supplied and invalid, or a
// repository-owned engineering gate failing.

const failures = evaluatorFailures(ledger, contradictions);

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
