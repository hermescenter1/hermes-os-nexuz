import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { can, type OrgPermission } from "@/lib/org/rbac";
import type { OrgRole } from "@/lib/org/types";

/**
 * PHASE 87L.6H.1 — the owner-decided API-platform permission split.
 *
 *   view_api_usage   aggregate consumption only  — Engineer YES
 *   view_api_keys    key inventory + scopes      — Engineer NO
 *   manage_api_keys  create / rotate / revoke    — Engineer NO
 *
 * Every handler below is the REAL route handler; only the authentication and
 * org-membership seams are mocked. Each block asserts BOTH directions, because
 * a denial test that passes for the wrong reason is worse than no test —
 * 87L.6E shipped exactly that defect (a helper invoked with reversed arguments
 * returned false for every input, so every "denied" assertion passed
 * vacuously). §10 requires that class of bug to be impossible here.
 */

const ROLES = ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"] as const;

/** In the Prisma enum but absent from the app union → must deny by default. */
const UNMAPPED_ROLES = [
  "HR_MANAGER", "RECRUITER", "HIRING_MANAGER", "INTERVIEWER",
  "ACADEMY_ADMIN", "CUSTOMER_SUCCESS_MANAGER", "STUDENT", "COMPLIANCE_MANAGER",
] as unknown as OrgRole[];

const req = (url: string) => new NextRequest(`http://localhost:3000${url}`);

/** Mount the platform seams with a given org role, then import the real route. */
function mockPlatform(role: OrgRole | null, opts: { orgMismatch?: boolean } = {}) {
  vi.resetModules();
  vi.doMock("@/lib/api/auth", () => ({
    requirePlatformAuth: async () =>
      role === null
        ? { error: "Authentication required", status: 401 }
        // MUST be "jwt": create/rotate/revoke gate their org-permission check
        // on `authMethod === "jwt" && ctx.userId`. A wrong value here would
        // skip the guard and make every management assertion below vacuous.
        : { ctx: { orgId: "org_1", userId: "u_1", authMethod: "jwt", scopes: ["admin"] } },
  }));
  vi.doMock("@/lib/org/context", () => ({
    requireOrgActor: async (_r: unknown, orgId: string) =>
      opts.orgMismatch || orgId !== "org_1"
        ? { error: "Not a member of this organization", status: 403 }
        : { ctx: { orgId: "org_1", userId: "u_1", role, status: "ACTIVE" } },
  }));
  // data layers stay inert — authorization must decide before any read/write
  vi.doMock("@/lib/api/rate-limit", () => ({ getRateLimitStatus: async () => ({ minute: {}, day: {} }) }));
  vi.doMock("@/lib/api/meter", () => ({ getApiUsageSummary: async () => [] }));
}

afterEach(() => {
  vi.doUnmock("@/lib/api/auth");
  vi.doUnmock("@/lib/org/context");
  vi.resetModules();
});

// ── 1. permission matrix ─────────────────────────────────────────────────────

describe("87L.6H.1 — permission matrix implements the owner contract", () => {
  const EXPECTED: Record<string, Record<OrgPermission, boolean>> = {
    OWNER:         { view_api_usage: true,  view_api_keys: true,  manage_api_keys: true  } as never,
    ADMIN:         { view_api_usage: true,  view_api_keys: true,  manage_api_keys: true  } as never,
    MANAGER:       { view_api_usage: true,  view_api_keys: true,  manage_api_keys: true  } as never,
    ENGINEER:      { view_api_usage: true,  view_api_keys: false, manage_api_keys: false } as never,
    VIEWER:        { view_api_usage: false, view_api_keys: false, manage_api_keys: false } as never,
    BILLING_ADMIN: { view_api_usage: true,  view_api_keys: true,  manage_api_keys: false } as never,
  };

  it.each(ROLES)("%s holds exactly the intended API-platform permissions", (role) => {
    for (const perm of ["view_api_usage", "view_api_keys", "manage_api_keys"] as OrgPermission[]) {
      expect(can(role, perm), `${role} / ${perm}`).toBe(EXPECTED[role][perm]);
    }
  });

  it("ENGINEER gains usage but LOSES key inventory (the whole point of the split)", () => {
    expect(can("ENGINEER", "view_api_usage" as OrgPermission)).toBe(true);
    expect(can("ENGINEER", "view_api_keys" as OrgPermission)).toBe(false);
    expect(can("ENGINEER", "manage_api_keys" as OrgPermission)).toBe(false);
  });

  it("unmapped Prisma roles are denied all three (deny by default)", () => {
    for (const role of UNMAPPED_ROLES) {
      for (const perm of ["view_api_usage", "view_api_keys", "manage_api_keys"] as OrgPermission[]) {
        expect(can(role, perm), `${role} gained ${perm}`).toBe(false);
      }
    }
  });

  it("ANTI-VACUITY: the three permissions are not uniformly false", () => {
    const granted = ROLES.flatMap((r) =>
      (["view_api_usage", "view_api_keys", "manage_api_keys"] as OrgPermission[]).filter((p) => can(r, p))
    );
    expect(granted.length, "matrix is degenerate").toBeGreaterThan(0);
    // ...and not uniformly true either
    expect(can("VIEWER", "manage_api_keys" as OrgPermission)).toBe(false);
  });

  it("the three permissions are genuinely distinct, not aliases", () => {
    // ENGINEER separates usage from inventory; BILLING_ADMIN separates
    // inventory from management. If any two collapsed, one of these fails.
    expect(can("ENGINEER", "view_api_usage" as OrgPermission))
      .not.toBe(can("ENGINEER", "view_api_keys" as OrgPermission));
    expect(can("BILLING_ADMIN", "view_api_keys" as OrgPermission))
      .not.toBe(can("BILLING_ADMIN", "manage_api_keys" as OrgPermission));
  });
});

// ── 2. usage endpoints (real handlers) ───────────────────────────────────────

async function callUsage(route: "usage" | "rate-limits", role: OrgRole | null) {
  mockPlatform(role);
  const mod = route === "usage"
    ? await import("@/app/api/platform/usage/route")
    : await import("@/app/api/platform/rate-limits/route");
  return (mod as { GET: (r: NextRequest) => Promise<Response> }).GET(req(`/api/platform/${route}`));
}

describe("87L.6H.1 — usage endpoints require view_api_usage", () => {
  for (const route of ["usage", "rate-limits"] as const) {
    it(`GET /api/platform/${route}: ENGINEER is ALLOWED (operational monitoring)`, async () => {
      const res = await callUsage(route, "ENGINEER");
      expect(res.status, `${route} wrongly denied ENGINEER`).not.toBe(403);
      expect(res.status).toBeLessThan(500);
    });

    it(`GET /api/platform/${route}: ADMIN and OWNER are allowed`, async () => {
      for (const role of ["ADMIN", "OWNER"] as OrgRole[]) {
        const res = await callUsage(route, role);
        expect(res.status, `${route} denied ${role}`).not.toBe(403);
      }
    });

    it(`GET /api/platform/${route}: VIEWER is denied 403`, async () => {
      const res = await callUsage(route, "VIEWER");
      expect(res.status).toBe(403);
    });

    it(`GET /api/platform/${route}: unmapped role is denied 403`, async () => {
      const res = await callUsage(route, "HR_MANAGER" as unknown as OrgRole);
      expect(res.status).toBe(403);
    });

    it(`GET /api/platform/${route}: anonymous receives 401, not 403`, async () => {
      const res = await callUsage(route, null);
      expect(res.status).toBe(401);
    });
  }

  it("usage responses carry no key identity (cannot enumerate the inventory)", async () => {
    for (const route of ["usage", "rate-limits"] as const) {
      const res = await callUsage(route, "ENGINEER");
      const body = JSON.stringify(await res.json());
      for (const leak of ["rawKey", "keyHash", "prefix", "last4", "scopes", "hermes_sk"]) {
        expect(body, `${route} leaked ${leak}`).not.toContain(leak);
      }
    }
  });
});

// ── 3. key inventory (real handler) ──────────────────────────────────────────

async function callKeysGet(role: OrgRole | null) {
  mockPlatform(role);
  vi.doMock("@/lib/api/keys", () => ({
    listApiKeys: async () => [{
      id: "k1", organizationId: "org_1", name: "CI", prefix: "abcd1234", last4: "ef01",
      scopes: ["industrial.read"], lastUsedAt: null, expiresAt: null, createdById: null,
      revokedAt: null, revokedById: null, createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }],
    createApiKey: async () => ({ ok: false, error: "not called" }),
  }));
  const mod = await import("@/app/api/platform/keys/route");
  return (mod as { GET: (r: NextRequest) => Promise<Response> }).GET(req("/api/platform/keys"));
}

describe("87L.6H.1 — key inventory requires view_api_keys", () => {
  afterEach(() => vi.doUnmock("@/lib/api/keys"));

  it("ENGINEER is DENIED 403 (cannot enumerate keys)", async () => {
    expect((await callKeysGet("ENGINEER")).status).toBe(403);
  });

  it("VIEWER and unmapped roles are denied 403", async () => {
    expect((await callKeysGet("VIEWER")).status).toBe(403);
    expect((await callKeysGet("HR_MANAGER" as unknown as OrgRole)).status).toBe(403);
  });

  it("ADMIN, OWNER and MANAGER are allowed", async () => {
    for (const role of ["ADMIN", "OWNER", "MANAGER"] as OrgRole[]) {
      const res = await callKeysGet(role);
      expect(res.status, `${role} denied`).not.toBe(403);
    }
  });

  it("anonymous receives 401", async () => {
    expect((await callKeysGet(null)).status).toBe(401);
  });

  it("an authorized listing still contains NO secret material", async () => {
    const res = await callKeysGet("ADMIN");
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain("rawKey");
    expect(body).not.toContain("keyHash");
    expect(body).not.toMatch(/hermes_sk[_a-z0-9]/i);
    // the safe metadata IS present, proving the handler really ran
    expect(body).toContain("abcd1234");
  });

  it("a denied listing never reaches the key store", async () => {
    vi.resetModules();
    const listApiKeys = vi.fn(async () => []);
    mockPlatform("ENGINEER");
    vi.doMock("@/lib/api/keys", () => ({ listApiKeys, createApiKey: async () => ({ ok: false, error: "x" }) }));
    const mod = await import("@/app/api/platform/keys/route");
    const res = await (mod as { GET: (r: NextRequest) => Promise<Response> }).GET(req("/api/platform/keys"));
    expect(res.status).toBe(403);
    expect(listApiKeys, "key store read despite 403").not.toHaveBeenCalled();
  });
});

// ── 4. key management: create / rotate / revoke (real handlers) ──────────────

describe("87L.6H.1 — create, rotate and revoke require manage_api_keys", () => {
  afterEach(() => vi.doUnmock("@/lib/api/keys"));

  async function callCreate(role: OrgRole | null, opts: { orgMismatch?: boolean } = {}) {
    mockPlatform(role, opts);
    vi.doMock("@/lib/api/keys", () => ({
      listApiKeys: async () => [],
      createApiKey: async () => ({ ok: true, key: { id: "k1", name: "n", rawKey: "hermes_sk_SECRET" } }),
    }));
    const mod = await import("@/app/api/platform/keys/route");
    return (mod as { POST: (r: NextRequest) => Promise<Response> }).POST(
      new NextRequest("http://localhost:3000/api/platform/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "CI", scopes: ["industrial.read"] }),
      }),
    );
  }

  async function callRevoke(role: OrgRole | null, opts: { orgMismatch?: boolean } = {}) {
    mockPlatform(role, opts);
    vi.doMock("@/lib/api/keys", () => ({ revokeApiKey: async () => ({ ok: true }) }));
    const mod = await import("@/app/api/platform/keys/[id]/route");
    return (mod as { DELETE: (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response> })
      .DELETE(req("/api/platform/keys/k1"), { params: Promise.resolve({ id: "k1" }) });
  }

  async function callRotate(role: OrgRole | null, opts: { orgMismatch?: boolean } = {}) {
    mockPlatform(role, opts);
    vi.doMock("@/lib/api/keys", () => ({
      rotateApiKey: async () => ({ ok: true, key: { id: "k2", rawKey: "hermes_sk_NEW" }, revokedKeyId: "k1" }),
    }));
    const mod = await import("@/app/api/platform/keys/[id]/rotate/route");
    return (mod as { POST: (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response> })
      .POST(req("/api/platform/keys/k1/rotate"), { params: Promise.resolve({ id: "k1" }) });
  }

  const OPS = [
    ["create", callCreate],
    ["revoke", callRevoke],
    ["rotate", callRotate],
  ] as const;

  for (const [name, call] of OPS) {
    it(`${name}: ENGINEER is denied 403`, async () => {
      expect((await call("ENGINEER")).status, `${name} allowed ENGINEER`).toBe(403);
    });

    it(`${name}: VIEWER and unmapped roles are denied 403`, async () => {
      expect((await call("VIEWER")).status).toBe(403);
      expect((await call("HR_MANAGER" as unknown as OrgRole)).status).toBe(403);
    });

    it(`${name}: ADMIN and OWNER are allowed`, async () => {
      for (const role of ["ADMIN", "OWNER"] as OrgRole[]) {
        const res = await call(role);
        expect(res.status, `${name} denied ${role}`).not.toBe(403);
        expect(res.status).toBeLessThan(500);
      }
    });

    it(`${name}: anonymous receives 401`, async () => {
      expect((await call(null)).status).toBe(401);
    });

    it(`${name}: a cross-organization actor is denied (no IDOR)`, async () => {
      // the option must be threaded INTO the call — the helper re-mounts the
      // mocks, so setting it beforehand would be silently overwritten.
      const res = await call("ADMIN", { orgMismatch: true });
      expect([401, 403], `${name} allowed a non-member`).toContain(res.status);
      // positive control: the SAME call succeeds for a real member
      expect((await call("ADMIN")).status).toBeLessThan(400);
    });
  }

  it("the one-time secret is returned ONLY on create/rotate, to authorized roles", async () => {
    const created = JSON.stringify(await (await callCreate("ADMIN")).json());
    expect(created, "create must return the one-time secret").toContain("hermes_sk_SECRET");
    // ...and an engineer never reaches that response at all
    const denied = await callCreate("ENGINEER");
    expect(denied.status).toBe(403);
    expect(JSON.stringify(await denied.json())).not.toContain("hermes_sk");
  });
});

describe("87L.6H.1A — management guards delegate to the fail-closed helper", () => {
  /**
   * SUPERSEDES the 87L.6H.1 source-text guard, which asserted each handler
   * contained its own `authMethod === "apikey"` branch. That branching was the
   * defect: two positive conditions with no exhaustive default. Authorization
   * now lives in one helper whose `default:` denies, so the handlers must
   * DELEGATE rather than re-implement. Runtime proof lives in
   * platform-actor-fail-closed.test.ts.
   */
  it("every platform handler delegates to authorizePlatformActor", async () => {
    const fs = await import("node:fs/promises");
    for (const p of [
      "src/app/api/platform/keys/route.ts",
      "src/app/api/platform/keys/[id]/route.ts",
      "src/app/api/platform/keys/[id]/rotate/route.ts",
      "src/app/api/platform/usage/route.ts",
      "src/app/api/platform/rate-limits/route.ts",
    ]) {
      const src = await fs.readFile(p, "utf8");
      expect(src, `${p} does not delegate`).toContain("authorizePlatformActor(req, ctx,");
      // no handler may reintroduce its own positive-only branching
      expect(src, `${p} reintroduced positive branching`).not.toMatch(/if \(ctx\.authMethod === "jwt"/);
      expect(src, `${p} reintroduced a negative-only branch`).not.toMatch(/if \(ctx\.authMethod !== "apikey"\)/);
    }
  });

  it("the helper's switch has an explicit denying default", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/lib/api/authorize.ts", "utf8");
    expect(src).toMatch(/default:/);
    const tail = src.slice(src.indexOf("default:"));
    expect(tail, "default branch does not deny").toMatch(/return deny\(/);
  });
});

describe("87L.6H.1A — role-count reconciliation (deny by default)", () => {
  /**
   * PHASE 87L.6H reported "9 roles outside the application union"; PHASE
   * 87L.6H.1 reported "8 unmapped". Both counts were arithmetically right but
   * measured DIFFERENT sets, and neither report said which:
   *
   *   8 = Prisma roles absent from the application `OrgRole` union
   *   9 = Prisma roles absent from the PERMISSIONS matrix
   *
   * The difference is exactly MEMBER: it IS in the union (deprecated, migrated
   * to ENGINEER in Phase 32) but appears in NO permission row, so it holds
   * nothing. No permission was changed to reconcile the count — the sets are
   * enumerated literally below so the ambiguity cannot recur.
   */

  /** In the Prisma enum, absent from the application union. */
  const ABSENT_FROM_UNION = [
    "HR_MANAGER", "RECRUITER", "HIRING_MANAGER", "INTERVIEWER",
    "ACADEMY_ADMIN", "CUSTOMER_SUCCESS_MANAGER", "STUDENT", "COMPLIANCE_MANAGER",
  ] as const;

  /** In the union but holding no permission at all. */
  const IN_UNION_BUT_UNPRIVILEGED = ["MEMBER"] as const;

  const ALL_UNPRIVILEGED = [...ABSENT_FROM_UNION, ...IN_UNION_BUT_UNPRIVILEGED];

  it("the two counts are 8 and 9, differing by exactly MEMBER", () => {
    expect(ABSENT_FROM_UNION.length).toBe(8);
    expect(ALL_UNPRIVILEGED.length).toBe(9);
    expect(ALL_UNPRIVILEGED.filter((r) => !ABSENT_FROM_UNION.includes(r as never))).toEqual(["MEMBER"]);
  });

  it("the enumerated lists still match the real Prisma enum and app union", async () => {
    const fs = await import("node:fs/promises");
    const schema = await fs.readFile("prisma/schema.prisma", "utf8");
    const prisma = schema.match(/enum OrgRole \{([\s\S]*?)\}/)![1]
      .split("\n").map((l) => l.replace(/\/\/.*/, "").trim()).filter(Boolean);
    const types = await fs.readFile("src/lib/org/types.ts", "utf8");
    const union = types.match(/export type OrgRole\s*=([^;]+);/)![1]
      .split("|").map((x) => x.trim().replace(/"/g, ""));

    expect(prisma.length, "Prisma OrgRole membership changed").toBe(15);
    expect(union.length, "application OrgRole union changed").toBe(7);
    expect(prisma.filter((r) => !union.includes(r)).sort())
      .toEqual([...ABSENT_FROM_UNION].sort());
  });

  it("every unprivileged role is denied all three API-platform permissions", () => {
    for (const role of ALL_UNPRIVILEGED) {
      for (const perm of ["view_api_usage", "view_api_keys", "manage_api_keys"] as OrgPermission[]) {
        expect(can(role as unknown as OrgRole, perm), `${role} holds ${perm}`).toBe(false);
      }
    }
  });

  it("every unprivileged role is denied the billing permissions too", () => {
    for (const role of ALL_UNPRIVILEGED) {
      for (const perm of ["view_billing", "manage_billing"] as OrgPermission[]) {
        expect(can(role as unknown as OrgRole, perm), `${role} holds ${perm}`).toBe(false);
      }
    }
  });

  it("MANAGER and BILLING_ADMIN were not elevated by the split", () => {
    // MANAGER: had view+manage keys before 87L.6H.1, keeps both, gains usage.
    expect(can("MANAGER", "view_api_usage" as OrgPermission)).toBe(true);
    expect(can("MANAGER", "view_api_keys" as OrgPermission)).toBe(true);
    expect(can("MANAGER", "manage_api_keys" as OrgPermission)).toBe(true);
    expect(can("MANAGER", "manage_billing" as OrgPermission)).toBe(false);
    expect(can("MANAGER", "view_billing" as OrgPermission)).toBe(false);
    // BILLING_ADMIN: had view keys (not manage), keeps that, gains usage.
    expect(can("BILLING_ADMIN", "view_api_usage" as OrgPermission)).toBe(true);
    expect(can("BILLING_ADMIN", "view_api_keys" as OrgPermission)).toBe(true);
    expect(can("BILLING_ADMIN", "manage_api_keys" as OrgPermission)).toBe(false);
  });
});
