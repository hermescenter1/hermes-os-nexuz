/**
 * PHASE 99 — closure evaluation ENGINE.
 *
 * Extracted verbatim from `scripts/ci/phase99-closure-eval.mjs` (PHASE 100) so
 * that the Phase 100 GA evaluator can consume the *same* verdict instead of
 * re-deriving it. Two evaluators that each decide "is Phase 99 closed?" would
 * eventually disagree, and the disagreement would be discovered by a release,
 * not by a test.
 *
 * The engine is pure: no filesystem, no clock, no process exit. The caller
 * supplies readers and `nowMs`, and renders the result. `scripts/ci/phase99-closure-eval.mjs`
 * remains the Phase 99 CLI and its output, artifact and exit code are unchanged.
 */

import {
  computeScopeHash,
  validateExternalAttestation,
  validatePilotAcceptance,
  resolveGate,
  EXTERNAL_REVIEW_TYPES,
} from "./external-evidence.mjs";
import { evaluateRegistry } from "./finding-contract.mjs";

/** Gate name per external review type. Kept explicit rather than derived. */
export const GATE_FOR_TYPE = {
  INDEPENDENT_PENETRATION_TEST: "INDEPENDENT_PENETRATION_TEST",
  EXTERNAL_APPLICATION_SECURITY_REVIEW: "EXTERNAL_APPLICATION_SECURITY_REVIEW",
  EXTERNAL_API_SECURITY_REVIEW: "EXTERNAL_API_SECURITY_REVIEW",
};

/** The gates that must all be PASS for Phase 99 to be closed. */
export const PHASE99_REQUIRED_PASS = [
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

/**
 * Evaluate Phase 99 closure.
 *
 * @param {{
 *   readText: (relPath: string) => string | null,
 *   readJson: (relPath: string) => any,
 *   expectedCommitSha: string | null,
 *   nowMs?: number,
 * }} io
 */
export function evaluatePhase99Closure({ readText, readJson, expectedCommitSha, nowMs = Date.now() }) {
  const expectedScopeHash = computeScopeHash(readText("docs/security/phase99-external-review-scope.md") ?? "");
  const expectedPilotScopeHash = computeScopeHash(readText("docs/pilot/phase99-pilot-plan.md") ?? "");

  const attestations = readJson("docs/security/phase99-external-attestations.json")?.attestations ?? [];
  const pilotAcceptance = readJson("docs/pilot/phase99-pilot-acceptance.json");
  const registry = readJson("docs/security/phase99-findings.json");
  const acceptances = readJson("docs/security/phase99-risk-acceptances.json")?.acceptances ?? {};

  const gates = {};
  const reasons = {};
  /** @type {{ name: string, state: string, reason: string | null, errors: string[] }[]} */
  const events = [];

  function setGate(name, state, reason = null, errors = []) {
    gates[name] = state;
    if (reason) reasons[name] = reason;
    events.push({ name, state, reason: reason ?? null, errors });
  }

  // ── External security reviews ───────────────────────────────────────────────
  const externalCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

  for (const type of EXTERNAL_REVIEW_TYPES) {
    const evidence = attestations.find((a) => a?.reviewType === type) ?? null;
    const gate = resolveGate(evidence, (a) => validateExternalAttestation(a, { expectedCommitSha, expectedScopeHash }));
    setGate(
      GATE_FOR_TYPE[type],
      gate.state,
      gate.reason ?? (gate.state === "BLOCKED" ? "no external evidence recorded for this review type" : null),
      gate.errors,
    );
    if (gate.state === "PASS") {
      externalCounts.critical += evidence.criticalCount;
      externalCounts.high += evidence.highCount;
      externalCounts.medium += evidence.mediumCount;
      externalCounts.low += evidence.lowCount;
      externalCounts.info += evidence.infoCount;
    }
  }

  // ── Finding register (owned by this repository) ─────────────────────────────
  let registrySummary = null;
  if (!registry) {
    setGate("FINDING_REGISTER", "FAIL", "finding register missing");
  } else {
    const result = evaluateRegistry(registry.findings, acceptances, { nowMs });
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

  // ── Pilot ───────────────────────────────────────────────────────────────────
  const pilotGate = resolveGate(pilotAcceptance, (p) =>
    validatePilotAcceptance(p, { expectedCommitSha, expectedScopeHash: expectedPilotScopeHash }),
  );
  setGate(
    "PILOT_ACCEPTANCE",
    pilotGate.state,
    pilotGate.reason ?? (pilotGate.state === "BLOCKED" ? "no pilot acceptance recorded" : null),
    pilotGate.errors,
  );

  const pilotAccepted = pilotGate.state === "PASS" && pilotAcceptance?.acceptanceDecision === "ACCEPTED";
  if (pilotGate.state === "PASS" && !pilotAccepted) {
    setGate(
      "PILOT_ACCEPTANCE_DECISION",
      "FAIL",
      `acceptanceDecision=${pilotAcceptance?.acceptanceDecision} — official closure requires ACCEPTED`,
    );
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

  // ── Release blockers ────────────────────────────────────────────────────────
  const pilotBlocker = pilotAccepted ? 0 : 1;
  const totalReleaseBlockers = releaseBlockers + pilotBlocker;
  setGate(
    "RELEASE_BLOCKERS_ZERO",
    totalReleaseBlockers === 0 ? "PASS" : "FAIL",
    `RELEASE_BLOCKERS=${totalReleaseBlockers} (${releaseBlockers} open finding blocker(s)${pilotBlocker ? " + PILOT_ACCEPTANCE_MISSING" : ""})`,
  );

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

  const notPass = PHASE99_REQUIRED_PASS.filter((g) => gates[g] !== "PASS");
  const engineerFeedbackOk = gates.INDUSTRIAL_ENGINEER_FEEDBACK === "RECORDED";
  const closed = notPass.length === 0 && engineerFeedbackOk;

  return {
    expectedCommitSha,
    expectedScopeHash,
    expectedPilotScopeHash,
    events,
    gates,
    reasons,
    registrySummary,
    registry,
    officialOutputs,
    externalCounts,
    criticalOpen,
    highOpen,
    releaseBlockers: totalReleaseBlockers,
    blockedOrFailedGates: notPass.concat(engineerFeedbackOk ? [] : ["INDUSTRIAL_ENGINEER_FEEDBACK"]),
    closed,
  };
}
