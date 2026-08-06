/**
 * SECURITY (Phase 97 checkpoint hardening) — legal-hold lifecycle integrity.
 *
 * Invariants:
 *   INVALID_LEGAL_HOLD_ACTIVATION=0
 *   ACTIVE_LEGAL_HOLD_MATERIAL_MUTATION=0
 *   RELEASED_LEGAL_HOLD_MUTATION=0
 *   LEGAL_HOLD_SCOPE_CHANGE_WITHOUT_REAPPROVAL=0
 *   LEGAL_HOLD_POLICY_BYPASS=0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";

type Member = { userId: string; organizationId: string; role: string; status: string };
type Row = Record<string, unknown> & { id: string; organizationId: string };

let payload: { sub: string; role: string; sid?: string } | null = null;
let members: Member[] = [];
let holds: Row[] = [];
let policies: Row[] = [];
const auditCalls: Array<Record<string, unknown>> = [];
let idSeq = 0;
// Force a specific LegalHold read (1-indexed) to return null — used to simulate a
// transient/racy post-commit re-read and prove the audit never sources newStatus from it.
let holdReadCall = 0;
let failHoldReadOnCall = 0;

function matches(where: Record<string, unknown>, r: Row): boolean {
  for (const [k, v] of Object.entries(where)) if (r[k] !== v) return false;
  return true;
}
function model(store: () => Row[]) {
  return {
    findMany: async ({ where = {} }: { where?: Record<string, unknown> }) => store().filter((r) => matches(where, r)),
    // A read returns a SNAPSHOT (a copy), like a real DB — never a live handle that a
    // later in-place updateMany would mutate. This keeps `existing` (the route pre-read)
    // authoritative for previousStatus even after the governed op commits.
    findFirst: async ({ where }: { where: Record<string, unknown> }) => { const r = store().find((x) => matches(where, x)); return r ? { ...r } : null; },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { ...data, id: (data.id as string) ?? `gen-${++idSeq}` } as Row;
      store().push(row);
      return row;
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const matched = store().filter((r) => matches(where, r));
      matched.forEach((r) => Object.assign(r, data));
      return { count: matched.length };
    },
  };
}
function makeDb() {
  const legalHold = model(() => holds);
  const baseFindFirst = legalHold.findFirst;
  legalHold.findFirst = async (args: { where: Record<string, unknown> }) => {
    holdReadCall += 1;
    if (failHoldReadOnCall === holdReadCall) return null; // simulate a transient/racy read
    return baseFindFirst(args);
  };
  const db: Record<string, unknown> = {
    organizationMember: {
      findMany: async ({ where }: { where: { userId: string; status: string } }) =>
        members.filter((m) => m.userId === where.userId && m.status === where.status).map((m) => ({ organizationId: m.organizationId, role: m.role })),
    },
    legalHold,
    retentionPolicy: model(() => policies),
  };
  // Governed LegalHold ops run a real interactive transaction with a SELECT ... FOR UPDATE
  // row lock + a post-lock clock_timestamp(); model those two raw statements. (Locking is
  // proven against real PostgreSQL by *.pg.test.ts; here we only need faithful row reads.)
  db.$queryRawUnsafe = async (sql: string, ...vals: unknown[]) => {
    if (/clock_timestamp\(\)/i.test(sql)) return [{ now: new Date() }];
    if (/"LegalHold"[\s\S]*FOR UPDATE/i.test(sql)) {
      const [id, org] = vals as [string, string];
      const r = holds.find((h) => h.id === id && h.organizationId === org);
      return r ? [r] : [];
    }
    return [];
  };
  db.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    const snap = holds.map((r) => ({ ...r }));
    try { return await fn(db); }
    catch (e) { holds.splice(0, holds.length, ...snap); throw e; }
  };
  return db;
}

const MOCKED = ["@/lib/auth/jwt", "@/lib/auth/session-store", "@/lib/db/prisma", "@/lib/audit/audit-service", "@/lib/logger/security-events"];
beforeEach(() => {
  vi.resetModules();
  payload = { sub: "admin-A", role: "admin", sid: "s1" };
  members = [{ userId: "admin-A", organizationId: "org-A", role: "ADMIN", status: "ACTIVE" }];
  holds = []; policies = []; auditCalls.length = 0;
  holdReadCall = 0; failHoldReadOnCall = 0;
  vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => payload }));
  vi.doMock("@/lib/auth/session-store", () => ({ isPayloadSessionActive: async () => true }));
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => makeDb() }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async (e: Record<string, unknown>) => { auditCalls.push(e); },
    COMPLIANCE_AUDIT: { LEGAL_HOLD_CREATED: "compliance.legal_hold.created", LEGAL_HOLD_UPDATED: "compliance.legal_hold.updated", RETENTION_POLICY_CREATED: "compliance.retention_policy.created" },
  }));
  vi.doMock("@/lib/logger/security-events", () => ({ logAuthFailure: () => {}, logAuthzDenial: () => {}, logInfraFailure: () => {} }));
});
afterEach(() => { for (const m of MOCKED) vi.doUnmock(m); vi.restoreAllMocks(); });

function mkReq(path: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/compliance${path}`, {
    method, headers: { cookie: `${ACCESS_TOKEN_COOKIE}=fake`, "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function holdPOST(body: unknown) {
  const { POST } = await import("../legal-holds/route");
  const res = await POST(mkReq("/legal-holds", "POST", body));
  return { res, json: await res.json() };
}
async function holdPATCH(id: string, body: unknown) {
  const { PATCH } = await import("../legal-holds/[id]/route");
  const res = await PATCH(mkReq(`/legal-holds/${id}`, "PATCH", body), { params: Promise.resolve({ id }) });
  return { res, json: await res.json() };
}
async function policyPOST(body: unknown) {
  const { POST } = await import("../retention-policies/route");
  const res = await POST(mkReq("/retention-policies", "POST", body));
  return { res, json: await res.json() };
}

describe("create — fail-closed scope", () => {
  it("rejects an incomplete scope (SUBJECT without subjectId)", async () => {
    const { res, json } = await holdPOST({ name: "H", scopeType: "SUBJECT" });
    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_SCOPE");
    expect(holds).toHaveLength(0);
  });
  it("rejects a contradictory scope (ORGANIZATION + subjectId)", async () => {
    const { res } = await holdPOST({ name: "H", scopeType: "ORGANIZATION", subjectId: "s1" });
    expect(res.status).toBe(400);
  });
  it("accepts a valid scope and creates PROPOSED", async () => {
    const { res, json } = await holdPOST({ name: "H", scopeType: "SUBJECT", subjectId: "s1" });
    expect(res.status).toBe(201);
    expect(json.hold.status).toBe("PROPOSED");
  });
});

describe("activation revalidation — INVALID_LEGAL_HOLD_ACTIVATION=0", () => {
  it("a PROPOSED hold with an incomplete persisted scope cannot become ACTIVE", async () => {
    // Seed directly (bypassing create) an incomplete PROPOSED hold.
    holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "SUBJECT", subjectId: null, status: "PROPOSED" }];
    const { res, json } = await holdPATCH("h1", { status: "ACTIVE" });
    expect(res.status).toBe(422);
    expect(json.code).toBe("INVALID_LEGAL_HOLD_ACTIVATION");
    expect(holds[0].status).toBe("PROPOSED");
  });
  it("activation sets approvedBy/approvedAt server-side when scope is valid", async () => {
    holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "SUBJECT", subjectId: "s1", status: "PROPOSED" }];
    const { res } = await holdPATCH("h1", { status: "ACTIVE" });
    expect(res.status).toBe(200);
    expect(holds[0].status).toBe("ACTIVE");
    expect(holds[0].approvedBy).toBe("admin-A");
    expect(holds[0].approvedAt).toBeInstanceOf(Date);
  });
});

describe("ACTIVE immutability", () => {
  beforeEach(() => { holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "SUBJECT", subjectId: "s1", status: "ACTIVE" }]; });

  it("denies a material scope change (ACTIVE_LEGAL_HOLD_MATERIAL_MUTATION=0 / scope-change-without-reapproval=0)", async () => {
    const { res, json } = await holdPATCH("h1", { subjectId: "s2" });
    expect(res.status).toBe(409);
    expect(json.code).toBe("ACTIVE_HOLD_IMMUTABLE");
    expect(holds[0].subjectId).toBe("s1");
  });
  it("denies changing scopeType under the existing approval", async () => {
    const { res } = await holdPATCH("h1", { scopeType: "ORGANIZATION" });
    expect(res.status).toBe(409);
    expect(holds[0].scopeType).toBe("SUBJECT");
  });
  it("allows a reviewDate-only update", async () => {
    const { res } = await holdPATCH("h1", { reviewDate: "2026-09-01T00:00:00.000Z" });
    expect(res.status).toBe(200);
    expect(holds[0].reviewDate).toBeInstanceOf(Date);
  });
  it("allows the release transition and sets releaseApprovedBy/releasedAt", async () => {
    const { res } = await holdPATCH("h1", { status: "RELEASED" });
    expect(res.status).toBe(200);
    expect(holds[0].status).toBe("RELEASED");
    expect(holds[0].releaseApprovedBy).toBe("admin-A");
  });
});

describe("terminal immutability + cancellation", () => {
  it("a RELEASED hold is fully immutable (RELEASED_LEGAL_HOLD_MUTATION=0)", async () => {
    holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "SUBJECT", subjectId: "s1", status: "RELEASED" }];
    const { res, json } = await holdPATCH("h1", { reviewDate: "2026-09-01T00:00:00.000Z" });
    expect(res.status).toBe(409);
    expect(json.code).toBe("HOLD_IMMUTABLE");
  });
  it("a PROPOSED hold is CANCELLED (distinct from release) with attribution", async () => {
    holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "SUBJECT", subjectId: "s1", status: "PROPOSED" }];
    const { res } = await holdPATCH("h1", { status: "CANCELLED" });
    expect(res.status).toBe(200);
    expect(holds[0].status).toBe("CANCELLED");
    expect(holds[0].cancelledBy).toBe("admin-A");
    expect(holds[0].releasedAt ?? null).toBeNull(); // not blurred with release
  });
  it("a PROPOSED hold cannot jump straight to RELEASED", async () => {
    holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "SUBJECT", subjectId: "s1", status: "PROPOSED" }];
    const { res, json } = await holdPATCH("h1", { status: "RELEASED" });
    expect(res.status).toBe(409);
    expect(json.code).toBe("INVALID_TRANSITION");
  });
});

describe("legalHoldAware is not a client bypass — LEGAL_HOLD_POLICY_BYPASS=0", () => {
  it("a retention policy body carrying legalHoldAware=false is rejected", async () => {
    const { res } = await policyPOST({ name: "P", dataClass: "pii", targetResource: "case", legalHoldAware: false });
    expect(res.status).toBe(400); // strict schema rejects the field outright
    expect(policies).toHaveLength(0);
  });
  it("a created policy always has legalHoldAware=true", async () => {
    const { res, json } = await policyPOST({ name: "P", dataClass: "pii", targetResource: "case" });
    expect(res.status).toBe(201);
    expect(policies[0].legalHoldAware).toBe(true);
    expect(json.policy).toBeTruthy();
  });
});

describe("audit hygiene", () => {
  it("hold update audit carries closed enums + ids only", async () => {
    holds = [{ id: "h1", organizationId: "org-A", name: "SECRET HOLD NAME", scopeType: "SUBJECT", subjectId: "s1", status: "PROPOSED" }];
    await holdPATCH("h1", { status: "ACTIVE" });
    const ev = auditCalls.find((e) => e.action === "compliance.legal_hold.updated");
    expect(ev).toBeTruthy();
    const serialised = JSON.stringify(ev);
    expect(serialised).not.toContain("SECRET HOLD NAME");
  });
});

describe("stable transition policy — a transition may not carry a material edit", () => {
  const auditUpdates = () => auditCalls.filter((e) => e.action === "compliance.legal_hold.updated");
  it("SUBJECT→INCIDENT + ACTIVE in one request is rejected (never reaches the generic path)", async () => {
    holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "SUBJECT", subjectId: "s1", status: "PROPOSED" }];
    const { res, json } = await holdPATCH("h1", { scopeType: "INCIDENT", incidentId: "i1", status: "ACTIVE" });
    expect(res.status).toBe(409);
    expect(json.code).toBe("HOLD_TRANSITION_REQUIRES_STABLE_SNAPSHOT");
    expect(holds[0].status).toBe("PROPOSED");           // no row change
    expect(holds[0].scopeType).toBe("SUBJECT");
    expect(auditUpdates()).toHaveLength(0);             // no audit event
  });
  it("INCIDENT A → INCIDENT B + ACTIVE is rejected", async () => {
    holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "INCIDENT", incidentId: "A", status: "PROPOSED" }];
    const { res, json } = await holdPATCH("h1", { incidentId: "B", status: "ACTIVE" });
    expect(res.status).toBe(409);
    expect(json.code).toBe("HOLD_TRANSITION_REQUIRES_STABLE_SNAPSHOT");
    expect(holds[0].incidentId).toBe("A");
  });
  it("INCIDENT → ORGANIZATION + ACTIVE is rejected", async () => {
    holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "INCIDENT", incidentId: "A", status: "PROPOSED" }];
    const { res, json } = await holdPATCH("h1", { scopeType: "ORGANIZATION", status: "ACTIVE" });
    expect(res.status).toBe(409);
    expect(json.code).toBe("HOLD_TRANSITION_REQUIRES_STABLE_SNAPSHOT");
  });
  it("reviewDate + RELEASED is rejected", async () => {
    holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "SUBJECT", subjectId: "s1", status: "ACTIVE" }];
    const { res, json } = await holdPATCH("h1", { reviewDate: "2026-09-01T00:00:00.000Z", status: "RELEASED" });
    expect(res.status).toBe(409);
    expect(json.code).toBe("HOLD_TRANSITION_REQUIRES_STABLE_SNAPSHOT");
    expect(holds[0].status).toBe("ACTIVE");
  });
  it("name/reason + CANCELLED is rejected", async () => {
    holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "SUBJECT", subjectId: "s1", status: "PROPOSED" }];
    const { res, json } = await holdPATCH("h1", { name: "Renamed", status: "CANCELLED" });
    expect(res.status).toBe(409);
    expect(json.code).toBe("HOLD_TRANSITION_REQUIRES_STABLE_SNAPSHOT");
    expect(holds[0].status).toBe("PROPOSED");
    expect(holds[0].name).toBe("H");
  });
});

describe("accurate audit — fieldsUpdated matches only persisted fields", () => {
  it("a generic (non-INCIDENT) activation audits only the fields it wrote", async () => {
    holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "SUBJECT", subjectId: "s1", status: "PROPOSED" }];
    const { res } = await holdPATCH("h1", { status: "ACTIVE" });
    expect(res.status).toBe(200);
    const ev = auditCalls.find((e) => e.action === "compliance.legal_hold.updated")!;
    const fields = (ev.metadata as { fieldsUpdated: string[] }).fieldsUpdated;
    expect(fields).toContain("status");
    expect(fields).toContain("approvedBy");
    expect(fields).toContain("approvedAt");
    // Never claims a material field (name/scope) changed.
    expect(fields).not.toContain("name");
    expect(fields).not.toContain("scopeType");
    expect(fields).not.toContain("subjectId");
  });
});

describe("governed linearization — exact fieldsWritten, post-lock time, no audit on rejection", () => {
  const auditUpdates = () => auditCalls.filter((e) => e.action === "compliance.legal_hold.updated");
  const fieldsOf = () => (auditUpdates()[0]?.metadata as { fieldsUpdated: string[] }).fieldsUpdated;

  it("an ACTIVE reviewDate edit writes exactly [reviewDate, updatedAt, updatedBy] with Date values", async () => {
    holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "SUBJECT", subjectId: "s1", status: "ACTIVE" }];
    const { res } = await holdPATCH("h1", { reviewDate: "2026-09-01T00:00:00.000Z" });
    expect(res.status).toBe(200);
    expect(fieldsOf()).toEqual(["reviewDate", "updatedAt", "updatedBy"]);
    expect(holds[0].reviewDate).toBeInstanceOf(Date);
    expect(holds[0].updatedAt).toBeInstanceOf(Date); // post-lock clock_timestamp(), not a route Date
  });

  it("a PROPOSED→CANCELLED transition writes cancellation attribution, never release fields", async () => {
    holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "SUBJECT", subjectId: "s1", status: "PROPOSED" }];
    const { res } = await holdPATCH("h1", { status: "CANCELLED" });
    expect(res.status).toBe(200);
    expect(fieldsOf()).toEqual(["cancelledAt", "cancelledBy", "status", "updatedAt", "updatedBy"]);
    expect(holds[0].releasedAt ?? null).toBeNull();
  });

  it("an ACTIVE→RELEASED transition writes exactly the release attribution", async () => {
    holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "SUBJECT", subjectId: "s1", status: "ACTIVE" }];
    const { res } = await holdPATCH("h1", { status: "RELEASED" });
    expect(res.status).toBe(200);
    expect(fieldsOf()).toEqual(["releaseApprovedBy", "releasedAt", "status", "updatedAt", "updatedBy"]);
  });

  it("a rejected ACTIVE material edit produces NO success audit event (AUDIT_FOR_REJECTED_HOLD_MUTATION=0)", async () => {
    holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "SUBJECT", subjectId: "s1", status: "ACTIVE" }];
    const { res, json } = await holdPATCH("h1", { subjectId: "s2" });
    expect(res.status).toBe(409);
    expect(json.code).toBe("ACTIVE_HOLD_IMMUTABLE");
    expect(auditUpdates()).toHaveLength(0);
    expect(holds[0].subjectId).toBe("s1");
  });

  it("audit newStatus + previousStatus come from the committed op, never a post-commit re-read (LEGAL_HOLD_AUDIT_STALE_STATUS=0)", async () => {
    holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "SUBJECT", subjectId: "s1", status: "PROPOSED" }];
    // Force the SECOND LegalHold read (the post-commit DTO/audit re-read) to fail; the op
    // has already committed CANCELLED. Sourcing newStatus from that read would record the
    // stale pre-transition status — so this asserts the committed op is the source.
    failHoldReadOnCall = 2;
    const { res, json } = await holdPATCH("h1", { status: "CANCELLED" });
    expect(res.status).toBe(200);
    expect(json.hold).toBeNull();                       // the re-read failed → DTO is null
    expect(holds[0].status).toBe("CANCELLED");          // but the op DID commit
    const ev = auditCalls.find((e) => e.action === "compliance.legal_hold.updated")!;
    const md = ev.metadata as { previousStatus: string; newStatus: string; fieldsUpdated: string[] };
    expect(md.previousStatus).toBe("PROPOSED");
    expect(md.newStatus).toBe("CANCELLED");             // committed status, NOT the stale/null re-read
    expect(md.fieldsUpdated).toContain("status");
  });

  it("a pure edit audits newStatus as the unchanged committed status", async () => {
    holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "SUBJECT", subjectId: "s1", status: "ACTIVE" }];
    await holdPATCH("h1", { reviewDate: "2026-09-01T00:00:00.000Z" });
    const ev = auditCalls.find((e) => e.action === "compliance.legal_hold.updated")!;
    const md = ev.metadata as { previousStatus: string; newStatus: string };
    expect(md.previousStatus).toBe("ACTIVE");
    expect(md.newStatus).toBe("ACTIVE"); // an edit never changes status
  });

  it("a rejected terminal edit produces NO success audit event", async () => {
    holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "SUBJECT", subjectId: "s1", status: "CANCELLED" }];
    const { res, json } = await holdPATCH("h1", { reviewDate: "2026-09-01T00:00:00.000Z" });
    expect(res.status).toBe(409);
    expect(json.code).toBe("HOLD_IMMUTABLE");
    expect(auditUpdates()).toHaveLength(0);
  });

  it("a PROPOSED scope edit revalidates the locked candidate scope fail-closed (INVALID_SCOPE)", async () => {
    // SUBJECT→RESOURCE_TYPE without a resourceType leaves an incomplete candidate scope.
    holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "SUBJECT", subjectId: "s1", status: "PROPOSED" }];
    const { res, json } = await holdPATCH("h1", { scopeType: "RESOURCE_TYPE" });
    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_SCOPE");
    expect(holds[0].scopeType).toBe("SUBJECT"); // unchanged
    expect(auditUpdates()).toHaveLength(0);
  });

  it("a PROPOSED scope edit writes the full normalized scope set from a clean base", async () => {
    // ORGANIZATION → SUBJECT: no leftover target contradicts the new scope type.
    holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "ORGANIZATION", status: "PROPOSED" }];
    const { res } = await holdPATCH("h1", { scopeType: "SUBJECT", subjectId: "s1" });
    expect(res.status).toBe(200);
    expect(holds[0].scopeType).toBe("SUBJECT");
    expect(holds[0].subjectId).toBe("s1");
    expect(holds[0].resourceType ?? null).toBeNull(); // normalized away
    const fields = fieldsOf();
    expect(fields).toContain("scopeType");
    expect(fields).toContain("subjectId");
    expect(fields).toContain("resourceType"); // written (as null) — part of the normalized scope set
  });

  it("a PROPOSED scope edit that leaves a contradictory old target is rejected fail-closed", async () => {
    // SUBJECT→RESOURCE_TYPE cannot drop the old subjectId in one edit → INVALID_SCOPE.
    holds = [{ id: "h1", organizationId: "org-A", name: "H", scopeType: "SUBJECT", subjectId: "s1", status: "PROPOSED" }];
    const { res, json } = await holdPATCH("h1", { scopeType: "RESOURCE_TYPE", resourceType: "case" });
    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_SCOPE");
    expect(holds[0].scopeType).toBe("SUBJECT"); // unchanged
    expect(auditUpdates()).toHaveLength(0);
  });
});
