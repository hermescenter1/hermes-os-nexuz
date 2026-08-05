import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * PHASE 91 closure — logout ordering. The trusted (signature-verified) identity
 * is captured BEFORE revocation, so the logout audit is attributed even though
 * the session is being killed. Audit failure must not reactivate the session or
 * block logout; cookies always clear.
 */

const MOCKED = ["@/lib/auth/jwt", "@/lib/auth/session-store", "@/lib/audit/audit-service", "@/lib/logger/correlation", "@/lib/auth/session"];

let audits: Record<string, unknown>[] = [];
let revokeCalls: { uid: string; sid: string }[] = [];
let order: string[] = [];
let savedEnv: { e?: string; p?: string };

beforeEach(() => {
  vi.resetModules();
  audits = []; revokeCalls = []; order = [];
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

function logoutReq() {
  return new NextRequest("http://localhost/api/auth", {
    method: "POST",
    headers: { cookie: "hermes_at=at", "content-type": "application/json", "x-request-id": "corr-log" },
    body: JSON.stringify({ action: "logout" }),
  });
}

async function load({ auditThrows = false } = {}) {
  vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => ({ sub: "u1", email: "u1@x", role: "admin", name: "U1", sid: "sid1" }) }));
  vi.doMock("@/lib/auth/session-store", () => ({ revokeSession: async (uid: string, sid: string) => { order.push("revoke"); revokeCalls.push({ uid, sid }); return true; } }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async (e: Record<string, unknown>) => { order.push("audit"); if (auditThrows) throw new Error("audit down"); audits.push(e); },
    AUDIT_ACTIONS: { LOGIN_SUCCESS: "auth.login.success", LOGIN_FAILURE: "auth.login.failure" },
  }));
  vi.doMock("@/lib/logger/correlation", () => ({ resolveRequestId: () => "corr-log" }));
  // getCurrentUser must NOT be the source of the audit identity any more.
  vi.doMock("@/lib/auth/session", () => ({ getCurrentUser: async () => { throw new Error("getCurrentUser must not gate logout audit"); } }));
  return import("@/app/api/auth/route");
}

describe("Phase 91 — logout audit ordering", () => {
  it("revokes then audits with captured identity (outcome + correlationId) and clears cookies", async () => {
    const { POST } = await load();
    const res = await POST(logoutReq());
    expect(res.status).toBe(200);

    expect(revokeCalls).toEqual([{ uid: "u1", sid: "sid1" }]);
    expect(order).toEqual(["revoke", "audit"]);   // identity captured pre-revoke, audit after

    expect(audits).toHaveLength(1);
    expect(audits[0].userId).toBe("u1");          // captured identity, not a re-resolution
    expect(audits[0].action).toBe("auth.logout");
    expect(audits[0].outcome).toBe("success");
    expect(audits[0].correlationId).toBe("corr-log");

    expect(res.cookies.get("hermes_at")?.value).toBe("");
    expect(res.cookies.get("hermes_session")?.value).toBe("");
    expect(res.cookies.get("hermes_rt")?.value).toBe("");
  });

  it("audit failure neither blocks logout nor prevents cookie clearing", async () => {
    const { POST } = await load({ auditThrows: true });
    const res = await POST(logoutReq());
    expect(res.status).toBe(200);
    expect(revokeCalls).toHaveLength(1);          // session still revoked
    expect(res.cookies.get("hermes_at")?.value).toBe("");
  });
});
