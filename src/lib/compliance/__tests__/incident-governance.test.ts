/**
 * Phase 97 — compliance-incident governance pure logic (I/O-free). Closed
 * vocabularies, explicit lifecycle + assessment transition maps, high-authority
 * classification, and the fail-closed closure gate.
 */
import { describe, it, expect } from "vitest";
import {
  INCIDENT_TYPES, INCIDENT_LIFECYCLES, ASSESSMENT_STATUSES,
  isIncidentType, isIncidentSeverity, isIncidentLifecycle, isAssessmentStatus, isIncidentSourceClass,
  canTransitionIncident, incidentTransitionAction, isEditableIncidentLifecycle,
  canTransitionAssessment, assessmentTransitionAction, isAssessmentDecisionState,
  incidentClosureBlockers, canResolveOrCloseIncident, assessmentClosureBlocker, lifecycleEventCode,
} from "../incident-governance";

describe("closed vocabularies", () => {
  it("guards accept exactly the closed sets", () => {
    for (const t of INCIDENT_TYPES) expect(isIncidentType(t)).toBe(true);
    expect(isIncidentType("MADE_UP")).toBe(false);
    expect(INCIDENT_TYPES).toContain("REVIEW_REQUIRED"); // fail-closed default is a member
    expect(isIncidentSeverity("CRITICAL")).toBe(true);
    expect(isIncidentSeverity("SEV1")).toBe(false);
    for (const l of INCIDENT_LIFECYCLES) expect(isIncidentLifecycle(l)).toBe(true);
    expect(isIncidentLifecycle("DONE")).toBe(false);
    for (const a of ASSESSMENT_STATUSES) expect(isAssessmentStatus(a)).toBe(true);
    expect(isAssessmentStatus("BREACH_CONFIRMED")).toBe(false); // never an auto-derived breach verdict
    expect(isIncidentSourceClass("OBSERVABILITY")).toBe(true);
    expect(isIncidentSourceClass("GUESS")).toBe(false);
  });
});

describe("lifecycle transitions + action classification", () => {
  it("valid/invalid/self transitions; CANCELLED terminal", () => {
    expect(canTransitionIncident("OPEN", "TRIAGED")).toBe(true);
    expect(canTransitionIncident("OPEN", "RESOLVED")).toBe(false); // cannot skip investigation
    expect(canTransitionIncident("OPEN", "OPEN")).toBe(false);
    expect(canTransitionIncident("CANCELLED", "INVESTIGATING")).toBe(false); // terminal
    expect(canTransitionIncident("INVESTIGATING", "RESOLVED")).toBe(true);
  });
  it("resolve / close / reopen are classified distinctly from manage", () => {
    expect(incidentTransitionAction("OPEN", "TRIAGED")).toBe("manage");
    expect(incidentTransitionAction("INVESTIGATING", "RESOLVED")).toBe("resolve");
    expect(incidentTransitionAction("MONITORING", "RESOLVED")).toBe("resolve");
    expect(incidentTransitionAction("RESOLVED", "CLOSED")).toBe("close");
    expect(incidentTransitionAction("CLOSED", "INVESTIGATING")).toBe("reopen");
    expect(incidentTransitionAction("RESOLVED", "INVESTIGATING")).toBe("reopen");
    expect(incidentTransitionAction("OPEN", "RESOLVED")).toBeNull();
  });
  it("editable lifecycles are the active working states only", () => {
    for (const l of ["OPEN", "TRIAGED", "INVESTIGATING", "CONTAINED", "REMEDIATING", "MONITORING"]) expect(isEditableIncidentLifecycle(l)).toBe(true);
    for (const l of ["RESOLVED", "CLOSED", "CANCELLED"]) expect(isEditableIncidentLifecycle(l)).toBe(false);
  });
});

describe("assessment transitions + high-authority classification", () => {
  it("decision states require the decide action; progression is assess", () => {
    expect(assessmentTransitionAction("REVIEW_REQUIRED", "IN_ASSESSMENT")).toBe("assess");
    expect(assessmentTransitionAction("IN_ASSESSMENT", "LEGAL_REVIEW_REQUIRED")).toBe("assess");
    expect(assessmentTransitionAction("IN_ASSESSMENT", "DECISION_RECORDED")).toBe("decide");
    expect(assessmentTransitionAction("LEGAL_REVIEW_REQUIRED", "NO_EXTERNAL_NOTIFICATION_DECISION")).toBe("decide");
    expect(assessmentTransitionAction("IN_ASSESSMENT", "EXTERNAL_NOTIFICATION_REVIEW_REQUIRED")).toBe("decide");
    expect(assessmentTransitionAction("REVIEW_REQUIRED", "DECISION_RECORDED")).toBeNull(); // cannot skip assessment
    expect(canTransitionAssessment("DECISION_RECORDED", "IN_ASSESSMENT")).toBe(true); // re-assessment allowed
    expect(isAssessmentDecisionState("DECISION_RECORDED")).toBe(true);
    expect(isAssessmentDecisionState("IN_ASSESSMENT")).toBe(false);
  });
});

describe("closure gate (fail-closed)", () => {
  const ok = { assessmentStatus: "DECISION_RECORDED", ownerId: "u1", assignedToId: null, openBlockerCount: 0, activeLegalHold: false };
  it("a fully-decided, owned, unblocked incident with no active hold may close", () => {
    expect(canResolveOrCloseIncident(ok).ok).toBe(true);
    expect(canResolveOrCloseIncident({ ...ok, assessmentStatus: "NO_EXTERNAL_NOTIFICATION_DECISION" }).ok).toBe(true);
  });
  it("an un-decided assessment blocks closure with a specific reason (UNASSESSED_INCIDENT_CLOSURE=0)", () => {
    expect(assessmentClosureBlocker("REVIEW_REQUIRED")).toBe("ASSESSMENT_REQUIRED");
    expect(assessmentClosureBlocker("LEGAL_REVIEW_REQUIRED")).toBe("LEGAL_REVIEW_REQUIRED");
    expect(assessmentClosureBlocker("INSUFFICIENT_EVIDENCE")).toBe("EVIDENCE_INSUFFICIENT");
    expect(assessmentClosureBlocker("IN_ASSESSMENT")).toBe("ASSESSMENT_IN_PROGRESS");
    expect(assessmentClosureBlocker("EXTERNAL_NOTIFICATION_REVIEW_REQUIRED")).toBe("ASSESSMENT_IN_PROGRESS");
    expect(assessmentClosureBlocker("DECISION_RECORDED")).toBeNull();
    const b = incidentClosureBlockers({ ...ok, assessmentStatus: "REVIEW_REQUIRED" });
    expect(b.some((x) => x.field === "assessmentStatus" && x.reason === "ASSESSMENT_REQUIRED")).toBe(true);
  });
  it("missing ownership, unresolved blockers and an active hold each block closure", () => {
    expect(incidentClosureBlockers({ ...ok, ownerId: null, assignedToId: null }).some((x) => x.reason === "OWNERSHIP_REQUIRED")).toBe(true);
    // an assignee alone satisfies ownership
    expect(incidentClosureBlockers({ ...ok, ownerId: null, assignedToId: "u2" }).some((x) => x.reason === "OWNERSHIP_REQUIRED")).toBe(false);
    expect(incidentClosureBlockers({ ...ok, openBlockerCount: 2 }).some((x) => x.reason === "UNRESOLVED_BLOCKERS")).toBe(true);
    expect(incidentClosureBlockers({ ...ok, activeLegalHold: true }).some((x) => x.reason === "ACTIVE_LEGAL_HOLD")).toBe(true);
  });
  it("all blockers can stack", () => {
    const b = incidentClosureBlockers({ assessmentStatus: "REVIEW_REQUIRED", ownerId: null, assignedToId: null, openBlockerCount: 1, activeLegalHold: true });
    expect(b.map((x) => x.reason).sort()).toEqual(["ACTIVE_LEGAL_HOLD", "ASSESSMENT_REQUIRED", "OWNERSHIP_REQUIRED", "UNRESOLVED_BLOCKERS"]);
  });
});

describe("timeline event codes", () => {
  it("reopen is its own code; other transitions are LIFECYCLE_TRANSITIONED", () => {
    expect(lifecycleEventCode("reopen")).toBe("REOPENED");
    expect(lifecycleEventCode("manage")).toBe("LIFECYCLE_TRANSITIONED");
    expect(lifecycleEventCode("resolve")).toBe("LIFECYCLE_TRANSITIONED");
    expect(lifecycleEventCode("close")).toBe("LIFECYCLE_TRANSITIONED");
  });
});
