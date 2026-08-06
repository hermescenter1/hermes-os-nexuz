/**
 * SECURITY (Phase 97 incidents) — incident routes over a synthetic Prisma. Invariants:
 * CROSS_TENANT_INCIDENT_READ/MUTATION=0, CLIENT_SUPPLIED_INCIDENT_ATTRIBUTION=0,
 * INVALID_INCIDENT_TRANSITION=0, UNASSESSED_INCIDENT_CLOSURE=0,
 * UNRESOLVED_BLOCKER_INCIDENT_CLOSURE=0, DUPLICATE_INCIDENT_IDEMPOTENCY_BYPASS=0,
 * EXTERNAL_NOTIFICATION_AUTOMATICALLY_SENT=0, RAW_LOG_OR_PERSONAL_DATA_IN_INCIDENT_AUDIT=0,
 * INCIDENT_STATE/TIMELINE atomic (one timeline event per committed state change).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";

type Row = Record<string, unknown> & { id: string };
type Member = { id: string; userId: string; organizationId: string; role: string; status: string };

let payload: { sub: string; role: string; sid?: string } | null = null;
let members: Member[] = [];
let incidents: Row[] = [];
let events: Row[] = [];
let legalHolds: Row[] = [];
let txChain: Promise<unknown> = Promise.resolve();
const auditCalls: Array<Record<string, unknown>> = [];
const savedEnv = { ...process.env };

function match(where: Record<string, unknown>, r: Row): boolean {
  for (const [k, v] of Object.entries(where)) {
    const cell = r[k];
    if (v === null) { if (cell != null) return false; continue; }
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("in" in (v as object)) { if (!(v as { in: unknown[] }).in.includes(cell)) return false; continue; }
      return false;
    }
    if (cell !== v) return false;
  }
  return true;
}
function coll(store: () => Row[]) {
  return {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => store().find((r) => match(where, r)) ?? null,
    findMany: async ({ where = {}, take }: { where?: Record<string, unknown>; take?: number }) => {
      const rows = store().filter((r) => match(where, r));
      return typeof take === "number" ? rows.slice(0, take) : rows;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => { const row = { ...data } as Row; store().push(row); return row; },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const m = store().filter((r) => match(where, r)); m.forEach((r) => Object.assign(r, data)); return { count: m.length };
    },
  };
}
function makeDb() {
  const db: Record<string, unknown> = {
    organizationMember: {
      findMany: async ({ where = {} }: { where?: Record<string, unknown> }) => members.filter((m) => match(where as Record<string, unknown>, m as unknown as Row)),
    },
    complianceIncident:      coll(() => incidents),
    complianceIncidentEvent: coll(() => events),
  };
  db.$queryRawUnsafe = async (sql: string, ...vals: unknown[]) => {
    if (/MAX\("sequence"\)/i.test(sql)) {
      const [incId] = vals as [string];
      const max = events.filter((e) => e.complianceIncidentId === incId).reduce((m, e) => Math.max(m, Number(e.sequence)), 0);
      return [{ next: max + 1 }];
    }
    if (/"LegalHold"/i.test(sql)) {
      const [org, incId] = vals as [string, string];
      return legalHolds.some((h) => h.organizationId === org && h.status === "ACTIVE" && h.scopeType === "INCIDENT" && h.incidentId === incId) ? [{ one: 1 }] : [];
    }
    if (/"ComplianceIncident"[\s\S]*FOR UPDATE/i.test(sql)) {
      const [id, org] = vals as [string, string];
      return incidents.some((r) => r.id === id && r.organizationId === org) ? [{ id }] : [];
    }
    return [];
  };
  db.$transaction = (fn: (tx: unknown) => Promise<unknown>) => {
    const run = txChain.then(async () => {
      const s1 = incidents.map((r) => ({ ...r })), s2 = events.map((r) => ({ ...r }));
      try { return await fn(db); }
      catch (e) { incidents.splice(0, incidents.length, ...s1); events.splice(0, events.length, ...s2); throw e; }
    });
    txChain = run.then(() => undefined, () => undefined);
    return run;
  };
  return db;
}

const MOCKED = ["@/lib/auth/jwt", "@/lib/auth/session-store", "@/lib/db/prisma", "@/lib/audit/audit-service", "@/lib/logger/security-events"];
beforeEach(() => {
  vi.resetModules();
  payload = null; members = []; incidents = []; events = []; legalHolds = []; auditCalls.length = 0;
  txChain = Promise.resolve();
  vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => payload }));
  vi.doMock("@/lib/auth/session-store", () => ({ isPayloadSessionActive: async () => true }));
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => makeDb() }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async (e: Record<string, unknown>) => { auditCalls.push(e); },
    COMPLIANCE_AUDIT: {
      INCIDENT_CREATED: "compliance.incident.created", INCIDENT_UPDATED: "compliance.incident.updated",
      INCIDENT_TRANSITIONED: "compliance.incident.transitioned", INCIDENT_ASSESSMENT_RECORDED: "compliance.incident.assessment_recorded",
      INCIDENT_DECISION_RECORDED: "compliance.incident.decision_recorded", INCIDENT_BLOCKER_CHANGED: "compliance.incident.blocker_changed",
      INCIDENT_REOPENED: "compliance.incident.reopened",
    },
  }));
  vi.doMock("@/lib/logger/security-events", () => ({ logAuthFailure: () => {}, logAuthzDenial: () => {}, logInfraFailure: () => {} }));
});
afterEach(() => { for (const m of MOCKED) vi.doUnmock(m); vi.restoreAllMocks(); process.env = { ...savedEnv }; });

function req(path: string, method: string, body?: unknown, withToken = true) {
  return new NextRequest(`http://localhost/api/compliance${path}`, { method, headers: { ...(withToken ? { cookie: `${ACCESS_TOKEN_COOKIE}=fake` } : {}), "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
async function list(withToken = true) { const { GET } = await import("../route"); const r = await GET(req("/incidents", "GET", undefined, withToken)); return { res: r, json: await r.json() }; }
async function create(body: unknown) { const { POST } = await import("../route"); const r = await POST(req("/incidents", "POST", body)); return { res: r, json: await r.json() }; }
async function get(id: string) { const { GET } = await import("../[id]/route"); const r = await GET(req(`/incidents/${id}`, "GET"), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
async function patch(id: string, body: unknown) { const { PATCH } = await import("../[id]/route"); const r = await PATCH(req(`/incidents/${id}`, "PATCH", body), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
async function assess(id: string, body: unknown) { const { POST } = await import("../[id]/assessment/route"); const r = await POST(req(`/incidents/${id}/assessment`, "POST", body), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
async function blocker(id: string, body: unknown) { const { POST } = await import("../[id]/blocker/route"); const r = await POST(req(`/incidents/${id}/blocker`, "POST", body), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
async function timeline(id: string) { const { GET } = await import("../[id]/timeline/route"); const r = await GET(req(`/incidents/${id}/timeline`, "GET"), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }

function ownerA() { payload = { sub: "owner-A", role: "customer", sid: "s" }; members = [{ id: "m1", userId: "owner-A", organizationId: "org-A", role: "OWNER", status: "ACTIVE" }]; }
function adminA() { payload = { sub: "admin-A", role: "admin", sid: "s" }; members = [{ id: "m2", userId: "admin-A", organizationId: "org-A", role: "ADMIN", status: "ACTIVE" }]; }
function inc(over: Partial<Row> = {}): Row {
  return {
    id: "inc1", organizationId: "org-A", incidentType: "REVIEW_REQUIRED", severity: "REVIEW_REQUIRED", lifecycle: "OPEN",
    assessmentStatus: "REVIEW_REQUIRED", sourceClass: "REVIEW_REQUIRED", correlationId: null, detectedAt: new Date(), occurredAt: null,
    summaryCode: null, sensitiveSummary: null, idempotencyKey: "idem-1", processingActivityId: null, subprocessorId: null, dataTransferId: null,
    openBlockerCount: 0, ownerId: null, assignedToId: null, reviewedBy: null, reviewedAt: null, decisionBy: null, decisionAt: null,
    resolvedBy: null, resolvedAt: null, closedBy: null, closedAt: null, reopenedBy: null, reopenedAt: null,
    createdBy: null, updatedBy: null, createdAt: new Date(), updatedAt: new Date(), ...over,
  } as Row;
}
/** Drive an incident to a fully-closable RESOLVED state (owner, decided, no blockers). */
async function driveToResolvable() {
  ownerA();
  incidents = [inc({ lifecycle: "INVESTIGATING", ownerId: "owner-A", assessmentStatus: "IN_ASSESSMENT" })];
  expect((await assess("inc1", { assessmentStatus: "DECISION_RECORDED" })).res.status).toBe(200);
}

describe("auth + tenant isolation", () => {
  it("unauthenticated list is denied (401)", async () => { expect((await list(false)).res.status).toBe(401); });
  it("tenant A cannot read or mutate tenant B's incident (uniform 404); B is never listed", async () => {
    adminA();
    incidents = [inc({ id: "incB", organizationId: "org-B" })];
    expect((await get("incB")).res.status).toBe(404);
    expect((await patch("incB", { transition: "TRIAGED" })).res.status).toBe(404);
    expect((await assess("incB", { assessmentStatus: "IN_ASSESSMENT" })).res.status).toBe(404);
    expect(incidents[0].lifecycle).toBe("OPEN");
    expect((await list()).json.incidents).toHaveLength(0);
  });
});

describe("creation (server-derived scope, strict input, idempotent)", () => {
  it("creates a fail-closed OPEN incident scoped to the caller org + a CREATED timeline event", async () => {
    adminA();
    const r = await create({ incidentType: "EXPORT_FAILURE", severity: "HIGH", sourceClass: "MANUAL", idempotencyKey: "k1" });
    expect(r.res.status).toBe(201);
    expect(incidents[0].organizationId).toBe("org-A");
    expect(incidents[0].lifecycle).toBe("OPEN");
    expect(incidents[0].assessmentStatus).toBe("REVIEW_REQUIRED");
    expect(incidents[0].createdBy).toBe("admin-A");
    expect(events).toHaveLength(1);
    expect(events[0].eventCode).toBe("CREATED");
    expect(events[0].sequence).toBe(1);
  });
  it("a duplicate idempotency key returns the existing incident unchanged (DUPLICATE_INCIDENT_IDEMPOTENCY_BYPASS=0)", async () => {
    adminA();
    const first = await create({ incidentType: "SECURITY", idempotencyKey: "dup" });
    expect(first.res.status).toBe(201);
    const second = await create({ incidentType: "PRIVACY", idempotencyKey: "dup" }); // different classification, same key
    expect(second.res.status).toBe(200);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].incidentType).toBe("SECURITY"); // unchanged
    expect(events.filter((e) => e.eventCode === "CREATED")).toHaveLength(1);
  });
  it("client-supplied organization / lifecycle / attribution / blocker keys are rejected (400)", async () => {
    adminA();
    for (const bad of [{ organizationId: "org-EVIL" }, { lifecycle: "CLOSED" }, { assessmentStatus: "DECISION_RECORDED" }, { resolvedBy: "me" }, { openBlockerCount: 0 }, { decisionBy: "me" }]) {
      expect((await create({ ...bad })).res.status).toBe(400);
    }
    expect(incidents).toHaveLength(0);
  });
});

describe("lifecycle transitions + closure gate", () => {
  it("manage transition appends a timeline event; an invalid transition is a closed 409", async () => {
    adminA(); incidents = [inc()];
    const r = await patch("inc1", { transition: "TRIAGED" });
    expect(r.res.status).toBe(200);
    expect(incidents[0].lifecycle).toBe("TRIAGED");
    expect(events.at(-1)!.eventCode).toBe("LIFECYCLE_TRANSITIONED");
    expect((await patch("inc1", { transition: "RESOLVED" })).json.code).toBe("INVALID_TRANSITION"); // TRIAGED→RESOLVED not allowed
  });
  it("resolution is blocked until the assessment is decided, ownership is set and blockers are cleared", async () => {
    ownerA();
    incidents = [inc({ lifecycle: "INVESTIGATING" })]; // no owner, assessment REVIEW_REQUIRED
    const blocked = await patch("inc1", { transition: "RESOLVED" });
    expect(blocked.res.status).toBe(409);
    expect(blocked.json.code).toBe("NOT_CLOSABLE");
    const reasons = (blocked.json.blockers as Array<{ reason: string }>).map((b) => b.reason);
    expect(reasons).toContain("ASSESSMENT_REQUIRED");
    expect(reasons).toContain("OWNERSHIP_REQUIRED");
    expect(incidents[0].lifecycle).toBe("INVESTIGATING");
  });
  it("a fully-decided, owned, unblocked incident resolves then closes (OWNER); ADMIN can never close", async () => {
    await driveToResolvable();
    expect((await patch("inc1", { transition: "RESOLVED" })).res.status).toBe(200);
    expect(incidents[0].lifecycle).toBe("RESOLVED");
    expect(incidents[0].resolvedBy).toBe("owner-A");
    // ADMIN cannot close.
    adminA();
    expect((await patch("inc1", { transition: "CLOSED" })).res.status).toBe(403);
    ownerA();
    const closed = await patch("inc1", { transition: "CLOSED" });
    expect(closed.res.status).toBe(200);
    expect(incidents[0].lifecycle).toBe("CLOSED");
    expect(incidents[0].closedBy).toBe("owner-A");
    expect(incidents[0].resolvedBy).toBe("owner-A"); // resolution evidence retained
  });
  it("an active LegalHold blocks closure (continued preservation)", async () => {
    await driveToResolvable();
    legalHolds = [{ id: "h1", organizationId: "org-A", status: "ACTIVE", scopeType: "INCIDENT", incidentId: "inc1" } as Row];
    const r = await patch("inc1", { transition: "RESOLVED" });
    expect(r.res.status).toBe(409);
    expect((r.json.blockers as Array<{ reason: string }>).some((b) => b.reason === "ACTIVE_LEGAL_HOLD")).toBe(true);
  });
  it("an unresolved blocker prevents resolution until cleared", async () => {
    await driveToResolvable();
    expect((await blocker("inc1", { action: "RAISE" })).res.status).toBe(200);
    expect(incidents[0].openBlockerCount).toBe(1);
    expect((await patch("inc1", { transition: "RESOLVED" })).json.code).toBe("NOT_CLOSABLE");
    expect((await blocker("inc1", { action: "CLEAR" })).res.status).toBe(200);
    expect(incidents[0].openBlockerCount).toBe(0);
    expect((await patch("inc1", { transition: "RESOLVED" })).res.status).toBe(200);
  });
  it("reopen (OWNER) clears resolution/closure evidence and stamps reopen attribution", async () => {
    await driveToResolvable();
    await patch("inc1", { transition: "RESOLVED" });
    await patch("inc1", { transition: "CLOSED" });
    const reopened = await patch("inc1", { transition: "INVESTIGATING" });
    expect(reopened.res.status).toBe(200);
    expect(incidents[0].lifecycle).toBe("INVESTIGATING");
    expect(incidents[0].closedBy ?? null).toBeNull();
    expect(incidents[0].resolvedBy ?? null).toBeNull();
    expect(incidents[0].reopenedBy).toBe("owner-A");
    expect(events.at(-1)!.eventCode).toBe("REOPENED");
  });
});

describe("assessment + high-authority decisions", () => {
  it("assessment progression is manage-level; recording a DECISION is OWNER-only", async () => {
    adminA();
    incidents = [inc({ lifecycle: "INVESTIGATING" })];
    // ADMIN may progress the assessment...
    expect((await assess("inc1", { assessmentStatus: "IN_ASSESSMENT" })).res.status).toBe(200);
    expect(incidents[0].assessmentStatus).toBe("IN_ASSESSMENT");
    // ...but may NOT record a decision.
    expect((await assess("inc1", { assessmentStatus: "DECISION_RECORDED" })).res.status).toBe(403);
    expect(incidents[0].assessmentStatus).toBe("IN_ASSESSMENT");
    // OWNER records the decision (evidence only — nothing is sent).
    ownerA();
    const d = await assess("inc1", { assessmentStatus: "DECISION_RECORDED", evidenceHash: "a".repeat(64) });
    expect(d.res.status).toBe(200);
    expect(incidents[0].assessmentStatus).toBe("DECISION_RECORDED");
    expect(incidents[0].decisionBy).toBe("owner-A");
    expect(events.at(-1)!.eventCode).toBe("DECISION_RECORDED");
    expect(events.at(-1)!.evidenceHash).toBe("a".repeat(64));
    // An out-of-order assessment is a closed 409.
    expect((await assess("inc1", { assessmentStatus: "REVIEW_REQUIRED" })).json.code).toBe("INVALID_ASSESSMENT");
  });
});

describe("timeline (append-only) + immutability of frozen states", () => {
  it("every committed change appends exactly one monotonic timeline event", async () => {
    adminA(); incidents = [inc()];
    await patch("inc1", { transition: "TRIAGED" });
    await patch("inc1", { transition: "INVESTIGATING" });
    await assess("inc1", { assessmentStatus: "IN_ASSESSMENT" });
    const t = await timeline("inc1");
    const seqs = (t.json.timeline as Array<{ sequence: number }>).map((e) => e.sequence);
    expect(seqs).toEqual([1, 2, 3]); // note: inc() seeded WITHOUT the CREATED event, so this incident's appends start at 1
  });
  it("material update is rejected once RESOLVED (frozen except via reopen)", async () => {
    await driveToResolvable();
    await patch("inc1", { transition: "RESOLVED" });
    const upd = await patch("inc1", { update: { severity: "CRITICAL" } });
    expect(upd.res.status).toBe(409);
    expect(upd.json.code).toBe("IMMUTABLE_LIFECYCLE");
  });
});

describe("audit hygiene (RAW_LOG_OR_PERSONAL_DATA_IN_INCIDENT_AUDIT=0)", () => {
  it("audit metadata never contains the sensitive summary or free text — codes + ids only", async () => {
    adminA();
    await create({ incidentType: "PRIVACY", sensitiveSummary: "Employee SSN 123-45-6789 leaked via email", idempotencyKey: "k9" });
    await patch("inc1", { update: { sensitiveSummary: "another sensitive note" } }).catch(() => undefined);
    const s = JSON.stringify(auditCalls);
    expect(s).not.toContain("123-45-6789");
    expect(s).not.toContain("sensitive note");
    expect(s).not.toContain("Employee SSN");
  });
});
