import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { REFRESH_TOKEN_COOKIE } from "@/lib/auth/config";
import { getSecurityEvents, resetSecurityMonitor } from "@/lib/observability/security-monitor";
import { resetAlerts, configureAlertsForTest } from "@/lib/observability/alerts";
import { resetMetrics, snapshotMetrics } from "@/lib/observability/metrics";

/**
 * PHASE 92 — REQUEST_CORRELATION proven end-to-end through the Phase 91 refresh
 * route: an inbound X-Request-ID is validated, threaded through the auth/DB
 * decision, stamped on the security event + audit row, and echoed on the
 * response — and a refresh-token REPLAY becomes a visible critical event.
 */

function makeReq(reqId: string | null, token: string | null): NextRequest {
  const headers: Record<string, string> = {};
  if (reqId) headers["x-request-id"] = reqId;
  if (token) headers["cookie"] = `${REFRESH_TOKEN_COOKIE}=${token}`;
  return new NextRequest("http://localhost/api/auth/refresh", { method: "POST", headers });
}

function clearAuditBuffer(): void {
  (globalThis as unknown as { __hermesAudit?: unknown[] }).__hermesAudit = [];
}
function auditBuffer(): Array<Record<string, unknown>> {
  return ((globalThis as unknown as { __hermesAudit?: Array<Record<string, unknown>> }).__hermesAudit) ?? [];
}

describe("Phase 92 — refresh route correlation + replay visibility", () => {
  beforeEach(() => {
    vi.resetModules();
    resetSecurityMonitor();
    resetAlerts();
    resetMetrics();
    clearAuditBuffer();
    configureAlertsForTest({ enabled: false, webhookUrl: null, minSeverity: "critical", cooldownMs: 0, maxRetries: 0 });
  });
  afterEach(() => {
    vi.doUnmock("@/lib/auth/token-session");
    configureAlertsForTest(null);
    resetAlerts();
    clearAuditBuffer();
  });

  it("echoes a well-formed upstream X-Request-ID and writes a correlated audit row on success", async () => {
    vi.doMock("@/lib/auth/token-session", () => ({
      rotateRefreshToken: async () => ({
        ok: true,
        user: { id: "u-1", email: "u@h.local", name: "U", role: "engineer" },
        accessToken: "at",
        refreshToken: "rt",
        sid: "sid-123",
      }),
    }));
    const { POST } = await import("../refresh/route");
    const res = await POST(makeReq("req-upstream-01", "sometoken"));

    expect(res.headers.get("X-Request-ID")).toBe("req-upstream-01");
    const audit = auditBuffer().find((a) => a.action === "auth.refresh");
    expect(audit).toBeDefined();
    expect(audit?.correlationId).toBe("req-upstream-01");
    expect(audit?.outcome).toBe("success");
    // session-operation metric recorded
    const snap = snapshotMetrics();
    const sess = snap.session_operations_total as { labels: Record<string, string>; value: number }[];
    expect(sess.some((s) => s.labels.operation === "rotated")).toBe(true);
  });

  it("mints a fresh correlation id when none is supplied and still echoes it", async () => {
    vi.doMock("@/lib/auth/token-session", () => ({
      rotateRefreshToken: async () => ({ ok: false, error: "expired" }),
    }));
    const { POST } = await import("../refresh/route");
    const res = await POST(makeReq(null, "sometoken"));
    const echoed = res.headers.get("X-Request-ID");
    expect(echoed).toBeTruthy();
    expect(echoed).toMatch(/^[A-Za-z0-9_-]{8,}$/);
    // the expiry surfaced as a security event correlated to the minted id
    const events = getSecurityEvents({ correlationId: echoed! });
    expect(events.some((e) => e.event === "session_expired")).toBe(true);
  });

  it("surfaces a refresh-token replay (revoked rotation) as a critical security event", async () => {
    vi.doMock("@/lib/auth/token-session", () => ({
      rotateRefreshToken: async () => ({ ok: false, error: "revoked" }),
    }));
    const { POST } = await import("../refresh/route");
    const res = await POST(makeReq("req-replay-99", "reusedtoken"));

    expect(res.status).toBe(401);
    expect(res.headers.get("X-Request-ID")).toBe("req-replay-99");
    const events = getSecurityEvents({ correlationId: "req-replay-99" });
    const replay = events.find((e) => e.event === "refresh_replay");
    expect(replay).toBeDefined();
    expect(replay?.severity).toBe("critical");
    // metric for the blocked replay
    const snap = snapshotMetrics();
    const sess = snap.session_operations_total as { labels: Record<string, string>; value: number }[];
    expect(sess.some((s) => s.labels.operation === "replay_blocked")).toBe(true);
  });

  it("rejects a hostile X-Request-ID rather than echoing it", async () => {
    vi.doMock("@/lib/auth/token-session", () => ({
      rotateRefreshToken: async () => ({ ok: false, error: "invalid" }),
    }));
    const { POST } = await import("../refresh/route");
    // A value that is a legal HTTP header but fails the SAFE_ID guard (too long).
    const hostile = "x".repeat(200);
    const res = await POST(makeReq(hostile, "t"));
    const echoed = res.headers.get("X-Request-ID");
    expect(echoed).not.toBe(hostile);
    expect(echoed).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  });
});
