/**
 * PHASE 100 — GA closure evidence contracts.
 *
 * Phase 99 established the pattern: the repository owns the *shape* of evidence
 * and a validator strict enough that nothing self-produced ever passes for the
 * real thing, while the evidence itself is a human, contractual act performed
 * outside this codebase. Phase 100 extends that pattern to the gates GA needs
 * and Phase 99 never covered: legal/privacy approval, live model evaluation,
 * production backup operations, commercial owner decisions, infrastructure
 * prerequisites and the final GA authorization.
 *
 * Everything reusable is reused. `isHumanAuthorityRole`, `isSyntheticFixture`,
 * `assertNoSensitiveEvidence` and `resolveGate` come from the Phase 99 modules
 * unchanged; this file adds only what did not already exist.
 *
 * Three invariants hold for every validator here:
 *
 *   1. Absent evidence is BLOCKED — never PASS, never a warning.
 *   2. A record marked as a non-production fixture can never satisfy a gate,
 *      whatever else it contains.
 *   3. A record must be bound to the release commit and to the gate it claims
 *      to satisfy, so evidence cannot be moved between gates or between builds.
 *
 * No I/O, no clock reads except the caller-supplied `nowMs`, no network — so
 * every decision is reproducible and testable.
 */

import { isHumanAuthorityRole, isSyntheticFixture } from "../phase99/finding-contract.mjs";
import { assertNoSensitiveEvidence } from "../phase99/external-evidence.mjs";

/** Closed set of Phase 100 evidence documents. */
export const PHASE100_EVIDENCE_TYPES = [
  "LEGAL_PRIVACY",
  "LIVE_MODEL_EVALUATION",
  "BACKUP_OPERATIONS",
  "COMMERCIAL_DECISIONS",
  "INFRASTRUCTURE_PREREQUISITES",
  "GA_AUTHORIZATION",
  "RESIDUAL_FINDING_RISK",
];

const SHA256_HEX = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/;
/** Operational facts need a real instant, not just a day. */
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const SEMVER_TAG = /^v\d+\.\d+\.\d+$/;
const CURRENCY = /^[A-Z]{3}$/;

/**
 * Markers that make a record a NON-PRODUCTION fixture. The repository ships
 * examples so an owner can see the exact shape required; every one of them
 * carries at least one of these, and carrying one is disqualifying by
 * construction rather than by convention.
 */
export const NON_PRODUCTION_MARKERS = ["SYNTHETIC_TEST_FIXTURE", "EXAMPLE_ONLY", "NOT_EXTERNAL_ATTESTATION"];

/** True when a record is explicitly marked as an example/synthetic fixture. */
export function isNonProductionFixture(record) {
  if (!record || typeof record !== "object") return false;
  if (isSyntheticFixture(record)) return true;
  return NON_PRODUCTION_MARKERS.some((m) => record[m] === true);
}

/**
 * Strings that mean "nobody has actually decided this yet". A blank or
 * placeholder value beside an approval claim is the failure mode that produced
 * `V1_RELEASE_READY: YES` next to `<finalized after commit/push>` in the Phase 93
 * matrix, so it is rejected mechanically.
 */
const PLACEHOLDER_PATTERNS = [
  { re: /^\s*$/, label: "blank" },
  { re: /<[^>]{0,120}>/, label: "angle-bracket placeholder" },
  { re: /\bTBD\b/i, label: "TBD" },
  { re: /\bTODO\b/i, label: "TODO" },
  { re: /\bFIXME\b/i, label: "FIXME" },
  { re: /\bN\/A\b/i, label: "N/A" },
  { re: /\bPENDING\b/i, label: "PENDING" },
  { re: /\bPLACEHOLDER\b/i, label: "PLACEHOLDER" },
  { re: /\bCHANGE_?ME\b/i, label: "CHANGEME" },
  { re: /\bOWNER_DECISION_REQUIRED\b/i, label: "unresolved owner decision" },
  { re: /\b(?:COMMERCIAL_)?CONFIGURATION_REQUIRED\b/i, label: "unresolved configuration" },
  { re: /\bfinalized after\b/i, label: "deferred finalisation" },
  { re: /\blorem ipsum\b/i, label: "lorem ipsum" },
  { re: /^[-_.\s]+$/, label: "filler" },
];

/**
 * Reject placeholder text anywhere in a decision record. Keys are reported so
 * the owner can see exactly which field is still unfilled.
 */
export function assertNoPlaceholderDecision(record, errors, path = "record") {
  const walk = (value, at) => {
    if (typeof value === "string") {
      for (const p of PLACEHOLDER_PATTERNS) {
        if (p.re.test(value)) {
          errors.push(`${at}: PLACEHOLDER_OWNER_DECISION (${p.label}) — a decision record may not contain unfilled values`);
          return;
        }
      }
      return;
    }
    if (Array.isArray(value)) { value.forEach((v, i) => walk(v, `${at}[${i}]`)); return; }
    if (value && typeof value === "object") { for (const [k, v] of Object.entries(value)) walk(v, `${at}.${k}`); }
  };
  walk(record, path);
  return errors;
}

/** Shared checks every Phase 100 evidence document must satisfy. */
function validateEnvelope(record, { expectedEvidenceType, expectedCommitSha }, errors) {
  if (record.schemaVersion !== 1) errors.push("schemaVersion must be 1");

  // Evidence may not be moved between gates: the document names the gate it is for.
  if (!PHASE100_EVIDENCE_TYPES.includes(record.evidenceType)) {
    errors.push(`unknown evidenceType '${record.evidenceType}'`);
  } else if (expectedEvidenceType && record.evidenceType !== expectedEvidenceType) {
    errors.push(
      `EVIDENCE_TYPE_MISMATCH: this document declares '${record.evidenceType}' but was supplied for '${expectedEvidenceType}'`,
    );
  }

  if (!GIT_SHA.test(String(record.testedCommitSha ?? ""))) {
    errors.push("testedCommitSha must be a 40-character git sha");
  } else if (!expectedCommitSha) {
    errors.push("expected release commit not supplied — cannot bind the evidence to a release");
  } else if (record.testedCommitSha !== expectedCommitSha) {
    errors.push(`testedCommitSha ${record.testedCommitSha} does not match the expected release commit`);
  }

  if (!ISO_DATE.test(String(record.recordedAt ?? ""))) errors.push("recordedAt must be an ISO date");
  if (record.signedOrOwnerVerified !== true) {
    errors.push("signedOrOwnerVerified must be true — the owner must confirm provenance");
  }
}

/** An optional validity window; when present it must not have elapsed. */
function checkExpiry(value, label, nowMs, errors, { required = false } = {}) {
  if (value === null || value === undefined) {
    if (required) errors.push(`${label} required`);
    return;
  }
  if (!ISO_DATE.test(String(value))) { errors.push(`${label} must be an ISO date`); return; }
  if (Date.parse(String(value)) <= nowMs) errors.push(`${label}: evidence has EXPIRED and is no longer valid`);
}

/** Age bound for operational facts — a six-month-old backup proves nothing today. */
function checkFreshness(value, label, nowMs, maxAgeHours, errors) {
  if (!ISO_DATETIME.test(String(value ?? ""))) {
    errors.push(`${label} must be an ISO date-time (YYYY-MM-DDTHH:MM:SSZ)`);
    return;
  }
  const t = Date.parse(String(value));
  if (t > nowMs + 60 * 60 * 1000) { errors.push(`${label} is in the future`); return; }
  const ageHours = (nowMs - t) / 3_600_000;
  if (ageHours > maxAgeHours) {
    errors.push(`${label}: STALE_OPERATIONAL_EVIDENCE — ${Math.floor(ageHours)}h old, limit ${maxAgeHours}h`);
  }
}

function requireText(value, label, errors) {
  if (typeof value !== "string" || !value.trim()) errors.push(`${label} required`);
}
function requireDigest(value, label, errors) {
  if (!SHA256_HEX.test(String(value ?? ""))) errors.push(`${label} must be a sha256 hex digest`);
}
function requireHumanRole(value, label, errors) {
  if (!isHumanAuthorityRole(value)) errors.push(`${label} must name a human authority, never an agent or automation`);
}
function requireIsoDate(value, label, errors) {
  if (!ISO_DATE.test(String(value ?? ""))) errors.push(`${label} must be an ISO date`);
}
function requireNonNegativeInt(value, label, errors) {
  if (!Number.isInteger(value) || value < 0) errors.push(`${label} must be a non-negative integer`);
}

/**
 * Wrap a section validator so every Phase 100 gate behaves identically:
 * a fixture marker or an envelope failure always wins over field-level detail.
 */
function sectionValidator(document, { expectedEvidenceType, expectedCommitSha, nowMs }, fn) {
  return (section) => {
    const errors = [];
    if (!document || typeof document !== "object") {
      return { ok: false, errors: ["evidence document is not an object"], synthetic: false };
    }
    const synthetic = isNonProductionFixture(document) || isNonProductionFixture(section);
    if (synthetic) errors.push("NON_PRODUCTION_FIXTURE: an example record can never satisfy a GA gate");

    validateEnvelope(document, { expectedEvidenceType, expectedCommitSha }, errors);

    if (!section || typeof section !== "object") {
      errors.push("required evidence section is absent from the document");
      return { ok: false, errors, synthetic };
    }

    fn(section, errors, nowMs);
    assertNoSensitiveEvidence(section, errors);
    assertNoPlaceholderDecision(section, errors);

    return { ok: errors.length === 0, errors, synthetic };
  };
}

// ── Legal and privacy ─────────────────────────────────────────────────────────

export const LEGAL_REVIEW_TYPES = ["EXTERNAL_LEGAL_REVIEW", "EXTERNAL_PRIVACY_REVIEW"];
export const LEGAL_REVIEW_OUTCOMES = ["APPROVED", "APPROVED_WITH_CONDITIONS", "REJECTED"];
/** Mirrors `LegalDocumentType` in src/lib/compliance/types.ts. */
export const LEGAL_DOCUMENT_TYPES = [
  "PRIVACY_POLICY",
  "TERMS_OF_SERVICE",
  "COOKIE_POLICY",
  "DPA",
  "CANDIDATE_CONSENT",
  "ACADEMY_TERMS",
  "MARKETING_CONSENT",
];
/** Documents that must carry an approved version before a GA release. */
export const REQUIRED_LEGAL_DOCUMENTS = ["PRIVACY_POLICY", "TERMS_OF_SERVICE", "DPA"];
export const TRANSFER_MECHANISMS = [
  "STANDARD_CONTRACTUAL_CLAUSES",
  "ADEQUACY_DECISION",
  "BINDING_CORPORATE_RULES",
  "DEROGATION",
  "NO_INTERNATIONAL_TRANSFER",
];

/** One external legal or privacy review, issued by an independent reviewer. */
function validateLegalReviewSection(reviewType) {
  return (s, errors, nowMs) => {
    if (s.reviewType !== reviewType) errors.push(`REVIEW_TYPE_MISMATCH: expected ${reviewType}, got '${s.reviewType}'`);
    requireText(s.reviewerOrganizationAlias, "reviewerOrganizationAlias", errors);
    requireHumanRole(s.reviewerRole, "reviewerRole", errors);
    // A review performed by the party being reviewed is not an external review.
    if (s.independentReviewer !== true) {
      errors.push("independentReviewer must be true — an internal opinion is not an external legal or privacy review");
    }
    requireIsoDate(s.reviewDate, "reviewDate", errors);
    requireText(s.reportReference, "reportReference", errors);
    requireDigest(s.reportSha256, "reportSha256", errors);
    if (!LEGAL_REVIEW_OUTCOMES.includes(s.outcome)) errors.push(`unknown outcome '${s.outcome}'`);
    else if (s.outcome === "REJECTED") errors.push("outcome=REJECTED — the reviewer did not approve this release");
    checkExpiry(s.validityExpiresAt, "validityExpiresAt", nowMs, errors, { required: true });
  };
}

function validateApprovedLegalDocuments(s, errors) {
  const list = Array.isArray(s.approvedDocuments) ? s.approvedDocuments : null;
  if (!list) { errors.push("approvedDocuments must be an array"); return; }
  const seen = new Set();
  list.forEach((d, i) => {
    const at = `approvedDocuments[${i}]`;
    if (!LEGAL_DOCUMENT_TYPES.includes(d?.documentId)) errors.push(`${at}.documentId unknown '${d?.documentId}'`);
    else seen.add(d.documentId);
    requireText(d?.version, `${at}.version`, errors);
    requireIsoDate(d?.approvedAt, `${at}.approvedAt`, errors);
    requireDigest(d?.documentSha256, `${at}.documentSha256`, errors);
    requireHumanRole(d?.approvedByRole, `${at}.approvedByRole`, errors);
  });
  for (const required of REQUIRED_LEGAL_DOCUMENTS) {
    if (!seen.has(required)) errors.push(`approvedDocuments is missing a required document: ${required}`);
  }
}

function validateSubprocessorGovernance(s, errors) {
  requireText(s.registerReference, "registerReference", errors);
  requireDigest(s.registerSha256, "registerSha256", errors);
  requireNonNegativeInt(s.subprocessorCount, "subprocessorCount", errors);
  const mechanisms = Array.isArray(s.transferMechanisms) ? s.transferMechanisms : null;
  if (!mechanisms || mechanisms.length === 0) errors.push("transferMechanisms must be a non-empty array");
  else for (const m of mechanisms) if (!TRANSFER_MECHANISMS.includes(m)) errors.push(`unknown transfer mechanism '${m}'`);
  requireIsoDate(s.reviewedAt, "reviewedAt", errors);
  requireHumanRole(s.reviewedByRole, "reviewedByRole", errors);
}

function validateResidualLegalRisk(s, errors, nowMs) {
  if (s.decision !== "ACCEPT") errors.push("decision must be exactly ACCEPT");
  requireHumanRole(s.ownerAuthorityRole, "ownerAuthorityRole", errors);
  if (typeof s.reason !== "string" || s.reason.trim().length < 20) errors.push("reason must be a substantive justification");
  requireNonNegativeInt(s.residualRiskCount, "residualRiskCount", errors);
  requireIsoDate(s.acceptedAt, "acceptedAt", errors);
  checkExpiry(s.expiresAt, "expiresAt", nowMs, errors, { required: true });
  requireText(s.evidenceReference, "evidenceReference", errors);
  requireDigest(s.evidenceSha256, "evidenceSha256", errors);
}

/**
 * Build the five independently-resolvable legal/privacy gates from one document.
 * Each gate carries its own validator so a missing subprocessor register is
 * reported next to — never swallowed by — a missing legal review.
 */
export function legalPrivacyGateInputs(document, { expectedCommitSha, nowMs }) {
  const ctx = { expectedEvidenceType: "LEGAL_PRIVACY", expectedCommitSha, nowMs };
  const reviews = Array.isArray(document?.reviews) ? document.reviews : [];
  const find = (t) => reviews.find((r) => r?.reviewType === t) ?? null;

  return [
    {
      gate: "EXTERNAL_LEGAL_REVIEW",
      evidence: find("EXTERNAL_LEGAL_REVIEW"),
      validator: sectionValidator(document, ctx, validateLegalReviewSection("EXTERNAL_LEGAL_REVIEW")),
    },
    {
      gate: "EXTERNAL_PRIVACY_REVIEW",
      evidence: find("EXTERNAL_PRIVACY_REVIEW"),
      validator: sectionValidator(document, ctx, validateLegalReviewSection("EXTERNAL_PRIVACY_REVIEW")),
    },
    {
      gate: "APPROVED_LEGAL_DOCUMENT_VERSIONS",
      evidence: Array.isArray(document?.approvedDocuments) ? { approvedDocuments: document.approvedDocuments } : null,
      validator: sectionValidator(document, ctx, validateApprovedLegalDocuments),
    },
    {
      gate: "SUBPROCESSOR_AND_TRANSFER_GOVERNANCE",
      evidence: document?.subprocessorGovernance ?? null,
      validator: sectionValidator(document, ctx, validateSubprocessorGovernance),
    },
    {
      gate: "RESIDUAL_LEGAL_RISK_ACCEPTED",
      evidence: document?.residualLegalRiskAcceptance ?? null,
      validator: sectionValidator(document, ctx, validateResidualLegalRisk),
    },
  ];
}

// ── Live model evaluation ─────────────────────────────────────────────────────

export const EVALUATION_MODES = ["LIVE_PROVIDER", "OFFLINE_FIXTURE"];

/**
 * Live model-evaluation evidence.
 *
 * The distinction this gate exists to enforce: Phase 95 already proves the
 * governance library behaves correctly against an OFFLINE synthetic dataset,
 * and that proof is valuable — but it says nothing about how the pinned model
 * actually behaves. A record that describes an offline run can therefore never
 * satisfy this gate, however well-formed it is.
 */
function validateLiveModelEvaluation(s, errors, nowMs) {
  if (!EVALUATION_MODES.includes(s.evaluationMode)) {
    errors.push(`unknown evaluationMode '${s.evaluationMode}'`);
  } else if (s.evaluationMode !== "LIVE_PROVIDER") {
    errors.push("OFFLINE_EVIDENCE_FOR_LIVE_GATE: an offline fixture run is not live model evaluation evidence");
  }
  if (s.offlineFixtureOnly === true) {
    errors.push("OFFLINE_EVIDENCE_FOR_LIVE_GATE: offlineFixtureOnly=true contradicts a live evaluation claim");
  }
  if (!Number.isInteger(s.providerRequestCount) || s.providerRequestCount < 1) {
    errors.push("providerRequestCount must be a positive integer — a live run reaches the provider at least once");
  }

  // Environment / model / provider / version binding.
  requireText(s.evaluationEnvironment, "evaluationEnvironment", errors);
  requireText(s.provider, "provider", errors);
  requireText(s.modelId, "modelId", errors);
  requireText(s.modelVersion, "modelVersion", errors);
  requireText(s.governanceLibraryVersion, "governanceLibraryVersion", errors);
  requireText(s.datasetReference, "datasetReference", errors);
  requireDigest(s.datasetSha256, "datasetSha256", errors);
  requireText(s.runReference, "runReference", errors);
  requireDigest(s.runSha256, "runSha256", errors);
  requireIsoDate(s.evaluatedAt, "evaluatedAt", errors);
  if (!Number.isInteger(s.sampleCount) || s.sampleCount < 1) errors.push("sampleCount must be a positive integer");

  // Safety and unsupported-claim thresholds. Observed must be within budget and
  // the unsafe-output count must be exactly zero.
  const rate = (v, label) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
      errors.push(`${label} must be a number between 0 and 1`);
      return null;
    }
    return v;
  };
  const hObs = rate(s.hallucinationRateObserved, "hallucinationRateObserved");
  const hBudget = rate(s.hallucinationRateBudget, "hallucinationRateBudget");
  if (hObs !== null && hBudget !== null && hObs > hBudget) {
    errors.push(`HALLUCINATION_REGRESSION_OVER_BUDGET: observed ${hObs} > budget ${hBudget}`);
  }
  const uObs = rate(s.unsupportedClaimRateObserved, "unsupportedClaimRateObserved");
  const uBudget = rate(s.unsupportedClaimRateBudget, "unsupportedClaimRateBudget");
  if (uObs !== null && uBudget !== null && uObs > uBudget) {
    errors.push(`UNSUPPORTED_CLAIM_RATE_OVER_BUDGET: observed ${uObs} > budget ${uBudget}`);
  }
  if (!Number.isInteger(s.unsafeOutputCount) || s.unsafeOutputCount !== 0) {
    errors.push("unsafeOutputCount must be exactly 0");
  }

  const approval = s.ownerApproval;
  if (!approval || typeof approval !== "object") {
    errors.push("ownerApproval required — an evaluation result is not an approval");
  } else {
    if (approval.decision !== "APPROVED") errors.push("ownerApproval.decision must be exactly APPROVED");
    requireHumanRole(approval.ownerAuthorityRole, "ownerApproval.ownerAuthorityRole", errors);
    requireIsoDate(approval.approvedAt, "ownerApproval.approvedAt", errors);
  }
  checkExpiry(s.validityExpiresAt, "validityExpiresAt", nowMs, errors, { required: false });
}

export function liveModelEvaluationGateInput(document, { expectedCommitSha, nowMs }) {
  const ctx = { expectedEvidenceType: "LIVE_MODEL_EVALUATION", expectedCommitSha, nowMs };
  return {
    gate: "LIVE_MODEL_EVALUATION",
    evidence: document?.evaluation ?? null,
    validator: sectionValidator(document, ctx, validateLiveModelEvaluation),
  };
}

// ── Backup and disaster recovery operations ───────────────────────────────────

export const OFFHOST_LOCATION_CLASSES = [
  "SEPARATE_REGION_OBJECT_STORAGE",
  "SEPARATE_PROVIDER_OBJECT_STORAGE",
  "OFFLINE_MEDIA",
  "SEPARATE_PHYSICAL_SITE",
];
export const KEY_CUSTODY_MODELS = ["SPLIT_CUSTODY", "SEALED_ENVELOPE_OFFLINE", "HARDWARE_SECURITY_MODULE", "EXTERNAL_ESCROW"];
export const RECOVERY_TEST_TYPES = ["FULL_NODE_RECOVERY", "DATABASE_POINT_IN_TIME", "UPLOADS_RECOVERY", "FULL_STACK_REHEARSAL"];

/** Default freshness bounds. Overridable per call so tests need no clock tricks. */
export const BACKUP_FRESHNESS = {
  schedulerHours: 48,
  verificationHours: 168,
  offHostHours: 168,
  recoveryTestDays: 180,
};

function validateBackupScheduler(s, errors, nowMs, bounds) {
  requireText(s.mechanism, "mechanism", errors);
  checkFreshness(s.lastExecutedAt, "lastExecutedAt", nowMs, bounds.schedulerHours, errors);
  if (!Number.isInteger(s.consecutiveSuccessfulRuns) || s.consecutiveSuccessfulRuns < 1) {
    errors.push("consecutiveSuccessfulRuns must be a positive integer — a scheduler that has never run proves nothing");
  }
  requireNonNegativeInt(s.failedRunsSinceLastSuccess, "failedRunsSinceLastSuccess", errors);
  if (Number.isInteger(s.failedRunsSinceLastSuccess) && s.failedRunsSinceLastSuccess > 0) {
    errors.push("failedRunsSinceLastSuccess must be 0 at the moment the evidence is recorded");
  }
  requireText(s.evidenceReference, "evidenceReference", errors);
  requireDigest(s.evidenceSha256, "evidenceSha256", errors);
  requireHumanRole(s.confirmedByRole, "confirmedByRole", errors);
}

function validateLatestBackupVerification(s, errors, nowMs, bounds) {
  checkFreshness(s.verifiedAt, "verifiedAt", nowMs, bounds.verificationHours, errors);
  requireDigest(s.artifactSha256, "artifactSha256", errors);
  requireText(s.verificationTool, "verificationTool", errors);
  if (s.encrypted !== true) errors.push("encrypted must be true — an unencrypted production backup is not acceptable evidence");
  if (s.cipher !== "aes-256-gcm") errors.push("cipher must be aes-256-gcm (the Phase 98 backup envelope cipher)");
  if (s.verificationResult !== "PASS") errors.push(`verificationResult must be PASS, got '${s.verificationResult}'`);
  requireNonNegativeInt(s.artifactSizeBytes, "artifactSizeBytes", errors);
  if (Number.isInteger(s.artifactSizeBytes) && s.artifactSizeBytes === 0) errors.push("artifactSizeBytes must be greater than 0");
}

function validateOffHostCopy(s, errors, nowMs, bounds) {
  if (!OFFHOST_LOCATION_CLASSES.includes(s.locationClass)) {
    errors.push(`unknown locationClass '${s.locationClass}' — record a class, never an address or credential`);
  }
  checkFreshness(s.copiedAt, "copiedAt", nowMs, bounds.offHostHours, errors);
  requireDigest(s.artifactSha256, "artifactSha256", errors);
  // A copy nobody verified is a copy nobody can restore from.
  if (s.integrityVerified !== true) {
    errors.push("OFFHOST_COPY_WITHOUT_INTEGRITY_PROOF: integrityVerified must be true");
  }
  requireText(s.integrityMethod, "integrityMethod", errors);
  requireDigest(s.verifiedCopySha256, "verifiedCopySha256", errors);
  if (SHA256_HEX.test(String(s.artifactSha256 ?? "")) && SHA256_HEX.test(String(s.verifiedCopySha256 ?? ""))) {
    if (s.artifactSha256 !== s.verifiedCopySha256) {
      errors.push("OFFHOST_COPY_WITHOUT_INTEGRITY_PROOF: the off-host copy digest does not match the source artifact digest");
    }
  }
  requireHumanRole(s.confirmedByRole, "confirmedByRole", errors);
}

function validateRecoveryTest(s, errors, nowMs, bounds) {
  if (!RECOVERY_TEST_TYPES.includes(s.recoveryType)) errors.push(`unknown recoveryType '${s.recoveryType}'`);
  checkFreshness(s.testedAt, "testedAt", nowMs, bounds.recoveryTestDays * 24, errors);
  if (s.integrityCheck !== "PASS") errors.push(`integrityCheck must be PASS, got '${s.integrityCheck}'`);
  if (typeof s.rtoMinutes !== "number" || !(s.rtoMinutes > 0)) errors.push("rtoMinutes must be a positive number");
  if (typeof s.rpoHours !== "number" || !(s.rpoHours >= 0)) errors.push("rpoHours must be a non-negative number");
  requireText(s.evidenceReference, "evidenceReference", errors);
  requireDigest(s.evidenceSha256, "evidenceSha256", errors);
  requireHumanRole(s.confirmedByRole, "confirmedByRole", errors);
}

/**
 * Recovery-key custody. This record confirms WHO holds the key material and
 * under what model — it must never carry the material itself, so any field that
 * looks like key content is rejected outright in addition to the shared
 * sensitive-evidence scan.
 */
function validateKeyCustody(s, errors) {
  if (!KEY_CUSTODY_MODELS.includes(s.custodyModel)) errors.push(`unknown custodyModel '${s.custodyModel}'`);
  requireHumanRole(s.custodianRole, "custodianRole", errors);
  requireHumanRole(s.backupCustodianRole, "backupCustodianRole", errors);
  requireIsoDate(s.confirmedAt, "confirmedAt", errors);
  if (s.keyMaterialInRepository !== false) {
    errors.push("keyMaterialInRepository must be explicitly false");
  }
  for (const forbidden of ["keyMaterial", "privateKey", "recoveryKey", "passphrase", "secret", "unsealKey"]) {
    if (forbidden in s) errors.push(`${forbidden} must not appear in repository evidence — record custody, never key content`);
  }
  requireText(s.custodyEvidenceReference, "custodyEvidenceReference", errors);
  requireDigest(s.custodyEvidenceSha256, "custodyEvidenceSha256", errors);
}

export function backupOperationalGateInputs(document, { expectedCommitSha, nowMs, bounds = BACKUP_FRESHNESS }) {
  const ctx = { expectedEvidenceType: "BACKUP_OPERATIONS", expectedCommitSha, nowMs };
  return [
    {
      gate: "BACKUP_SCHEDULER_EXECUTED",
      evidence: document?.scheduler ?? null,
      validator: sectionValidator(document, ctx, (s, e, n) => validateBackupScheduler(s, e, n, bounds)),
    },
    {
      gate: "LATEST_BACKUP_VERIFIED",
      evidence: document?.latestBackupVerification ?? null,
      validator: sectionValidator(document, ctx, (s, e, n) => validateLatestBackupVerification(s, e, n, bounds)),
    },
    {
      gate: "OFFHOST_COPY_VERIFIED",
      evidence: document?.offHostCopy ?? null,
      validator: sectionValidator(document, ctx, (s, e, n) => validateOffHostCopy(s, e, n, bounds)),
    },
    {
      gate: "RECOVERY_TESTED",
      evidence: document?.recoveryTest ?? null,
      validator: sectionValidator(document, ctx, (s, e, n) => validateRecoveryTest(s, e, n, bounds)),
    },
    {
      gate: "RECOVERY_KEY_CUSTODY_CONFIRMED",
      evidence: document?.keyCustody ?? null,
      validator: sectionValidator(document, ctx, (s, e) => validateKeyCustody(s, e)),
    },
  ];
}

// ── Commercial owner decisions ────────────────────────────────────────────────

/**
 * Every provider/mode/activation value the schema RECOGNISES. Recognising a
 * value and accepting it for GA are different things — see below.
 */
export const PAYMENT_PROVIDERS = ["STRIPE", "NONE"];
export const PAYMENT_MODES = ["LIVE", "TEST"];
export const TAX_HANDLING_MODELS = ["PROVIDER_AUTOMATIC_TAX", "MANUAL_TAX_TABLE", "OUT_OF_SCOPE_B2B_REVERSE_CHARGE", "NOT_APPLICABLE"];
export const BILLING_ACTIVATION_DECISIONS = ["ACTIVATED", "DEFERRED"];

/**
 * ── The owner's commercial decision, made explicit ───────────────────────────
 *
 * Hermes GA is a PAID commercial general availability. That single fact settles
 * what had been left ambiguous, and the ambiguity was dangerous: the schema
 * recognised `provider: NONE`, `mode: TEST` and `activationDecision: DEFERRED`,
 * and nothing cross-checked them against each other. A document could therefore
 * declare `NONE`/`TEST` and still satisfy PAYMENT_PROVIDER_DECISION, or declare
 * billing ACTIVATED beside a provider of NONE — a paid GA with no way to take
 * payment, reported as a passing gate.
 *
 * So the values stay recognised, for diagnostics: an owner who has genuinely
 * deferred billing gets a precise, honest reading of their document rather than
 * a schema error. What changes is that none of them can PASS a commercial GA.
 *
 * The GA-passing combination is exactly one, and it must be coherent ACROSS
 * sections, because each half is useless alone: a LIVE Stripe configuration
 * nobody switched on takes no money, and an ACTIVATED flag with no configured
 * provider takes no money either.
 */
export const GA_COMMERCIAL_REQUIREMENTS = {
  provider: "STRIPE",
  mode: "LIVE",
  webhookEndpointConfigured: true,
  webhookSigningSecretConfigured: true,
  activationDecision: "ACTIVATED",
};

/** Values recognised by the schema that can never satisfy a commercial GA. */
export const NON_GA_COMMERCIAL_VALUES = {
  provider: ["NONE"],
  mode: ["TEST"],
  activationDecision: ["DEFERRED"],
};

function ownerDecisionFields(s, errors) {
  if (s.decision !== "APPROVED") errors.push(`decision must be exactly APPROVED, got '${s.decision}'`);
  requireHumanRole(s.ownerAuthorityRole, "ownerAuthorityRole", errors);
  requireIsoDate(s.decidedAt, "decidedAt", errors);
}

function validatePricingDecision(s, errors) {
  ownerDecisionFields(s, errors);
  requireText(s.planRegistryReference, "planRegistryReference", errors);
  requireDigest(s.planRegistrySha256, "planRegistrySha256", errors);
  if (!Number.isInteger(s.pricedPlanCount) || s.pricedPlanCount < 1) {
    errors.push("pricedPlanCount must be a positive integer — a pricing decision prices at least one plan");
  }
  const currencies = Array.isArray(s.currencies) ? s.currencies : null;
  if (!currencies || currencies.length === 0) errors.push("currencies must be a non-empty array of ISO 4217 codes");
  else for (const c of currencies) if (!CURRENCY.test(String(c))) errors.push(`invalid currency code '${c}'`);
  if (s.unresolvedPlanLimitCount !== 0) {
    errors.push("unresolvedPlanLimitCount must be 0 — every plan limit must carry an owner-decided value");
  }
}

function validatePaymentProviderDecision(s, errors) {
  ownerDecisionFields(s, errors);

  if (!PAYMENT_PROVIDERS.includes(s.provider)) errors.push(`unknown provider '${s.provider}'`);
  else if (s.provider !== GA_COMMERCIAL_REQUIREMENTS.provider) {
    errors.push(
      `COMMERCIAL_GA_REQUIRES_PAYMENT_PROVIDER: provider='${s.provider}' cannot support a paid GA — ` +
      `a commercial general availability requires ${GA_COMMERCIAL_REQUIREMENTS.provider}`,
    );
  }

  if (!PAYMENT_MODES.includes(s.mode)) errors.push(`unknown mode '${s.mode}'`);
  else if (s.mode !== GA_COMMERCIAL_REQUIREMENTS.mode) {
    errors.push(
      `COMMERCIAL_GA_REQUIRES_LIVE_MODE: mode='${s.mode}' takes no real payment — ` +
      "a paid GA cannot ship against a test-mode payment configuration",
    );
  }

  if (s.webhookEndpointConfigured !== true) errors.push("webhookEndpointConfigured must be true");
  if (s.webhookSigningSecretConfigured !== true) errors.push("webhookSigningSecretConfigured must be true");
  requireText(s.configurationEvidenceReference, "configurationEvidenceReference", errors);
  requireDigest(s.configurationEvidenceSha256, "configurationEvidenceSha256", errors);
}

function validateTaxCurrencyRefundDecision(s, errors) {
  ownerDecisionFields(s, errors);
  if (!TAX_HANDLING_MODELS.includes(s.taxHandling)) errors.push(`unknown taxHandling '${s.taxHandling}'`);
  const currencies = Array.isArray(s.settlementCurrencies) ? s.settlementCurrencies : null;
  if (!currencies || currencies.length === 0) errors.push("settlementCurrencies must be a non-empty array");
  else for (const c of currencies) if (!CURRENCY.test(String(c))) errors.push(`invalid currency code '${c}'`);
  requireText(s.refundPolicyReference, "refundPolicyReference", errors);
  requireDigest(s.refundPolicySha256, "refundPolicySha256", errors);
  if (!Number.isInteger(s.refundWindowDays) || s.refundWindowDays < 0) errors.push("refundWindowDays must be a non-negative integer");
}

/**
 * Production billing activation is a SEPARATE gate from every code-readiness
 * signal in this repository. Phase 96 proves the billing code is correct; it
 * cannot prove that live billing is switched on, and the two must never be
 * conflated.
 */
function validateBillingActivation(s, errors) {
  if (!BILLING_ACTIVATION_DECISIONS.includes(s.activationDecision)) {
    errors.push(`unknown activationDecision '${s.activationDecision}'`);
  } else if (s.activationDecision !== "ACTIVATED") {
    errors.push(`PRODUCTION_BILLING_NOT_ACTIVATED: activationDecision=${s.activationDecision}`);
  }
  requireHumanRole(s.ownerAuthorityRole, "ownerAuthorityRole", errors);
  requireIsoDate(s.decidedAt, "decidedAt", errors);
  if (s.separatedFromCodeReadiness !== true) {
    errors.push("separatedFromCodeReadiness must be true — this decision is not implied by any CI result");
  }
  requireText(s.activationEvidenceReference, "activationEvidenceReference", errors);
  requireDigest(s.activationEvidenceSha256, "activationEvidenceSha256", errors);
}

/**
 * Contradictions no single section can see.
 *
 * Each section validator judges its own fields, so a document can be composed
 * entirely of individually-valid sections that together describe something
 * impossible — billing switched ON with no payment provider, a LIVE Stripe
 * configuration with billing DEFERRED, prices quoted in a currency that is never
 * settled. Those are the failures that reach production, because every
 * individual gate reported green.
 *
 * Absence is NOT a contradiction: a missing document has nothing to contradict,
 * and its absence is already counted once by the four commercial gates. Adding a
 * second blocker for the same absence is the double-counting this phase removes.
 *
 * @returns {string[]} one message per contradiction; empty when coherent
 */
export function commercialCoherenceViolations(document) {
  if (!document || typeof document !== "object") return [];

  const pay = document.paymentProvider;
  const act = document.productionBillingActivation;
  const pricing = document.pricing;
  const tax = document.taxCurrencyRefund;
  const violations = [];
  const isObj = (v) => v !== null && typeof v === "object";

  const provider = isObj(pay) ? pay.provider : undefined;
  const mode = isObj(pay) ? pay.mode : undefined;
  const activation = isObj(act) ? act.activationDecision : undefined;

  if (activation === "ACTIVATED" && provider !== undefined && provider !== GA_COMMERCIAL_REQUIREMENTS.provider) {
    violations.push(
      `COMMERCIAL_INCOHERENCE: production billing is ACTIVATED while the payment provider is '${provider}' — ` +
      "billing cannot be active with no provider able to take payment",
    );
  }
  if (activation === "ACTIVATED" && mode !== undefined && mode !== GA_COMMERCIAL_REQUIREMENTS.mode) {
    violations.push(
      `COMMERCIAL_INCOHERENCE: production billing is ACTIVATED while the payment mode is '${mode}' — ` +
      "a test-mode configuration cannot carry live revenue",
    );
  }
  if (activation === "DEFERRED" && provider === GA_COMMERCIAL_REQUIREMENTS.provider && mode === GA_COMMERCIAL_REQUIREMENTS.mode) {
    violations.push(
      "COMMERCIAL_INCOHERENCE: a LIVE payment provider is configured while production billing activation is DEFERRED — " +
      "a paid GA cannot ship with billing switched off",
    );
  }
  if (activation === "ACTIVATED" && isObj(pay)) {
    if (pay.webhookEndpointConfigured !== true) {
      violations.push("COMMERCIAL_INCOHERENCE: production billing is ACTIVATED with no configured webhook endpoint");
    }
    if (pay.webhookSigningSecretConfigured !== true) {
      violations.push(
        "COMMERCIAL_INCOHERENCE: production billing is ACTIVATED with no configured webhook signing secret — " +
        "unverified webhooks cannot be trusted to move money",
      );
    }
  }

  // A price nobody can settle is not a price.
  if (isObj(pricing) && isObj(tax) && Array.isArray(pricing.currencies) && Array.isArray(tax.settlementCurrencies)) {
    const settled = new Set(tax.settlementCurrencies.map((c) => String(c)));
    for (const c of pricing.currencies) {
      if (!settled.has(String(c))) {
        violations.push(`COMMERCIAL_INCOHERENCE: plans are priced in ${String(c)} but it is not a settlement currency`);
      }
    }
  }

  return violations;
}

export function commercialGateInputs(document, { expectedCommitSha, nowMs }) {
  const ctx = { expectedEvidenceType: "COMMERCIAL_DECISIONS", expectedCommitSha, nowMs };
  return [
    { gate: "PRICING_DECISION", evidence: document?.pricing ?? null, validator: sectionValidator(document, ctx, validatePricingDecision) },
    {
      gate: "PAYMENT_PROVIDER_DECISION",
      evidence: document?.paymentProvider ?? null,
      validator: sectionValidator(document, ctx, validatePaymentProviderDecision),
    },
    {
      gate: "TAX_CURRENCY_REFUND_DECISION",
      evidence: document?.taxCurrencyRefund ?? null,
      validator: sectionValidator(document, ctx, validateTaxCurrencyRefundDecision),
    },
    {
      gate: "PRODUCTION_BILLING_ACTIVATION",
      evidence: document?.productionBillingActivation ?? null,
      validator: sectionValidator(document, ctx, validateBillingActivation),
    },
  ];
}

// ── Infrastructure prerequisites (OpenBao / production) ───────────────────────

export const PRIVATE_TRANSPORTS = ["WIREGUARD", "MUTUAL_TLS", "PRIVATE_NETWORK_SEGMENT"];
export const SECRET_BACKENDS = ["OPENBAO", "DISABLED"];

function validatePrivateTransport(s, errors) {
  if (!PRIVATE_TRANSPORTS.includes(s.transport)) {
    errors.push(`transport must be one of ${PRIVATE_TRANSPORTS.join("/")} — public or plaintext transport is not acceptable`);
  }
  if (s.publiclyReachable !== false) errors.push("publiclyReachable must be explicitly false");
  requireIsoDate(s.confirmedAt, "confirmedAt", errors);
  requireHumanRole(s.confirmedByRole, "confirmedByRole", errors);
  requireText(s.evidenceReference, "evidenceReference", errors);
  requireDigest(s.evidenceSha256, "evidenceSha256", errors);
}

/**
 * The secret-backend activation decision. Unlike the other gates, BOTH outcomes
 * are legitimate: the platform is proven to fail closed with the backend
 * disabled, so an explicit owner decision to ship with `DISABLED` is a real
 * decision. What is never acceptable is the absence of a decision.
 */
function validateSecretBackendDecision(s, errors) {
  if (!SECRET_BACKENDS.includes(s.backend)) errors.push(`unknown backend '${s.backend}'`);
  if (s.decision !== "DECIDED") errors.push("decision must be exactly DECIDED");
  requireHumanRole(s.ownerAuthorityRole, "ownerAuthorityRole", errors);
  requireIsoDate(s.decidedAt, "decidedAt", errors);
  if (typeof s.failClosedWhenUnavailable !== "boolean") errors.push("failClosedWhenUnavailable must be a boolean");
  else if (s.failClosedWhenUnavailable !== true) errors.push("failClosedWhenUnavailable must be true");
  requireText(s.rationale, "rationale", errors);
  if (s.backend === "OPENBAO" && s.privateTransportRequired !== true) {
    errors.push("privateTransportRequired must be true when the OpenBao backend is enabled");
  }
}

function validateCredentialOwnership(s, errors) {
  requireHumanRole(s.credentialOwnerRole, "credentialOwnerRole", errors);
  requireHumanRole(s.recoveryOwnerRole, "recoveryOwnerRole", errors);
  if (!KEY_CUSTODY_MODELS.includes(s.unsealCustodyModel)) errors.push(`unknown unsealCustodyModel '${s.unsealCustodyModel}'`);
  requireIsoDate(s.confirmedAt, "confirmedAt", errors);
  requireText(s.runbookReference, "runbookReference", errors);
  requireDigest(s.runbookSha256, "runbookSha256", errors);
  for (const forbidden of ["rootToken", "unsealKey", "approleSecretId", "token"]) {
    if (forbidden in s) errors.push(`${forbidden} must not appear in repository evidence`);
  }
}

function validatePrerequisiteChecklist(s, errors) {
  const list = Array.isArray(s.prerequisites) ? s.prerequisites : null;
  if (!list || list.length === 0) { errors.push("prerequisites must be a non-empty array"); return; }
  list.forEach((p, i) => {
    const at = `prerequisites[${i}]`;
    requireText(p?.id, `${at}.id`, errors);
    requireText(p?.description, `${at}.description`, errors);
    if (p?.status !== "COMPLETE") errors.push(`${at}.status must be COMPLETE, got '${p?.status}'`);
    requireIsoDate(p?.verifiedAt, `${at}.verifiedAt`, errors);
    requireHumanRole(p?.verifiedByRole, `${at}.verifiedByRole`, errors);
  });
}

export function infrastructurePrerequisiteGateInputs(document, { expectedCommitSha, nowMs }) {
  const ctx = { expectedEvidenceType: "INFRASTRUCTURE_PREREQUISITES", expectedCommitSha, nowMs };
  return [
    {
      gate: "PRIVATE_TRANSPORT_CONFIRMED",
      evidence: document?.privateTransport ?? null,
      validator: sectionValidator(document, ctx, validatePrivateTransport),
    },
    {
      gate: "SECRET_BACKEND_ACTIVATION_DECISION",
      evidence: document?.secretBackend ?? null,
      validator: sectionValidator(document, ctx, validateSecretBackendDecision),
    },
    {
      gate: "CREDENTIAL_AND_RECOVERY_OWNERSHIP",
      evidence: document?.credentialOwnership ?? null,
      validator: sectionValidator(document, ctx, validateCredentialOwnership),
    },
    {
      gate: "INFRASTRUCTURE_PREREQUISITES_COMPLETE",
      evidence: Array.isArray(document?.prerequisites) ? { prerequisites: document.prerequisites } : null,
      validator: sectionValidator(document, ctx, validatePrerequisiteChecklist),
    },
  ];
}

// ── Residual (lower-severity) finding risk acceptance ─────────────────────────

export const RESIDUAL_SEVERITIES = ["MEDIUM", "LOW", "INFO"];
const FINDING_ID = /^P99-(?:INT|EXT|DEP|INF|PLT)-\d{3,}$/;

/**
 * Formal acceptance of an unresolved LOWER-severity finding.
 *
 * Phase 99's `validateRiskAcceptance` deliberately restricts formal acceptance
 * to HIGH; MEDIUM/LOW/INFO residuals had no gate at all, which is fine for a
 * security phase and not fine for a GA release. This is a separate contract
 * over a separate key so Phase 99 semantics are untouched.
 *
 * @param {unknown} a
 * @param {{ nowMs?: number, expectedFindingId?: string | null }} [options]
 * @returns {{ ok: boolean, errors: string[], synthetic: boolean }}
 */
export function validateResidualRiskAcceptance(a, { nowMs = Date.now(), expectedFindingId = null } = {}) {
  const errors = [];
  if (!a || typeof a !== "object") return { ok: false, errors: ["residual risk acceptance is not an object"], synthetic: false };

  const synthetic = isNonProductionFixture(a);
  if (synthetic) errors.push("NON_PRODUCTION_FIXTURE: an example record can never accept residual risk");

  if (!FINDING_ID.test(String(a.findingId ?? ""))) errors.push("findingId invalid");
  else if (expectedFindingId && a.findingId !== expectedFindingId) {
    errors.push(`EVIDENCE_TYPE_MISMATCH: acceptance is for ${a.findingId}, supplied for ${expectedFindingId}`);
  }
  if (!RESIDUAL_SEVERITIES.includes(a.severity)) {
    errors.push(`residual acceptance covers ${RESIDUAL_SEVERITIES.join("/")} only, got '${a.severity}'`);
  }
  if (a.decision !== "ACCEPT") errors.push("decision must be exactly ACCEPT");
  requireHumanRole(a.ownerAuthorityRole, "ownerAuthorityRole", errors);
  if (typeof a.reason !== "string" || a.reason.trim().length < 20) errors.push("reason must be a substantive justification");
  if (!Array.isArray(a.compensatingControls) || a.compensatingControls.length === 0) errors.push("compensatingControls required");
  requireIsoDate(a.acceptedAt, "acceptedAt", errors);
  checkExpiry(a.expiresAt, "expiresAt", nowMs, errors, { required: true });
  requireText(a.evidenceReference, "evidenceReference", errors);
  requireDigest(a.evidenceSha256, "evidenceSha256", errors);

  // ── A temporary acceptance must be genuinely temporary ────────────────────
  //
  // An acceptance with an expiry but no remediation plan is not a deferral, it
  // is a silent permanent waiver with a date on it. So the record must also name
  // who will fix it, what the fix is, and when — and the timing must actually
  // make sense relative to the acceptance window.
  requireHumanRole(a.remediationOwnerRole, "remediationOwnerRole", errors);
  requireText(a.remediationPlanReference, "remediationPlanReference", errors);
  requireIsoDate(a.targetRemediationDate, "targetRemediationDate", errors);

  const accepted = ISO_DATE.test(String(a.acceptedAt ?? "")) ? Date.parse(String(a.acceptedAt)) : null;
  const expires = ISO_DATE.test(String(a.expiresAt ?? "")) ? Date.parse(String(a.expiresAt)) : null;
  const target = ISO_DATE.test(String(a.targetRemediationDate ?? "")) ? Date.parse(String(a.targetRemediationDate)) : null;

  if (target !== null && expires !== null && target > expires) {
    errors.push(
      "INVALID_REMEDIATION_TIMING: targetRemediationDate is after expiresAt — the acceptance would lapse before the fix is due",
    );
  }
  if (target !== null && accepted !== null && target < accepted) {
    errors.push("INVALID_REMEDIATION_TIMING: targetRemediationDate precedes acceptedAt");
  }
  if (target !== null && target <= nowMs) {
    errors.push("INVALID_REMEDIATION_TIMING: targetRemediationDate has already passed — the remediation is overdue, not planned");
  }

  // ── Blanket acceptance ────────────────────────────────────────────────────
  //
  // An acceptance is per-finding. A record that claims to cover a class, a
  // wildcard or "all remaining" findings is not an owner decision about a known
  // risk — it is a decision to stop looking.
  if (a.appliesToAll === true || a.blanket === true) {
    errors.push("BLANKET_ACCEPTANCE: an acceptance must name exactly one findingId, never a class of findings");
  }
  if (Array.isArray(a.findingIds) || Array.isArray(a.findingId)) {
    errors.push("BLANKET_ACCEPTANCE: findingId must be a single finding identifier, not a list");
  }
  if (typeof a.findingId === "string" && /[*?]|\ball\b/i.test(a.findingId)) {
    errors.push("BLANKET_ACCEPTANCE: findingId must not be a wildcard or a catch-all");
  }

  assertNoSensitiveEvidence(a, errors);
  assertNoPlaceholderDecision(a, errors);

  return { ok: errors.length === 0, errors, synthetic };
}

// ── Final GA authorization ────────────────────────────────────────────────────

/**
 * The owner's explicit GA release authorization.
 *
 * It is the LAST gate, never the first: `acknowledgedBlockerCount` must be zero,
 * so an authorization signed while blockers remain is itself invalid. This
 * prevents the single most dangerous failure mode — an owner signature being
 * used to paper over gates that never passed.
 */
function validateGaAuthorization(s, errors, nowMs) {
  if (s.decision !== "AUTHORIZED") errors.push(`decision must be exactly AUTHORIZED, got '${s.decision}'`);
  if (!SEMVER_TAG.test(String(s.releaseVersion ?? ""))) errors.push("releaseVersion must look like v1.0.0");
  requireHumanRole(s.ownerAuthorityRole, "ownerAuthorityRole", errors);
  requireIsoDate(s.authorizedAt, "authorizedAt", errors);
  requireText(s.authorizationEvidenceReference, "authorizationEvidenceReference", errors);
  requireDigest(s.authorizationEvidenceSha256, "authorizationEvidenceSha256", errors);
  if (s.acknowledgedBlockerCount !== 0) {
    errors.push("acknowledgedBlockerCount must be 0 — GA cannot be authorised while a blocker remains");
  }
  if (s.allPrecedingGatesReviewed !== true) errors.push("allPrecedingGatesReviewed must be true");
  checkExpiry(s.validityExpiresAt, "validityExpiresAt", nowMs, errors, { required: false });
}

export function gaAuthorizationGateInput(document, { expectedCommitSha, nowMs }) {
  const ctx = { expectedEvidenceType: "GA_AUTHORIZATION", expectedCommitSha, nowMs };
  return {
    gate: "GA_RELEASE_AUTHORIZATION",
    evidence: document?.authorization ?? null,
    validator: sectionValidator(document, ctx, validateGaAuthorization),
  };
}
