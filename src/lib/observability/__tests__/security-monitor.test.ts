import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  recordSecurityEvent,
  observeSecurityEvent,
  getSecurityEvents,
  resetSecurityMonitor,
  SECURITY_EVENTS,
} from "../security-monitor";
import { resetMetrics, snapshotMetrics } from "../metrics";
import { resetAlerts, getActiveAlerts, configureAlertsForTest } from "../alerts";

function captureLogs(fn: () => void): Record<string, unknown>[] {
  const lines: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  });
  try { fn(); } finally { spy.mockRestore(); }
  return lines.join("").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe("Phase 92 — security-event monitoring", () => {
  const origLevel = process.env.LOG_LEVEL;
  beforeEach(() => {
    resetSecurityMonitor();
    resetMetrics();
    resetAlerts();
    configureAlertsForTest({ enabled: false, webhookUrl: null, minSeverity: "critical", cooldownMs: 0, maxRetries: 0 });
    (process.env as Record<string, string | undefined>).LOG_LEVEL = "DEBUG";
  });
  afterEach(() => {
    (process.env as Record<string, string | undefined>).LOG_LEVEL = origLevel;
    configureAlertsForTest(null);
    resetAlerts();
  });

  it("the taxonomy is closed and severity-ranked", () => {
    expect(SECURITY_EVENTS.refresh_replay).toBe("critical");
    expect(SECURITY_EVENTS.login_failure).toBe("warning");
    expect(SECURITY_EVENTS.login_success).toBe("info");
  });

  it("recordSecurityEvent emits exactly one disclosure-safe log line", () => {
    const entries = captureLogs(() =>
      recordSecurityEvent({
        event: "refresh_replay",
        correlationId: "req-abc12345",
        operation: "auth.refresh",
        reason: "reused_token",
        userId: "u-1",
      }),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].event).toBe("refresh_replay");
    expect(entries[0].severity).toBe("critical");
    expect(entries[0].reqId).toBe("req-abc12345");
    // opaque + server-derived only; never resource content
    expect(JSON.stringify(entries[0])).not.toMatch(/token"?\s*:\s*"[A-Za-z0-9._-]{20,}/);
  });

  it("increments security_events_total and specific counters", () => {
    observeSecurityEvent({ event: "auth_failure", reason: "no_session", correlationId: "r1" });
    observeSecurityEvent({ event: "authz_denied", reason: "not_a_member", correlationId: "r2" });
    observeSecurityEvent({ event: "refresh_replay", correlationId: "r3" });
    const snap = snapshotMetrics();
    const sec = snap.security_events_total as { labels: Record<string, string>; value: number }[];
    expect(sec.some((s) => s.labels.event === "auth_failure")).toBe(true);
    expect(sec.some((s) => s.labels.event === "refresh_replay" && s.labels.severity === "critical")).toBe(true);
    const authFail = snap.auth_failures_total as { labels: Record<string, string>; value: number }[];
    expect(authFail.find((s) => s.labels.reason === "no_session")?.value).toBe(1);
    const sess = snap.session_operations_total as { labels: Record<string, string>; value: number }[];
    expect(sess.some((s) => s.labels.operation === "replay_blocked")).toBe(true);
  });

  it("feeds the ring buffer and filters by correlation id", () => {
    observeSecurityEvent({ event: "login_failure", correlationId: "req-X", reason: "bad_password" });
    observeSecurityEvent({ event: "authz_denied", correlationId: "req-Y", reason: "role" });
    observeSecurityEvent({ event: "login_success", correlationId: "req-X" });
    const forX = getSecurityEvents({ correlationId: "req-X" });
    expect(forX).toHaveLength(2);
    // newest first
    expect(forX[0].event).toBe("login_success");
    expect(forX[1].event).toBe("login_failure");
  });

  it("raises a deduplicated alert for a critical event", () => {
    observeSecurityEvent({ event: "refresh_replay", correlationId: "r1" });
    observeSecurityEvent({ event: "refresh_replay", correlationId: "r2" });
    const active = getActiveAlerts();
    const replayAlert = active.find((a) => a.key === "security:refresh_replay");
    expect(replayAlert).toBeDefined();
    expect(replayAlert?.severity).toBe("critical");
    expect(replayAlert?.count).toBe(2); // deduped into one active alert
  });

  it("never throws", () => {
    // @ts-expect-error — deliberately invalid event to prove resilience
    expect(() => observeSecurityEvent({ event: "not_a_real_event" })).not.toThrow();
  });
});
