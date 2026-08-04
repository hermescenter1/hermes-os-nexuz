/**
 * SECURITY (Phase 97 Part E+F) — retention policy & legal hold tenant isolation,
 * plus the dry-run hold-protection invariant at the API boundary.
 *
 * Invariants:
 *   CROSS_TENANT read/mutation = 0 for RetentionPolicy and LegalHold
 *   CLIENT_SUPPLIED_ORG_SCOPE_ACCEPTED = 0 (strict schema)
 *   LEGAL_HOLD_PROTECTED_DELETION = 0 (dry-run never reports a held record ELIGIBLE)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";

type Member = { userId: string; organizationId: string; role: string; status: string };
type Row = Record<string, unknown> & { id: string; organizationId: string };

let payload: { sub: string; role: string; sid?: string } | null = null;
let sessionActive = true;
let members: Member[] = [];
let policies: Row[] = [];
let holds: Row[] = [];
let capturedWhere: Record<string, unknown> | null = null;
const auditCalls: Array<Record<string, unknown>> = [];
let idSeq = 0;

function matches(where: Record<string, unknown>, r: Row): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (r[k] !== v) return false;
  }
  return true;
}
function model(store: () => Row[]) {
  return {
    findMany: async ({ where = {} }: { where?: Record<string, unknown> }) => store().filter((r) => matches(where, r)),
    findFirst: async ({ where }: { where: Record<string, unknown> }) => store().find((r) => matches(where, r)) ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { ...data, id: (data.id as string) ?? `gen-${++idSeq}` } as Row;
      store().push(row);
      return row;
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      capturedWhere = where;
      const matched = store().filter((r) => matches(where, r));
      matched.forEach((r) => Object.assign(r, data));
      return { count: matched.length };
    },
  };
}

function makeDb() {
  return {
    organizationMember: {
      findMany: async ({ where }: { where: { userId: string; status: string } }) =>
        members.filter((m) => m.userId === where.userId && m.status === where.status).map((m) => ({ organizationId: m.organizationId, role: m.role })),
    },
    retentionPolicy: model(() => policies),
    legalHold: model(() => holds),
  };
}

const MOCKED = ["@/lib/auth/jwt", "@/lib/auth/session-store", "@/lib/db/prisma", "@/lib/audit/audit-service", "@/lib/logger/security-events"];

beforeEach(() => {
  vi.resetModules();
  payload = null; sessionActive = true; members = []; policies = []; holds = [];
  capturedWhere = null; auditCalls.length = 0;
  vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => payload }));
  vi.doMock("@/lib/auth/session-store", () => ({ isPayloadSessionActive: async () => sessionActive }));
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => makeDb() }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async (e: Record<string, unknown>) => { auditCalls.push(e); },
    COMPLIANCE_AUDIT: {
      RETENTION_POLICY_CREATED: "compliance.retention_policy.created",
      RETENTION_POLICY_UPDATED: "compliance.retention_policy.updated",
      LEGAL_HOLD_CREATED: "compliance.legal_hold.created",
      LEGAL_HOLD_UPDATED: "compliance.legal_hold.updated",
    },
  }));
  vi.doMock("@/lib/logger/security-events", () => ({ logAuthFailure: () => {}, logAuthzDenial: () => {}, logInfraFailure: () => {} }));
});
afterEach(() => { for (const m of MOCKED) vi.doUnmock(m); vi.restoreAllMocks(); });

function mkReq(path: string, method: string, body?: unknown, withToken = true) {
  return new NextRequest(`http://localhost/api/compliance${path}`, {
    method,
    headers: { ...(withToken ? { cookie: `${ACCESS_TOKEN_COOKIE}=fake` } : {}), "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function call(mod: string, method: "GET" | "POST" | "PATCH", path: string, body?: unknown, id?: string) {
  const r = await import(mod);
  const fn = r[method] as (req: NextRequest, ctx?: unknown) => Promise<Response>;
  const ctx = id !== undefined ? { params: Promise.resolve({ id }) } : undefined;
  const res = await fn(mkReq(path, method, body), ctx);
  return { res, json: await res.json() };
}

function orgAdminA() { payload = { sub: "admin-A", role: "admin", sid: "s1" }; members = [{ userId: "admin-A", organizationId: "org-A", role: "ADMIN", status: "ACTIVE" }]; }
function viewerA() { payload = { sub: "v", role: "customer", sid: "s1" }; members = [{ userId: "v", organizationId: "org-A", role: "VIEWER", status: "ACTIVE" }]; }

describe("retention policies — tenant isolation", () => {
  it("list returns only the caller's org; cannot GET a foreign policy (404)", async () => {
    orgAdminA();
    policies = [
      { id: "p-A", organizationId: "org-A", name: "A", action: "REVIEW_REQUIRED", retentionDays: null, approvalState: "PENDING_REVIEW", enabled: false, dryRunOnly: true },
      { id: "p-B", organizationId: "org-B", name: "B", action: "DELETE", retentionDays: 30, approvalState: "APPROVED", enabled: true, dryRunOnly: false },
    ];
    const list = await call("../retention-policies/route", "GET", "/retention-policies");
    expect(list.json.policies.map((p: { id: string }) => p.id)).toEqual(["p-A"]);
    const foreign = await call("../retention-policies/[id]/route", "GET", "/retention-policies/p-B", undefined, "p-B");
    expect(foreign.res.status).toBe(404);
  });

  it("cannot PATCH a foreign policy (404, untouched)", async () => {
    orgAdminA();
    policies = [{ id: "p-B", organizationId: "org-B", name: "B", action: "DELETE", retentionDays: 30, approvalState: "APPROVED", enabled: true, dryRunOnly: false }];
    const r = await call("../retention-policies/[id]/route", "PATCH", "/retention-policies/p-B", { enabled: true }, "p-B");
    expect(r.res.status).toBe(404);
    expect(policies[0].enabled).toBe(true); // untouched (was already true)
  });

  it("create is fail-closed by default (disabled, dry-run) and strips client org", async () => {
    orgAdminA();
    const bad = await call("../retention-policies/route", "POST", "/retention-policies", { name: "X", dataClass: "pii", targetResource: "case", organizationId: "org-B" });
    expect(bad.res.status).toBe(400); // strict schema rejects organizationId
    const ok = await call("../retention-policies/route", "POST", "/retention-policies", { name: "X", dataClass: "pii", targetResource: "case" });
    expect(ok.res.status).toBe(201);
    expect(ok.json.policy.enabled).toBe(false);
    expect(ok.json.policy.dryRunOnly).toBe(true);
    expect(ok.json.policy.configStatus).toBe("CONFIGURATION_REQUIRED");
    expect(policies[0].organizationId).toBe("org-A");
  });

  it("a VIEWER cannot create a policy (403)", async () => {
    viewerA();
    const r = await call("../retention-policies/route", "POST", "/retention-policies", { name: "X", dataClass: "pii", targetResource: "case" });
    expect(r.res.status).toBe(403);
  });
});

describe("legal holds — tenant isolation + status machine", () => {
  it("cannot read/patch a foreign hold (404)", async () => {
    orgAdminA();
    holds = [{ id: "h-B", organizationId: "org-B", name: "B", scopeType: "SUBJECT", subjectId: "s", status: "ACTIVE" }];
    const get = await call("../legal-holds/[id]/route", "GET", "/legal-holds/h-B", undefined, "h-B");
    expect(get.res.status).toBe(404);
    const patch = await call("../legal-holds/[id]/route", "PATCH", "/legal-holds/h-B", { status: "RELEASED" }, "h-B");
    expect(patch.res.status).toBe(404);
    expect(holds[0].status).toBe("ACTIVE");
  });

  it("a new hold is created PROPOSED (never ACTIVE)", async () => {
    orgAdminA();
    const r = await call("../legal-holds/route", "POST", "/legal-holds", { name: "Hold", scopeType: "ORGANIZATION" });
    expect(r.res.status).toBe(201);
    expect(r.json.hold.status).toBe("PROPOSED");
    expect(holds[0].organizationId).toBe("org-A");
  });

  it("activates PROPOSED→ACTIVE and rejects re-activating a RELEASED hold", async () => {
    orgAdminA();
    holds = [{ id: "h-A", organizationId: "org-A", name: "H", scopeType: "SUBJECT", subjectId: "s1", status: "PROPOSED" }];
    const act = await call("../legal-holds/[id]/route", "PATCH", "/legal-holds/h-A", { status: "ACTIVE" }, "h-A");
    expect(act.res.status).toBe(200);
    expect(holds[0].status).toBe("ACTIVE");
    expect(holds[0].approvedBy).toBe("admin-A");
    // ACTIVE → RELEASED ok, then RELEASED is terminal & immutable.
    await call("../legal-holds/[id]/route", "PATCH", "/legal-holds/h-A", { status: "RELEASED" }, "h-A");
    const bad = await call("../legal-holds/[id]/route", "PATCH", "/legal-holds/h-A", { status: "ACTIVE" }, "h-A");
    expect(bad.res.status).toBe(409);
    expect(bad.json.code).toBe("HOLD_IMMUTABLE");
  });
});

describe("dry-run planner — LEGAL_HOLD_PROTECTED_DELETION=0 at the API", () => {
  it("never reports a held record ELIGIBLE for deletion", async () => {
    orgAdminA();
    policies = [{ id: "p-A", organizationId: "org-A", name: "purge", action: "DELETE", retentionDays: 30, approvalState: "APPROVED", enabled: true, dryRunOnly: true }];
    holds = [{ id: "h-A", organizationId: "org-A", name: "H", scopeType: "SUBJECT", subjectId: "subj-held", status: "ACTIVE" }];
    const body = {
      now: "2026-06-01T00:00:00.000Z",
      records: [
        { triggerAt: "2020-01-01T00:00:00.000Z", subjectId: "subj-held" },
        { triggerAt: "2020-01-01T00:00:00.000Z", subjectId: "subj-free" },
      ],
    };
    const r = await call("../retention-policies/[id]/dry-run/route", "POST", "/retention-policies/p-A/dry-run", body, "p-A");
    expect(r.res.status).toBe(200);
    expect(r.json.dryRun).toBe(true);
    expect(r.json.report.counts.LEGAL_HOLD).toBe(1);
    expect(r.json.report.counts.ELIGIBLE).toBe(1);
  });

  it("a cross-tenant hold does not leak into another org's dry-run", async () => {
    orgAdminA();
    policies = [{ id: "p-A", organizationId: "org-A", name: "purge", action: "DELETE", retentionDays: 30, approvalState: "APPROVED", enabled: true, dryRunOnly: true }];
    // hold belongs to org-B — must NOT protect org-A's evaluation.
    holds = [{ id: "h-B", organizationId: "org-B", name: "H", scopeType: "SUBJECT", subjectId: "subj-held", status: "ACTIVE" }];
    const body = { now: "2026-06-01T00:00:00.000Z", records: [{ triggerAt: "2020-01-01T00:00:00.000Z", subjectId: "subj-held" }] };
    const r = await call("../retention-policies/[id]/dry-run/route", "POST", "/retention-policies/p-A/dry-run", body, "p-A");
    expect(r.json.report.counts.ELIGIBLE).toBe(1);
    expect(r.json.report.counts.LEGAL_HOLD).toBe(0);
  });
});
