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
import { buildExportPackage, computeExportPackageHash } from "@/lib/compliance/export-package";
import { EXPORT_SOURCES } from "@/lib/compliance/export-sources";

const UP = EXPORT_SOURCES.find((s) => s.name === "user_profile")!;
const SHA = "a".repeat(64); // a well-formed synthetic SHA-256 hex for issuance-shape fixtures

/** Build a valid, registry-consistent, correctly-bound package (matching the job)
 *  with an expiry that equals the job's expiresAt (the strict parser requires it). */
function validPackageFor(jobId: string, privacyRequestId: string | null, org: string | null, expiresAt: Date) {
  const pkg = buildExportPackage(
    [{ name: UP.name, schemaVersion: UP.schemaVersion, scope: UP.scope, includedFields: UP.includedFields, excludedFields: UP.excludedFields, redactionRules: UP.redactionRules, records: [{ id: "subj-1", name: "N", email: "s@x.com", emailVerified: true, createdAt: "2026-01-01T00:00:00.000Z" }] }],
    { exportRequestId: jobId, privacyRequestId, subjectClass: "USER", organizationScope: org, locale: "en", generatedAt: new Date("2026-01-01"), expiry: { status: "CONFIGURED", expiresAt } },
  );
  return { bytes: Buffer.from(JSON.stringify(pkg)), contentHash: pkg.contentHash, packageHash: computeExportPackageHash(pkg) };
}

type Row = Record<string, unknown> & { id: string };
type Member = { userId: string; organizationId: string; role: string; status: string };
const ACTIVE = ["REQUESTED", "AUTHORISED", "COLLECTING", "REDACTING", "PACKAGING", "READY"];

let payload: { sub: string; role: string; sid?: string } | null = null;
let members: Member[] = [];
let jobs: Row[] = [];
let tokens: Row[] = [];
let privacy: Row[] = [];
let failTokenRevoke = false;                       // simulate a token-revocation write failure
let txChain: Promise<unknown> = Promise.resolve();  // serialize $transaction (models job row-lock)
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
function coll(store: () => Row[], opts?: { uniqueActiveParent?: boolean; tokenModel?: boolean }) {
  return {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => store().find((r) => match(where, r)) ?? null,
    findMany: async ({ where = {}, take }: { where?: Record<string, unknown>; take?: number }) => { const rows = store().filter((r) => match(where, r)); return typeof take === "number" ? rows.slice(0, take) : rows; },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (opts?.uniqueActiveParent && data.privacyRequestId && store().some((j) => j.privacyRequestId === data.privacyRequestId && ACTIVE.includes(j.lifecycle as string))) throw { code: "P2002" };
      if (data.tokenHash && store().some((t) => t.tokenHash === data.tokenHash)) throw { code: "P2002" };
      const row = { ...data } as Row; store().push(row); return row;
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      // Simulate a failed token-revocation write (rolls the surrounding txn back).
      if (opts?.tokenModel && failTokenRevoke && data.revokedAt) throw new Error("SIMULATED_TOKEN_REVOKE_FAILURE");
      const m = store().filter((r) => match(where, r)); m.forEach((r) => Object.assign(r, data)); return { count: m.length };
    },
  };
}
function makeDb() {
  const db: Record<string, unknown> = {
    organizationMember: { findMany: async ({ where }: { where: { userId: string; status: string } }) => members.filter((m) => m.userId === where.userId && m.status === where.status).map((m) => ({ organizationId: m.organizationId, role: m.role })) },
    privacyRequest: coll(() => privacy),
    dataExportRequest: coll(() => jobs, { uniqueActiveParent: true }),
    exportDownloadToken: coll(() => tokens, { tokenModel: true }),
  };
  // Models the real `SELECT "id" ... FOR UPDATE` job-row lock: returns the row id
  // (or []) so the production lock helper can proceed. Serialization/consistency in
  // this single-process mock is provided by the $transaction mutex below; the REAL
  // cross-connection FOR UPDATE blocking is proven by the PG linearization tests.
  db.$queryRawUnsafe = async (sql: string, ...vals: unknown[]) => {
    if (/FOR UPDATE/i.test(sql) && /"DataExportRequest"/i.test(sql)) {
      const [id, org] = vals as [string, string];
      const row = jobs.find((j) => j.id === id && j.organizationId === org);
      return row ? [{ id: row.id }] : [];
    }
    return [];
  };
  // A faithful-enough $transaction: serialized (the shared job row-lock in the real
  // DB serializes issuance/redemption/revocation) with snapshot-restore rollback on
  // throw, so a failed token revocation rolls the whole revocation back.
  db.$transaction = (fn: (tx: unknown) => Promise<unknown>) => {
    const run = txChain.then(async () => {
      const jSnap = jobs.map((j) => ({ ...j }));
      const tSnap = tokens.map((t) => ({ ...t }));
      try { return await fn(db); }
      catch (e) { jobs.splice(0, jobs.length, ...jSnap); tokens.splice(0, tokens.length, ...tSnap); throw e; }
    });
    txChain = run.then(() => undefined, () => undefined);
    return run;
  };
  return db;
}

const MOCKED = ["@/lib/auth/jwt", "@/lib/auth/session-store", "@/lib/db/prisma", "@/lib/audit/audit-service", "@/lib/logger/security-events", "@/lib/documents/object-storage"];
beforeEach(() => {
  vi.resetModules();
  payload = null; members = []; jobs = []; tokens = []; privacy = []; auditCalls.length = 0;
  failTokenRevoke = false; txChain = Promise.resolve();
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
function job(over: Partial<Row> = {}): Row { return { id: "e1", privacyRequestId: "pr1", organizationId: "org-A", userId: "subj-1", candidateId: null, email: "s@x.com", locale: "en", subjectClass: "USER", status: "PENDING", lifecycle: "REQUESTED", packageKey: null, contentHash: null, packageHash: null, schemaVersion: null, completedAt: null, expiresAt: null, revokedAt: null, createdAt: new Date(), updatedAt: new Date(), ...over } as Row; }
/** A structurally COMPLETE READY job (durable package evidence present). */
function readyJob(over: Partial<Row> = {}): Row { return job({ lifecycle: "READY", packageKey: "exports/e1/package.json", contentHash: SHA, packageHash: SHA, schemaVersion: "1.0", completedAt: new Date(), expiresAt: new Date(Date.now() + 3600_000), ...over }); }

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

describe("Part G hardening — parent eligibility (Findings 4 & 5)", () => {
  it("rejects a Candidate parent before creating any job (Finding 5)", async () => {
    adminA(); privacy = [parent({ userId: null, candidateId: "cand-1" })];
    const r = await createPOST({ privacyRequestId: "pr1" });
    expect(r.json.code).toBe("EXPORT_SUBJECT_CLASS_UNSUPPORTED");
    expect(jobs).toHaveLength(0);
  });
  it("PARTIALLY_APPROVED cannot create a full export (Finding 4)", async () => {
    adminA(); privacy = [parent({ status: "PARTIALLY_APPROVED" })];
    const r = await createPOST({ privacyRequestId: "pr1" });
    expect(r.json.code).toBe("PARENT_SCOPE_CONFIGURATION_REQUIRED");
    expect(jobs).toHaveLength(0);
  });
  it("FULFILMENT_IN_PROGRESS with an existing active job returns it idempotently", async () => {
    adminA(); privacy = [parent({ status: "FULFILMENT_IN_PROGRESS" })];
    jobs = [job({ id: "existing", privacyRequestId: "pr1", lifecycle: "AUTHORISED", organizationId: "org-A", userId: "subj-1" })];
    const r = await createPOST({ privacyRequestId: "pr1" });
    expect(r.json.idempotent).toBe(true);
    expect(r.json.export.id).toBe("existing");
    expect(jobs).toHaveLength(1);
  });
  it("FULFILMENT_IN_PROGRESS WITHOUT an active job cannot create one", async () => {
    adminA(); privacy = [parent({ status: "FULFILMENT_IN_PROGRESS" })];
    const r = await createPOST({ privacyRequestId: "pr1" });
    expect(r.json.code).toBe("PARENT_NOT_APPROVED");
    expect(jobs).toHaveLength(0);
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

describe("token issuance + gating (transactional, completeness-checked)", () => {
  it("blocks token issuance without an expiry policy (EXPORT_EXPIRY_POLICY)", async () => {
    adminA(); jobs = [readyJob({ expiresAt: null })];
    const r = await issueToken("e1");
    expect(r.res.status).toBe(409);
    expect(r.json.code).toBe("EXPORT_EXPIRY_POLICY");
    expect(tokens).toHaveLength(0);
  });
  it("blocks token issuance when not READY", async () => {
    adminA(); jobs = [job({ lifecycle: "AUTHORISED" })];
    expect((await issueToken("e1")).json.code).toBe("NOT_READY");
  });
  it("denies token issuance for a structurally incomplete READY job (TOKEN_ISSUED_FOR_INCOMPLETE_EXPORT=0)", async () => {
    adminA(); jobs = [readyJob({ contentHash: null })]; // missing durable content hash
    const r = await issueToken("e1");
    expect(r.res.status).toBe(409);
    expect(r.json.code).toBe("EXPORT_INCOMPLETE");
    expect(tokens).toHaveLength(0);
  });
  it("denies token issuance for a READY job with an unsupported schema version", async () => {
    adminA(); jobs = [readyJob({ schemaVersion: "9.9" })];
    expect((await issueToken("e1")).json.code).toBe("EXPORT_INCOMPLETE");
    expect(tokens).toHaveLength(0);
  });
  it("issues a plaintext token once; only its hash is stored (PLAINTEXT_EXPORT_TOKEN_AT_REST=0)", async () => {
    adminA(); jobs = [readyJob()];
    const r = await issueToken("e1");
    expect(r.res.status).toBe(201);
    expect(typeof r.json.token).toBe("string");
    expect(tokens[0].tokenHash).not.toBe(r.json.token);          // stored value is the hash
    expect(tokens[0].subjectUserId).toBe("subj-1");              // bound subject
    expect(tokens[0].organizationId).toBe("org-A");              // bound org
    expect(JSON.stringify(tokens[0])).not.toContain(r.json.token); // plaintext never persisted
    expect(JSON.stringify(auditCalls)).not.toContain(r.json.token);// nor logged
  });
  it("token issuance racing revocation never leaves a live post-revocation token (TOKEN_ISSUED_AFTER_REVOCATION=0)", async () => {
    adminA(); jobs = [readyJob()];
    // Instantiate the two route module graphs SEQUENTIALLY before racing their
    // handlers.
    //
    // `issueToken` and `patchJob` each `await import(...)` internally, so the
    // Promise.all below would otherwise begin two dynamic imports at the same
    // moment. Instantiating two graphs concurrently while `vi.doMock` is in
    // force is not reliable: under worker contention the auth mock can fail to
    // apply, the REAL verifyAccessToken then rejects the fixture cookie, and
    // BOTH requests answer 401 — so neither mutation runs and the job is still
    // READY. That failure says nothing about this invariant (it was observed
    // with `tokens=[]`, i.e. TOKEN_ISSUED_AFTER_REVOCATION=0 still held), and
    // it is why the identical suite and commit passed in the `CI` workflow
    // while failing in the Phase 98 workflow.
    //
    // Importing them one at a time removes ONLY that module-loading race. The
    // race this test exists for is untouched, and is now isolated: both
    // handlers still execute concurrently below, still hit the mocked row
    // lock, and still contend through the shared $transaction mutex.
    await import("../[id]/token/route");
    await import("../[id]/route");
    const [, ] = await Promise.all([issueToken("e1"), patchJob("e1", { transition: "REVOKED" })]);
    expect(jobs[0].lifecycle).toBe("REVOKED");
    expect(tokens.filter((t) => (t.revokedAt ?? null) === null && (t.usedAt ?? null) === null)).toHaveLength(0);
  });
  it("a committed revocation before issuance denies the token", async () => {
    adminA(); jobs = [readyJob()];
    await patchJob("e1", { transition: "REVOKED" });
    const r = await issueToken("e1");
    expect(r.res.status).toBe(409); // job no longer READY
    expect(tokens.filter((t) => (t.revokedAt ?? null) === null && (t.usedAt ?? null) === null)).toHaveLength(0);
  });
});

describe("download redemption — two-gate, integrity-verified, single-use", () => {
  const KEY = "exports/e1/package.json";
  async function ready(overPkg?: Buffer, expiresAt = new Date(Date.now() + 3600_000)) {
    const vp = validPackageFor("e1", "pr1", "org-A", expiresAt);
    jobs = [readyJob({ contentHash: vp.contentHash, packageHash: vp.packageHash, expiresAt })];
    storageStore[KEY] = overPkg ?? vp.bytes;
    return { vp, expiresAt };
  }
  async function issueAndSubject() { adminA(); const t = (await issueToken("e1")).json.token as string; payload = { sub: "subj-1", role: "customer", sid: "s" }; return t; }

  it("redeems a valid, integrity-verified token once, then a replay is a uniform 404", async () => {
    await ready(); const t = await issueAndSubject();
    expect((await download("e1", t)).raw.status).toBe(200);
    expect((await download("e1", t)).raw.status).toBe(404);
    expect(auditCalls.some((e) => e.action === "compliance.export.token_replay_denied")).toBe(true);
  });
  it("a foreign subject cannot redeem (404) and does not consume the token", async () => {
    await ready(); const t = (adminA(), (await issueToken("e1")).json.token as string);
    payload = { sub: "OTHER", role: "customer", sid: "s" };
    expect((await download("e1", t)).raw.status).toBe(404);
    expect(tokens[0].usedAt ?? null).toBeNull();
  });
  it("a missing storage object does NOT consume the token; a retry after recovery succeeds", async () => {
    const { expiresAt } = await ready(); const t = await issueAndSubject();
    delete storageStore[KEY]; // storage miss
    const miss = await download("e1", t);
    expect(miss.raw.status).toBe(404);
    expect(tokens[0].usedAt ?? null).toBeNull(); // TOKEN_BURN_ON_STORAGE_FAILURE=0
    await ready(undefined, expiresAt);            // storage recovered (re-seed identical valid package)
    expect((await download("e1", t)).raw.status).toBe(200); // same token still works
  });
  it("a package integrity failure (content tamper) does NOT consume the token", async () => {
    const expiresAt = new Date(Date.now() + 3600_000);
    const tampered = JSON.parse(validPackageFor("e1", "pr1", "org-A", expiresAt).bytes.toString());
    tampered.documents.user_profile[0].name = "MUTATED"; // same recordCount; content hash now mismatches
    await ready(Buffer.from(JSON.stringify(tampered)), expiresAt);
    const t = await issueAndSubject();
    const r = await download("e1", t);
    expect(r.raw.status).toBe(409);
    expect(r.json.code).toBe("PACKAGE_HASH_MISMATCH"); // TAMPERED_EXPORT_DELIVERY=0
    expect(tokens[0].usedAt ?? null).toBeNull();       // TOKEN_BURN_ON_PACKAGE_INTEGRITY_FAILURE=0
  });
  it("two concurrent valid redemptions yield exactly one successful download", async () => {
    await ready(); const t = await issueAndSubject();
    const [a, b] = await Promise.all([download("e1", t), download("e1", t)]);
    const successes = [a, b].filter((r) => r.raw.status === 200).length;
    expect(successes).toBe(1);
    expect(tokens.filter((tok) => (tok.usedAt ?? null) !== null)).toHaveLength(1);
  });
  it("no download commits after a committed revocation (DOWNLOAD_AFTER_COMMITTED_REVOCATION=0)", async () => {
    await ready(); const t = await issueAndSubject();
    adminA(); expect((await patchJob("e1", { transition: "REVOKED" })).res.status).toBe(200);
    payload = { sub: "subj-1", role: "customer", sid: "s" };
    const r = await download("e1", t);
    expect(r.raw.status).toBe(404);
    expect(tokens.every((tok) => (tok.usedAt ?? null) === null)).toBe(true); // never consumed
  });
  it("a download that commits first leaves zero live tokens after revocation (REVOKED_EXPORT_WITH_LIVE_TOKEN=0)", async () => {
    await ready(); const t = await issueAndSubject();
    expect((await download("e1", t)).raw.status).toBe(200); // consumes
    adminA(); expect((await patchJob("e1", { transition: "REVOKED" })).res.status).toBe(200);
    expect(tokens.filter((tok) => (tok.revokedAt ?? null) === null && (tok.usedAt ?? null) === null)).toHaveLength(0);
  });
});

describe("revocation invalidates tokens (atomic, Finding 2)", () => {
  it("revoking a READY export revokes its outstanding tokens", async () => {
    adminA(); jobs = [readyJob()];
    await issueToken("e1");
    const r = await patchJob("e1", { transition: "REVOKED" });
    expect(r.res.status).toBe(200);
    expect(jobs[0].lifecycle).toBe("REVOKED");
    expect(tokens[0].revokedAt).toBeTruthy();
    expect(auditCalls.some((e) => e.action === "compliance.export.revoked")).toBe(true);
  });
  it("a token-revocation failure rolls the whole revocation back (REVOCATION_PARTIAL_COMMIT=0)", async () => {
    adminA(); jobs = [readyJob()];
    await issueToken("e1");
    failTokenRevoke = true;
    const r = await patchJob("e1", { transition: "REVOKED" });
    expect(r.res.status).toBe(409);            // conflict, not success
    expect(jobs[0].lifecycle).toBe("READY");   // job transition rolled back
    expect(tokens[0].revokedAt ?? null).toBeNull(); // token still live (no partial commit)
    expect(auditCalls.some((e) => e.action === "compliance.export.revoked")).toBe(false);
  });
});

describe("audit hygiene (RAW_EXPORT_CONTENT_IN_AUDIT=0)", () => {
  it("never places email/token/package content in audit metadata", async () => {
    adminA(); privacy = [parent({ email: "SECRET-EMAIL@x.com" })];
    await createPOST({ privacyRequestId: "pr1" });
    expect(JSON.stringify(auditCalls)).not.toContain("SECRET-EMAIL");
  });
});
