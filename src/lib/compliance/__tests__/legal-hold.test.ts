/**
 * Phase 97 — Legal-hold scope validation & lifecycle (pure, I/O-free).
 *
 * Proves fail-closed scope semantics and the closed status machine that keep
 * INVALID_LEGAL_HOLD_ACTIVATION=0 and unblur cancellation from release.
 */

import { describe, it, expect } from "vitest";
import {
  validateLegalHoldScope,
  canTransitionLegalHold,
  isTerminalLegalHoldStatus,
  classifyLegalHoldEdit,
  classifyLegalHoldTransition,
  LEGAL_HOLD_TRANSITIONS,
  MATERIAL_LEGAL_HOLD_FIELDS,
  ACTIVE_EDITABLE_LEGAL_HOLD_FIELDS,
} from "../legal-hold";

describe("validateLegalHoldScope — valid shapes", () => {
  it("accepts each complete scope", () => {
    expect(validateLegalHoldScope({ scopeType: "SUBJECT", subjectId: "s1" }).ok).toBe(true);
    expect(validateLegalHoldScope({ scopeType: "RESOURCE", resourceType: "case", resourceId: "c1" }).ok).toBe(true);
    expect(validateLegalHoldScope({ scopeType: "RESOURCE_TYPE", resourceType: "case" }).ok).toBe(true);
    expect(validateLegalHoldScope({ scopeType: "PROCESSING_ACTIVITY", processingActivityId: "pa1" }).ok).toBe(true);
    expect(validateLegalHoldScope({ scopeType: "INCIDENT", incidentId: "i1" }).ok).toBe(true);
    expect(validateLegalHoldScope({ scopeType: "DATE_RANGE", rangeStart: "2026-01-01T00:00:00.000Z" }).ok).toBe(true);
    expect(validateLegalHoldScope({ scopeType: "ORGANIZATION" }).ok).toBe(true);
  });

  it("normalizes away fields the scope does not use", () => {
    const v = validateLegalHoldScope({ scopeType: "SUBJECT", subjectId: "s1" });
    expect(v.ok && v.normalized.resourceId).toBeNull();
    expect(v.ok && v.normalized.subjectId).toBe("s1");
  });
});

describe("validateLegalHoldScope — incomplete shapes fail closed", () => {
  it("rejects missing required fields", () => {
    expect(validateLegalHoldScope({ scopeType: "SUBJECT" }).ok).toBe(false);
    expect(validateLegalHoldScope({ scopeType: "RESOURCE", resourceType: "case" }).ok).toBe(false); // no resourceId
    expect(validateLegalHoldScope({ scopeType: "RESOURCE_TYPE" }).ok).toBe(false);
    expect(validateLegalHoldScope({ scopeType: "PROCESSING_ACTIVITY" }).ok).toBe(false);
    expect(validateLegalHoldScope({ scopeType: "INCIDENT" }).ok).toBe(false);
    expect(validateLegalHoldScope({ scopeType: "DATE_RANGE" }).ok).toBe(false);
  });
});

describe("validateLegalHoldScope — contradictory fields rejected", () => {
  it("rejects an unrelated target field", () => {
    expect(validateLegalHoldScope({ scopeType: "SUBJECT", subjectId: "s1", resourceId: "c1" }).ok).toBe(false);
    expect(validateLegalHoldScope({ scopeType: "ORGANIZATION", subjectId: "s1" }).ok).toBe(false);
  });
  it("RESOURCE_TYPE must not carry a hidden resourceId scope", () => {
    const v = validateLegalHoldScope({ scopeType: "RESOURCE_TYPE", resourceType: "case", resourceId: "c1" });
    expect(v.ok).toBe(false);
    expect(!v.ok && v.reason).toContain("CONTRADICTORY_FIELD:resourceId");
  });
});

describe("validateLegalHoldScope — date range + unknown scope", () => {
  it("rejects rangeStart after rangeEnd", () => {
    const v = validateLegalHoldScope({ scopeType: "DATE_RANGE", rangeStart: "2026-06-01T00:00:00.000Z", rangeEnd: "2026-01-01T00:00:00.000Z" });
    expect(v.ok).toBe(false);
    expect(!v.ok && v.reason).toBe("RANGE_START_AFTER_END");
  });
  it("accepts a well-ordered range", () => {
    expect(validateLegalHoldScope({ scopeType: "DATE_RANGE", rangeStart: "2026-01-01T00:00:00.000Z", rangeEnd: "2026-06-01T00:00:00.000Z" }).ok).toBe(true);
  });
  it("fails closed on an unknown scope type", () => {
    const v = validateLegalHoldScope({ scopeType: "EVERYTHING" });
    expect(v.ok).toBe(false);
    expect(!v.ok && v.reason).toBe("UNKNOWN_SCOPE_TYPE");
  });
});

describe("legal-hold lifecycle machine", () => {
  it("PROPOSED can activate or cancel — never directly release", () => {
    expect(canTransitionLegalHold("PROPOSED", "ACTIVE")).toBe(true);
    expect(canTransitionLegalHold("PROPOSED", "CANCELLED")).toBe(true);
    expect(canTransitionLegalHold("PROPOSED", "RELEASED")).toBe(false);
  });
  it("ACTIVE releases only; never cancels", () => {
    expect(canTransitionLegalHold("ACTIVE", "RELEASED")).toBe(true);
    expect(canTransitionLegalHold("ACTIVE", "CANCELLED")).toBe(false);
  });
  it("RELEASED and CANCELLED are terminal", () => {
    expect(LEGAL_HOLD_TRANSITIONS.RELEASED).toEqual([]);
    expect(LEGAL_HOLD_TRANSITIONS.CANCELLED).toEqual([]);
    expect(isTerminalLegalHoldStatus("RELEASED")).toBe(true);
    expect(isTerminalLegalHoldStatus("CANCELLED")).toBe(true);
    expect(isTerminalLegalHoldStatus("ACTIVE")).toBe(false);
    expect(canTransitionLegalHold("RELEASED", "ACTIVE")).toBe(false);
  });
  it("rejects self-transitions", () => {
    expect(canTransitionLegalHold("ACTIVE", "ACTIVE")).toBe(false);
  });
});

describe("material field constants", () => {
  it("scope/reason/dates are material; reviewDate is the only ACTIVE-editable field", () => {
    expect(MATERIAL_LEGAL_HOLD_FIELDS).toContain("scopeType");
    expect(MATERIAL_LEGAL_HOLD_FIELDS).toContain("reasonClass");
    expect(MATERIAL_LEGAL_HOLD_FIELDS).toContain("startDate");
    expect(MATERIAL_LEGAL_HOLD_FIELDS).not.toContain("reviewDate");
    expect(ACTIVE_EDITABLE_LEGAL_HOLD_FIELDS).toEqual(["reviewDate"]);
  });
});

describe("classifyLegalHoldEdit — mutability from the LOCKED status", () => {
  it("PROPOSED accepts any material edit", () => {
    expect(classifyLegalHoldEdit("PROPOSED", ["name", "subjectId", "startDate"])).toEqual({ ok: true, scope: "MATERIAL" });
  });
  it("ACTIVE accepts a reviewDate-only edit", () => {
    expect(classifyLegalHoldEdit("ACTIVE", ["reviewDate"])).toEqual({ ok: true, scope: "REVIEW_ONLY" });
  });
  it("ACTIVE rejects any material field (ACTIVE_LEGAL_HOLD_MATERIAL_MUTATION=0)", () => {
    expect(classifyLegalHoldEdit("ACTIVE", ["subjectId"])).toEqual({ ok: false, reason: "ACTIVE_HOLD_IMMUTABLE" });
    expect(classifyLegalHoldEdit("ACTIVE", ["reviewDate", "name"])).toEqual({ ok: false, reason: "ACTIVE_HOLD_IMMUTABLE" });
  });
  it("RELEASED and CANCELLED are fully immutable (TERMINAL_HOLD_MUTATION=0)", () => {
    expect(classifyLegalHoldEdit("RELEASED", ["reviewDate"])).toEqual({ ok: false, reason: "HOLD_IMMUTABLE" });
    expect(classifyLegalHoldEdit("CANCELLED", ["name"])).toEqual({ ok: false, reason: "HOLD_IMMUTABLE" });
  });
});

describe("classifyLegalHoldTransition — edges from the LOCKED status", () => {
  it("maps each valid edge to its kind", () => {
    expect(classifyLegalHoldTransition("PROPOSED", "ACTIVE")).toEqual({ ok: true, kind: "ACTIVATE" });
    expect(classifyLegalHoldTransition("ACTIVE", "RELEASED")).toEqual({ ok: true, kind: "RELEASE" });
    expect(classifyLegalHoldTransition("PROPOSED", "CANCELLED")).toEqual({ ok: true, kind: "CANCEL" });
  });
  it("rejects every other pair (including out-of-order and terminal)", () => {
    expect(classifyLegalHoldTransition("PROPOSED", "RELEASED")).toEqual({ ok: false });
    expect(classifyLegalHoldTransition("ACTIVE", "CANCELLED")).toEqual({ ok: false });
    expect(classifyLegalHoldTransition("ACTIVE", "ACTIVE")).toEqual({ ok: false });
    expect(classifyLegalHoldTransition("RELEASED", "ACTIVE")).toEqual({ ok: false });
    expect(classifyLegalHoldTransition("CANCELLED", "ACTIVE")).toEqual({ ok: false });
    expect(classifyLegalHoldTransition("PROPOSED", "PROPOSED")).toEqual({ ok: false });
  });
});
