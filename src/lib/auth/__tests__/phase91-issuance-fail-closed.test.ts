import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * PHASE 91 closure — mode-aware, fail-closed credential issuance.
 *
 * DATABASE mode must never return a credential without a persisted server-side
 * session (`sid`): any degraded condition throws SessionPersistenceError. Only
 * EXPLICIT session mode may mint a sid-less token. A generation moved by a
 * kill-switch during a login fails closed.
 */

const USER = { id: "u1", email: "u1@x", role: "customer" as const, name: "U1" };

async function load(mode: "database" | "session", db: unknown) {
  vi.resetModules();
  vi.doMock("@/lib/storage/storage-mode", () => ({ getStorageMode: () => mode, isDatabaseMode: () => mode === "database" }));
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => db }));
  return import("@/lib/auth/token-session");
}

afterEach(() => {
  vi.doUnmock("@/lib/storage/storage-mode");
  vi.doUnmock("@/lib/db/prisma");
  vi.restoreAllMocks();
});

const okUser = (tokenVersion = 0) => ({ user: { findUnique: async () => ({ id: "u1", tokenVersion }) } });

describe("Phase 91 — DATABASE mode fails closed", () => {
  it("Prisma unavailable → throws SessionPersistenceError, no credential", async () => {
    const { issueTokens, SessionPersistenceError } = await load("database", null);
    await expect(issueTokens(USER, false)).rejects.toBeInstanceOf(SessionPersistenceError);
  });

  it("RefreshToken.create throws → throws SessionPersistenceError", async () => {
    const db = { ...okUser(), refreshToken: { create: async () => { throw new Error("db boom"); } } };
    const { issueTokens, SessionPersistenceError } = await load("database", db);
    await expect(issueTokens(USER, false)).rejects.toBeInstanceOf(SessionPersistenceError);
  });

  it("created session row without an id → throws SessionPersistenceError", async () => {
    const db = { ...okUser(), refreshToken: { create: async () => ({}) } };
    const { issueTokens, SessionPersistenceError } = await load("database", db);
    await expect(issueTokens(USER, false)).rejects.toBeInstanceOf(SessionPersistenceError);
  });

  it("user missing at persistence boundary (removal) → throws SessionPersistenceError", async () => {
    const db = { user: { findUnique: async () => null }, refreshToken: { create: async () => ({ id: "x" }) } };
    const { issueTokens, SessionPersistenceError } = await load("database", db);
    await expect(issueTokens(USER, false)).rejects.toBeInstanceOf(SessionPersistenceError);
  });

  it("generation moved since authentication (reset/suspend race) → throws SessionPersistenceError", async () => {
    const db = { ...okUser(5), refreshToken: { create: async () => ({ id: "x" }) } };
    const { issueTokens, SessionPersistenceError } = await load("database", db);
    await expect(issueTokens(USER, false, { expectedVersion: 4 })).rejects.toBeInstanceOf(SessionPersistenceError);
  });

  it("success → ALWAYS a non-null sid stamped with the owner's generation", async () => {
    const created: Record<string, unknown>[] = [];
    const db = {
      ...okUser(3),
      refreshToken: { create: async (a: { data: Record<string, unknown> }) => { created.push(a.data); return { id: "sid-1", ...a.data }; } },
    };
    const { issueTokens } = await load("database", db);
    const r = await issueTokens(USER, false, { deviceInfo: "UA", expectedVersion: 3 });
    expect(r.sid).toBe("sid-1");           // never null in database mode
    expect(typeof r.accessToken).toBe("string");
    expect(typeof r.refreshToken).toBe("string");
    expect(created[0].userTokenVersion).toBe(3);
  });
});

describe("Phase 91 — SESSION mode may mint a sid-less token", () => {
  it("explicit session mode → sid is null, no throw even with no database", async () => {
    const { issueTokens } = await load("session", null);
    const r = await issueTokens(USER, false);
    expect(r.sid).toBeNull();
    expect(typeof r.accessToken).toBe("string");
  });
});
