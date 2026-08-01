import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * PHASE 91 — PRIVILEGED_OPERATION_AUDIT proof.
 *
 * Role/status/remove mutations must emit an audit event that carries the actor,
 * the target, the organization (top-level column, not just metadata), an outcome,
 * and the request correlation id. Suspension/removal must also revoke the target's
 * sessions.
 */

const captured: Record<string, unknown>[] = [];

function memberRow() {
  return {
    id: "m1", organizationId: "org1", userId: "target-u", role: "ENGINEER", status: "ACTIVE",
    departmentId: null, invitedById: null, joinedAt: null,
    createdAt: new Date("2026-07-01"), updatedAt: new Date("2026-07-01"),
    user: { id: "target-u", name: "Target", email: "target@x" },
  };
}

let refreshUpdateManyCalls: Record<string, unknown>[] = [];

function fakeDb() {
  const row = memberRow();
  return {
    organizationMember: {
      findUnique: async () => row,
      findFirst:  async () => row,
      update:     async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data, user: row.user }),
      delete:     async () => ({}),
      count:      async () => 2,
    },
    refreshToken: {
      updateMany: async (a: Record<string, unknown>) => { refreshUpdateManyCalls.push(a); return { count: 1 }; },
    },
    // revokeAllSessions bumps User.tokenVersion before the bulk revoke.
    user: {
      update: async () => ({}),
    },
  };
}

beforeEach(() => {
  captured.length = 0;
  refreshUpdateManyCalls = [];
  vi.resetModules();
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => fakeDb() }));
  vi.doMock("@/lib/audit/audit-service", async (orig) => {
    const actual = await orig<typeof import("@/lib/audit/audit-service")>();
    return { ...actual, recordAuditEvent: async (e: Record<string, unknown>) => { captured.push(e); } };
  });
});

afterEach(() => {
  vi.doUnmock("@/lib/db/prisma");
  vi.doUnmock("@/lib/audit/audit-service");
  vi.restoreAllMocks();
});

describe("Phase 91 — role/status/remove audit carries correlated columns", () => {
  it("changeMemberRole emits actor + target + org + outcome + correlationId", async () => {
    const { changeMemberRole } = await import("@/lib/org/members");
    const out = await changeMemberRole({
      organizationId: "org1", memberId: "m1", newRole: "VIEWER",
      actorUserId: "actor-u", correlationId: "corr-123",
    });
    expect(out.ok).toBe(true);
    expect(captured).toHaveLength(1);
    const e = captured[0];
    expect(e.action).toBe("org.member.role_changed");
    expect(e.userId).toBe("actor-u");           // actor
    expect(e.entityId).toBe("m1");              // target membership
    expect(e.organizationId).toBe("org1");      // top-level tenant column
    expect(e.outcome).toBe("success");
    expect(e.correlationId).toBe("corr-123");
    expect((e.metadata as Record<string, unknown>).targetUserId).toBe("target-u");
  });

  it("changeMemberStatus(SUSPENDED) audits AND revokes the target's sessions", async () => {
    const { changeMemberStatus } = await import("@/lib/org/members");
    const out = await changeMemberStatus({
      organizationId: "org1", memberId: "m1", newStatus: "SUSPENDED",
      actorUserId: "actor-u", correlationId: "corr-999",
    });
    expect(out.ok).toBe(true);
    expect(captured[0].organizationId).toBe("org1");
    expect(captured[0].correlationId).toBe("corr-999");
    // target's sessions revoked
    expect(refreshUpdateManyCalls.length).toBeGreaterThanOrEqual(1);
    const where = refreshUpdateManyCalls[0].where as Record<string, unknown>;
    expect(where.userId).toBe("target-u");
  });

  it("removeMember audits with correlated columns and revokes sessions", async () => {
    const { removeMember } = await import("@/lib/org/members");
    const out = await removeMember({
      organizationId: "org1", memberId: "m1", actorUserId: "actor-u", correlationId: "corr-777",
    });
    expect(out.ok).toBe(true);
    expect(captured[0].organizationId).toBe("org1");
    expect(captured[0].outcome).toBe("success");
    expect(captured[0].correlationId).toBe("corr-777");
    expect(refreshUpdateManyCalls.length).toBeGreaterThanOrEqual(1);
  });
});
