/**
 * ATS-M1 — the position and settings routes: authorization order, CSRF
 * (Origin), the mandatory Idempotency-Key, the tenant coming ONLY from the
 * authenticated actor, and the mapping of service refusals to HTTP — with the
 * services mocked and the capability guard driven per case.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Actor = { ok: true; ctx: { userId: string; orgId: string; role: string } } | { ok: false; status: number };

const h = vi.hoisted(() => ({
  actor: { ok: false, status: 401 } as Actor,
  asked: [] as string[],
}));

vi.mock("@/lib/ats/rbac", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ats/rbac")>("@/lib/ats/rbac");
  return {
    ...actual,
    requireAtsActor: async (_req: unknown, capability: string) => {
      h.asked.push(capability);
      const a = h.actor;
      if (a.ok) return a;
      return { ok: false, response: new Response(JSON.stringify({ error: "refused" }), { status: a.status }) };
    },
  };
});

const svc = vi.hoisted(() => ({
  createPosition: vi.fn(),
  listPositions: vi.fn(),
  getPositionDetail: vi.fn(),
  updatePosition: vi.fn(),
  transitionPosition: vi.fn(),
  softDeletePosition: vi.fn(),
  listPositionAudit: vi.fn(),
  createInitialDrafts: vi.fn(),
  listOwnerCandidates: vi.fn(),
  getSettingsView: vi.fn(),
  updateSettings: vi.fn(),
  updateRetention: vi.fn(),
}));
vi.mock("@/lib/ats/positions/service", async () => ({
  ...(await vi.importActual<typeof import("@/lib/ats/positions/service")>("@/lib/ats/positions/service")),
  createPosition: (...a: unknown[]) => svc.createPosition(...a),
  listPositions: (...a: unknown[]) => svc.listPositions(...a),
  getPositionDetail: (...a: unknown[]) => svc.getPositionDetail(...a),
  updatePosition: (...a: unknown[]) => svc.updatePosition(...a),
  transitionPosition: (...a: unknown[]) => svc.transitionPosition(...a),
  softDeletePosition: (...a: unknown[]) => svc.softDeletePosition(...a),
  listPositionAudit: (...a: unknown[]) => svc.listPositionAudit(...a),
  createInitialDrafts: (...a: unknown[]) => svc.createInitialDrafts(...a),
  listOwnerCandidates: (...a: unknown[]) => svc.listOwnerCandidates(...a),
}));
vi.mock("@/lib/ats/settings/service", async () => ({
  ...(await vi.importActual<typeof import("@/lib/ats/settings/service")>("@/lib/ats/settings/service")),
  getSettingsView: (...a: unknown[]) => svc.getSettingsView(...a),
  updateSettings: (...a: unknown[]) => svc.updateSettings(...a),
  updateRetention: (...a: unknown[]) => svc.updateRetention(...a),
}));

import { GET as listJobs, POST as createJob } from "../jobs/route";
import { GET as getJob, PATCH as patchJob } from "../jobs/[id]/route";
import { POST as transition } from "../jobs/[id]/transition/route";
import { POST as softDelete } from "../jobs/[id]/delete/route";
import { GET as audit } from "../jobs/[id]/audit/route";
import { GET as initialCatalogue, POST as initialDrafts } from "../jobs/initial-drafts/route";
import { GET as owners } from "../jobs/owners/route";
import { GET as getSettings, PATCH as patchSettings } from "../settings/route";
import { PUT as putRetention } from "../settings/retention/route";

const ORIGIN = "http://localhost:3000";
const params = (id = "job-1") => ({ params: Promise.resolve({ id }) });

function req(url: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-hermes-organization": "org-A",
      origin: ORIGIN,
      "idempotency-key": "test-key-0001",
      ...headers,
    },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}
const member = (role = "HR_MANAGER"): Actor => ({ ok: true, ctx: { userId: "u-1", orgId: "org-A", role } });
const OK = <T,>(result: T) => ({ ok: true, replayed: false, result });

beforeEach(() => {
  h.actor = { ok: false, status: 401 };
  h.asked = [];
  for (const f of Object.values(svc)) f.mockReset();
});

type Handler = (r: NextRequest, p: { params: Promise<{ id: string }> }) => Promise<Response>;
const MUTATIONS: { name: string; call: (r: NextRequest) => Promise<Response>; capability: string; url: string; method: string; svc: keyof typeof svc }[] = [
  { name: "POST /jobs", call: (r) => createJob(r), capability: "ATS_MANAGE", url: "/api/ats/jobs", method: "POST", svc: "createPosition" },
  { name: "PATCH /jobs/[id]", call: (r) => (patchJob as Handler)(r, params()), capability: "ATS_MANAGE", url: "/api/ats/jobs/job-1", method: "PATCH", svc: "updatePosition" },
  { name: "POST /jobs/[id]/transition", call: (r) => (transition as Handler)(r, params()), capability: "ATS_MANAGE", url: "/api/ats/jobs/job-1/transition", method: "POST", svc: "transitionPosition" },
  { name: "POST /jobs/[id]/delete", call: (r) => (softDelete as Handler)(r, params()), capability: "ATS_ADMIN", url: "/api/ats/jobs/job-1/delete", method: "POST", svc: "softDeletePosition" },
  { name: "POST /jobs/initial-drafts", call: (r) => initialDrafts(r), capability: "ATS_ADMIN", url: "/api/ats/jobs/initial-drafts", method: "POST", svc: "createInitialDrafts" },
  { name: "PATCH /settings", call: (r) => patchSettings(r), capability: "ATS_MANAGE", url: "/api/ats/settings", method: "PATCH", svc: "updateSettings" },
  { name: "PUT /settings/retention", call: (r) => putRetention(r), capability: "ATS_ADMIN", url: "/api/ats/settings/retention", method: "PUT", svc: "updateRetention" },
];

describe.each(MUTATIONS)("$name", (m) => {
  it(`asks for ${m.capability} FIRST and refuses (401/403/428) before the body is read or the service runs`, async () => {
    for (const status of [401, 403, 428]) {
      h.actor = { ok: false, status };
      h.asked = [];
      const res = await m.call(req(m.url, m.method, "{not json"));
      expect(res.status).toBe(status);
      expect(h.asked).toEqual([m.capability]);
    }
    expect(svc[m.svc]).not.toHaveBeenCalled();
  });

  it("CSRF: a missing or foreign Origin is refused with 403 — service untouched", async () => {
    h.actor = member();
    for (const origin of ["https://attacker.example", "https://www.hermesnovin.com.attacker.example", ""]) {
      const r = req(m.url, m.method, {}, origin ? { origin } : {});
      if (!origin) r.headers.delete("origin");
      const res = await m.call(r);
      expect(res.status, origin).toBe(403);
      expect((await res.json()).code).toBe("ORIGIN_NOT_ALLOWED");
    }
    expect(svc[m.svc]).not.toHaveBeenCalled();
  });

  it("an Idempotency-Key is mandatory (400); a malformed one counts as missing", async () => {
    h.actor = member();
    for (const key of [null, "short", "has spaces in it!!"]) {
      const r = req(m.url, m.method, {});
      if (key === null) r.headers.delete("idempotency-key");
      else r.headers.set("idempotency-key", key);
      const res = await m.call(r);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    }
    expect(svc[m.svc]).not.toHaveBeenCalled();
  });

  it("invalid JSON is a 400 without reaching the service", async () => {
    h.actor = member();
    const res = await m.call(req(m.url, m.method, "{not json"));
    expect(res.status).toBe(400);
    expect(svc[m.svc]).not.toHaveBeenCalled();
  });

  it("passes the ACTOR's organization and identity, the key and a correlation id — never a client value", async () => {
    h.actor = member("ADMIN");
    svc[m.svc].mockResolvedValue(OK({ jobId: "job-1" }));
    const res = await m.call(req(m.url, m.method, { organizationId: "org-EVIL", anything: 1 }));
    expect([200, 201]).toContain(res.status);
    const callArgs = svc[m.svc].mock.calls[0];
    const context = callArgs[callArgs.length - 1] as { organizationId: string; actor: { userId: string; role: string }; idempotencyKey: string; correlationId: string };
    expect(context.organizationId).toBe("org-A");
    expect(context.actor).toEqual({ userId: "u-1", role: "ADMIN" });
    expect(context.idempotencyKey).toBe("test-key-0001");
    expect(typeof context.correlationId).toBe("string");
    const body = await res.json();
    expect(body.correlationId).toBe(context.correlationId);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("refusal mapping — stable codes, generic messages, correlation id", () => {
  const cases: [string, number][] = [
    ["INVALID_INPUT", 400],
    ["REASON_REQUIRED", 400],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
    ["STALE", 409],
    ["INVALID_TRANSITION", 409],
    ["CONFLICT", 409],
    ["LINKED_COUNT_CHANGED", 409],
    ["IDEMPOTENCY_IN_PROGRESS", 409],
    ["IDEMPOTENCY_KEY_REUSED", 422],
    ["NOT_READY", 422],
    ["PROTECTED_TERM", 422],
    ["HIRING_OWNER_INVALID", 422],
    ["STORE_UNAVAILABLE", 503],
    ["WRITE_FAILED", 500],
  ];
  it.each(cases)("%s → %i", async (code, status) => {
    h.actor = member();
    svc.transitionPosition.mockResolvedValue({ ok: false, code, detail: code === "NOT_READY" ? { missing: ["SLA_MISSING"] } : undefined });
    const res = await (transition as Handler)(req("/api/ats/jobs/job-1/transition", "POST", { action: "PUBLISH", expectedVersion: 0 }), params());
    expect(res.status).toBe(status);
    const body = await res.json();
    expect(body.code).toBe(code);
    expect(typeof body.correlationId).toBe("string");
    expect(JSON.stringify(body)).not.toMatch(/stack|prisma|at \w+ \(/i);
    if (code === "NOT_READY") expect(body.missing).toEqual(["SLA_MISSING"]);
  });

  it("a replay answers 200 with Idempotent-Replayed, never a second 201", async () => {
    h.actor = member();
    svc.createPosition.mockResolvedValue({ ok: true, replayed: true, result: { jobId: "job-1" } });
    const res = await createJob(req("/api/ats/jobs", "POST", {}));
    expect(res.status).toBe(200);
    expect(res.headers.get("Idempotent-Replayed")).toBe("true");
    expect((await res.json()).replayed).toBe(true);
  });
});

describe("reads", () => {
  it("GET /jobs asks ATS_VIEW, lists the ACTOR's organization only and reports the viewer's capabilities", async () => {
    h.actor = member("RECRUITER");
    svc.listPositions.mockResolvedValue({ items: [], nextCursor: null });
    const res = await listJobs(req("/api/ats/jobs?status=paused", "GET"));
    expect(h.asked).toEqual(["ATS_VIEW"]);
    expect(res.status).toBe(200);
    expect(svc.listPositions.mock.calls[0].slice(0, 2)).toEqual(["org-A", "RECRUITER"]);
    expect(svc.listPositions.mock.calls[0][2]).toMatchObject({ status: "PAUSED" });
    expect((await res.json()).viewer).toEqual({ role: "RECRUITER", canManage: true, canAdmin: false });
  });

  it("GET /jobs refuses an unknown status filter", async () => {
    h.actor = member();
    expect((await listJobs(req("/api/ats/jobs?status=everything", "GET"))).status).toBe(400);
  });

  it("GET /jobs/[id] and /audit ask ATS_VIEW; another tenant's id is the same 404 as a missing one", async () => {
    h.actor = member();
    svc.getPositionDetail.mockResolvedValue("NOT_FOUND");
    svc.listPositionAudit.mockResolvedValue("NOT_FOUND");
    expect((await (getJob as Handler)(req("/api/ats/jobs/x", "GET"), params("x"))).status).toBe(404);
    expect((await (audit as Handler)(req("/api/ats/jobs/x/audit", "GET"), params("x"))).status).toBe(404);
    expect(h.asked).toEqual(["ATS_VIEW", "ATS_VIEW"]);
    expect(svc.getPositionDetail.mock.calls[0][0]).toBe("org-A");
  });

  it("the owners picker is ATS_MANAGE; settings are ATS_MANAGE; the initial catalogue is ATS_ADMIN", async () => {
    h.actor = { ok: false, status: 403 };
    expect((await owners(req("/api/ats/jobs/owners", "GET"))).status).toBe(403);
    expect((await getSettings(req("/api/ats/settings", "GET"))).status).toBe(403);
    expect((await initialCatalogue(req("/api/ats/jobs/initial-drafts", "GET"))).status).toBe(403);
    expect(h.asked).toEqual(["ATS_MANAGE", "ATS_MANAGE", "ATS_ADMIN"]);
  });

  it("a store outage is a 503, never an empty success", async () => {
    h.actor = member();
    svc.listPositions.mockResolvedValue(null);
    svc.getSettingsView.mockResolvedValue(null);
    expect((await listJobs(req("/api/ats/jobs", "GET"))).status).toBe(503);
    expect((await getSettings(req("/api/ats/settings", "GET"))).status).toBe(503);
  });
});
