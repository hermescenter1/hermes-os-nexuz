/**
 * Phase 97 — PrivacyRequest lifecycle pure-logic assurance.
 *
 * Proves the closed state machine and the fail-closed deadline policy WITHOUT any
 * I/O. No statutory duration is ever assumed when the policy is unconfigured.
 */

import { describe, it, expect } from "vitest";
import {
  PRIVACY_REQUEST_TRANSITIONS,
  ALL_PRIVACY_REQUEST_STATUSES,
  canTransitionPrivacyRequest,
  isTerminalPrivacyStatus,
  resolvePrivacyDeadlines,
  readPrivacyDeadlinePolicyConfig,
} from "../privacy-request-lifecycle";

describe("privacy-request state machine", () => {
  it("exposes all 14 statuses (4 legacy + 10 Phase 97)", () => {
    expect(ALL_PRIVACY_REQUEST_STATUSES).toHaveLength(14);
    expect(ALL_PRIVACY_REQUEST_STATUSES).toContain("PENDING");
    expect(ALL_PRIVACY_REQUEST_STATUSES).toContain("RECEIVED");
    expect(ALL_PRIVACY_REQUEST_STATUSES).toContain("FULFILMENT_IN_PROGRESS");
  });

  it("allows only explicitly-listed transitions", () => {
    expect(canTransitionPrivacyRequest("PENDING", "IN_REVIEW")).toBe(true);
    expect(canTransitionPrivacyRequest("IN_REVIEW", "APPROVED")).toBe(true);
    expect(canTransitionPrivacyRequest("APPROVED", "FULFILMENT_IN_PROGRESS")).toBe(true);
    expect(canTransitionPrivacyRequest("FULFILMENT_IN_PROGRESS", "COMPLETED")).toBe(true);
  });

  it("rejects out-of-order and skip transitions", () => {
    expect(canTransitionPrivacyRequest("IN_REVIEW", "COMPLETED")).toBe(false);
    expect(canTransitionPrivacyRequest("PENDING", "COMPLETED")).toBe(false);
    expect(canTransitionPrivacyRequest("APPROVED", "REJECTED")).toBe(false);
  });

  it("rejects self-transitions", () => {
    expect(canTransitionPrivacyRequest("IN_REVIEW", "IN_REVIEW")).toBe(false);
  });

  it("terminal states have no outgoing transitions", () => {
    for (const t of ["COMPLETED", "REJECTED", "CANCELLED"] as const) {
      expect(isTerminalPrivacyStatus(t)).toBe(true);
      expect(PRIVACY_REQUEST_TRANSITIONS[t]).toEqual([]);
    }
    expect(canTransitionPrivacyRequest("COMPLETED", "IN_REVIEW")).toBe(false);
  });

  it("PENDING and RECEIVED are interchangeable entry states", () => {
    expect(PRIVACY_REQUEST_TRANSITIONS.PENDING).toEqual(PRIVACY_REQUEST_TRANSITIONS.RECEIVED);
  });
});

describe("deadline policy — fail-closed", () => {
  const receivedAt = new Date("2026-01-01T00:00:00.000Z");

  it("returns CONFIGURATION_REQUIRED with no due dates when unconfigured", () => {
    const r = resolvePrivacyDeadlines(null, receivedAt);
    expect(r.status).toBe("CONFIGURATION_REQUIRED");
    expect(r.responseDueAt).toBeNull();
    expect(r.acknowledgementDueAt).toBeNull();
  });

  it("returns CONFIGURATION_REQUIRED when the required responseDays is missing", () => {
    const r = resolvePrivacyDeadlines({ acknowledgementDays: 3 }, receivedAt);
    expect(r.status).toBe("CONFIGURATION_REQUIRED");
  });

  it("computes due dates ONLY from the supplied configuration", () => {
    const r = resolvePrivacyDeadlines({ acknowledgementDays: 3, responseDays: 30, extensionDays: 60 }, receivedAt);
    expect(r.status).toBe("CONFIGURED");
    expect(r.acknowledgementDueAt?.toISOString()).toBe("2026-01-04T00:00:00.000Z");
    expect(r.responseDueAt?.toISOString()).toBe("2026-01-31T00:00:00.000Z");
    // extension is response + extensionDays.
    expect(r.extensionDueAt?.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    // identity verification was not configured → null (never invented).
    expect(r.identityVerificationDueAt).toBeNull();
  });

  it("ignores non-positive / non-integer env values (treated as absent)", () => {
    const cfg = readPrivacyDeadlinePolicyConfig({ COMPLIANCE_PRIVACY_RESPONSE_DAYS: "-5", COMPLIANCE_PRIVACY_ACK_DAYS: "abc" });
    expect(cfg.responseDays).toBeUndefined();
    expect(cfg.acknowledgementDays).toBeUndefined();
    expect(resolvePrivacyDeadlines(cfg, receivedAt).status).toBe("CONFIGURATION_REQUIRED");
  });

  it("reads a valid env policy", () => {
    const cfg = readPrivacyDeadlinePolicyConfig({ COMPLIANCE_PRIVACY_RESPONSE_DAYS: "30" });
    expect(cfg.responseDays).toBe(30);
    expect(resolvePrivacyDeadlines(cfg, receivedAt).status).toBe("CONFIGURED");
  });
});
