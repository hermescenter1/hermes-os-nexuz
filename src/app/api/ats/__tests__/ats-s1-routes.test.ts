/**
 * ATS-S1 — the four new routes: authorization order, strict bodies, and the
 * mapping of service refusals to HTTP, with the services mocked and the
 * capability guard driven per case.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

type Actor = { ok: true; ctx: { userId: string; orgId: string; role: string } } | { ok: false; status: number };

const h = vi.hoisted(() => ({
  actor: { ok: false, status: 401 } as Actor,
  capabilityAsked: [] as string[],
  db: null as unknown,
  workerAuth: { ok: true } as { ok: true } | { ok: false; status: 401 | 403; error: string },
}));

vi.mock("@/lib/ats/rbac", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ats/rbac")>("@/lib/ats/rbac");
  return {
    ...actual,
    requireAtsActor: async (_req: unknown, capability: string) => {
      h.capabilityAsked.push(capability);
      const a = h.actor;
      if (a.ok) return a;
      return { ok: false, response: new Response(JSON.stringify({ error: "refused" }), { status: a.status }) };
    },
  };
});
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.db }));
vi.mock("@/lib/ats/review/worker-auth", () => ({ authorizeReviewWorker: async () => h.workerAuth }));

const recordGateDecision = vi.fn();
const transitionApplication = vi.fn();
vi.mock("@/lib/ats/decision", async () => ({
  ...(await vi.importActual<typeof import("@/lib/ats/decision")>("@/lib/ats/decision")),
  recordGateDecision: (...a: unknown[]) => recordGateDecision(...a),
  transitionApplication: (...a: unknown[]) => transitionApplication(...a),
}));
const applyRoleProfileToJob = vi.fn();
const listJobCriteria = vi.fn();
vi.mock("@/lib/ats/criteria", () => ({
  applyRoleProfileToJob: (...a: unknown[]) => applyRoleProfileToJob(...a),
  listJobCriteria: (...a: unknown[]) => listJobCriteria(...a),
}));
const runAiReviewPass = vi.fn();
vi.mock("@/lib/ats/review/worker", async () => ({
  ...(await vi.importActual<typeof import("@/lib/ats/review/worker")>("@/lib/ats/review/worker")),
  runAiReviewPass: (...a: unknown[]) => runAiReviewPass(...a),
}));

import { POST as decide } from "../applications/[id]/decision/route";
import { GET as review } from "../applications/[id]/review/route";
import { GET as listCriteria, POST as applyProfile } from "../jobs/[id]/criteria/route";
import { POST as deliver } from "../review/deliver/route";

const params = (id = "app-1") => ({ params: Promise.resolve({ id }) });
const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, {
    method,
    headers: { "content-type": "application/json", "x-hermes-organization": "org-A" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeEach(() => {
  h.actor = { ok: false, status: 401 };
  h.capabilityAsked = [];
  h.db = null;
  h.workerAuth = { ok: true };
  recordGateDecision.mockReset();
  transitionApplication.mockReset();
  applyRoleProfileToJob.mockReset();
  listJobCriteria.mockReset();
  runAiReviewPass.mockReset();
});
afterEach(() => vi.clearAllMocks());

const member = (role = "HR_MANAGER"): Actor => ({ ok: true, ctx: { userId: "u-1", orgId: "org-A", role } });

describe("POST /api/ats/applications/[id]/decision", () => {
  const good = { decision: "ADVANCE", reason: "Meets the must-haves with cited evidence." };

  it("asks for ATS_REVIEW and refuses before reading the body", async () => {
    h.actor = { ok: false, status: 401 };
    const res = await decide(json("http://localhost/api/ats/applications/app-1/decision", "POST", good), params());
    expect(res.status).toBe(401);
    expect(h.capabilityAsked).toEqual(["ATS_REVIEW"]);
    expect(recordGateDecision).not.toHaveBeenCalled();
    h.actor = { ok: false, status: 403 };
    expect((await decide(json("http://localhost/x", "POST", good), params())).status).toBe(403);
    h.actor = { ok: false, status: 428 };
    expect((await decide(json("http://localhost/x", "POST", good), params())).status).toBe(428);
  });

  it("refuses an unknown key, a missing reason and an unknown decision with 400 — service untouched", async () => {
    h.actor = member();
    for (const body of [{ ...good, organizationId: "org-B" }, { decision: "ADVANCE" }, { decision: "AUTO_HIRE", reason: "x" }, { decision: "ADVANCE", reason: "" }]) {
      expect((await decide(json("http://localhost/x", "POST", body), params())).status).toBe(400);
    }
    expect((await decide(new NextRequest("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" }), params())).status).toBe(400);
    expect(recordGateDecision).not.toHaveBeenCalled();
  });

  it("passes the ACTOR's organization and identity to the service — never a client value", async () => {
    h.actor = member("RECRUITER");
    recordGateDecision.mockResolvedValue({ ok: true, decisionId: "d-9", fromStatus: "PENDING_HUMAN_APPROVAL", toStatus: "SCREENING", cycle: 0 });
    const res = await decide(json("http://localhost/x", "POST", { ...good, aiReviewId: "rev-1" }), params("app-7"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ decisionId: "d-9", fromStatus: "PENDING_HUMAN_APPROVAL", toStatus: "SCREENING", cycle: 0 });
    expect(recordGateDecision.mock.calls[0][0]).toMatchObject({
      organizationId: "org-A",
      applicationId: "app-7",
      actor: { userId: "u-1", role: "RECRUITER" },
      decision: "ADVANCE",
      reason: good.reason,
      aiReviewId: "rev-1",
    });
    expect(typeof recordGateDecision.mock.calls[0][0].correlationId).toBe("string");
  });

  it("maps service refusals: NOT_FOUND 404, INVALID_STATE 422, STALE 409, INVALID_INPUT 400, STORE_UNAVAILABLE 503", async () => {
    h.actor = member();
    for (const [code, status] of [["NOT_FOUND", 404], ["INVALID_STATE", 422], ["STALE", 409], ["INVALID_INPUT", 400], ["STORE_UNAVAILABLE", 503], ["WRITE_FAILED", 500]] as const) {
      recordGateDecision.mockResolvedValueOnce({ ok: false, code });
      const res = await decide(json("http://localhost/x", "POST", good), params());
      expect(res.status, code).toBe(status);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });
});

describe("GET /api/ats/applications/[id]/review", () => {
  const row = {
    id: "app-1",
    status: "PENDING_HUMAN_APPROVAL",
    jobId: "job-1",
    aiReviewCycle: 0,
    source: "careers_portal",
    totalYearsExp: 5,
    createdAt: new Date("2026-09-23T00:00:00Z"),
    updatedAt: new Date("2026-09-23T00:00:00Z"),
    retentionExpiresAt: null,
    withdrawnAt: null,
    anonymizedAt: null,
    candidate: { name: "Jane Doe", email: "jane@example.org", phone: "+1", location: "Isfahan", linkedinUrl: null, skills: ["PLC"] },
    job: { title: "Automation Engineer", department: "automation" },
    aiReviews: [{ id: "rev-1", cycle: 0, recommendation: "REVIEW_REQUIRED", report: {} }],
    reviewDecisions: [],
    pipelineEvents: [],
  };
  const dbWith = (found: boolean) => ({
    atsApplication: {
      findFirst: vi.fn(async (a: { where: { id: string; organizationId: string } }) => (found && a.where.organizationId === "org-A" ? row : null)),
    },
  });

  it("asks for ATS_VIEW; the application is loaded with the ACTOR's org in the predicate", async () => {
    h.actor = member("MANAGER");
    const db = dbWith(true);
    h.db = db;
    const res = await review(json("http://localhost/x", "GET"), params());
    expect(res.status).toBe(200);
    expect(h.capabilityAsked).toEqual(["ATS_VIEW"]);
    expect(db.atsApplication.findFirst.mock.calls[0][0].where).toMatchObject({ id: "app-1", organizationId: "org-A", deletedAt: null });
    const body = await res.json();
    expect(body.application.awaitingHumanDecision).toBe(true);
    expect(body.aiReview.id).toBe("rev-1");
  });

  it("contact details are projected only for ATS_REVIEW / ATS_MANAGE holders", async () => {
    h.db = dbWith(true);
    h.actor = member("MANAGER");
    const viewer = await (await review(json("http://localhost/x", "GET"), params())).json();
    expect(viewer.candidate).toEqual({ name: "Jane Doe", location: "Isfahan", skills: ["PLC"], linkedinUrl: null });
    h.actor = member("HIRING_MANAGER");
    const reviewer = await (await review(json("http://localhost/x", "GET"), params())).json();
    expect(reviewer.candidate.email).toBe("jane@example.org");
  });

  it("a foreign or missing application is one 404; an unavailable store is 503", async () => {
    h.actor = member();
    h.db = dbWith(false);
    expect((await review(json("http://localhost/x", "GET"), params())).status).toBe(404);
    h.db = null;
    expect((await review(json("http://localhost/x", "GET"), params())).status).toBe(503);
  });
});

describe("/api/ats/jobs/[id]/criteria", () => {
  it("GET asks for ATS_VIEW and lists the caller's job criteria", async () => {
    h.actor = member("INTERVIEWER");
    listJobCriteria.mockResolvedValue([{ id: "c1", code: "backend_engineer.sql" }]);
    const res = await listCriteria(json("http://localhost/x", "GET"), params("job-1"));
    expect(res.status).toBe(200);
    expect(h.capabilityAsked).toEqual(["ATS_VIEW"]);
    expect(listJobCriteria).toHaveBeenCalledWith("org-A", "job-1");
    expect(await res.json()).toEqual({ criteria: [{ id: "c1", code: "backend_engineer.sql" }], total: 1 });
  });

  it("POST asks for ATS_MANAGE, validates the role code strictly and forwards the actor's org", async () => {
    h.actor = member("HIRING_MANAGER");
    applyRoleProfileToJob.mockResolvedValueOnce({ ok: true, roleCode: "backend_engineer", written: 11, untouched: 0 });
    const res = await applyProfile(json("http://localhost/x", "POST", { roleCode: "backend_engineer" }), params("job-1"));
    expect(res.status).toBe(200);
    expect(h.capabilityAsked).toEqual(["ATS_MANAGE"]);
    expect(applyRoleProfileToJob.mock.calls[0][0]).toMatchObject({ organizationId: "org-A", jobId: "job-1", roleCode: "backend_engineer" });
  });

  it("POST: unknown role or extra key → 400; NOT_FOUND → 404", async () => {
    h.actor = member();
    expect((await applyProfile(json("http://localhost/x", "POST", { roleCode: "ceo" }), params("job-1"))).status).toBe(400);
    expect((await applyProfile(json("http://localhost/x", "POST", { roleCode: "backend_engineer", organizationId: "org-B" }), params("job-1"))).status).toBe(400);
    expect(applyRoleProfileToJob).not.toHaveBeenCalled();
    applyRoleProfileToJob.mockResolvedValueOnce({ ok: false, code: "NOT_FOUND" });
    expect((await applyProfile(json("http://localhost/x", "POST", { roleCode: "backend_engineer" }), params("job-1"))).status).toBe(404);
    applyRoleProfileToJob.mockResolvedValueOnce({ ok: true, roleCode: "backend_engineer", written: 11, untouched: 0 });
    const ok = await applyProfile(json("http://localhost/x", "POST", { roleCode: "backend_engineer" }), params("job-1"));
    expect(ok.status).toBe(200);
    expect(applyRoleProfileToJob.mock.calls[1][0]).toMatchObject({ organizationId: "org-A", jobId: "job-1", roleCode: "backend_engineer", actor: { userId: "u-1" } });
  });
});

describe("POST /api/ats/review/deliver", () => {
  it("refuses without worker authorization and never runs a pass", async () => {
    h.workerAuth = { ok: false, status: 401, error: "unauthorized" };
    expect((await deliver(json("http://localhost/api/ats/review/deliver", "POST"))).status).toBe(401);
    h.workerAuth = { ok: false, status: 403, error: "forbidden" };
    expect((await deliver(json("http://localhost/api/ats/review/deliver", "POST"))).status).toBe(403);
    expect(runAiReviewPass).not.toHaveBeenCalled();
  });

  it("validates the limit and returns counts only; a store outage is 503", async () => {
    expect((await deliver(json("http://localhost/api/ats/review/deliver?limit=abc", "POST"))).status).toBe(400);
    expect((await deliver(json("http://localhost/api/ats/review/deliver?limit=0", "POST"))).status).toBe(400);
    runAiReviewPass.mockResolvedValueOnce({ claimed: 2, delivered: 2, retrying: 0, deadLettered: 0, skipped: 0, storeUnavailable: false });
    const res = await deliver(json("http://localhost/api/ats/review/deliver?limit=5", "POST"));
    expect(res.status).toBe(200);
    expect(runAiReviewPass).toHaveBeenCalledWith({ limit: 5 });
    expect(Object.keys(await res.json()).sort()).toEqual(["claimed", "deadLettered", "delivered", "retrying", "skipped", "storeUnavailable"]);
    runAiReviewPass.mockResolvedValueOnce({ claimed: 0, delivered: 0, retrying: 0, deadLettered: 0, skipped: 0, storeUnavailable: true });
    expect((await deliver(json("http://localhost/api/ats/review/deliver", "POST"))).status).toBe(503);
  });
});
