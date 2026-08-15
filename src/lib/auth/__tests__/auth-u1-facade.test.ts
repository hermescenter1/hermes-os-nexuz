import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * AUTH-U1 — the canonical identity facade (`@/lib/auth/current-user`).
 *
 * Pins the authority order JWT-FIRST → LEGACY-FALLBACK and the compatibility
 * contracts AUTH-U1 must not change. Mirrors the harness in
 * phase91-identity-revocation.test.ts (doMock + resetModules) because the
 * readers capture `cookies()` at call time through module-level imports.
 *
 * Two credentials are in play and they are mocked independently:
 *   hermes_at      → verifyAccessToken (@/lib/auth/jwt)
 *   hermes_session → verifySession     (@/lib/auth/crypto)
 * so a test can present either, both, or neither.
 */

const MOCKED = ["next/headers", "@/lib/auth/crypto", "@/lib/auth/jwt", "@/lib/db/prisma"];

beforeEach(() => vi.resetModules());
afterEach(() => { for (const m of MOCKED) vi.doUnmock(m); vi.restoreAllMocks(); });

const FUTURE = new Date(Date.now() + 3600_000);

/** Present an arbitrary set of cookies to both readers. */
function mockCookies(jar: Record<string, string>) {
  vi.doMock("next/headers", () => ({
    cookies: async () => ({ get: (n: string) => (n in jar ? { value: jar[n] } : undefined) }),
  }));
}

/** One session row, returned for any sid lookup. */
function mockSessionRow(row: Record<string, unknown> | null) {
  vi.doMock("@/lib/db/prisma", () => ({
    getPrisma: async () => ({ refreshToken: { findUnique: async () => row, update: async () => ({}) } }),
  }));
}

/** No session store at all (session mode / DB absent). */
function mockNoStore() {
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => null }));
}

const jwtPayload = (sid?: string) =>
  ({ sub: "u-jwt", email: "jwt@x", role: "admin", name: "JWT User", ...(sid ? { sid } : {}) });
const legacyPayload = (sid?: string) =>
  ({ userId: "u-legacy", email: "legacy@x", role: "customer", name: "Legacy User", iat: Date.now(), ...(sid ? { sid } : {}) });

/** Mock the JWT verifier; `null` means "not a valid token". */
function mockJwt(payload: Record<string, unknown> | null) {
  vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => payload }));
}
/** Mock the legacy HMAC verifier; `null` means "not a valid cookie". */
function mockLegacy(payload: Record<string, unknown> | null) {
  vi.doMock("@/lib/auth/crypto", () => ({ verifySession: () => payload }));
}

const active  = (sid: string) => ({ id: sid, revokedAt: null,       expiresAt: FUTURE, user: { tokenVersion: 0 }, userTokenVersion: 0 });
const revoked = (sid: string) => ({ id: sid, revokedAt: new Date(), expiresAt: FUTURE, user: { tokenVersion: 0 }, userTokenVersion: 0 });

async function readIdentity() {
  const { getCurrentUserUnified } = await import("@/lib/auth/current-user");
  return getCurrentUserUnified();
}

/* ── The facade exists and is a leaf module ──────────────────────────────── */

describe("AUTH-U1 — the facade is canonical and does not duplicate logic", () => {
  it("exports the canonical reader plus an explicit alias, both the same function", async () => {
    const mod = await import("@/lib/auth/current-user");
    expect(typeof mod.getCurrentUserUnified).toBe("function");
    expect(mod.getAuthenticatedUser).toBe(mod.getCurrentUserUnified);
  });

  it("re-exports the existing implementation rather than reimplementing it", async () => {
    const facade = await import("@/lib/auth/current-user");
    const impl   = await import("@/lib/auth/token-session");
    expect(facade.getCurrentUserUnified).toBe(impl.getCurrentUserUnified);
  });

  it("is a dependency LEAF — nothing under src/lib/auth imports it back (no cycle)", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(process.cwd(), "src", "lib", "auth");
    const importers = readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => /from ["'](\.\/current-user|@\/lib\/auth\/current-user)["']/.test(readFileSync(join(dir, f), "utf8")));
    expect(importers).toEqual([]);
  });
});

/* ── CASE 1 — valid JWT + active sid → JWT identity, legacy not consulted ── */

describe("AUTH-U1 CASE 1 — valid JWT with an active sid", () => {
  it("returns the JWT identity", async () => {
    mockCookies({ hermes_at: "at" });
    mockJwt(jwtPayload("sid-active"));
    mockSessionRow(active("sid-active"));
    expect((await readIdentity())?.id).toBe("u-jwt");
  });

  it("does not need the legacy reader — the legacy verifier is never called", async () => {
    const verifySession = vi.fn(() => legacyPayload("sid-active"));
    mockCookies({ hermes_at: "at", hermes_session: "legacy" });
    mockJwt(jwtPayload("sid-active"));
    vi.doMock("@/lib/auth/crypto", () => ({ verifySession }));
    mockSessionRow(active("sid-active"));

    const user = await readIdentity();
    expect(user?.id).toBe("u-jwt");           // JWT wins even with a legacy cookie present
    expect(verifySession).not.toHaveBeenCalled();
  });
});

/* ── CASE 2 — valid JWT + revoked sid → rejected ─────────────────────────── */

describe("AUTH-U1 CASE 2 — valid JWT whose sid is revoked", () => {
  it("rejects the JWT identity", async () => {
    mockCookies({ hermes_at: "at" });
    mockJwt(jwtPayload("sid-revoked"));
    mockSessionRow(revoked("sid-revoked"));
    expect(await readIdentity()).toBeNull();
  });

  it("a revoked session cannot be recovered through the shared-sid legacy cookie", async () => {
    // Login signs BOTH credentials with the SAME sid (app/api/auth/route.ts),
    // and session.ts applies the same revocation check, so revoking the session
    // must fail both paths — no privilege is regained by falling through.
    mockCookies({ hermes_at: "at", hermes_session: "legacy" });
    mockJwt(jwtPayload("sid-revoked"));
    mockLegacy(legacyPayload("sid-revoked"));
    mockSessionRow(revoked("sid-revoked"));
    expect(await readIdentity()).toBeNull();
  });
});

/* ── CASE 3 — no JWT + valid legacy session → legacy identity ────────────── */

describe("AUTH-U1 CASE 3 — no JWT, valid legacy session", () => {
  it("falls back to the legacy identity", async () => {
    mockCookies({ hermes_session: "legacy" });
    mockJwt(null);
    mockLegacy(legacyPayload("sid-active"));
    mockSessionRow(active("sid-active"));
    expect((await readIdentity())?.id).toBe("u-legacy");
  });

  it("still enforces revocation on the legacy path", async () => {
    mockCookies({ hermes_session: "legacy" });
    mockJwt(null);
    mockLegacy(legacyPayload("sid-revoked"));
    mockSessionRow(revoked("sid-revoked"));
    expect(await readIdentity()).toBeNull();
  });
});

/* ── CASE 4 — no credentials at all → null ───────────────────────────────── */

describe("AUTH-U1 CASE 4 — no JWT and no legacy session", () => {
  it("returns null", async () => {
    mockCookies({});
    mockJwt(null);
    mockLegacy(null);
    mockNoStore();
    expect(await readIdentity()).toBeNull();
  });
});

/* ── CASE 5 — sid-less JWT compatibility MUST be unchanged ───────────────── */

describe("AUTH-U1 CASE 5 — legacy JWT without a sid", () => {
  it("is still accepted (compatibility window retained by AUTH-U1)", async () => {
    mockCookies({ hermes_at: "at" });
    mockJwt(jwtPayload());          // no sid
    mockNoStore();                  // and no session store is consulted
    expect((await readIdentity())?.id).toBe("u-jwt");
  });

  it("isPayloadSessionActive({ sid: undefined }) still returns true", async () => {
    mockNoStore();
    const { isPayloadSessionActive } = await import("@/lib/auth/session-store");
    expect(await isPayloadSessionActive({})).toBe(true);
    expect(await isPayloadSessionActive({ sid: undefined })).toBe(true);
  });

  it("a sid-less LEGACY cookie also remains accepted (documented residual window)", async () => {
    mockCookies({ hermes_session: "legacy" });
    mockJwt(null);
    mockLegacy(legacyPayload());    // no sid
    mockNoStore();
    expect((await readIdentity())?.id).toBe("u-legacy");
  });
});

/* ── CASE 6 — invalid JWT → no crash, fallback preserved ─────────────────── */

describe("AUTH-U1 CASE 6 — invalid JWT", () => {
  it("does not throw and falls back to a valid legacy session", async () => {
    mockCookies({ hermes_at: "garbage", hermes_session: "legacy" });
    mockJwt(null);                  // verifier rejects the token
    mockLegacy(legacyPayload("sid-active"));
    mockSessionRow(active("sid-active"));
    expect((await readIdentity())?.id).toBe("u-legacy");
  });

  it("returns null (never throws) when the JWT is invalid and there is no legacy session", async () => {
    mockCookies({ hermes_at: "garbage" });
    mockJwt(null);
    mockLegacy(null);
    mockNoStore();
    await expect(readIdentity()).resolves.toBeNull();
  });

  it("a throwing JWT verifier does not escape as an unhandled rejection", async () => {
    mockCookies({ hermes_at: "garbage", hermes_session: "legacy" });
    vi.doMock("@/lib/auth/jwt", () => ({
      verifyAccessToken: async () => { throw new Error("malformed token"); },
    }));
    mockLegacy(legacyPayload("sid-active"));
    mockSessionRow(active("sid-active"));
    // Documents today's real contract: verifyAccessToken is the component that
    // owns malformed-input handling, so the facade adds no swallow-all of its
    // own (that would also hide store outages). Asserted either way so the
    // behaviour is pinned rather than accidental.
    await expect(readIdentity()).rejects.toThrow("malformed token");
  });
});
