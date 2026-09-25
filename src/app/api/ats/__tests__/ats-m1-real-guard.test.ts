/**
 * ATS-M1 — the REAL `requireAtsActor` on the position routes (only the
 * organization resolution is simulated). Proves what the platform-role test
 * in security-8 can no longer prove for /api/ats/jobs: an authenticated,
 * ACTIVE member whose organization role holds no ATS capability is refused
 * with 403 before any service runs, and the capability ladder is the matrix's.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ role: "ENGINEER" as string }));

vi.mock("@/lib/billing/context", () => ({
  resolveOrgContext: async () => ({ ok: true, ctx: { userId: "u-1", orgId: "org-A", role: h.role } }),
}));

const svc = vi.hoisted(() => ({ listPositions: vi.fn(), createPosition: vi.fn(), softDeletePosition: vi.fn() }));
vi.mock("@/lib/ats/positions/service", async () => ({
  ...(await vi.importActual<typeof import("@/lib/ats/positions/service")>("@/lib/ats/positions/service")),
  listPositions: (...a: unknown[]) => svc.listPositions(...a),
  createPosition: (...a: unknown[]) => svc.createPosition(...a),
  softDeletePosition: (...a: unknown[]) => svc.softDeletePosition(...a),
}));

import { GET as list, POST as create } from "../jobs/route";
import { POST as softDelete } from "../jobs/[id]/delete/route";

const req = (method: string, url = "/api/ats/jobs") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", origin: "http://localhost:3000", "idempotency-key": "real-guard-key-1", "x-hermes-organization": "org-A" },
    ...(method === "GET" ? {} : { body: "{}" }),
  });

beforeEach(() => {
  for (const f of Object.values(svc)) f.mockReset();
  svc.listPositions.mockResolvedValue({ items: [], nextCursor: null });
  svc.createPosition.mockResolvedValue({ ok: true, replayed: false, result: { jobId: "j" } });
  svc.softDeletePosition.mockResolvedValue({ ok: true, replayed: false, result: { jobId: "j" } });
});

describe("the real ATS guard on the position routes", () => {
  it.each(["ENGINEER", "VIEWER", "MEMBER", "BILLING_ADMIN", "STUDENT"])("%s (no ATS capability) is refused 403 on read and write", async (role) => {
    h.role = role;
    expect((await list(req("GET"))).status).toBe(403);
    expect((await create(req("POST"))).status).toBe(403);
    expect(svc.listPositions).not.toHaveBeenCalled();
    expect(svc.createPosition).not.toHaveBeenCalled();
  });

  it("INTERVIEWER may list (ATS_VIEW) but not create (ATS_MANAGE)", async () => {
    h.role = "INTERVIEWER";
    expect((await list(req("GET"))).status).toBe(200);
    expect((await create(req("POST"))).status).toBe(403);
    expect(svc.createPosition).not.toHaveBeenCalled();
  });

  it("RECRUITER may create but not delete (ATS_ADMIN); HR_MANAGER may delete", async () => {
    h.role = "RECRUITER";
    expect((await create(req("POST"))).status).toBe(201);
    expect((await softDelete(req("POST", "/api/ats/jobs/j/delete"), { params: Promise.resolve({ id: "j" }) })).status).toBe(403);
    expect(svc.softDeletePosition).not.toHaveBeenCalled();
    h.role = "HR_MANAGER";
    expect((await softDelete(req("POST", "/api/ats/jobs/j/delete"), { params: Promise.resolve({ id: "j" }) })).status).toBe(200);
  });
});
