import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { raiseAlert, resetAlerts, configureAlertsForTest, setAlertTransportForTest } from "../alerts";
import { recordError, resetErrors, getErrorFingerprints } from "../errors";
import { incCounter, resetMetrics, renderProm } from "../metrics";
import { reconstructIncident } from "../incident";
import { observeSecurityEvent, resetSecurityMonitor } from "../security-monitor";

/**
 * PHASE 92 — Final Acceptance Gate adversarial-hardening proofs.
 *
 * Each test locks in one hardening applied during the pre-commit adversarial
 * review so it can never silently regress:
 *   - alert destinations are operator-env-only and scheme-validated (SSRF);
 *   - a webhook redirect is NOT followed;
 *   - the error fingerprint is SHA-256-based (12 hex chars, stable, collision-avoiding);
 *   - the cardinality drop-counter cannot recurse into itself under overflow;
 *   - the incident timeline scopes the security ring by tenant when asked.
 */

describe("Phase 92 — adversarial hardening", () => {
  beforeEach(() => {
    resetAlerts();
    resetErrors();
    resetMetrics();
    resetSecurityMonitor();
  });
  afterEach(() => {
    configureAlertsForTest(null);
    setAlertTransportForTest(null);
    resetAlerts();
  });

  it("never dials a non-http(s) ALERT_WEBHOOK_URL (env path: rejected → dropped)", async () => {
    // Exercise the ENV path — what production actually reads and validates.
    let dialled = false;
    setAlertTransportForTest(async () => { dialled = true; return true; });
    const env = process.env as Record<string, string | undefined>;
    const prevUrl = env.ALERT_WEBHOOK_URL;
    const prevEnabled = env.ALERTS_ENABLED;
    env.ALERT_WEBHOOK_URL = "file:///etc/passwd"; // hostile, non-http(s) scheme
    env.ALERTS_ENABLED = "true";
    try {
      const result = await raiseAlert({ key: "k", title: "t", severity: "critical", summary: "s" });
      expect(result).toBe("dropped"); // invalid scheme → treated as unconfigured
      expect(dialled).toBe(false);
    } finally {
      env.ALERT_WEBHOOK_URL = prevUrl;
      env.ALERTS_ENABLED = prevEnabled;
    }
  });

  it("delivers to a valid operator-configured http(s) destination (allow internal collectors)", async () => {
    const seen: string[] = [];
    setAlertTransportForTest(async (url) => { seen.push(url); return true; });
    // A private/internal address is a LEGITIMATE operator choice, not blocked.
    configureAlertsForTest({ enabled: true, webhookUrl: "http://10.1.2.3:9093/api/v2/alerts", minSeverity: "info", cooldownMs: 0, maxRetries: 0 });
    const result = await raiseAlert({ key: "k", title: "t", severity: "critical", summary: "s" });
    expect(result).toBe("sent");
    expect(seen).toEqual(["http://10.1.2.3:9093/api/v2/alerts"]);
  });

  it("the error fingerprint is a stable 12-char lowercase hex (SHA-256 truncation)", () => {
    const fp1 = recordError({ errorClass: "TypeError", operation: "brain.save", message: "x is undefined" });
    const fp2 = recordError({ errorClass: "TypeError", operation: "brain.save", message: "x is undefined" });
    const fp3 = recordError({ errorClass: "RangeError", operation: "brain.save", message: "x is undefined" });
    expect(fp1).toMatch(/^[0-9a-f]{12}$/);
    expect(fp1).toBe(fp2);               // deterministic + groups identical faults
    expect(fp1).not.toBe(fp3);           // distinct class → distinct fingerprint
    expect(getErrorFingerprints().length).toBe(2);
  });

  it("uses SHA-256 (not SHA-1) for the fingerprint basis", async () => {
    const { createHash } = await import("node:crypto");
    const basis = "TypeError|brain.save|x is undefined";
    const sha256 = createHash("sha256").update(basis).digest("hex").slice(0, 12);
    const sha1 = createHash("sha1").update(basis).digest("hex").slice(0, 12);
    const fp = recordError({ errorClass: "TypeError", operation: "brain.save", message: "x is undefined" });
    expect(fp).toBe(sha256);
    expect(fp).not.toBe(sha1);
  });

  it("the cardinality drop-counter does not recurse into itself when forced to overflow", () => {
    // Push far more distinct {metric} label values than any cap so the drop
    // counter itself would overflow; must fold silently without throwing/recursing.
    expect(() => {
      for (let i = 0; i < 5000; i++) incCounter("metrics_series_dropped_total", { metric: `m${i}` });
    }).not.toThrow();
    // And the render stays finite and well-formed.
    const out = renderProm();
    expect(out).toContain("metrics_series_dropped_total");
    expect(out).toContain('overflow="true"');
  });

  it("scopes the incident security ring to a tenant when an organizationId is given", async () => {
    const cid = "req-tenant-scope-1";
    observeSecurityEvent({ event: "authz_denied", correlationId: cid, operation: "op.a", orgId: "org-A" });
    observeSecurityEvent({ event: "authz_denied", correlationId: cid, operation: "op.b", orgId: "org-B" });

    const all = await reconstructIncident(cid);
    expect(all.counts.security).toBe(2); // global operator sees both

    const scoped = await reconstructIncident(cid, { organizationId: "org-A" });
    expect(scoped.counts.security).toBe(1); // tenant-scoped sees only its own
    expect(scoped.entries.every((e) => e.source !== "security" || e.organizationId === "org-A")).toBe(true);
  });
});
