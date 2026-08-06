/**
 * SECURITY (Phase 97 incidents, evidence-integrity) — incident routes over a synthetic
 * Prisma. Invariants: CROSS_TENANT_INCIDENT_READ/MUTATION=0, CLIENT_SUPPLIED_INCIDENT_
 * ATTRIBUTION=0, ARBITRARY/FOREIGN/INACTIVE_INCIDENT_OWNER=0, DECISION_WITHOUT_EVIDENCE=0,
 * REASSESSMENT/REOPEN decision invalidation, REOPENED_INCIDENT_IMMEDIATE_RESOLUTION=0,
 * NONEXISTENT/DOUBLE/FOREIGN_TENANT blocker clears fail, OPEN_ACTION_CLOSURE=0,
 * EXTERNAL_NOTIFICATION_AUTOMATICALLY_SENT=0, RAW_LOG_OR_PERSONAL_DATA_IN_INCIDENT_AUDIT=0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";

type Row = Record<string, unknown> & { id: string };
type Member = { id: string; userId: string; organizationId: string; role: string; status: string };
const HASH = "a".repeat(64);

let payload: { sub: string; role: string; sid?: string } | null = null;
let members: Member[] = [];
let incidents: Row[] = [];
let events: Row[] = [];
let actions: Row[] = [];
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
    complianceIncident:       coll(() => incidents),
    complianceIncidentEvent:  coll(() => events),
    complianceIncidentAction: coll(() => actions),
  };
  db.$queryRawUnsafe = async (sql: string, ...vals: unknown[]) => {
    if (/MAX\("sequence"\)/i.test(sql)) {
      const [incId] = vals as [string];
      const max = events.filter((e) => e.complianceIncidentId === incId).reduce((m, e) => Math.max(m, Number(e.sequence)), 0);
      return [{ next: max + 1 }];
    }
    if (/count\(\*\)[\s\S]*"ComplianceIncidentAction"/i.test(sql)) {
      const [org, incId] = vals as [string, string];
      return [{ c: actions.filter((a) => a.organizationId === org && a.complianceIncidentId === incId && a.status === "OPEN").length }];
    }
    if (/"OrganizationMember"[\s\S]*FOR SHARE/i.test(sql)) {
      const [org, userId] = vals as [string, string];
      const m = members.find((x) => x.organizationId === org && x.userId === userId);
      return m ? [{ status: m.status }] : [];
    }
    if (/"LegalHold"[\s\S]*FOR SHARE/i.test(sql)) {
      const [org, incId] = vals as [string, string];
      return legalHolds.filter((h) => h.organizationId === org && h.scopeType === "INCIDENT" && h.incidentId === incId).map((h) => ({ status: h.status }));
    }
    if (/"ComplianceIncidentAction"[\s\S]*FOR UPDATE/i.test(sql)) {
      const [id, org] = vals as [string, string];
      const a = actions.find((x) => x.id === id && x.organizationId === org);
      return a ? [{ id: a.id, status: a.status, priority: a.priority }] : [];
    }
    if (/"ComplianceIncident"[\s\S]*FOR UPDATE/i.test(sql)) {
      const [id, org] = vals as [string, string];
      const inc = incidents.find((r) => r.id === id && r.organizationId === org);
      if (!inc) return [];
      return /"lifecycle"/.test(sql) ? [{ lifecycle: inc.lifecycle }] : [{ id: inc.id }];
    }
    return [];
  };
  db.$transaction = (fn: (tx: unknown) => Promise<unknown>) => {
    const run = txChain.then(async () => {
      const s1 = incidents.map((r) => ({ ...r })), s2 = events.map((r) => ({ ...r })), s3 = actions.map((r) => ({ ...r }));
      try { return await fn(db); }
      catch (e) { incidents.splice(0, incidents.length, ...s1); events.splice(0, events.length, ...s2); actions.splice(0, actions.length, ...s3); throw e; }
    });
    txChain = run.then(() => undefined, () => undefined);
    return run;
  };
  return db;
}

const MOCKED = ["@/lib/auth/jwt", "@/lib/auth/session-store", "@/lib/db/prisma", "@/lib/audit/audit-service", "@/lib/logger/security-events"];
beforeEach(() => {
  vi.resetModules();
  payload = null; members = []; incidents = []; events = []; actions = []; legalHolds = []; auditCalls.length = 0;
  txChain = Promise.resolve();
  vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => payload }));
  vi.doMock("@/lib/auth/session-store", () => ({ isPayloadSessionActive: async () => true }));
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => makeDb() }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async (e: Record<string, unknown>) => { auditCalls.push(e); },
    COMPLIANCE_AUDIT: {
      INCIDENT_CREATED: "c.created", INCIDENT_UPDATED: "c.updated", INCIDENT_TRANSITIONED: "c.transitioned",
      INCIDENT_ASSIGNED: "c.assigned", INCIDENT_ASSESSMENT_RECORDED: "c.assessed", INCIDENT_DECISION_RECORDED: "c.decided",
      INCIDENT_REOPENED: "c.reopened", INCIDENT_ACTION_CREATED: "c.action_created", INCIDENT_ACTION_RESOLVED: "c.action_resolved",
      INCIDENT_ACTION_CANCELLED: "c.action_cancelled",
    },
  }));
  vi.doMock("@/lib/logger/security-events", () => ({ logAuthFailure: () => {}, logAuthzDenial: () => {}, logInfraFailure: () => {} }));
});
afterEach(() => { for (const m of MOCKED) vi.doUnmock(m); vi.restoreAllMocks(); process.env = { ...savedEnv }; });

function req(path: string, method: string, body?: unknown, withToken = true) {
  return new NextRequest(`http://localhost/api/compliance${path}`, { method, headers: { ...(withToken ? { cookie: `${ACCESS_TOKEN_COOKIE}=fake` } : {}), "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
async function create(body: unknown) { const { POST } = await import("../route"); const r = await POST(req("/incidents", "POST", body)); return { res: r, json: await r.json() }; }
async function get(id: string) { const { GET } = await import("../[id]/route"); const r = await GET(req(`/incidents/${id}`, "GET"), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
async function patch(id: string, body: unknown) { const { PATCH } = await import("../[id]/route"); const r = await PATCH(req(`/incidents/${id}`, "PATCH", body), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
async function assign(id: string, body: unknown) { const { POST } = await import("../[id]/assignment/route"); const r = await POST(req(`/incidents/${id}/assignment`, "POST", body), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
async function assess(id: string, body: unknown) { const { POST } = await import("../[id]/assessment/route"); const r = await POST(req(`/incidents/${id}/assessment`, "POST", body), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
async function createAction(id: string, body: unknown) { const { POST } = await import("../[id]/actions/route"); const r = await POST(req(`/incidents/${id}/actions`, "POST", body), { params: Promise.resolve({ id }) }); return { res: r, json: await r.json() }; }
async function terminateAction(id: string, actionId: string, body: unknown) { const { POST } = await import("../[id]/actions/[actionId]/route"); const r = await POST(req(`/incidents/${id}/actions/${actionId}`, "POST", body), { params: Promise.resolve({ id, actionId }) }); return { res: r, json: await r.json() }; }

function upsertMember(userId: string, organizationId: string, role: string, status = "ACTIVE") {
  const existing = members.find((m) => m.userId === userId && m.organizationId === organizationId);
  if (existing) { existing.status = status; existing.role = role; }
  else members.push({ id: `mem-${userId}-${organizationId}`, userId, organizationId, role, status });
}
// Role helpers are ADDITIVE (never wipe assigned members), so switching the acting
// role does not erase the incident's assigned owner membership.
function ownerA() { payload = { sub: "owner-A", role: "customer", sid: "s" }; upsertMember("owner-A", "org-A", "OWNER"); }
function adminA() { payload = { sub: "admin-A", role: "admin", sid: "s" }; upsertMember("admin-A", "org-A", "ADMIN"); }
function addMember(userId: string, organizationId: string, status = "ACTIVE") { upsertMember(userId, organizationId, "ENGINEER", status); }
function inc(over: Partial<Row> = {}): Row {
  return {
    id: "inc1", organizationId: "org-A", incidentType: "REVIEW_REQUIRED", severity: "REVIEW_REQUIRED", lifecycle: "OPEN",
    assessmentStatus: "REVIEW_REQUIRED", sourceClass: "REVIEW_REQUIRED", correlationId: null, detectedAt: new Date(), occurredAt: null,
    summaryCode: null, sensitiveSummary: null, idempotencyKey: "idem-1", processingActivityId: null, subprocessorId: null, dataTransferId: null,
    openBlockerCount: 0, ownerId: null, assignedToId: null, reviewedBy: null, reviewedAt: null,
    decisionBy: null, decisionAt: null, decisionEvidenceHash: null, decisionVersion: 0, decisionAssessmentStatus: null,
    resolvedBy: null, resolvedAt: null, closedBy: null, closedAt: null, reopenedBy: null, reopenedAt: null,
    createdBy: null, updatedBy: null, createdAt: new Date(), updatedAt: new Date(), ...over,
  } as Row;
}
/** Drive an incident (owner-A acting) to a fully-closable RESOLVED-ready state. */
async function driveToResolvable() {
  ownerA(); addMember("mem-A", "org-A");
  incidents = [inc({ lifecycle: "INVESTIGATING" })];
  expect((await assign("inc1", { ownerId: "mem-A" })).res.status).toBe(200);
  expect((await assess("inc1", { assessmentStatus: "IN_ASSESSMENT" })).res.status).toBe(200);
  expect((await assess("inc1", { assessmentStatus: "DECISION_RECORDED", evidenceHash: HASH })).res.status).toBe(200);
}

describe("auth + tenant isolation", () => {
  it("tenant A cannot read/mutate tenant B's incident (uniform 404)", async () => {
    adminA();
    incidents = [inc({ id: "incB", organizationId: "org-B" })];
    expect((await get("incB")).res.status).toBe(404);
    expect((await patch("incB", { transition: "TRIAGED" })).res.status).toBe(404);
    expect((await assign("incB", { ownerId: "x" })).res.status).toBe(404);
  });
});

describe("creation cannot set scope / attribution / ownership", () => {
  it("client-supplied org / lifecycle / attribution / ownership keys are rejected (400)", async () => {
    adminA();
    for (const bad of [{ organizationId: "org-EVIL" }, { lifecycle: "CLOSED" }, { assessmentStatus: "DECISION_RECORDED" },
      { ownerId: "me" }, { assignedToId: "me" }, { openBlockerCount: 0 }, { decisionBy: "me" }, { decisionEvidenceHash: HASH }, { decisionVersion: 3 }]) {
      expect((await create({ ...bad })).res.status).toBe(400);
    }
    expect(incidents).toHaveLength(0);
    // A material update also cannot assign an owner.
    incidents = [inc({ lifecycle: "INVESTIGATING" })];
    expect((await patch("inc1", { update: { ownerId: "me" } })).res.status).toBe(400);
    expect(incidents[0].ownerId ?? null).toBeNull();
  });
});

describe("membership-bound ownership assignment", () => {
  it("assigns an ACTIVE same-org member + appends OWNERSHIP_ASSIGNED; rejects arbitrary/foreign/inactive", async () => {
    ownerA(); addMember("mem-A", "org-A"); addMember("mem-susp", "org-A", "SUSPENDED"); addMember("mem-B", "org-B");
    incidents = [inc({ lifecycle: "INVESTIGATING" })];
    // Arbitrary (non-member) owner → 422.
    expect((await assign("inc1", { ownerId: "ghost" })).res.status).toBe(422);
    // Foreign-tenant member → 422 (membership resolved by (org, userId)).
    expect((await assign("inc1", { ownerId: "mem-B" })).res.status).toBe(422);
    // Inactive member → 422.
    expect((await assign("inc1", { ownerId: "mem-susp" })).res.status).toBe(422);
    expect(incidents[0].ownerId ?? null).toBeNull();
    // Valid ACTIVE member → 200.
    const ok = await assign("inc1", { ownerId: "mem-A" });
    expect(ok.res.status).toBe(200);
    expect(incidents[0].ownerId).toBe("mem-A");
    expect(events.at(-1)!.eventCode).toBe("OWNERSHIP_ASSIGNED");
    expect(events.at(-1)!.actorId).toBe("owner-A");
    expect(events.at(-1)!.actorClass).toBe("ORGANIZATION_MEMBER");
  });
});

describe("decision evidence integrity", () => {
  it("entering a decision state requires a valid evidence hash; malformed is rejected", async () => {
    ownerA(); incidents = [inc({ lifecycle: "INVESTIGATING", assessmentStatus: "IN_ASSESSMENT" })];
    // Missing evidence → DECISION_EVIDENCE_REQUIRED.
    const noEv = await assess("inc1", { assessmentStatus: "DECISION_RECORDED" });
    expect(noEv.res.status).toBe(400);
    expect(noEv.json.code).toBe("DECISION_EVIDENCE_REQUIRED");
    // Malformed hash → schema 400.
    expect((await assess("inc1", { assessmentStatus: "DECISION_RECORDED", evidenceHash: "xyz" })).res.status).toBe(400);
    // Valid hash → recorded with version 1 and a bound DECISION_RECORDED event.
    const ok = await assess("inc1", { assessmentStatus: "DECISION_RECORDED", evidenceHash: HASH });
    expect(ok.res.status).toBe(200);
    expect(incidents[0].decisionEvidenceHash).toBe(HASH);
    expect(incidents[0].decisionVersion).toBe(1);
    const ev = events.at(-1)!;
    expect(ev.eventCode).toBe("DECISION_RECORDED");
    expect(ev.evidenceHash).toBe(HASH);
    expect(ev.decisionVersion).toBe(1);
    expect(ev.decisionOutcome).toBe("RECORDED");
    // ADMIN can never record a decision.
    adminA(); incidents[0].assessmentStatus = "IN_ASSESSMENT";
    expect((await assess("inc1", { assessmentStatus: "DECISION_RECORDED", evidenceHash: HASH })).res.status).toBe(403);
  });
  it("reassessment clears current decision evidence (event INVALIDATED)", async () => {
    ownerA();
    incidents = [inc({ lifecycle: "INVESTIGATING", assessmentStatus: "DECISION_RECORDED", decisionEvidenceHash: HASH, decisionVersion: 1, decisionBy: "owner-A", decisionAt: new Date() })];
    const r = await assess("inc1", { assessmentStatus: "IN_ASSESSMENT" });
    expect(r.res.status).toBe(200);
    expect(incidents[0].decisionEvidenceHash ?? null).toBeNull();
    expect(incidents[0].decisionVersion).toBe(1); // preserved as lineage
    expect(events.at(-1)!.decisionOutcome).toBe("INVALIDATED");
  });
});

describe("closure gate + reopen invalidation", () => {
  it("a fully-decided, owned, unblocked incident resolves then closes (OWNER); ADMIN can never close", async () => {
    await driveToResolvable();
    expect((await patch("inc1", { transition: "RESOLVED" })).res.status).toBe(200);
    adminA();
    expect((await patch("inc1", { transition: "CLOSED" })).res.status).toBe(403);
    ownerA();
    expect((await patch("inc1", { transition: "CLOSED" })).res.status).toBe(200);
    expect(incidents[0].lifecycle).toBe("CLOSED");
  });
  it("an open action blocks closure until resolved (authoritative, not a cache)", async () => {
    await driveToResolvable();
    const a = await createAction("inc1", { priority: "HIGH", actionCode: "CONTAINMENT_REQUIRED" });
    expect(a.res.status).toBe(201);
    expect(incidents[0].openBlockerCount).toBe(1);
    expect((await patch("inc1", { transition: "RESOLVED" })).json.code).toBe("NOT_CLOSABLE");
    // A HIGH action needs an evidence hash to resolve.
    const actionId = a.json.action.id as string;
    expect((await terminateAction("inc1", actionId, { operation: "RESOLVE" })).json.code).toBe("ACTION_EVIDENCE_REQUIRED");
    expect((await terminateAction("inc1", actionId, { operation: "RESOLVE", evidenceHash: HASH })).res.status).toBe(200);
    expect(incidents[0].openBlockerCount).toBe(0);
    expect((await patch("inc1", { transition: "RESOLVED" })).res.status).toBe(200);
  });
  it("resolving a nonexistent / already-resolved / foreign action is uniformly not-found", async () => {
    await driveToResolvable();
    const a = await createAction("inc1", { priority: "LOW", actionCode: "FOLLOW_UP_REQUIRED" });
    const actionId = a.json.action.id as string;
    expect((await terminateAction("inc1", "does-not-exist", { operation: "RESOLVE" })).res.status).toBe(404); // nonexistent
    expect((await terminateAction("inc1", actionId, { operation: "RESOLVE" })).res.status).toBe(200);
    expect((await terminateAction("inc1", actionId, { operation: "RESOLVE" })).res.status).toBe(404); // double
    // Foreign-tenant action.
    actions.push({ id: "actB", organizationId: "org-B", complianceIncidentId: "incB", priority: "LOW", status: "OPEN", actionCode: "OTHER_REVIEW_REQUIRED" } as Row);
    expect((await terminateAction("inc1", "actB", { operation: "RESOLVE" })).res.status).toBe(404);
  });
  it("reopen invalidates the decision; a reopened incident cannot immediately resolve", async () => {
    await driveToResolvable();
    await patch("inc1", { transition: "RESOLVED" });
    await patch("inc1", { transition: "CLOSED" });
    const reopened = await patch("inc1", { transition: "INVESTIGATING" });
    expect(reopened.res.status).toBe(200);
    expect(incidents[0].lifecycle).toBe("INVESTIGATING");
    expect(incidents[0].assessmentStatus).toBe("IN_ASSESSMENT");
    expect(incidents[0].decisionEvidenceHash ?? null).toBeNull();
    expect(incidents[0].reopenedBy).toBe("owner-A");
    expect(events.at(-1)!.eventCode).toBe("REOPENED");
    expect(events.at(-1)!.decisionOutcome).toBe("INVALIDATED");
    // Cannot resolve until a completely new decision is recorded.
    const blocked = await patch("inc1", { transition: "RESOLVED" });
    expect(blocked.json.code).toBe("NOT_CLOSABLE");
    // A fresh decision gets the next monotonic version.
    await assess("inc1", { assessmentStatus: "DECISION_RECORDED", evidenceHash: HASH });
    expect(incidents[0].decisionVersion).toBe(2);
    expect((await patch("inc1", { transition: "RESOLVED" })).res.status).toBe(200);
  });
});

describe("audit hygiene (RAW_LOG_OR_PERSONAL_DATA_IN_INCIDENT_AUDIT=0)", () => {
  it("audit metadata never contains the sensitive summary — codes + ids only", async () => {
    adminA();
    await create({ incidentType: "PRIVACY", sensitiveSummary: "Employee SSN 123-45-6789 leaked", idempotencyKey: "k9" });
    await patch("inc1", { update: { sensitiveSummary: "another sensitive note" } });
    const s = JSON.stringify(auditCalls);
    expect(s).not.toContain("123-45-6789");
    expect(s).not.toContain("sensitive note");
  });
});
