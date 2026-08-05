/**
 * SECURITY (Phase 97 Part H) — governed erasure routes over a synthetic Prisma.
 *
 * Invariants: CROSS_TENANT_ERASURE_READ/MUTATION=0, UNAPPROVED_ERASURE_JOB_CREATION=0,
 * PARTIALLY_APPROVED_FULL_ERASURE=0, DUPLICATE_ACTIVE_ERASURE_JOB=0,
 * ERASURE_SUBJECT_CLASS_UNSUPPORTED (candidate), approval binds to exact planHash,
 * EXECUTING/COMPLETED never API-settable, execution disabled by default,
 * RAW_ERASURE_CONTENT_IN_AUDIT=0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";

type Row = Record<string, unknown> & { id: string };
type Member = { id: string; userId: string; organizationId: string; role: string; status: string };
const ACTIVE = ["REQUESTED", "PLANNING", "PLAN_READY", "IN_REVIEW", "APPROVED", "EXECUTION_PENDING", "EXECUTING"];

let payload: { sub: string; role: string; sid?: string } | null = null;
let members: Member[] = [];
let jobs: Row[] = [];
let privacy: Row[] = [];
let consent: Row[] = [];
let legalAcc: Row[] = [];
let users: Row[] = [];
let holds: Row[] = [];
let policies: Row[] = [];
let txChain: Promise<unknown> = Promise.resolve();
const auditCalls: Array<Record<string, unknown>> = [];

function match(where: Record<string, unknown>, r: Row): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (k === "OR" && Array.isArray(v)) { if (!v.some((sub) => match(sub as Record<string, unknown>, r))) return false; continue; }
    const cell = r[k];
    if (v === null) { if (cell != null) return false; continue; }
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("in" in (v as object)) { if (!(v as { in: unknown[] }).in.includes(cell)) return false; continue; }
      if ("not" in (v as object)) { if (cell === (v as { not: unknown }).not) return false; continue; }
      return false;
    }
    if (cell !== v) return false;
  }
  return true;
}
function project(r: Row, select?: Record<string, boolean>): Row {
  if (!select) return r;
  const keys = Object.keys(select).filter((k) => select[k]);
  return keys.length ? (Object.fromEntries(keys.map((k) => [k, r[k]])) as Row) : r;
}
function coll(store: () => Row[], opts?: { uniqueActiveParent?: boolean }) {
  return {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => store().find((r) => match(where, r)) ?? null,
    findMany: async ({ where = {}, take, select }: { where?: Record<string, unknown>; take?: number; select?: Record<string, boolean> }) => {
      const rows = store().filter((r) => match(where, r)).map((r) => project(r, select));
      return typeof take === "number" ? rows.slice(0, take) : rows;
    },
    count: async ({ where = {} }: { where?: Record<string, unknown> }) => store().filter((r) => match(where, r)).length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (opts?.uniqueActiveParent && data.privacyRequestId && store().some((j) => j.privacyRequestId === data.privacyRequestId && ACTIVE.includes(j.lifecycle as string))) throw { code: "P2002" };
      const row = { ...data } as Row; store().push(row); return row;
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const m = store().filter((r) => match(where, r)); m.forEach((r) => Object.assign(r, data)); return { count: m.length };
    },
  };
}
function makeDb() {
  const db: Record<string, unknown> = {
    organizationMember: {
      findMany: async ({ where = {}, select }: { where?: Record<string, unknown>; select?: Record<string, boolean> }) =>
        members.filter((m) => match(where as Record<string, unknown>, m as unknown as Row)).map((m) => project(m as unknown as Row, select)),
      count: async ({ where = {} }: { where?: Record<string, unknown> }) => members.filter((m) => match(where as Record<string, unknown>, m as unknown as Row)).length,
    },
    privacyRequest:      coll(() => privacy),
    dataDeletionRequest: coll(() => jobs, { uniqueActiveParent: true }),
    consentRecord:       coll(() => consent),
    legalAcceptance:     coll(() => legalAcc),
    user:                coll(() => users),
    legalHold:           coll(() => holds),
    retentionPolicy:     coll(() => policies),
  };
  db.$queryRawUnsafe = async (sql: string, ...vals: unknown[]) => {
    if (/FOR UPDATE/i.test(sql) && /"DataDeletionRequest"/i.test(sql)) {
      const [id, org] = vals as [string, string];
      const row = jobs.find((j) => j.id === id && j.organizationId === org);
      return row ? [{ id: row.id }] : [];
    }
    return [];
  };
  db.$transaction = (fn: (tx: unknown) => Promise<unknown>) => {
    const run = txChain.then(async () => {
      const snap = { jobs: jobs.map((j) => ({ ...j })) };
      try { return await fn(db); }
      catch (e) { jobs.splice(0, jobs.length, ...snap.jobs); throw e; }
    });
    txChain = run.then(() => undefined, () => undefined);
    return run;
  };
  return db;
}

const MOCKED = ["@/lib/auth/jwt", "@/lib/auth/session-store", "@/lib/db/prisma", "@/lib/audit/audit-service", "@/lib/logger/security-events"];
beforeEach(() => {
  vi.resetModules();
  payload = null; members = []; jobs = []; privacy = []; consent = []; legalAcc = []; users = []; holds = []; policies = []; auditCalls.length = 0;
  txChain = Promise.resolve();
  vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => payload }));
  vi.doMock("@/lib/auth/session-store", () => ({ isPayloadSessionActive: async () => true }));
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => makeDb() }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async (e: Record<string, unknown>) => { auditCalls.push(e); },
    COMPLIANCE_AUDIT: {
      ERASURE_JOB_CREATED: "compliance.erasure.job_created", ERASURE_PLAN_GENERATED: "compliance.erasure.plan_generated",
      ERASURE_REVIEW_SUBMITTED: "compliance.erasure.review_submitted", ERASURE_APPROVED: "compliance.erasure.approved",
      ERASURE_REJECTED: "compliance.erasure.rejected", ERASURE_JOB_TRANSITIONED: "compliance.erasure.job_transitioned",
      ERASURE_EXECUTION_DENIED: "compliance.erasure.execution_denied", ERASURE_PLAN_STALE: "compliance.erasure.plan_stale",
      ERASURE_CANCELLED: "compliance.erasure.cancelled", ERASURE_MANUAL_RESOLVED: "compliance.erasure.manual_resolved",
    },
  }));
  vi.doMock("@/lib/logger/security-events", () => ({ logAuthFailure: () => {}, logAuthzDenial: () => {}, logInfraFailure: () => {} }));
});
afterEach(() => { for (const m of MOCKED) vi.doUnmock(m); vi.restoreAllMocks(); });

function req(path: string, method: string, body?: unknown, withToken = true) {
  return new NextRequest(`http://localhost/api/compliance/erasures${path}`, { method, headers: { ...(withToken ? { cookie: `${ACCESS_TOKEN_COOKIE}=fake` } : {}), "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
async function listGET(withToken = true) { const { GET } = await import("../route"); const r = await GET(req("", "GET", undefined, withToken)); return { res: r, json: await r.json() }; }
async function createPOST(body: unknown) { const { POST } = await import("../route"); const r = await POST(req("", "POST", body)); return { res: r, json: await r.json() }; }
async function getJob(id: string) { const { GET } = await import("../[id]/route"); const r = await GET(req(`/${id}`, "GET"), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
async function patchJob(id: string, body: unknown) { const { PATCH } = await import("../[id]/route"); const r = await PATCH(req(`/${id}`, "PATCH", body), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
async function planPOST(id: string) { const { POST } = await import("../[id]/plan/route"); const r = await POST(req(`/${id}/plan`, "POST"), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
async function executePOST(id: string) { const { POST } = await import("../[id]/execute/route"); const r = await POST(req(`/${id}/execute`, "POST"), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
async function resolvePOST(id: string, body: unknown) { const { POST } = await import("../[id]/resolutions/route"); const r = await POST(req(`/${id}/resolutions`, "POST", body), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
/** Exactly-one LIVE (enabled + APPROVED + due) retention policy for consent_records. */
function liveConsentPolicy(): Row { return { id: "pol-consent", organizationId: "org-A", dataClass: "consent", targetResource: "consent_records", action: "DELETE", retentionDays: 30, approvalState: "APPROVED", enabled: true, dryRunOnly: true } as Row; }

function ownerA() { payload = { sub: "owner-A", role: "customer", sid: "s" }; members = [{ id: "mo", userId: "owner-A", organizationId: "org-A", role: "OWNER", status: "ACTIVE" }]; }
function adminA() { payload = { sub: "admin-A", role: "admin", sid: "s" }; members = [{ id: "ma", userId: "admin-A", organizationId: "org-A", role: "ADMIN", status: "ACTIVE" }]; }
function parent(over: Partial<Row> = {}): Row { return { id: "pr1", organizationId: "org-A", userId: "subj-1", candidateId: null, email: "s@x.com", locale: "en", requestType: "DATA_DELETION", status: "APPROVED", identityVerifiedAt: new Date(), ...over } as Row; }
function job(over: Partial<Row> = {}): Row { return { id: "e1", privacyRequestId: "pr1", organizationId: "org-A", userId: "subj-1", candidateId: null, email: "s@x.com", locale: "en", subjectClass: "USER", status: "PENDING", lifecycle: "REQUESTED", planJson: null, planHash: null, planVersion: null, approvedBy: null, approvedAt: null, executionIdempotencyKey: null, createdAt: new Date(), updatedAt: new Date(), ...over } as Row; }

describe("auth + tenant isolation", () => {
  it("unauthenticated list is denied (401)", async () => { expect((await listGET(false)).res.status).toBe(401); });
  it("tenant A cannot read or mutate tenant B's job (404)", async () => {
    adminA(); jobs = [job({ id: "eB", organizationId: "org-B" })];
    expect((await getJob("eB")).res.status).toBe(404);
    expect((await patchJob("eB", { transition: "PLANNING" })).res.status).toBe(404);
    expect(jobs[0].lifecycle).toBe("REQUESTED");
  });
});

describe("create from an approved parent (authoritative scope)", () => {
  it("rejects a foreign / unapproved / incompatible / unverified parent", async () => {
    adminA();
    expect((await createPOST({ privacyRequestId: "nope" })).res.status).toBe(404);
    privacy = [parent({ status: "IN_REVIEW" })];
    expect((await createPOST({ privacyRequestId: "pr1" })).json.code).toBe("PARENT_NOT_APPROVED");
    privacy = [parent({ requestType: "DATA_EXPORT" })];
    expect((await createPOST({ privacyRequestId: "pr1" })).json.code).toBe("PARENT_TYPE_INCOMPATIBLE");
    privacy = [parent({ identityVerifiedAt: null })];
    expect((await createPOST({ privacyRequestId: "pr1" })).json.code).toBe("IDENTITY_NOT_VERIFIED");
  });
  it("creates a REQUESTED child whose subject/org come from the parent, not the client", async () => {
    adminA(); privacy = [parent()];
    const r = await createPOST({ privacyRequestId: "pr1", userId: "EVIL", organizationId: "org-EVIL" });
    expect(r.res.status).toBe(201);
    expect(jobs[0].userId).toBe("subj-1");
    expect(jobs[0].organizationId).toBe("org-A");
    expect(jobs[0].lifecycle).toBe("REQUESTED");
  });
  it("a Candidate parent is rejected before any job is created", async () => {
    adminA(); privacy = [parent({ userId: null, candidateId: "cand-1" })];
    const r = await createPOST({ privacyRequestId: "pr1" });
    expect(r.json.code).toBe("ERASURE_SUBJECT_CLASS_UNSUPPORTED");
    expect(jobs).toHaveLength(0);
  });
  it("PARTIALLY_APPROVED cannot create a full erasure (PARTIALLY_APPROVED_FULL_ERASURE=0)", async () => {
    adminA(); privacy = [parent({ status: "PARTIALLY_APPROVED" })];
    expect((await createPOST({ privacyRequestId: "pr1" })).json.code).toBe("PARENT_SCOPE_CONFIGURATION_REQUIRED");
    expect(jobs).toHaveLength(0);
  });
  it("a duplicate active job for the same parent is idempotent (DUPLICATE_ACTIVE_ERASURE_JOB=0)", async () => {
    adminA(); privacy = [parent()];
    await createPOST({ privacyRequestId: "pr1" });
    const again = await createPOST({ privacyRequestId: "pr1" });
    expect(again.json.idempotent).toBe(true);
    expect(jobs.filter((j) => ACTIVE.includes(j.lifecycle as string))).toHaveLength(1);
  });
});

describe("plan → review → approve (binds to exact planHash AND planVersion)", () => {
  async function planned() {
    adminA();
    jobs = [job({ lifecycle: "REQUESTED" })];
    consent = [{ id: "c1", userId: "subj-1", organizationId: "org-A", createdAt: new Date("2026-01-01") }];
    policies = [liveConsentPolicy()]; // exactly-one live policy → retention gate passes
    const r = await planPOST("e1");
    return r;
  }
  it("generates a deterministic PLAN_READY snapshot (identifiers only, no raw content)", async () => {
    const r = await planned();
    expect(r.res.status).toBe(201);
    expect(jobs[0].lifecycle).toBe("PLAN_READY");
    expect(jobs[0].planHash).toMatch(/^[a-f0-9]{64}$/);
    expect(jobs[0].planVersion).toBe(1);
    expect(JSON.stringify(auditCalls)).not.toContain("s@x.com"); // RAW_ERASURE_CONTENT_IN_AUDIT=0
  });
  it("a missing retention policy fails closed and blocks approval (MISSING_RETENTION_POLICY_DELETE_PERMISSION=0)", async () => {
    await planned();
    policies = []; // remove the live policy → regenerate → CONFIGURATION_REQUIRED
    await planPOST("e1");
    await patchJob("e1", { transition: "IN_REVIEW" });
    ownerA();
    const r = await patchJob("e1", { transition: "APPROVED", expectedPlanHash: jobs[0].planHash as string, expectedPlanVersion: jobs[0].planVersion as number });
    expect(r.res.status).toBe(409);
    expect(r.json.code).toBe("PLAN_NOT_APPROVABLE");
  });
  it("plan cannot be generated once APPROVED (immutability)", async () => {
    await planned();
    jobs[0].lifecycle = "APPROVED"; jobs[0].approvedBy = "owner-A"; jobs[0].approvedAt = new Date();
    const r = await planPOST("e1");
    expect(r.res.status).toBe(409);
    expect(r.json.code).toBe("INVALID_STATE");
  });
  it("approval needs approve_erasures and binds to the exact planHash + planVersion", async () => {
    await planned();
    await patchJob("e1", { transition: "IN_REVIEW" });
    expect(jobs[0].lifecycle).toBe("IN_REVIEW");
    const hash = jobs[0].planHash as string;
    // ADMIN lacks approve_erasures.
    expect((await patchJob("e1", { transition: "APPROVED", expectedPlanHash: hash, expectedPlanVersion: 1 })).res.status).toBe(403);
    ownerA();
    // Missing version is a 400; wrong hash / wrong version are closed 409s.
    expect((await patchJob("e1", { transition: "APPROVED", expectedPlanHash: hash })).res.status).toBe(400);
    expect((await patchJob("e1", { transition: "APPROVED", expectedPlanHash: "0".repeat(64), expectedPlanVersion: 1 })).json.code).toBe("APPROVED_PLAN_HASH_MISMATCH");
    expect((await patchJob("e1", { transition: "APPROVED", expectedPlanHash: hash, expectedPlanVersion: 2 })).json.code).toBe("APPROVED_PLAN_VERSION_MISMATCH");
    // Correct hash + version approve and persist the approval binding.
    const ok = await patchJob("e1", { transition: "APPROVED", expectedPlanHash: hash, expectedPlanVersion: 1 });
    expect(ok.res.status).toBe(200);
    expect(jobs[0].lifecycle).toBe("APPROVED");
    expect(jobs[0].approvedBy).toBe("owner-A");
    expect(jobs[0].approvedPlanHash).toBe(hash);
    expect(jobs[0].approvedPlanVersion).toBe(1);
    // The audit used the committed transaction's values.
    const audit = auditCalls.find((e) => e.action === "compliance.erasure.approved") as { metadata: Record<string, unknown> };
    expect(audit.metadata.approvedPlanHash).toBe(hash);
    expect(audit.metadata.approvedPlanVersion).toBe(1);
  });
  it("a plan with MANUAL_REVIEW_REQUIRED cannot be approved", async () => {
    adminA();
    jobs = [job({ lifecycle: "REQUESTED" })];
    users = [{ id: "subj-1" }]; // user_profile → MANUAL_REVIEW_REQUIRED
    await planPOST("e1");
    await patchJob("e1", { transition: "IN_REVIEW" });
    ownerA();
    const r = await patchJob("e1", { transition: "APPROVED", expectedPlanHash: jobs[0].planHash as string, expectedPlanVersion: jobs[0].planVersion as number });
    expect(r.res.status).toBe(409);
    expect(r.json.code).toBe("PLAN_NOT_APPROVABLE");
  });
});

describe("governed manual-review resolution (route)", () => {
  async function manualInReview() {
    adminA();
    jobs = [job({ lifecycle: "REQUESTED" })];
    users = [{ id: "subj-1" }]; // user_profile → MANUAL_REVIEW_REQUIRED
    await planPOST("e1");
    await patchJob("e1", { transition: "IN_REVIEW" });
    return { hash: jobs[0].planHash as string, version: jobs[0].planVersion as number };
  }
  it("resolution requires approve_erasures (ADMIN denied) and a closed code", async () => {
    const { hash, version } = await manualInReview();
    // ADMIN lacks approve_erasures → 403 (MANUAL_REVIEW_CLIENT_OVERRIDE=0).
    expect((await resolvePOST("e1", { target: "user_profile", recordId: "subj-1", resolution: "NO_ACTION_REQUIRED", sourcePlanHash: hash, sourcePlanVersion: version })).res.status).toBe(403);
    ownerA();
    // A non-closed code (e.g. DELETE_ALLOWED) is rejected as input.
    expect((await resolvePOST("e1", { target: "user_profile", recordId: "subj-1", resolution: "DELETE_ALLOWED", sourcePlanHash: hash, sourcePlanVersion: version })).res.status).toBe(400);
  });
  it("a stale source plan binding or a non-manual item is rejected", async () => {
    const { hash, version } = await manualInReview();
    ownerA();
    expect((await resolvePOST("e1", { target: "user_profile", recordId: "subj-1", resolution: "NO_ACTION_REQUIRED", sourcePlanHash: "0".repeat(64), sourcePlanVersion: version })).json.code).toBe("PLAN_BINDING_MISMATCH");
    expect((await resolvePOST("e1", { target: "user_profile", recordId: "not-an-item", resolution: "NO_ACTION_REQUIRED", sourcePlanHash: hash, sourcePlanVersion: version })).json.code).toBe("ITEM_NOT_MANUAL");
  });
  it("a resolution produces a new plan version, invalidates approval and requires reapproval (ERASURE_RESOLUTION_WITHOUT_REAPPROVAL=0)", async () => {
    const { hash, version } = await manualInReview();
    ownerA();
    const r = await resolvePOST("e1", { target: "user_profile", recordId: "subj-1", resolution: "NO_ACTION_REQUIRED", sourcePlanHash: hash, sourcePlanVersion: version });
    expect(r.res.status).toBe(201);
    expect(jobs[0].lifecycle).toBe("PLAN_READY");            // back for review of the NEW version
    expect(jobs[0].planVersion).toBe(2);                     // new canonical version
    expect(jobs[0].planHash).not.toBe(hash);                 // new hash
    expect(jobs[0].approvedBy ?? null).toBeNull();           // prior approval invalidated
    expect(jobs[0].approvedPlanHash ?? null).toBeNull();
    // The OLD hash/version can no longer be approved; the NEW one can.
    await patchJob("e1", { transition: "IN_REVIEW" });
    expect((await patchJob("e1", { transition: "APPROVED", expectedPlanHash: hash, expectedPlanVersion: version })).json.code).toBe("APPROVED_PLAN_HASH_MISMATCH");
    const ok = await patchJob("e1", { transition: "APPROVED", expectedPlanHash: jobs[0].planHash as string, expectedPlanVersion: 2 });
    expect(ok.res.status).toBe(200);
    expect(jobs[0].approvedPlanVersion).toBe(2);
    expect(auditCalls.some((e) => e.action === "compliance.erasure.manual_resolved")).toBe(true);
  });
});

describe("execution gate (disabled by default)", () => {
  it("EXECUTING and COMPLETED can never be set directly via the API", async () => {
    ownerA(); jobs = [job({ lifecycle: "EXECUTION_PENDING", planJson: { counts: {} }, planHash: "a".repeat(64), planVersion: 1, approvedBy: "owner-A", approvedAt: new Date(), executionIdempotencyKey: "k" })];
    expect((await patchJob("e1", { transition: "EXECUTING" })).json.code).toBe("INVALID_TRANSITION");
    expect((await patchJob("e1", { transition: "COMPLETED" })).json.code).toBe("INVALID_TRANSITION");
  });
  it("execute is refused while disabled and leaves the job unchanged (DESTRUCTIVE_ERASURE_WITH_FLAG_DISABLED=0)", async () => {
    ownerA(); jobs = [job({ lifecycle: "APPROVED", planJson: { counts: {} }, planHash: "a".repeat(64), planVersion: 1, approvedBy: "owner-A", approvedAt: new Date() })];
    const r = await executePOST("e1");
    expect(r.res.status).toBe(409);
    expect(r.json.code).toBe("ERASURE_EXECUTION_DISABLED");
    expect(jobs[0].lifecycle).toBe("APPROVED");
    expect(auditCalls.some((e) => e.action === "compliance.erasure.execution_denied")).toBe(true);
  });
});

describe("audit hygiene (RAW_ERASURE_CONTENT_IN_AUDIT=0)", () => {
  it("never places email/free-text in audit metadata", async () => {
    adminA(); privacy = [parent({ email: "SECRET-EMAIL@x.com" })];
    await createPOST({ privacyRequestId: "pr1" });
    expect(JSON.stringify(auditCalls)).not.toContain("SECRET-EMAIL");
  });
});
