/**
 * /api/tenant/customers/** — the HTTP boundary.
 *
 * What is asserted: each method demands its permission for the caller's role
 * in the ACTIVE organization (resolved server-side, never from the request); a
 * cross-site write is refused before the session is read; an organizationId in
 * a body is refused as an unknown field, not silently ignored; the service is
 * always called with the server-resolved organization; failures leak nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  active: { ok: true, scope: { organizationId: "org-a", userId: "u-1", role: "MANAGER", memberId: "m-1" } } as unknown,
  activeCalls: 0,
  originOk: true,
  calls: [] as Array<{ fn: string; ctx: Record<string, unknown>; args: unknown[] }>,
  fail: null as unknown,
}));

vi.mock("@/lib/erp/active-organization", () => ({
  getActiveOrganizationContext: async () => {
    h.activeCalls += 1;
    return h.active;
  },
}));

vi.mock("@/lib/security/request-guards", async importOriginal => {
  const real = await importOriginal<typeof import("@/lib/security/request-guards")>();
  return { ...real, requireTrustedOrigin: () => ({ ok: h.originOk, reason: "x" }) };
});

vi.mock("@/lib/customers/service", async importOriginal => {
  const real = await importOriginal<typeof import("@/lib/customers/service")>();
  const record =
    (fn: string) =>
    async (ctx: Record<string, unknown>, ...args: unknown[]) => {
      h.calls.push({ fn, ctx, args });
      if (h.fail) throw h.fail;
      return { ok: true };
    };
  return {
    ...real,
    listCustomers: record("listCustomers"),
    createCustomer: record("createCustomer"),
    getCustomer: record("getCustomer"),
    updateCustomer: record("updateCustomer"),
    listInteractions: record("listInteractions"),
    addInteraction: record("addInteraction"),
    linkedProjects: record("linkedProjects"),
    setProjectLink: record("setProjectLink"),
  };
});

import * as list from "../route";
import * as one from "../[id]/route";
import * as interactions from "../[id]/interactions/route";
import * as projects from "../[id]/projects/route";
import { CustomerError } from "@/lib/customers/service";

const URL_BASE = "http://localhost:3000/api/tenant/customers";
const json = (method: string, body: unknown, path = "") =>
  new Request(`${URL_BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  }) as never;
const get = (path = "") => new Request(`${URL_BASE}${path}`) as never;
const params = (id = "p-1") => ({ params: Promise.resolve({ id }) });
const asRole = (role: string) => {
  h.active = { ok: true, scope: { organizationId: "org-a", userId: "u-1", role, memberId: "m-1" } };
};

beforeEach(() => {
  asRole("MANAGER");
  h.activeCalls = 0;
  h.originOk = true;
  h.calls = [];
  h.fail = null;
});

describe("permissions", () => {
  it("lets OWNER, ADMIN and MANAGER read and write customers", async () => {
    for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
      asRole(role);
      expect((await list.GET(get())).status, role).toBe(200);
      expect((await list.POST(json("POST", { displayName: "Co" }))).status, role).toBe(201);
    }
  });

  it("refuses every other role, for reads and for writes", async () => {
    for (const role of ["ENGINEER", "VIEWER", "MEMBER", "BILLING_ADMIN", "CUSTOMER_SUCCESS_MANAGER", "HR_MANAGER"]) {
      asRole(role);
      expect((await list.GET(get())).status, role).toBe(403);
      expect((await one.GET(get("/p-1"), params())).status, role).toBe(403);
      expect((await list.POST(json("POST", { displayName: "Co" }))).status, role).toBe(403);
      expect((await interactions.POST(json("POST", { kind: "CALL", occurredAt: "2026-10-13T08:00:00Z", summary: "x" }), params())).status, role).toBe(403);
    }
    expect(h.calls).toHaveLength(0);
  });

  it("requires ERP permission as well for project data, which MANAGER does not hold", async () => {
    asRole("MANAGER");
    expect((await projects.GET(get("/p-1/projects"), params())).status).toBe(403);
    expect((await projects.PUT(json("PUT", { projectId: "prj-1", linked: true }), params())).status).toBe(403);
    asRole("ADMIN");
    expect((await projects.GET(get("/p-1/projects"), params())).status).toBe(200);
    expect((await projects.PUT(json("PUT", { projectId: "prj-1", linked: true }), params())).status).toBe(200);
  });

  it("passes the active-organization failure through (no session, no membership)", async () => {
    const { ErpError } = await import("@/lib/erp/tenant");
    h.active = { ok: false, error: new ErpError(401, "AUTHENTICATION_REQUIRED") };
    expect((await list.GET(get())).status).toBe(401);
    h.active = { ok: false, error: new ErpError(428, "ACTIVE_ORGANIZATION_REQUIRED") };
    expect((await list.GET(get())).status).toBe(428);
  });
});

describe("the organization is never taken from the request", () => {
  it("calls the service with the SERVER-resolved organization", async () => {
    await list.POST(json("POST", { displayName: "Co" }));
    await one.PATCH(json("PATCH", { expectedVersion: 1, status: "INACTIVE" }), params());
    for (const c of h.calls) expect(c.ctx).toMatchObject({ organizationId: "org-a", userId: "u-1" });
  });

  it("refuses an organizationId in the body as an unknown field", async () => {
    const res = await list.POST(json("POST", { displayName: "Co", organizationId: "org-evil" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "VALIDATION_FAILED", problems: [{ problem: "UNKNOWN_FIELD" }] });
    expect(h.calls).toHaveLength(0);
  });

  it("refuses an organizationId in the query string too", async () => {
    expect((await list.GET(get("?organizationId=org-evil"))).status).toBe(422);
  });
});

describe("writes", () => {
  it("refuses a cross-site write before the session is read", async () => {
    h.originOk = false;
    expect((await list.POST(json("POST", { displayName: "Co" }))).status).toBe(403);
    expect((await one.PATCH(json("PATCH", { expectedVersion: 1 }), params())).status).toBe(403);
    expect(h.activeCalls).toBe(0);
  });

  it("refuses a non-JSON body", async () => {
    const req = new Request(URL_BASE, { method: "POST", headers: { "content-type": "text/plain", origin: "http://localhost:3000" }, body: "displayName=x" }) as never;
    expect((await list.POST(req)).status).toBe(415);
  });

  it("names the invalid fields without echoing the values", async () => {
    const res = await list.POST(json("POST", { displayName: "", email: "not-an-email-secret" }));
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.problems.map((p: { field: string }) => p.field)).toEqual(expect.arrayContaining(["displayName", "email"]));
    expect(JSON.stringify(body)).not.toContain("not-an-email-secret");
  });

  it("requires the version an edit was based on", async () => {
    expect((await one.PATCH(json("PATCH", { status: "INACTIVE" }), params())).status).toBe(422);
  });
});

describe("failures", () => {
  it("maps a domain error to its status and code", async () => {
    h.fail = new CustomerError("NOT_FOUND");
    expect((await one.GET(get("/p-x"), params("p-x"))).status).toBe(404);
    h.fail = new CustomerError("VERSION_CONFLICT", { currentVersion: 4 });
    const res = await one.PATCH(json("PATCH", { expectedVersion: 3, status: "INACTIVE" }), params());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "VERSION_CONFLICT", currentVersion: 4 });
  });

  it("never leaks an unexpected error", async () => {
    h.fail = new Error("password authentication failed for user postgres");
    const res = await list.GET(get());
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("password");
  });
});
