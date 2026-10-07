/**
 * HRIS-0.5A — server-side active organization. Real module, fake store.
 *
 * Proves: a selection is a pointer re-checked against ACTIVE membership on every
 * call; foreign / inactive / deleted organizations answer 404 and the stale
 * pointer is removed; several memberships without a selection answer 428 (the
 * first membership is never guessed); a selection bound to one session does not
 * leak into another session (session fixation); activation writes only for an
 * ACTIVE member and never for a foreign organization.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Member = { id: string; organizationId: string; userId: string; role: string; status: string };

const fake = vi.hoisted(() => ({
  members: [] as Member[],
  selections: new Map<string, { sessionId: string; userId: string; organizationId: string }>(),
  audits: [] as Array<Record<string, unknown>>,
  writes: 0,
  failNext: false,
  failAudit: false,
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => {
    if (fake.failNext) throw new Error("connect ECONNREFUSED db-internal.local:5432 password=x");
    const prisma = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        // Interactive transaction with rollback: a failure restores the selection map and the audit list.
        const selectionsBefore = new Map(fake.selections);
        const auditsBefore = fake.audits.length;
        try {
          return await fn(prisma);
        } catch (err) {
          fake.selections.clear();
          for (const [k, v] of selectionsBefore) fake.selections.set(k, v);
          fake.audits.length = auditsBefore;
          throw err;
        }
      },
      auditLog: {
        create: async (args: { data: Record<string, unknown> }) => {
          if (fake.failAudit) throw new Error("audit store unavailable");
          fake.audits.push(args.data);
          return args.data;
        },
      },
      organizationMember: {
        findMany: async (args: { where: { userId: string; status: string } }) =>
          fake.members
            .filter(m => m.userId === args.where.userId && m.status === args.where.status)
            .map(m => ({ id: m.id, organizationId: m.organizationId, role: m.role })),
        findFirst: async (args: { where: { organizationId: string; userId: string; status: string } }) => {
          const m = fake.members.find(
            x => x.organizationId === args.where.organizationId && x.userId === args.where.userId && x.status === args.where.status,
          );
          return m ? { id: m.id, organizationId: m.organizationId, role: m.role } : null;
        },
      },
      activeOrganizationSelection: {
        findUnique: async (args: { where: { sessionId: string } }) => fake.selections.get(args.where.sessionId) ?? null,
        upsert: async (args: { where: { sessionId: string }; create: { sessionId: string; userId: string; organizationId: string }; update: { userId: string; organizationId: string } }) => {
          fake.writes += 1;
          const prev = fake.selections.get(args.where.sessionId);
          const next = prev
            ? { sessionId: args.where.sessionId, ...args.update }
            : args.create;
          fake.selections.set(args.where.sessionId, next);
          return next;
        },
        deleteMany: async (args: { where: { sessionId: string } }) => {
          fake.writes += 1;
          fake.selections.delete(args.where.sessionId);
          return { count: 1 };
        },
      },
    };
    return prisma;
  },
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth/config", () => ({ ACCESS_TOKEN_COOKIE: "hermes_at" }));
vi.mock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => null }));
vi.mock("@/lib/auth/session-store", () => ({ isPayloadSessionActive: async () => true }));

import { activateOrganization, resolveActiveOrganization } from "@/lib/erp/active-organization";
import { can } from "@/lib/org/rbac";

const member = (over: Partial<Member>): Member => ({
  id: "m", organizationId: "org-A", userId: "user-1", role: "ADMIN", status: "ACTIVE", ...over,
});

beforeEach(() => {
  fake.members = [];
  fake.selections = new Map();
  fake.audits = [];
  fake.writes = 0;
  fake.failNext = false;
  fake.failAudit = false;
});

const identity = (sessionId: string | null = "sid-1", userId = "user-1") => ({ userId, sessionId });

describe("resolveActiveOrganization — deterministic resolution", () => {
  it("answers 404 when the user has no ACTIVE membership", async () => {
    fake.members = [member({ status: "SUSPENDED" })];
    const out = await resolveActiveOrganization(identity());
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.status).toBe(404);
  });

  it("resolves the only ACTIVE membership without any stored selection", async () => {
    fake.members = [member({ organizationId: "org-A", role: "OWNER" })];
    const out = await resolveActiveOrganization(identity());
    expect(out.ok && out.scope.organizationId).toBe("org-A");
    expect(out.ok && out.scope.canViewCompensation).toBe(true);
  });

  it("refuses to guess among several memberships: 428 ACTIVE_ORGANIZATION_REQUIRED", async () => {
    fake.members = [member({ id: "a", organizationId: "org-A" }), member({ id: "b", organizationId: "org-B" })];
    const out = await resolveActiveOrganization(identity());
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.status).toBe(428);
      expect(out.error.code).toBe("ACTIVE_ORGANIZATION_REQUIRED");
    }
  });

  it("honours a valid selection among several memberships", async () => {
    fake.members = [member({ id: "a", organizationId: "org-A" }), member({ id: "b", organizationId: "org-B" })];
    await activate("org-B");
    const out = await resolveActiveOrganization(identity("sid-1"));
    expect(out.ok && out.scope.organizationId).toBe("org-B");
  });

  it("a selection beyond the first 50 memberships still resolves: the selected organization is checked directly", async () => {
    fake.members = Array.from({ length: 60 }, (_, i) => member({ id: `m-${i}`, organizationId: `org-${i}` }));
    fake.selections.set("sid-1", { sessionId: "sid-1", userId: "user-1", organizationId: "org-55" });
    const out = await resolveActiveOrganization(identity("sid-1"));
    expect(out.ok && out.scope.organizationId).toBe("org-55");
    expect(fake.selections.has("sid-1")).toBe(true);
  });
});

describe("stale selections fail closed and are removed", () => {
  it("a selection for an organization the user has left answers 404 and is deleted", async () => {
    fake.members = [member({ id: "a", organizationId: "org-A" }), member({ id: "b", organizationId: "org-B" })];
    await activate("org-B");
    fake.members = fake.members.map(m => (m.organizationId === "org-B" ? { ...m, status: "SUSPENDED" } : m));
    const out = await resolveActiveOrganization(identity("sid-1"));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.status).toBe(404);
    expect(fake.selections.has("sid-1")).toBe(false);
  });

  it("a revoked membership (removed row) cannot be resolved from an old selection", async () => {
    fake.members = [member({ id: "a", organizationId: "org-A" }), member({ id: "b", organizationId: "org-B" })];
    await activate("org-B");
    fake.members = fake.members.filter(m => m.organizationId !== "org-B");
    const out = await resolveActiveOrganization(identity("sid-1"));
    expect(out.ok).toBe(false);
    expect(fake.selections.has("sid-1")).toBe(false);
  });
});

describe("session fixation: a selection belongs to one server session only", () => {
  it("a second session of the same user does not inherit the first session's selection", async () => {
    fake.members = [member({ id: "a", organizationId: "org-A" }), member({ id: "b", organizationId: "org-B" })];
    await activate("org-B");
    const other = await resolveActiveOrganization(identity("sid-2"));
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error.status).toBe(428);
  });

  it("a legacy token without a session id can never hold a selection", async () => {
    fake.members = [member({ id: "a", organizationId: "org-A" }), member({ id: "b", organizationId: "org-B" })];
    const out = await resolveActiveOrganization(identity(null));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.status).toBe(428);
  });
});

const activate = (organizationId: string, sessionId = "sid-1") =>
  activateOrganization({ userId: "user-1", sessionId, organizationId, correlationId: "corr-1" });

describe("activation (cross-tenant, membership, multi-membership)", () => {
  it("activates an organization the caller is an ACTIVE member of", async () => {
    fake.members = [member({ id: "a", organizationId: "org-A" })];
    const out = await activate("org-A");
    expect(out.ok).toBe(true);
    expect(fake.selections.get("sid-1")?.organizationId).toBe("org-A");
  });

  it("writes one audit row for the selection: it names the organization and never the session id", async () => {
    fake.members = [member({ id: "a", organizationId: "org-A" })];
    await activate("org-A");
    expect(fake.audits).toHaveLength(1);
    expect(fake.audits[0]).toMatchObject({
      userId: "user-1",
      organizationId: "org-A",
      action: "erp.active_organization.select",
      entityType: "Organization",
      entityId: "org-A",
      outcome: "SUCCESS",
      correlationId: "corr-1",
    });
    expect(JSON.stringify(fake.audits[0])).not.toContain("sid-1");
  });

  it("an audit failure rolls the selection back: nothing is persisted", async () => {
    fake.members = [member({ id: "a", organizationId: "org-A" })];
    fake.failAudit = true;
    const out = await activate("org-A");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.status).toBe(503);
    expect(fake.selections.has("sid-1")).toBe(false);
    expect(fake.audits).toHaveLength(0);
  });

  it("refuses a foreign organization with 404 and writes nothing", async () => {
    fake.members = [member({ id: "a", organizationId: "org-A" })];
    const out = await activate("org-FOREIGN");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.status).toBe(404);
    expect(fake.writes).toBe(0);
    expect(fake.audits).toHaveLength(0);
  });

  it("refuses a SUSPENDED membership with 404 and writes nothing", async () => {
    fake.members = [member({ id: "a", organizationId: "org-A", status: "SUSPENDED" })];
    const out = await activate("org-A");
    expect(out.ok).toBe(false);
    expect(fake.writes).toBe(0);
    expect(fake.audits).toHaveLength(0);
  });

  it("switching organization replaces the selection for the same session", async () => {
    fake.members = [member({ id: "a", organizationId: "org-A" }), member({ id: "b", organizationId: "org-B" })];
    await activate("org-A");
    await activate("org-B");
    expect(fake.selections.get("sid-1")?.organizationId).toBe("org-B");
    expect(fake.audits.map(a => a.organizationId)).toEqual(["org-A", "org-B"]);
  });
});

describe("database failure stays generic", () => {
  it("returns 503 without the driver message or host", async () => {
    fake.failNext = true;
    const out = await resolveActiveOrganization(identity());
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.status).toBe(503);
      expect(JSON.stringify(out.error)).not.toMatch(/ECONNREFUSED|password|db-internal/);
    }
  });
});

describe("OrgPermission matrix for ERP", () => {
  it("view_erp and manage_erp: OWNER and ADMIN only; compensation: OWNER only", () => {
    const roles = ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN", "HR_MANAGER", "RECRUITER"] as const;
    expect(roles.filter(r => can(r, "view_erp"))).toEqual(["OWNER", "ADMIN"]);
    expect(roles.filter(r => can(r, "manage_erp"))).toEqual(["OWNER", "ADMIN"]);
    expect(roles.filter(r => can(r, "view_erp_compensation"))).toEqual(["OWNER"]);
  });
});
