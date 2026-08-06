/**
 * SECURITY (Phase 97 Part I) — subprocessor & transfer routes over a synthetic
 * Prisma. Invariants: CROSS_TENANT_SUBPROCESSOR_READ/MUTATION=0,
 * CROSS_TENANT_DATA_TRANSFER_READ/MUTATION=0, CROSS_TENANT_TRANSFER_RELATION=0,
 * UNREVIEWED_SUBPROCESSOR_APPROVAL=0, UNREVIEWED_DATA_TRANSFER_APPROVAL=0,
 * CLIENT_SUPPLIED_REVIEW/APPROVAL_ATTRIBUTION=0,
 * PHASE95_PROVIDER_POLICY_DENIAL_OVERRIDDEN=0, MISSING_PROVIDER_POLICY_FAIL_OPEN=0,
 * RAW_PERSONAL_DATA_IN_TRANSFER_AUDIT=0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { providerScopeHash } from "@/lib/compliance/transfer-governance";

const REG = "anthropic:claude-sonnet-4-20250514";
const WF = "brain.analysis"; // an arbitrary workflow shared by the policy + subprocessor scope

type Row = Record<string, unknown> & { id: string };
type Member = { id: string; userId: string; organizationId: string; role: string; status: string };

let payload: { sub: string; role: string; sid?: string } | null = null;
let members: Member[] = [];
let subprocessors: Row[] = [];
let transfers: Row[] = [];
let activities: Row[] = [];
let policies: Row[] = [];
let txChain: Promise<unknown> = Promise.resolve();
const auditCalls: Array<Record<string, unknown>> = [];
const savedEnv = { ...process.env };

function match(where: Record<string, unknown>, r: Row): boolean {
  for (const [k, v] of Object.entries(where)) {
    const cell = r[k];
    if (v === null) { if (cell != null) return false; continue; }
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("in" in (v as object)) { if (!(v as { in: unknown[] }).in.includes(cell)) return false; continue; }
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
function coll(store: () => Row[]) {
  return {
    findFirst: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
      const row = store().find((r) => match(where, r));
      return row ? project(row, select) : null;
    },
    findMany: async ({ where = {}, take, select }: { where?: Record<string, unknown>; take?: number; select?: Record<string, boolean> }) => {
      const rows = store().filter((r) => match(where, r)).map((r) => project(r, select));
      return typeof take === "number" ? rows.slice(0, take) : rows;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => { const row = { ...data } as Row; store().push(row); return row; },
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
    },
    subprocessor:       coll(() => subprocessors),
    dataTransfer:       coll(() => transfers),
    processingActivity: coll(() => activities),
  };
  db.$queryRawUnsafe = async (sql: string, ...vals: unknown[]) => {
    // Authoritative evaluation clock, captured after the row locks are held.
    if (/clock_timestamp\(\)/i.test(sql)) return [{ now: new Date() }];
    // AiProviderPolicy is READ + LOCKED (FOR SHARE) inside the approval transaction.
    if (/"AiProviderPolicy"[\s\S]*FOR SHARE/i.test(sql)) {
      const [org, reg] = vals as [string, string];
      const p = policies.find((x) => x.organizationId === org && x.providerRegistryId === reg);
      return p ? [{ policyVersion: p.policyVersion, enabled: p.enabled, expiresAt: p.expiresAt ?? null, allowedDataClasses: p.allowedDataClasses, allowedWorkflows: p.allowedWorkflows }] : [];
    }
    if (/FOR UPDATE/i.test(sql)) {
      const [id, org] = vals as [string, string];
      const store = /"Subprocessor"/.test(sql) ? subprocessors : transfers;
      const row = store.find((r) => r.id === id && r.organizationId === org);
      return row ? [{ id: row.id }] : [];
    }
    return [];
  };
  db.$transaction = (fn: (tx: unknown) => Promise<unknown>) => {
    const run = txChain.then(async () => {
      const s1 = subprocessors.map((r) => ({ ...r })), s2 = transfers.map((r) => ({ ...r }));
      try { return await fn(db); }
      catch (e) { subprocessors.splice(0, subprocessors.length, ...s1); transfers.splice(0, transfers.length, ...s2); throw e; }
    });
    txChain = run.then(() => undefined, () => undefined);
    return run;
  };
  return db;
}

const MOCKED = ["@/lib/auth/jwt", "@/lib/auth/session-store", "@/lib/db/prisma", "@/lib/audit/audit-service", "@/lib/logger/security-events"];
beforeEach(() => {
  vi.resetModules();
  payload = null; members = []; subprocessors = []; transfers = []; activities = []; policies = []; auditCalls.length = 0;
  txChain = Promise.resolve();
  delete process.env.HERMES_EXTERNAL_AI_ENABLED;
  vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => payload }));
  vi.doMock("@/lib/auth/session-store", () => ({ isPayloadSessionActive: async () => true }));
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => makeDb() }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async (e: Record<string, unknown>) => { auditCalls.push(e); },
    COMPLIANCE_AUDIT: {
      SUBPROCESSOR_CREATED: "compliance.subprocessor.created", SUBPROCESSOR_UPDATED: "compliance.subprocessor.updated",
      SUBPROCESSOR_TRANSITIONED: "compliance.subprocessor.transitioned", SUBPROCESSOR_APPROVED: "compliance.subprocessor.approved",
      DATA_TRANSFER_CREATED: "compliance.data_transfer.created", DATA_TRANSFER_UPDATED: "compliance.data_transfer.updated",
      DATA_TRANSFER_TRANSITIONED: "compliance.data_transfer.transitioned", DATA_TRANSFER_APPROVED: "compliance.data_transfer.approved",
    },
  }));
  vi.doMock("@/lib/logger/security-events", () => ({ logAuthFailure: () => {}, logAuthzDenial: () => {}, logInfraFailure: () => {} }));
});
afterEach(() => { for (const m of MOCKED) vi.doUnmock(m); vi.restoreAllMocks(); process.env = { ...savedEnv }; });

function req(path: string, method: string, body?: unknown, withToken = true) {
  return new NextRequest(`http://localhost/api/compliance${path}`, { method, headers: { ...(withToken ? { cookie: `${ACCESS_TOKEN_COOKIE}=fake` } : {}), "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
async function spList(withToken = true) { const { GET } = await import("../route"); const r = await GET(req("/subprocessors", "GET", undefined, withToken)); return { res: r, json: await r.json() }; }
async function spCreate(body: unknown) { const { POST } = await import("../route"); const r = await POST(req("/subprocessors", "POST", body)); return { res: r, json: await r.json() }; }
async function spGet(id: string) { const { GET } = await import("../[id]/route"); const r = await GET(req(`/subprocessors/${id}`, "GET"), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
async function spPatch(id: string, body: unknown) { const { PATCH } = await import("../[id]/route"); const r = await PATCH(req(`/subprocessors/${id}`, "PATCH", body), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
async function trCreate(body: unknown) { const { POST } = await import("../../transfers/route"); const r = await POST(req("/transfers", "POST", body)); return { res: r, json: await r.json() }; }
async function trPatch(id: string, body: unknown) { const { PATCH } = await import("../../transfers/[id]/route"); const r = await PATCH(req(`/transfers/${id}`, "PATCH", body), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }

function ownerA() { payload = { sub: "owner-A", role: "customer", sid: "s" }; members = [{ id: "m1", userId: "owner-A", organizationId: "org-A", role: "OWNER", status: "ACTIVE" }]; }
function adminA() { payload = { sub: "admin-A", role: "admin", sid: "s" }; members = [{ id: "m2", userId: "admin-A", organizationId: "org-A", role: "ADMIN", status: "ACTIVE" }]; }
function sub(over: Partial<Row> = {}): Row {
  return {
    id: "sp1", organizationId: "org-A", name: "Vendor", legalEntity: null, providerRegistryId: null,
    providerDataClasses: [], providerWorkflows: [],
    approvedProviderPolicyVersion: null, approvedProviderScopeHash: null, providerPolicyEvaluatedAt: null,
    serviceCategory: "REVIEW_REQUIRED", operatingCountries: [], processingCountries: [], dataCategories: [], subjectCategories: [],
    contractReviewStatus: "REVIEW_REQUIRED", privacyReviewStatus: "REVIEW_REQUIRED", securityReviewStatus: "REVIEW_REQUIRED",
    lifecycle: "DRAFT", reviewedBy: null, reviewedAt: null, approvedBy: null, approvedAt: null, nextReviewAt: null,
    createdAt: new Date(), updatedAt: new Date(), ...over,
  } as Row;
}
function tr(over: Partial<Row> = {}): Row {
  return {
    id: "tf1", organizationId: "org-A", subprocessorId: null, processingActivityId: null,
    sourceJurisdiction: "CONFIGURATION_REQUIRED", destinationJurisdiction: "CONFIGURATION_REQUIRED", transferCategory: "REVIEW_REQUIRED",
    transferMechanismStatus: "LEGAL_REVIEW_REQUIRED", legalReviewStatus: "REVIEW_REQUIRED", riskReviewStatus: "REVIEW_REQUIRED",
    lifecycle: "DRAFT", reviewedBy: null, reviewedAt: null, approvedBy: null, approvedAt: null,
    createdAt: new Date(), updatedAt: new Date(), ...over,
  } as Row;
}
const REVIEWED = { contractReviewStatus: "APPROVED", privacyReviewStatus: "APPROVED", securityReviewStatus: "APPROVED" };

describe("auth + tenant isolation", () => {
  it("unauthenticated list is denied (401)", async () => { expect((await spList(false)).res.status).toBe(401); });
  it("tenant A cannot read or mutate tenant B's records (uniform 404)", async () => {
    adminA();
    subprocessors = [sub({ id: "spB", organizationId: "org-B" })];
    transfers = [tr({ id: "tfB", organizationId: "org-B" })];
    expect((await spGet("spB")).res.status).toBe(404);
    expect((await spPatch("spB", { transition: "UNDER_REVIEW" })).res.status).toBe(404);
    expect((await trPatch("tfB", { update: { transferCategory: "x" } })).res.status).toBe(404);
    expect(subprocessors[0].lifecycle).toBe("DRAFT");
    expect((await spList()).json.subprocessors).toHaveLength(0); // B's rows never listed for A
  });
});

describe("creation (server-derived scope, strict input)", () => {
  it("creates a DRAFT record scoped to the caller's org; quarantined review defaults", async () => {
    adminA();
    const r = await spCreate({ name: "Acme Cloud" });
    expect(r.res.status).toBe(201);
    expect(subprocessors[0].organizationId).toBe("org-A");
    expect(subprocessors[0].lifecycle).toBe("DRAFT");
    expect(subprocessors[0].contractReviewStatus).toBe("REVIEW_REQUIRED");
  });
  it("client-supplied organizationId / lifecycle / attribution keys are rejected (400)", async () => {
    adminA();
    expect((await spCreate({ name: "X", organizationId: "org-EVIL" })).res.status).toBe(400);
    expect((await spCreate({ name: "X", lifecycle: "APPROVED" })).res.status).toBe(400);
    expect((await spPatch("sp1", { update: { approvedBy: "me" } })).res.status).toBe(404); // no row yet; key itself also invalid
    subprocessors = [sub()];
    expect((await spPatch("sp1", { update: { approvedBy: "me" } })).res.status).toBe(400);   // CLIENT_SUPPLIED_APPROVAL_ATTRIBUTION=0
    expect((await spPatch("sp1", { update: { reviewedBy: "me" } })).res.status).toBe(400);   // CLIENT_SUPPLIED_REVIEW_ATTRIBUTION=0
    expect(subprocessors[0].approvedBy ?? null).toBeNull();
  });
  it("a transfer cannot link a foreign-tenant Subprocessor or ProcessingActivity (CROSS_TENANT_TRANSFER_RELATION=0)", async () => {
    adminA();
    subprocessors = [sub({ id: "spB", organizationId: "org-B" })];
    activities = [{ id: "paB", organizationId: "org-B" } as Row];
    expect((await trCreate({ subprocessorId: "spB" })).res.status).toBe(404);
    expect((await trCreate({ processingActivityId: "paB" })).res.status).toBe(404);
    expect(transfers).toHaveLength(0);
    // Same-org relations are accepted.
    subprocessors.push(sub({ id: "spA" }));
    activities.push({ id: "paA", organizationId: "org-A" } as Row);
    expect((await trCreate({ subprocessorId: "spA", processingActivityId: "paA" })).res.status).toBe(201);
  });
});

describe("review + lifecycle gates", () => {
  it("unknown lifecycle and invalid transitions are closed 409s", async () => {
    ownerA(); subprocessors = [sub()];
    expect((await spPatch("sp1", { transition: "NONSENSE" })).json.code).toBe("INVALID_TRANSITION");
    expect((await spPatch("sp1", { transition: "APPROVED" })).json.code).toBe("INVALID_TRANSITION"); // DRAFT→APPROVED skips review
  });
  it("review-status updates stamp SERVER attribution", async () => {
    adminA(); subprocessors = [sub({ lifecycle: "UNDER_REVIEW" })];
    const r = await spPatch("sp1", { update: { contractReviewStatus: "APPROVED" } });
    expect(r.res.status).toBe(200);
    expect(subprocessors[0].reviewedBy).toBe("admin-A"); // actor, never client input
    expect(subprocessors[0].reviewedAt).toBeTruthy();
  });
  it("approval without positively-complete reviews is denied (UNREVIEWED_SUBPROCESSOR_APPROVAL=0), ADMIN can never approve", async () => {
    adminA(); subprocessors = [sub({ lifecycle: "UNDER_REVIEW" })];
    expect((await spPatch("sp1", { transition: "APPROVED" })).res.status).toBe(403); // ADMIN lacks approve
    ownerA();
    const r = await spPatch("sp1", { transition: "APPROVED" });
    expect(r.res.status).toBe(409);
    expect(r.json.code).toBe("NOT_APPROVABLE");
    expect(subprocessors[0].lifecycle).toBe("UNDER_REVIEW");
  });
  it("fully-reviewed non-provider record approves with server attribution; approved evidence becomes immutable", async () => {
    ownerA(); subprocessors = [sub({ lifecycle: "UNDER_REVIEW", ...REVIEWED })];
    const ok = await spPatch("sp1", { transition: "APPROVED" });
    expect(ok.res.status).toBe(200);
    expect(subprocessors[0].approvedBy).toBe("owner-A");
    // Material mutation after approval → 409 IMMUTABLE_LIFECYCLE.
    const mut = await spPatch("sp1", { update: { name: "Changed" } });
    expect(mut.res.status).toBe(409);
    expect(mut.json.code).toBe("IMMUTABLE_LIFECYCLE");
    expect(subprocessors[0].name).toBe("Vendor");
    // Supersession clears approval and reopens editing.
    await spPatch("sp1", { transition: "UNDER_REVIEW" });
    expect(subprocessors[0].approvedBy ?? null).toBeNull();
    expect((await spPatch("sp1", { update: { name: "Changed" } })).res.status).toBe(200);
  });
  it("transfer approval needs mechanism CONFIGURED + legal/risk APPROVED + an APPROVED linked subprocessor", async () => {
    ownerA();
    subprocessors = [sub({ id: "spA", lifecycle: "DRAFT" })];
    transfers = [tr({ lifecycle: "UNDER_REVIEW", subprocessorId: "spA" })];
    // Missing reviews → blocked (UNREVIEWED_DATA_TRANSFER_APPROVAL=0).
    expect((await trPatch("tf1", { transition: "APPROVED" })).json.code).toBe("NOT_APPROVABLE");
    Object.assign(transfers[0], { transferMechanismStatus: "CONFIGURED", legalReviewStatus: "APPROVED", riskReviewStatus: "APPROVED" });
    // Linked subprocessor not APPROVED/ACTIVE → still blocked.
    const blocked = await trPatch("tf1", { transition: "APPROVED" });
    expect(blocked.json.code).toBe("NOT_APPROVABLE");
    expect((blocked.json.blockers as Array<{ field: string }>).some((b) => b.field === "subprocessorId")).toBe(true);
    Object.assign(subprocessors[0], { lifecycle: "APPROVED", ...REVIEWED, approvedBy: "owner-A", approvedAt: new Date() });
    expect((await trPatch("tf1", { transition: "APPROVED" })).res.status).toBe(200);
    expect(transfers[0].approvedBy).toBe("owner-A");
  });
});

describe("Phase 95 exact provider-scope binding (transactional, read-only)", () => {
  // A provider-linked subprocessor in UNDER_REVIEW with a declared closed scope.
  function providerLinked(scope: Partial<Row> = {}) {
    ownerA();
    subprocessors = [sub({ lifecycle: "UNDER_REVIEW", providerRegistryId: REG, providerDataClasses: ["tenant_operational"], providerWorkflows: [WF], ...REVIEWED, ...scope })];
    process.env.HERMES_EXTERNAL_AI_ENABLED = "1";
  }
  const livePolicy = (over: Partial<Row> = {}) => ({
    id: "pol1", organizationId: "org-A", providerRegistryId: REG, enabled: true,
    allowedDataClasses: ["public", "tenant_operational"], allowedWorkflows: [WF],
    approvedBy: "owner-A", approvedAt: new Date(), policyVersion: "1.0", expiresAt: null,
    createdAt: new Date(), updatedAt: new Date(), ...over,
  } as Row);

  it("provider-linked with NO declared scope → configuration required (UNBOUND_PROVIDER_SCOPE_APPROVAL=0)", async () => {
    providerLinked({ providerDataClasses: [], providerWorkflows: [] });
    policies = [livePolicy()];
    const r = await spPatch("sp1", { transition: "APPROVED" });
    expect(r.res.status).toBe(409);
    expect((r.json.blockers as Array<{ reason: string }>).some((b) => b.reason === "PROVIDER_SCOPE_CONFIGURATION_REQUIRED")).toBe(true);
    expect(subprocessors[0].lifecycle).toBe("UNDER_REVIEW");
  });
  it("an unrelated allowed Policy scope cannot approve a different declared class", async () => {
    providerLinked({ providerDataClasses: ["personal_data"] }); // policy allows public/tenant_operational only
    policies = [livePolicy()];
    const r = await spPatch("sp1", { transition: "APPROVED" });
    expect(r.res.status).toBe(409);
    expect((r.json.blockers as Array<{ reason: string }>).some((b) => b.reason === "PROVIDER_POLICY_DENIED:UNAPPROVED_DATA_CLASS")).toBe(true);
  });
  it("secret scope is always denied (SECRET_PROVIDER_SCOPE_APPROVAL=0)", async () => {
    providerLinked({ providerDataClasses: ["secret"] });
    policies = [livePolicy({ allowedDataClasses: ["secret", "tenant_operational"] })];
    const r = await spPatch("sp1", { transition: "APPROVED" });
    expect((r.json.blockers as Array<{ reason: string }>).some((b) => b.reason === "PROVIDER_POLICY_DENIED:SECRET_OR_CREDENTIAL")).toBe(true);
  });
  it("missing policy context fails CLOSED (MISSING_PROVIDER_POLICY_FAIL_OPEN=0)", async () => {
    providerLinked();
    const r = await spPatch("sp1", { transition: "APPROVED" });
    expect(r.res.status).toBe(409);
    expect((r.json.blockers as Array<{ reason: string }>).some((b) => b.reason === "PROVIDER_POLICY_CONFIGURATION_REQUIRED")).toBe(true);
    expect(subprocessors[0].lifecycle).toBe("UNDER_REVIEW");
  });
  it("a Phase 95 denial always wins even with complete reviews (PHASE95_PROVIDER_POLICY_DENIAL_OVERRIDDEN=0)", async () => {
    providerLinked();
    policies = [livePolicy({ enabled: false })]; // disabled at transaction time
    const r = await spPatch("sp1", { transition: "APPROVED" });
    expect(r.res.status).toBe(409);
    expect((r.json.blockers as Array<{ reason: string }>).some((b) => b.reason === "PROVIDER_POLICY_DENIED:POLICY_DISABLED")).toBe(true);
    // Deleting the policy before the transaction also fails closed.
    policies = [];
    expect(((await spPatch("sp1", { transition: "APPROVED" })).json.blockers as Array<{ reason: string }>).some((b) => b.reason === "PROVIDER_POLICY_CONFIGURATION_REQUIRED")).toBe(true);
    // Flag off denies regardless of a live policy.
    policies = [livePolicy()]; delete process.env.HERMES_EXTERNAL_AI_ENABLED;
    expect(((await spPatch("sp1", { transition: "APPROVED" })).json.blockers as Array<{ reason: string }>).some((b) => b.reason === "PROVIDER_POLICY_DENIED:FEATURE_FLAG_OFF")).toBe(true);
  });
  it("a fully-allowed scope approves and persists EXACT version + canonical scope hash (APPROVED_PROVIDER_POLICY_VERSION_MISSING=0)", async () => {
    providerLinked();
    policies = [livePolicy()];
    const r = await spPatch("sp1", { transition: "APPROVED" });
    expect(r.res.status).toBe(200);
    expect(subprocessors[0].lifecycle).toBe("APPROVED");
    expect(subprocessors[0].approvedProviderPolicyVersion).toBe("1.0");
    expect(subprocessors[0].approvedProviderScopeHash).toBe(providerScopeHash(["tenant_operational"], [WF]));
    expect(subprocessors[0].providerPolicyEvaluatedAt).toBeTruthy();
    // Audit carries only identifiers/closed codes — no provider config leaks.
    expect(JSON.stringify(auditCalls)).not.toContain("allowedDataClasses");
  });
});

describe("DataTransfer revalidates the current provider policy", () => {
  const scopeHash = () => providerScopeHash(["tenant_operational"], [WF]);
  function linkedApprovedSubprocessor(over: Partial<Row> = {}) {
    return sub({ id: "spA", lifecycle: "APPROVED", providerRegistryId: REG, providerDataClasses: ["tenant_operational"], providerWorkflows: [WF],
      ...REVIEWED, approvedBy: "owner-A", approvedAt: new Date(), approvedProviderPolicyVersion: "1.0", approvedProviderScopeHash: scopeHash(), providerPolicyEvaluatedAt: new Date(), ...over });
  }
  const reviewedTransfer = () => tr({ lifecycle: "UNDER_REVIEW", subprocessorId: "spA", transferMechanismStatus: "CONFIGURED", legalReviewStatus: "APPROVED", riskReviewStatus: "APPROVED" });
  const livePolicy = (over: Partial<Row> = {}) => ({ id: "pol1", organizationId: "org-A", providerRegistryId: REG, enabled: true, allowedDataClasses: ["public", "tenant_operational"], allowedWorkflows: [WF], policyVersion: "1.0", expiresAt: null, ...over } as Row);

  it("approves when the linked subprocessor's bound policy version still matches", async () => {
    ownerA(); process.env.HERMES_EXTERNAL_AI_ENABLED = "1";
    subprocessors = [linkedApprovedSubprocessor()]; transfers = [reviewedTransfer()]; policies = [livePolicy()];
    expect((await trPatch("tf1", { transition: "APPROVED" })).res.status).toBe(200);
    expect(transfers[0].lifecycle).toBe("APPROVED");
  });
  it("blocks when the org Policy version was replaced after subprocessor approval (TRANSFER_APPROVED_WITH_POLICY_VERSION_MISMATCH=0)", async () => {
    ownerA(); process.env.HERMES_EXTERNAL_AI_ENABLED = "1";
    subprocessors = [linkedApprovedSubprocessor()]; transfers = [reviewedTransfer()]; policies = [livePolicy({ policyVersion: "2.0" })];
    const r = await trPatch("tf1", { transition: "APPROVED" });
    expect(r.res.status).toBe(409);
    expect((r.json.blockers as Array<{ reason: string }>).some((b) => b.reason === "PROVIDER_POLICY_VERSION_MISMATCH")).toBe(true);
    expect(transfers[0].lifecycle).toBe("UNDER_REVIEW");
  });
  it("blocks after a current-policy denial / expiry (TRANSFER_APPROVED_AFTER_POLICY_DENIAL=0)", async () => {
    ownerA(); process.env.HERMES_EXTERNAL_AI_ENABLED = "1";
    subprocessors = [linkedApprovedSubprocessor()]; transfers = [reviewedTransfer()];
    policies = [livePolicy({ enabled: false })];
    expect(((await trPatch("tf1", { transition: "APPROVED" })).json.blockers as Array<{ reason: string }>).some((b) => b.reason === "PROVIDER_POLICY_DENIED:POLICY_DISABLED")).toBe(true);
    policies = [livePolicy({ expiresAt: new Date("2000-01-01") })];
    expect(((await trPatch("tf1", { transition: "APPROVED" })).json.blockers as Array<{ reason: string }>).some((b) => b.reason === "PROVIDER_POLICY_DENIED:POLICY_EXPIRED")).toBe(true);
    // Deleted policy → configuration required.
    policies = [];
    expect(((await trPatch("tf1", { transition: "APPROVED" })).json.blockers as Array<{ reason: string }>).some((b) => b.reason === "PROVIDER_POLICY_CONFIGURATION_REQUIRED")).toBe(true);
    expect(transfers[0].lifecycle).toBe("UNDER_REVIEW");
  });
  it("blocks when the linked subprocessor is committed SUSPENDED (real re-read under lock)", async () => {
    ownerA(); process.env.HERMES_EXTERNAL_AI_ENABLED = "1";
    subprocessors = [linkedApprovedSubprocessor({ lifecycle: "SUSPENDED", approvedBy: null, approvedAt: null, approvedProviderPolicyVersion: null, approvedProviderScopeHash: null, providerPolicyEvaluatedAt: null })];
    transfers = [reviewedTransfer()]; policies = [livePolicy()];
    const r = await trPatch("tf1", { transition: "APPROVED" });
    expect(r.res.status).toBe(409);
    expect((r.json.blockers as Array<{ field: string }>).some((b) => b.field === "subprocessorId")).toBe(true);
    expect(transfers[0].lifecycle).toBe("UNDER_REVIEW");
  });
});

describe("provider evidence integrity + strict scope (transactional)", () => {
  const scopeHash = () => providerScopeHash(["tenant_operational"], [WF]);
  const livePolicy = () => ({ id: "pol1", organizationId: "org-A", providerRegistryId: REG, enabled: true, allowedDataClasses: ["public", "tenant_operational"], allowedWorkflows: [WF], policyVersion: "1.0", expiresAt: null } as Row);
  const providerApproved = (over: Partial<Row> = {}) => sub({
    id: "sp1", lifecycle: "APPROVED", providerRegistryId: REG, providerDataClasses: ["tenant_operational"], providerWorkflows: [WF], ...REVIEWED,
    approvedBy: "owner-A", approvedAt: new Date(), approvedProviderPolicyVersion: "1.0", approvedProviderScopeHash: scopeHash(), providerPolicyEvaluatedAt: new Date(), ...over,
  });

  it("supersession (APPROVED→UNDER_REVIEW) clears approval AND provider evidence (STALE_PROVIDER_EVIDENCE_AFTER_SUPERSESSION=0)", async () => {
    ownerA(); subprocessors = [providerApproved()];
    expect((await spPatch("sp1", { transition: "UNDER_REVIEW" })).res.status).toBe(200);
    const r = subprocessors[0];
    expect(r.lifecycle).toBe("UNDER_REVIEW");
    expect(r.approvedBy ?? null).toBeNull();
    expect(r.approvedProviderPolicyVersion ?? null).toBeNull();
    expect(r.approvedProviderScopeHash ?? null).toBeNull();
    expect(r.providerPolicyEvaluatedAt ?? null).toBeNull();
  });
  it("SUSPENDED retains evidence, but SUSPENDED→UNDER_REVIEW clears it", async () => {
    ownerA(); subprocessors = [providerApproved()];
    expect((await spPatch("sp1", { transition: "SUSPENDED" })).res.status).toBe(200);
    expect(subprocessors[0].approvedProviderScopeHash).toBe(scopeHash()); // retained under suspension
    expect((await spPatch("sp1", { transition: "UNDER_REVIEW" })).res.status).toBe(200);
    expect(subprocessors[0].approvedProviderScopeHash ?? null).toBeNull();
    expect(subprocessors[0].providerPolicyEvaluatedAt ?? null).toBeNull();
  });
  it("provider unlink on an editable row clears stored provider evidence (STALE_PROVIDER_EVIDENCE_AFTER_PROVIDER_UNLINK=0)", async () => {
    ownerA(); subprocessors = [providerApproved({ lifecycle: "UNDER_REVIEW", approvedBy: null, approvedAt: null })];
    expect((await spPatch("sp1", { update: { providerRegistryId: null } })).res.status).toBe(200);
    expect(subprocessors[0].providerRegistryId ?? null).toBeNull();
    expect(subprocessors[0].approvedProviderScopeHash ?? null).toBeNull();
    expect(subprocessors[0].approvedProviderPolicyVersion ?? null).toBeNull();
  });
  it("scope change on an editable row clears stored provider evidence (STALE_PROVIDER_EVIDENCE_AFTER_SCOPE_CHANGE=0)", async () => {
    ownerA(); subprocessors = [providerApproved({ lifecycle: "UNDER_REVIEW", approvedBy: null, approvedAt: null })];
    expect((await spPatch("sp1", { update: { providerDataClasses: ["public"] } })).res.status).toBe(200);
    expect(subprocessors[0].providerDataClasses).toEqual(["public"]);
    expect(subprocessors[0].approvedProviderScopeHash ?? null).toBeNull();
    expect(subprocessors[0].providerPolicyEvaluatedAt ?? null).toBeNull();
  });
  it("a NON-provider approval explicitly persists null provider evidence (NON_PROVIDER_APPROVAL_WITH_PROVIDER_EVIDENCE=0)", async () => {
    ownerA();
    subprocessors = [sub({ lifecycle: "UNDER_REVIEW", providerRegistryId: null, ...REVIEWED,
      approvedProviderPolicyVersion: "9.9", approvedProviderScopeHash: "f".repeat(64), providerPolicyEvaluatedAt: new Date() })]; // stale, non-provider
    expect((await spPatch("sp1", { transition: "APPROVED" })).res.status).toBe(200);
    expect(subprocessors[0].lifecycle).toBe("APPROVED");
    expect(subprocessors[0].approvedProviderPolicyVersion ?? null).toBeNull();
    expect(subprocessors[0].approvedProviderScopeHash ?? null).toBeNull();
    expect(subprocessors[0].providerPolicyEvaluatedAt ?? null).toBeNull();
  });
  it("a malformed stored provider scope fails CLOSED on approval (MALFORMED_PROVIDER_SCOPE_APPROVAL=0)", async () => {
    ownerA(); process.env.HERMES_EXTERNAL_AI_ENABLED = "1";
    subprocessors = [sub({ lifecycle: "UNDER_REVIEW", providerRegistryId: REG, providerDataClasses: [123], providerWorkflows: [WF], ...REVIEWED })];
    policies = [livePolicy()];
    const r = await spPatch("sp1", { transition: "APPROVED" });
    expect(r.res.status).toBe(409);
    expect((r.json.blockers as Array<{ reason: string }>).some((b) => b.reason === "PROVIDER_SCOPE_INVALID")).toBe(true);
    expect(subprocessors[0].lifecycle).toBe("UNDER_REVIEW");
  });
  it("transfer revalidation rejects a malformed stored subprocessor scope", async () => {
    ownerA(); process.env.HERMES_EXTERNAL_AI_ENABLED = "1";
    subprocessors = [sub({ id: "spA", lifecycle: "APPROVED", providerRegistryId: REG, providerDataClasses: [123], providerWorkflows: [WF], ...REVIEWED,
      approvedBy: "owner-A", approvedAt: new Date(), approvedProviderPolicyVersion: "1.0", approvedProviderScopeHash: scopeHash(), providerPolicyEvaluatedAt: new Date() })];
    transfers = [tr({ id: "tf1", lifecycle: "UNDER_REVIEW", subprocessorId: "spA", transferMechanismStatus: "CONFIGURED", legalReviewStatus: "APPROVED", riskReviewStatus: "APPROVED" })];
    policies = [livePolicy()];
    const r = await trPatch("tf1", { transition: "APPROVED" });
    expect(r.res.status).toBe(409);
    expect((r.json.blockers as Array<{ reason: string }>).some((b) => b.reason === "PROVIDER_SCOPE_INVALID")).toBe(true);
    expect(transfers[0].lifecycle).toBe("UNDER_REVIEW");
  });
});

describe("audit hygiene (RAW_PERSONAL_DATA_IN_TRANSFER_AUDIT=0)", () => {
  it("audit metadata never contains material values or free text — identifiers + closed codes only", async () => {
    adminA();
    await spCreate({ name: "Sensitive Vendor Name GmbH", dataCategories: ["special-category-health"] });
    subprocessors[0].lifecycle = "UNDER_REVIEW";
    await spPatch(subprocessors[0].id, { update: { name: "Renamed Vendor XYZ", contractReviewStatus: "APPROVED" } });
    const s = JSON.stringify(auditCalls);
    expect(s).not.toContain("Sensitive Vendor Name GmbH");
    expect(s).not.toContain("Renamed Vendor XYZ");
    expect(s).not.toContain("special-category-health");
  });
});
