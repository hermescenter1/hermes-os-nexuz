import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * PHASE 90-93A — organization invitation listing.
 *
 * The list exposes invitee email addresses and the role each was offered — a
 * roster of pending hires and privilege intent. Membership alone used to be
 * enough, so any VIEWER could enumerate it. It now requires the SAME existing
 * permission that governs creating an invitation (`invite_member` =
 * OWNER/ADMIN/MANAGER); no new permission was invented.
 */

const h = vi.hoisted(() => ({
  /** What requireOrgActor resolves to for the request under test. */
  actor: null as null | { userId: string; orgId: string; role: string; status: string; memberId: string },
  /** Error branch when the caller is not a member of the named org. */
  actorError: null as null | { error: string; status: number },
  listCalls: [] as string[],
  logged: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/org/context", () => ({
  requireOrgActor: async (_req: unknown, orgId: string) => {
    if (h.actorError) return h.actorError;
    if (!h.actor || h.actor.orgId !== orgId) {
      return { error: "Not a member of this organization", status: 403 };
    }
    return { ctx: h.actor };
  },
}));

vi.mock("@/lib/org/invitations", () => ({
  listInvitations: async (orgId: string) => {
    h.listCalls.push(orgId);
    return [
      { id: "inv-1", email: "pending.hire@example.com", role: "ADMIN", status: "PENDING" },
    ];
  },
  inviteMember: async () => ({ ok: true, invitation: { id: "inv-2" } }),
}));

vi.mock("@/lib/logger/security-events", () => ({
  logAuthzDenial: (ctx: Record<string, unknown>) => { h.logged.push(ctx); },
  logAuthFailure: (ctx: Record<string, unknown>) => { h.logged.push(ctx); },
  logInfraFailure: () => undefined,
}));

const ORG = "org-alpha";
const req = () => new NextRequest(`http://t/api/organizations/${ORG}/invitations`);
const params = { params: Promise.resolve({ orgId: ORG }) };

function actorWithRole(role: string) {
  h.actor = { userId: "u-1", orgId: ORG, role, status: "ACTIVE", memberId: "m-1" };
}

beforeEach(() => {
  h.actor = null;
  h.actorError = null;
  h.listCalls = [];
  h.logged = [];
  vi.resetModules();
});

afterEach(() => vi.restoreAllMocks());

describe("90-93A — who may list organization invitations", () => {
  it.each(["OWNER", "ADMIN", "MANAGER"])("%s (authorized) receives the list", async (role) => {
    actorWithRole(role);
    const { GET } = await import("../[orgId]/invitations/route");
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    expect((await res.json()).invitations).toHaveLength(1);
    expect(h.listCalls, "scoped to the caller's org").toEqual([ORG]);
  });

  it.each(["VIEWER", "ENGINEER", "BILLING_ADMIN"])(
    "%s is denied and never reaches the invitation store",
    async (role) => {
      actorWithRole(role);
      const { GET } = await import("../[orgId]/invitations/route");
      const res = await GET(req(), params);

      expect(res.status).toBe(403);
      expect(h.listCalls, "no repository read on the denied path").toEqual([]);
      const body = await res.json();
      expect(JSON.stringify(body)).not.toContain("pending.hire@example.com");
    },
  );

  it("a non-member is denied before any permission check", async () => {
    h.actor = null; // requireOrgActor returns the 403 branch
    const { GET } = await import("../[orgId]/invitations/route");
    const res = await GET(req(), params);
    expect(res.status).toBe(403);
    expect(h.listCalls).toEqual([]);
  });

  it("an inactive (suspended) member is denied by the org actor gate", async () => {
    h.actorError = { error: "Your membership is suspended", status: 403 };
    const { GET } = await import("../[orgId]/invitations/route");
    expect((await GET(req(), params)).status).toBe(403);
    expect(h.listCalls).toEqual([]);
  });

  it("cross-organization access is denied even for an OWNER of another org", async () => {
    h.actor = { userId: "u-1", orgId: "org-beta", role: "OWNER", status: "ACTIVE", memberId: "m-9" };
    const { GET } = await import("../[orgId]/invitations/route");
    const res = await GET(req(), params); // asks for org-alpha
    expect(res.status).toBe(403);
    expect(h.listCalls, "never reads the other tenant's invitations").toEqual([]);
  });
});

describe("90-93A — the denial log describes the attempt, not the data", () => {
  it("emits a structured denial carrying operation, role and org only", async () => {
    actorWithRole("VIEWER");
    const { GET } = await import("../[orgId]/invitations/route");
    await GET(req(), params);

    expect(h.logged).toHaveLength(1);
    const entry = h.logged[0];
    expect(entry.operation).toBe("org.invitations.list");
    expect(entry.reason).toBe("insufficient_permission");
    expect(entry.role).toBe("VIEWER");
    expect(entry.orgId).toBe(ORG);
    expect(entry.userId).toBe("u-1");
  });

  it("never logs an invitee address, a token, or how many invitations exist", async () => {
    actorWithRole("VIEWER");
    const { GET } = await import("../[orgId]/invitations/route");
    await GET(req(), params);

    const raw = JSON.stringify(h.logged);
    for (const secret of ["pending.hire@example.com", "inv-1", "token", "PENDING"]) {
      expect(raw, `${secret} must not be logged`).not.toContain(secret);
    }
    expect(raw).not.toMatch(/count|total|\binvitations\b\s*:/i);
  });

  it("an authorized request logs no denial at all", async () => {
    actorWithRole("ADMIN");
    const { GET } = await import("../[orgId]/invitations/route");
    await GET(req(), params);
    expect(h.logged).toEqual([]);
  });
});
