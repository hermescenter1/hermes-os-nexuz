import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * PHASE 91 closure — atomic, generation-safe "log out other devices".
 * Invariants: KEPT_SESSION_ACTIVE, OTHER_ACTIVE_SESSIONS=0, no partial update,
 * no cross-user revocation, and a trustworthy revoked count + generation.
 */

const FUTURE = new Date(Date.now() + 3600_000);
const kept = (over: Record<string, unknown> = {}) => ({
  id: "keep", userId: "u1", revokedAt: null, expiresAt: FUTURE, userTokenVersion: 1,
  user: { tokenVersion: 1 }, ...over,
});

async function load(db: unknown) {
  vi.resetModules();
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => db }));
  return import("@/lib/auth/session-store");
}
afterEach(() => { vi.doUnmock("@/lib/db/prisma"); vi.restoreAllMocks(); });

describe("Phase 91 — revokeAllOtherSessionsAtomically", () => {
  it("happy path: bump generation, move kept to new gen, revoke only others", async () => {
    let userUpdate: Record<string, unknown> | null = null;
    let keptUpdate: Record<string, unknown> | null = null;
    let othersWhere: Record<string, unknown> | null = null;
    const db = {
      refreshToken: {
        findUnique: async () => kept(),
        update: async (a: Record<string, unknown>) => { keptUpdate = a; return {}; },
        updateMany: async (a: { where: Record<string, unknown> }) => { othersWhere = a.where; return { count: 4 }; },
      },
      user: { update: async (a: Record<string, unknown>) => { userUpdate = a; return { tokenVersion: 2 }; } },
    };
    const store = await load(db);
    const r = await store.revokeAllOtherSessionsAtomically("u1", "keep");
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.revoked).toBe(4); expect(r.generation).toBe(2); }
    expect((userUpdate as unknown as { data: { tokenVersion: unknown } }).data.tokenVersion).toEqual({ increment: 1 });
    expect((keptUpdate as unknown as { data: { userTokenVersion: number } }).data.userTokenVersion).toBe(2); // kept survives at new gen
    expect((othersWhere as unknown as { id: unknown }).id).toEqual({ not: "keep" });                        // only others
    expect((othersWhere as unknown as { userId: string }).userId).toBe("u1");                                // tenant/owner scoped
  });

  it("cross-user kept session → kept_invalid, no writes", async () => {
    let userTouched = false;
    const db = {
      refreshToken: { findUnique: async () => kept({ userId: "u2" }) },
      user: { update: async () => { userTouched = true; return {}; } },
    };
    const store = await load(db);
    const r = await store.revokeAllOtherSessionsAtomically("u1", "keep");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("kept_invalid");
    expect(userTouched).toBe(false);
  });

  it.each([
    ["revoked kept",  kept({ revokedAt: new Date() })],
    ["expired kept",  kept({ expiresAt: new Date(Date.now() - 1000) })],
    ["stale-gen kept", kept({ userTokenVersion: 0, user: { tokenVersion: 2 } })],
  ])("%s → kept_invalid", async (_label, row) => {
    const db = { refreshToken: { findUnique: async () => row }, user: { update: async () => ({}) } };
    const store = await load(db);
    const r = await store.revokeAllOtherSessionsAtomically("u1", "keep");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("kept_invalid");
  });

  it("store unavailable → unavailable", async () => {
    const store = await load(null);
    const r = await store.revokeAllOtherSessionsAtomically("u1", "keep");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("unavailable");
  });

  it("ordering 1 (refresh before revoke): an other session's successor carries the OLD generation and is dead", async () => {
    // The bump advanced the user to gen 2; a successor minted just before it
    // carries gen 1 → isSessionActive must reject it.
    const db = { refreshToken: { findUnique: async () => ({ id: "other", revokedAt: null, expiresAt: FUTURE, userTokenVersion: 1, user: { tokenVersion: 2 } }), update: async () => ({}) } };
    const store = await load(db);
    expect(await store.isSessionActive("other")).toBe(false);
  });
});
