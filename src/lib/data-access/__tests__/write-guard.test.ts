/**
 * PHASE 110-A2.3 (F1 + F2) — the five CMMS write endpoints, authorized.
 *
 * WHAT THIS PINS, AND WHY IT IS DRIVEN THROUGH THE REAL HANDLERS
 * The defect was not in a helper; it was that no handler called one. A unit test
 * of `requireWriteScope` would have passed on the broken tree, because the
 * helper was never the problem. So every case below imports the real route
 * module and calls its exported `POST` or `PATCH`.
 *
 * WHAT IS REPLACED, AND WHAT THAT COSTS
 *   `getCurrentUser`   so a case can choose the caller's PLATFORM role
 *   `resolveTenantDecisionFromSession` so a case can choose the ORGANIZATION
 *                      and the caller's role in it, without a session store
 *   `requireDatabase`  so a case can observe whether the write was REACHED
 *
 * Everything between them is the real source: the platform check, the real
 * `requireWriteScope`, the real `checkTenantPrecondition`, the real
 * `@/lib/org/rbac` matrix, the real Zod schemas and the real refusal mapping.
 *
 * The cost is stated rather than hidden: with the database replaced, "the write
 * was reached" means the handler called the data layer, not that a row exists.
 * Rows in PostgreSQL are the operational rehearsal's job, not this file's.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_ALPHA = "org_alpha";
const ORG_BETA = "org_beta";
const HEADER = "x-hermes-organization";

/** Every write endpoint in this slice, with a body its own schema accepts. */
const ENDPOINTS = [
  { name: "POST /api/cmms/tasks", module: "@/app/api/cmms/tasks/route", method: "POST", body: { title: "t" } },
  { name: "POST /api/cmms/plans", module: "@/app/api/cmms/plans/route", method: "POST", body: { name: "p" } },
  { name: "POST /api/cmms/failures", module: "@/app/api/cmms/failures/route", method: "POST", body: { title: "f", description: "d", occurredAt: "2026-01-01T00:00:00.000Z" } },
  { name: "POST /api/cmms/downtime", module: "@/app/api/cmms/downtime/route", method: "POST", body: { startedAt: "2026-01-01T00:00:00.000Z" } },
  { name: "PATCH /api/cmms/tasks/[id]", module: "@/app/api/cmms/tasks/[id]/route", method: "PATCH", body: { title: "t2" } },
] as const;

interface Options {
  platformRole?: string;
  organizationRole?: string;
  resolved?: string;
  header?: string | null;
}

/**
 * Build one endpoint with the chosen caller, and report whether the data layer
 * was entered.
 */
async function callEndpoint(endpoint: (typeof ENDPOINTS)[number], opts: Options) {
  const {
    platformRole = "engineer",
    organizationRole = "ADMIN",
    resolved = ORG_ALPHA,
    header = ORG_ALPHA,
  } = opts;

  vi.resetModules();
  let databaseReached = 0;

  /*
   * `requireTenantScope` reads `cookies()` before it asks the resolver, and a
   * vitest run has no request scope. The jar is empty on purpose: the resolver
   * is replaced below, so nothing in these cases depends on a cookie VALUE — the
   * jar only has to exist.
   */
  vi.doMock("next/headers", () => ({
    cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false }),
  }));

  vi.doMock("@/lib/auth/session", () => ({
    getCurrentUser: async () => ({ id: "u1", role: platformRole, email: "u@example.test" }),
  }));

  vi.doMock("@/lib/tenant-selection/selection", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/tenant-selection/selection")>();
    return {
      ...actual,
      // The REAL `checkTenantPrecondition` is kept — it is the thing under test.
      resolveTenantDecisionFromSession: async () => ({
        granted: true,
        organizationId: resolved,
        organizationSlug: "slug",
        organizationRole,
        userId: "u1",
      }),
    };
  });

  vi.doMock("@/lib/data-access/tenant-scope", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/data-access/tenant-scope")>();
    return {
      ...actual,
      requireDatabase: async () => {
        databaseReached += 1;
        throw new actual.DataScopeError("ORGANIZATION_CONTEXT_UNAVAILABLE", "probe");
      },
    };
  });

  const headers = new Headers({ "content-type": "application/json" });
  if (header !== null) headers.set(HEADER, header);

  const req = new Request("https://example.test/api/cmms/x", {
    method: endpoint.method,
    headers,
    body: JSON.stringify(endpoint.body),
  });

  const mod = (await import(endpoint.module)) as Record<string, unknown>;
  const handler = mod[endpoint.method] as (
    r: Request,
    ctx?: { params: Promise<{ id: string }> },
  ) => Promise<Response>;

  const res = await handler(req, { params: Promise.resolve({ id: "task_1" }) });
  const payload = (await res.json().catch(() => ({}))) as { code?: string };
  return { status: res.status, code: payload.code, databaseReached };
}

beforeEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/auth/session");
  vi.doUnmock("@/lib/tenant-selection/selection");
  vi.doUnmock("@/lib/data-access/tenant-scope");
});

describe("F1 — the tenant-intent precondition is required for a CMMS write", () => {
  for (const endpoint of ENDPOINTS) {
    it(`${endpoint.name}: NO header is 428 and writes nothing`, async () => {
      const r = await callEndpoint(endpoint, { header: null });
      expect(r.status, "RFC 6585 Precondition Required").toBe(428);
      expect(r.code).toBe("ORGANIZATION_PRECONDITION_REQUIRED");
      expect(r.databaseReached, "the database must not be reached").toBe(0);
    });

    it(`${endpoint.name}: a STALE header is 409 and writes nothing`, async () => {
      // The page was rendered for Beta; the cookie now resolves Alpha.
      const r = await callEndpoint(endpoint, { resolved: ORG_ALPHA, header: ORG_BETA });
      expect(r.status).toBe(409);
      expect(r.code).toBe("ORGANIZATION_CONTEXT_CONFLICT");
      expect(r.databaseReached).toBe(0);
    });

    it(`${endpoint.name}: a MATCHING header reaches the write`, async () => {
      /*
       * The control that stops the two assertions above being vacuous. The
       * database double refuses, so the answer is the 503 it raised — what
       * matters is that the guard let the request through to it.
       */
      const r = await callEndpoint(endpoint, { resolved: ORG_ALPHA, header: ORG_ALPHA });
      expect(r.databaseReached, "the guard must not block a legitimate write").toBe(1);
      expect(r.status).toBe(503);
    });
  }

  it("the header NEVER selects the tenant: naming a foreign organization refuses, it does not switch", async () => {
    const r = await callEndpoint(ENDPOINTS[0], { resolved: ORG_ALPHA, header: "org_not_a_member_of" });
    expect(r.status).toBe(409);
    expect(r.databaseReached).toBe(0);
  });
});

describe("F2 — the ORGANIZATION role decides, not the platform role", () => {
  /** The matrix in `@/lib/org/rbac`: manage_industrial is OWNER, ADMIN, MANAGER. */
  const PERMITTED = ["OWNER", "ADMIN", "MANAGER"] as const;
  const REFUSED = ["ENGINEER", "VIEWER", "MEMBER", "BILLING_ADMIN", "STUDENT"] as const;

  for (const endpoint of ENDPOINTS) {
    for (const organizationRole of REFUSED) {
      it(`${endpoint.name}: platform engineer + org ${organizationRole} is 403`, async () => {
        const r = await callEndpoint(endpoint, { platformRole: "engineer", organizationRole });
        expect(r.status).toBe(403);
        expect(r.code).toBe("FORBIDDEN");
        expect(r.databaseReached).toBe(0);
      });
    }

    for (const organizationRole of PERMITTED) {
      it(`${endpoint.name}: platform engineer + org ${organizationRole} reaches the write`, async () => {
        const r = await callEndpoint(endpoint, { platformRole: "engineer", organizationRole });
        expect(r.databaseReached).toBe(1);
      });
    }
  }

  it("a STRONGER platform role does not buy an organization permission", async () => {
    for (const platformRole of ["admin", "superadmin"]) {
      const r = await callEndpoint(ENDPOINTS[0], { platformRole, organizationRole: "VIEWER" });
      expect(r.status, `${platformRole} + org VIEWER`).toBe(403);
      expect(r.databaseReached).toBe(0);
    }
  });

  it("a permitted ORGANIZATION role does not rescue a refused PLATFORM role", async () => {
    // Both axes are required; neither substitutes for the other.
    for (const platformRole of ["viewer", "customer", "vendor", "candidate"]) {
      const r = await callEndpoint(ENDPOINTS[0], { platformRole, organizationRole: "OWNER" });
      expect(r.status, `${platformRole} + org OWNER`).toBe(403);
      expect(r.databaseReached).toBe(0);
    }
  });
});

describe("F1/F2 — the refusal happens BEFORE the body is processed", () => {
  it("a body that would fail validation still answers 428, not 400", async () => {
    vi.resetModules();
    vi.doMock("next/headers", () => ({
      cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false }),
    }));
    vi.doMock("@/lib/auth/session", () => ({
      getCurrentUser: async () => ({ id: "u1", role: "engineer", email: "u@example.test" }),
    }));
    vi.doMock("@/lib/tenant-selection/selection", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/tenant-selection/selection")>();
      return {
        ...actual,
        resolveTenantDecisionFromSession: async () => ({
          granted: true, organizationId: ORG_ALPHA, organizationSlug: "s",
          organizationRole: "ADMIN", userId: "u1",
        }),
      };
    });

    const { POST } = await import("@/app/api/cmms/tasks/route");
    const res = await POST(new Request("https://example.test/api/cmms/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },   // no precondition header
      body: JSON.stringify({ nonsense: true }),           // and an invalid body
    }));

    expect(res.status, "the precondition is checked first").toBe(428);
  });
});
