import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { reconstructIncident } from "../incident";
import { observeSecurityEvent, resetSecurityMonitor } from "../security-monitor";
import { recordError, resetErrors } from "../errors";
import { resetMetrics, snapshotMetrics } from "../metrics";
import { resetAlerts, getActiveAlerts, configureAlertsForTest } from "../alerts";
import { recordAuditEvent } from "@/lib/audit/audit-service";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// The in-process audit buffer is a module global; clear it between tests.
function clearAuditBuffer(): void {
  const g = globalThis as unknown as { __hermesAudit?: unknown[] };
  g.__hermesAudit = [];
}

describe("Phase 92 — INCIDENT_TIMELINE_RECONSTRUCTION", () => {
  beforeEach(() => {
    resetSecurityMonitor();
    resetErrors();
    resetMetrics();
    resetAlerts();
    clearAuditBuffer();
    configureAlertsForTest({ enabled: false, webhookUrl: null, minSeverity: "critical", cooldownMs: 0, maxRetries: 0 });
  });
  afterEach(() => {
    configureAlertsForTest(null);
    resetAlerts();
    clearAuditBuffer();
  });

  it("reconstructs one synthetic incident crossing auth → dependency → security → audit → metric → alert", async () => {
    const cid = "req-incident-0001";

    // 1. request arrives, authorization is DENIED (security plane)
    observeSecurityEvent({
      event: "authz_denied",
      correlationId: cid,
      operation: "brain.history.read",
      reason: "cross_tenant",
      userId: "u-attacker",
      orgId: "org-1",
    });
    await sleep(3);

    // 2. a durable audit row is written for the denied access (audit plane)
    await recordAuditEvent({
      userId: "u-attacker",
      action: "site.access.denied",
      entityType: "case",
      entityId: "case-77",
      organizationId: "org-1",
      outcome: "denied",
      correlationId: cid,
      // A secret accidentally threaded into metadata MUST NOT surface in the timeline.
      metadata: { note: "internal", secretPayload: "TOP-SECRET-ROOTCAUSE" },
    });
    await sleep(3);

    // 3. a dependency degradation surfaces as a critical security event
    observeSecurityEvent({ event: "refresh_replay", correlationId: cid, reason: "reused_token", userId: "u-attacker" });
    await sleep(3);

    // 4. the failure is aggregated (error plane)
    recordError({ errorClass: "TenantIsolationError", operation: "brain.history.read", message: "denied for org-1", severity: "error", correlationId: cid });
    await sleep(3);

    // 5. a SEPARATE incident's audit row (different correlation id) must NOT bleed in
    await recordAuditEvent({ action: "login.success", entityType: "user", correlationId: "req-other-9999", outcome: "success" });

    const timeline = await reconstructIncident(cid);

    // Ordered, correlated, complete.
    expect(timeline.valid).toBe(true);
    expect(timeline.correlationId).toBe(cid);
    expect(timeline.counts).toEqual({ security: 2, audit: 1, error: 1 });
    expect(timeline.entries).toHaveLength(4);

    // Strictly time-ordered (we spaced events by 3ms).
    const times = timeline.entries.map((e) => Date.parse(e.ts));
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);

    // The story reads: authz_denied → audit denial → refresh_replay → error.
    expect(timeline.entries.map((e) => e.label)).toEqual([
      "authz_denied",
      "site.access.denied",
      "refresh_replay",
      "TenantIsolationError",
    ]);

    // The other incident's row is absent.
    expect(timeline.entries.some((e) => e.label === "login.success")).toBe(false);

    // No protected payload leaked from audit metadata.
    expect(JSON.stringify(timeline)).not.toContain("TOP-SECRET-ROOTCAUSE");
    expect(JSON.stringify(timeline)).not.toContain("secretPayload");

    // Side-effects: the metric recorded, and an alert became active for the critical event.
    const snap = snapshotMetrics();
    expect(snap.security_events_total).toBeDefined();
    expect(getActiveAlerts().some((a) => a.key === "security:refresh_replay")).toBe(true);
  });

  it("rejects a hostile correlation id without querying", async () => {
    const timeline = await reconstructIncident('bad" or 1=1 --');
    expect(timeline.valid).toBe(false);
    expect(timeline.entries).toHaveLength(0);
  });

  it("scopes the audit lookup to a tenant so a cross-tenant id cannot surface another org's rows", async () => {
    const cid = "req-tenant-scope-1";
    await recordAuditEvent({ action: "a.op", entityType: "x", correlationId: cid, organizationId: "org-A" });
    await recordAuditEvent({ action: "b.op", entityType: "x", correlationId: cid, organizationId: "org-B" });

    const scoped = await reconstructIncident(cid, { organizationId: "org-A" });
    expect(scoped.counts.audit).toBe(1);
    expect(scoped.entries[0].organizationId).toBe("org-A");
  });

  it("returns an empty (but valid) timeline for an unknown correlation id", async () => {
    const timeline = await reconstructIncident("req-nothing-here");
    expect(timeline.valid).toBe(true);
    expect(timeline.entries).toHaveLength(0);
    expect(timeline.window).toEqual({ from: null, to: null });
  });
});
