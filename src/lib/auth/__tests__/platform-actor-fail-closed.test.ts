import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { authorizePlatformActor } from "@/lib/api/authorize";
import type { OrgRole } from "@/lib/org/types";

/**
 * PHASE 87L.6H.1A — runtime fail-closed authorization.
 *
 * TypeScript's `authMethod: "jwt" | "apikey"` union does not exist at runtime.
 * The previous handlers authorized with two POSITIVE conditions, so an actor
 * context carrying any other value fell through both and reached key creation,
 * rotation and revocation unauthorized.
 *
 * Every case below deliberately bypasses the type system at the test boundary
 * (`as unknown as ...`) — that is the whole point: these are the shapes the
 * compiler cannot rule out at runtime. Assertions run against the REAL shared
 * helper and the REAL route handlers, never against source text.
 */

const req = (u = "/api/platform/keys") => new NextRequest(`http://localhost:3000${u}`);

/** Actor contexts the type system forbids but a runtime can still produce. */
const MALFORMED_ACTORS: [string, unknown][] = [
  ['authMethod: "session"',  { orgId: "org_1", userId: "u_1", authMethod: "session", scopes: [] }],
  ['authMethod: "oauth"',    { orgId: "org_1", userId: "u_1", authMethod: "oauth",   scopes: [] }],
  ['authMethod: ""',         { orgId: "org_1", userId: "u_1", authMethod: "",        scopes: [] }],
  ["authMethod missing",     { orgId: "org_1", userId: "u_1", scopes: [] }],
  ["authMethod: null",       { orgId: "org_1", userId: "u_1", authMethod: null,      scopes: [] }],
  ["authMethod: undefined",  { orgId: "org_1", userId: "u_1", authMethod: undefined, scopes: [] }],
  ["authMethod: 0",          { orgId: "org_1", userId: "u_1", authMethod: 0,         scopes: [] }],
  ["authMethod: true",       { orgId: "org_1", userId: "u_1", authMethod: true,      scopes: [] }],
  ["authMethod: object",     { orgId: "org_1", userId: "u_1", authMethod: {},        scopes: [] }],
  ["authMethod: array",      { orgId: "org_1", userId: "u_1", authMethod: ["jwt"],   scopes: [] }],
  ['authMethod: "JWT" (case)', { orgId: "org_1", userId: "u_1", authMethod: "JWT",   scopes: [] }],
  ["ctx null",               null],
  ["ctx undefined",          undefined],
  ["ctx is a string",        "jwt"],
  ["orgId missing",          { userId: "u_1", authMethod: "jwt", scopes: [] }],
  ["orgId empty",            { orgId: "", userId: "u_1", authMethod: "jwt", scopes: [] }],
];

/** A membership lookup that would ALLOW — so any pass is the helper's doing. */
function mockPermissiveOrg(role: OrgRole = "OWNER") {
  vi.resetModules();
  vi.doMock("@/lib/org/context", () => ({
    requireOrgActor: async () => ({ ctx: { orgId: "org_1", userId: "u_1", role, status: "ACTIVE" } }),
  }));
}

afterEach(() => { vi.doUnmock("@/lib/org/context"); vi.resetModules(); });

// ── 1. the shared helper ─────────────────────────────────────────────────────

describe("87L.6H.1A — authorizePlatformActor denies every unrecognized actor", () => {
  it.each(MALFORMED_ACTORS)("%s is denied", async (_label, ctx) => {
    const res = await authorizePlatformActor(
      req(),
      ctx as never,
      { permission: "manage_api_keys", apiKeyScope: "admin" },
    );
    expect(res.ok, "malformed actor was authorized").toBe(false);
    if (!res.ok) expect([401, 403]).toContain(res.status);
  });

  it("a JWT actor WITHOUT userId is denied 401 (never silently skips the permission)", async () => {
    // The org lookup is made PERMISSIVE on purpose. Without this the real
    // requireOrgActor would deny anyway (no session cookie) and the test would
    // pass even if the userId guard were deleted — a vacuous pass. With a
    // permissive lookup, only the userId guard itself can produce the denial.
    mockPermissiveOrg("OWNER");
    const { authorizePlatformActor: fresh } = await import("@/lib/api/authorize");
    for (const bad of [
      { orgId: "org_1", authMethod: "jwt", scopes: [] },
      { orgId: "org_1", userId: null, authMethod: "jwt", scopes: [] },
      { orgId: "org_1", userId: "", authMethod: "jwt", scopes: [] },
      { orgId: "org_1", userId: 42, authMethod: "jwt", scopes: [] },
    ]) {
      const res = await fresh(req(), bad as never, { permission: "manage_api_keys" });
      expect(res.ok, `${JSON.stringify(bad)} authorized`).toBe(false);
      if (!res.ok) expect(res.status).toBe(401);
    }
    // control: the SAME permissive lookup DOES authorize once userId is present
    expect((await fresh(req(), { orgId: "org_1", userId: "u_1", authMethod: "jwt" } as never,
      { permission: "manage_api_keys" })).ok).toBe(true);
  });

  it("a malformed API-key actor is denied (bad scopes shape is not a free pass)", async () => {
    for (const bad of [
      { orgId: "org_1", userId: null, authMethod: "apikey" },                   // no scopes
      { orgId: "org_1", userId: null, authMethod: "apikey", scopes: null },
      { orgId: "org_1", userId: null, authMethod: "apikey", scopes: "admin" },  // string, not array
      { orgId: "org_1", userId: null, authMethod: "apikey", scopes: {} },
      { orgId: "org_1", userId: null, authMethod: "apikey", scopes: [] },       // empty
    ]) {
      const res = await authorizePlatformActor(req(), bad as never, {
        permission: "manage_api_keys", apiKeyScope: "admin",
      });
      expect(res.ok, `${JSON.stringify(bad)} authorized`).toBe(false);
      if (!res.ok) expect(res.status).toBe(403);
    }
  });

  it("an API key is refused where the route is session-only", async () => {
    const res = await authorizePlatformActor(
      req(),
      { orgId: "org_1", userId: null, authMethod: "apikey", scopes: ["admin"] } as never,
      { permission: "view_api_keys" }, // no apiKeyScope → API keys forbidden
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
  });

  // ── POSITIVE CONTROLS ──────────────────────────────────────────────────────
  // Without these, a helper that returned {ok:false} unconditionally would pass
  // every assertion above. These prove the denials are discriminating.

  it("POSITIVE: a well-formed API key with the right scope IS authorized", async () => {
    const res = await authorizePlatformActor(
      req(),
      { orgId: "org_1", userId: null, authMethod: "apikey", scopes: ["admin"] } as never,
      { permission: "manage_api_keys", apiKeyScope: "admin" },
    );
    expect(res.ok, "valid API key was denied").toBe(true);
  });

  it("POSITIVE: a well-formed JWT actor with the permission IS authorized", async () => {
    mockPermissiveOrg("OWNER");
    const { authorizePlatformActor: fresh } = await import("@/lib/api/authorize");
    const res = await fresh(
      req(),
      { orgId: "org_1", userId: "u_1", authMethod: "jwt", scopes: [] } as never,
      { permission: "manage_api_keys", apiKeyScope: "admin" },
    );
    expect(res.ok, "valid session actor was denied").toBe(true);
  });

  it("POSITIVE: the org permission still decides for a valid JWT actor", async () => {
    mockPermissiveOrg("ENGINEER");
    const { authorizePlatformActor: fresh } = await import("@/lib/api/authorize");
    // engineer holds view_api_usage but NOT manage_api_keys
    expect((await fresh(req(), { orgId: "org_1", userId: "u_1", authMethod: "jwt" } as never,
      { permission: "view_api_usage" })).ok).toBe(true);
    const denied = await fresh(req(), { orgId: "org_1", userId: "u_1", authMethod: "jwt" } as never,
      { permission: "manage_api_keys" });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.status).toBe(403);
  });
});

// ── 2. the real route handlers ───────────────────────────────────────────────

/**
 * Mount a malformed actor into the authentication seam and call the REAL
 * handler. The org-membership seam is made PERMISSIVE on purpose: if the
 * handler ever reached it, the request would succeed — so a denial here can
 * only come from the exhaustive branch.
 */
function mockMalformed(actor: unknown) {
  vi.resetModules();
  vi.doMock("@/lib/api/auth", () => ({ requirePlatformAuth: async () => ({ ctx: actor }) }));
  vi.doMock("@/lib/org/context", () => ({
    requireOrgActor: async () => ({ ctx: { orgId: "org_1", userId: "u_1", role: "OWNER", status: "ACTIVE" } }),
  }));
}

const listApiKeys = vi.fn(async () => []);
const createApiKey = vi.fn(async () => ({ ok: true, key: { id: "k", rawKey: "hermes_sk_LEAK" } }));
const revokeApiKey = vi.fn(async () => ({ ok: true }));
const rotateApiKey = vi.fn(async () => ({ ok: true, key: { id: "k2", rawKey: "hermes_sk_LEAK" }, revokedKeyId: "k" }));
const getRateLimitStatus = vi.fn(async () => ({ minute: {}, day: {} }));
const getApiUsageSummary = vi.fn(async () => []);

function mockDataLayers() {
  vi.doMock("@/lib/api/keys", () => ({ listApiKeys, createApiKey, revokeApiKey, rotateApiKey }));
  vi.doMock("@/lib/api/rate-limit", () => ({ getRateLimitStatus }));
  vi.doMock("@/lib/api/meter", () => ({ getApiUsageSummary }));
}

type Ctx = { params: Promise<{ id: string }> };

async function callRoute(
  route: "list" | "create" | "revoke" | "rotate" | "usage" | "ratelimits",
  actor: unknown,
): Promise<Response> {
  mockMalformed(actor);
  mockDataLayers();
  switch (route) {
    case "list":   return (await import("@/app/api/platform/keys/route")).GET(req());
    case "create": return (await import("@/app/api/platform/keys/route")).POST(
      new NextRequest("http://localhost:3000/api/platform/keys", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "x", scopes: ["industrial.read"] }),
      }));
    case "revoke": return (await import("@/app/api/platform/keys/[id]/route"))
      .DELETE(req("/api/platform/keys/k1"), { params: Promise.resolve({ id: "k1" }) } as Ctx);
    case "rotate": return (await import("@/app/api/platform/keys/[id]/rotate/route"))
      .POST(req("/api/platform/keys/k1/rotate"), { params: Promise.resolve({ id: "k1" }) } as Ctx);
    case "usage":  return (await import("@/app/api/platform/usage/route")).GET(req("/api/platform/usage"));
    default:       return (await import("@/app/api/platform/rate-limits/route")).GET(req("/api/platform/rate-limits"));
  }
}

const ROUTES = ["list", "create", "revoke", "rotate", "usage", "ratelimits"] as const;

describe("87L.6H.1A — real handlers deny unrecognized actors", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/api/auth"); vi.doUnmock("@/lib/org/context");
    vi.doUnmock("@/lib/api/keys"); vi.doUnmock("@/lib/api/rate-limit"); vi.doUnmock("@/lib/api/meter");
    vi.clearAllMocks(); vi.resetModules();
  });

  for (const route of ROUTES) {
    it(`${route}: every malformed actor is denied`, async () => {
      for (const [label, actor] of MALFORMED_ACTORS) {
        const res = await callRoute(route, actor);
        expect([401, 403], `${route} allowed ${label} (status ${res.status})`).toContain(res.status);
      }
    });
  }

  it("an unknown method never reaches key creation, rotation, revocation or listing", async () => {
    const unknown = { orgId: "org_1", userId: "u_1", authMethod: "session", scopes: ["admin"] };
    for (const route of ["list", "create", "revoke", "rotate"] as const) {
      await callRoute(route, unknown);
    }
    expect(listApiKeys, "listed keys for an unknown actor").not.toHaveBeenCalled();
    expect(createApiKey, "created a key for an unknown actor").not.toHaveBeenCalled();
    expect(revokeApiKey, "revoked a key for an unknown actor").not.toHaveBeenCalled();
    expect(rotateApiKey, "rotated a key for an unknown actor").not.toHaveBeenCalled();
  });

  it("an unknown method never reaches protected usage data", async () => {
    const unknown = { orgId: "org_1", userId: "u_1", authMethod: "oauth", scopes: ["billing.read"] };
    await callRoute("usage", unknown);
    await callRoute("ratelimits", unknown);
    expect(getApiUsageSummary).not.toHaveBeenCalled();
    expect(getRateLimitStatus).not.toHaveBeenCalled();
  });

  it("a denial never leaks secret material in the body", async () => {
    for (const route of ["create", "rotate"] as const) {
      const res = await callRoute(route, { orgId: "org_1", userId: "u_1", authMethod: "session" });
      expect(JSON.stringify(await res.json())).not.toContain("hermes_sk");
    }
  });

  // POSITIVE CONTROL — the same harness with a VALID actor must succeed, which
  // proves the denials above are not an artefact of the mocking.
  it("POSITIVE: a valid session OWNER passes the same harness", async () => {
    const valid = { orgId: "org_1", userId: "u_1", authMethod: "jwt", scopes: [] };
    for (const route of ROUTES) {
      const res = await callRoute(route, valid);
      expect([401, 403], `${route} denied a valid OWNER`).not.toContain(res.status);
    }
  });

  it("POSITIVE: a valid API key reaches usage but is refused key inventory", async () => {
    const key = { orgId: "org_1", userId: null, authMethod: "apikey", scopes: ["billing.read"] };
    expect((await callRoute("usage", key)).status).toBeLessThan(400);
    // listing is session-only: an API key must not enumerate the inventory
    expect((await callRoute("list", key)).status).toBe(403);
  });
});
