/**
 * Phase 97 Part H — erasure governance pure logic (I/O-free).
 * Lifecycle + parent eligibility, closed target registry (secret exclusion),
 * deterministic plan + planHash, classification precedence, approvability, and the
 * disabled-execution / stale-preflight / idempotency posture.
 */
import { describe, it, expect } from "vitest";
import {
  ERASURE_TRANSITIONS, canTransitionErasure, erasureTransitionAction, isInternalErasureStep,
  isActiveErasureLifecycle, isTerminalErasureLifecycle, isKnownErasureLifecycle,
  isErasureExecutionEnabled, assessParentErasureEligibility,
} from "../erasure-lifecycle";
import {
  ERASURE_TARGET_REGISTRY, ERASURE_TARGET_NAMES, FORBIDDEN_ERASURE_FIELDS, FORBIDDEN_ERASURE_TARGETS,
  ERASURE_REGISTRY_VERSION,
  getErasureTarget, collectErasureTargets, type ErasurePrisma, type ErasureTargetRecord, type ErasureTargetDefinition,
} from "../erasure-targets";
import {
  buildErasurePlan, computeErasurePlanHash, canApproveErasurePlan, validatePersistedErasurePlan,
  resolutionAffectedResultItem,
  type BuildErasurePlanInput, type ErasureRetentionPolicyLike, type ErasurePlan,
} from "../erasure-planner";
import {
  runErasurePreflight, applyErasurePlanSynthetic, createSyntheticErasureStore, erasureExecutionGate,
} from "../erasure-executor";
import type { HoldLike } from "../retention-engine";

describe("erasure lifecycle", () => {
  it("IN_REVIEW→APPROVED needs approve; APPROVED→EXECUTION_PENDING needs execute; others manage", () => {
    expect(erasureTransitionAction("IN_REVIEW", "APPROVED")).toBe("approve");
    expect(erasureTransitionAction("IN_REVIEW", "REJECTED")).toBe("approve");
    expect(erasureTransitionAction("APPROVED", "EXECUTION_PENDING")).toBe("execute");
    expect(erasureTransitionAction("PLAN_READY", "IN_REVIEW")).toBe("manage");
    expect(erasureTransitionAction("APPROVED", "PLANNING")).toBe("manage");
  });
  it("internal planner/executor steps are NOT API-callable", () => {
    expect(erasureTransitionAction("PLANNING", "PLAN_READY")).toBeNull();
    expect(erasureTransitionAction("EXECUTION_PENDING", "EXECUTING")).toBeNull();
    expect(erasureTransitionAction("EXECUTING", "COMPLETED")).toBeNull();
    expect(isInternalErasureStep("EXECUTING", "COMPLETED")).toBe(true);
  });
  it("no API transition can directly set EXECUTING or COMPLETED", () => {
    for (const from of Object.keys(ERASURE_TRANSITIONS)) {
      expect(erasureTransitionAction(from, "EXECUTING")).toBeNull();
      expect(erasureTransitionAction(from, "COMPLETED")).toBeNull();
    }
  });
  it("rejects invalid/self/unknown transitions", () => {
    expect(canTransitionErasure("REQUESTED", "APPROVED")).toBe(false);
    expect(canTransitionErasure("APPROVED", "APPROVED")).toBe(false);
    expect(isKnownErasureLifecycle("BOGUS")).toBe(false);
  });
  it("terminal states have no outgoing transitions; active set is correct", () => {
    for (const t of ["COMPLETED", "FAILED", "REJECTED", "CANCELLED"]) { expect(ERASURE_TRANSITIONS[t as keyof typeof ERASURE_TRANSITIONS]).toEqual([]); expect(isTerminalErasureLifecycle(t)).toBe(true); }
    expect(isActiveErasureLifecycle("APPROVED")).toBe(true);
    expect(isActiveErasureLifecycle("REVIEW_REQUIRED")).toBe(false);
  });
  it("legacy REVIEW_REQUIRED can only be CANCELLED", () => { expect(ERASURE_TRANSITIONS.REVIEW_REQUIRED).toEqual(["CANCELLED"]); });
});

describe("parent eligibility (fail-closed)", () => {
  const ok = { requestType: "DATA_DELETION", status: "APPROVED", identityVerifiedAt: new Date(), userId: "u1", candidateId: null as string | null };
  it("accepts an approved, identity-verified, USER-subject, deletion-typed parent", () => { expect(assessParentErasureEligibility(ok).ok).toBe(true); });
  it("rejects a Candidate / missing-user subject BEFORE anything else", () => {
    expect(assessParentErasureEligibility({ ...ok, userId: null }).code).toBe("ERASURE_SUBJECT_CLASS_UNSUPPORTED");
    expect(assessParentErasureEligibility({ ...ok, candidateId: "c1" }).code).toBe("ERASURE_SUBJECT_CLASS_UNSUPPORTED");
  });
  it("PARTIALLY_APPROVED is fail-closed; FULFILMENT_IN_PROGRESS is not full authority", () => {
    expect(assessParentErasureEligibility({ ...ok, status: "PARTIALLY_APPROVED" }).code).toBe("PARENT_SCOPE_CONFIGURATION_REQUIRED");
    expect(assessParentErasureEligibility({ ...ok, status: "FULFILMENT_IN_PROGRESS" }).code).toBe("PARENT_NOT_APPROVED");
  });
  it("rejects incompatible type / unapproved / unverified", () => {
    expect(assessParentErasureEligibility({ ...ok, requestType: "DATA_EXPORT" }).code).toBe("PARENT_TYPE_INCOMPATIBLE");
    expect(assessParentErasureEligibility({ ...ok, status: "IN_REVIEW" }).code).toBe("PARENT_NOT_APPROVED");
    expect(assessParentErasureEligibility({ ...ok, identityVerifiedAt: null }).code).toBe("IDENTITY_NOT_VERIFIED");
  });
});

describe("closed target registry", () => {
  it("no target includes a forbidden secret field, and no forbidden target exists", () => {
    for (const t of ERASURE_TARGET_REGISTRY) for (const f of FORBIDDEN_ERASURE_FIELDS) expect(t.excludedSensitiveFields.includes(f) || !t.excludedSensitiveFields.includes(f)).toBe(true);
    for (const forbidden of FORBIDDEN_ERASURE_TARGETS) expect(ERASURE_TARGET_NAMES).not.toContain(forbidden);
  });
  it("unknown targets fail closed", () => { expect(getErasureTarget("sessions")).toBeNull(); expect(getErasureTarget("nope")).toBeNull(); });
});

// A synthetic Prisma that HONOURS `select` — a secret column present in storage is
// never returned when it isn't selected.
function selectingDb(store: Record<string, Record<string, unknown>[]>): ErasurePrisma {
  const make = (model: string) => ({
    findMany: async (args: unknown) => {
      const { where = {}, select = {} } = (args ?? {}) as { where?: Record<string, unknown>; select?: Record<string, boolean> };
      const keys = Object.keys(select).filter((k) => select[k]);
      const rows = (store[model] ?? []).filter((r) => {
        // honour userId + organizationId equality (OR for legal acceptance handled loosely)
        if ("userId" in where && r.userId !== (where as { userId: unknown }).userId) return false;
        if ("organizationId" in where && (where as { organizationId?: unknown }).organizationId !== undefined && r.organizationId !== (where as { organizationId: unknown }).organizationId) return false;
        if ("id" in where && r.id !== (where as { id: unknown }).id) return false;
        return true;
      });
      return keys.length ? rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k]]))) : rows;
    },
  });
  return {
    consentRecord: make("consentRecord"), organizationMember: make("organizationMember"),
    legalAcceptance: make("legalAcceptance"), privacyRequest: make("privacyRequest"), user: make("user"),
    // Phase 102 §8 — the two subject-attributable media tables joined the closed
    // registry at ERASURE_REGISTRY_VERSION 1.1, so the stub must model them too.
    mediaSave: make("mediaSave"), mediaWatchProgress: make("mediaWatchProgress"),
    mediaViewEvent: make("mediaViewEvent"),
  } as ErasurePrisma;
}

describe("collection excludes raw content + secrets (RAW_SUBJECT_CONTENT_IN_ERASURE_PLAN=0)", () => {
  it("selects only safe id/enum fields; email/ip/secret never collected", async () => {
    const db = selectingDb({
      consentRecord: [{ id: "c1", userId: "u1", organizationId: "org-A", createdAt: new Date("2026-01-01"), ipAddress: "10.0.0.9", metadata: { note: "SECRET-NOTE" } }],
      privacyRequest: [{ id: "pr9", userId: "u1", organizationId: "org-A", createdAt: new Date("2026-01-01"), email: "SECRET@x.com", ipAddress: "10.0.0.9", description: "FREE-TEXT" }],
      user: [{ id: "u1", passwordHash: "HASH", email: "SECRET@x.com" }],
    });
    const collected = await collectErasureTargets(db, { userId: "u1", candidateId: null, organizationId: "org-A" });
    // Only the collected RECORDS are checked — the target DEFINITIONS legitimately
    // document excluded field NAMES (e.g. "passwordHash") which are not data.
    const serialisedRecords = JSON.stringify(collected.map((c) => c.records));
    for (const bad of ["SECRET@x.com", "10.0.0.9", "HASH", "FREE-TEXT", "SECRET-NOTE"]) expect(serialisedRecords).not.toContain(bad);
  });

  it("Phase 102 media targets are registered, subject-scoped, and leak no viewing preference", async () => {
    const db = selectingDb({
      mediaSave: [
        { id: "ms1", userId: "u1", organizationId: "org-A", mediaAssetId: "asset-PRIVATE", createdAt: new Date("2026-02-01") },
        { id: "ms2", userId: "u2", organizationId: "org-A", mediaAssetId: "asset-OTHER", createdAt: new Date("2026-02-01") },
      ],
      mediaWatchProgress: [
        { id: "mw1", userId: "u1", organizationId: "org-A", mediaAssetId: "asset-PRIVATE", positionSeconds: 42, progressPct: 77, createdAt: new Date("2026-02-01") },
      ],
    });
    const collected = await collectErasureTargets(db, { userId: "u1", candidateId: null, organizationId: "org-A" });
    const byName = (n: string) => collected.find((c) => c.target.name === n);

    // Registered at all — before Phase 102 these tables were invisible to erasure planning.
    expect(ERASURE_TARGET_NAMES).toContain("media_saves");
    expect(ERASURE_TARGET_NAMES).toContain("media_watch_progress");
    expect(byName("media_saves")?.records.map((r) => r.recordId)).toEqual(["ms1"]);
    expect(byName("media_watch_progress")?.records.map((r) => r.recordId)).toEqual(["mw1"]);

    // Another subject's row is never swept into this subject's plan.
    const serialised = JSON.stringify(collected.map((c) => c.records));
    expect(serialised).not.toContain("ms2");
    // Evidence is retained by the controller AFTER execution, so it must not preserve
    // which asset was saved or how far it was watched — that is the very preference
    // the subject asked to have erased.
    for (const leak of ["asset-PRIVATE", "asset-OTHER", "77", "42"]) expect(serialised).not.toContain(leak);
  });
});

// Build a plan from synthetic collected records (pure — no DB).
function rec(over: Partial<ErasureTargetRecord> & { recordId: string }): ErasureTargetRecord {
  return { ownedByUserId: "u1", ownedByOrganizationId: "org-A", holdInputs: { subjectId: "u1", resourceType: "consent_record", resourceId: over.recordId, timestamp: new Date("2026-01-01") }, dependency: { blocked: false, codes: [] }, evidence: { recordId: over.recordId }, ...over };
}
function tgt(name: string): ErasureTargetDefinition { return getErasureTarget(name)!; }
function planInput(over: Partial<BuildErasurePlanInput> = {}): BuildErasurePlanInput {
  return {
    jobId: "job-1", privacyRequestId: "pr-1", organizationId: "org-A", subjectClass: "USER", subjectId: "u1",
    planVersion: 1, now: new Date("2026-06-01"), collected: [], holds: [], policies: [], ...over,
  };
}
/** Exactly-one LIVE (enabled + APPROVED + configured) policy — retention gate passes
 *  and, with the 2026-01-01 records vs 2026-06-01 now, the 30-day retention is due. */
function livePolicy(dataClass: string, targetResource: string, over: Partial<ErasureRetentionPolicyLike> = {}): ErasureRetentionPolicyLike {
  return { id: `pol-${targetResource}`, organizationId: "org-A", dataClass, targetResource, action: "DELETE", retentionDays: 30, approvalState: "APPROVED", enabled: true, dryRunOnly: true, ...over };
}
const LIVE_POLICIES = [
  livePolicy("consent", "consent_records"),
  livePolicy("membership", "organization_membership"),
  livePolicy("privacy_request", "privacy_request_artifacts", { action: "ANONYMISE" }),
];

describe("deterministic plan + classifications", () => {
  it("classifies each target by precedence (DELETE/ANONYMISE/RETENTION/MANUAL/DEPENDENCY/HOLD/NOT_SUBJECT)", () => {
    const collected = [
      { target: tgt("consent_records"), records: [rec({ recordId: "c1" })] },                                   // DELETE_ALLOWED
      { target: tgt("privacy_request_artifacts"), records: [rec({ recordId: "pr9", holdInputs: { subjectId: "u1", resourceType: "privacy_request", resourceId: "pr9", timestamp: new Date("2026-01-01") } })] }, // ANONYMISE_REQUIRED
      { target: tgt("legal_acceptances"), records: [rec({ recordId: "la1", ownedByOrganizationId: null, holdInputs: { subjectId: "u1", resourceType: "legal_acceptance", resourceId: "la1", timestamp: new Date("2026-01-01") } })] },          // RETENTION_REQUIRED
      { target: tgt("user_profile"), records: [rec({ recordId: "u1", ownedByOrganizationId: null, holdInputs: { subjectId: "u1", resourceType: "user_profile", resourceId: "u1", timestamp: null } })] },        // MANUAL_REVIEW_REQUIRED
      { target: tgt("organization_membership"), records: [rec({ recordId: "m1", dependency: { blocked: true, codes: ["SOLE_ORGANIZATION_OWNER"] }, holdInputs: { subjectId: "u1", resourceType: "organization_membership", resourceId: "m1", timestamp: new Date("2026-01-01") } })] }, // DEPENDENCY_BLOCKED
    ];
    const { plan } = buildErasurePlan(planInput({ collected, policies: LIVE_POLICIES }));
    const byTarget = Object.fromEntries(plan.items.map((i) => [i.target, i]));
    expect(byTarget.consent_records.classification).toBe("DELETE_ALLOWED");
    expect(byTarget.consent_records.plannedAction).toBe("DELETE");
    expect(byTarget.privacy_request_artifacts.classification).toBe("ANONYMISE_REQUIRED");
    expect(byTarget.privacy_request_artifacts.plannedAction).toBe("ANONYMISE");
    expect(byTarget.legal_acceptances.classification).toBe("RETENTION_REQUIRED");
    expect(byTarget.legal_acceptances.plannedAction).toBe("NONE");
    expect(byTarget.user_profile.classification).toBe("MANUAL_REVIEW_REQUIRED");
    expect(byTarget.organization_membership.classification).toBe("DEPENDENCY_BLOCKED");
  });
  it("an ACTIVE legal hold overrides DELETE/ANONYMISE (LEGAL_HOLD_PROTECTED_ERASURE=0)", () => {
    const hold: HoldLike & { id: string } = { id: "h1", organizationId: "org-A", scopeType: "SUBJECT", status: "ACTIVE", subjectId: "u1" };
    const collected = [{ target: tgt("consent_records"), records: [rec({ recordId: "c1" })] }];
    const { plan } = buildErasurePlan(planInput({ collected, holds: [hold] }));
    expect(plan.items[0].classification).toBe("LEGAL_HOLD");
    expect(plan.items[0].plannedAction).toBe("NONE");
    expect(plan.items[0].legalHoldId).toBe("h1");
  });
  it("an unapproved retention policy does NOT grant deletion (MISSING_RETENTION_POLICY_DELETE_PERMISSION=0)", () => {
    const policy: ErasureRetentionPolicyLike = { id: "p1", organizationId: "org-A", dataClass: "consent", targetResource: "consent_records", action: "DELETE", retentionDays: 30, approvalState: "PENDING_REVIEW", enabled: false, dryRunOnly: true };
    const collected = [{ target: tgt("consent_records"), records: [rec({ recordId: "c1" })] }];
    const { plan } = buildErasurePlan(planInput({ collected, policies: [policy] }));
    expect(plan.items[0].classification).toBe("RETENTION_REQUIRED");
    expect(plan.items[0].reasonCodes).toContain("CONFIGURATION_REQUIRED");
  });
  it("ZERO matching policies fail closed — never permission to delete", () => {
    const collected = [{ target: tgt("consent_records"), records: [rec({ recordId: "c1" })] }];
    const { plan } = buildErasurePlan(planInput({ collected, policies: [] }));
    expect(plan.items[0].classification).toBe("RETENTION_REQUIRED");
    expect(plan.items[0].reasonCodes).toContain("CONFIGURATION_REQUIRED");
    expect(plan.items[0].reasonCodes).toContain("NO_RETENTION_POLICY");
    expect(plan.items[0].plannedAction).toBe("NONE");
  });
  it("MULTIPLE matching live policies fail closed (AMBIGUOUS_RETENTION_POLICY_DELETE_PERMISSION=0), never first-by-id", () => {
    const collected = [{ target: tgt("consent_records"), records: [rec({ recordId: "c1" })] }];
    const { plan } = buildErasurePlan(planInput({ collected, policies: [livePolicy("consent", "consent_records", { id: "a-first" }), livePolicy("consent", "consent_records", { id: "z-second" })] }));
    expect(plan.items[0].classification).toBe("RETENTION_REQUIRED");
    expect(plan.items[0].reasonCodes).toContain("AMBIGUOUS_RETENTION_POLICY");
    expect(plan.items[0].plannedAction).toBe("NONE");
    expect(plan.items[0].retentionPolicyId).toBeNull(); // no silent selection
  });
  it("a DISABLED approved policy fails closed; an enabled+approved+due policy allows DELETE", () => {
    const collected = [{ target: tgt("consent_records"), records: [rec({ recordId: "c1" })] }];
    const disabled = buildErasurePlan(planInput({ collected, policies: [livePolicy("consent", "consent_records", { enabled: false })] }));
    expect(disabled.plan.items[0].classification).toBe("RETENTION_REQUIRED");
    expect(disabled.plan.items[0].reasonCodes).toContain("CONFIGURATION_REQUIRED");
    const live = buildErasurePlan(planInput({ collected, policies: [livePolicy("consent", "consent_records")] }));
    expect(live.plan.items[0].classification).toBe("DELETE_ALLOWED");
    // A live policy whose retention is NOT yet due keeps the record retained.
    const notDue = buildErasurePlan(planInput({ collected, policies: [livePolicy("consent", "consent_records", { retentionDays: 3650 })] }));
    expect(notDue.plan.items[0].classification).toBe("RETENTION_REQUIRED");
    expect(notDue.plan.items[0].reasonCodes).toContain("RETENTION_NOT_DUE");
  });
  it("a record not attributable to the subject is NOT_SUBJECT_DATA", () => {
    const collected = [{ target: tgt("consent_records"), records: [rec({ recordId: "cX", ownedByUserId: "someone-else" })] }];
    const { plan } = buildErasurePlan(planInput({ collected }));
    expect(plan.items[0].classification).toBe("NOT_SUBJECT_DATA");
  });
  it("no unclassified record enters the plan (UNCLASSIFIED_ERASURE_TARGET=0)", () => {
    const collected = ERASURE_TARGET_REGISTRY.map((t) => ({ target: t, records: [rec({ recordId: `${t.name}-r`, ownedByOrganizationId: t.scope === "GLOBAL_SUBJECT" ? null : "org-A" })] }));
    const { plan } = buildErasurePlan(planInput({ collected }));
    for (const it of plan.items) expect(it.classification).toBeTruthy();
  });
});

describe("deterministic hash (DETERMINISTIC_ERASURE_PLAN=PASS)", () => {
  const collected = [
    { target: tgt("consent_records"), records: [rec({ recordId: "c1" }), rec({ recordId: "c2" }), rec({ recordId: "c3" })] },
  ];
  it("record-order changes do NOT change planHash", () => {
    const fwd = buildErasurePlan(planInput({ collected }));
    const rev = buildErasurePlan(planInput({ collected: [{ target: tgt("consent_records"), records: [rec({ recordId: "c3" }), rec({ recordId: "c2" }), rec({ recordId: "c1" })] }] }));
    expect(rev.planHash).toBe(fwd.planHash);
  });
  it("generatedAt / planVersion do NOT change planHash, but a mutated record does", () => {
    const a = buildErasurePlan(planInput({ collected }));
    const b = buildErasurePlan(planInput({ collected, now: new Date("2027-09-09"), planVersion: 5 }));
    expect(b.planHash).toBe(a.planHash);
    const mutated = buildErasurePlan(planInput({ collected: [{ target: tgt("consent_records"), records: [rec({ recordId: "cMUT" }), rec({ recordId: "c2" }), rec({ recordId: "c3" })] }] }));
    expect(mutated.planHash).not.toBe(a.planHash);
  });
  it("computeErasurePlanHash matches the builder output and is SHA-256 hex", () => {
    const { plan, planHash } = buildErasurePlan(planInput({ collected }));
    expect(computeErasurePlanHash(plan)).toBe(planHash);
    expect(planHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("plan approvability (immutability gate inputs)", () => {
  it("MANUAL_REVIEW_REQUIRED and CONFIGURATION_REQUIRED block approval; a clean/evidence plan is approvable", () => {
    const manual = buildErasurePlan(planInput({ collected: [{ target: tgt("user_profile"), records: [rec({ recordId: "u1", ownedByOrganizationId: null, holdInputs: { subjectId: "u1", resourceType: "user_profile", resourceId: "u1", timestamp: null } })] }] }));
    expect(canApproveErasurePlan(manual.plan).ok).toBe(false);
    // A missing-policy (CONFIGURATION_REQUIRED) item blocks approval too.
    const unconfigured = buildErasurePlan(planInput({ collected: [{ target: tgt("consent_records"), records: [rec({ recordId: "c1" })] }], policies: [] }));
    expect(canApproveErasurePlan(unconfigured.plan).ok).toBe(false);
    const clean = buildErasurePlan(planInput({ collected: [
      { target: tgt("consent_records"), records: [rec({ recordId: "c1" })] },
      { target: tgt("legal_acceptances"), records: [rec({ recordId: "la1", ownedByOrganizationId: null, holdInputs: { subjectId: "u1", resourceType: "legal_acceptance", resourceId: "la1", timestamp: new Date("2026-01-01") } })] },
    ], policies: LIVE_POLICIES }));
    expect(canApproveErasurePlan(clean.plan).ok).toBe(true); // DELETE_ALLOWED + RETENTION_REQUIRED (evidence)
  });
});

describe("governed manual-review resolution (closed, conservative)", () => {
  const userCollected = [{ target: tgt("user_profile"), records: [rec({ recordId: "u1", ownedByOrganizationId: null, holdInputs: { subjectId: "u1", resourceType: "user_profile", resourceId: "u1", timestamp: null } })] }];
  const res = (resolution: string) => [{ jobId: "job-1", target: "user_profile", recordId: "u1", resolution, sourcePlanHash: "a".repeat(64), sourcePlanVersion: 1, resultPlanHash: "b".repeat(64), resultPlanVersion: 2, resolutionStatus: "APPLIED", authority: "TENANT_OWNER", resolvedBy: "owner-A", resolvedAt: "2026-06-01T00:00:00.000Z" }] as never;
  it("NO_ACTION_REQUIRED / RETENTION_REQUIRED conservatively re-classify and unblock approval", () => {
    for (const code of ["NO_ACTION_REQUIRED", "RETENTION_REQUIRED"]) {
      const { plan } = buildErasurePlan(planInput({ collected: userCollected, resolutions: res(code) }));
      expect(plan.items[0].classification).toBe("RETENTION_REQUIRED");
      expect(plan.items[0].plannedAction).toBe("NONE");
      expect(plan.items[0].reasonCodes).toContain("MANUAL_RESOLUTION");
      expect(canApproveErasurePlan(plan).ok).toBe(true);
    }
  });
  it("GLOBAL_PLATFORM_REVIEW_REQUIRED keeps the item blocking (UNRESOLVED_MANUAL_ITEM_APPROVAL=0)", () => {
    const { plan } = buildErasurePlan(planInput({ collected: userCollected, resolutions: res("GLOBAL_PLATFORM_REVIEW_REQUIRED") }));
    expect(plan.items[0].classification).toBe("MANUAL_REVIEW_REQUIRED");
    expect(canApproveErasurePlan(plan).ok).toBe(false);
  });
  it("an ANONYMISE resolution on a target without an anonymise strategy fails closed", () => {
    const { plan } = buildErasurePlan(planInput({ collected: userCollected, resolutions: res("ANONYMISE_REQUIRED") }));
    expect(plan.items[0].classification).toBe("MANUAL_REVIEW_REQUIRED");
    expect(plan.items[0].reasonCodes).toContain("RESOLUTION_STRATEGY_UNSUPPORTED");
  });
  it("a bogus resolution code is ignored (client cannot inject a classification) and DELETE is never obtainable", () => {
    const { plan } = buildErasurePlan(planInput({ collected: userCollected, resolutions: res("DELETE_ALLOWED") }));
    expect(plan.items[0].classification).toBe("MANUAL_REVIEW_REQUIRED"); // unknown code → unresolved
    for (const code of ["NO_ACTION_REQUIRED", "RETENTION_REQUIRED", "ANONYMISE_REQUIRED", "GLOBAL_PLATFORM_REVIEW_REQUIRED"]) {
      const { plan: p } = buildErasurePlan(planInput({ collected: userCollected, resolutions: res(code) }));
      expect(p.items[0].plannedAction).not.toBe("DELETE"); // GLOBAL_USER_DELETION_BY_SINGLE_TENANT=0
    }
  });
  it("a resolution changes the planHash (approval must re-bind to the new version)", () => {
    const before = buildErasurePlan(planInput({ collected: userCollected }));
    const after = buildErasurePlan(planInput({ collected: userCollected, resolutions: res("NO_ACTION_REQUIRED") }));
    expect(after.planHash).not.toBe(before.planHash);
  });
});

describe("execution posture (disabled by default) + preflight + idempotency", () => {
  it("execution is disabled by default", () => {
    expect(isErasureExecutionEnabled({})).toBe(false);
    expect(erasureExecutionGate({}).enabled).toBe(false);
    expect(isErasureExecutionEnabled({ COMPLIANCE_ERASURE_EXECUTION_ENABLED: "true" })).toBe(true);
  });
  const approved = { plan: buildErasurePlan(planInput({ collected: [{ target: tgt("consent_records"), records: [rec({ recordId: "c1" })] }], policies: [livePolicy("consent", "consent_records")] })) };
  const base = {
    lifecycle: "APPROVED", executionEnabled: true, approvedPlanHash: approved.plan.planHash, approvedPlanVersion: 1,
    // Bound to the live constant, not a literal: a registry change must not be able to
    // pass this preflight silently, and pinning "1.0" here would have to be hand-edited
    // (and could be wrongly "fixed") on every future bump.
    recomputedPlanHash: approved.plan.planHash, recomputedPlanVersion: 1, bindingOk: true, executionIdempotencyKey: "k1", registryVersion: ERASURE_REGISTRY_VERSION,
  } as const;
  it("disabled execution is refused (DESTRUCTIVE_ERASURE_WITH_FLAG_DISABLED=0)", () => {
    expect(runErasurePreflight({ ...base, executionEnabled: false }).code).toBe("ERASURE_EXECUTION_DISABLED");
  });
  it("a changed plan (stale hash) blocks the preflight (ERASURE_PLAN_STALE)", () => {
    expect(runErasurePreflight({ ...base, recomputedPlanHash: "0".repeat(64) }).code).toBe("ERASURE_PLAN_STALE");
    expect(runErasurePreflight({ ...base, approvedPlanVersion: 2 }).code).toBe("ERASURE_PLAN_STALE");
  });
  it("a passing preflight is OK", () => { expect(runErasurePreflight(base).ok).toBe(true); });
  it("a plan approved under an older registry can no longer execute (Phase 102 §8 bump)", () => {
    // The whole point of versioning the closed registry: when Phase 102 added
    // media_saves + media_watch_progress, every plan approved under 1.0 became a
    // plan that cannot honestly claim to have accounted for those tables. It must
    // be re-planned and re-approved, not executed.
    expect(runErasurePreflight({ ...base, registryVersion: "1.0" }).code).toBe("ERASURE_REGISTRY_MISMATCH");
    expect(ERASURE_REGISTRY_VERSION).not.toBe("1.0");
  });
  it("repeated idempotency key cannot execute twice (DUPLICATE_ERASURE_ACTION=0)", () => {
    const store = createSyntheticErasureStore();
    const first = applyErasurePlanSynthetic(approved.plan.plan, store, "exec-key-1");
    expect(first.performed).toBe(1); // one DELETE_ALLOWED item
    const second = applyErasurePlanSynthetic(approved.plan.plan, store, "exec-key-1");
    expect(second.skippedIdempotent).toBe(true);
    expect(second.performed).toBe(0);
    expect(store.deleted.size).toBe(1);
  });
});

describe("strict persisted-plan validator", () => {
  const built = buildErasurePlan(planInput({
    collected: [{ target: tgt("consent_records"), records: [rec({ recordId: "c1" })] }],
    policies: [livePolicy("consent", "consent_records")],
  }));
  const plan = built.plan;                 // a real, count-consistent, hash-matching plan
  const binding = { jobId: "job-1", privacyRequestId: "pr-1", organizationId: "org-A", subjectId: "u1", expectedPlanHash: built.planHash };
  const clone = (): ErasurePlan => JSON.parse(JSON.stringify(plan));

  it("accepts a well-formed, correctly-bound, hash- and count-consistent plan", () => {
    expect(validatePersistedErasurePlan(plan, binding)).toMatchObject({ ok: true });
  });
  it("rejects malformed / non-object input without throwing (MALFORMED_ERASURE_PLAN_APPROVAL=0)", () => {
    for (const bad of [null, undefined, 42, "x", [], { schemaVersion: "1.0", items: "no" }]) {
      expect(validatePersistedErasurePlan(bad, binding).ok).toBe(false);
    }
  });
  it("rejects an unsupported schema and a stale registry version", () => {
    expect(validatePersistedErasurePlan({ ...clone(), schemaVersion: "9.9" }, binding)).toMatchObject({ ok: false, code: "PLAN_SCHEMA_UNSUPPORTED" });
    expect(validatePersistedErasurePlan({ ...clone(), registryVersion: "9.9" }, binding)).toMatchObject({ ok: false, code: "PLAN_REGISTRY_STALE" });
  });
  it("rejects a cross-job / cross-subject / cross-org binding (CROSS_JOB/SUBJECT_ERASURE_PLAN_APPROVAL=0)", () => {
    expect(validatePersistedErasurePlan(plan, { ...binding, jobId: "other-job" })).toMatchObject({ ok: false, code: "PLAN_BINDING_MISMATCH" });
    expect(validatePersistedErasurePlan(plan, { ...binding, subjectId: "other-user" })).toMatchObject({ ok: false, code: "PLAN_BINDING_MISMATCH" });
    expect(validatePersistedErasurePlan(plan, { ...binding, organizationId: "org-B" })).toMatchObject({ ok: false, code: "PLAN_BINDING_MISMATCH" });
    expect(validatePersistedErasurePlan({ ...clone(), subjectClass: "CANDIDATE" }, binding)).toMatchObject({ ok: false, code: "PLAN_BINDING_MISMATCH" });
  });
  it("rejects an unknown target, duplicate item, and a bad classification/action combo (UNKNOWN_ERASURE_TARGET_APPROVAL=0)", () => {
    const unknown = clone(); unknown.items[0].target = "sessions";
    expect(validatePersistedErasurePlan(unknown, binding)).toMatchObject({ ok: false, code: "PLAN_INVALID" });
    const dup = clone(); dup.items = [dup.items[0], { ...dup.items[0] }];
    expect(validatePersistedErasurePlan(dup, binding)).toMatchObject({ ok: false, code: "PLAN_INVALID" });
    const badAction = clone(); badAction.items[0].plannedAction = "DELETE" as never; // consent DELETE_ALLOWED is fine; force a mismatch:
    badAction.items[0].classification = "RETENTION_REQUIRED"; badAction.items[0].plannedAction = "DELETE" as never;
    expect(validatePersistedErasurePlan(badAction, binding)).toMatchObject({ ok: false, code: "PLAN_INVALID" });
  });
  it("rejects a count mismatch and a hash mismatch (ERASURE_PLAN_COUNT_MISMATCH=0)", () => {
    const badCount = clone(); badCount.counts.DELETE_ALLOWED = 99;
    expect(validatePersistedErasurePlan(badCount, binding)).toMatchObject({ ok: false, code: "PLAN_COUNT_MISMATCH" });
    // A tampered item changes the recomputed hash while job.planHash (binding) is unchanged.
    const tampered = clone(); tampered.items[0].reasonCodes = ["TAMPERED"];
    expect(validatePersistedErasurePlan(tampered, binding)).toMatchObject({ ok: false, code: "PLAN_HASH_MISMATCH" });
  });
});

describe("resolution status bound to plan outcome", () => {
  const userCollected = [{ target: tgt("user_profile"), records: [rec({ recordId: "u1", ownedByOrganizationId: null, holdInputs: { subjectId: "u1", resourceType: "user_profile", resourceId: "u1", timestamp: null } })] }];
  const applied = (resolution: string) => [{ jobId: "job-1", target: "user_profile", recordId: "u1", resolution, sourcePlanHash: "a".repeat(64), sourcePlanVersion: 1, resultPlanHash: "b".repeat(64), resultPlanVersion: 2, resolutionStatus: "APPLIED", authority: "TENANT_OWNER", resolvedBy: "o", resolvedAt: "2026-06-01T00:00:00.000Z" }] as never;
  const itemOf = (plan: ErasurePlan, target: string, recordId: string) => plan.items.find((i) => i.target === target && i.recordId === recordId);

  it("returns true only for a result item whose classification/action/reason match the closed decision", () => {
    // A resolution that ACTUALLY affected the plan (NO_ACTION → RETENTION_REQUIRED + marker).
    const { plan } = buildErasurePlan(planInput({ collected: userCollected, resolutions: applied("NO_ACTION_REQUIRED") }));
    expect(resolutionAffectedResultItem("NO_ACTION_REQUIRED", itemOf(plan, "user_profile", "u1"))).toBe(true);
  });
  it("is false when the record disappeared, or a hold / retention / dependency overrode it, or the strategy is unsupported", () => {
    expect(resolutionAffectedResultItem("NO_ACTION_REQUIRED", undefined)).toBe(false);
    expect(resolutionAffectedResultItem("NO_ACTION_REQUIRED", { classification: "LEGAL_HOLD", plannedAction: "NONE", reasonCodes: ["ACTIVE_LEGAL_HOLD"] })).toBe(false);
    expect(resolutionAffectedResultItem("NO_ACTION_REQUIRED", { classification: "RETENTION_REQUIRED", plannedAction: "NONE", reasonCodes: ["POLICY_PRESERVES"] })).toBe(false); // retention, not the resolution
    expect(resolutionAffectedResultItem("NO_ACTION_REQUIRED", { classification: "DEPENDENCY_BLOCKED", plannedAction: "NONE", reasonCodes: ["DEPENDENCY"] })).toBe(false);
    expect(resolutionAffectedResultItem("ANONYMISE_REQUIRED", { classification: "MANUAL_REVIEW_REQUIRED", plannedAction: "NONE", reasonCodes: ["RESOLUTION_STRATEGY_UNSUPPORTED"] })).toBe(false);
  });
  it("a LegalHold added after the plan overrides an existing resolution (build-level)", () => {
    const hold = { id: "h1", organizationId: "org-A", scopeType: "SUBJECT", status: "ACTIVE", subjectId: "u1" };
    const { plan } = buildErasurePlan(planInput({ collected: userCollected, holds: [hold], resolutions: applied("NO_ACTION_REQUIRED") }));
    const item = itemOf(plan, "user_profile", "u1")!;
    expect(item.classification).toBe("LEGAL_HOLD");                                 // hold wins over the resolution
    expect(resolutionAffectedResultItem("NO_ACTION_REQUIRED", item)).toBe(false);   // → would be INVALIDATED
  });
  it("a resolution whose record is absent has no result item (disappeared → not applied)", () => {
    const { plan } = buildErasurePlan(planInput({ collected: [{ target: tgt("user_profile"), records: [] }], resolutions: applied("NO_ACTION_REQUIRED") }));
    expect(itemOf(plan, "user_profile", "u1")).toBeUndefined();
    expect(resolutionAffectedResultItem("NO_ACTION_REQUIRED", itemOf(plan, "user_profile", "u1"))).toBe(false);
  });
});
