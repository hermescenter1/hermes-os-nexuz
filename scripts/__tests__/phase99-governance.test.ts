/**
 * PHASE 99 — governance-contract unit tests.
 *
 * These prove the properties Phase 99 leans on most heavily: that the finding,
 * external-evidence and pilot-acceptance contracts reject exactly the things
 * they must reject. If any of these regress, a self-produced artifact could pass
 * for real external evidence, which is the one failure mode the whole phase is
 * built to prevent.
 *
 * Node stdlib + the pure contract modules only. No network, no filesystem writes.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";

import {
  validateFinding,
  validateRiskAcceptance,
  evaluateRegistry,
  isHumanAuthorityRole,
  isSyntheticFixture,
} from "../security/phase99/finding-contract.mjs";
import {
  validateExternalAttestation,
  validatePilotAcceptance,
  resolveGate,
  computeScopeHash,
  assertNoSensitiveEvidence,
} from "../security/phase99/external-evidence.mjs";
import {
  normalizeSeverity,
  maxSeverity,
  deriveReleaseBlocker,
  normalizeNpmAudit,
} from "../security/phase99/normalization.mjs";

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const future = "2027-01-01T00:00:00.000Z";
const past = "2020-01-01T00:00:00.000Z";
const now = Date.parse("2026-08-07T00:00:00.000Z");

describe("finding contract", () => {
  const base = {
    findingId: "P99-INT-001",
    title: "x",
    source: "INTERNAL_REVIEW",
    sourceReference: "ref",
    severity: "HIGH",
    category: "AUTH_SESSION",
    affectedSurface: "POST /x",
    firstObservedAt: "2026-08-07",
    status: "OPEN",
    releaseBlocker: true,
    evidenceHash: null,
  };

  it("accepts a well-formed open finding", () => {
    expect(validateFinding(base, { nowMs: now }).ok).toBe(true);
  });

  it("forbids risk-accepting a CRITICAL", () => {
    const f = { ...base, severity: "CRITICAL", status: "RISK_ACCEPTED", releaseBlocker: false, riskAcceptanceReference: "r", riskAcceptanceExpiresAt: future };
    const v = validateFinding(f, { nowMs: now });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/CRITICAL_RISK_ACCEPTANCE/);
  });

  it("requires retest evidence to close by fix", () => {
    const f = { ...base, status: "VERIFIED_FIXED", releaseBlocker: false, remediationReference: "fix" };
    expect(validateFinding(f, { nowMs: now }).errors.join(" ")).toMatch(/CLOSED_WITHOUT_RETEST_EVIDENCE/);
  });

  it("rejects an expired risk acceptance", () => {
    const f = { ...base, status: "RISK_ACCEPTED", releaseBlocker: false, riskAcceptanceReference: "r", riskAcceptanceExpiresAt: past };
    expect(validateFinding(f, { nowMs: now }).errors.join(" ")).toMatch(/EXPIRED/);
  });

  it("flags an open HIGH that is not a release blocker", () => {
    const f = { ...base, releaseBlocker: false };
    expect(validateFinding(f, { nowMs: now }).ok).toBe(false);
  });

  it("flags a resolved finding still marked as a blocker", () => {
    const f = { ...base, status: "NOT_APPLICABLE", releaseBlocker: true };
    expect(validateFinding(f, { nowMs: now }).errors.join(" ")).toMatch(/RELEASE_BLOCKER_WITHOUT_RESOLUTION/);
  });
});

describe("human authority detection", () => {
  it("accepts human roles", () => {
    for (const r of ["Head of Security", "CTO", "Chief Information Security Officer", "Owner"]) {
      expect(isHumanAuthorityRole(r)).toBe(true);
    }
  });
  it("rejects agent/automation roles", () => {
    for (const r of ["agent", "AI agent", "automation", "the bot", "claude", "system", "self-service automation"]) {
      expect(isHumanAuthorityRole(r)).toBe(false);
    }
  });
});

describe("risk acceptance contract", () => {
  const good = {
    findingId: "P99-INT-001",
    severity: "HIGH",
    ownerAuthorityRole: "Chief Information Security Officer",
    decision: "ACCEPT",
    reason: "compensating controls are sufficient for the pilot window",
    compensatingControls: ["network isolation"],
    scope: "pilot only",
    acceptedAt: "2026-08-07",
    expiresAt: future,
    evidenceReference: "advisory-123",
    evidenceSha256: sha("evidence"),
  };
  it("accepts a valid, unexpired, human-authored acceptance", () => {
    expect(validateRiskAcceptance(good, { nowMs: now }).ok).toBe(true);
  });
  it("rejects an agent-authored acceptance", () => {
    expect(validateRiskAcceptance({ ...good, ownerAuthorityRole: "AI agent" }, { nowMs: now }).ok).toBe(false);
  });
  it("rejects a synthetic fixture", () => {
    expect(validateRiskAcceptance({ ...good, SYNTHETIC_TEST_FIXTURE: true }, { nowMs: now }).ok).toBe(false);
  });
  it("rejects an expired acceptance", () => {
    expect(validateRiskAcceptance({ ...good, expiresAt: past }, { nowMs: now }).ok).toBe(false);
  });
});

describe("registry evaluation", () => {
  it("reports zero counters for a clean register", () => {
    const findings = [{
      findingId: "P99-INT-002", title: "x", source: "INTERNAL_REVIEW", sourceReference: "r",
      severity: "MEDIUM", category: "API_SECURITY", affectedSurface: "s", firstObservedAt: "2026-08-07",
      status: "VERIFIED_FIXED", releaseBlocker: false, remediationReference: "fix", retestReference: "test", evidenceHash: null,
    }];
    const r = evaluateRegistry(findings, {}, { nowMs: now });
    expect(r.ok).toBe(true);
    expect(Object.values(r.counters).every((n) => n === 0)).toBe(true);
  });
  it("counts an unknown severity", () => {
    const r = evaluateRegistry([{ findingId: "P99-INT-003", severity: "SEVERE", status: "OPEN" }], {}, { nowMs: now });
    expect(r.counters.UNKNOWN_SEVERITY).toBe(1);
    expect(r.ok).toBe(false);
  });
});

describe("external attestation gate", () => {
  const commit = "a".repeat(40);
  const scopeHash = "b".repeat(64);
  const good = {
    schemaVersion: 1,
    reviewType: "INDEPENDENT_PENETRATION_TEST",
    reviewerOrganizationAlias: "acme-security",
    reviewerRole: "Lead Penetration Tester",
    reviewDate: "2026-08-07",
    testedCommitSha: commit,
    testedImageDigest: null,
    scopeHash,
    rawReportReference: "advisory-1",
    rawReportSha256: sha("report"),
    criticalCount: 0, highCount: 0, mediumCount: 1, lowCount: 2, infoCount: 3,
    retestCompleted: false,
    signedOrOwnerVerified: true,
    recordedAt: "2026-08-08",
  };

  it("passes a valid attestation bound to the expected commit and scope", () => {
    const v = validateExternalAttestation(good, { expectedCommitSha: commit, expectedScopeHash: scopeHash });
    expect(v.ok).toBe(true);
  });
  it("fails an attestation for a different commit", () => {
    const v = validateExternalAttestation({ ...good, testedCommitSha: "c".repeat(40) }, { expectedCommitSha: commit, expectedScopeHash: scopeHash });
    expect(v.ok).toBe(false);
    expect(v.gates.TESTED_COMMIT_MATCHES_EXPECTED_RELEASE).not.toBe("PASS");
  });
  it("blocks a synthetic fixture through resolveGate", () => {
    const g = resolveGate({ ...good, SYNTHETIC_TEST_FIXTURE: true }, (a) => validateExternalAttestation(a, { expectedCommitSha: commit, expectedScopeHash: scopeHash }));
    expect(g.state).toBe("BLOCKED");
  });
  it("blocks absent evidence", () => {
    expect(resolveGate(null, validateExternalAttestation).state).toBe("BLOCKED");
  });
  it("fails an agent-attributed reviewer", () => {
    const v = validateExternalAttestation({ ...good, reviewerRole: "automation" }, { expectedCommitSha: commit, expectedScopeHash: scopeHash });
    expect(v.gates.REVIEWER_NOT_AGENT_ATTESTATION).not.toBe("PASS");
  });
});

describe("sensitive evidence guard", () => {
  it("flags embedded credentials, ip and emails", () => {
    const errs: string[] = [];
    assertNoSensitiveEvidence({ note: "reach me at admin@example.test from 10.0.0.9" }, errs);
    expect(errs.length).toBeGreaterThan(0);
  });
  it("passes a sanitized record", () => {
    const errs: string[] = [];
    assertNoSensitiveEvidence({ criticalCount: 0, alias: "acme-security", ref: "advisory-1" }, errs);
    expect(errs).toEqual([]);
  });
});

describe("pilot acceptance gate", () => {
  const commit = "a".repeat(40);
  const scopeHash = "d".repeat(64);
  const good = {
    schemaVersion: 1,
    pilotId: "pilot-alpha",
    testedCommitSha: commit,
    testedImageDigest: null,
    pilotScopeHash: scopeHash,
    uatSummary: { total: 3, pass: 3, fail: 0, blocked: 0, acceptedWithLimitation: 0, notRun: 0 },
    workflowValidationReference: "wf",
    engineerFeedbackReference: "fb",
    performanceObservationReference: "perf",
    incidentSimulationReference: "inc",
    onboardingCompleted: true,
    supportProcessAccepted: true,
    knownLimitations: [],
    openBlockerCount: 0,
    acceptanceDecision: "ACCEPTED",
    acceptanceAuthorityRole: "Pilot Sponsor",
    acceptanceDate: "2026-08-08",
    acceptanceEvidenceReference: "record-1",
    acceptanceEvidenceSha256: sha("acceptance"),
  };
  it("accepts a valid record", () => {
    expect(validatePilotAcceptance(good, { expectedCommitSha: commit, expectedScopeHash: scopeHash }).ok).toBe(true);
  });
  it("rejects a synthetic fixture", () => {
    const g = resolveGate({ ...good, SYNTHETIC_TEST_FIXTURE: true }, validatePilotAcceptance);
    expect(g.state).toBe("BLOCKED");
  });
  it("rejects acceptance while blockers remain", () => {
    expect(validatePilotAcceptance({ ...good, openBlockerCount: 1 }, { expectedCommitSha: commit, expectedScopeHash: scopeHash }).ok).toBe(false);
  });
  it("rejects an agent-authored acceptance authority", () => {
    expect(validatePilotAcceptance({ ...good, acceptanceAuthorityRole: "agent" }, { expectedCommitSha: commit, expectedScopeHash: scopeHash }).ok).toBe(false);
  });
  it("rejects a customer name masquerading as a pilot id", () => {
    expect(validatePilotAcceptance({ ...good, pilotId: "AcmeCorp" }, { expectedCommitSha: commit, expectedScopeHash: scopeHash }).ok).toBe(false);
  });
});

describe("scope hash", () => {
  it("is stable across CRLF and LF", () => {
    expect(computeScopeHash("line one\r\nline two\r\n")).toBe(computeScopeHash("line one\nline two\n"));
  });
});

describe("normalization", () => {
  it("maps producer vocabularies onto the closed set", () => {
    expect(normalizeSeverity("moderate")).toBe("MEDIUM");
    expect(normalizeSeverity("blocker")).toBe("CRITICAL");
    expect(normalizeSeverity("informational")).toBe("INFO");
    expect(normalizeSeverity("nonsense")).toBeNull();
  });
  it("escalates but never downgrades", () => {
    expect(maxSeverity("LOW", "HIGH")).toBe("HIGH");
    expect(maxSeverity("CRITICAL", "LOW")).toBe("CRITICAL");
  });
  it("derives release blockers from signals, not prose", () => {
    const b = deriveReleaseBlocker({ severity: "LOW", status: "OPEN", signals: { crossTenantReadOrWrite: true } });
    expect(b.releaseBlocker).toBe(true);
    expect(b.reasons).toContain("CONFIRMED_CROSS_TENANT_READ_OR_WRITE");
    expect(b.severityFloor).toBe("HIGH");
  });
  it("summarizes an npm audit map", () => {
    const rows = normalizeNpmAudit({ vulnerabilities: { pkg: { severity: "high", isDirect: true, via: [{ url: "https://x" }], fixAvailable: false } } });
    expect(rows[0].severity).toBe("HIGH");
    expect(rows[0].advisories).toEqual(["https://x"]);
  });
});

describe("synthetic fixture detection", () => {
  it("recognises both spellings", () => {
    expect(isSyntheticFixture({ SYNTHETIC_TEST_FIXTURE: true })).toBe(true);
    expect(isSyntheticFixture({ syntheticTestFixture: true })).toBe(true);
    expect(isSyntheticFixture({})).toBe(false);
  });
});
