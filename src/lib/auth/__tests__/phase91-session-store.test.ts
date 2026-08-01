import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * PHASE 91 — the RefreshToken row is the server-authoritative session record.
 * These tests pin the store's fail-closed semantics, owner-scoping, and the
 * guarantee that a session summary NEVER exposes the token hash.
 */

interface Row {
  id: string;
  userId: string;
  tokenHash: string;
  revokedAt: Date | null;
  expiresAt: Date;
  deviceInfo: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

function matchWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(where)) {
    const rv = row[k];
    if (v === null) {
      if (rv !== null && rv !== undefined) return false;
    } else if (typeof v === "object" && v !== null && "not" in (v as object)) {
      if (rv === (v as { not: unknown }).not) return false;
    } else if (typeof v === "object" && v !== null && "gt" in (v as object)) {
      if (!(new Date(rv as string) > new Date((v as { gt: Date }).gt))) return false;
    } else if (rv !== v) {
      return false;
    }
  }
  return true;
}

function fakeDb(rows: Row[]) {
  return {
    refreshToken: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        rows.find((r) => (r as unknown as Record<string, unknown>).id === where.id) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        rows.filter((r) => matchWhere(r as unknown as Record<string, unknown>, where)),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = rows.find((x) => x.id === where.id);
        if (r) Object.assign(r, data);
        return r ?? {};
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const r of rows) {
          if (matchWhere(r as unknown as Record<string, unknown>, where)) {
            Object.assign(r, data);
            count++;
          }
        }
        return { count };
      },
    },
  };
}

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
const PAST = new Date(Date.now() - 60 * 60 * 1000);

function row(id: string, userId: string, over: Partial<Row> = {}): Row {
  return {
    id, userId,
    tokenHash: `hash-${id}-SECRET`,
    revokedAt: null,
    expiresAt: FUTURE,
    deviceInfo: "UA/test",
    lastUsedAt: null,
    createdAt: new Date("2026-07-01"),
    ...over,
  };
}

async function withDb(rows: Row[]) {
  vi.resetModules();
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => fakeDb(rows) }));
  return import("@/lib/auth/session-store");
}

afterEach(() => {
  vi.doUnmock("@/lib/db/prisma");
  vi.restoreAllMocks();
});

describe("Phase 91 session-store — isSessionActive", () => {
  it("active row → true; touches lastUsedAt", async () => {
    const rows = [row("s1", "u1")];
    const store = await withDb(rows);
    expect(await store.isSessionActive("s1")).toBe(true);
  });

  it("revoked row → false", async () => {
    const store = await withDb([row("s1", "u1", { revokedAt: new Date() })]);
    expect(await store.isSessionActive("s1")).toBe(false);
  });

  it("expired row → false", async () => {
    const store = await withDb([row("s1", "u1", { expiresAt: PAST })]);
    expect(await store.isSessionActive("s1")).toBe(false);
  });

  it("missing row → false", async () => {
    const store = await withDb([]);
    expect(await store.isSessionActive("nope")).toBe(false);
  });

  it("no database → fail CLOSED (false), never open", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => null }));
    const store = await import("@/lib/auth/session-store");
    expect(await store.isSessionActive("s1")).toBe(false);
  });
});

describe("Phase 91 session-store — isPayloadSessionActive (backward compat)", () => {
  it("payload WITHOUT sid → allowed (legacy token)", async () => {
    const store = await withDb([]);
    expect(await store.isPayloadSessionActive({})).toBe(true);
  });

  it("payload WITH active sid → allowed", async () => {
    const store = await withDb([row("s1", "u1")]);
    expect(await store.isPayloadSessionActive({ sid: "s1" })).toBe(true);
  });

  it("payload WITH revoked sid → denied", async () => {
    const store = await withDb([row("s1", "u1", { revokedAt: new Date() })]);
    expect(await store.isPayloadSessionActive({ sid: "s1" })).toBe(false);
  });
});

describe("Phase 91 session-store — inventory & revocation", () => {
  it("listUserSessions returns opaque ids and NEVER the token hash", async () => {
    const store = await withDb([row("s1", "u1"), row("s2", "u1")]);
    const list = await store.listUserSessions("u1", "s1");
    expect(list.map((s) => s.id).sort()).toEqual(["s1", "s2"]);
    expect(list.find((s) => s.id === "s1")!.current).toBe(true);
    const serialized = JSON.stringify(list);
    expect(serialized).not.toContain("SECRET");
    expect(serialized).not.toContain("tokenHash");
  });

  it("revokeSession is owner-scoped: cannot revoke another user's session", async () => {
    const rows = [row("s1", "u1")];
    const store = await withDb(rows);
    // u2 attempts to revoke u1's session → false, and the row stays active.
    expect(await store.revokeSession("u2", "s1")).toBe(false);
    expect(rows[0].revokedAt).toBeNull();
    // owner can revoke it.
    expect(await store.revokeSession("u1", "s1")).toBe(true);
    expect(rows[0].revokedAt).not.toBeNull();
  });

  it("revokeOtherSessions keeps the current session and revokes the rest", async () => {
    const rows = [row("s1", "u1"), row("s2", "u1"), row("s3", "u1")];
    const store = await withDb(rows);
    const n = await store.revokeOtherSessions("u1", "s1");
    expect(n).toBe(2);
    expect(rows.find((r) => r.id === "s1")!.revokedAt).toBeNull();
    expect(rows.find((r) => r.id === "s2")!.revokedAt).not.toBeNull();
    expect(rows.find((r) => r.id === "s3")!.revokedAt).not.toBeNull();
  });

  it("revokeOtherSessions with null keep revokes ALL sessions", async () => {
    const rows = [row("s1", "u1"), row("s2", "u1")];
    const store = await withDb(rows);
    expect(await store.revokeOtherSessions("u1", null)).toBe(2);
  });
});

describe("Phase 91 session-store — generation floor (revoke-vs-rotate)", () => {
  function fakeDbVer(over: Record<string, unknown>, userTokenVersion: number) {
    return {
      refreshToken: {
        findUnique: async () => ({ revokedAt: null, expiresAt: FUTURE, lastUsedAt: null, ...over, user: { tokenVersion: userTokenVersion } }),
        update: async () => ({}),
      },
    };
  }
  async function load(db: unknown) {
    vi.resetModules();
    vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => db }));
    return import("@/lib/auth/session-store");
  }

  it("active when the session's stamp equals the owner's tokenVersion", async () => {
    const store = await load(fakeDbVer({ id: "s1", userTokenVersion: 2 }, 2));
    expect(await store.isSessionActive("s1")).toBe(true);
  });

  it("DEAD once the owner's tokenVersion moves past the session's stamp", async () => {
    const store = await load(fakeDbVer({ id: "s1", userTokenVersion: 1 }, 2));
    expect(await store.isSessionActive("s1")).toBe(false);
  });

  it("revokeAllSessions bumps the owner's tokenVersion FIRST, then revokes rows", async () => {
    let bumped: Record<string, unknown> | null = null;
    let revokedWhere: Record<string, unknown> | null = null;
    const db = {
      user: { update: async (a: Record<string, unknown>) => { bumped = a; return {}; } },
      refreshToken: { updateMany: async (a: { where: Record<string, unknown> }) => { revokedWhere = a.where; return { count: 3 }; } },
    };
    const store = await load(db);
    expect(await store.revokeAllSessions("u1")).toBe(3);
    expect((bumped as unknown as { where: { id: string } }).where.id).toBe("u1");
    expect((bumped as unknown as { data: { tokenVersion: unknown } }).data.tokenVersion).toEqual({ increment: 1 });
    expect((revokedWhere as unknown as { userId: string }).userId).toBe("u1");
  });

  it("revokeAllSessions fails CLOSED (0) if the version bump cannot be applied", async () => {
    const db = {
      user: { update: async () => { throw new Error("db down"); } },
      refreshToken: { updateMany: async () => ({ count: 5 }) },
    };
    const store = await load(db);
    expect(await store.revokeAllSessions("u1")).toBe(0);
  });
});
