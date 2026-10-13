/**
 * POST /api/executive/reports/run — the scheduler's parameters.
 *
 * The guard itself is tested where it lives; here: a refused caller never
 * starts a pass, and the batch size and the cursor are validated before one
 * does, then handed to the pass exactly as given.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  auth: { ok: true } as { ok: boolean; status?: number; error?: string },
  passes: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/executive/report/auth", () => ({
  authorizeExecutiveReportWorker: async () => h.auth,
}));

vi.mock("@/lib/executive/report/worker", () => ({
  DEFAULT_MAX_ORGANIZATIONS: 50,
  runReportPass: async (args: Record<string, unknown>) => {
    h.passes.push(args);
    return { considered: 0, nextAfterOrganizationId: null };
  },
}));

import { POST } from "../route";

const call = (query = "") =>
  POST(new Request(`http://localhost:3000/api/executive/reports/run${query}`, { method: "POST" }) as never);

beforeEach(() => {
  h.auth = { ok: true };
  h.passes = [];
});

describe("POST /api/executive/reports/run", () => {
  it("starts no pass for a refused caller", async () => {
    h.auth = { ok: false, status: 401, error: "AUTHENTICATION_REQUIRED" };
    const res = await call("?after=org-a");
    expect(res.status).toBe(401);
    expect(h.passes).toHaveLength(0);
  });

  it("runs the first batch with the default size and no cursor", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(h.passes[0]).toMatchObject({ maxOrganizations: 50, afterOrganizationId: null });
  });

  it("hands the cursor and the batch size to the pass as given", async () => {
    await call("?max=20&after=cmv3fa97i0003f8uap1h8qlhu");
    expect(h.passes[0]).toMatchObject({ maxOrganizations: 20, afterOrganizationId: "cmv3fa97i0003f8uap1h8qlhu" });
  });

  it("refuses a cursor that is not an organization id, before any pass starts", async () => {
    for (const bad of ["", "org a", "x".repeat(65), "org'--", "../../etc"]) {
      const res = await call(`?after=${encodeURIComponent(bad)}`);
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect(h.passes).toHaveLength(0);
  });

  it("still refuses a batch size outside 1..200", async () => {
    for (const bad of ["0", "201", "1.5", "abc"]) {
      expect((await call(`?max=${bad}`)).status, bad).toBe(400);
    }
    expect(h.passes).toHaveLength(0);
  });
});
