import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * PHASE 94 — HTTP behaviour of the machine-credential enrollment routes.
 *
 * The enrollment service is an injected double: the subject is the HTTP layer —
 * the gate chain, status/code mapping, no-store headers, and the guarantee that
 * the one-time credential appears ONLY in the issue/rotate responses. The
 * service's own security matrix is covered by enrollment-service.test.ts.
 */

const h = vi.hoisted(() => ({
  org: null as null | { userId: string; orgId: string; role: string },
  actorError: null as null | { error: string; status: number },
  siteIds: [] as string[],
  rateLimited: false,
  buckets: [] as string[],
  calls: [] as Array<{ method: string; id: string }>,
  // Per-method outcomes; default to success.
  outcome: {} as Record<string, { ok: true; value: unknown } | { ok: false; code: string }>,
}));

vi.mock("@/lib/billing/context", () => ({
  requireOrgContext: async () => (h.org ? { ctx: h.org } : { error: "Authentication required", status: 401 }),
  // PHASE 107 STAGE 6-A — `withOtRoute` now asks WHY the context is missing.
  // `h.org === null` still means "no session", which is what this file sets up.
  resolveOrgContext: async () => (h.org ? { ok: true, ctx: h.org } : { ok: false, reason: "AUTHENTICATION_REQUIRED" }),
}));
vi.mock("@/lib/org/context", () => ({
  requireOrgActor: async () => (h.actorError ? h.actorError : { ctx: { ...h.org, memberId: "m-1", status: "ACTIVE" } }),
}));
vi.mock("@/lib/site/context", () => ({ getAllowedSiteIds: async () => h.siteIds }));
vi.mock("@/lib/auth/rate-limiter", () => ({
  checkRateLimit: async (action: string) => {
    h.buckets.push(action);
    return !h.rateLimited;
  },
  limitWindowSeconds: () => 60,
}));

const CREDENTIAL = {
  gatewayId: "GW-1",
  signingKeyRef: "opaque-ref-xyz",
  credential: "BASE64URL_ONE_TIME_SECRET_VALUE",
  signatureAlgorithm: "HMAC-SHA256",
  version: 1,
  issuedAt: "2026-01-01T00:00:00.000Z",
};

const method = (name: string, def: { ok: true; value: unknown } | { ok: false; code: string }) =>
  async (_ctx: unknown, id: string) => {
    h.calls.push({ method: name, id });
    return h.outcome[name] ?? def;
  };

vi.mock("@/lib/ot-edge/http/composition", () => ({
  __setOtServicesForTests: () => {},
  resolveOtServices: async () => ({
    enrollment: {
      enroll: method("enroll", { ok: true, value: CREDENTIAL }),
      rotate: method("rotate", { ok: true, value: { ...CREDENTIAL, version: 2 } }),
      revoke: method("revoke", { ok: true, value: { gatewayId: "GW-1" } }),
      remove: method("remove", { ok: true, value: { gatewayId: "GW-1" } }),
    },
  }),
}));

const url = (p: string) => `http://t/api${p}`;
const send = (p: string, m: string) => new NextRequest(url(p), { method: m });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  h.org = { userId: "u-1", orgId: "org-1", role: "ADMIN" };
  h.actorError = null;
  h.siteIds = ["site-1"];
  h.rateLimited = false;
  h.buckets = [];
  h.calls = [];
  h.outcome = {};
  vi.resetModules();
});

async function routes() {
  const enrollment = await import("../gateways/[id]/enrollment/route");
  const rotate = await import("../gateways/[id]/enrollment/rotate/route");
  const revoke = await import("../gateways/[id]/enrollment/revoke/route");
  return { enrollment, rotate, revoke };
}

describe("94 enrollment routes — success paths", () => {
  it("POST enrollment issues 201 with the one-time credential and is never cached", async () => {
    const { enrollment } = await routes();
    const res = await enrollment.POST(send("/ot/gateways/gp-1/enrollment", "POST"), params("gp-1"));
    expect(res.status).toBe(201);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.credential).toBe(CREDENTIAL.credential);
    expect(h.calls).toEqual([{ method: "enroll", id: "gp-1" }]);
  });

  it("POST rotate issues 200 with a new credential", async () => {
    const { rotate } = await routes();
    const res = await rotate.POST(send("/ot/gateways/gp-1/enrollment/rotate", "POST"), params("gp-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.version).toBe(2);
    expect(body.data.credential).toBe(CREDENTIAL.credential);
  });

  it("POST revoke returns 200 and carries NO credential", async () => {
    const { revoke } = await routes();
    const res = await revoke.POST(send("/ot/gateways/gp-1/enrollment/revoke", "POST"), params("gp-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ gatewayId: "GW-1" });
    expect(JSON.stringify(body)).not.toContain("credential");
    expect(JSON.stringify(body)).not.toContain("signingKeyRef");
  });

  it("DELETE enrollment returns 200 and carries NO credential", async () => {
    const { enrollment } = await routes();
    const res = await enrollment.DELETE(send("/ot/gateways/gp-1/enrollment", "DELETE"), params("gp-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("credential");
    expect(h.calls).toEqual([{ method: "remove", id: "gp-1" }]);
  });
});

describe("94 enrollment routes — gates", () => {
  it("an anonymous request is 401 on every enrollment route and never reaches the service", async () => {
    h.org = null;
    const { enrollment, rotate, revoke } = await routes();
    for (const [res, label] of [
      [await enrollment.POST(send("/x", "POST"), params("gp-1")), "enroll"],
      [await enrollment.DELETE(send("/x", "DELETE"), params("gp-1")), "delete"],
      [await rotate.POST(send("/x", "POST"), params("gp-1")), "rotate"],
      [await revoke.POST(send("/x", "POST"), params("gp-1")), "revoke"],
    ] as const) {
      expect((res as Response).status, label).toBe(401);
    }
    expect(h.calls).toEqual([]);
  });

  it("a viewer lacking manage_ot_gateway is 403 and never reaches the service", async () => {
    h.org = { userId: "u-1", orgId: "org-1", role: "VIEWER" };
    const { enrollment } = await routes();
    const res = await enrollment.POST(send("/x", "POST"), params("gp-1"));
    expect(res.status).toBe(403);
    expect(h.calls).toEqual([]);
  });

  it("a suspended membership is refused", async () => {
    h.actorError = { error: "suspended", status: 403 };
    const { enrollment } = await routes();
    const res = await enrollment.POST(send("/x", "POST"), params("gp-1"));
    expect(res.status).toBe(403);
    expect(h.calls).toEqual([]);
  });

  it("rate limiting is keyed to the mutate bucket and returns 429", async () => {
    h.rateLimited = true;
    const { enrollment } = await routes();
    const res = await enrollment.POST(send("/x", "POST"), params("gp-1"));
    expect(res.status).toBe(429);
    expect(h.buckets).toContain("ot-mutate");
    expect(h.calls).toEqual([]);
  });
});

describe("94 enrollment routes — error mapping", () => {
  it("SECRET_BACKEND_UNAVAILABLE becomes 503 with a caller-safe code", async () => {
    h.outcome.enroll = { ok: false, code: "SECRET_BACKEND_UNAVAILABLE" };
    const { enrollment } = await routes();
    const res = await enrollment.POST(send("/x", "POST"), params("gp-1"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("SECRET_BACKEND_UNAVAILABLE");
    expect(body.ok).toBe(false);
  });

  it("a foreign/missing gateway is 404 (issue) and 409 conflict maps through", async () => {
    h.outcome.enroll = { ok: false, code: "NOT_FOUND" };
    h.outcome.rotate = { ok: false, code: "CONFLICT" };
    const { enrollment, rotate } = await routes();
    expect((await enrollment.POST(send("/x", "POST"), params("gp-1"))).status).toBe(404);
    expect((await rotate.POST(send("/x", "POST"), params("gp-1"))).status).toBe(409);
  });
});
