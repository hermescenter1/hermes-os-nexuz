/**
 * SECURITY (compliance hotfix) — cross-tenant PrivacyRequest mutation.
 *
 * Invariant: CROSS_TENANT_PRIVACY_REQUEST_MUTATION=0
 *
 * These tests drive the REAL authorization helper and the REAL tenant-scoped db
 * layer through a synthetic Prisma, so they prove the actual query predicate —
 * not a re-implementation — carries the authoritative organization id.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";

type Member = { userId: string; organizationId: string; role: string; status: string };
type PrivacyRow = { id: string; organizationId: string | null; status: string; description: string | null; email: string };

let payload: { sub: string; role: string; sid?: string } | null = null;
let sessionActive = true;
let members: Member[] = [];
let requests: PrivacyRow[] = [];
let capturedUpdateWhere: Record<string, unknown> | null = null;
const auditCalls: Array<Record<string, unknown>> = [];
const logCalls: Array<Record<string, unknown>> = [];

function makeDb() {
  return {
    organizationMember: {
      findMany: async ({ where }: { where: { userId: string; status: string } }) =>
        members
          .filter((m) => m.userId === where.userId && m.status === where.status)
          .map((m) => ({ organizationId: m.organizationId, role: m.role })),
    },
    privacyRequest: {
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        requests.find((r) => r.id === where.id && r.organizationId === where.organizationId) ?? null,
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        capturedUpdateWhere = where;
        const matched = requests.filter(
          (r) => r.id === where.id && r.organizationId === where.organizationId,
        );
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
  capturedUpdateWhere = null;
  auditCalls.length = 0;
  logCalls.length = 0;

  vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => payload }));
  vi.doMock("@/lib/auth/session-store", () => ({ isPayloadSessionActive: async () => sessionActive }));
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => makeDb() }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async (e: Record<string, unknown>) => { auditCalls.push(e); },
    COMPLIANCE_AUDIT: { PRIVACY_REQUEST_STATUS_CHANGED: "compliance.privacy_request.status_changed" },
  }));
  vi.doMock("@/lib/logger/security-events", () => ({
    logAuthFailure: (c: Record<string, unknown>) => logCalls.push(c),
    logAuthzDenial: (c: Record<string, unknown>) => logCalls.push(c),
    logInfraFailure: () => {},
  }));
});

afterEach(() => {
  for (const m of MOCKED) vi.doUnmock(m);
  vi.restoreAllMocks();
});

function patchReq(id: string, body: unknown, withToken = true): [NextRequest, { params: Promise<{ id: string }> }] {
  const req = new NextRequest(`http://localhost/api/compliance/privacy-requests/${id}`, {
    method: "PATCH",
    headers: {
      ...(withToken ? { cookie: `${ACCESS_TOKEN_COOKIE}=fake-token` } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return [req, { params: Promise.resolve({ id }) }];
}

async function runPatch(id: string, body: unknown, withToken = true) {
  const { PATCH } = await import("../[id]/route");
  const [req, ctx] = patchReq(id, body, withToken);
  const res = await PATCH(req, ctx);
  return { res, json: await res.json() };
}

function seedOrgAdmin() {
  payload = { sub: "admin-A", role: "admin", sid: "s1" };
  members = [{ userId: "admin-A", organizationId: "org-A", role: "ADMIN", status: "ACTIVE" }];
  // req-A starts IN_REVIEW so the Phase 97 state machine permits IN_REVIEW→APPROVED
  // and IN_REVIEW→REJECTED (the transitions these tenant-scope tests exercise).
  requests = [
    { id: "req-A", organizationId: "org-A", status: "IN_REVIEW", description: "SUPER SECRET DESCRIPTION", email: "subject@example.com" },
    { id: "req-B", organizationId: "org-B", status: "PENDING", description: "OTHER TENANT DATA", email: "other@example.com" },
  ];
}

describe("PATCH privacy-requests/[id] — authentication & permission", () => {
  it("denies an unauthenticated request (401)", async () => {
    payload = null;
    const { res } = await runPatch("req-A", { status: "COMPLETED" }, false);
    expect(res.status).toBe(401);
  });

  it("denies a revoked session (401)", async () => {
    seedOrgAdmin();
    sessionActive = false;
    const { res } = await runPatch("req-A", { status: "COMPLETED" });
    expect(res.status).toBe(401);
  });

  it("denies an ordinary member without the permission (403)", async () => {
    payload = { sub: "viewer-A", role: "customer", sid: "s1" };
    members = [{ userId: "viewer-A", organizationId: "org-A", role: "VIEWER", status: "ACTIVE" }];
    requests = [{ id: "req-A", organizationId: "org-A", status: "PENDING", description: null, email: "s@example.com" }];
    const { res, json } = await runPatch("req-A", { status: "COMPLETED" });
    expect(res.status).toBe(403);
    expect(json.code).toBe("INSUFFICIENT_PERMISSION");
  });

  it("denies an org MANAGER (lacks manage_privacy_requests) (403)", async () => {
    payload = { sub: "mgr-A", role: "admin", sid: "s1" };
    members = [{ userId: "mgr-A", organizationId: "org-A", role: "MANAGER", status: "ACTIVE" }];
    requests = [{ id: "req-A", organizationId: "org-A", status: "IN_REVIEW", description: null, email: "s@example.com" }];
    const { res } = await runPatch("req-A", { status: "APPROVED" });
    expect(res.status).toBe(403);
  });

  it("fails closed to 409 when the actor has more than one active org", async () => {
    payload = { sub: "admin-multi", role: "admin", sid: "s1" };
    members = [
      { userId: "admin-multi", organizationId: "org-A", role: "ADMIN", status: "ACTIVE" },
      { userId: "admin-multi", organizationId: "org-C", role: "ADMIN", status: "ACTIVE" },
    ];
    requests = [{ id: "req-A", organizationId: "org-A", status: "PENDING", description: null, email: "s@example.com" }];
    const { res, json } = await runPatch("req-A", { status: "COMPLETED" });
    expect(res.status).toBe(409);
    expect(json.code).toBe("ACTIVE_ORGANIZATION_REQUIRED");
  });
});

describe("PATCH privacy-requests/[id] — tenant isolation", () => {
  it("an Organisation A admin CANNOT mutate an Organisation B request (404, no oracle)", async () => {
    seedOrgAdmin();
    const { res, json } = await runPatch("req-B", { status: "COMPLETED" });
    expect(res.status).toBe(404);
    expect(json.code).toBe("NOT_FOUND");
    // The foreign row is untouched.
    expect(requests.find((r) => r.id === "req-B")!.status).toBe("PENDING");
  });

  it("a random UUID does not disclose existence (404)", async () => {
    seedOrgAdmin();
    const { res } = await runPatch("00000000-0000-0000-0000-000000000000", { status: "COMPLETED" });
    expect(res.status).toBe(404);
  });

  it("a client-supplied organizationId cannot widen scope to a foreign request", async () => {
    seedOrgAdmin();
    const { res } = await runPatch("req-B", { status: "COMPLETED", organizationId: "org-B" } as unknown);
    expect(res.status).toBe(404);
    expect(requests.find((r) => r.id === "req-B")!.status).toBe("PENDING");
  });
});

describe("PATCH privacy-requests/[id] — authorised mutation", () => {
  it("succeeds for a same-organisation authorised admin and scopes the DB write by org", async () => {
    seedOrgAdmin();
    const { res, json } = await runPatch("req-A", { status: "APPROVED", responseNote: "internal note free text" });
    expect(res.status).toBe(200);
    expect(json.request.status).toBe("APPROVED");
    // The database mutation predicate carries BOTH id and the authoritative org id.
    expect(capturedUpdateWhere).toMatchObject({ id: "req-A", organizationId: "org-A" });
  });

  it("rejects a transition the state machine does not allow (409, untouched)", async () => {
    seedOrgAdmin();
    // IN_REVIEW → COMPLETED is not a permitted single transition.
    const { res, json } = await runPatch("req-A", { status: "COMPLETED" });
    expect(res.status).toBe(409);
    expect(json.code).toBe("INVALID_TRANSITION");
    expect(requests.find((r) => r.id === "req-A")!.status).toBe("IN_REVIEW");
  });

  it("audits with allow-listed identifiers + a safe note-updated boolean — no request free text", async () => {
    seedOrgAdmin();
    await runPatch("req-A", { status: "REJECTED", responseNote: "internal note free text" });
    expect(auditCalls).toHaveLength(1);
    const event = auditCalls[0];
    expect(event.action).toBe("compliance.privacy_request.status_changed");
    expect(event.organizationId).toBe("org-A");
    expect(event.entityId).toBe("req-A");
    const meta = event.metadata as Record<string, unknown>;
    expect(Object.keys(meta).sort()).toEqual(["newStatus", "previousStatus", "responseNoteUpdated"]);
    expect(meta.responseNoteUpdated).toBe(true); // a note WAS provided (boolean only)
    const serialised = JSON.stringify(event);
    expect(serialised).not.toContain("SUPER SECRET DESCRIPTION");
    expect(serialised).not.toContain("internal note free text");
    expect(serialised).not.toContain("subject@example.com");
  });

  it("records responseNoteUpdated=false when no note is supplied", async () => {
    seedOrgAdmin();
    await runPatch("req-A", { status: "APPROVED" });
    const meta = auditCalls[0].metadata as Record<string, unknown>;
    expect(meta.responseNoteUpdated).toBe(false);
  });

  it("never logs raw JWT, cookie, email, IP or user agent on denial", async () => {
    seedOrgAdmin();
    await runPatch("req-B", { status: "COMPLETED" }); // foreign → denied path may log
    const serialised = JSON.stringify(logCalls);
    expect(serialised).not.toContain("fake-token");
    expect(serialised).not.toContain("subject@example.com");
    expect(serialised).not.toContain("other@example.com");
    for (const call of logCalls) {
      expect(call).not.toHaveProperty("email");
      expect(call).not.toHaveProperty("ip");
      expect(call).not.toHaveProperty("ipAddress");
      expect(call).not.toHaveProperty("userAgent");
      expect(call).not.toHaveProperty("token");
    }
  });
});
