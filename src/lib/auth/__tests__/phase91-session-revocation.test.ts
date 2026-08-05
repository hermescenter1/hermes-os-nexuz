import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";

/**
 * PHASE 91 — REVOCABLE_SESSIONS proof at the guard boundary.
 *
 * requireOrgActor authenticates via the access token. When that token is bound
 * to a session (`sid`) whose server-side record has been revoked, the guard must
 * reject on THIS request — not merely when the token expires. Legacy tokens with
 * no sid keep working (backward compatibility). Also proves the atomic rotation
 * claim rejects a replayed refresh token.
 */

const MOCKED = ["@/lib/auth/jwt", "@/lib/db/prisma"];

function req(): NextRequest {
  return new NextRequest("http://localhost/api/organizations/org1/members", {
    headers: { cookie: `${ACCESS_TOKEN_COOKIE}=t` },
  });
}

const FUTURE = new Date(Date.now() + 3600_000);

function dbWith(session: Record<string, unknown> | null, member: Record<string, unknown> | null) {
  return {
    refreshToken: { findUnique: async () => session, update: async () => ({}) },
    organizationMember: { findFirst: async () => member },
  };
}

beforeEach(() => vi.resetModules());
afterEach(() => {
  for (const m of MOCKED) vi.doUnmock(m);
  vi.restoreAllMocks();
});

async function loadContext(payload: unknown, db: unknown) {
  vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => payload }));
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => db }));
  return import("@/lib/org/context");
}

const ACTIVE_MEMBER = { id: "m1", organizationId: "org1", role: "ADMIN", status: "ACTIVE" };

describe("Phase 91 — requireOrgActor enforces session revocation", () => {
  it("active sid + ACTIVE member → authorized", async () => {
    const db = dbWith({ id: "sid1", revokedAt: null, expiresAt: FUTURE }, ACTIVE_MEMBER);
    const { requireOrgActor } = await loadContext({ sub: "u1", sid: "sid1" }, db);
    const res = await requireOrgActor(req(), "org1");
    expect("ctx" in res).toBe(true);
  });

  it("REVOKED sid → 401 even though the member is ACTIVE", async () => {
    const db = dbWith({ id: "sid1", revokedAt: new Date(), expiresAt: FUTURE }, ACTIVE_MEMBER);
    const { requireOrgActor } = await loadContext({ sub: "u1", sid: "sid1" }, db);
    const res = await requireOrgActor(req(), "org1");
    expect("error" in res && res.status).toBe(401);
  });

  it("legacy token WITHOUT sid still authorizes (backward compatible)", async () => {
    const db = dbWith(null, ACTIVE_MEMBER); // session check never consulted
    const { requireOrgActor } = await loadContext({ sub: "u1" }, db);
    const res = await requireOrgActor(req(), "org1");
    expect("ctx" in res).toBe(true);
  });

  it("active sid but NOT a member → 403 (no session bypass of tenancy)", async () => {
    const db = dbWith({ id: "sid1", revokedAt: null, expiresAt: FUTURE }, null);
    const { requireOrgActor } = await loadContext({ sub: "u1", sid: "sid1" }, db);
    const res = await requireOrgActor(req(), "org1");
    expect("error" in res && res.status).toBe(403);
  });
});

describe("Phase 91 — refresh rotation rejects concurrent replay", () => {
  it("second concurrent use of the same refresh token loses the atomic claim", async () => {
    let claims = 0;
    const db = {
      refreshToken: {
        // Both concurrent readers observe an un-revoked row...
        findUnique: async () => ({ id: "sid1", userId: "u1", tokenHash: "h", revokedAt: null, expiresAt: FUTURE }),
        // ...but only the first conditional update matches (count 1); the loser gets 0.
        updateMany: async () => { claims += 1; return { count: claims === 1 ? 1 : 0 }; },
        update: async () => ({}),
        create: async () => ({ id: "sid2" }),
      },
      user: { findUnique: async () => ({ id: "u1", email: "u1@x", role: "customer", name: "U1" }) },
    };
    vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => db }));
    const { rotateRefreshToken } = await import("@/lib/auth/token-session");

    const first = await rotateRefreshToken("plaintext-token");
    const second = await rotateRefreshToken("plaintext-token");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.ok === false && second.error).toBe("revoked");
  });

  it("rotation refuses when a kill-switch bumped the owner's generation past this chain", async () => {
    const db = {
      refreshToken: {
        // The row was minted at generation 1...
        findUnique: async () => ({ id: "sid1", userId: "u1", tokenHash: "h", revokedAt: null, expiresAt: FUTURE, userTokenVersion: 1 }),
        updateMany: async () => ({ count: 1 }),
        update: async () => ({}),
        create: async () => ({ id: "sid2" }),
      },
      // ...but a revoke-all has since moved the owner to generation 2.
      user: { findUnique: async () => ({ id: "u1", email: "u1@x", role: "customer", name: "U1", tokenVersion: 2 }) },
    };
    vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => db }));
    const { rotateRefreshToken } = await import("@/lib/auth/token-session");
    const r = await rotateRefreshToken("plaintext-token");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("revoked");
  });
});
