import { describe, it, expect, beforeEach } from "vitest";
import {
  incCounter,
  setGauge,
  observeHistogram,
  renderProm,
  snapshotMetrics,
  resetMetrics,
} from "../metrics";

describe("Phase 92 — metrics registry", () => {
  beforeEach(() => resetMetrics());

  it("counts and renders a counter with its declared labels", () => {
    incCounter("http_requests_total", { method: "GET", status_class: "2xx" });
    incCounter("http_requests_total", { method: "GET", status_class: "2xx" });
    incCounter("http_requests_total", { method: "POST", status_class: "5xx" });
    const out = renderProm();
    expect(out).toContain("# TYPE http_requests_total counter");
    expect(out).toMatch(/http_requests_total\{method="GET",status_class="2xx"\} 2/);
    expect(out).toMatch(/http_requests_total\{method="POST",status_class="5xx"\} 1/);
  });

  it("DROPS a label key that is not declared for the metric (no userId/email/URL leak)", () => {
    incCounter("auth_failures_total", {
      reason: "no_session",
      // These must never enter the store — they are unbounded / sensitive.
      userId: "u-secret-123",
      email: "victim@example.com",
      url: "https://app/secret/path?token=abc",
    });
    const out = renderProm();
    expect(out).toContain('auth_failures_total{reason="no_session"} 1');
    expect(out).not.toContain("u-secret-123");
    expect(out).not.toContain("victim@example.com");
    expect(out).not.toContain("secret/path");
  });

  it("sanitizes a hostile label value so it cannot forge exposition lines", () => {
    incCounter("auth_failures_total", { reason: 'x"} 999\nforged_metric{a="b"} 1' });
    const out = renderProm();
    // The exposition-breaking characters (newline, quote, backslash) are gone,
    // so the payload stays confined to a single quoted value and cannot start a
    // second metric line.
    const lines = out.split("\n");
    expect(lines.some((l) => l.startsWith("forged_metric"))).toBe(false);
    const sampleLines = lines.filter((l) => l.startsWith("auth_failures_total{"));
    expect(sampleLines).toHaveLength(1);
    // No raw newline or unescaped quote survived inside the value.
    expect(sampleLines[0].endsWith('"} 1')).toBe(true);
    expect(sampleLines[0]).not.toContain('999\n');
  });

  it("caps cardinality: excess series fold into overflow and are counted", () => {
    // errors_total maxSeries = 8; push 12 distinct severities-ish values.
    for (let i = 0; i < 12; i++) incCounter("errors_total", { severity: `sev-${i}` });
    const snap = snapshotMetrics();
    const series = snap.errors_total as { labels: Record<string, string>; value: number }[];
    // Never more than maxSeries + the single overflow series.
    expect(series.length).toBeLessThanOrEqual(8 + 1);
    expect(series.some((s) => s.labels.overflow === "true")).toBe(true);
    // The drop was recorded.
    const dropped = snap.metrics_series_dropped_total as { labels: Record<string, string>; value: number }[];
    expect(dropped.some((d) => d.labels.metric === "errors_total")).toBe(true);
  });

  it("records a histogram with buckets, sum and count", () => {
    observeHistogram("http_request_duration_ms", 8, { method: "GET" });
    observeHistogram("http_request_duration_ms", 120, { method: "GET" });
    observeHistogram("http_request_duration_ms", 3000, { method: "GET" });
    const out = renderProm();
    expect(out).toContain("# TYPE http_request_duration_ms histogram");
    expect(out).toMatch(/http_request_duration_ms_count\{method="GET"\} 3/);
    expect(out).toMatch(/http_request_duration_ms_sum\{method="GET"\} 3128/);
    expect(out).toMatch(/http_request_duration_ms_bucket\{le="\+Inf",method="GET"\} 3/);
    // le=10 catches only the 8ms sample.
    expect(out).toMatch(/http_request_duration_ms_bucket\{le="10",method="GET"\} 1/);
  });

  it("sets and overwrites a gauge", () => {
    setGauge("dependency_up", 1, { dependency: "database" });
    setGauge("dependency_up", 0, { dependency: "database" });
    setGauge("dependency_up", 1, { dependency: "redis" });
    const out = renderProm();
    expect(out).toMatch(/dependency_up\{dependency="database"\} 0/);
    expect(out).toMatch(/dependency_up\{dependency="redis"\} 1/);
  });

  it("ignores a wrong-type or negative operation without throwing", () => {
    expect(() => setGauge("http_requests_total", 5)).not.toThrow(); // counter, not gauge
    expect(() => incCounter("http_requests_total", {}, -3)).not.toThrow();
    expect(() => observeHistogram("errors_total", 5)).not.toThrow(); // counter, not histogram
    // None of the above should have created data.
    expect(renderProm()).toBe("");
  });
});
