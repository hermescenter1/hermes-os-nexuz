import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { assignableRoles, requirePermission } from "@/lib/org/rbac";

/**
 * PHASE 91 — LEAST_PRIVILEGE + STALE_INVITE_PREVENTION.
 *
 * assignableRoles never lets an actor grant a role above their own, and a
 * VIEWER cannot change roles at all. Organization-invitation acceptance claims
 * the invite atomically, so a replayed accept is rejected as no-longer-pending.
 */

describe("Phase 91 — least privilege on role assignment", () => {
  it("ADMIN cannot assign OWNER", () => {
    expect(assignableRoles("ADMIN")).not.toContain("OWNER");
  });

  it("a non-OWNER assignable set never contains OWNER", () => {
    for (const role of ["ADMIN", "MANAGER", "ENGINEER", "VIEWER"] as const) {
      expect(assignableRoles(role)).not.toContain("OWNER");
    }
  });

  it("VIEWER has no change_role permission", () => {
    expect(requirePermission("VIEWER", "change_role").ok).toBe(false);
  });

  it("OWNER can change roles", () => {
    expect(requirePermission("OWNER", "change_role").ok).toBe(true);
  });
});

describe("Phase 91 — organization invitation single-use (atomic claim)", () => {
  let claims = 0;

  function fakeDb() {
    return {
      organizationInvitation: {
        // Both concurrent accepts read a still-PENDING invite...
        findFirst: async () => ({
          id: "inv1", token: "tok", status: "PENDING",
          expiresAt: new Date(Date.now() + 3600_000),
          email: "invitee@x", organizationId: "org1", role: "ENGINEER", invitedById: null,
        }),
        // ...but only the first conditional PENDING→ACCEPTED update matches.
        updateMany: async () => { claims += 1; return { count: claims === 1 ? 1 : 0 }; },
        update: async () => ({}),
      },
      organizationMember: {
        findFirst: async () => null,   // not yet a member
        create:    async () => ({ id: "m1", organizationId: "org1", userId: "u1", role: "ENGINEER", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() }),
      },
    };
  }

  beforeEach(() => {
    claims = 0;
    vi.resetModules();
    vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => fakeDb() }));
  });
  afterEach(() => { vi.doUnmock("@/lib/db/prisma"); vi.restoreAllMocks(); });

  it("first accept succeeds; a replayed accept is rejected as no-longer-pending", async () => {
    const { acceptInvitation } = await import("@/lib/org/invitations");
    const first = await acceptInvitation("tok", "invitee@x", "u1");
    const second = await acceptInvitation("tok", "invitee@x", "u1");
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.ok === false && second.error).toMatch(/no longer pending/i);
  });

  it("email mismatch is rejected before any claim", async () => {
    const { acceptInvitation } = await import("@/lib/org/invitations");
    const res = await acceptInvitation("tok", "attacker@evil", "u1");
    expect(res.ok).toBe(false);
  });
});
