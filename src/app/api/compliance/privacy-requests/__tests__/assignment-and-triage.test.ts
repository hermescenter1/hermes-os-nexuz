/**
 * SECURITY (Phase 97 Part B) — unassigned triage queue + platform assignment.
 *
 * Invariants proven against the REAL authz helpers and the REAL tenant-scoped db
 * layer through a synthetic Prisma:
 *   UNASSIGNED_REQUEST_TENANT_ACCESS=0   (tenants never see/mutate unassigned)
 *   CROSS_TENANT_PRIVACY_REQUEST_READ=0  (list is org-pinned)
 *   platform-only assignment, assign-once, target-org validated, audited.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";

type Member = { userId: string; organizationId: string; role: string; status: string };
type Row = Record<string, unknown> & { id: string; organizationId: string | null };

let payload: { sub: string; role: string; sid?: string } | null = null;
let sessionActive = true;
let members: Member[] = [];
let requests: Row[] = [];
let orgs: Array<{ id: string }> = [];
let capturedAssignWhere: Record<string, unknown> | null = null;
const auditCalls: Array<Record<string, unknown>> = [];

function matches(where: Record<string, unknown>, r: Row): boolean {
  if ("id" in where && r.id !== where.id) return false;
  if ("organizationId" in where && r.organizationId !== (where.organizationId ?? null)) return false;
  if ("status" in where && r.status !== where.status) return false;
  return true;
}

function makeDb() {
  return {
    organizationMember: {
      findMany: async ({ where }: { where: { userId: string; status: string } }) =>
        members
          .filter((m) => m.userId === where.userId && m.status === where.status)
          .map((m) => ({ organizationId: m.organizationId, role: m.role })),
    },
    organization: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        orgs.find((o) => o.id === where.id) ?? null,
    },
    privacyRequest: {
      findMany: async ({ where = {} }: { where?: Record<string, unknown> }) =>
        requests.filter((r) => matches(where, r)),
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        requests.find((r) => matches(where, r)) ?? null,
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        capturedAssignWhere = where;
        const matched = requests.filter((r) => matches(where, r));
        matched.forEach((r) => Object.assign(r, data));
        return { count: matched.length };
      },
    },
  };
}

const MOCKED = ["@/lib/auth/jwt", "@/lib/auth/session-store", "@/lib/db/prisma", "@/lib/audit/audit-service", "@/lib/logger/security-events"];

beforeEach(() => {
  vi.resetModules();
  payload = null;
  sessionActive = true;
  members = [];
  requests = [];
  orgs = [{ id: "org-A" }, { id: "org-B" }];
  capturedAssignWhere = null;
  auditCalls.length = 0;

  vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => payload }));
  vi.doMock("@/lib/auth/session-store", () => ({ isPayloadSessionActive: async () => sessionActive }));
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => makeDb() }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async (e: Record<string, unknown>) => { auditCalls.push(e); },
    COMPLIANCE_AUDIT: {
      PRIVACY_REQUEST_STATUS_CHANGED: "compliance.privacy_request.status_changed",
      PRIVACY_REQUEST_ASSIGNED: "compliance.privacy_request.assigned",
    },
  }));
  vi.doMock("@/lib/logger/security-events", () => ({
    logAuthFailure: () => {}, logAuthzDenial: () => {}, logInfraFailure: () => {},
  }));
});

afterEach(() => {
  for (const m of MOCKED) vi.doUnmock(m);
  vi.restoreAllMocks();
});

function mkReq(path: string, method: string, body?: unknown, withToken = true): NextRequest {
  return new NextRequest(`http://localhost/api/compliance/privacy-requests${path}`, {
    method,
    headers: { ...(withToken ? { cookie: `${ACCESS_TOKEN_COOKIE}=fake` } : {}), "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function unassignedGET(withToken = true) {
  const { GET } = await import("../unassigned/route");
  const res = await GET(mkReq("/unassigned", "GET", undefined, withToken));
  return { res, json: await res.json() };
}
async function assignPOST(id: string, body: unknown) {
  const { POST } = await import("../[id]/assign/route");
  const res = await POST(mkReq(`/${id}/assign`, "POST", body), { params: Promise.resolve({ id }) });
  return { res, json: await res.json() };
}
async function listGET() {
  const { GET } = await import("../route");
  const res = await GET(mkReq("", "GET"));
  return { res, json: await res.json() };
}
async function patchPATCH(id: string, body: unknown) {
  const { PATCH } = await import("../[id]/route");
  const res = await PATCH(mkReq(`/${id}`, "PATCH", body), { params: Promise.resolve({ id }) });
  return { res, json: await res.json() };
}

function superadmin() { payload = { sub: "root", role: "superadmin", sid: "s1" }; }
function orgAdminA() {
  payload = { sub: "admin-A", role: "admin", sid: "s1" };
  members = [{ userId: "admin-A", organizationId: "org-A", role: "ADMIN", status: "ACTIVE" }];
}
function seedRequests() {
  requests = [
    { id: "u-1", organizationId: null, requestType: "ACCESS_REQUEST", status: "PENDING", locale: "en", description: "PUBLIC SECRET", email: "who@example.com", createdAt: new Date("2026-01-01T00:00:00.000Z") },
    { id: "a-1", organizationId: "org-A", requestType: "DATA_EXPORT", status: "IN_REVIEW", locale: "en", description: "TENANT A", email: "a@example.com", createdAt: new Date() },
    { id: "b-1", organizationId: "org-B", requestType: "DATA_EXPORT", status: "IN_REVIEW", locale: "en", description: "TENANT B", email: "b@example.com", createdAt: new Date() },
  ];
}

describe("unassigned triage queue — platform only", () => {
  it("denies a tenant admin (403 PLATFORM_ADMIN_REQUIRED)", async () => {
    orgAdminA(); seedRequests();
    const { res, json } = await unassignedGET();
    expect(res.status).toBe(403);
    expect(json.code).toBe("PLATFORM_ADMIN_REQUIRED");
  });

  it("a superadmin sees ONLY unassigned rows, projected without free text", async () => {
    superadmin(); seedRequests();
    const { res, json } = await unassignedGET();
    expect(res.status).toBe(200);
    expect(json.requests.map((r: { id: string }) => r.id)).toEqual(["u-1"]);
    const serialised = JSON.stringify(json);
    expect(serialised).not.toContain("PUBLIC SECRET");
    expect(serialised).not.toContain("who@example.com");
  });
});

describe("UNASSIGNED_REQUEST_TENANT_ACCESS=0", () => {
  it("a tenant list never includes an unassigned request", async () => {
    orgAdminA(); seedRequests();
    const { res, json } = await listGET();
    expect(res.status).toBe(200);
    const ids = json.requests.map((r: { id: string }) => r.id);
    expect(ids).toEqual(["a-1"]);
    expect(ids).not.toContain("u-1");
    expect(ids).not.toContain("b-1");
  });

  it("a tenant PATCH on an unassigned request is a uniform 404", async () => {
    orgAdminA(); seedRequests();
    const { res } = await patchPATCH("u-1", { status: "IN_REVIEW" });
    expect(res.status).toBe(404);
    expect(requests.find((r) => r.id === "u-1")!.organizationId).toBeNull();
  });
});

describe("platform assignment", () => {
  it("denies a tenant admin (403)", async () => {
    orgAdminA(); seedRequests();
    const { res } = await assignPOST("u-1", { organizationId: "org-A" });
    expect(res.status).toBe(403);
  });

  it("assigns an unassigned request to an org, scoping the write by organizationId:null", async () => {
    superadmin(); seedRequests();
    const { res, json } = await assignPOST("u-1", { organizationId: "org-A" });
    expect(res.status).toBe(200);
    expect(json.assigned).toBe(true);
    expect(capturedAssignWhere).toMatchObject({ id: "u-1", organizationId: null });
    const row = requests.find((r) => r.id === "u-1")!;
    expect(row.organizationId).toBe("org-A");
    expect(row.status).toBe("TRIAGED");
    expect(row.assignedById).toBe("root");
    // No owner policy configured in this environment.
    expect(json.deadlinePolicyStatus).toBe("CONFIGURATION_REQUIRED");
  });

  it("cannot re-assign an already-assigned request (404, untouched)", async () => {
    superadmin(); seedRequests();
    const { res } = await assignPOST("a-1", { organizationId: "org-B" });
    expect(res.status).toBe(404);
    expect(requests.find((r) => r.id === "a-1")!.organizationId).toBe("org-A");
  });

  it("rejects assignment to a non-existent organization (404 ORG_NOT_FOUND)", async () => {
    superadmin(); seedRequests();
    const { res, json } = await assignPOST("u-1", { organizationId: "org-GHOST" });
    expect(res.status).toBe(404);
    expect(json.code).toBe("ORG_NOT_FOUND");
    expect(requests.find((r) => r.id === "u-1")!.organizationId).toBeNull();
  });

  it("requires an organizationId (400)", async () => {
    superadmin(); seedRequests();
    const { res } = await assignPOST("u-1", {});
    expect(res.status).toBe(400);
  });

  it("audits the assignment with closed-enum values only — no free text", async () => {
    superadmin(); seedRequests();
    await assignPOST("u-1", { organizationId: "org-A" });
    expect(auditCalls).toHaveLength(1);
    const ev = auditCalls[0];
    expect(ev.action).toBe("compliance.privacy_request.assigned");
    expect(ev.organizationId).toBe("org-A");
    expect(ev.entityId).toBe("u-1");
    const serialised = JSON.stringify(ev);
    expect(serialised).not.toContain("PUBLIC SECRET");
    expect(serialised).not.toContain("who@example.com");
  });
});
