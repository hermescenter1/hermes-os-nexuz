/**
 * ATS-S1 — recruitment capabilities: discriminating, deny-by-default, and
 * layered on the Phase 110 organization context (401 → 409/428/503 → 403).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { ORGANIZATION_ROLES } from "@/lib/tenant/contract";

const h = vi.hoisted(() => ({
  org: { ok: false, reason: "AUTHENTICATION_REQUIRED" } as unknown,
}));
vi.mock("@/lib/billing/context", () => ({ resolveOrgContext: async () => h.org }));

import { atsCan, ATS_CAPABILITIES, requireAtsActor } from "../rbac";

beforeEach(() => {
  h.org = { ok: false, reason: "AUTHENTICATION_REQUIRED" };
});

describe("the matrix", () => {
  it("OWNER / ADMIN / HR_MANAGER hold everything", () => {
    for (const role of ["OWNER", "ADMIN", "HR_MANAGER"] as const) {
      for (const cap of ATS_CAPABILITIES) expect(atsCan(role, cap), `${role} ${cap}`).toBe(true);
    }
  });

  it("RECRUITER runs the pipeline and decides, but does not administer", () => {
    expect(atsCan("RECRUITER", "ATS_REVIEW")).toBe(true);
    expect(atsCan("RECRUITER", "ATS_MANAGE")).toBe(true);
    expect(atsCan("RECRUITER", "ATS_ADMIN")).toBe(false);
  });

  it("HIRING_MANAGER decides and interviews, never authors", () => {
    expect(atsCan("HIRING_MANAGER", "ATS_REVIEW")).toBe(true);
    expect(atsCan("HIRING_MANAGER", "ATS_INTERVIEW")).toBe(true);
    expect(atsCan("HIRING_MANAGER", "ATS_MANAGE")).toBe(false);
    expect(atsCan("HIRING_MANAGER", "ATS_SCORE")).toBe(false);
  });

  it("INTERVIEWER sees and records feedback only; MANAGER is read-only", () => {
    expect(atsCan("INTERVIEWER", "ATS_VIEW")).toBe(true);
    expect(atsCan("INTERVIEWER", "ATS_INTERVIEW")).toBe(true);
    expect(atsCan("INTERVIEWER", "ATS_REVIEW")).toBe(false);
    expect(atsCan("MANAGER", "ATS_VIEW")).toBe(true);
    expect(atsCan("MANAGER", "ATS_REVIEW")).toBe(false);
  });

  it("ENGINEER, VIEWER, BILLING_ADMIN, MEMBER and the non-recruitment roles hold NOTHING", () => {
    for (const role of ["ENGINEER", "VIEWER", "BILLING_ADMIN", "MEMBER", "ACADEMY_ADMIN", "CUSTOMER_SUCCESS_MANAGER", "STUDENT", "COMPLIANCE_MANAGER"] as const) {
      for (const cap of ATS_CAPABILITIES) expect(atsCan(role, cap), `${role} ${cap}`).toBe(false);
    }
  });

  it("an unknown role string holds nothing (deny by default)", () => {
    expect(atsCan("SUPERUSER", "ATS_VIEW")).toBe(false);
    expect(atsCan("", "ATS_VIEW")).toBe(false);
  });

  it("covers every role the tenant contract declares — no role is undecided", () => {
    for (const role of ORGANIZATION_ROLES) {
      for (const cap of ATS_CAPABILITIES) expect(typeof atsCan(role, cap)).toBe("boolean");
    }
  });

  it("ANTI-VACUITY: the matrix is not uniformly true or false", () => {
    const all = ORGANIZATION_ROLES.flatMap((r) => ATS_CAPABILITIES.map((c) => atsCan(r, c)));
    expect(all.some(Boolean)).toBe(true);
    expect(all.some((x) => !x)).toBe(true);
  });
});

describe("requireAtsActor — refusal order", () => {
  const req = () => new NextRequest("http://localhost/api/ats/x", { method: "GET" });

  it("no session → 401 AUTHENTICATION_REQUIRED", async () => {
    const r = await requireAtsActor(req(), "ATS_VIEW");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(401);
    expect((await r.response.json()).code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("organization refusals pass through with their own status (409 selection, 428 precondition, 503 unavailable)", async () => {
    for (const [reason, status] of [
      ["ORGANIZATION_SELECTION_REQUIRED", 409],
      ["ORGANIZATION_PRECONDITION_REQUIRED", 428],
      ["ORGANIZATION_CONTEXT_UNAVAILABLE", 503],
    ] as const) {
      h.org = { ok: false, reason };
      const r = await requireAtsActor(req(), "ATS_VIEW");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(status);
    }
  });

  it("a proven member WITHOUT the capability → 403 FORBIDDEN", async () => {
    h.org = { ok: true, ctx: { userId: "u1", orgId: "org-1", role: "ENGINEER" } };
    const r = await requireAtsActor(req(), "ATS_VIEW");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      expect(r.response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("a proven member WITH the capability → the actor context, and nothing more", async () => {
    h.org = { ok: true, ctx: { userId: "u1", orgId: "org-1", role: "RECRUITER" } };
    const r = await requireAtsActor(req(), "ATS_REVIEW");
    expect(r).toEqual({ ok: true, ctx: { userId: "u1", orgId: "org-1", role: "RECRUITER" } });
  });
});
