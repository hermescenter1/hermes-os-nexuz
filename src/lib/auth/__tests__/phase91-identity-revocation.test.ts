import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * PHASE 91 — regression guard for the revocation-bypass finding.
 *
 * getCurrentUser (legacy HMAC cookie) and getTokenUser (access token) are the
 * identity gate on ~130 API routes that do NOT go through requireOrgActor. Both
 * MUST reject a sid-bound credential whose server-side session has been revoked;
 * before the fix they accepted the signed cookie/token until its natural expiry,
 * defeating logout / admin-suspend / password-reset across most of the API.
 */

const MOCKED = ["next/headers", "@/lib/auth/crypto", "@/lib/auth/jwt", "@/lib/db/prisma"];

beforeEach(() => vi.resetModules());
afterEach(() => { for (const m of MOCKED) vi.doUnmock(m); vi.restoreAllMocks(); });

const FUTURE = new Date(Date.now() + 3600_000);

function mockCookie(name: string, value: string) {
  vi.doMock("next/headers", () => ({
    cookies: async () => ({ get: (n: string) => (n === name ? { value } : undefined) }),
  }));
}
function mockSessionRow(row: Record<string, unknown> | null) {
  vi.doMock("@/lib/db/prisma", () => ({
    getPrisma: async () => ({ refreshToken: { findUnique: async () => row, update: async () => ({}) } }),
  }));
}

describe("Phase 91 — getCurrentUser (legacy cookie) enforces revocation", () => {
  const payload = (sid?: string) => ({ userId: "u1", email: "u1@x", role: "admin", name: "U1", iat: Date.now(), ...(sid ? { sid } : {}) });

  it("revoked sid → null (previously: admin access until the 30-day ceiling)", async () => {
    mockCookie("hermes_session", "signed");
    vi.doMock("@/lib/auth/crypto", () => ({ verifySession: () => payload("sid1") }));
    mockSessionRow({ id: "sid1", revokedAt: new Date(), expiresAt: FUTURE, user: { tokenVersion: 0 }, userTokenVersion: 0 });
    const { getCurrentUser } = await import("@/lib/auth/session");
    expect(await getCurrentUser()).toBeNull();
  });

  it("active sid → user resolved", async () => {
    mockCookie("hermes_session", "signed");
    vi.doMock("@/lib/auth/crypto", () => ({ verifySession: () => payload("sid1") }));
    mockSessionRow({ id: "sid1", revokedAt: null, expiresAt: FUTURE, user: { tokenVersion: 0 }, userTokenVersion: 0 });
    const { getCurrentUser } = await import("@/lib/auth/session");
    expect((await getCurrentUser())?.id).toBe("u1");
  });

  it("legacy cookie WITHOUT sid → allowed unchanged (backward compatible)", async () => {
    mockCookie("hermes_session", "signed");
    vi.doMock("@/lib/auth/crypto", () => ({ verifySession: () => payload() }));
    vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => null }));
    const { getCurrentUser } = await import("@/lib/auth/session");
    expect((await getCurrentUser())?.id).toBe("u1");
  });
});

describe("Phase 91 — getTokenUser (access token) enforces revocation", () => {
  const payload = (sid?: string) => ({ sub: "u1", email: "u1@x", role: "admin", name: "U1", ...(sid ? { sid } : {}) });

  it("revoked sid → null", async () => {
    mockCookie("hermes_at", "at");
    vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => payload("sid1") }));
    mockSessionRow({ id: "sid1", revokedAt: new Date(), expiresAt: FUTURE, user: { tokenVersion: 0 }, userTokenVersion: 0 });
    const { getTokenUser } = await import("@/lib/auth/token-session");
    expect(await getTokenUser()).toBeNull();
  });

  it("active sid → user resolved", async () => {
    mockCookie("hermes_at", "at");
    vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => payload("sid1") }));
    mockSessionRow({ id: "sid1", revokedAt: null, expiresAt: FUTURE, user: { tokenVersion: 0 }, userTokenVersion: 0 });
    const { getTokenUser } = await import("@/lib/auth/token-session");
    expect((await getTokenUser())?.id).toBe("u1");
  });
});
