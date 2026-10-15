// @vitest-environment node
/**
 * ATS go-live — POST /api/ats/candidates/[id]/erase.
 *
 * The route is a thin adapter over `eraseCandidate` (tested in full in
 * src/lib/ats/__tests__/ats-candidate-erasure.test.ts). Here: the ATS_ADMIN
 * gate runs first, the exact confirmation phrase and a reason are required,
 * and each service code maps to the right status.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  actor: { ok: true, ctx: { userId: "u-1", orgId: "org-A", role: "ADMIN" } } as unknown,
  result: { ok: true, code: "ERASED", applicationsAnonymised: 1 } as unknown,
  eraseArgs: null as unknown,
}));

vi.mock("@/lib/ats/rbac", () => ({ requireAtsActor: async () => h.actor }));
vi.mock("@/lib/ats/candidate-erasure", () => ({
  eraseCandidate: async (a: unknown) => { h.eraseArgs = a; return h.result; },
}));
// Make the write preconditions pass without real Origin/idempotency plumbing;
// keep the real readJsonBody and refusal.
vi.mock("@/lib/ats/positions/http", async (orig) => ({
  ...(await (orig as () => Promise<Record<string, unknown>>)()),
  mutationPreconditions: () => ({ ok: true, idempotencyKey: "idem-key-0000000000000000", correlationId: "corr-1" }),
}));

import { POST } from "../[id]/erase/route";

function req(body: unknown): import("next/server").NextRequest {
  return new Request("http://localhost/api/ats/candidates/cand-1/erase", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}
const params = Promise.resolve({ id: "cand-1" });
const VALID = { reason: "GDPR erasure request #42", confirmation: "ERASE CANDIDATE" };

beforeEach(() => {
  h.actor = { ok: true, ctx: { userId: "u-1", orgId: "org-A", role: "ADMIN" } };
  h.result = { ok: true, code: "ERASED", applicationsAnonymised: 1 };
  h.eraseArgs = null;
});

describe("the ATS_ADMIN gate and the confirmation contract", () => {
  it("passes the actor refusal straight through (no body is read)", async () => {
    h.actor = { ok: false, response: NextResponse.json({ code: "FORBIDDEN" }, { status: 403 }) };
    const res = await POST(req(VALID), { params });
    expect(res.status).toBe(403);
    expect(h.eraseArgs).toBeNull();
  });

  it("refuses 400 without the exact confirmation phrase", async () => {
    for (const bad of [{ reason: "x".repeat(10) }, { reason: "x".repeat(10), confirmation: "erase candidate" }, { reason: "x".repeat(10), confirmation: "DELETE" }]) {
      const res = await POST(req(bad), { params });
      expect(res.status).toBe(400);
    }
    expect(h.eraseArgs).toBeNull();
  });

  it("refuses 400 without a reason", async () => {
    const res = await POST(req({ confirmation: "ERASE CANDIDATE" }), { params });
    expect(res.status).toBe(400);
    expect(h.eraseArgs).toBeNull();
  });

  it("on a valid request, calls eraseCandidate with the actor's org and user, and the typed reason", async () => {
    const res = await POST(req(VALID), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ erased: true, code: "ERASED", applicationsAnonymised: 1 });
    expect(h.eraseArgs).toMatchObject({ organizationId: "org-A", candidateId: "cand-1", actorUserId: "u-1", reason: VALID.reason });
    // the operator never passes a status, tenant or confirmation to the service
    expect(JSON.stringify(h.eraseArgs)).not.toMatch(/confirmation|ERASE CANDIDATE/);
  });
});

describe("service codes map to statuses, bodies carry no other tenant's data", () => {
  it.each([
    ["ALREADY_ERASED", true, 200],
    ["NOT_FOUND", false, 404],
    ["CROSS_ORG", false, 409],
    ["LEGAL_HOLD", false, 409],
    ["MEMBERSHIP_LOST", false, 403],
    ["STORE_UNAVAILABLE", false, 503],
  ] as const)("%s → %s", async (code, ok, status) => {
    h.result = { ok, code, applicationsAnonymised: 0 };
    const res = await POST(req(VALID), { params });
    expect(res.status).toBe(status);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = JSON.stringify(await res.json());
    expect(body).not.toMatch(/organizationId|another|org-[B-Z]/);
  });
});
