import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * PHASE 91 closure — atomic refresh rotation. Claim-old + create-successor run
 * in one transaction, returning the signed access token, the new refresh token,
 * and the successor sid. Reachable end states are only State A (no successor) or
 * State B (old claimed + exactly one successor). No sid-less successor.
 */

const FUTURE = new Date(Date.now() + 3600_000);

async function load(db: unknown) {
  vi.resetModules();
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => db }));
  return import("@/lib/auth/token-session");
}
afterEach(() => { vi.doUnmock("@/lib/db/prisma"); vi.restoreAllMocks(); });

describe("Phase 91 — atomic rotation", () => {
  it("State B: claims old, creates EXACTLY ONE successor stamped with the validated generation", async () => {
    const created: Record<string, unknown>[] = [];
    let claims = 0;
    const db = {
      refreshToken: {
        findUnique: async () => ({ id: "old", userId: "u1", tokenHash: "h", revokedAt: null, expiresAt: FUTURE, userTokenVersion: 2 }),
        updateMany: async () => { claims += 1; return { count: 1 }; },
        update: async () => ({}),
        create: async (a: { data: Record<string, unknown> }) => { created.push(a.data); return { id: "new-sid", ...a.data }; },
      },
      user: { findUnique: async () => ({ id: "u1", email: "u1@x", role: "customer", name: "U1", tokenVersion: 2 }) },
    };
    const { rotateRefreshToken } = await load(db);
    const r = await rotateRefreshToken("plain");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sid).toBe("new-sid");
      expect(typeof r.accessToken).toBe("string");
      expect(typeof r.refreshToken).toBe("string");
    }
    expect(claims).toBe(1);               // old claimed once
    expect(created).toHaveLength(1);      // exactly one successor
    expect(created[0].userTokenVersion).toBe(2);
    expect(created[0].tokenHash).not.toBe("h"); // successor uses a fresh token
  });

  it("successor persistence failure fails closed (persist-failed) — never a sid-less success", async () => {
    const db = {
      refreshToken: {
        findUnique: async () => ({ id: "old", userId: "u1", revokedAt: null, expiresAt: FUTURE, userTokenVersion: 0 }),
        updateMany: async () => ({ count: 1 }),
        update: async () => ({}),
        create: async () => ({}), // no id → persistSessionRow throws → tx rolls back
      },
      user: { findUnique: async () => ({ id: "u1", email: "u1@x", role: "customer", name: "U1", tokenVersion: 0 }) },
    };
    const { rotateRefreshToken } = await load(db);
    const r = await rotateRefreshToken("plain");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("persist-failed");
  });

  it("db unavailable → db-unavailable (no successor, old refresh untouched)", async () => {
    const { rotateRefreshToken } = await load(null);
    const r = await rotateRefreshToken("plain");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("db-unavailable");
  });

  it("parallel replay: two uses of the same refresh token — one succeeds, one is rejected", async () => {
    let claims = 0;
    const db = {
      refreshToken: {
        findUnique: async () => ({ id: "old", userId: "u1", revokedAt: null, expiresAt: FUTURE, userTokenVersion: 0 }),
        updateMany: async () => { claims += 1; return { count: claims === 1 ? 1 : 0 }; },
        update: async () => ({}),
        create: async () => ({ id: "new-sid" }),
      },
      user: { findUnique: async () => ({ id: "u1", email: "u1@x", role: "customer", name: "U1", tokenVersion: 0 }) },
    };
    const { rotateRefreshToken } = await load(db);
    const first = await rotateRefreshToken("plain");
    const second = await rotateRefreshToken("plain");
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe("revoked");
  });
});
