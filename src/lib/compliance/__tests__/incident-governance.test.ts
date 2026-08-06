/**
 * Phase 97 — compliance-incident governance pure logic (I/O-free). Closed
 * vocabularies (incl. actions + actor class + decision outcome), lifecycle +
 * assessment transition maps, high-authority classification, decision-evidence
 * versioning, and the evidence-aware fail-closed closure gate.
 */
import { describe, it, expect } from "vitest";
import {
  INCIDENT_TYPES, INCIDENT_LIFECYCLES, ASSESSMENT_STATUSES,
  isIncidentType, isIncidentSeverity, isIncidentLifecycle, isAssessmentStatus, isIncidentSourceClass,
  isIncidentActorClass, isIncidentActionPriority, isIncidentActionStatus, isIncidentActionCode,
  canTransitionIncident, incidentTransitionAction, isEditableIncidentLifecycle,
  canTransitionAssessment, assessmentTransitionAction, isAssessmentDecisionState,
  incidentClosureBlockers, canResolveOrCloseIncident, assessmentClosureBlocker, lifecycleEventCode,
  isValidDecisionEvidence, nextDecisionVersion,
} from "../incident-governance";

const HASH = "a".repeat(64);

describe("closed vocabularies", () => {
  it("guards accept exactly the closed sets", () => {
    for (const t of INCIDENT_TYPES) expect(isIncidentType(t)).toBe(true);
    expect(isIncidentType("MADE_UP")).toBe(false);
    expect(isIncidentSeverity("CRITICAL")).toBe(true);
    for (const l of INCIDENT_LIFECYCLES) expect(isIncidentLifecycle(l)).toBe(true);
    for (const a of ASSESSMENT_STATUSES) expect(isAssessmentStatus(a)).toBe(true);
    expect(isAssessmentStatus("BREACH_CONFIRMED")).toBe(false); // never an auto-derived breach verdict
    expect(isIncidentSourceClass("OBSERVABILITY")).toBe(true);
    expect(isIncidentActorClass("ORGANIZATION_MEMBER")).toBe(true);
    expect(isIncidentActorClass("PLATFORM")).toBe(true);
    expect(isIncidentActorClass("ROBOT")).toBe(false);
    for (const p of ["LOW", "MEDIUM", "HIGH", "CRITICAL"]) expect(isIncidentActionPriority(p)).toBe(true);
    expect(isIncidentActionPriority("SEV0")).toBe(false);
    for (const s of ["OPEN", "RESOLVED", "CANCELLED"]) expect(isIncidentActionStatus(s)).toBe(true);
    expect(isIncidentActionCode("CONTAINMENT_REQUIRED")).toBe(true);
    expect(isIncidentActionCode("do-whatever")).toBe(false);
  });
});

describe("lifecycle + assessment transitions", () => {
  it("resolve / close / reopen are classified distinctly from manage; CANCELLED is terminal", () => {
    expect(canTransitionIncident("OPEN", "RESOLVED")).toBe(false);
    expect(canTransitionIncident("CANCELLED", "INVESTIGATING")).toBe(false);
    expect(incidentTransitionAction("OPEN", "TRIAGED")).toBe("manage");
    expect(incidentTransitionAction("INVESTIGATING", "RESOLVED")).toBe("resolve");
    expect(incidentTransitionAction("RESOLVED", "CLOSED")).toBe("close");
    expect(incidentTransitionAction("CLOSED", "INVESTIGATING")).toBe("reopen");
    expect(incidentTransitionAction("RESOLVED", "INVESTIGATING")).toBe("reopen");
  });
  it("editable lifecycles are the active working states only", () => {
    for (const l of ["OPEN", "TRIAGED", "INVESTIGATING", "CONTAINED", "REMEDIATING", "MONITORING"]) expect(isEditableIncidentLifecycle(l)).toBe(true);
    for (const l of ["RESOLVED", "CLOSED", "CANCELLED"]) expect(isEditableIncidentLifecycle(l)).toBe(false);
  });
  it("decision states require the decide action; progression is assess", () => {
    expect(assessmentTransitionAction("IN_ASSESSMENT", "LEGAL_REVIEW_REQUIRED")).toBe("assess");
    expect(assessmentTransitionAction("IN_ASSESSMENT", "DECISION_RECORDED")).toBe("decide");
    expect(assessmentTransitionAction("IN_ASSESSMENT", "EXTERNAL_NOTIFICATION_REVIEW_REQUIRED")).toBe("decide");
    expect(assessmentTransitionAction("REVIEW_REQUIRED", "DECISION_RECORDED")).toBeNull(); // cannot skip assessment
    expect(canTransitionAssessment("DECISION_RECORDED", "IN_ASSESSMENT")).toBe(true); // re-assessment allowed
    expect(isAssessmentDecisionState("DECISION_RECORDED")).toBe(true);
  });
});

describe("decision evidence + monotonic version", () => {
  it("a valid current decision needs a sha256 hash AND a positive version", () => {
    expect(isValidDecisionEvidence(HASH, 1)).toBe(true);
    expect(isValidDecisionEvidence(HASH, 0)).toBe(false);            // version must be > 0
    expect(isValidDecisionEvidence(null, 1)).toBe(false);            // hash required
    expect(isValidDecisionEvidence("NOTAHASH", 1)).toBe(false);
    expect(isValidDecisionEvidence("A".repeat(64), 1)).toBe(false);  // must be lowercase hex
  });
  it("decisionVersion is monotonic — never decreases; invalidation preserves lineage", () => {
    expect(nextDecisionVersion(0)).toBe(1);
    expect(nextDecisionVersion(1)).toBe(2);
    expect(nextDecisionVersion(7)).toBe(8);
    expect(nextDecisionVersion(-3)).toBe(1); // defensive: never below 1
  });
});

describe("closure gate (evidence-aware, fail-closed)", () => {
  const ok = { assessmentStatus: "DECISION_RECORDED", decisionEvidenceHash: HASH, decisionVersion: 3, ownerId: "u1", ownerMembershipActive: true, openActionCount: 0, activeLegalHold: false };
  it("a fully-decided, owned+active, unblocked incident with no hold may close", () => {
    expect(canResolveOrCloseIncident(ok).ok).toBe(true);
    expect(canResolveOrCloseIncident({ ...ok, assessmentStatus: "NO_EXTERNAL_NOTIFICATION_DECISION" }).ok).toBe(true);
  });
  it("an un-decided assessment blocks (UNASSESSED_INCIDENT_CLOSURE=0)", () => {
    expect(assessmentClosureBlocker("REVIEW_REQUIRED")).toBe("ASSESSMENT_REQUIRED");
    expect(incidentClosureBlockers({ ...ok, assessmentStatus: "IN_ASSESSMENT" }).some((b) => b.field === "assessmentStatus")).toBe(true);
    // EXTERNAL_NOTIFICATION_REVIEW_REQUIRED is a decision-authority state but NOT closure-permitted.
    expect(incidentClosureBlockers({ ...ok, assessmentStatus: "EXTERNAL_NOTIFICATION_REVIEW_REQUIRED" }).some((b) => b.reason === "ASSESSMENT_IN_PROGRESS")).toBe(true);
  });
  it("a decided state with INVALID/absent current evidence blocks (never the status string alone)", () => {
    expect(incidentClosureBlockers({ ...ok, decisionEvidenceHash: null }).some((b) => b.reason === "DECISION_EVIDENCE_REQUIRED")).toBe(true);
    expect(incidentClosureBlockers({ ...ok, decisionVersion: 0 }).some((b) => b.reason === "DECISION_EVIDENCE_REQUIRED")).toBe(true);
    expect(incidentClosureBlockers({ ...ok, decisionEvidenceHash: "bad" }).some((b) => b.reason === "DECISION_EVIDENCE_REQUIRED")).toBe(true);
  });
  it("missing/inactive owner, open actions and an active hold each block closure", () => {
    expect(incidentClosureBlockers({ ...ok, ownerId: null }).some((b) => b.reason === "OWNERSHIP_REQUIRED")).toBe(true);
    expect(incidentClosureBlockers({ ...ok, ownerMembershipActive: false }).some((b) => b.reason === "OWNER_MEMBERSHIP_INACTIVE")).toBe(true);
    expect(incidentClosureBlockers({ ...ok, openActionCount: 1 }).some((b) => b.reason === "UNRESOLVED_ACTIONS")).toBe(true);
    expect(incidentClosureBlockers({ ...ok, activeLegalHold: true }).some((b) => b.reason === "ACTIVE_LEGAL_HOLD")).toBe(true);
  });
  it("all blockers stack", () => {
    const b = incidentClosureBlockers({ assessmentStatus: "REVIEW_REQUIRED", decisionEvidenceHash: null, decisionVersion: 0, ownerId: null, ownerMembershipActive: false, openActionCount: 2, activeLegalHold: true });
    expect(b.map((x) => x.reason).sort()).toEqual(["ACTIVE_LEGAL_HOLD", "ASSESSMENT_REQUIRED", "OWNERSHIP_REQUIRED", "UNRESOLVED_ACTIONS"]);
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
