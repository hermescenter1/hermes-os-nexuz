/**
 * Who may open the customer pages — resolved server-side from the session.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  identity: { userId: "u-1", sessionId: "s-1" } as unknown,
  active: null as unknown,
  memberships: [{ organizationId: "org-a", name: "A" }, { organizationId: "org-b", name: "B" }],
  membershipCalls: 0,
}));

vi.mock("@/lib/erp/active-organization", () => ({
  currentSessionIdentity: async () => h.identity,
  resolveActiveOrganization: async () => h.active,
}));
vi.mock("@/lib/erp/tenant", () => ({
  listErpMemberships: async () => {
    h.membershipCalls += 1;
    return h.memberships;
  },
}));

import { resolveCustomerPageScope } from "../page-scope";

const member = (role: string) => ({ ok: true, scope: { organizationId: "org-a", userId: "u-1", role, memberId: "m-1" } });
const refused = (status: number, code: string) => ({ ok: false, error: { status, code } });

beforeEach(() => {
  h.identity = { userId: "u-1", sessionId: "s-1" };
  h.active = member("MANAGER");
  h.membershipCalls = 0;
});

describe("resolveCustomerPageScope", () => {
  it("refuses without a session, before anything else", async () => {
    h.identity = null;
    expect(await resolveCustomerPageScope()).toEqual({ ok: false, code: "AUTHENTICATION_REQUIRED", memberships: [] });
  });

  it("offers the organization chooser only when several organizations need a choice", async () => {
    h.active = refused(428, "ACTIVE_ORGANIZATION_REQUIRED");
    const r = await resolveCustomerPageScope();
    expect(r).toMatchObject({ ok: false, code: "ACTIVE_ORGANIZATION_REQUIRED" });
    expect(!r.ok && r.memberships).toHaveLength(2);

    h.active = refused(404, "NOT_FOUND");
    h.membershipCalls = 0;
    expect(await resolveCustomerPageScope()).toEqual({ ok: false, code: "NOT_FOUND", memberships: [] });
    expect(h.membershipCalls).toBe(0);
  });

  it("refuses a member whose role may not see customers", async () => {
    for (const role of ["ENGINEER", "VIEWER", "MEMBER", "BILLING_ADMIN", "CUSTOMER_SUCCESS_MANAGER"]) {
      h.active = member(role);
      expect(await resolveCustomerPageScope(), role).toEqual({ ok: false, code: "FORBIDDEN", memberships: [] });
    }
  });

  it("states what each admitted role may do, taken from the grant table", async () => {
    h.active = member("MANAGER");
    expect(await resolveCustomerPageScope()).toMatchObject({
      ok: true,
      scope: { organizationId: "org-a", canManage: true, canViewProjects: false, canLinkProjects: false },
    });
    h.active = member("ADMIN");
    expect(await resolveCustomerPageScope()).toMatchObject({
      ok: true,
      scope: { canManage: true, canViewProjects: true, canLinkProjects: true },
    });
  });

  it("takes the organization from the server-resolved membership only", async () => {
    h.active = { ok: true, scope: { organizationId: "org-from-session", userId: "u-1", role: "OWNER", memberId: "m" } };
    const r = await resolveCustomerPageScope();
    expect(r.ok && r.scope.organizationId).toBe("org-from-session");
  });
});
