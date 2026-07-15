/**
 * Phase 86C4B2B1D-SECURITY-8 AMENDMENT — remaining write-authorization,
 * tenant-isolation, mass-assignment, and billing-permission closure.
 *
 * Covers:
 *   Part 2 — billing mutations require the new static `manage_billing`
 *            permission (OWNER/ADMIN/BILLING_ADMIN); read-only roles get 403
 *            before any Stripe / invoice / subscription side effect.
 *   Part 3 — industrial / digital-twin / academy PATCH routes whitelist the
 *            update fields, so an injected organizationId/id never reaches
 *            Prisma `data`.
 *   Part 4 — organization invitation role-escalation clamp (assignableRoles).
 *   Part 5 — changeMemberStatus is tenant-scoped (cross-org memberId rejected
 *            before mutation).
 *   Part 6 — industrial API-key function-level authorization (industrial.write
 *            scope) for the API-key path.
 *   Part 7 — IndexNow is secret-gated, host-restricted, fail-closed, and never
 *            calls the external service on a rejected request.
 *
 * `requirePermission`, `assignableRoles`, `can`, `hasScope` and the PERMISSIONS
 * map are exercised for real — only the data/side-effect layers are spied.
 * No network, no Redis, deterministic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const ENV_KEYS = [
  "HERMES_STORAGE_MODE", "DATABASE_URL", "REDIS_URL",
  "INDEXNOW_KEY", "INDEXNOW_TRIGGER_SECRET", "NODE_ENV",
] as const;
let saved: Record<string, string | undefined>;
const env = process.env as Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = env[k];
  delete env.HERMES_STORAGE_MODE;
  delete env.DATABASE_URL;
  delete env.REDIS_URL;
  vi.resetModules();
});

const MOCKED_MODULES = [
  "@/lib/billing/context", "@/lib/billing/invoices", "@/lib/billing/payments",
  "@/lib/billing/subscriptions", "@/lib/billing/usage", "@/lib/api/auth",
  "@/lib/org/context", "@/lib/org/invitations", "@/lib/industrial/assets",
  "@/lib/digital-twin/nodes", "@/lib/academy/db", "@/lib/auth/rbac-server",
  "@/lib/db/prisma", "@/lib/audit/audit-service",
];

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete env[k];
    else env[k] = saved[k];
  }
  // Unmock every doMock'd module so a per-test factory never leaks forward.
  for (const m of MOCKED_MODULES) vi.doUnmock(m);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function req(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "10.9.0.1", ...headers },
    body: JSON.stringify(body),
  });
}
function patchReq(path: string, body: unknown): NextRequest {
  return new Request(`http://localhost${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}
function mockOrgContext(role: string, orgId = "org-A") {
  vi.doMock("@/lib/billing/context", () => ({
    requireOrgContext: async () => ({ ctx: { userId: "u1", orgId, role } }),
  }));
}

// ── Part 2 — billing least-privilege ─────────────────────────────────────────

describe("Part 2 — billing mutations require manage_billing", () => {
  it("payments POST: VIEWER → 403 before invoice lookup or payment record", async () => {
    mockOrgContext("VIEWER");
    const getInvoiceById = vi.fn();
    const recordManualPayment = vi.fn();
    vi.doMock("@/lib/billing/invoices", () => ({ getInvoiceById }));
    vi.doMock("@/lib/billing/payments", () => ({ recordManualPayment, listPayments: async () => [] }));
    const { POST } = await import("../../../app/api/billing/payments/route");
    const res = await POST(req("/api/billing/payments", { invoiceId: "i1", amount: 5, currency: "USD" }) as NextRequest);
    expect(res.status).toBe(403);
    expect(getInvoiceById).not.toHaveBeenCalled();
    expect(recordManualPayment).not.toHaveBeenCalled();
  });

  it("payments POST: OWNER passes the permission gate and reaches the org-scope check", async () => {
    mockOrgContext("OWNER");
    const recordManualPayment = vi.fn(async () => ({ ok: true, payment: { id: "p1" } }));
    vi.doMock("@/lib/billing/invoices", () => ({ getInvoiceById: async () => ({ id: "i1", organizationId: "org-A" }) }));
    vi.doMock("@/lib/billing/payments", () => ({ recordManualPayment, listPayments: async () => [] }));
    const { POST } = await import("../../../app/api/billing/payments/route");
    const res = await POST(req("/api/billing/payments", { invoiceId: "i1", amount: 5, currency: "USD" }) as NextRequest);
    expect(res.status).toBe(201);
    expect(recordManualPayment).toHaveBeenCalledTimes(1);
  });

  it("subscription DELETE (cancel): ENGINEER → 403, cancelSubscription not called", async () => {
    mockOrgContext("ENGINEER");
    const cancelSubscription = vi.fn();
    vi.doMock("@/lib/billing/subscriptions", () => ({
      getSubscription: async () => null, createSubscription: vi.fn(), changePlan: vi.fn(),
      renewSubscription: vi.fn(), cancelSubscription,
    }));
    const { DELETE } = await import("../../../app/api/billing/subscription/route");
    const res = await DELETE(req("/api/billing/subscription", {}) as NextRequest);
    expect(res.status).toBe(403);
    expect(cancelSubscription).not.toHaveBeenCalled();
  });

  it("usage POST: VIEWER → 403, recordUsage not called", async () => {
    mockOrgContext("VIEWER");
    const recordUsage = vi.fn();
    vi.doMock("@/lib/billing/usage", () => ({ recordUsage, getPlanLimitReport: async () => ({}) }));
    const { POST } = await import("../../../app/api/billing/usage/route");
    const res = await POST(req("/api/billing/usage", { metric: "x", value: 1 }) as NextRequest);
    expect(res.status).toBe(403);
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("BILLING_ADMIN can manage billing; MANAGER cannot (permission map)", async () => {
    const { can } = await import("@/lib/org/rbac");
    expect(can("BILLING_ADMIN", "manage_billing")).toBe(true);
    expect(can("OWNER", "manage_billing")).toBe(true);
    expect(can("ADMIN", "manage_billing")).toBe(true);
    expect(can("MANAGER", "manage_billing")).toBe(false);
    expect(can("ENGINEER", "manage_billing")).toBe(false);
    expect(can("VIEWER", "manage_billing")).toBe(false);
    // Read permission unchanged.
    expect(can("BILLING_ADMIN", "view_billing")).toBe(true);
  });
});

// ── Part 3 — mass-assignment whitelist ───────────────────────────────────────

describe("Part 3 — PATCH routes reject injected tenant/ownership fields", () => {
  function mockApiKeyAuth(scopes: string[]) {
    vi.doMock("@/lib/api/auth", () => ({
      requirePlatformAuth: async () => ({ ctx: { userId: null, orgId: "org-A", authMethod: "apikey", scopes } }),
    }));
  }

  it("industrial/assets/[id]: injected organizationId never reaches updateAsset", async () => {
    mockApiKeyAuth(["industrial.write"]);
    const updateAsset = vi.fn(async () => ({ id: "a1", organizationId: "org-A" }));
    vi.doMock("@/lib/industrial/assets", () => ({ getAsset: async () => ({ id: "a1", siteId: "s1", organizationId: "org-A" }), updateAsset }));
    const { PATCH } = await import("../../../app/api/industrial/assets/[id]/route");
    const res = await PATCH(patchReq("/api/industrial/assets/a1", { name: "New", organizationId: "org-EVIL", siteId: "s-EVIL", id: "a-EVIL" }), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);
    const patch = (updateAsset.mock.calls[0] as unknown[])[2] as Record<string, unknown>;
    expect(patch.name).toBe("New");
    expect(patch).not.toHaveProperty("organizationId");
    expect(patch).not.toHaveProperty("siteId");
    expect(patch).not.toHaveProperty("id");
  });

  it("digital-twin/nodes/[id]: injected organizationId never reaches updateNode", async () => {
    vi.doMock("@/lib/api/auth", () => ({
      requirePlatformAuth: async () => ({ ctx: { userId: "u1", orgId: "org-A", authMethod: "jwt", scopes: ["admin"] } }),
    }));
    vi.doMock("@/lib/org/context", () => ({ requireOrgActor: async () => ({ ctx: { role: "ADMIN", userId: "u1", orgId: "org-A" } }) }));
    const updateNode = vi.fn(async () => ({ id: "n1" }));
    vi.doMock("@/lib/digital-twin/nodes", () => ({ updateNode, listNodes: async () => [] }));
    const { PATCH } = await import("../../../app/api/digital-twin/nodes/[id]/route");
    const res = await PATCH(patchReq("/api/digital-twin/nodes/n1", { displayName: "N", organizationId: "org-EVIL", assetId: "ok" }), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(200);
    const patch = (updateNode.mock.calls[0] as unknown[])[2] as Record<string, unknown>;
    expect(patch.displayName).toBe("N");
    expect(patch).not.toHaveProperty("organizationId");
  });

  it("academy/courses/[id]: injected id/createdAt never reach updateCourse", async () => {
    vi.doMock("@/lib/auth/rbac-server", () => ({ getAuthRole: async () => "admin" }));
    const updateCourse = vi.fn(async () => ({ id: "c1" }));
    vi.doMock("@/lib/academy/db", () => ({ updateCourse }));
    const { PATCH } = await import("../../../app/api/academy/courses/[id]/route");
    const res = await PATCH(patchReq("/api/academy/courses/c1", { title: "T", id: "c-EVIL", createdAt: "2000", isPublished: true }), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    const data = (updateCourse.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(data.title).toBe("T");
    expect(data.isPublished).toBe(true);
    expect(data).not.toHaveProperty("id");
    expect(data).not.toHaveProperty("createdAt");
  });
});

// ── Part 4 — invitation role escalation clamp ────────────────────────────────

describe("Part 4 — organization invitation role clamp", () => {
  function setup(role: string, out = vi.fn(async () => ({ ok: true, invitation: { id: "inv1" } }))) {
    vi.doMock("@/lib/org/context", () => ({
      requireOrgActor: async (_r: unknown, orgId: string) => ({ ctx: { role, userId: "u1", orgId, status: "ACTIVE" } }),
    }));
    vi.doMock("@/lib/org/invitations", () => ({ inviteMember: out, listInvitations: async () => [] }));
    return out;
  }
  const P = "../../../app/api/organizations/[orgId]/invitations/route";
  const params = { params: Promise.resolve({ orgId: "org-A" }) };

  it("ADMIN inviting OWNER → 403, no invitation created (escalation blocked)", async () => {
    const spy = setup("ADMIN");
    const { POST } = await import(P);
    const res = await POST(req("/api/organizations/org-A/invitations", { email: "x@y.co", role: "OWNER" }) as NextRequest, params);
    expect(res.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });

  it("ADMIN inviting ENGINEER → success", async () => {
    const spy = setup("ADMIN");
    const { POST } = await import(P);
    const res = await POST(req("/api/organizations/org-A/invitations", { email: "x@y.co", role: "ENGINEER" }) as NextRequest, params);
    expect(res.status).toBe(201);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(((spy.mock.calls[0] as unknown[])[0] as { role: string }).role).toBe("ENGINEER");
  });

  it("invalid role string → 400, no invitation", async () => {
    const spy = setup("OWNER");
    const { POST } = await import(P);
    const res = await POST(req("/api/organizations/org-A/invitations", { email: "x@y.co", role: "HACKER" }) as NextRequest, params);
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it("VIEWER (no invite_member) → 403", async () => {
    const spy = setup("VIEWER");
    const { POST } = await import(P);
    const res = await POST(req("/api/organizations/org-A/invitations", { email: "x@y.co" }) as NextRequest, params);
    expect(res.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ── Part 5 — changeMemberStatus tenant isolation ─────────────────────────────

describe("Part 5 — changeMemberStatus rejects cross-tenant memberId", () => {
  function mockPrisma(findFirst: ReturnType<typeof vi.fn>, update: ReturnType<typeof vi.fn>) {
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () => ({
        organizationMember: {
          findFirst, update, count: async () => 2,
        },
      }),
    }));
    // Complete audit mock — the shared rate limiter also reads INFRA_AUDIT, so
    // an incomplete mock would leak a missing export into later suites.
    vi.doMock("@/lib/audit/audit-service", () => ({
      recordAuditEvent: async () => {},
      ORG_AUDIT: { MEMBER_STATUS_CHANGED: "x" },
      INFRA_AUDIT: { RATE_LIMITER_DEGRADED: "x" },
    }));
  }

  it("member not in the target org → 'Member not found', update not called", async () => {
    const findFirst = vi.fn(async () => null); // cross-org lookup fails
    const update = vi.fn();
    mockPrisma(findFirst, update);
    const { changeMemberStatus } = await import("@/lib/org/members");
    const out = await changeMemberStatus({ organizationId: "org-A", memberId: "m-of-orgB", newStatus: "ACTIVE", actorUserId: "u1" });
    expect(out.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("member in the target org → update called", async () => {
    const NOW = "2026-01-01T00:00:00.000Z";
    const findFirst = vi.fn(async () => ({ id: "m1", organizationId: "org-A", role: "ENGINEER" }));
    const update = vi.fn(async () => ({
      id: "m1", organizationId: "org-A", userId: "u", role: "ENGINEER", status: "ACTIVE",
      createdAt: NOW, updatedAt: NOW, user: { id: "u", name: "n", email: "e" },
    }));
    mockPrisma(findFirst, update);
    const { changeMemberStatus } = await import("@/lib/org/members");
    const out = await changeMemberStatus({ organizationId: "org-A", memberId: "m1", newStatus: "ACTIVE", actorUserId: "u1" });
    expect(out.ok).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
  });
});

// ── Part 6 — industrial API-key function-level authorization ──────────────────

describe("Part 6 — industrial write requires industrial.write scope for API keys", () => {
  function mockAuth(authMethod: string, scopes: string[]) {
    vi.doMock("@/lib/api/auth", () => ({
      requirePlatformAuth: async () => ({ ctx: { userId: null, orgId: "org-A", authMethod, scopes } }),
    }));
    vi.doMock("@/lib/org/context", () => ({ requireOrgActor: async () => ({ ctx: { role: "ADMIN", userId: "u1", orgId: "org-A" } }) }));
    vi.doMock("@/lib/industrial/assets", () => ({ listAssets: async () => [], createAsset: async () => ({ id: "a1" }) }));
  }

  it("API key WITHOUT industrial.write → 403", async () => {
    mockAuth("apikey", []);
    const { POST } = await import("../../../app/api/industrial/assets/route");
    const res = await POST(req("/api/industrial/assets", { name: "A", siteId: "s1", assetType: "PLC", protocol: "MODBUS" }) as NextRequest);
    expect(res.status).toBe(403);
  });

  it("API key WITH industrial.write → not blocked by the scope gate", async () => {
    mockAuth("apikey", ["industrial.write"]);
    const { POST } = await import("../../../app/api/industrial/assets/route");
    const res = await POST(req("/api/industrial/assets", { name: "A", siteId: "s1", assetType: "PLC", protocol: "MODBUS" }) as NextRequest);
    expect(res.status).not.toBe(403);
  });

  it("JWT session (admin scope) → passes the scope gate", async () => {
    mockAuth("jwt", ["admin"]);
    const { POST } = await import("../../../app/api/industrial/assets/route");
    const res = await POST(req("/api/industrial/assets", { name: "A", siteId: "s1", assetType: "PLC", protocol: "MODBUS" }) as NextRequest);
    expect(res.status).not.toBe(403);
  });
});

// ── Part 7 — IndexNow secret gate + host validation ──────────────────────────

describe("Part 7 — IndexNow is secret-gated, host-restricted, fail-closed", () => {
  const P = "../../../app/api/seo/indexnow/route";
  const VALID = "https://hermesnovin.com/fa";

  function mockFetch() {
    const f = vi.fn(async () => ({ status: 200, ok: true }));
    vi.stubGlobal("fetch", f);
    return f;
  }

  it("missing trigger secret → 503, no external call (fail closed)", async () => {
    delete env.INDEXNOW_TRIGGER_SECRET;
    env.INDEXNOW_KEY = "outkey";
    const f = mockFetch();
    const { POST } = await import(P);
    const res = await POST(req("/api/seo/indexnow", { urls: [VALID] }, { "x-indexnow-secret": "anything" }));
    expect(res.status).toBe(503);
    expect(f).not.toHaveBeenCalled();
  });

  it("wrong secret → 401, no external call", async () => {
    env.INDEXNOW_TRIGGER_SECRET = "correct-secret";
    env.INDEXNOW_KEY = "outkey";
    const f = mockFetch();
    const { POST } = await import(P);
    const res = await POST(req("/api/seo/indexnow", { urls: [VALID] }, { "x-indexnow-secret": "wrong" }));
    expect(res.status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it("foreign URL → 400, no external call", async () => {
    env.INDEXNOW_TRIGGER_SECRET = "correct-secret";
    env.INDEXNOW_KEY = "outkey";
    const f = mockFetch();
    const { POST } = await import(P);
    const res = await POST(req("/api/seo/indexnow", { urls: ["https://attacker.example/x"] }, { "x-indexnow-secret": "correct-secret" }));
    expect(res.status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it("http downgrade in production → 400, no external call", async () => {
    env.INDEXNOW_TRIGGER_SECRET = "correct-secret";
    env.INDEXNOW_KEY = "outkey";
    env.NODE_ENV = "production";
    const f = mockFetch();
    const { POST } = await import(P);
    const res = await POST(req("/api/seo/indexnow", { urls: ["http://hermesnovin.com/fa"] }, { "x-indexnow-secret": "correct-secret" }));
    expect(res.status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it("valid secret + valid Hermes URL → calls the IndexNow service", async () => {
    env.INDEXNOW_TRIGGER_SECRET = "correct-secret";
    env.INDEXNOW_KEY = "outkey";
    const f = mockFetch();
    const { POST } = await import(P);
    const res = await POST(req("/api/seo/indexnow", { urls: [VALID] }, { "x-indexnow-secret": "correct-secret" }));
    expect(res.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
