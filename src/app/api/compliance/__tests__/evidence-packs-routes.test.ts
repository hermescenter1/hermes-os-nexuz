/**
 * Phase 97 — governed compliance evidence-pack ROUTE tests (mock service).
 *
 * The row-locked generation + snapshot + immutability are proven against real PostgreSQL
 * (evidence-pack-linearization.pg.test.ts). Here we prove the ROUTE boundary: server-derived
 * tenant scope + RBAC (real rbac.ts), strict schemas rejecting client-supplied attribution,
 * uniform NOT_FOUND, safe manifest headers, no forbidden data in responses, and after-commit
 * audit only on success.
 *
 * Invariants: CROSS_TENANT_EVIDENCE_PACK_READ=0, CLIENT_SUPPLIED_EVIDENCE_*=0,
 * UNAUTHORIZED_COMPLIANCE_UI_ACTION=0, LEGAL_CERTIFICATION_AUTOMATICALLY_CLAIMED=0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";

type Member = { userId: string; organizationId: string; role: string; status: string };
let payload: { sub: string; role: string; sid?: string } | null = null;
let members: Member[] = [];
const auditCalls: Array<Record<string, unknown>> = [];

// In-memory evidence-pack service state (keyed by org|id).
type Pack = Record<string, unknown> & { id: string; organizationId: string; lifecycle: string };
let packs: Pack[] = [];
let items: Array<Record<string, unknown>> = [];
let createResult: "OK" | "TARGET_NOT_FOUND" | "CONFLICT" = "OK";

const MOCKED = ["@/lib/auth/jwt", "@/lib/auth/session-store", "@/lib/db/prisma", "@/lib/audit/audit-service", "@/lib/logger/security-events", "@/lib/compliance/evidence-pack-db"];

beforeEach(() => {
  vi.resetModules();
  payload = { sub: "owner-A", role: "admin", sid: "s1" };
  members = [{ userId: "owner-A", organizationId: "org-A", role: "OWNER", status: "ACTIVE" }];
  packs = []; items = []; auditCalls.length = 0; createResult = "OK";

  vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => payload }));
  vi.doMock("@/lib/auth/session-store", () => ({ isPayloadSessionActive: async () => true }));
  vi.doMock("@/lib/db/prisma", () => ({
    getPrisma: async () => ({
      organizationMember: {
        findMany: async ({ where }: { where: { userId: string; status: string } }) =>
          members.filter((m) => m.userId === where.userId && m.status === where.status).map((m) => ({ organizationId: m.organizationId, role: m.role })),
      },
    }),
  }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async (e: Record<string, unknown>) => { auditCalls.push(e); },
    COMPLIANCE_AUDIT: { EVIDENCE_PACK_REQUESTED: "compliance.evidence_pack.requested", EVIDENCE_PACK_GENERATED: "compliance.evidence_pack.generated", EVIDENCE_PACK_REVOKED: "compliance.evidence_pack.revoked" },
  }));
  vi.doMock("@/lib/logger/security-events", () => ({ logAuthFailure: () => {}, logAuthzDenial: () => {}, logInfraFailure: () => {} }));

  vi.doMock("@/lib/compliance/evidence-pack-db", () => ({
    createEvidencePackForOrg: async ({ organizationId, scopeType, target, idempotencyKey }: { organizationId: string; scopeType: string; target: Record<string, string | null>; idempotencyKey: string }) => {
      if (createResult !== "OK") return { ok: false, reason: createResult };
      const existing = packs.find((p) => p.organizationId === organizationId && p.idempotencyKey === idempotencyKey);
      if (existing) return { ok: true, row: existing, created: false };
      const row: Pack = { id: `pk-${packs.length + 1}`, organizationId, lifecycle: "REQUESTED", readiness: "REVIEW_REQUIRED", scopeType, schemaVersion: "1.0", idempotencyKey, targetIncidentId: target.incidentId, targetProcessingActivityId: target.processingActivityId, targetPrivacyRequestId: target.privacyRequestId, itemCount: 0, manifestHash: null, manifestJson: null, snapshotAt: null, requestedAt: new Date(), generatedAt: null, generatedBy: null, revokedAt: null, expiresAt: null, failureCode: null, createdAt: new Date(), updatedAt: new Date() };
      packs.push(row);
      return { ok: true, row, created: true };
    },
    generateEvidencePackForOrg: async ({ id, organizationId, actorId }: { id: string; organizationId: string; actorId: string }) => {
      const row = packs.find((p) => p.id === id && p.organizationId === organizationId);
      if (!row) return { ok: false, reason: "NOT_FOUND" };
      if (row.lifecycle === "REQUESTED") {
        Object.assign(row, { lifecycle: "READY", readiness: "REVIEW_REQUIRED", manifestHash: "a".repeat(64), manifestJson: { schemaVersion: "1.0", organizationId, scopeType: row.scopeType, items: [{ sequence: 1, entityType: "COMPLIANCE_INCIDENT", evidenceCode: "COMPLIANCE_INCIDENT_RECORD", evidenceStatus: "COMPLETE", safeMetadata: { lifecycle: "CLOSED", summaryCode: "SEC_REVIEW" } }] }, itemCount: 1, snapshotAt: new Date(), generatedBy: actorId, generatedAt: new Date() });
        items.push({ evidencePackId: id, organizationId, sequence: 1, entityType: "COMPLIANCE_INCIDENT", evidenceCode: "COMPLIANCE_INCIDENT_RECORD", evidenceStatus: "COMPLETE", evidenceHash: "b".repeat(64), sourceVersion: "1", sourceUpdatedAt: new Date(), safeMetadata: { lifecycle: "CLOSED", summaryCode: "SEC_REVIEW" } });
      }
      return { ok: true, row };
    },
    listEvidencePacksForOrg: async (org: string) => packs.filter((p) => p.organizationId === org),
    countEvidencePacksForOrg: async (org: string) => packs.filter((p) => p.organizationId === org).length,
    getEvidencePackForOrg: async (id: string, org: string) => packs.find((p) => p.id === id && p.organizationId === org) ?? null,
    getEvidencePackItemsForOrg: async (id: string, org: string) => items.filter((i) => i.evidencePackId === id && i.organizationId === org),
    revokeEvidencePackForOrg: async ({ id, organizationId, actorId }: { id: string; organizationId: string; actorId: string }) => {
      const row = packs.find((p) => p.id === id && p.organizationId === organizationId);
      if (!row) return { ok: false, reason: "NOT_FOUND" };
      if (row.lifecycle !== "READY") return { ok: false, reason: "NOT_REVOCABLE" };
      Object.assign(row, { lifecycle: "REVOKED", revokedBy: actorId, revokedAt: new Date() });
      return { ok: true, row };
    },
  }));
});
afterEach(() => { for (const m of MOCKED) vi.doUnmock(m); vi.restoreAllMocks(); });

function mkReq(path: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/compliance${path}`, {
    method, headers: { cookie: `${ACCESS_TOKEN_COOKIE}=fake`, "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function listGET() { const { GET } = await import("../evidence-packs/route"); const res = await GET(mkReq("/evidence-packs", "GET")); return { res, json: await res.json() }; }
async function createPOST(body: unknown) { const { POST } = await import("../evidence-packs/route"); const res = await POST(mkReq("/evidence-packs", "POST", body)); return { res, json: await res.json() }; }
async function detailGET(id: string) { const { GET } = await import("../evidence-packs/[id]/route"); const res = await GET(mkReq(`/evidence-packs/${id}`, "GET"), { params: Promise.resolve({ id }) }); return { res, json: await res.json() }; }
async function manifestGET(id: string) { const { GET } = await import("../evidence-packs/[id]/manifest/route"); const res = await GET(mkReq(`/evidence-packs/${id}/manifest`, "GET"), { params: Promise.resolve({ id }) }); return { res, json: await res.json() }; }
async function revokePOST(id: string) { const { POST } = await import("../evidence-packs/[id]/revoke/route"); const res = await POST(mkReq(`/evidence-packs/${id}/revoke`, "POST"), { params: Promise.resolve({ id }) }); return { res, json: await res.json() }; }

function ownerA() { payload = { sub: "owner-A", role: "admin", sid: "s1" }; members = [{ userId: "owner-A", organizationId: "org-A", role: "OWNER", status: "ACTIVE" }]; }
function viewerA() { payload = { sub: "v", role: "customer", sid: "s1" }; members = [{ userId: "v", organizationId: "org-A", role: "VIEWER", status: "ACTIVE" }]; }
function managerA() { payload = { sub: "mgr", role: "admin", sid: "s1" }; members = [{ userId: "mgr", organizationId: "org-A", role: "MANAGER", status: "ACTIVE" }]; }

describe("evidence-pack RBAC", () => {
  it("a VIEWER cannot list, generate or revoke", async () => {
    viewerA();
    expect((await listGET()).res.status).toBe(403);
    expect((await createPOST({ scopeType: "ORGANIZATION" })).res.status).toBe(403);
    expect((await revokePOST("pk-1")).res.status).toBe(403);
  });
  it("a MANAGER may view but NOT generate or revoke (OWNER-only accountable acts)", async () => {
    managerA();
    expect((await listGET()).res.status).toBe(200);
    expect((await createPOST({ scopeType: "ORGANIZATION" })).res.status).toBe(403);
    expect((await revokePOST("pk-1")).res.status).toBe(403);
  });
  it("an OWNER may generate", async () => {
    ownerA();
    const { res, json } = await createPOST({ scopeType: "ORGANIZATION" });
    expect(res.status).toBe(201);
    expect(json.pack.lifecycle).toBe("READY");
  });
});

describe("strict input — client-supplied attribution is rejected", () => {
  it("rejects a client-supplied organizationId / lifecycle / hash / snapshot / itemCount", async () => {
    ownerA();
    for (const bad of [{ scopeType: "ORGANIZATION", organizationId: "org-B" }, { scopeType: "ORGANIZATION", lifecycle: "READY" }, { scopeType: "ORGANIZATION", manifestHash: "x" }, { scopeType: "ORGANIZATION", snapshotAt: "2020" }, { scopeType: "ORGANIZATION", itemCount: 9 }, { scopeType: "ORGANIZATION", requestedBy: "someone" }, { scopeType: "ORGANIZATION", readiness: "COMPLETE" }]) {
      const { res, json } = await createPOST(bad);
      expect(res.status).toBe(400);
      expect(json.code).toBe("INVALID_INPUT");
    }
  });
  it("rejects a scope/target mismatch (fail-closed INVALID_SCOPE)", async () => {
    ownerA();
    expect((await createPOST({ scopeType: "ORGANIZATION", incidentId: "i1" })).json.code).toBe("INVALID_SCOPE");
    expect((await createPOST({ scopeType: "INCIDENT" })).json.code).toBe("INVALID_SCOPE");
    expect((await createPOST({ scopeType: "INCIDENT", processingActivityId: "p1" })).json.code).toBe("INVALID_SCOPE");
  });
  it("rejects an unknown scope value", async () => {
    ownerA();
    expect((await createPOST({ scopeType: "EVERYTHING" })).res.status).toBe(400);
  });
});

describe("tenant isolation + uniform not-found", () => {
  it("a pack of another org is not readable (uniform 404)", async () => {
    ownerA();
    packs = [{ id: "pk-B", organizationId: "org-B", lifecycle: "READY", manifestJson: { x: 1 }, manifestHash: "c".repeat(64) } as Pack];
    expect((await detailGET("pk-B")).res.status).toBe(404);
    expect((await manifestGET("pk-B")).res.status).toBe(404);
    expect((await revokePOST("pk-B")).res.status).toBe(404);
    expect(packs[0].lifecycle).toBe("READY"); // untouched
  });
  it("an unknown id is uniform 404", async () => {
    ownerA();
    expect((await detailGET("nope")).res.status).toBe(404);
    expect((await manifestGET("nope")).res.status).toBe(404);
  });
});

describe("manifest response — safe headers + no forbidden data + no legal claim", () => {
  it("serves the canonical manifest with private/no-store/nosniff headers and no forbidden fields", async () => {
    ownerA();
    await createPOST({ scopeType: "ORGANIZATION" }); // creates + generates pk-1
    const { res, json } = await manifestGET("pk-1");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(json.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    const blob = JSON.stringify(json);
    for (const bad of ["sensitiveSummary", "email", "ipAddress", "userAgent", "\"content\"", "\"description\"", "planJson", "tokenHash", "packageKey", "secret", "certified", "compliant"]) {
      expect(blob.toLowerCase().includes(bad.toLowerCase())).toBe(false);
    }
  });
});

describe("generation + revocation lifecycle + audit", () => {
  it("generates then revokes; a revoked pack remains readable and cannot be re-revoked", async () => {
    ownerA();
    await createPOST({ scopeType: "ORGANIZATION" });
    const rev = await revokePOST("pk-1");
    expect(rev.res.status).toBe(200);
    expect(rev.json.pack.lifecycle).toBe("REVOKED");
    // still readable
    const d = await detailGET("pk-1");
    expect(d.res.status).toBe(200);
    expect(d.json.pack.lifecycle).toBe("REVOKED");
    // manifest still served, marked revoked
    const m = await manifestGET("pk-1");
    expect(m.json.revoked).toBe(true);
    // cannot re-revoke
    expect((await revokePOST("pk-1")).res.status).toBe(409);
    // audit: requested + generated + revoked, no personal data
    const actions = auditCalls.map((a) => a.action);
    expect(actions).toContain("compliance.evidence_pack.requested");
    expect(actions).toContain("compliance.evidence_pack.generated");
    expect(actions).toContain("compliance.evidence_pack.revoked");
    expect(JSON.stringify(auditCalls)).not.toContain("sensitiveSummary");
  });
  it("a failed target create returns 404 without generating", async () => {
    ownerA(); createResult = "TARGET_NOT_FOUND";
    const { res, json } = await createPOST({ scopeType: "INCIDENT", incidentId: "ghost" });
    expect(res.status).toBe(404);
    expect(json.code).toBe("TARGET_NOT_FOUND");
    expect(auditCalls).toHaveLength(0);
  });
});
