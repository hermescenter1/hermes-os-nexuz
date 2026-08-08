/**
 * SECURITY (Phase 97 Part A) — processing-activity tenant isolation.
 *
 * Invariants proven here against the REAL authorization helper and the REAL
 * tenant-scoped db layer through a synthetic Prisma:
 *   CROSS_TENANT_PROCESSING_ACTIVITY_READ=0
 *   CROSS_TENANT_PROCESSING_ACTIVITY_MUTATION=0
 *   CLIENT_SUPPLIED_ORG_SCOPE_ACCEPTED=0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";

type Member = { userId: string; organizationId: string; role: string; status: string };
type Row = Record<string, unknown> & { id: string; organizationId: string | null };

let payload: { sub: string; role: string; sid?: string } | null = null;
let sessionActive = true;
let members: Member[] = [];
let activities: Row[] = [];
let capturedCreateData: Record<string, unknown> | null = null;
let capturedUpdateWhere: Record<string, unknown> | null = null;
const auditCalls: Array<Record<string, unknown>> = [];

let idSeq = 0;

function makeDb() {
  return {
    organizationMember: {
      findMany: async ({ where }: { where: { userId: string; status: string } }) =>
        members
          .filter((m) => m.userId === where.userId && m.status === where.status)
          .map((m) => ({ organizationId: m.organizationId, role: m.role })),
    },
    processingActivity: {
      findMany: async ({ where }: { where: { organizationId: string } }) =>
        activities.filter((a) => a.organizationId === where.organizationId),
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        activities.find((a) => a.id === where.id && a.organizationId === where.organizationId) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        capturedCreateData = data;
        const row = { ...data, id: (data.id as string) ?? `gen-${++idSeq}` } as Row;
        activities.push(row);
        return row;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        capturedUpdateWhere = where;
        const matched = activities.filter(
          (a) => a.id === where.id && a.organizationId === where.organizationId,
        );
        matched.forEach((a) => Object.assign(a, data));
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
  activities = [];
  capturedCreateData = null;
  capturedUpdateWhere = null;
  auditCalls.length = 0;

  vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => payload }));
  vi.doMock("@/lib/auth/session-store", () => ({ isPayloadSessionActive: async () => sessionActive }));
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => makeDb() }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async (e: Record<string, unknown>) => { auditCalls.push(e); },
    COMPLIANCE_AUDIT: {
      PROCESSING_ACTIVITY_CREATED: "compliance.processing_activity.created",
      PROCESSING_ACTIVITY_UPDATED: "compliance.processing_activity.updated",
    },
  }));
  vi.doMock("@/lib/logger/security-events", () => ({
    logAuthFailure: () => {},
    logAuthzDenial: () => {},
    logInfraFailure: () => {},
  }));
});

afterEach(() => {
  for (const m of MOCKED) vi.doUnmock(m);
  vi.restoreAllMocks();
});

function req(path: string, method: string, body?: unknown, withToken = true): NextRequest {
  return new NextRequest(`http://localhost/api/compliance/processing-activities${path}`, {
    method,
    headers: {
      ...(withToken ? { cookie: `${ACCESS_TOKEN_COOKIE}=fake-token` } : {}),
      "content-type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function GET_list(withToken = true) {
  const { GET } = await import("../route");
  const res = await GET(req("", "GET", undefined, withToken));
  return { res, json: await res.json() };
}
async function POST_create(body: unknown, withToken = true) {
  const { POST } = await import("../route");
  const res = await POST(req("", "POST", body, withToken));
  return { res, json: await res.json() };
}
async function GET_one(id: string) {
  const { GET } = await import("../[id]/route");
  const res = await GET(req(`/${id}`, "GET"), { params: Promise.resolve({ id }) });
  return { res, json: await res.json() };
}
async function PATCH_one(id: string, body: unknown) {
  const { PATCH } = await import("../[id]/route");
  const res = await PATCH(req(`/${id}`, "PATCH", body), { params: Promise.resolve({ id }) });
  return { res, json: await res.json() };
}

function seedOrgAdmin() {
  payload = { sub: "admin-A", role: "admin", sid: "s1" };
  members = [{ userId: "admin-A", organizationId: "org-A", role: "ADMIN", status: "ACTIVE" }];
  activities = [
    { id: "act-A", organizationId: "org-A", name: "SECRET ACTIVITY NAME", purpose: "SECRET PURPOSE", status: "DRAFT", approvalState: "PENDING_REVIEW", legalBasisStatus: "LEGAL_REVIEW_REQUIRED", riskClassification: "REVIEW_REQUIRED" },
    { id: "act-B", organizationId: "org-B", name: "OTHER TENANT ACTIVITY", purpose: "OTHER", status: "DRAFT", approvalState: "PENDING_REVIEW", legalBasisStatus: "LEGAL_REVIEW_REQUIRED", riskClassification: "REVIEW_REQUIRED" },
  ];
}

describe("processing-activities — auth & permission", () => {
  it("denies an unauthenticated caller (401)", async () => {
    const { res } = await GET_list(false);
    expect(res.status).toBe(401);
  });

  it("denies a revoked session (401)", async () => {
    seedOrgAdmin();
    sessionActive = false;
    const { res } = await GET_list();
    expect(res.status).toBe(401);
  });

  it("denies a VIEWER without view_compliance (403)", async () => {
    payload = { sub: "v", role: "customer", sid: "s1" };
    members = [{ userId: "v", organizationId: "org-A", role: "VIEWER", status: "ACTIVE" }];
    const { res, json } = await GET_list();
    expect(res.status).toBe(403);
    expect(json.code).toBe("INSUFFICIENT_PERMISSION");
  });

  it("a MANAGER may read but may NOT create (manage is OWNER/ADMIN)", async () => {
    payload = { sub: "m", role: "admin", sid: "s1" };
    members = [{ userId: "m", organizationId: "org-A", role: "MANAGER", status: "ACTIVE" }];
    const read = await GET_list();
    expect(read.res.status).toBe(200);
    const write = await POST_create({ name: "X", purpose: "Y" });
    expect(write.res.status).toBe(403);
  });

  it("fails closed to 409 for a multi-org actor", async () => {
    payload = { sub: "multi", role: "admin", sid: "s1" };
    members = [
      { userId: "multi", organizationId: "org-A", role: "ADMIN", status: "ACTIVE" },
      { userId: "multi", organizationId: "org-C", role: "ADMIN", status: "ACTIVE" },
    ];
    const { res, json } = await GET_list();
    expect(res.status).toBe(409);
    expect(json.code).toBe("ACTIVE_ORGANIZATION_REQUIRED");
  });
});

describe("processing-activities — tenant isolation (READ)", () => {
  it("list returns ONLY the caller's org rows", async () => {
    seedOrgAdmin();
    const { res, json } = await GET_list();
    expect(res.status).toBe(200);
    const ids = (json.activities as Array<{ id: string }>).map((a) => a.id);
    expect(ids).toEqual(["act-A"]);
    expect(ids).not.toContain("act-B");
  });

  it("cannot GET another tenant's activity by id (404, no oracle)", async () => {
    seedOrgAdmin();
    const { res, json } = await GET_one("act-B");
    expect(res.status).toBe(404);
    expect(json.code).toBe("NOT_FOUND");
  });
});

describe("processing-activities — tenant isolation (MUTATION)", () => {
  it("cannot PATCH another tenant's activity (404, untouched)", async () => {
    seedOrgAdmin();
    const { res } = await PATCH_one("act-B", { status: "ACTIVE" });
    expect(res.status).toBe(404);
    expect(activities.find((a) => a.id === "act-B")!.status).toBe("DRAFT");
  });

  it("a same-org PATCH scopes the DB write by the authoritative org id", async () => {
    seedOrgAdmin();
    const { res } = await PATCH_one("act-A", { status: "ACTIVE" });
    expect(res.status).toBe(200);
    expect(capturedUpdateWhere).toMatchObject({ id: "act-A", organizationId: "org-A" });
    expect(activities.find((a) => a.id === "act-A")!.status).toBe("ACTIVE");
  });
});

describe("processing-activities — client-supplied scope is never accepted", () => {
  it("CREATE rejects a body carrying organizationId (strict schema → 400)", async () => {
    seedOrgAdmin();
    const { res } = await POST_create({ name: "X", purpose: "Y", organizationId: "org-B" });
    expect(res.status).toBe(400);
    expect(capturedCreateData).toBeNull(); // never reached the DB
  });

  it("CREATE always persists the server-derived org id", async () => {
    seedOrgAdmin();
    const { res, json } = await POST_create({ name: "New RoPA", purpose: "Something" });
    expect(res.status).toBe(201);
    expect(capturedCreateData!.organizationId).toBe("org-A");
    // The new row belongs to org-A and is DRAFT / fail-closed by default.
    expect(json.activity.status).toBe("DRAFT");
    expect(json.activity.approvalState).toBe("PENDING_REVIEW");
    expect(json.activity.evidenceStatus).not.toBe("CONTROL_EVIDENCE_COMPLETE");
  });

  it("PATCH ignores a client organizationId and still writes within the caller's scope", async () => {
    seedOrgAdmin();
    // strict update schema also rejects organizationId outright.
    const { res } = await PATCH_one("act-A", { status: "ACTIVE", organizationId: "org-B" });
    expect(res.status).toBe(400);
  });
});

describe("processing-activities — audit hygiene", () => {
  it("create audit carries closed-enum classifications only — no free-text name/purpose", async () => {
    seedOrgAdmin();
    await POST_create({ name: "SUPER SECRET NAME", purpose: "SUPER SECRET PURPOSE", description: "sensitive detail" });
    expect(auditCalls).toHaveLength(1);
    const ev = auditCalls[0];
    expect(ev.action).toBe("compliance.processing_activity.created");
    expect(ev.organizationId).toBe("org-A");
    const serialised = JSON.stringify(ev);
    expect(serialised).not.toContain("SUPER SECRET NAME");
    expect(serialised).not.toContain("SUPER SECRET PURPOSE");
    expect(serialised).not.toContain("sensitive detail");
  });
});
