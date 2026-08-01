import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import {
  raiseAlert,
  getActiveAlerts,
  configureAlertsForTest,
  setAlertTransportForTest,
  resetAlerts,
  type AlertResult,
} from "../alerts";

/**
 * PHASE 92 — ALERT_DELIVERY_TEST.
 *
 * Delivery is proven against a DISPOSABLE local HTTP receiver bound to
 * 127.0.0.1 on an ephemeral port — no external Slack/PagerDuty/email, no real
 * credentials. Dedup, cooldown, severity floor, retry bounding and the
 * disabled-by-default posture are proven with an injected transport.
 */

describe("Phase 92 — alert delivery (local receiver)", () => {
  beforeEach(() => resetAlerts());
  afterEach(() => {
    setAlertTransportForTest(null);
    configureAlertsForTest(null);
    resetAlerts();
  });

  it("delivers a JSON payload to a real local webhook receiver", async () => {
    const received: unknown[] = [];
    const server: Server = await new Promise((resolve) => {
      const s = createServer((req, res) => {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          received.push(JSON.parse(body));
          res.writeHead(200).end("ok");
        });
      });
      s.listen(0, "127.0.0.1", () => resolve(s));
    });
    try {
      const port = (server.address() as AddressInfo).port;
      configureAlertsForTest({
        enabled: true,
        webhookUrl: `http://127.0.0.1:${port}/hook`,
        minSeverity: "error",
        cooldownMs: 300_000,
        maxRetries: 2,
      });

      const result = await raiseAlert({
        key: "dependency:database:down",
        title: "Database unreachable",
        severity: "critical",
        summary: "readiness probe failed",
        labels: { dependency: "database" },
        correlationId: "req-abc12345",
      });

      expect(result).toBe<AlertResult>("sent");
      expect(received).toHaveLength(1);
      const payload = received[0] as Record<string, unknown>;
      expect(payload.key).toBe("dependency:database:down");
      expect(payload.severity).toBe("critical");
      expect(payload.correlationId).toBe("req-abc12345");
      // The active-alert registry reflects the delivery.
      const active = getActiveAlerts();
      expect(active[0].lastResult).toBe("sent");
      expect(active[0].lastDeliveredAt).not.toBeNull();
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("deduplicates repeat raises of the same key within the cooldown window", async () => {
    let deliveries = 0;
    setAlertTransportForTest(async () => { deliveries++; return true; });
    configureAlertsForTest({ enabled: true, webhookUrl: "http://127.0.0.1:1/x", minSeverity: "error", cooldownMs: 300_000, maxRetries: 0 });

    const first = await raiseAlert({ key: "k", title: "t", severity: "error", summary: "s" });
    const second = await raiseAlert({ key: "k", title: "t", severity: "error", summary: "s" });

    expect(first).toBe("sent");
    expect(second).toBe("deduplicated");
    expect(deliveries).toBe(1);
    // Count still increments so the dashboard shows the true frequency.
    expect(getActiveAlerts()[0].count).toBe(2);
  });

  it("suppresses (tracks but never delivers) alerts below the severity floor", async () => {
    let deliveries = 0;
    setAlertTransportForTest(async () => { deliveries++; return true; });
    configureAlertsForTest({ enabled: true, webhookUrl: "http://127.0.0.1:1/x", minSeverity: "error", cooldownMs: 0, maxRetries: 0 });

    const result = await raiseAlert({ key: "noisy", title: "t", severity: "warning", summary: "s" });
    expect(result).toBe("suppressed");
    expect(deliveries).toBe(0);
    // Still visible to the operator.
    expect(getActiveAlerts()).toHaveLength(1);
  });

  it("is disabled by default — tracked but not dialed when unconfigured", async () => {
    let deliveries = 0;
    setAlertTransportForTest(async () => { deliveries++; return true; });
    // enabled defaults to false (no ALERTS_ENABLED); no override enabling it.
    configureAlertsForTest({ enabled: false, webhookUrl: null, minSeverity: "info", cooldownMs: 0, maxRetries: 0 });

    const result = await raiseAlert({ key: "k", title: "t", severity: "critical", summary: "s" });
    expect(result).toBe("dropped");
    expect(deliveries).toBe(0);
    expect(getActiveAlerts()).toHaveLength(1);
  });

  it("retries a transient failure up to the bound, then succeeds", async () => {
    let attempts = 0;
    setAlertTransportForTest(async () => { attempts++; return attempts >= 2; });
    configureAlertsForTest({ enabled: true, webhookUrl: "http://127.0.0.1:1/x", minSeverity: "error", cooldownMs: 0, maxRetries: 2 });

    const result = await raiseAlert({ key: "k", title: "t", severity: "error", summary: "s" });
    expect(result).toBe("sent");
    expect(attempts).toBe(2);
  });

  it("gives up after exhausting the retry bound (no infinite loop)", async () => {
    let attempts = 0;
    setAlertTransportForTest(async () => { attempts++; return false; });
    configureAlertsForTest({ enabled: true, webhookUrl: "http://127.0.0.1:1/x", minSeverity: "error", cooldownMs: 0, maxRetries: 2 });

    const result = await raiseAlert({ key: "k", title: "t", severity: "error", summary: "s" });
    expect(result).toBe("failed");
    expect(attempts).toBe(3); // maxRetries + 1
  });

  it("never throws even if the transport itself throws", async () => {
    setAlertTransportForTest(async () => { throw new Error("boom"); });
    configureAlertsForTest({ enabled: true, webhookUrl: "http://127.0.0.1:1/x", minSeverity: "error", cooldownMs: 0, maxRetries: 1 });

    let result: AlertResult | undefined;
    await expect((async () => { result = await raiseAlert({ key: "k", title: "t", severity: "error", summary: "s" }); })()).resolves.toBeUndefined();
    expect(result).toBe("failed");
  });
});
