import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetMetrics, snapshotMetrics } from "@/lib/observability/metrics";

/**
 * PHASE 92 — HEALTH_SIGNAL_COVERAGE.
 *
 * Proves the liveness/readiness distinction behaviourally (not just by source
 * grep): liveness never touches a dependency; readiness reflects PostgreSQL and
 * fails closed (503) when it is unreachable, while staying opaque and echoing
 * the correlation id. Redis is deliberately NOT a readiness dependency.
 */

function makeReq(reqId?: string) {
  const headers: Record<string, string> = {};
  if (reqId) headers["x-request-id"] = reqId;
  return new Request("http://localhost/api/health/ready", { headers }) as unknown as import("next/server").NextRequest;
}

describe("Phase 92 — health signals", () => {
  beforeEach(() => { vi.resetModules(); resetMetrics(); });
  afterEach(() => { vi.doUnmock("@/lib/db/prisma"); });

  it("liveness answers ok without any dependency call", async () => {
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  it("readiness is 200/ready and marks the DB gauge up when PostgreSQL answers", async () => {
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () => ({ $queryRawUnsafe: async () => [{ "?column?": 1 }] }),
    }));
    const { GET } = await import("../ready/route");
    const res = await GET(makeReq("req-ready-01"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Request-ID")).toBe("req-ready-01");
    const body = await res.json();
    expect(body).toEqual({ status: "ready", database: true });

    const gauge = snapshotMetrics().dependency_up as { labels: Record<string, string>; value: number }[];
    expect(gauge.find((g) => g.labels.dependency === "database")?.value).toBe(1);
  });

  it("readiness fails closed (503) and stays opaque when PostgreSQL is unreachable", async () => {
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () => ({ $queryRawUnsafe: async () => { throw new Error("connect ECONNREFUSED 10.0.0.5:5432 password=supersecret"); } }),
    }));
    const { GET } = await import("../ready/route");
    const res = await GET(makeReq("req-ready-02"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ status: "not_ready", database: false });
    // The connection/credential detail must never reach the public body.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("ECONNREFUSED");
    expect(raw).not.toContain("supersecret");

    const gauge = snapshotMetrics().dependency_up as { labels: Record<string, string>; value: number }[];
    expect(gauge.find((g) => g.labels.dependency === "database")?.value).toBe(0);
  });
});
