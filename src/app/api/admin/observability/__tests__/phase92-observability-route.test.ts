import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockNoUser, mockViewer, mockAdmin } from "@/test/mock-auth";
import { resetSecurityMonitor, observeSecurityEvent } from "@/lib/observability/security-monitor";
import { resetAlerts, configureAlertsForTest } from "@/lib/observability/alerts";
import { resetMetrics } from "@/lib/observability/metrics";
import { recordAuditEvent } from "@/lib/audit/audit-service";

function req(qs = "") {
  return new NextRequest(`http://localhost/api/admin/observability${qs}`);
}
function clearAuditBuffer() {
  (globalThis as unknown as { __hermesAudit?: unknown[] }).__hermesAudit = [];
}

describe("Phase 92 — /api/admin/observability", () => {
  beforeEach(() => {
    vi.resetModules();
    resetSecurityMonitor();
    resetAlerts();
    resetMetrics();
    clearAuditBuffer();
    configureAlertsForTest({ enabled: false, webhookUrl: null, minSeverity: "critical", cooldownMs: 0, maxRetries: 0 });
  });
  afterEach(() => {
    configureAlertsForTest(null);
    resetAlerts();
    clearAuditBuffer();
  });

  it("401 anonymous, 403 non-admin", async () => {
    mockNoUser();
    let mod = await import("../route");
    expect((await mod.GET(req())).status).toBe(401);

    vi.resetModules();
    mockViewer();
    mod = await import("../route");
    expect((await mod.GET(req())).status).toBe(403);
  });

  it("200 admin returns health, alerts, security summary, errors, audit and metrics", async () => {
    observeSecurityEvent({ event: "authz_denied", correlationId: "req-1", reason: "role" });
    await recordAuditEvent({ action: "case.created", entityType: "case", correlationId: "req-1", outcome: "success" });
    mockAdmin();
    const { GET } = await import("../route");
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.security.summary.authz_denied).toBe(1);
    expect(body.alerts).toBeInstanceOf(Array);
    expect(body.audit.events.length).toBeGreaterThanOrEqual(1);
    expect(body.metrics).toBeTypeOf("object");
    expect(res.headers.get("X-Request-ID")).toBeTruthy();
  });

  it("reconstructs an incident when correlationId is supplied", async () => {
    observeSecurityEvent({ event: "refresh_replay", correlationId: "req-inc-1", reason: "reuse" });
    await recordAuditEvent({ action: "auth.refresh", entityType: "session", correlationId: "req-inc-1", outcome: "denied" });
    mockAdmin();
    const { GET } = await import("../route");
    const res = await GET(req("?correlationId=req-inc-1"));
    const body = await res.json();
    expect(body.incident.valid).toBe(true);
    expect(body.incident.entries.length).toBe(2);
  });

  it("reports a malformed correlationId as invalid without querying", async () => {
    mockAdmin();
    const { GET } = await import("../route");
    const res = await GET(req("?correlationId=" + encodeURIComponent('bad" or 1=1')));
    const body = await res.json();
    expect(body.incident.valid).toBe(false);
    expect(body.incident.entries).toHaveLength(0);
  });
});
