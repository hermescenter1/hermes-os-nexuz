import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockNoUser, mockViewer, mockAdmin } from "@/test/mock-auth";
import { resetMetrics, incCounter } from "@/lib/observability/metrics";

function req(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/metrics", { headers }) as unknown as import("next/server").NextRequest;
}

describe("Phase 92 — /api/metrics authz + output", () => {
  const origToken = process.env.METRICS_TOKEN;
  beforeEach(() => {
    vi.resetModules();
    resetMetrics();
    delete (process.env as Record<string, string | undefined>).METRICS_TOKEN;
  });
  afterEach(() => {
    (process.env as Record<string, string | undefined>).METRICS_TOKEN = origToken;
  });

  it("401 for an anonymous caller with no token configured", async () => {
    mockNoUser();
    const { GET } = await import("../route");
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("403 for a non-admin session", async () => {
    mockViewer();
    const { GET } = await import("../route");
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it("200 Prometheus text for an admin session", async () => {
    incCounter("http_requests_total", { method: "GET", status_class: "2xx" });
    mockAdmin();
    const { GET } = await import("../route");
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toContain("http_requests_total");
  });

  it("200 for a scraper presenting the configured bearer token (no session)", async () => {
    (process.env as Record<string, string | undefined>).METRICS_TOKEN = "scrape-secret-123";
    mockNoUser();
    const { GET } = await import("../route");
    const ok = await GET(req({ authorization: "Bearer scrape-secret-123" }));
    expect(ok.status).toBe(200);
    // A wrong token falls back to the session check → 401.
    const bad = await GET(req({ authorization: "Bearer wrong" }));
    expect(bad.status).toBe(401);
  });
});
