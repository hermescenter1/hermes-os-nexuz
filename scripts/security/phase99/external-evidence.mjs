/**
 * PHASE 99 — sanitized external-evidence contracts.
 *
 * Phase 99 has gates that this repository cannot satisfy from the inside: an
 * independent penetration test, external application/API security reviews, and
 * a pilot customer's acceptance. Those are human, contractual acts. What the
 * repository CAN own is the shape of the evidence and a validator strict enough
 * that no self-produced artefact ever passes for the real thing.
 *
 * Nothing here stores a raw report. The public repository holds only an alias,
 * counts, closed enums, references and SHA-256 digests; the report itself lives
 * in an owner-controlled private channel (see docs/security/phase99-finding-handling.md).
 *
 * Missing external evidence resolves to BLOCKED — never PASS, never FAIL.
 */

import { createHash } from "node:crypto";
import { isHumanAuthorityRole, isSyntheticFixture } from "./finding-contract.mjs";

export const GATE_STATES = ["PASS", "BLOCKED", "FAIL"];

export const EXTERNAL_REVIEW_TYPES = [
  "INDEPENDENT_PENETRATION_TEST",
  "EXTERNAL_APPLICATION_SECURITY_REVIEW",
  "EXTERNAL_API_SECURITY_REVIEW",
];

export const ACCEPTANCE_DECISIONS = ["ACCEPTED", "REJECTED", "CONDITIONAL"];

const SHA256_HEX = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/;

/**
 * Canonical hash of a scope document. Line endings are normalised first so a
 * CRLF checkout on Windows and an LF checkout in CI produce the same digest —
 * otherwise the scope hash would be a platform artefact rather than a fact
 * about the agreed scope.
 */
export function computeScopeHash(text) {
  const normalised = String(text ?? "").replace(/\r\n/g, "\n").replace(/\s+$/g, "") + "\n";
  return createHash("sha256").update(normalised, "utf8").digest("hex");
}

/**
 * Validate one sanitized external-review attestation.
 *
 * `expectedCommitSha` is the release commit the review must have covered, and
 * `expectedScopeHash` the digest of the committed rules-of-engagement/scope
 * document. A review of some other tree, or of a scope nobody agreed to, is not
 * evidence about this release.
 */
export function validateExternalAttestation(a, { expectedCommitSha, expectedScopeHash } = {}) {
  const errors = [];
  const gates = {
    TESTED_COMMIT_MATCHES_EXPECTED_RELEASE: "FAIL",
    EXTERNAL_REVIEW_SCOPE_HASH_VALID: "FAIL",
    REPORT_HASH_VALID: "FAIL",
    REVIEW_DATE_PRESENT: "FAIL",
    REVIEWER_NOT_AGENT_ATTESTATION: "FAIL",
  };

  if (!a || typeof a !== "object") {
    return { ok: false, gates, errors: ["attestation is not an object"], synthetic: false };
  }

  const synthetic = isSyntheticFixture(a);
  if (synthetic) errors.push("SYNTHETIC_TEST_FIXTURE: this attestation can never satisfy an external gate");

  if (a.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!EXTERNAL_REVIEW_TYPES.includes(a.reviewType)) errors.push(`unknown reviewType '${a.reviewType}'`);
  if (typeof a.reviewerOrganizationAlias !== "string" || !a.reviewerOrganizationAlias.trim()) {
    errors.push("reviewerOrganizationAlias required (alias only — no customer or vendor identity beyond owner approval)");
  }

  // Gate: the reviewer must be an external human organisation, never this agent.
  if (isHumanAuthorityRole(a.reviewerRole) && !synthetic) gates.REVIEWER_NOT_AGENT_ATTESTATION = "PASS";
  else errors.push("REVIEWER_NOT_AGENT_ATTESTATION: reviewerRole must name an external human reviewer");

  if (ISO_DATE.test(String(a.reviewDate ?? ""))) gates.REVIEW_DATE_PRESENT = "PASS";
  else errors.push("REVIEW_DATE_PRESENT: reviewDate must be an ISO date");

  if (GIT_SHA.test(String(a.testedCommitSha ?? ""))) {
    if (!expectedCommitSha) {
      gates.TESTED_COMMIT_MATCHES_EXPECTED_RELEASE = "BLOCKED";
      errors.push("expected release commit not supplied — cannot bind the attestation to a release");
    } else if (a.testedCommitSha === expectedCommitSha) {
      gates.TESTED_COMMIT_MATCHES_EXPECTED_RELEASE = "PASS";
    } else {
      errors.push(`testedCommitSha ${a.testedCommitSha} does not match the expected release commit`);
    }
  } else {
    errors.push("testedCommitSha must be a 40-character git sha");
  }

  if (a.testedImageDigest !== null && a.testedImageDigest !== undefined) {
    if (!/^sha256:[a-f0-9]{64}$/.test(String(a.testedImageDigest))) errors.push("testedImageDigest must be sha256:<hex> or null");
  }

  if (SHA256_HEX.test(String(a.scopeHash ?? ""))) {
    if (!expectedScopeHash) {
      gates.EXTERNAL_REVIEW_SCOPE_HASH_VALID = "BLOCKED";
    } else if (a.scopeHash === expectedScopeHash) {
      gates.EXTERNAL_REVIEW_SCOPE_HASH_VALID = "PASS";
    } else {
      errors.push("scopeHash does not match the committed rules-of-engagement document");
    }
  } else {
    errors.push("scopeHash must be a sha256 hex digest");
  }

  if (typeof a.rawReportReference !== "string" || !a.rawReportReference.trim()) {
    errors.push("rawReportReference required (private channel reference — never the report body)");
  }
  if (SHA256_HEX.test(String(a.rawReportSha256 ?? ""))) gates.REPORT_HASH_VALID = "PASS";
  else errors.push("REPORT_HASH_VALID: rawReportSha256 must be a sha256 hex digest");

  for (const k of ["criticalCount", "highCount", "mediumCount", "lowCount", "infoCount"]) {
    if (!Number.isInteger(a[k]) || a[k] < 0) errors.push(`${k} must be a non-negative integer`);
  }

  if (typeof a.retestCompleted !== "boolean") errors.push("retestCompleted must be a boolean");
  if (a.retestCompleted === true) {
    if (typeof a.retestReportReference !== "string" || !a.retestReportReference.trim()) errors.push("retestReportReference required when retestCompleted");
    if (!SHA256_HEX.test(String(a.retestReportSha256 ?? ""))) errors.push("retestReportSha256 required when retestCompleted");
  }

  if (a.signedOrOwnerVerified !== true) errors.push("signedOrOwnerVerified must be true — the owner must confirm provenance");
  if (!ISO_DATE.test(String(a.recordedAt ?? ""))) errors.push("recordedAt must be an ISO date");

  assertNoSensitiveEvidence(a, errors);

  const ok = errors.length === 0 && Object.values(gates).every((g) => g === "PASS");
  return { ok, gates, errors, synthetic };
}

/** Validate a sanitized pilot-acceptance record. */
export function validatePilotAcceptance(p, { expectedCommitSha, expectedScopeHash } = {}) {
  const errors = [];
  if (!p || typeof p !== "object") return { ok: false, errors: ["pilot acceptance is not an object"], synthetic: false, decision: null };

  const synthetic = isSyntheticFixture(p);
  if (synthetic) errors.push("SYNTHETIC_TEST_FIXTURE: this record can never satisfy pilot acceptance");

  if (p.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (typeof p.pilotId !== "string" || !/^pilot-[a-z0-9-]{3,}$/.test(p.pilotId)) {
    errors.push("pilotId must be a safe alias of the form pilot-<slug> (never a customer name)");
  }
  if (!GIT_SHA.test(String(p.testedCommitSha ?? ""))) errors.push("testedCommitSha must be a 40-character git sha");
  else if (expectedCommitSha && p.testedCommitSha !== expectedCommitSha) errors.push("testedCommitSha does not match the expected release commit");

  if (p.testedImageDigest !== null && p.testedImageDigest !== undefined && !/^sha256:[a-f0-9]{64}$/.test(String(p.testedImageDigest))) {
    errors.push("testedImageDigest must be sha256:<hex> or null");
  }
  if (!SHA256_HEX.test(String(p.pilotScopeHash ?? ""))) errors.push("pilotScopeHash must be a sha256 hex digest");
  else if (expectedScopeHash && p.pilotScopeHash !== expectedScopeHash) errors.push("pilotScopeHash does not match the committed pilot plan");

  const uat = p.uatSummary;
  if (!uat || typeof uat !== "object") errors.push("uatSummary required");
  else {
    for (const k of ["total", "pass", "fail", "blocked", "acceptedWithLimitation", "notRun"]) {
      if (!Number.isInteger(uat[k]) || uat[k] < 0) errors.push(`uatSummary.${k} must be a non-negative integer`);
    }
    const sum = ["pass", "fail", "blocked", "acceptedWithLimitation", "notRun"].reduce((n, k) => n + (Number.isInteger(uat[k]) ? uat[k] : 0), 0);
    if (Number.isInteger(uat.total) && sum !== uat.total) errors.push("uatSummary counts do not sum to total");
  }

  for (const k of [
    "workflowValidationReference",
    "engineerFeedbackReference",
    "performanceObservationReference",
    "incidentSimulationReference",
    "acceptanceEvidenceReference",
  ]) {
    if (typeof p[k] !== "string" || !p[k].trim()) errors.push(`${k} required`);
  }
  if (p.onboardingCompleted !== true) errors.push("onboardingCompleted must be true for acceptance");
  if (p.supportProcessAccepted !== true) errors.push("supportProcessAccepted must be true for acceptance");
  if (!Array.isArray(p.knownLimitations)) errors.push("knownLimitations must be an array (may be empty)");
  if (!Number.isInteger(p.openBlockerCount) || p.openBlockerCount < 0) errors.push("openBlockerCount must be a non-negative integer");
  if (p.openBlockerCount > 0) errors.push("pilot acceptance cannot be recorded while blockers remain open");

  if (!ACCEPTANCE_DECISIONS.includes(p.acceptanceDecision)) errors.push(`unknown acceptanceDecision '${p.acceptanceDecision}'`);
  if (!isHumanAuthorityRole(p.acceptanceAuthorityRole)) errors.push("acceptanceAuthorityRole must name a human acceptance authority");
  if (!ISO_DATE.test(String(p.acceptanceDate ?? ""))) errors.push("acceptanceDate must be an ISO date");
  if (!SHA256_HEX.test(String(p.acceptanceEvidenceSha256 ?? ""))) errors.push("acceptanceEvidenceSha256 must be a sha256 hex digest");

  assertNoSensitiveEvidence(p, errors);

  const ok = errors.length === 0;
  return { ok, errors, synthetic, decision: p.acceptanceDecision ?? null };
}

/**
 * Resolve a gate from optional evidence. Absent evidence is BLOCKED, present but
 * invalid is FAIL, present and valid is PASS. A synthetic fixture is BLOCKED —
 * it is not a failure of the product, it simply is not evidence.
 */
export function resolveGate(evidence, validator) {
  if (evidence === null || evidence === undefined) return { state: "BLOCKED", reason: "no external evidence supplied", errors: [] };
  const v = validator(evidence);
  if (v.synthetic) return { state: "BLOCKED", reason: "SYNTHETIC_TEST_FIXTURE", errors: v.errors };
  if (v.ok) return { state: "PASS", reason: null, errors: [] };
  return { state: "FAIL", reason: "supplied evidence failed validation", errors: v.errors };
}

/**
 * Reject anything that looks like a credential, exploit payload or personal
 * datum inside a record that is destined for a PUBLIC repository.
 */
const FORBIDDEN_VALUE_PATTERNS = [
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: "private key" },
  { re: /\b(sk|pk)_(live|test)_[A-Za-z0-9]{10,}/, label: "provider api key" },
  { re: /\bwhsec_[A-Za-z0-9]{10,}/, label: "webhook signing secret" },
  { re: /\bAKIA[0-9A-Z]{16}\b/, label: "aws access key id" },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, label: "jwt" },
  { re: /<script\b/i, label: "script payload" },
  { re: /\bUNION\s+(ALL\s+)?SELECT\b/i, label: "sql injection payload" },
  { re: /\b\d{1,3}(?:\.\d{1,3}){3}\b/, label: "ip address" },
  { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, label: "email address" },
];

export function assertNoSensitiveEvidence(record, errors) {
  const walk = (value, path) => {
    if (typeof value === "string") {
      for (const p of FORBIDDEN_VALUE_PATTERNS) {
        if (p.re.test(value)) errors.push(`${path}: contains a ${p.label} — sanitized evidence only`);
      }
      return;
    }
    if (Array.isArray(value)) { value.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
    if (value && typeof value === "object") { for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`); }
  };
  walk(record, "record");
  return errors;
}
