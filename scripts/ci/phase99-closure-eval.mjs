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
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import {
  computeScopeHash,
  validateExternalAttestation,
  validatePilotAcceptance,
  resolveGate,
  EXTERNAL_REVIEW_TYPES,
} from "../security/phase99/external-evidence.mjs";
import { evaluateRegistry } from "../security/phase99/finding-contract.mjs";

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

const expectedCommitSha = expectedReleaseCommit();
const expectedScopeHash = computeScopeHash(read("docs/security/phase99-external-review-scope.md") ?? "");
const expectedPilotScopeHash = computeScopeHash(read("docs/pilot/phase99-pilot-plan.md") ?? "");

const attestations = readJson("docs/security/phase99-external-attestations.json")?.attestations ?? [];
const pilotAcceptance = readJson("docs/pilot/phase99-pilot-acceptance.json");
const registry = readJson("docs/security/phase99-findings.json");
const acceptances = readJson("docs/security/phase99-risk-acceptances.json")?.acceptances ?? {};

const gates = {};
const reasons = {};

function setGate(name, state, reason = null, errors = []) {
  gates[name] = state;
  if (reason) reasons[name] = reason;
  console.log(`RESULT phase99_${name}=${state}`);
  if (reason) console.log(`  ~ ${reason}`);
  for (const e of errors.slice(0, 6)) console.log(`  - ${e}`);
}

// ── External security reviews ─────────────────────────────────────────────────
const GATE_FOR_TYPE = {
  INDEPENDENT_PENETRATION_TEST: "INDEPENDENT_PENETRATION_TEST",
  EXTERNAL_APPLICATION_SECURITY_REVIEW: "EXTERNAL_APPLICATION_SECURITY_REVIEW",
  EXTERNAL_API_SECURITY_REVIEW: "EXTERNAL_API_SECURITY_REVIEW",
};

const externalCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

for (const type of EXTERNAL_REVIEW_TYPES) {
  const evidence = attestations.find((a) => a?.reviewType === type) ?? null;
  const gate = resolveGate(evidence, (a) => validateExternalAttestation(a, { expectedCommitSha, expectedScopeHash }));
  setGate(GATE_FOR_TYPE[type], gate.state, gate.reason ?? (gate.state === "BLOCKED" ? "no external evidence recorded for this review type" : null), gate.errors);
  if (gate.state === "PASS") {
    externalCounts.critical += evidence.criticalCount;
    externalCounts.high += evidence.highCount;
    externalCounts.medium += evidence.mediumCount;
    externalCounts.low += evidence.lowCount;
    externalCounts.info += evidence.infoCount;
  }
}

// ── Finding register (owned by this repository) ───────────────────────────────
let registrySummary = null;
if (!registry) {
  setGate("FINDING_REGISTER", "FAIL", "finding register missing");
} else {
  const result = evaluateRegistry(registry.findings, acceptances, { nowMs: Date.now() });
  registrySummary = result.summary;
  if (!result.ok) {
    setGate("FINDING_REGISTER", "FAIL", "finding register failed its own invariants", result.errors);
  } else {
    setGate("FINDING_REGISTER", "PASS");
  }
}

const criticalOpen = (registrySummary?.criticalOpen ?? 1) + externalCounts.critical;
const highOpen = registrySummary?.highOpen ?? 1;
const highAccepted = registrySummary?.highFormallyAccepted ?? 0;
const releaseBlockers = registrySummary?.releaseBlockers ?? 1;

setGate("CRITICAL_FINDINGS_ZERO", criticalOpen === 0 ? "PASS" : "FAIL", `CRITICAL_FINDINGS=${criticalOpen}`);
setGate(
  "HIGH_FINDINGS_RESOLVED",
  highOpen === 0 ? "PASS" : "FAIL",
  `HIGH_FINDINGS=${highOpen} open, ${highAccepted} formally accepted — each remaining HIGH needs a fix with retest evidence or a valid, unexpired owner risk acceptance`,
);

// ── Pilot ─────────────────────────────────────────────────────────────────────
const pilotGate = resolveGate(pilotAcceptance, (p) => validatePilotAcceptance(p, { expectedCommitSha, expectedScopeHash: expectedPilotScopeHash }));
setGate("PILOT_ACCEPTANCE", pilotGate.state, pilotGate.reason ?? (pilotGate.state === "BLOCKED" ? "no pilot acceptance recorded" : null), pilotGate.errors);

const pilotAccepted = pilotGate.state === "PASS" && pilotAcceptance?.acceptanceDecision === "ACCEPTED";
if (pilotGate.state === "PASS" && !pilotAccepted) {
  setGate("PILOT_ACCEPTANCE_DECISION", "FAIL", `acceptanceDecision=${pilotAcceptance?.acceptanceDecision} — official closure requires ACCEPTED`);
} else {
  setGate("PILOT_ACCEPTANCE_DECISION", pilotAccepted ? "PASS" : "BLOCKED", pilotAccepted ? null : "no accepted pilot record");
}

// Sub-gates that are evidenced BY the pilot acceptance record.
const PILOT_SUBGATES = {
  PILOT_CUSTOMER_SELECTED: () => (pilotAcceptance?.pilotId ? "PASS" : "BLOCKED"),
  PILOT_UAT: () => {
    const u = pilotAcceptance?.uatSummary;
    if (!u) return "BLOCKED";
    return u.fail === 0 && u.blocked === 0 && u.notRun === 0 ? "PASS" : "FAIL";
  },
  PILOT_WORKFLOW_VALIDATION: () => (pilotAcceptance?.workflowValidationReference ? "PASS" : "BLOCKED"),
  INDUSTRIAL_ENGINEER_FEEDBACK: () => (pilotAcceptance?.engineerFeedbackReference ? "RECORDED" : "BLOCKED"),
  PILOT_PERFORMANCE_OBSERVATION: () => (pilotAcceptance?.performanceObservationReference ? "PASS" : "BLOCKED"),
  PILOT_INCIDENT_SIMULATION: () => (pilotAcceptance?.incidentSimulationReference ? "PASS" : "BLOCKED"),
  PILOT_ONBOARDING: () => (pilotAcceptance?.onboardingCompleted === true ? "PASS" : "BLOCKED"),
  PILOT_SUPPORT_PROCESS: () => (pilotAcceptance?.supportProcessAccepted === true ? "PASS" : "BLOCKED"),
};
for (const [name, fn] of Object.entries(PILOT_SUBGATES)) {
  // A record that failed validation proves nothing, whatever fields it carries.
  const state = pilotGate.state === "PASS" ? fn() : "BLOCKED";
  setGate(name, state, state === "BLOCKED" ? "requires a validated pilot acceptance record" : null);
}

// ── Release blockers ──────────────────────────────────────────────────────────
const pilotBlocker = pilotAccepted ? 0 : 1;
const totalReleaseBlockers = releaseBlockers + pilotBlocker;
setGate(
  "RELEASE_BLOCKERS_ZERO",
  totalReleaseBlockers === 0 ? "PASS" : "FAIL",
  `RELEASE_BLOCKERS=${totalReleaseBlockers} (${releaseBlockers} open finding blocker(s)${pilotBlocker ? " + PILOT_ACCEPTANCE_MISSING" : ""})`,
);

// ── Official output block ─────────────────────────────────────────────────────
const officialOutputs = {
  INDEPENDENT_PENETRATION_TEST: gates.INDEPENDENT_PENETRATION_TEST,
  EXTERNAL_APPLICATION_SECURITY_REVIEW: gates.EXTERNAL_APPLICATION_SECURITY_REVIEW,
  EXTERNAL_API_SECURITY_REVIEW: gates.EXTERNAL_API_SECURITY_REVIEW,

  CRITICAL_FINDINGS: criticalOpen,
  HIGH_FINDINGS: highOpen,
  HIGH_FINDINGS_FORMALLY_ACCEPTED: highAccepted,
  MEDIUM_FINDINGS: (registrySummary?.bySeverity?.MEDIUM ?? 0) + externalCounts.medium,
  LOW_FINDINGS: (registrySummary?.bySeverity?.LOW ?? 0) + externalCounts.low,

  PILOT_CUSTOMER_SELECTED: gates.PILOT_CUSTOMER_SELECTED === "PASS" ? "YES" : "BLOCKED_OWNER",
  PILOT_UAT: gates.PILOT_UAT,
  PILOT_WORKFLOW_VALIDATION: gates.PILOT_WORKFLOW_VALIDATION,
  INDUSTRIAL_ENGINEER_FEEDBACK: gates.INDUSTRIAL_ENGINEER_FEEDBACK === "RECORDED" ? "RECORDED" : "BLOCKED_EXTERNAL",
  PILOT_PERFORMANCE_OBSERVATION: gates.PILOT_PERFORMANCE_OBSERVATION,
  PILOT_INCIDENT_SIMULATION: gates.PILOT_INCIDENT_SIMULATION,
  PILOT_ONBOARDING: gates.PILOT_ONBOARDING,
  PILOT_SUPPORT_PROCESS: gates.PILOT_SUPPORT_PROCESS,
  PILOT_ACCEPTANCE_RECORDED: pilotAccepted ? "True" : "False",

  RELEASE_BLOCKERS: totalReleaseBlockers,
};

console.log("");
console.log("── PHASE 99 OFFICIAL CLOSURE OUTPUTS ──");
for (const [k, v] of Object.entries(officialOutputs)) console.log(`${k}=${v}`);

const requiredPass = [
  "INDEPENDENT_PENETRATION_TEST",
  "EXTERNAL_APPLICATION_SECURITY_REVIEW",
  "EXTERNAL_API_SECURITY_REVIEW",
  "CRITICAL_FINDINGS_ZERO",
  "HIGH_FINDINGS_RESOLVED",
  "PILOT_ACCEPTANCE",
  "PILOT_ACCEPTANCE_DECISION",
  "PILOT_UAT",
  "PILOT_WORKFLOW_VALIDATION",
  "PILOT_PERFORMANCE_OBSERVATION",
  "PILOT_INCIDENT_SIMULATION",
  "PILOT_ONBOARDING",
  "PILOT_SUPPORT_PROCESS",
  "RELEASE_BLOCKERS_ZERO",
  "FINDING_REGISTER",
];
const notPass = requiredPass.filter((g) => gates[g] !== "PASS");
const engineerFeedbackOk = gates.INDUSTRIAL_ENGINEER_FEEDBACK === "RECORDED";
const closed = notPass.length === 0 && engineerFeedbackOk;

const summary = {
  phase: "99",
  schemaVersion: 1,
  kind: "OFFICIAL_CLOSURE",
  expectedCommitSha,
  gates,
  reasons,
  officialOutputs,
  blockedOrFailedGates: notPass.concat(engineerFeedbackOk ? [] : ["INDUSTRIAL_ENGINEER_FEEDBACK"]),
  phase99Complete: closed,
};
try {
  writeFileSync(join(REPO, "phase99-closure.json"), JSON.stringify(summary, null, 2) + "\n");
} catch { /* non-fatal */ }

console.log("");
console.log(`RESULT phase99_closure=${closed ? "PASS" : "BLOCKED"}`);
console.log(`RESULT phase99_external_gates_complete=${closed ? "YES" : "NO"}`);
if (!closed) {
  console.log(`RESULT phase99_outstanding=${summary.blockedOrFailedGates.join(",")}`);
  console.error("");
  console.error("[phase99-closure] Phase 99 is NOT closed. Missing external evidence is BLOCKED, not PASS —");
  console.error("[phase99-closure] it must be supplied by an authorised external reviewer and a pilot acceptance");
  console.error("[phase99-closure] authority, then validated here. Do not convert BLOCKED into PASS.");
}
process.exit(closed ? 0 : 1);
