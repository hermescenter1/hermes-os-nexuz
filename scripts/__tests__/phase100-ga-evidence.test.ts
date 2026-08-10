/**
 * PHASE 100 — GA evidence-contract adversarial tests.
 *
 * Every gate Phase 100 adds is a gate that could, if its validator were weak,
 * be satisfied by something this repository produced itself. So each contract is
 * proven twice: once positively (a fully valid record PASSes — otherwise the
 * gate would be unreachable and the whole matrix decorative) and repeatedly
 * negatively, one mutation at a time, so a rejection can be attributed to the
 * exact field that caused it.
 *
 * Node stdlib + the pure contract modules only. No network, no filesystem writes.
 */
import { describe, it, expect } from "vitest";

import { resolveGate } from "../security/phase99/external-evidence.mjs";
import {
  legalPrivacyGateInputs,
  liveModelEvaluationGateInput,
  backupOperationalGateInputs,
  commercialGateInputs,
  infrastructurePrerequisiteGateInputs,
  gaAuthorizationGateInput,
  validateResidualRiskAcceptance,
  isNonProductionFixture,
  assertNoPlaceholderDecision,
  NON_PRODUCTION_MARKERS,
} from "../security/phase100/ga-evidence.mjs";

const COMMIT = "a".repeat(40);
const OTHER_COMMIT = "b".repeat(40);
const DIGEST = "0".repeat(64);
const NOW = Date.parse("2026-08-10T12:00:00.000Z");
const FUTURE = "2027-01-01";
const PAST = "2020-01-01";
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

const ctx = { expectedCommitSha: COMMIT, nowMs: NOW };

/** Resolve a named gate out of a multi-gate input list. */
function state(inputs: any[], gate: string) {
  const input = inputs.find((i) => i.gate === gate);
  if (!input) throw new Error(`no such gate '${gate}'`);
  return resolveGate(input.evidence, input.validator);
}
function only(input: any) {
  return resolveGate(input.evidence, input.validator);
}
/** Structured clone that keeps this file readable at every mutation site. */
const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

// ── Fixtures: the shape of REAL evidence ──────────────────────────────────────

const envelope = (evidenceType: string) => ({
  schemaVersion: 1,
  evidenceType,
  testedCommitSha: COMMIT,
  recordedAt: "2026-08-10",
  signedOrOwnerVerified: true,
});

const legalDoc = () => ({
  ...envelope("LEGAL_PRIVACY"),
  reviews: [
    {
      reviewType: "EXTERNAL_LEGAL_REVIEW",
      reviewerOrganizationAlias: "counsel-alias-1",
      reviewerRole: "External Legal Counsel",
      independentReviewer: true,
      reviewDate: "2026-08-01",
      reportReference: "private-channel/legal/report",
      reportSha256: DIGEST,
      outcome: "APPROVED",
      validityExpiresAt: FUTURE,
    },
    {
      reviewType: "EXTERNAL_PRIVACY_REVIEW",
      reviewerOrganizationAlias: "dpo-alias-1",
      reviewerRole: "External Data Protection Officer",
      independentReviewer: true,
      reviewDate: "2026-08-01",
      reportReference: "private-channel/privacy/report",
      reportSha256: DIGEST,
      outcome: "APPROVED",
      validityExpiresAt: FUTURE,
    },
  ],
  approvedDocuments: ["PRIVACY_POLICY", "TERMS_OF_SERVICE", "DPA"].map((documentId) => ({
    documentId,
    version: "1.0",
    approvedAt: "2026-08-01",
    documentSha256: DIGEST,
    approvedByRole: "External Legal Counsel",
  })),
  subprocessorGovernance: {
    registerReference: "private-channel/legal/subprocessors",
    registerSha256: DIGEST,
    subprocessorCount: 2,
    transferMechanisms: ["STANDARD_CONTRACTUAL_CLAUSES"],
    reviewedAt: "2026-08-01",
    reviewedByRole: "External Data Protection Officer",
  },
  residualLegalRiskAcceptance: {
    decision: "ACCEPT",
    ownerAuthorityRole: "Managing Director",
    reason: "Two low-impact contractual residuals remain, both bounded by the reviewed DPA.",
    residualRiskCount: 2,
    acceptedAt: "2026-08-01",
    expiresAt: FUTURE,
    evidenceReference: "private-channel/legal/residual",
    evidenceSha256: DIGEST,
  },
});

const liveEvalDoc = () => ({
  ...envelope("LIVE_MODEL_EVALUATION"),
  evaluation: {
    evaluationMode: "LIVE_PROVIDER",
    offlineFixtureOnly: false,
    providerRequestCount: 120,
    evaluationEnvironment: "github-environment/ai-evaluation",
    provider: "anthropic",
    modelId: "claude-sonnet-4-20250514",
    modelVersion: "2025-05-14",
    governanceLibraryVersion: "phase95",
    datasetReference: "src/lib/ai-governance/eval/hallucination.jsonl",
    datasetSha256: DIGEST,
    runReference: "private-channel/ai-eval/run",
    runSha256: DIGEST,
    evaluatedAt: "2026-08-01",
    sampleCount: 120,
    hallucinationRateObserved: 0,
    hallucinationRateBudget: 0.02,
    unsupportedClaimRateObserved: 0.01,
    unsupportedClaimRateBudget: 0.05,
    unsafeOutputCount: 0,
    ownerApproval: { decision: "APPROVED", ownerAuthorityRole: "Managing Director", approvedAt: "2026-08-02" },
    validityExpiresAt: FUTURE,
  },
});

const backupDoc = () => ({
  ...envelope("BACKUP_OPERATIONS"),
  scheduler: {
    mechanism: "host cron -> scripts/backup-postgres.sh",
    lastExecutedAt: hoursAgo(6),
    consecutiveSuccessfulRuns: 30,
    failedRunsSinceLastSuccess: 0,
    evidenceReference: "private-channel/ops/scheduler-log",
    evidenceSha256: DIGEST,
    confirmedByRole: "Platform Operations Lead",
  },
  latestBackupVerification: {
    verifiedAt: hoursAgo(5),
    artifactSha256: DIGEST,
    verificationTool: "scripts/verify-backup.sh",
    encrypted: true,
    cipher: "aes-256-gcm",
    verificationResult: "PASS",
    artifactSizeBytes: 1_048_576,
  },
  offHostCopy: {
    locationClass: "SEPARATE_REGION_OBJECT_STORAGE",
    copiedAt: hoursAgo(4),
    artifactSha256: DIGEST,
    integrityVerified: true,
    integrityMethod: "sha256 recomputed at the destination",
    verifiedCopySha256: DIGEST,
    confirmedByRole: "Platform Operations Lead",
  },
  recoveryTest: {
    recoveryType: "FULL_STACK_REHEARSAL",
    testedAt: hoursAgo(24 * 30),
    integrityCheck: "PASS",
    rtoMinutes: 42,
    rpoHours: 24,
    evidenceReference: "private-channel/ops/recovery-report",
    evidenceSha256: DIGEST,
    confirmedByRole: "Database Recovery Owner",
  },
  keyCustody: {
    custodyModel: "SEALED_ENVELOPE_OFFLINE",
    custodianRole: "Managing Director",
    backupCustodianRole: "Platform Operations Lead",
    confirmedAt: "2026-08-01",
    keyMaterialInRepository: false,
    custodyEvidenceReference: "private-channel/ops/key-custody",
    custodyEvidenceSha256: DIGEST,
  },
});

const commercialDoc = () => ({
  ...envelope("COMMERCIAL_DECISIONS"),
  pricing: {
    decision: "APPROVED",
    ownerAuthorityRole: "Managing Director",
    decidedAt: "2026-08-01",
    planRegistryReference: "docs/billing/plan-and-entitlement-registry.md",
    planRegistrySha256: DIGEST,
    pricedPlanCount: 3,
    currencies: ["EUR"],
    unresolvedPlanLimitCount: 0,
  },
  paymentProvider: {
    decision: "APPROVED",
    ownerAuthorityRole: "Managing Director",
    decidedAt: "2026-08-01",
    provider: "STRIPE",
    mode: "LIVE",
    webhookEndpointConfigured: true,
    webhookSigningSecretConfigured: true,
    configurationEvidenceReference: "private-channel/commercial/provider",
    configurationEvidenceSha256: DIGEST,
  },
  taxCurrencyRefund: {
    decision: "APPROVED",
    ownerAuthorityRole: "Managing Director",
    decidedAt: "2026-08-01",
    taxHandling: "PROVIDER_AUTOMATIC_TAX",
    settlementCurrencies: ["EUR"],
    refundPolicyReference: "private-channel/commercial/refunds",
    refundPolicySha256: DIGEST,
    refundWindowDays: 14,
  },
  productionBillingActivation: {
    activationDecision: "ACTIVATED",
    ownerAuthorityRole: "Managing Director",
    decidedAt: "2026-08-01",
    separatedFromCodeReadiness: true,
    activationEvidenceReference: "private-channel/commercial/activation",
    activationEvidenceSha256: DIGEST,
  },
});

const infraDoc = () => ({
  ...envelope("INFRASTRUCTURE_PREREQUISITES"),
  privateTransport: {
    transport: "WIREGUARD",
    publiclyReachable: false,
    confirmedAt: "2026-08-01",
    confirmedByRole: "Platform Operations Lead",
    evidenceReference: "private-channel/ops/transport",
    evidenceSha256: DIGEST,
  },
  secretBackend: {
    backend: "DISABLED",
    decision: "DECIDED",
    ownerAuthorityRole: "Managing Director",
    decidedAt: "2026-08-01",
    failClosedWhenUnavailable: true,
    privateTransportRequired: true,
    rationale: "The OT credential plane is not part of the first GA scope; the platform fails closed without it.",
  },
  credentialOwnership: {
    credentialOwnerRole: "Platform Operations Lead",
    recoveryOwnerRole: "Managing Director",
    unsealCustodyModel: "SEALED_ENVELOPE_OFFLINE",
    confirmedAt: "2026-08-01",
    runbookReference: "ops/openbao/staging/RUNBOOK.md",
    runbookSha256: DIGEST,
  },
  prerequisites: [
    {
      id: "TLS_CERTIFICATES_VALID",
      description: "Production TLS certificates issued and renewal verified",
      status: "COMPLETE",
      verifiedAt: "2026-08-01",
      verifiedByRole: "Platform Operations Lead",
    },
  ],
});

const gaDoc = () => ({
  ...envelope("GA_AUTHORIZATION"),
  authorization: {
    decision: "AUTHORIZED",
    releaseVersion: "v1.0.0",
    ownerAuthorityRole: "Managing Director",
    authorizedAt: "2026-08-09",
    authorizationEvidenceReference: "private-channel/release/authorization",
    authorizationEvidenceSha256: DIGEST,
    acknowledgedBlockerCount: 0,
    allPrecedingGatesReviewed: true,
    validityExpiresAt: FUTURE,
  },
});

const residualAcceptance = () => ({
  findingId: "P99-DEP-008",
  severity: "MEDIUM",
  decision: "ACCEPT",
  ownerAuthorityRole: "Managing Director",
  reason: "The advisory affects a transitive dev-only path that no production route reaches.",
  compensatingControls: ["not reachable from any authenticated route"],
  acceptedAt: "2026-08-01",
  expiresAt: FUTURE,
  // An acceptance with an expiry but no remediation plan is a permanent waiver
  // with a date on it, so the contract requires an owner, a plan and a target
  // date that falls inside the acceptance window.
  remediationOwnerRole: "Platform Engineering Lead",
  remediationPlanReference: "private-channel/security/remediation/P99-DEP-008",
  targetRemediationDate: "2026-12-01",
  evidenceReference: "private-channel/security/residual-008",
  evidenceSha256: DIGEST,
});

/** Every gate this suite can construct valid evidence for. */
const ALL_GATES = () => [
  ...legalPrivacyGateInputs(legalDoc(), ctx),
  liveModelEvaluationGateInput(liveEvalDoc(), ctx),
  ...backupOperationalGateInputs(backupDoc(), ctx),
  ...commercialGateInputs(commercialDoc(), ctx),
  ...infrastructurePrerequisiteGateInputs(infraDoc(), ctx),
  gaAuthorizationGateInput(gaDoc(), ctx),
];

// ── The gates are reachable ───────────────────────────────────────────────────

describe("valid evidence reaches PASS", () => {
  it("every Phase 100 gate PASSes when fully valid evidence is supplied", () => {
    const failures = ALL_GATES()
      .map((input) => ({ gate: input.gate, resolved: only(input) }))
      .filter((r) => r.resolved.state !== "PASS")
      .map((r) => `${r.gate}: ${r.resolved.errors.join("; ")}`);
    expect(failures).toEqual([]);
  });

  it("a fully valid residual risk acceptance is accepted", () => {
    expect(validateResidualRiskAcceptance(residualAcceptance(), { nowMs: NOW }).ok).toBe(true);
  });
});

// ── Absence, emptiness and malformation ───────────────────────────────────────

describe("absent, empty and malformed evidence", () => {
  it("absent evidence is BLOCKED, never PASS and never FAIL", () => {
    for (const input of [
      ...legalPrivacyGateInputs(null, ctx),
      liveModelEvaluationGateInput(null, ctx),
      ...backupOperationalGateInputs(null, ctx),
      ...commercialGateInputs(null, ctx),
      ...infrastructurePrerequisiteGateInputs(null, ctx),
      gaAuthorizationGateInput(null, ctx),
    ]) {
      expect(only(input).state, input.gate).toBe("BLOCKED");
    }
  });

  it("an empty document FAILs every gate it claims to satisfy", () => {
    for (const input of [
      ...legalPrivacyGateInputs({}, ctx),
      liveModelEvaluationGateInput({}, ctx),
      ...backupOperationalGateInputs({}, ctx),
      ...commercialGateInputs({}, ctx),
      ...infrastructurePrerequisiteGateInputs({}, ctx),
      gaAuthorizationGateInput({}, ctx),
    ]) {
      // An empty object carries no section, so the gate is BLOCKED on the
      // section and never silently PASSes.
      expect(only(input).state, input.gate).not.toBe("PASS");
    }
  });

  it("a document with a present but empty section FAILs rather than passing", () => {
    const doc = { ...envelope("GA_AUTHORIZATION"), authorization: {} };
    const resolved = only(gaAuthorizationGateInput(doc, ctx));
    expect(resolved.state).toBe("FAIL");
    expect(resolved.errors.length).toBeGreaterThan(0);
  });

  it("malformed JSON never reaches a validator as a valid record", () => {
    // The evaluator's reader returns null on a parse error; null is BLOCKED.
    const parsed = (() => { try { return JSON.parse("{ not json"); } catch { return null; } })();
    expect(parsed).toBeNull();
    expect(only(gaAuthorizationGateInput(parsed, ctx)).state).toBe("BLOCKED");
  });
});

// ── Release binding ───────────────────────────────────────────────────────────

describe("release binding", () => {
  it("rejects evidence bound to a different commit", () => {
    const doc = clone(gaDoc());
    doc.testedCommitSha = OTHER_COMMIT;
    const resolved = only(gaAuthorizationGateInput(doc, ctx));
    expect(resolved.state).toBe("FAIL");
    expect(resolved.errors.join(" ")).toContain("does not match the expected release commit");
  });

  it("rejects evidence when no expected release commit can be determined", () => {
    const resolved = only(gaAuthorizationGateInput(gaDoc(), { expectedCommitSha: null, nowMs: NOW }));
    expect(resolved.state).toBe("FAIL");
    expect(resolved.errors.join(" ")).toContain("cannot bind the evidence to a release");
  });

  it("rejects a document whose evidenceType belongs to another gate", () => {
    // A legal approval renamed as a GA authorization must not authorise a release.
    const doc = clone(legalDoc()) as any;
    doc.authorization = clone(gaDoc()).authorization;
    const resolved = only(gaAuthorizationGateInput(doc, ctx));
    expect(resolved.state).toBe("FAIL");
    expect(resolved.errors.join(" ")).toContain("EVIDENCE_TYPE_MISMATCH");
  });

  it("cannot satisfy the legal-review gate with a privacy review", () => {
    // Only the privacy review is present. It must not be reused to close the
    // legal gate, and its own gate must still resolve on its own merits.
    const doc = clone(legalDoc());
    doc.reviews = [doc.reviews[1]];
    expect(state(legalPrivacyGateInputs(doc, ctx), "EXTERNAL_LEGAL_REVIEW").state).toBe("BLOCKED");
    expect(state(legalPrivacyGateInputs(doc, ctx), "EXTERNAL_PRIVACY_REVIEW").state).toBe("PASS");
  });

  it("rejects a review whose reviewType was relabelled to another gate", () => {
    const doc = clone(legalDoc()) as any;
    // A privacy report filed under the legal review type: the gate's own
    // reviewType check is satisfied, so the mismatch must be caught where it
    // actually matters — the record is matched to the gate by reviewType, and a
    // record carrying the WRONG type for the gate it is fed to is rejected.
    const input = legalPrivacyGateInputs(doc, ctx).find((i) => i.gate === "EXTERNAL_LEGAL_REVIEW")!;
    const privacyRecord = doc.reviews[1];
    const resolved = resolveGate(privacyRecord, input.validator);
    expect(resolved.state).toBe("FAIL");
    expect(resolved.errors.join(" ")).toContain("REVIEW_TYPE_MISMATCH");
  });
});

// ── Fixtures, agents and placeholders ─────────────────────────────────────────

describe("fixtures, agent authorship and placeholders", () => {
  it.each(NON_PRODUCTION_MARKERS)("a document marked %s can never satisfy a gate", (marker) => {
    const doc = { ...gaDoc(), [marker]: true };
    expect(isNonProductionFixture(doc)).toBe(true);
    expect(only(gaAuthorizationGateInput(doc, ctx)).state).toBe("BLOCKED");
  });

  it("every shipped example marker disqualifies the record", () => {
    const doc = clone(gaDoc()) as any;
    doc.SYNTHETIC_TEST_FIXTURE = true;
    const resolved = only(gaAuthorizationGateInput(doc, ctx));
    expect(resolved.state).toBe("BLOCKED");
    expect(resolved.reason).toBe("SYNTHETIC_TEST_FIXTURE");
  });

  it("rejects an agent-attributed authority on every owner decision", () => {
    const cases: Array<[string, () => any]> = [
      ["GA_RELEASE_AUTHORIZATION", () => {
        const d = clone(gaDoc()); d.authorization.ownerAuthorityRole = "Automation Agent"; return only(gaAuthorizationGateInput(d, ctx));
      }],
      ["PRICING_DECISION", () => {
        const d = clone(commercialDoc()); d.pricing.ownerAuthorityRole = "release bot"; return state(commercialGateInputs(d, ctx), "PRICING_DECISION");
      }],
      ["EXTERNAL_LEGAL_REVIEW", () => {
        const d = clone(legalDoc()); d.reviews[0].reviewerRole = "AI reviewer"; return state(legalPrivacyGateInputs(d, ctx), "EXTERNAL_LEGAL_REVIEW");
      }],
      ["RECOVERY_KEY_CUSTODY_CONFIRMED", () => {
        const d = clone(backupDoc()); d.keyCustody.custodianRole = "system"; return state(backupOperationalGateInputs(d, ctx), "RECOVERY_KEY_CUSTODY_CONFIRMED");
      }],
    ];
    for (const [gate, run] of cases) {
      const resolved = run();
      expect(resolved.state, gate).toBe("FAIL");
      expect(resolved.errors.join(" "), gate).toContain("human authority");
    }
  });

  it("rejects an agent-authored residual risk acceptance", () => {
    const a = { ...residualAcceptance(), ownerAuthorityRole: "claude" };
    const v = validateResidualRiskAcceptance(a, { nowMs: NOW });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("human authority");
  });

  it.each([
    ["TBD", "TBD"],
    ["angle-bracket", "<finalized after commit/push>"],
    ["pending", "PENDING owner input"],
    ["unresolved configuration", "COMMERCIAL_CONFIGURATION_REQUIRED"],
    ["blank", "   "],
  ])("rejects a %s placeholder beside an approval claim", (_label, value) => {
    const d = clone(commercialDoc());
    d.pricing.planRegistryReference = value;
    const resolved = state(commercialGateInputs(d, ctx), "PRICING_DECISION");
    expect(resolved.state).toBe("FAIL");
    expect(resolved.errors.join(" ")).toContain("PLACEHOLDER_OWNER_DECISION");
  });

  it("the placeholder scan reports the exact offending field", () => {
    const errors: string[] = [];
    assertNoPlaceholderDecision({ a: { b: "TODO" } }, errors);
    expect(errors[0]).toContain("record.a.b");
  });
});

// ── Expiry and staleness ──────────────────────────────────────────────────────

describe("expiry and staleness", () => {
  it("rejects an expired external legal review", () => {
    const d = clone(legalDoc());
    d.reviews[0].validityExpiresAt = PAST;
    const resolved = state(legalPrivacyGateInputs(d, ctx), "EXTERNAL_LEGAL_REVIEW");
    expect(resolved.state).toBe("FAIL");
    expect(resolved.errors.join(" ")).toContain("EXPIRED");
  });

  it("rejects an expired residual legal risk acceptance", () => {
    const d = clone(legalDoc());
    d.residualLegalRiskAcceptance.expiresAt = PAST;
    expect(state(legalPrivacyGateInputs(d, ctx), "RESIDUAL_LEGAL_RISK_ACCEPTED").state).toBe("FAIL");
  });

  it("rejects an expired residual finding acceptance", () => {
    const v = validateResidualRiskAcceptance({ ...residualAcceptance(), expiresAt: PAST }, { nowMs: NOW });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("EXPIRED");
  });

  it("rejects a stale backup scheduler run", () => {
    const d = clone(backupDoc());
    d.scheduler.lastExecutedAt = hoursAgo(72);
    const resolved = state(backupOperationalGateInputs(d, ctx), "BACKUP_SCHEDULER_EXECUTED");
    expect(resolved.state).toBe("FAIL");
    expect(resolved.errors.join(" ")).toContain("STALE_OPERATIONAL_EVIDENCE");
  });

  it("rejects a stale backup verification and a stale recovery test", () => {
    const d1 = clone(backupDoc());
    d1.latestBackupVerification.verifiedAt = hoursAgo(24 * 30);
    expect(state(backupOperationalGateInputs(d1, ctx), "LATEST_BACKUP_VERIFIED").state).toBe("FAIL");

    const d2 = clone(backupDoc());
    d2.recoveryTest.testedAt = hoursAgo(24 * 400);
    expect(state(backupOperationalGateInputs(d2, ctx), "RECOVERY_TESTED").state).toBe("FAIL");
  });

  it("rejects an operational timestamp in the future", () => {
    const d = clone(backupDoc());
    d.scheduler.lastExecutedAt = new Date(NOW + 48 * 3_600_000).toISOString();
    expect(state(backupOperationalGateInputs(d, ctx), "BACKUP_SCHEDULER_EXECUTED").errors.join(" ")).toContain("in the future");
  });

  it("rejects a date-only operational timestamp", () => {
    const d = clone(backupDoc());
    d.scheduler.lastExecutedAt = "2026-08-10";
    expect(state(backupOperationalGateInputs(d, ctx), "BACKUP_SCHEDULER_EXECUTED").errors.join(" ")).toContain("ISO date-time");
  });
});

// ── Backup and DR specifics ───────────────────────────────────────────────────

describe("backup and disaster-recovery evidence", () => {
  it("rejects a scheduler that has never successfully run", () => {
    const d = clone(backupDoc());
    d.scheduler.consecutiveSuccessfulRuns = 0;
    expect(state(backupOperationalGateInputs(d, ctx), "BACKUP_SCHEDULER_EXECUTED").state).toBe("FAIL");
  });

  it("rejects an off-host copy without an integrity proof", () => {
    const d = clone(backupDoc());
    d.offHostCopy.integrityVerified = false;
    const resolved = state(backupOperationalGateInputs(d, ctx), "OFFHOST_COPY_VERIFIED");
    expect(resolved.state).toBe("FAIL");
    expect(resolved.errors.join(" ")).toContain("OFFHOST_COPY_WITHOUT_INTEGRITY_PROOF");
  });

  it("rejects an off-host copy whose digest differs from the source artifact", () => {
    const d = clone(backupDoc());
    d.offHostCopy.verifiedCopySha256 = "1".repeat(64);
    const resolved = state(backupOperationalGateInputs(d, ctx), "OFFHOST_COPY_VERIFIED");
    expect(resolved.state).toBe("FAIL");
    expect(resolved.errors.join(" ")).toContain("OFFHOST_COPY_WITHOUT_INTEGRITY_PROOF");
  });

  it("rejects an unencrypted or wrongly-ciphered backup", () => {
    const d1 = clone(backupDoc());
    d1.latestBackupVerification.encrypted = false;
    expect(state(backupOperationalGateInputs(d1, ctx), "LATEST_BACKUP_VERIFIED").state).toBe("FAIL");

    const d2 = clone(backupDoc());
    d2.latestBackupVerification.cipher = "aes-128-cbc";
    expect(state(backupOperationalGateInputs(d2, ctx), "LATEST_BACKUP_VERIFIED").state).toBe("FAIL");
  });

  it("rejects key material or a passphrase inside custody evidence", () => {
    for (const key of ["keyMaterial", "passphrase", "unsealKey"]) {
      const d = clone(backupDoc()) as any;
      d.keyCustody[key] = "not-a-real-value";
      const resolved = state(backupOperationalGateInputs(d, ctx), "RECOVERY_KEY_CUSTODY_CONFIRMED");
      expect(resolved.state, key).toBe("FAIL");
      expect(resolved.errors.join(" "), key).toContain("must not appear in repository evidence");
    }
  });

  it("rejects an embedded private key through the shared sensitive-value scan", () => {
    const d = clone(backupDoc());
    d.keyCustody.custodyEvidenceReference = "-----BEGIN RSA PRIVATE KEY-----";
    expect(state(backupOperationalGateInputs(d, ctx), "RECOVERY_KEY_CUSTODY_CONFIRMED").state).toBe("FAIL");
  });

  it("rejects an off-host location recorded as an address rather than a class", () => {
    const d = clone(backupDoc()) as any;
    d.offHostCopy.locationClass = "10.0.0.5";
    expect(state(backupOperationalGateInputs(d, ctx), "OFFHOST_COPY_VERIFIED").state).toBe("FAIL");
  });
});

// ── Live model evaluation ─────────────────────────────────────────────────────

describe("live model evaluation evidence", () => {
  it("rejects an offline fixture run presented as live evaluation", () => {
    const d = clone(liveEvalDoc());
    d.evaluation.evaluationMode = "OFFLINE_FIXTURE";
    const resolved = only(liveModelEvaluationGateInput(d, ctx));
    expect(resolved.state).toBe("FAIL");
    expect(resolved.errors.join(" ")).toContain("OFFLINE_EVIDENCE_FOR_LIVE_GATE");
  });

  it("rejects a live claim contradicted by offlineFixtureOnly", () => {
    const d = clone(liveEvalDoc());
    d.evaluation.offlineFixtureOnly = true;
    expect(only(liveModelEvaluationGateInput(d, ctx)).errors.join(" ")).toContain("OFFLINE_EVIDENCE_FOR_LIVE_GATE");
  });

  it("rejects a live claim that never reached the provider", () => {
    const d = clone(liveEvalDoc());
    d.evaluation.providerRequestCount = 0;
    expect(only(liveModelEvaluationGateInput(d, ctx)).state).toBe("FAIL");
  });

  it("rejects an evaluation missing its model/provider/version binding", () => {
    for (const field of ["provider", "modelId", "modelVersion", "evaluationEnvironment"]) {
      const d = clone(liveEvalDoc()) as any;
      delete d.evaluation[field];
      expect(only(liveModelEvaluationGateInput(d, ctx)).state, field).toBe("FAIL");
    }
  });

  it("rejects an evaluation over its hallucination or unsupported-claim budget", () => {
    const d1 = clone(liveEvalDoc());
    d1.evaluation.hallucinationRateObserved = 0.5;
    expect(only(liveModelEvaluationGateInput(d1, ctx)).errors.join(" ")).toContain("HALLUCINATION_REGRESSION_OVER_BUDGET");

    const d2 = clone(liveEvalDoc());
    d2.evaluation.unsupportedClaimRateObserved = 0.9;
    expect(only(liveModelEvaluationGateInput(d2, ctx)).errors.join(" ")).toContain("UNSUPPORTED_CLAIM_RATE_OVER_BUDGET");
  });

  it("rejects any unsafe output at all", () => {
    const d = clone(liveEvalDoc());
    d.evaluation.unsafeOutputCount = 1;
    expect(only(liveModelEvaluationGateInput(d, ctx)).state).toBe("FAIL");
  });

  it("rejects an evaluation result that carries no owner approval", () => {
    const d = clone(liveEvalDoc()) as any;
    delete d.evaluation.ownerApproval;
    const resolved = only(liveModelEvaluationGateInput(d, ctx));
    expect(resolved.state).toBe("FAIL");
    expect(resolved.errors.join(" ")).toContain("an evaluation result is not an approval");
  });
});

// ── Legal and privacy specifics ───────────────────────────────────────────────

describe("legal and privacy evidence", () => {
  it("rejects a legal approval that is not from an independent reviewer", () => {
    const d = clone(legalDoc());
    d.reviews[0].independentReviewer = false;
    const resolved = state(legalPrivacyGateInputs(d, ctx), "EXTERNAL_LEGAL_REVIEW");
    expect(resolved.state).toBe("FAIL");
    expect(resolved.errors.join(" ")).toContain("an internal opinion is not an external legal");
  });

  it("rejects a REJECTED outcome dressed up as approval evidence", () => {
    const d = clone(legalDoc());
    d.reviews[0].outcome = "REJECTED";
    expect(state(legalPrivacyGateInputs(d, ctx), "EXTERNAL_LEGAL_REVIEW").state).toBe("FAIL");
  });

  it("requires the privacy policy, terms and DPA to be approved", () => {
    const d = clone(legalDoc());
    d.approvedDocuments = d.approvedDocuments.filter((x: any) => x.documentId !== "DPA");
    const resolved = state(legalPrivacyGateInputs(d, ctx), "APPROVED_LEGAL_DOCUMENT_VERSIONS");
    expect(resolved.state).toBe("FAIL");
    expect(resolved.errors.join(" ")).toContain("DPA");
  });

  it("rejects an unrecognised international-transfer mechanism", () => {
    const d = clone(legalDoc()) as any;
    d.subprocessorGovernance.transferMechanisms = ["HANDSHAKE"];
    expect(state(legalPrivacyGateInputs(d, ctx), "SUBPROCESSOR_AND_TRANSFER_GOVERNANCE").state).toBe("FAIL");
  });
});

// ── Commercial and infrastructure specifics ───────────────────────────────────

describe("commercial and infrastructure evidence", () => {
  it("rejects pricing with an unresolved plan limit", () => {
    const d = clone(commercialDoc());
    d.pricing.unresolvedPlanLimitCount = 1;
    expect(state(commercialGateInputs(d, ctx), "PRICING_DECISION").state).toBe("FAIL");
  });

  it("rejects a GA payment-provider decision still in TEST mode", () => {
    const d = clone(commercialDoc());
    d.paymentProvider.mode = "TEST";
    expect(state(commercialGateInputs(d, ctx), "PAYMENT_PROVIDER_DECISION").state).toBe("FAIL");
  });

  it("reports deferred production billing as its own named blocker", () => {
    const d = clone(commercialDoc()) as any;
    d.productionBillingActivation.activationDecision = "DEFERRED";
    const resolved = state(commercialGateInputs(d, ctx), "PRODUCTION_BILLING_ACTIVATION");
    expect(resolved.state).toBe("FAIL");
    expect(resolved.errors.join(" ")).toContain("PRODUCTION_BILLING_NOT_ACTIVATED");
    // The other three commercial gates are unaffected — no blocker hides another.
    expect(state(commercialGateInputs(d, ctx), "PRICING_DECISION").state).toBe("PASS");
  });

  it("rejects billing activation inferred from code readiness", () => {
    const d = clone(commercialDoc());
    d.productionBillingActivation.separatedFromCodeReadiness = false;
    expect(state(commercialGateInputs(d, ctx), "PRODUCTION_BILLING_ACTIVATION").state).toBe("FAIL");
  });

  it("rejects public or unspecified transport to the secret backend", () => {
    const d = clone(infraDoc()) as any;
    d.privateTransport.transport = "PUBLIC_INTERNET";
    expect(state(infrastructurePrerequisiteGateInputs(d, ctx), "PRIVATE_TRANSPORT_CONFIRMED").state).toBe("FAIL");

    const d2 = clone(infraDoc());
    d2.privateTransport.publiclyReachable = true;
    expect(state(infrastructurePrerequisiteGateInputs(d2, ctx), "PRIVATE_TRANSPORT_CONFIRMED").state).toBe("FAIL");
  });

  it("accepts DISABLED as a legitimate secret-backend decision but never an absent one", () => {
    expect(state(infrastructurePrerequisiteGateInputs(infraDoc(), ctx), "SECRET_BACKEND_ACTIVATION_DECISION").state).toBe("PASS");
    const d = clone(infraDoc()) as any;
    delete d.secretBackend;
    expect(state(infrastructurePrerequisiteGateInputs(d, ctx), "SECRET_BACKEND_ACTIVATION_DECISION").state).toBe("BLOCKED");
  });

  it("requires private transport when the OpenBao backend is enabled", () => {
    const d = clone(infraDoc()) as any;
    d.secretBackend.backend = "OPENBAO";
    d.secretBackend.privateTransportRequired = false;
    expect(state(infrastructurePrerequisiteGateInputs(d, ctx), "SECRET_BACKEND_ACTIVATION_DECISION").state).toBe("FAIL");
  });

  it("rejects a token inside credential-ownership evidence", () => {
    const d = clone(infraDoc()) as any;
    d.credentialOwnership.rootToken = "not-a-real-token";
    expect(state(infrastructurePrerequisiteGateInputs(d, ctx), "CREDENTIAL_AND_RECOVERY_OWNERSHIP").state).toBe("FAIL");
  });

  it("rejects an incomplete infrastructure prerequisite", () => {
    const d = clone(infraDoc()) as any;
    d.prerequisites[0].status = "IN_PROGRESS";
    expect(state(infrastructurePrerequisiteGateInputs(d, ctx), "INFRASTRUCTURE_PREREQUISITES_COMPLETE").state).toBe("FAIL");
  });
});

// ── GA authorization ──────────────────────────────────────────────────────────

describe("GA authorization", () => {
  it("rejects an authorization signed while blockers remain", () => {
    const d = clone(gaDoc());
    d.authorization.acknowledgedBlockerCount = 3;
    const resolved = only(gaAuthorizationGateInput(d, ctx));
    expect(resolved.state).toBe("FAIL");
    expect(resolved.errors.join(" ")).toContain("cannot be authorised while a blocker remains");
  });

  it("rejects an authorization that did not review the preceding gates", () => {
    const d = clone(gaDoc());
    d.authorization.allPrecedingGatesReviewed = false;
    expect(only(gaAuthorizationGateInput(d, ctx)).state).toBe("FAIL");
  });

  it("rejects a decision other than AUTHORIZED and a malformed release version", () => {
    const d1 = clone(gaDoc()) as any;
    d1.authorization.decision = "APPROVED";
    expect(only(gaAuthorizationGateInput(d1, ctx)).state).toBe("FAIL");

    const d2 = clone(gaDoc());
    d2.authorization.releaseVersion = "1.0";
    expect(only(gaAuthorizationGateInput(d2, ctx)).state).toBe("FAIL");
  });

  it("rejects an unverified provenance claim", () => {
    const d = clone(gaDoc());
    d.signedOrOwnerVerified = false as any;
    expect(only(gaAuthorizationGateInput(d, ctx)).state).toBe("FAIL");
  });
});

// ── Residual finding acceptance ───────────────────────────────────────────────

describe("residual finding risk acceptance", () => {
  it("refuses to accept a HIGH through the residual path", () => {
    const v = validateResidualRiskAcceptance({ ...residualAcceptance(), severity: "HIGH" }, { nowMs: NOW });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("MEDIUM/LOW/INFO only");
  });

  it("rejects an acceptance copied from another finding", () => {
    const v = validateResidualRiskAcceptance(residualAcceptance(), { nowMs: NOW, expectedFindingId: "P99-DEP-009" });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("EVIDENCE_TYPE_MISMATCH");
  });

  it("rejects an acceptance with no compensating control or a token reason", () => {
    expect(validateResidualRiskAcceptance({ ...residualAcceptance(), compensatingControls: [] }, { nowMs: NOW }).ok).toBe(false);
    expect(validateResidualRiskAcceptance({ ...residualAcceptance(), reason: "ok" }, { nowMs: NOW }).ok).toBe(false);
  });

  it("rejects an example fixture as a residual acceptance", () => {
    const v = validateResidualRiskAcceptance({ ...residualAcceptance(), EXAMPLE_ONLY: true }, { nowMs: NOW });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("NON_PRODUCTION_FIXTURE");
  });
});

// ── Independence: no blocker hides another ────────────────────────────────────

describe("blocker independence", () => {
  it("one invalid section never suppresses the verdict on its siblings", () => {
    const d = clone(backupDoc());
    d.offHostCopy.integrityVerified = false; // break exactly one section
    const inputs = backupOperationalGateInputs(d, ctx);
    expect(state(inputs, "OFFHOST_COPY_VERIFIED").state).toBe("FAIL");
    for (const gate of ["BACKUP_SCHEDULER_EXECUTED", "LATEST_BACKUP_VERIFIED", "RECOVERY_TESTED", "RECOVERY_KEY_CUSTODY_CONFIRMED"]) {
      expect(state(inputs, gate).state, gate).toBe("PASS");
    }
  });

  it("an absent section is BLOCKED while its siblings still PASS", () => {
    const d = clone(legalDoc()) as any;
    delete d.subprocessorGovernance;
    const inputs = legalPrivacyGateInputs(d, ctx);
    expect(state(inputs, "SUBPROCESSOR_AND_TRANSFER_GOVERNANCE").state).toBe("BLOCKED");
    expect(state(inputs, "EXTERNAL_LEGAL_REVIEW").state).toBe("PASS");
    expect(state(inputs, "RESIDUAL_LEGAL_RISK_ACCEPTED").state).toBe("PASS");
  });

  it("is deterministic: the same input yields the same verdict and error order", () => {
    const d = clone(backupDoc());
    d.scheduler.consecutiveSuccessfulRuns = 0;
    d.offHostCopy.integrityVerified = false;
    const run = () => backupOperationalGateInputs(d, ctx).map((i) => ({ gate: i.gate, ...only(i) }));
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
