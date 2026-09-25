/**
 * Phase 86C4B2B1D-SECURITY-8 — Write-API authorization & abuse regression.
 *
 * Locks the fixes for the confirmed write-endpoint vulnerabilities:
 *
 *   ATS internal creation (mock, no persistence, no UI POST consumer) — now
 *   authoring-gated: POST /api/ats/{jobs,candidates,score}.
 *   ATS cross-tenant IDOR — now org-membership-scoped:
 *     POST  /api/ats/interviews, PATCH /api/ats/applications/[id]/status.
 *   Anonymous paid-LLM abuse — POST /api/ai now authoring-gated + IP rate
 *   limited (its aiGateway client is never called in the app).
 *   Billing cross-tenant financial write — POST /api/billing/payments now
 *   rejects an invoice the caller's org does not own before recording it.
 *   Public applicant abuse — POST /api/careers/apply and
 *   POST /api/candidate/register keep anonymous access but gain IP rate
 *   limiting + bounded body reads.
 *
 * All handlers run in session mode with the in-process rate limiter (no
 * REDIS_URL), deterministic, no network. Denials are proven to occur BEFORE
 * the repository / Prisma / LLM / write is reached, via spies.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockNoUser, mockViewer, mockEngineer, unmockAuth } from "@/test/mock-auth";

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL", "REDIS_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.doUnmock("@/lib/auth/rbac-server");
  vi.doUnmock("@/lib/org/context");
  unmockAuth();
});

function mockAuthRole(role: string | null): void {
  vi.doUnmock("@/lib/auth/rbac-server");
  vi.doMock("@/lib/auth/rbac-server", () => ({ getAuthRole: async () => role }));
}

function jsonReq(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "10.0.0.1" },
    body: JSON.stringify(body),
  });
}

// ── ATS internal creation — authoring gate ───────────────────────────────────

const ATS_MOCK_ROUTES = [
  { name: "/api/ats/jobs", path: "../../../app/api/ats/jobs/route", body: { title: "X" }, b1: true },
  { name: "/api/ats/candidates", path: "../../../app/api/ats/candidates/route", body: { name: "X" } },
  { name: "/api/ats/score", path: "../../../app/api/ats/score/route", body: { jobId: "job-1" } },
];

/** B1/M1 routes resolve an organization session: give the request the (empty) cookie jar a NextRequest has. */
function sessionless(route: { b1?: boolean }, req: Request): Request {
  if (route.b1) Object.defineProperty(req, "cookies", { value: { get: () => undefined } });
  return req;
}

describe("ATS internal creation requires the authoring capability", () => {
  for (const route of ATS_MOCK_ROUTES) {
    it(`${route.name}: anonymous → 401`, async () => {
      mockAuthRole(null);
      const { POST } = await import(route.path);
      const res = await POST(sessionless(route, jsonReq(route.name, route.body)));
      expect(res.status).toBe(401);
    });

    it(`${route.name}: non-authoring role (customer) → ${(route as { b1?: boolean }).b1 ? "401 (ATS guard: no organization session)" : "403"}`, async () => {
      mockAuthRole("customer");
      const { POST } = await import(route.path);
      const res = await POST(sessionless(route, jsonReq(route.name, route.body)));
      // ATS-M1 — /api/ats/jobs is guarded by requireAtsActor(req, "ATS_MANAGE"),
      // which never consults the platform role: a caller without an organization
      // session is refused before any capability is even considered.
      expect(res.status).toBe((route as { b1?: boolean }).b1 ? 401 : 403);
    });

    it(`${route.name}: authoring role (engineer) → ${(route as { b1?: boolean }).b1 ? "org refusal (B1)" : "success"}`, async () => {
      mockAuthRole("engineer");
      const { POST } = await import(route.path);
      const req = jsonReq(route.name, route.body);
      if ((route as { b1?: boolean }).b1) {
        // PHASE 104-B1 — /api/ats/jobs writes through createJobDraft() behind
        // resolveOrgContext. An authoring capability WITHOUT an organization
        // session is refused; the in-memory 201 fabrication is gone.
        Object.defineProperty(req, "cookies", { value: { get: () => undefined } });
        const res = await POST(req);
        expect(res.status).toBe(401);
        expect(res.headers.get("Cache-Control")).toBe("no-store");
      } else {
        const res = await POST(req);
        expect([200, 201, 404]).toContain(res.status); // score→404 for unknown job is fine
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
      }
    });
  }
});

// ── ATS interviews — cross-tenant IDOR ───────────────────────────────────────

describe("POST /api/ats/interviews — tenant isolation", () => {
  const ROUTE = "../../../app/api/ats/interviews/route";
  const APP = { id: "app-1", organizationId: "org-A", status: "APPLIED" };

  function setup(role: string | null, member: boolean, createSpy = vi.fn(async () => ({ id: "iv-1" }))) {
    mockAuthRole(role);
    vi.doMock("@/lib/ats/db", () => ({
      getApplicationById: async () => APP,
      createInterview: createSpy,
      getInterviewsByOrg: async () => [],
    }));
    vi.doUnmock("@/lib/org/context");
    vi.doMock("@/lib/org/context", () => ({
      requireOrgActor: async (_req: unknown, orgId: string) =>
        member && orgId === "org-A"
          ? { ctx: { userId: "u1", orgId, role: "ADMIN", status: "ACTIVE" } }
          : { error: "Not a member of this organization", status: 403 },
    }));
    return createSpy;
  }

  it("anonymous → 401, no interview created", async () => {
    const spy = setup(null, false);
    const { POST } = await import(ROUTE);
    const res = await POST(jsonReq("/api/ats/interviews", { applicationId: "app-1", scheduledAt: "2026-01-01" }));
    expect(res.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  it("non-staff role (customer) → 403, no interview created", async () => {
    const spy = setup("customer", true);
    const { POST } = await import(ROUTE);
    const res = await POST(jsonReq("/api/ats/interviews", { applicationId: "app-1", scheduledAt: "2026-01-01" }));
    expect(res.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });

  it("staff of ANOTHER org → 404, no interview created (IDOR closed)", async () => {
    const spy = setup("admin", false); // requireOrgActor returns error for non-member
    const { POST } = await import(ROUTE);
    const res = await POST(jsonReq("/api/ats/interviews", { applicationId: "app-1", scheduledAt: "2026-01-01" }));
    expect(res.status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
  });

  it("staff of the application's org → interview created", async () => {
    const spy = setup("admin", true);
    const { POST } = await import(ROUTE);
    const res = await POST(jsonReq("/api/ats/interviews", { applicationId: "app-1", scheduledAt: "2026-01-01" }));
    expect(res.status).toBe(201);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ── ATS application status — cross-tenant IDOR ────────────────────────────────

describe("PATCH /api/ats/applications/[id]/status — tenant isolation", () => {
  /*
   * ATS-S1 rewired this route: the coarse platform-role gate became the
   * ATS_MANAGE organization capability (`@/lib/ats/rbac`), and the
   * non-transactional `updateApplicationStatus` became the transactional
   * `transitionApplication` service, which scopes the application by the
   * ACTOR'S organization and answers NOT_FOUND for a foreign one. The three
   * SECURITY-8 intents are unchanged: a role without the capability is 403,
   * another organization's application is 404, a member of the right
   * organization succeeds — plus the new contract's mandatory reason.
   */
  const ROUTE = "../../../app/api/ats/applications/[id]/status/route";

  function patchReq(body: Record<string, unknown>): NextRequest {
    return new NextRequest("http://localhost/api/ats/applications/app-1/status", {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-hermes-organization": "org-A" },
      body: JSON.stringify(body),
    });
  }
  type TransitionResult =
    | { ok: true; decisionId: string; fromStatus: string; toStatus: string; cycle: number }
    | { ok: false; code: string };
  function setup(
    actor: { ok: true; ctx: { userId: string; orgId: string; role: string } } | { ok: false; status: number },
    transition: ReturnType<typeof vi.fn<() => Promise<TransitionResult>>> = vi.fn<() => Promise<TransitionResult>>(async () => ({
      ok: true,
      decisionId: "d-1",
      fromStatus: "APPLIED",
      toStatus: "SCREENING",
      cycle: 0,
    })),
  ) {
    vi.doUnmock("@/lib/ats/rbac");
    vi.doMock("@/lib/ats/rbac", () => ({
      requireAtsActor: async () =>
        actor.ok ? actor : { ok: false, response: new Response(JSON.stringify({ error: "refused" }), { status: actor.status }) },
    }));
    vi.doUnmock("@/lib/ats/decision");
    vi.doMock("@/lib/ats/decision", async () => ({
      ...(await vi.importActual<typeof import("@/lib/ats/decision")>("@/lib/ats/decision")),
      transitionApplication: transition,
    }));
    return transition;
  }
  afterEach(() => {
    vi.doUnmock("@/lib/ats/rbac");
    vi.doUnmock("@/lib/ats/decision");
  });

  it("a member WITHOUT ATS_MANAGE → 403, the service is never reached", async () => {
    const spy = setup({ ok: false, status: 403 });
    const { PATCH } = await import(ROUTE);
    const res = await PATCH(patchReq({ status: "SCREENING", reason: "Screening call done." }), { params: Promise.resolve({ id: "app-1" }) });
    expect(res.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });

  it("an application of ANOTHER org → 404 (IDOR closed): the service scopes by the ACTOR's org, never a client value", async () => {
    const spy = setup(
      { ok: true, ctx: { userId: "u1", orgId: "org-A", role: "ADMIN" } },
      vi.fn<() => Promise<TransitionResult>>(async () => ({ ok: false, code: "NOT_FOUND" })),
    );
    const { PATCH } = await import(ROUTE);
    const res = await PATCH(patchReq({ status: "SCREENING", reason: "Screening call done.", organizationId: "org-B" }), { params: Promise.resolve({ id: "app-1" }) });
    // `organizationId` in the body is an unknown key → the strict schema refuses it outright.
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();

    const res2 = await PATCH(patchReq({ status: "SCREENING", reason: "Screening call done." }), { params: Promise.resolve({ id: "app-1" }) });
    expect(res2.status).toBe(404);
    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0] as unknown[])[0]).toMatchObject({ organizationId: "org-A", applicationId: "app-1" });
  });

  it("an ATS_MANAGE member of the application's org → 200 with the decision id", async () => {
    const spy = setup({ ok: true, ctx: { userId: "u1", orgId: "org-A", role: "RECRUITER" } });
    const { PATCH } = await import(ROUTE);
    const res = await PATCH(patchReq({ status: "SCREENING", reason: "Screening call done." }), { params: Promise.resolve({ id: "app-1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ decisionId: "d-1", fromStatus: "APPLIED", toStatus: "SCREENING" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0] as unknown[])[0]).toMatchObject({ reason: "Screening call done.", actor: { userId: "u1", role: "RECRUITER" } });
  });

  it("a transition without a reason is 400 and never reaches the service", async () => {
    const spy = setup({ ok: true, ctx: { userId: "u1", orgId: "org-A", role: "ADMIN" } });
    const { PATCH } = await import(ROUTE);
    const res = await PATCH(patchReq({ status: "SCREENING" }), { params: Promise.resolve({ id: "app-1" }) });
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ── Anonymous paid-LLM — POST /api/ai ────────────────────────────────────────

describe("POST /api/ai — authenticated + rate limited", () => {
  const ROUTE = "../../../app/api/ai/route";
  function mockGateway() {
    const completeChat = vi.fn(async () => ({ ok: true, text: "hi", usage: {} }));
    vi.doMock("@/lib/llm/gateway", () => ({ completeChat }));
    return completeChat;
  }

  // PHASE 95: /api/ai is DISABLED BY DEFAULT. Enable it for the auth/rate-limit
  // security assertions below (they verify behaviour when the route is on), and
  // assert the fail-closed 503 when the flag is unset.
  const savedFlag = process.env.HERMES_PUBLIC_AI_ENABLED;
  beforeEach(() => {
    process.env.HERMES_PUBLIC_AI_ENABLED = "1";
  });
  afterEach(() => {
    if (savedFlag === undefined) delete process.env.HERMES_PUBLIC_AI_ENABLED;
    else process.env.HERMES_PUBLIC_AI_ENABLED = savedFlag;
  });

  it("disabled by default → 503 (fail closed), LLM never called", async () => {
    delete process.env.HERMES_PUBLIC_AI_ENABLED;
    const spy = mockGateway();
    mockEngineer();
    const { POST } = await import(ROUTE);
    const res = await POST(jsonReq("/api/ai", { messages: [{ role: "user", content: "hi" }] }));
    expect(res.status).toBe(503);
    expect(spy).not.toHaveBeenCalled();
  });

  it("anonymous → 401, LLM never called", async () => {
    const spy = mockGateway();
    mockNoUser();
    const { POST } = await import(ROUTE);
    const res = await POST(jsonReq("/api/ai", { messages: [] }));
    expect(res.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  it("authenticated non-authoring → 403, LLM never called", async () => {
    const spy = mockGateway();
    mockViewer();
    const { POST } = await import(ROUTE);
    const res = await POST(jsonReq("/api/ai", { messages: [] }));
    expect(res.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });

  it("authoring → reaches the gateway", async () => {
    const spy = mockGateway();
    mockEngineer();
    const { POST } = await import(ROUTE);
    const res = await POST(jsonReq("/api/ai", { messages: [{ role: "user", content: "hi" }] }));
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("exceeding the per-IP limit → 429 with Retry-After, LLM not called past the cap", async () => {
    const spy = mockGateway();
    mockEngineer();
    const { POST } = await import(ROUTE);
    let last: Response | undefined;
    for (let i = 0; i < 22; i++) {
      last = await POST(jsonReq("/api/ai", { messages: [{ role: "user", content: "hi" }] }));
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get("retry-after")).toBeTruthy();
    expect(last!.headers.get("cache-control")).toBe("no-store");
    expect(spy.mock.calls.length).toBeLessThanOrEqual(20);
  });
});

// ── Billing cross-tenant financial write ─────────────────────────────────────

describe("POST /api/billing/payments — tenant isolation", () => {
  const ROUTE = "../../../app/api/billing/payments/route";
  function setup(invoiceOrg: string | null, recordSpy = vi.fn(async () => ({ ok: true, payment: { id: "p1" } }))) {
    vi.doMock("@/lib/billing/context", () => ({
      requireOrgContext: async () => ({ ctx: { userId: "u1", orgId: "org-A", role: "OWNER" } }),
    }));
    vi.doMock("@/lib/billing/invoices", () => ({
      getInvoiceById: async () => (invoiceOrg ? { id: "inv-1", organizationId: invoiceOrg } : null),
    }));
    vi.doMock("@/lib/billing/payments", () => ({ recordManualPayment: recordSpy, listPayments: async () => [] }));
    return recordSpy;
  }

  it("invoice owned by ANOTHER org → 404, no payment recorded (cross-tenant closed)", async () => {
    const spy = setup("org-B");
    const { POST } = await import(ROUTE);
    const res = await POST(jsonReq("/api/billing/payments", { invoiceId: "inv-1", amount: 10, currency: "USD" }));
    expect(res.status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
  });

  it("missing invoice → 404, no payment recorded", async () => {
    const spy = setup(null);
    const { POST } = await import(ROUTE);
    const res = await POST(jsonReq("/api/billing/payments", { invoiceId: "nope", amount: 10, currency: "USD" }));
    expect(res.status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
  });

  it("invoice owned by the caller's org → payment recorded", async () => {
    const spy = setup("org-A");
    const { POST } = await import(ROUTE);
    const res = await POST(jsonReq("/api/billing/payments", { invoiceId: "inv-1", amount: 10, currency: "USD" }));
    expect(res.status).toBe(201);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ── Public applicant abuse controls ──────────────────────────────────────────

describe("POST /api/careers/apply — public, rate limited & bounded", () => {
  const ROUTE = "../../../app/api/careers/apply/route";
  function setup() {
    const createCandidate = vi.fn(async () => ({ id: "c1" }));
    const createApplication = vi.fn(async () => ({ id: "a1" }));
    vi.doMock("@/lib/ats/db", () => ({
      getJobById: async () => ({ id: "job-1", organizationId: "org-A" }),
      getCandidateByEmail: async () => null,
      createCandidate,
      createApplication,
    }));
    return { createCandidate, createApplication };
  }

  // PHASE 104-B1 — the Stage-1 payload with the mandatory records and the
  // payload-bound idempotency key header. Acceptance is NOT authorized in B1,
  // so even a fully valid payload refuses generically with zero writes.
  const B1_BODY = {
    jobId: "job-1",
    fullName: "A B",
    email: "a@b.co",
    privacyNoticeAcknowledged: true,
    accuracyConfirmed: true,
  };
  const B1_KEY = "9f2c1d3e4b5a6978a0b1c2d3e4f50617";
  function b1Req(ip = "10.0.0.1") {
    return new Request("http://localhost/api/careers/apply", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip, "idempotency-key": B1_KEY },
      body: JSON.stringify(B1_BODY),
    });
  }

  it("a valid Stage-1 application within the limit refuses GENERICALLY in B1 — never 401, zero writes", async () => {
    const spies = setup();
    const { POST } = await import(ROUTE);
    const res = await POST(b1Req());
    expect(res.status).toBe(503);
    expect(res.status).not.toBe(401);
    expect(spies.createCandidate).not.toHaveBeenCalled();
    expect(spies.createApplication).not.toHaveBeenCalled();
  });

  it("unsupported content-type → 415 before any write", async () => {
    const spies = setup();
    const { POST } = await import(ROUTE);
    const req = new Request("http://localhost/api/careers/apply", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-real-ip": "10.0.0.9" },
      body: "hi",
    });
    const res = await POST(req);
    expect(res.status).toBe(415);
    expect(spies.createCandidate).not.toHaveBeenCalled();
  });

  it("exceeding the per-IP limit → 429, and no write ever happens", async () => {
    const spies = setup();
    const { POST } = await import(ROUTE);
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await POST(b1Req());
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get("retry-after")).toBeTruthy();
    expect(spies.createCandidate).not.toHaveBeenCalled();
  });

  it("a different client IP uses a separate bucket (no 429; still the generic B1 refusal)", async () => {
    setup();
    const { POST } = await import(ROUTE);
    for (let i = 0; i < 5; i++) {
      await POST(b1Req("10.0.0.1"));
    }
    const res = await POST(b1Req("10.0.0.2"));
    expect(res.status).not.toBe(429);
    expect(res.status).toBe(503);
  });
});

describe("POST /api/candidate/register — public, rate limited", () => {
  const ROUTE = "../../../app/api/candidate/register/route";
  it("rejected-by-limit request creates no user", async () => {
    // No getPrisma mock needed: the limiter rejects before the DB branch.
    const { POST } = await import(ROUTE);
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await POST(jsonReq("/api/candidate/register", { name: "A", email: "a@b.co", password: "password123" }));
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get("retry-after")).toBeTruthy();
    expect(last!.headers.get("cache-control")).toBe("no-store");
  });

  it("unsupported content-type → 415", async () => {
    const { POST } = await import(ROUTE);
    const req = new Request("http://localhost/api/candidate/register", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-real-ip": "10.0.0.7" },
      body: "x",
    });
    const res = await POST(req);
    expect(res.status).toBe(415);
  });
});
