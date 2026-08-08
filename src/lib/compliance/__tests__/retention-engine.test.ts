/**
 * Phase 97 — Retention & Legal-hold engine assurance (pure, I/O-free).
 *
 * Central invariant: LEGAL_HOLD_PROTECTED_DELETION=0 — a record under an ACTIVE
 * hold is never eligible for DELETE/ANONYMISE. Also proves no invented duration
 * and dry-run/execution-disabled defaults.
 */

import { describe, it, expect } from "vitest";
import {
  holdCovers,
  isUnderLegalHold,
  classifyRetentionPolicy,
  evaluateRetentionEligibility,
  buildRetentionDryRunReport,
  isRetentionExecutionEnabled,
  type HoldLike,
  type HoldTarget,
  type RetentionPolicyLike,
} from "../retention-engine";

const now = new Date("2026-06-01T00:00:00.000Z");
const oldTrigger = { triggerAt: new Date("2020-01-01T00:00:00.000Z") };
const target = (over: Partial<HoldTarget> = {}): HoldTarget => ({ organizationId: "org-A", ...over });

function activeHold(over: Partial<HoldLike> = {}): HoldLike {
  return { organizationId: "org-A", scopeType: "SUBJECT", status: "ACTIVE", subjectId: "subj-1", ...over };
}

const approvedDelete: RetentionPolicyLike = { action: "DELETE", retentionDays: 30, approvalState: "APPROVED", enabled: true };

describe("holdCovers — scope + tenant", () => {
  it("only ACTIVE holds apply", () => {
    expect(holdCovers(activeHold({ status: "PROPOSED" }), target({ subjectId: "subj-1" }))).toBe(false);
    expect(holdCovers(activeHold({ status: "RELEASED" }), target({ subjectId: "subj-1" }))).toBe(false);
    expect(holdCovers(activeHold(), target({ subjectId: "subj-1" }))).toBe(true);
  });

  it("never applies across tenants", () => {
    expect(holdCovers(activeHold(), target({ organizationId: "org-B", subjectId: "subj-1" }))).toBe(false);
  });

  it("covers by each scope type", () => {
    expect(holdCovers(activeHold({ scopeType: "ORGANIZATION" }), target())).toBe(true);
    expect(holdCovers(activeHold({ scopeType: "RESOURCE", resourceType: "case", resourceId: "c1" }), target({ resourceType: "case", resourceId: "c1" }))).toBe(true);
    expect(holdCovers(activeHold({ scopeType: "RESOURCE_TYPE", resourceType: "case" }), target({ resourceType: "case", resourceId: "any" }))).toBe(true);
    expect(holdCovers(activeHold({ scopeType: "PROCESSING_ACTIVITY", processingActivityId: "pa1" }), target({ processingActivityId: "pa1" }))).toBe(true);
    expect(holdCovers(activeHold({ scopeType: "INCIDENT", incidentId: "inc1" }), target({ incidentId: "inc1" }))).toBe(true);
    expect(holdCovers(
      activeHold({ scopeType: "DATE_RANGE", rangeStart: new Date("2020-01-01"), rangeEnd: new Date("2021-01-01") }),
      target({ timestamp: new Date("2020-06-01") }),
    )).toBe(true);
  });

  it("does not cover a mismatched subject / out-of-range date", () => {
    expect(holdCovers(activeHold({ subjectId: "subj-1" }), target({ subjectId: "subj-2" }))).toBe(false);
    expect(holdCovers(
      activeHold({ scopeType: "DATE_RANGE", rangeStart: new Date("2020-01-01"), rangeEnd: new Date("2021-01-01") }),
      target({ timestamp: new Date("2025-06-01") }),
    )).toBe(false);
  });
});

describe("classifyRetentionPolicy — fail closed", () => {
  it("CONFIGURED only when approved + day-valued + non-REVIEW action", () => {
    expect(classifyRetentionPolicy(approvedDelete).status).toBe("CONFIGURED");
    expect(classifyRetentionPolicy({ ...approvedDelete, approvalState: "PENDING_REVIEW" }).status).toBe("CONFIGURATION_REQUIRED");
    expect(classifyRetentionPolicy({ ...approvedDelete, retentionDays: null }).status).toBe("CONFIGURATION_REQUIRED");
    expect(classifyRetentionPolicy({ ...approvedDelete, action: "REVIEW_REQUIRED" }).status).toBe("CONFIGURATION_REQUIRED");
  });
});

describe("evaluateRetentionEligibility — LEGAL_HOLD_PROTECTED_DELETION=0", () => {
  it("a held record is LEGAL_HOLD, never ELIGIBLE, for a DELETE policy", () => {
    const r = evaluateRetentionEligibility(approvedDelete, { ...oldTrigger, target: target({ subjectId: "subj-1" }) }, [activeHold()], now);
    expect(r.decision).toBe("LEGAL_HOLD");
  });

  it("a held record is protected even from ANONYMISE", () => {
    const r = evaluateRetentionEligibility({ ...approvedDelete, action: "ANONYMISE" }, { ...oldTrigger, target: target({ subjectId: "subj-1" }) }, [activeHold()], now);
    expect(r.decision).toBe("LEGAL_HOLD");
  });

  it("protection holds even when the policy config is complete AND overdue", () => {
    // Overdue by years, approved, enabled — still protected.
    const r = evaluateRetentionEligibility(approvedDelete, { triggerAt: new Date("2000-01-01"), target: target({ subjectId: "subj-1" }) }, [activeHold()], now);
    expect(r.decision).not.toBe("ELIGIBLE");
    expect(r.decision).toBe("LEGAL_HOLD");
  });

  it("a PROPOSED (not active) hold does NOT protect — record can be eligible", () => {
    const r = evaluateRetentionEligibility(approvedDelete, { ...oldTrigger, target: target({ subjectId: "subj-1" }) }, [activeHold({ status: "PROPOSED" })], now);
    expect(r.decision).toBe("ELIGIBLE");
  });

  it("ARCHIVE is not blocked by a hold (data is preserved)", () => {
    const r = evaluateRetentionEligibility({ ...approvedDelete, action: "ARCHIVE" }, { ...oldTrigger, target: target({ subjectId: "subj-1" }) }, [activeHold()], now);
    expect(r.decision).toBe("ELIGIBLE");
    expect(r.action).toBe("ARCHIVE");
  });

  it("an unconfigured policy is CONFIGURATION_REQUIRED (no action)", () => {
    const r = evaluateRetentionEligibility({ action: "DELETE", retentionDays: null, approvalState: "PENDING_REVIEW" }, { ...oldTrigger, target: target() }, [], now);
    expect(r.decision).toBe("CONFIGURATION_REQUIRED");
  });

  it("a not-yet-due record is RETENTION_REQUIRED", () => {
    const r = evaluateRetentionEligibility(approvedDelete, { triggerAt: new Date("2026-05-30"), target: target() }, [], now);
    expect(r.decision).toBe("RETENTION_REQUIRED");
  });

  it("NO_AUTOMATED_ACTION is respected", () => {
    const r = evaluateRetentionEligibility({ action: "NO_AUTOMATED_ACTION", retentionDays: 30, approvalState: "APPROVED" }, { ...oldTrigger, target: target() }, [], now);
    expect(r.decision).toBe("NO_AUTOMATED_ACTION");
  });
});

describe("dry-run report + execution flag", () => {
  it("aggregates decisions and is always dryRun=true", () => {
    const report = buildRetentionDryRunReport(
      approvedDelete,
      [
        { ...oldTrigger, target: target({ subjectId: "subj-1" }) }, // held
        { ...oldTrigger, target: target({ subjectId: "subj-free" }) }, // eligible
        { triggerAt: new Date("2026-05-30"), target: target({ subjectId: "subj-x" }) }, // not due
      ],
      [activeHold({ subjectId: "subj-1" })],
      now,
    );
    expect(report.dryRun).toBe(true);
    expect(report.total).toBe(3);
    expect(report.counts.LEGAL_HOLD).toBe(1);
    expect(report.counts.ELIGIBLE).toBe(1);
    expect(report.counts.RETENTION_REQUIRED).toBe(1);
  });

  it("destructive execution is disabled by default", () => {
    expect(isRetentionExecutionEnabled({})).toBe(false);
    expect(isRetentionExecutionEnabled({ COMPLIANCE_RETENTION_EXECUTION_ENABLED: "false" })).toBe(false);
    expect(isRetentionExecutionEnabled({ COMPLIANCE_RETENTION_EXECUTION_ENABLED: "true" })).toBe(true);
  });
});

// isUnderLegalHold convenience
describe("isUnderLegalHold", () => {
  it("true if any active hold covers", () => {
    expect(isUnderLegalHold(target({ subjectId: "subj-1" }), [activeHold(), activeHold({ subjectId: "other" })])).toBe(true);
    expect(isUnderLegalHold(target({ subjectId: "nobody" }), [activeHold()])).toBe(false);
  });
});
