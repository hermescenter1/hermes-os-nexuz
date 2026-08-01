import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * PHASE 91 closure — session inventory failure contract and revoke-others route.
 * Store-unavailable is a 503 SESSION_STORE_UNAVAILABLE, distinct from a genuine
 * empty inventory (200 []). Revoke-others is reauth-gated and maps the atomic
 * result to stable, non-leaking codes.
 */

const MOCKED = ["@/lib/auth/request-session", "@/lib/auth/session-store", "@/lib/auth/reauth", "@/lib/audit/audit-service", "@/lib/logger/correlation"];

beforeEach(() => vi.resetModules());
afterEach(() => { for (const m of MOCKED) vi.doUnmock(m); vi.restoreAllMocks(); });

function req(body?: unknown) {
  return new NextRequest("http://localhost/api/auth/sessions", {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

interface BaseOpts {
  session?: { userId: string; sid: string | null } | null;
  reauth?:  Record<string, unknown>;
  store?:   Record<string, unknown>;
}
// Each module is mocked EXACTLY ONCE per test (no double-doMock of the same
// specifier, which is order-fragile across the full suite).
function base(opts: BaseOpts = {}) {
  const session = opts.session === undefined ? { userId: "u1", sid: "sid1" } : opts.session;
  vi.doMock("@/lib/auth/request-session", () => ({ resolveRequestSession: async () => session }));
  vi.doMock("@/lib/auth/reauth", () => ({ requireRecentAuth: async () => opts.reauth ?? { ok: true } }));
  vi.doMock("@/lib/audit/audit-service", () => ({ recordAuditEvent: async () => {} }));
  vi.doMock("@/lib/logger/correlation", () => ({ resolveRequestId: () => "corr" }));
  vi.doMock("@/lib/auth/session-store", () => ({
    listUserSessions: async () => [],
    revokeAllOtherSessionsAtomically: async () => ({ ok: true, revoked: 0, generation: 1 }),
    ...(opts.store ?? {}),
  }));
}

describe("Phase 91 — GET /api/auth/sessions failure contract", () => {
  it("store unavailable (null) → 503 SESSION_STORE_UNAVAILABLE", async () => {
    base({ store: { listUserSessions: async () => null } });
    const { GET } = await import("@/app/api/auth/sessions/route");
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("SESSION_STORE_UNAVAILABLE");
  });

  it("genuinely empty inventory ([]) → 200 with sessions: []", async () => {
    base({ store: { listUserSessions: async () => [] } });
    const { GET } = await import("@/app/api/auth/sessions/route");
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).sessions).toEqual([]);
  });

  it("unauthenticated → 401", async () => {
    base({ session: null });
    const { GET } = await import("@/app/api/auth/sessions/route");
    expect((await GET(req())).status).toBe(401);
  });
});

describe("Phase 91 — POST /api/auth/sessions revoke-others", () => {
  it("reauth ok + atomic ok → 200 { revoked }", async () => {
    base({ store: { revokeAllOtherSessionsAtomically: async () => ({ ok: true, revoked: 3, generation: 2 }) } });
    const { POST } = await import("@/app/api/auth/sessions/route");
    const res = await POST(req({ action: "revoke-others", password: "pw" }));
    expect(res.status).toBe(200);
    expect((await res.json()).revoked).toBe(3);
  });

  it("reauth failure → 401 REAUTH_REQUIRED, no revocation", async () => {
    let revoked = false;
    base({
      reauth: { ok: false, status: 401, code: "REAUTH_REQUIRED" },
      store: { revokeAllOtherSessionsAtomically: async () => { revoked = true; return { ok: true, revoked: 0, generation: 1 }; } },
    });
    const { POST } = await import("@/app/api/auth/sessions/route");
    const res = await POST(req({ action: "revoke-others", password: "wrong" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("REAUTH_REQUIRED");
    expect(revoked).toBe(false);
  });

  it("atomic kept_invalid → 401 SESSION_INVALID", async () => {
    base({ store: { revokeAllOtherSessionsAtomically: async () => ({ ok: false, error: "kept_invalid" }) } });
    const { POST } = await import("@/app/api/auth/sessions/route");
    const res = await POST(req({ action: "revoke-others", password: "pw" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("SESSION_INVALID");
  });

  it("atomic unavailable → 503 SESSION_STORE_UNAVAILABLE", async () => {
    base({ store: { revokeAllOtherSessionsAtomically: async () => ({ ok: false, error: "unavailable" }) } });
    const { POST } = await import("@/app/api/auth/sessions/route");
    const res = await POST(req({ action: "revoke-others", password: "pw" }));
    expect(res.status).toBe(503);
  });

  it("legacy session without a sid cannot revoke-others → 503", async () => {
    base({ session: { userId: "u1", sid: null } });
    const { POST } = await import("@/app/api/auth/sessions/route");
    const res = await POST(req({ action: "revoke-others", password: "pw" }));
    expect(res.status).toBe(503);
  });
});
