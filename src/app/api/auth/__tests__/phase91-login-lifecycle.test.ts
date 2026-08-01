import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * PHASE 91 closure — login lifecycle at the persistence boundary.
 *
 * The REAL issueTokens runs (driven by mocked storage-mode + prisma), so this
 * exercises the fail-closed contract end-to-end through the login route:
 *  - a kill-switch (password reset / suspension bumps tokenVersion) that lands
 *    during an in-flight login → 503, no cookies;
 *  - account removal during login → 503, no cookies;
 *  - database persistence unavailable → 503, no cookies;
 *  - the happy path → 200 with sid-bound cookies.
 */

const MOCKED = ["@/lib/auth/service", "@/lib/storage/storage-mode", "@/lib/db/prisma", "@/lib/auth/rate-limiter", "@/lib/audit/audit-service"];
let savedEnv: { e?: string; p?: string };

beforeEach(() => {
  vi.resetModules();
  savedEnv = { e: process.env.ADMIN_EMAIL, p: process.env.ADMIN_PASSWORD };
  process.env.ADMIN_EMAIL = "admin@test.local";
  process.env.ADMIN_PASSWORD = "placeholder-not-a-secret";
});
afterEach(() => {
  for (const m of MOCKED) vi.doUnmock(m);
  if (savedEnv.e === undefined) delete process.env.ADMIN_EMAIL; else process.env.ADMIN_EMAIL = savedEnv.e;
  if (savedEnv.p === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = savedEnv.p;
  vi.restoreAllMocks();
});

function loginReq() {
  return new NextRequest("http://localhost/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "vitest" },
    body: JSON.stringify({ action: "login", email: "u1@x", password: "pw" }),
  });
}

/**
 * @param genSequence versions returned by successive User.findUnique-by-id calls
 *   (index 0 = the login's pre-issuance read, index 1 = issueTokens' in-tx read).
 *   `null` at an index simulates the user having been removed by then.
 */
async function load(mode: "database" | "session", genSequence: (number | null)[] | null) {
  vi.doMock("@/lib/auth/service", () => ({ authenticate: async () => ({ id: "u1", email: "u1@x", role: "customer", name: "U1" }) }));
  vi.doMock("@/lib/storage/storage-mode", () => ({ getStorageMode: () => mode, isDatabaseMode: () => mode === "database" }));
  vi.doMock("@/lib/auth/rate-limiter", () => ({ checkRateLimit: async () => true, retryAfter: () => 0 }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async () => {},
    AUDIT_ACTIONS: { LOGIN_SUCCESS: "auth.login.success", LOGIN_FAILURE: "auth.login.failure" },
  }));
  if (genSequence === null) {
    vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => null }));
  } else {
    let idReads = 0;
    const db = {
      user: {
        findUnique: async ({ where }: { where: Record<string, unknown> }) => {
          if (where.email !== undefined) return { lockedUntil: null }; // isAccountLocked
          const v = genSequence[Math.min(idReads, genSequence.length - 1)];
          idReads += 1;
          return v === null ? null : { id: where.id, tokenVersion: v };
        },
        update: async () => ({}),
      },
      refreshToken: { create: async (a: { data: Record<string, unknown> }) => ({ id: "sid-new", ...a.data }) },
    };
    vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => db }));
  }
  return import("@/app/api/auth/route");
}

describe("Phase 91 — login vs security kill-switch", () => {
  it("password-reset/suspension bumped the generation mid-login → 503, no cookies", async () => {
    const { POST } = await load("database", [1, 2]); // observed gen 1, persisted-time gen 2
    const res = await POST(loginReq());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("SESSION_PERSISTENCE_UNAVAILABLE");
    expect(res.cookies.get("hermes_at")).toBeUndefined();
    expect(res.cookies.get("hermes_rt")).toBeUndefined();
  });

  it("account removed mid-login → 503, no cookies", async () => {
    const { POST } = await load("database", [1, null]);
    const res = await POST(loginReq());
    expect(res.status).toBe(503);
    expect(res.cookies.get("hermes_at")).toBeUndefined();
  });

  it("database persistence unavailable → 503, no cookies", async () => {
    const { POST } = await load("database", null); // getPrisma() === null in database mode
    const res = await POST(loginReq());
    expect(res.status).toBe(503);
    expect(res.cookies.get("hermes_at")).toBeUndefined();
  });

  it("happy path (generation stable) → 200 with sid-bound access + refresh cookies", async () => {
    const { POST } = await load("database", [7, 7]);
    const res = await POST(loginReq());
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(res.cookies.get("hermes_at")?.value).toBeTruthy();
    expect(res.cookies.get("hermes_rt")?.value).toBeTruthy();
  });
});
