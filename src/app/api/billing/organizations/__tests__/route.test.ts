/**
 * PHASE 89 — billing/organizations must not leak DB internals to the client.
 *
 * Regression guard for the fix that replaced `NextResponse.json({ error:
 * String(err) })` (which surfaced raw Prisma/DB error text to any authenticated
 * caller) with a server-side log + a generic client message. Verifies both the
 * GET and POST catch paths return the generic message and 500, and that the raw
 * thrown text never appears in the response body.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";

const SECRET_DB_ERROR = "PrismaClientKnownRequestError: connect ECONNREFUSED 10.0.0.5:5432 (P1001)";

const MOCKED = ["@/lib/auth/jwt", "@/lib/db/prisma", "@/lib/audit/audit-service"];

beforeEach(() => {
  vi.resetModules();
  vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => ({ sub: "u1" }) }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async () => {},
    BILLING_AUDIT: { ORG_CREATED: "org.created" },
  }));
});

afterEach(() => {
  for (const m of MOCKED) vi.doUnmock(m);
  vi.restoreAllMocks();
});

function authedRequest(method: "GET" | "POST", body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/billing/organizations", {
    method,
    headers: {
      cookie: `${ACCESS_TOKEN_COOKIE}=fake-token`,
      "content-type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("billing/organizations — DB errors are not leaked to the client", () => {
  it("GET: a thrown DB error yields a generic 500, never the raw error string", async () => {
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () => ({
        organizationMember: {
          findFirst: async () => { throw new Error(SECRET_DB_ERROR); },
          create:    async () => ({}),
        },
        organization: { findFirst: async () => null, create: async () => ({}) },
      }),
    }));
    const { GET } = await import("../route");
    const res = await GET(authedRequest("GET"));
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.error).toBe("Failed to load organization. Please try again.");
    expect(JSON.stringify(json)).not.toContain("Prisma");
    expect(JSON.stringify(json)).not.toContain("ECONNREFUSED");
    expect(JSON.stringify(json)).not.toContain("5432");
  });

  it("POST: a thrown DB error on create yields a generic 500, never the raw error string", async () => {
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () => ({
        organizationMember: {
          findFirst: async () => null,          // no existing membership → proceeds to create
          create:    async () => ({}),
        },
        organization: {
          findFirst: async () => null,
          create:    async () => { throw new Error(SECRET_DB_ERROR); },
        },
      }),
    }));
    const { POST } = await import("../route");
    const res = await POST(authedRequest("POST", { name: "Acme Industrial" }));
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.error).toBe("Failed to create organization. Please try again.");
    expect(JSON.stringify(json)).not.toContain("Prisma");
    expect(JSON.stringify(json)).not.toContain("ECONNREFUSED");
  });

  it("GET: unauthenticated request is rejected before touching the database", async () => {
    let prismaTouched = false;
    vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => null }));
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () => { prismaTouched = true; return null; },
    }));
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/billing/organizations", { method: "GET" }));
    expect(res.status).toBe(401);
    expect(prismaTouched).toBe(false);
  });
});
