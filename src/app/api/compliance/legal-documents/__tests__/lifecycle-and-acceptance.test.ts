/**
 * SECURITY (Phase 97 Part D) — legal-document lifecycle, transactional
 * supersession, and legal-acceptance version binding, driven through the REAL
 * routes + db layer over a synthetic Prisma (including $transaction).
 *
 * Invariants:
 *   CROSS_TENANT_LEGAL_DOCUMENT_READ=0 / _MUTATION=0
 *   UNAPPROVED_LEGAL_DOCUMENT_PUBLICATION=0
 *   PUBLISHED_LEGAL_DOCUMENT_MUTATION=0
 *   LEGAL_ACCEPTANCE_VERSION_REWRITE=0
 *   RAW_LEGAL_CONTENT_IN_AUDIT=0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";

type Row = Record<string, unknown> & { id: string };
type Member = { userId: string; organizationId: string; role: string; status: string };

let payload: { sub: string; role: string; sid?: string } | null = null;
let members: Member[] = [];
let docs: Row[] = [];
let acceptances: Row[] = [];
const auditCalls: Array<Record<string, unknown>> = [];
// Concurrency-race simulation for the governed acceptance insert: 1st read misses,
// the create raises a P2002 (as the partial-unique index would under a real race),
// and the re-read returns the winner — exercising the route's idempotent recovery.
let raceMode = false;
let acceptFindCount = 0;

function matchWhere(where: Record<string, unknown>, r: Row): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (k === "OR" && Array.isArray(v)) {
      if (!v.some((c) => matchWhere(c as Record<string, unknown>, r))) return false;
      continue;
    }
    const cell = r[k];
    if (v === null) { if (cell != null) return false; continue; }
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("not" in (v as object)) { if (cell === (v as { not: unknown }).not) return false; continue; }
      if ("lte" in (v as object)) { if (cell == null || new Date(cell as string).getTime() > new Date((v as { lte: Date }).lte).getTime()) return false; continue; }
      return false;
    }
    if (cell !== v) return false;
  }
  return true;
}
function collModel(store: () => Row[]) {
  return {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => store().find((r) => matchWhere(where, r)) ?? null,
    findMany: async ({ where = {}, orderBy, take }: { where?: Record<string, unknown>; orderBy?: { version?: string }; take?: number }) => {
      let rows = store().filter((r) => matchWhere(where, r));
      if (orderBy?.version === "desc") rows = rows.slice().sort((a, b) => String(b.version).localeCompare(String(a.version), undefined, { numeric: true }));
      return typeof take === "number" ? rows.slice(0, take) : rows;
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const matched = store().filter((r) => matchWhere(where, r));
      matched.forEach((r) => Object.assign(r, data));
      return { count: matched.length };
    },
    create: async ({ data }: { data: Record<string, unknown> }) => { const row = { ...data } as Row; store().push(row); return row; },
  };
}
function makeDb() {
  const acceptanceModel = raceMode ? {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      acceptFindCount += 1;
      if (acceptFindCount === 1) return null; // first read misses (pre-insert)
      return { id: "winner-acc", legalDocumentId: where.legalDocumentId, userId: where.userId, organizationId: null, documentType: "PRIVACY_POLICY", documentVersion: "1.0", sourceClass: "AUTHENTICATED_WEB", withdrawnAt: null } as Row;
    },
    create: async () => { throw { code: "P2002" }; }, // the partial-unique index rejects the racing insert
    updateMany: async () => ({ count: 0 }),
  } : collModel(() => acceptances);
  const db: Record<string, unknown> = {
    legalDocument: collModel(() => docs),
    legalAcceptance: acceptanceModel,
    organizationMember: {
      findMany: async ({ where }: { where: { userId: string; status: string } }) =>
        members.filter((m) => m.userId === where.userId && m.status === where.status).map((m) => ({ organizationId: m.organizationId, role: m.role })),
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        members.find((m) => m.userId === where.userId && m.organizationId === where.organizationId && m.status === where.status) ?? null,
    },
  };
  db.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(db);
  return db;
}

const MOCKED = ["@/lib/auth/jwt", "@/lib/auth/session-store", "@/lib/db/prisma", "@/lib/audit/audit-service", "@/lib/logger/security-events"];
beforeEach(() => {
  vi.resetModules();
  payload = null; members = []; docs = []; acceptances = []; auditCalls.length = 0;
  raceMode = false; acceptFindCount = 0;
  vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => payload }));
  vi.doMock("@/lib/auth/session-store", () => ({ isPayloadSessionActive: async () => true }));
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => makeDb() }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async (e: Record<string, unknown>) => { auditCalls.push(e); },
    COMPLIANCE_AUDIT: {
      LEGAL_DOCUMENT_CREATED: "compliance.legal_document.created",
      LEGAL_DOCUMENT_CONTENT_UPDATED: "compliance.legal_document.content_updated",
      LEGAL_DOCUMENT_TRANSITIONED: "compliance.legal_document.transitioned",
      LEGAL_ACCEPTANCE_CREATED: "compliance.legal_acceptance.created",
      LEGAL_ACCEPTANCE_WITHDRAWN: "compliance.legal_acceptance.withdrawn",
    },
  }));
  vi.doMock("@/lib/logger/security-events", () => ({ logAuthFailure: () => {}, logAuthzDenial: () => {}, logInfraFailure: () => {} }));
});
afterEach(() => { for (const m of MOCKED) vi.doUnmock(m); vi.restoreAllMocks(); });

function req(path: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/compliance/legal-documents${path}`, {
    method, headers: { cookie: `${ACCESS_TOKEN_COOKIE}=fake`, "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function post(body: unknown) { const { POST } = await import("../route"); const r = await POST(req("", "POST", body)); return { res: r, json: await r.json() }; }
async function patch(id: string, body: unknown) { const { PATCH } = await import("../[id]/route"); const r = await PATCH(req(`/${id}`, "PATCH", body), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
async function getOne(id: string) { const { GET } = await import("../[id]/route"); const r = await GET(req(`/${id}`, "GET"), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
async function accept(id: string) { const { POST } = await import("../[id]/accept/route"); const r = await POST(req(`/${id}/accept`, "POST"), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
async function withdraw(id: string) { const { DELETE } = await import("../[id]/accept/route"); const r = await DELETE(req(`/${id}/accept`, "DELETE"), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }

function ownerA() { payload = { sub: "owner-A", role: "customer", sid: "s" }; members = [{ userId: "owner-A", organizationId: "org-A", role: "OWNER", status: "ACTIVE" }]; }
function adminA() { payload = { sub: "admin-A", role: "admin", sid: "s" }; members = [{ userId: "admin-A", organizationId: "org-A", role: "ADMIN", status: "ACTIVE" }]; }
function superadmin() { payload = { sub: "root", role: "superadmin", sid: "s" }; }
function doc(over: Partial<Row>): Row {
  return { id: "d1", documentType: "TERMS_OF_SERVICE", version: "1.0", title: "T", content: "SECRET BODY", locale: "en",
    isPublished: false, lifecycle: "DRAFT", effectiveDate: null, organizationId: "org-A", createdBy: "x", ...over } as Row;
}

describe("create → DRAFT, no auto-publish, scope authoritative", () => {
  it("tenant admin creates a DRAFT in its own org (client org is ignored)", async () => {
    adminA();
    const { res, json } = await post({ documentType: "TERMS_OF_SERVICE", version: "1.0", title: "T", content: "B", organizationId: "org-EVIL" });
    expect(res.status).toBe(201);
    expect(json.document.lifecycle).toBe("DRAFT");
    expect(json.document.isPublished).toBe(false);
    expect(docs[0].organizationId).toBe("org-A");
  });
  it("superadmin creates a GLOBAL DRAFT (organizationId null)", async () => {
    superadmin();
    const { res, json } = await post({ documentType: "PRIVACY_POLICY", version: "1.0", title: "T", content: "B" });
    expect(res.status).toBe(201);
    expect(docs[0].organizationId).toBeNull();
    expect(json.document.lifecycle).toBe("DRAFT");
  });
});

describe("lifecycle transitions + approval/publication separation", () => {
  it("DRAFT→IN_REVIEW (manage), then approval needs approve permission", async () => {
    adminA();
    docs = [doc({ id: "d1", lifecycle: "DRAFT" })];
    expect((await patch("d1", { transition: "IN_REVIEW" })).res.status).toBe(200);
    expect(docs[0].lifecycle).toBe("IN_REVIEW");
    // ADMIN lacks approve_legal_documents (OWNER-only).
    const denied = await patch("d1", { transition: "APPROVED" });
    expect(denied.res.status).toBe(403);
    // OWNER approves.
    ownerA();
    expect((await patch("d1", { transition: "APPROVED" })).res.status).toBe(200);
    expect(docs[0].lifecycle).toBe("APPROVED");
    expect(docs[0].approvedBy).toBe("owner-A");
  });

  it("publication requires approval (UNAPPROVED_LEGAL_DOCUMENT_PUBLICATION=0)", async () => {
    ownerA();
    docs = [doc({ id: "d1", lifecycle: "DRAFT" })];
    const bad = await patch("d1", { transition: "PUBLISHED" });
    expect(bad.res.status).toBe(409);
    expect(bad.json.code).toBe("INVALID_TRANSITION");
    expect(docs[0].isPublished).toBe(false);
  });

  it("ADMIN cannot publish even an APPROVED document (publish is OWNER-only)", async () => {
    adminA();
    docs = [doc({ id: "d1", lifecycle: "APPROVED" })];
    const denied = await patch("d1", { transition: "PUBLISHED" });
    expect(denied.res.status).toBe(403);
    expect(docs[0].isPublished).toBe(false);
  });

  it("OWNER publishes an APPROVED document", async () => {
    ownerA();
    docs = [doc({ id: "d1", lifecycle: "APPROVED" })];
    const ok = await patch("d1", { transition: "PUBLISHED" });
    expect(ok.res.status).toBe(200);
    expect(docs[0].lifecycle).toBe("PUBLISHED");
    expect(docs[0].isPublished).toBe(true);
    expect(docs[0].publishedBy).toBe("owner-A");
  });
});

describe("published immutability + invalid transitions", () => {
  it("rejects content edit on a PUBLISHED document (PUBLISHED_LEGAL_DOCUMENT_MUTATION=0)", async () => {
    adminA();
    docs = [doc({ id: "d1", lifecycle: "PUBLISHED", isPublished: true })];
    const bad = await patch("d1", { content: "tampered", title: "new" });
    expect(bad.res.status).toBe(409);
    expect(bad.json.code).toBe("DOCUMENT_IMMUTABLE");
    expect(docs[0].content).toBe("SECRET BODY");
  });
  it("rejects content edit on an IN_REVIEW document", async () => {
    adminA();
    docs = [doc({ id: "d1", lifecycle: "IN_REVIEW" })];
    expect((await patch("d1", { content: "x" })).res.status).toBe(409);
  });
  it("rejects an out-of-machine transition", async () => {
    ownerA();
    docs = [doc({ id: "d1", lifecycle: "PUBLISHED", isPublished: true })];
    const bad = await patch("d1", { transition: "DRAFT" });
    expect(bad.res.status).toBe(409);
    expect(bad.json.code).toBe("INVALID_TRANSITION");
  });
});

describe("transactional supersession (single effective version, content preserved)", () => {
  it("publishing v2 supersedes the currently-effective v1 and preserves v1 content", async () => {
    ownerA();
    docs = [
      doc({ id: "v1", version: "1.0", lifecycle: "PUBLISHED", isPublished: true, content: "V1 BODY" }),
      doc({ id: "v2", version: "2.0", lifecycle: "APPROVED", isPublished: false, content: "V2 BODY" }),
    ];
    const ok = await patch("v2", { transition: "PUBLISHED" });
    expect(ok.res.status).toBe(200);
    const v1 = docs.find((d) => d.id === "v1")!;
    const v2 = docs.find((d) => d.id === "v2")!;
    expect(v2.lifecycle).toBe("PUBLISHED");
    expect(v2.isPublished).toBe(true);
    expect(v1.lifecycle).toBe("SUPERSEDED");
    expect(v1.isPublished).toBe(false);
    expect(v1.supersededById).toBe("v2");
    expect(v1.content).toBe("V1 BODY"); // old content preserved, never rewritten
    // Exactly one effective (isPublished) version remains.
    expect(docs.filter((d) => d.isPublished === true)).toHaveLength(1);
  });
});

describe("cross-tenant isolation", () => {
  it("tenant A cannot read or mutate tenant B's document (404)", async () => {
    adminA();
    docs = [doc({ id: "bdoc", organizationId: "org-B", lifecycle: "DRAFT" })];
    expect((await getOne("bdoc")).res.status).toBe(404);
    const mut = await patch("bdoc", { transition: "IN_REVIEW" });
    expect(mut.res.status).toBe(404);
    expect(docs[0].lifecycle).toBe("DRAFT");
  });
});

describe("legal acceptance version binding", () => {
  it("binds acceptance to the immutable version and never rewrites it on new publication", async () => {
    // A published global v1.
    docs = [doc({ id: "g1", organizationId: null, documentType: "PRIVACY_POLICY", version: "1.0", lifecycle: "PUBLISHED", isPublished: true })];
    payload = { sub: "user-1", role: "customer", sid: "s" }; members = [];
    const a = await accept("g1");
    expect(a.res.status).toBe(201);
    expect(acceptances[0].legalDocumentId).toBe("g1");
    expect(acceptances[0].documentVersion).toBe("1.0");
    expect(acceptances[0].ipAddress ?? null).toBeNull(); // no raw IP stored

    // A NEW version g2 is published — the prior acceptance still references g1.
    docs.push(doc({ id: "g2", organizationId: null, documentType: "PRIVACY_POLICY", version: "2.0", lifecycle: "PUBLISHED", isPublished: true }));
    expect(acceptances).toHaveLength(1);
    expect(acceptances[0].legalDocumentId).toBe("g1"); // not moved to g2
    expect(acceptances[0].documentVersion).toBe("1.0");
  });

  it("duplicate acceptance of the same version is idempotent", async () => {
    docs = [doc({ id: "g1", organizationId: null, documentType: "PRIVACY_POLICY", version: "1.0", lifecycle: "PUBLISHED", isPublished: true })];
    payload = { sub: "user-1", role: "customer", sid: "s" };
    await accept("g1");
    const again = await accept("g1");
    expect(again.res.status).toBe(200);
    expect(again.json.alreadyAccepted).toBe(true);
    expect(acceptances).toHaveLength(1);
  });

  it("a non-published document cannot be accepted (404)", async () => {
    docs = [doc({ id: "g1", organizationId: null, lifecycle: "DRAFT", isPublished: false })];
    payload = { sub: "user-1", role: "customer", sid: "s" };
    expect((await accept("g1")).res.status).toBe(404);
  });
});

describe("Part D hardening — supersession & publication races", () => {
  it("direct PUBLISHED→SUPERSEDED via the generic API is denied (DIRECT_LEGAL_DOCUMENT_SUPERSESSION=0)", async () => {
    ownerA();
    docs = [doc({ id: "d1", lifecycle: "PUBLISHED", isPublished: true })];
    const bad = await patch("d1", { transition: "SUPERSEDED" });
    expect(bad.res.status).toBe(409);
    expect(bad.json.code).toBe("INVALID_TRANSITION");
    expect(docs[0].lifecycle).toBe("PUBLISHED"); // unchanged, no supersededById
    expect(docs[0].supersededById ?? null).toBeNull();
  });

  it("early publication of a future-effective version is denied and leaves the current version effective", async () => {
    ownerA();
    const future = new Date(Date.now() + 3600_000).toISOString();
    docs = [
      doc({ id: "v1", version: "1.0", lifecycle: "PUBLISHED", isPublished: true, effectiveDate: null }),
      doc({ id: "v2", version: "2.0", lifecycle: "SCHEDULED", isPublished: false, effectiveDate: future }),
    ];
    const early = await patch("v2", { transition: "PUBLISHED" });
    expect(early.res.status).toBe(409);
    expect(early.json.code).toBe("NOT_EFFECTIVE_YET");
    // Current version untouched; scheduled version not published; no gap.
    const v1 = docs.find((d) => d.id === "v1")!, v2 = docs.find((d) => d.id === "v2")!;
    expect(v1.lifecycle).toBe("PUBLISHED"); expect(v1.isPublished).toBe(true);
    expect(v2.lifecycle).toBe("SCHEDULED"); expect(v2.isPublished).toBe(false);
    expect(docs.filter((d) => d.isPublished === true)).toHaveLength(1);
  });

  it("publishing at/after effectiveDate succeeds and supersedes the previous version", async () => {
    ownerA();
    const past = new Date(Date.now() - 3600_000).toISOString();
    docs = [
      doc({ id: "v1", version: "1.0", lifecycle: "PUBLISHED", isPublished: true, effectiveDate: null }),
      doc({ id: "v2", version: "2.0", lifecycle: "SCHEDULED", isPublished: false, effectiveDate: past }),
    ];
    const ok = await patch("v2", { transition: "PUBLISHED" });
    expect(ok.res.status).toBe(200);
    expect(docs.find((d) => d.id === "v2")!.lifecycle).toBe("PUBLISHED");
    expect(docs.find((d) => d.id === "v1")!.lifecycle).toBe("SUPERSEDED");
    expect(docs.find((d) => d.id === "v1")!.supersededById).toBe("v2");
    expect(docs.filter((d) => d.isPublished === true)).toHaveLength(1);
  });
});

describe("Part D hardening — acceptance idempotency race & withdrawal audit", () => {
  it("a concurrent insert race resolves to an idempotent success (not PERSIST_FAILED)", async () => {
    raceMode = true; // first read misses, create → P2002, re-read → winner
    docs = [doc({ id: "g1", organizationId: null, documentType: "PRIVACY_POLICY", version: "1.0", lifecycle: "PUBLISHED", isPublished: true })];
    payload = { sub: "user-1", role: "customer", sid: "s" }; members = [];
    const r = await accept("g1");
    expect(r.res.status).toBe(200);
    expect(r.json.alreadyAccepted).toBe(true);
  });

  it("withdrawal binds the audit to the acceptance id + org, then a new acceptance is allowed", async () => {
    docs = [doc({ id: "g1", organizationId: "org-A", documentType: "PRIVACY_POLICY", version: "1.0", lifecycle: "PUBLISHED", isPublished: true })];
    payload = { sub: "user-1", role: "customer", sid: "s" };
    members = [{ userId: "user-1", organizationId: "org-A", role: "VIEWER", status: "ACTIVE" }];
    const a = await accept("g1");
    expect(a.res.status).toBe(201);
    const accId = acceptances[0].id as string;

    const w = await withdraw("g1");
    expect(w.res.status).toBe(200);
    expect(acceptances[0].withdrawnAt).toBeInstanceOf(Date); // evidence preserved, not deleted
    const ev = auditCalls.find((e) => e.action === "compliance.legal_acceptance.withdrawn")!;
    expect(ev.entityType).toBe("LegalAcceptance");
    expect(ev.entityId).toBe(accId);          // acceptance id, not the document id
    expect(ev.organizationId).toBe("org-A");
    const meta = ev.metadata as Record<string, unknown>;
    expect(Object.keys(meta).sort()).toEqual(["documentType", "documentVersion", "legalDocumentId", "sourceClass"]);

    // A NEW acceptance after withdrawal is allowed (the old row was withdrawn).
    const again = await accept("g1");
    expect(again.res.status).toBe(201);
    expect(acceptances.filter((r) => (r.withdrawnAt ?? null) === null)).toHaveLength(1);
  });

  it("withdrawal with no active acceptance is a uniform 404", async () => {
    docs = [doc({ id: "g1", organizationId: null, lifecycle: "PUBLISHED", isPublished: true })];
    payload = { sub: "user-1", role: "customer", sid: "s" };
    expect((await withdraw("g1")).res.status).toBe(404);
  });
});

describe("audit hygiene", () => {
  it("create/transition audit never contains document content or title", async () => {
    adminA();
    const { json } = await post({ documentType: "TERMS_OF_SERVICE", version: "1.0", title: "TOP SECRET TITLE", content: "TOP SECRET CONTENT" });
    docs[0].id = json.document.id;
    await patch(json.document.id, { transition: "IN_REVIEW" });
    const serialised = JSON.stringify(auditCalls);
    expect(serialised).not.toContain("TOP SECRET TITLE");
    expect(serialised).not.toContain("TOP SECRET CONTENT");
    expect(auditCalls.some((e) => e.action === "compliance.legal_document.created")).toBe(true);
    expect(auditCalls.some((e) => e.action === "compliance.legal_document.transitioned")).toBe(true);
  });
});
