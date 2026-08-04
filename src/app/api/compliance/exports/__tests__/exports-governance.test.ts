/**
 * SECURITY (Phase 97 Part G) — governed export routes over a synthetic Prisma.
 *
 * Invariants: CROSS_TENANT_EXPORT_READ/MUTATION=0, DUPLICATE_ACTIVE_EXPORT_JOB=0,
 * EXPORT_EXECUTION default disabled, PLAINTEXT_EXPORT_TOKEN_AT_REST=0,
 * EXPORT_TOKEN_REPLAY=0, CROSS_SUBJECT/TENANT_EXPORT_DOWNLOAD=0,
 * EXPORT_EXPIRY_POLICY=CONFIGURATION_REQUIRED gating, RAW_EXPORT_CONTENT_IN_AUDIT=0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";

type Row = Record<string, unknown> & { id: string };
type Member = { userId: string; organizationId: string; role: string; status: string };
const ACTIVE = ["REQUESTED", "AUTHORISED", "COLLECTING", "REDACTING", "PACKAGING", "READY"];

let payload: { sub: string; role: string; sid?: string } | null = null;
let members: Member[] = [];
let jobs: Row[] = [];
let tokens: Row[] = [];
let privacy: Row[] = [];
const auditCalls: Array<Record<string, unknown>> = [];
const storageStore: Record<string, Buffer> = {};

function match(where: Record<string, unknown>, r: Row): boolean {
  for (const [k, v] of Object.entries(where)) {
    const cell = r[k];
    if (v === null) { if (cell != null) return false; continue; }
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("in" in (v as object)) { if (!(v as { in: unknown[] }).in.includes(cell)) return false; continue; }
      if ("gt" in (v as object)) { if (cell == null || new Date(cell as string).getTime() <= new Date((v as { gt: Date }).gt).getTime()) return false; continue; }
      if ("not" in (v as object)) { if (cell === (v as { not: unknown }).not) return false; continue; }
      return false;
    }
    if (cell !== v) return false;
  }
  return true;
}
function coll(store: () => Row[], opts?: { uniqueActiveParent?: boolean }) {
  return {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => store().find((r) => match(where, r)) ?? null,
    findMany: async ({ where = {}, take }: { where?: Record<string, unknown>; take?: number }) => { const rows = store().filter((r) => match(where, r)); return typeof take === "number" ? rows.slice(0, take) : rows; },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (opts?.uniqueActiveParent && data.privacyRequestId && store().some((j) => j.privacyRequestId === data.privacyRequestId && ACTIVE.includes(j.lifecycle as string))) throw { code: "P2002" };
      if (data.tokenHash && store().some((t) => t.tokenHash === data.tokenHash)) throw { code: "P2002" };
      const row = { ...data } as Row; store().push(row); return row;
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const m = store().filter((r) => match(where, r)); m.forEach((r) => Object.assign(r, data)); return { count: m.length };
    },
  };
}
function makeDb() {
  return {
    organizationMember: { findMany: async ({ where }: { where: { userId: string; status: string } }) => members.filter((m) => m.userId === where.userId && m.status === where.status).map((m) => ({ organizationId: m.organizationId, role: m.role })) },
    privacyRequest: coll(() => privacy),
    dataExportRequest: coll(() => jobs, { uniqueActiveParent: true }),
    exportDownloadToken: coll(() => tokens),
  };
}

const MOCKED = ["@/lib/auth/jwt", "@/lib/auth/session-store", "@/lib/db/prisma", "@/lib/audit/audit-service", "@/lib/logger/security-events", "@/lib/documents/object-storage"];
beforeEach(() => {
  vi.resetModules();
  payload = null; members = []; jobs = []; tokens = []; privacy = []; auditCalls.length = 0;
  for (const k of Object.keys(storageStore)) delete storageStore[k];
  vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => payload }));
  vi.doMock("@/lib/auth/session-store", () => ({ isPayloadSessionActive: async () => true }));
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => makeDb() }));
  vi.doMock("@/lib/documents/object-storage", () => ({ getDocumentObjectStorage: () => ({ provider: "local", put: async ({ key, body }: { key: string; body: string }) => { storageStore[key] = Buffer.from(body); return { key, sizeBytes: body.length }; }, get: async (key: string) => storageStore[key] ?? null, delete: async () => {}, exists: async () => false }) }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async (e: Record<string, unknown>) => { auditCalls.push(e); },
    COMPLIANCE_AUDIT: { EXPORT_JOB_CREATED: "compliance.export.job_created", EXPORT_JOB_TRANSITIONED: "compliance.export.job_transitioned", EXPORT_TOKEN_ISSUED: "compliance.export.token_issued", EXPORT_DOWNLOADED: "compliance.export.downloaded", EXPORT_TOKEN_REPLAY_DENIED: "compliance.export.token_replay_denied", EXPORT_REVOKED: "compliance.export.revoked" },
  }));
  vi.doMock("@/lib/logger/security-events", () => ({ logAuthFailure: () => {}, logAuthzDenial: () => {}, logInfraFailure: () => {} }));
});
afterEach(() => { for (const m of MOCKED) vi.doUnmock(m); vi.restoreAllMocks(); });

function req(path: string, method: string, body?: unknown, withToken = true) {
  return new NextRequest(`http://localhost/api/compliance/exports${path}`, { method, headers: { ...(withToken ? { cookie: `${ACCESS_TOKEN_COOKIE}=fake` } : {}), "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
async function listGET(withToken = true) { const { GET } = await import("../route"); const r = await GET(req("", "GET", undefined, withToken)); return { res: r, json: await r.json() }; }
async function createPOST(body: unknown) { const { POST } = await import("../route"); const r = await POST(req("", "POST", body)); return { res: r, json: await r.json() }; }
async function getJob(id: string) { const { GET } = await import("../[id]/route"); const r = await GET(req(`/${id}`, "GET"), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
async function patchJob(id: string, body: unknown) { const { PATCH } = await import("../[id]/route"); const r = await PATCH(req(`/${id}`, "PATCH", body), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
async function issueToken(id: string) { const { POST } = await import("../[id]/token/route"); const r = await POST(req(`/${id}/token`, "POST"), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
async function download(id: string, token: string) { const { POST } = await import("../[id]/download/route"); const r = await POST(req(`/${id}/download`, "POST", { token }), { params: Promise.resolve({ id }) }); return { res: r, json: r.headers.get("content-type")?.includes("json") && r.status !== 200 ? await r.json() : null, raw: r }; }

function ownerA() { payload = { sub: "owner-A", role: "customer", sid: "s" }; members = [{ userId: "owner-A", organizationId: "org-A", role: "OWNER", status: "ACTIVE" }]; }
function adminA() { payload = { sub: "admin-A", role: "admin", sid: "s" }; members = [{ userId: "admin-A", organizationId: "org-A", role: "ADMIN", status: "ACTIVE" }]; }
function parent(over: Partial<Row> = {}): Row { return { id: "pr1", organizationId: "org-A", userId: "subj-1", candidateId: null, email: "s@x.com", locale: "en", requestType: "DATA_EXPORT", status: "APPROVED", identityVerifiedAt: new Date(), ...over } as Row; }
function job(over: Partial<Row> = {}): Row { return { id: "e1", privacyRequestId: "pr1", organizationId: "org-A", userId: "subj-1", candidateId: null, email: "s@x.com", locale: "en", subjectClass: "USER", status: "PENDING", lifecycle: "REQUESTED", packageKey: null, contentHash: null, expiresAt: null, revokedAt: null, createdAt: new Date(), updatedAt: new Date(), ...over } as Row; }

describe("auth + tenant isolation", () => {
  it("unauthenticated list is denied (401)", async () => { expect((await listGET(false)).res.status).toBe(401); });
  it("tenant A cannot read or mutate tenant B's job (404)", async () => {
    adminA(); jobs = [job({ id: "eB", organizationId: "org-B" })];
    expect((await getJob("eB")).res.status).toBe(404);
    expect((await patchJob("eB", { transition: "CANCELLED" })).res.status).toBe(404);
    expect(jobs[0].lifecycle).toBe("REQUESTED");
  });
});

describe("create from an approved parent (authoritative scope)", () => {
  it("rejects a foreign / unapproved / incompatible / unverified parent", async () => {
    adminA();
    expect((await createPOST({ privacyRequestId: "nope" })).res.status).toBe(404);
    privacy = [parent({ status: "IN_REVIEW" })];
    expect((await createPOST({ privacyRequestId: "pr1" })).json.code).toBe("PARENT_NOT_APPROVED");
    privacy = [parent({ requestType: "OBJECTION" })];
    expect((await createPOST({ privacyRequestId: "pr1" })).json.code).toBe("PARENT_TYPE_INCOMPATIBLE");
    privacy = [parent({ identityVerifiedAt: null })];
    expect((await createPOST({ privacyRequestId: "pr1" })).json.code).toBe("IDENTITY_NOT_VERIFIED");
  });
  it("creates a REQUESTED child whose subject/org come from the parent (not the client)", async () => {
    adminA(); privacy = [parent()];
    const r = await createPOST({ privacyRequestId: "pr1", userId: "EVIL", organizationId: "org-EVIL" });
    expect(r.res.status).toBe(201);
    expect(jobs[0].userId).toBe("subj-1");
    expect(jobs[0].organizationId).toBe("org-A");
    expect(jobs[0].lifecycle).toBe("REQUESTED");
  });
  it("a duplicate active job for the same parent is idempotent (DUPLICATE_ACTIVE_EXPORT_JOB=0)", async () => {
    adminA(); privacy = [parent()];
    await createPOST({ privacyRequestId: "pr1" });
    const again = await createPOST({ privacyRequestId: "pr1" });
    expect(again.json.idempotent).toBe(true);
    expect(jobs.filter((j) => ACTIVE.includes(j.lifecycle as string))).toHaveLength(1);
  });
});

describe("transitions + approval separation + disabled execution", () => {
  it("authorise needs approve_exports (ADMIN denied, OWNER allowed)", async () => {
    adminA(); jobs = [job({ lifecycle: "REQUESTED" })];
    expect((await patchJob("e1", { transition: "AUTHORISED" })).res.status).toBe(403);
    ownerA();
    expect((await patchJob("e1", { transition: "AUTHORISED" })).res.status).toBe(200);
    expect(jobs[0].lifecycle).toBe("AUTHORISED");
    expect(jobs[0].approvedBy).toBe("owner-A");
  });
  it("execution is disabled by default and never marks READY", async () => {
    adminA(); jobs = [job({ lifecycle: "AUTHORISED" })];
    const r = await patchJob("e1", { execute: true });
    expect(r.res.status).toBe(409);
    expect(r.json.code).toBe("EXPORT_EXECUTION_DISABLED");
    expect(jobs[0].lifecycle).toBe("AUTHORISED");
  });
  it("rejects an invalid transition", async () => {
    ownerA(); jobs = [job({ lifecycle: "REQUESTED" })];
    expect((await patchJob("e1", { transition: "READY" })).json.code).toBe("INVALID_TRANSITION");
  });
});

describe("token issuance + gating", () => {
  it("blocks token issuance without an expiry policy (EXPORT_EXPIRY_POLICY)", async () => {
    adminA(); jobs = [job({ lifecycle: "READY", packageKey: "exports/e1/package.json", expiresAt: null })];
    const r = await issueToken("e1");
    expect(r.res.status).toBe(409);
    expect(r.json.code).toBe("EXPORT_EXPIRY_POLICY");
  });
  it("blocks token issuance when not READY", async () => {
    adminA(); jobs = [job({ lifecycle: "AUTHORISED" })];
    expect((await issueToken("e1")).json.code).toBe("NOT_READY");
  });
  it("issues a plaintext token once; only its hash is stored (PLAINTEXT_EXPORT_TOKEN_AT_REST=0)", async () => {
    adminA(); jobs = [job({ lifecycle: "READY", packageKey: "exports/e1/package.json", expiresAt: new Date(Date.now() + 3600_000) })];
    const r = await issueToken("e1");
    expect(r.res.status).toBe(201);
    expect(typeof r.json.token).toBe("string");
    expect(tokens[0].tokenHash).not.toBe(r.json.token);          // stored value is the hash
    expect(JSON.stringify(tokens[0])).not.toContain(r.json.token); // plaintext never persisted
    expect(JSON.stringify(auditCalls)).not.toContain(r.json.token);// nor logged
  });
});

describe("download redemption (single-use, subject/tenant bound)", () => {
  async function ready() { jobs = [job({ lifecycle: "READY", packageKey: "exports/e1/package.json", contentHash: "h", expiresAt: new Date(Date.now() + 3600_000) })]; storageStore["exports/e1/package.json"] = Buffer.from(JSON.stringify({ manifest: { contentHash: "h" } })); }
  it("redeems a valid token once, then a replay is a uniform 404", async () => {
    adminA(); await ready();
    const t = (await issueToken("e1")).json.token as string;
    payload = { sub: "subj-1", role: "customer", sid: "s" }; // the subject
    const ok = await download("e1", t);
    expect(ok.raw.status).toBe(200);
    const replay = await download("e1", t);
    expect(replay.raw.status).toBe(404);
    expect(auditCalls.some((e) => e.action === "compliance.export.token_replay_denied")).toBe(true);
  });
  it("a foreign subject cannot redeem the token (404)", async () => {
    adminA(); await ready();
    const t = (await issueToken("e1")).json.token as string;
    payload = { sub: "OTHER-SUBJECT", role: "customer", sid: "s" };
    expect((await download("e1", t)).raw.status).toBe(404);
    expect(tokens[0].usedAt ?? null).toBeNull(); // not consumed
  });
  it("an expired export cannot be downloaded (404)", async () => {
    adminA(); jobs = [job({ lifecycle: "READY", packageKey: "exports/e1/package.json", expiresAt: new Date(Date.now() - 1000) })];
    storageStore["exports/e1/package.json"] = Buffer.from("{}");
    tokens = [{ id: "t1", exportRequestId: "e1", tokenHash: "x", subjectUserId: "subj-1", organizationId: "org-A", expiresAt: new Date(Date.now() - 1000), usedAt: null, revokedAt: null }];
    payload = { sub: "subj-1", role: "customer", sid: "s" };
    expect((await download("e1", "someplaintexttoken")).raw.status).toBe(404);
  });
});

describe("revocation invalidates tokens", () => {
  it("revoking a READY export revokes its outstanding tokens", async () => {
    adminA(); jobs = [job({ lifecycle: "READY", packageKey: "k", expiresAt: new Date(Date.now() + 3600_000) })];
    const t = (await issueToken("e1")).json.token as string; void t;
    const r = await patchJob("e1", { transition: "REVOKED" });
    expect(r.res.status).toBe(200);
    expect(jobs[0].lifecycle).toBe("REVOKED");
    expect(tokens[0].revokedAt).toBeTruthy();
    expect(auditCalls.some((e) => e.action === "compliance.export.revoked")).toBe(true);
  });
});

describe("audit hygiene (RAW_EXPORT_CONTENT_IN_AUDIT=0)", () => {
  it("never places email/token/package content in audit metadata", async () => {
    adminA(); privacy = [parent({ email: "SECRET-EMAIL@x.com" })];
    await createPOST({ privacyRequestId: "pr1" });
    expect(JSON.stringify(auditCalls)).not.toContain("SECRET-EMAIL");
  });
});
