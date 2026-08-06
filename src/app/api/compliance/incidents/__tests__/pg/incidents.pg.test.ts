import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import {
  createIncidentForOrg, transitionIncidentForOrg, recordAssessmentForOrg, assignIncidentOwnerForOrg,
  createIncidentActionForOrg, resolveIncidentActionForOrg, cancelIncidentActionForOrg,
  applyIncidentScopedHoldTransition, getIncidentForOrg,
} from "@/lib/compliance/incident-db";

/**
 * Phase 97 — compliance-incident evidence & closure integrity REAL-PostgreSQL
 * rehearsal. Proves against the actual DB + the ACTUAL persistence functions: the
 * tenant-bound non-cascading timeline (append-only UPDATE+DELETE, no hard-delete of an
 * incident with evidence, mandatory actor, org binding); membership-bound ownership;
 * decision evidence + versioning + reopen invalidation; authoritative actions +
 * cache reconciliation; and Incident↔LegalHold closure linearisation across
 * independent pooled connections with deterministic barriers.
 */
const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;
const TAG = "pginc97e";
const ORG = `${TAG}-orgA`, ORG_B = `${TAG}-orgB`;
const U1 = `${TAG}-u1`, U2 = `${TAG}-u2`, UB = `${TAG}-ub`, US = `${TAG}-us`;
const HASH = "a".repeat(64), HASH2 = "b".repeat(64);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Tx = { $executeRawUnsafe: (s: string, ...a: unknown[]) => Promise<number>; $queryRawUnsafe: <T = unknown>(s: string, ...a: unknown[]) => Promise<T>; $transaction: <T>(fn: (tx: Tx) => Promise<T>, o?: { timeout?: number; maxWait?: number }) => Promise<T> };
async function db(): Promise<Tx> { const p = await getPrisma(); if (!p) throw new Error("PG rehearsal requires a real Prisma client"); return p as unknown as Tx; }

async function clearIncidentData() {
  const p = await db();
  // Events reference actions (actionId FK) and incidents, so delete events FIRST
  // (trigger disabled to allow the delete), then actions, holds, incidents.
  await p.$executeRawUnsafe(`ALTER TABLE "ComplianceIncidentEvent" DISABLE TRIGGER USER`);
  await p.$executeRawUnsafe(`DELETE FROM "ComplianceIncidentEvent" WHERE "organizationId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "ComplianceIncidentAction" WHERE "organizationId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "LegalHold" WHERE "organizationId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "ComplianceIncident" WHERE "organizationId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`ALTER TABLE "ComplianceIncidentEvent" ENABLE TRIGGER USER`);
}
async function cleanup() {
  await clearIncidentData();
  const p = await db();
  await p.$executeRawUnsafe(`DELETE FROM "OrganizationMember" WHERE "organizationId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "ProcessingActivity" WHERE id LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "User" WHERE id LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "Organization" WHERE id LIKE '${TAG}%'`);
}

async function insIncident(id: string, opts: { org?: string; lifecycle?: string; assessment?: string; owner?: string | null; version?: number } = {}) {
  const p = await db();
  const org = opts.org ?? ORG;
  const lifecycle = opts.lifecycle ?? "OPEN";
  const assessment = opts.assessment ?? "REVIEW_REQUIRED";
  const decided = assessment === "DECISION_RECORDED" || assessment === "NO_EXTERNAL_NOTIFICATION_DECISION";
  const resolvedish = lifecycle === "RESOLVED" || lifecycle === "CLOSED";
  const owner = opts.owner === undefined ? (org === ORG_B ? UB : U1) : opts.owner;
  await p.$executeRawUnsafe(
    `INSERT INTO "ComplianceIncident"
      (id,"organizationId","incidentType",severity,lifecycle,"assessmentStatus","sourceClass","idempotencyKey","openBlockerCount","ownerId",
       "decisionBy","decisionAt","decisionEvidenceHash","decisionVersion","resolvedBy","resolvedAt","closedBy","closedAt","updatedAt")
     VALUES ($1,$2,'SECURITY','HIGH',$3,$4,'MANUAL',$5,0,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())`,
    id, org, lifecycle, assessment, id, owner,
    decided ? "dec" : null, decided ? new Date() : null, decided ? HASH : null, decided ? (opts.version ?? 1) : 0,
    resolvedish ? "res" : null, resolvedish ? new Date() : null,
    lifecycle === "CLOSED" ? "clo" : null, lifecycle === "CLOSED" ? new Date() : null,
  );
}
async function insHold(id: string, incidentId: string, status = "PROPOSED", org = ORG) {
  const p = await db();
  await p.$executeRawUnsafe(
    `INSERT INTO "LegalHold" (id,"organizationId",name,"scopeType","incidentId",status,"approvedBy","approvedAt","updatedAt")
     VALUES ($1,$2,'H','INCIDENT',$3,$4,$5,$6,now())`,
    id, org, incidentId, status, status === "ACTIVE" ? "a" : null, status === "ACTIVE" ? new Date() : null);
}
async function field(id: string, col: string): Promise<unknown> {
  const p = await db();
  const r = await p.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT "${col}" AS v FROM "ComplianceIncident" WHERE id=$1`, id);
  return r[0]?.v ?? null;
}
async function eventCount(id: string): Promise<number> {
  const p = await db();
  const r = await p.$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM "ComplianceIncidentEvent" WHERE "complianceIncidentId"=$1`, id);
  return r[0].c;
}
async function holdStatus(id: string): Promise<string> {
  const p = await db();
  const r = await p.$queryRawUnsafe<{ status: string }[]>(`SELECT status FROM "LegalHold" WHERE id=$1`, id);
  return r[0]?.status ?? "MISSING";
}
const reasons = (r: { blockers?: Array<{ reason: string }> }) => (r.blockers ?? []).map((b) => b.reason);
async function driveResolvable(id: string) {
  await insIncident(id, { lifecycle: "INVESTIGATING", assessment: "DECISION_RECORDED" });
}

it("integration database is configured (guards against a silent all-skip pass)", () => { expect(PG_ENABLED).toBe(true); });

describe.skipIf(!PG_ENABLED)("Phase 97 — incident evidence integrity (real PG)", () => {
  beforeAll(async () => {
    await cleanup();
    const p = await db();
    for (const org of [ORG, ORG_B]) await p.$executeRawUnsafe(`INSERT INTO "Organization" (id,name,slug,settings,"createdAt","updatedAt") VALUES ($1,'O',$2,'{}'::jsonb,now(),now())`, org, `${org}-slug`);
    for (const [u, e] of [[U1, "u1"], [U2, "u2"], [UB, "ub"], [US, "us"]]) await p.$executeRawUnsafe(`INSERT INTO "User" (id,name,email,"passwordHash","updatedAt") VALUES ($1,'U',$2,'x',now())`, u, `${e}-${TAG}@x.com`);
    const insMember = (u: string, org: string, status: string) => p.$executeRawUnsafe(`INSERT INTO "OrganizationMember" (id,"organizationId","userId",role,status,"updatedAt") VALUES ($1,$2,$3,'ENGINEER',$4,now())`, `${TAG}-m-${u}-${org}`, org, u, status);
    await insMember(U1, ORG, "ACTIVE"); await insMember(U2, ORG, "ACTIVE"); await insMember(UB, ORG_B, "ACTIVE"); await insMember(US, ORG, "SUSPENDED");
    await p.$executeRawUnsafe(`INSERT INTO "ProcessingActivity" (id,name,purpose,"legalBasis","organizationId","createdAt","updatedAt") VALUES ('${TAG}-paA','P','p','consent','${ORG}',now(),now())`);
    await p.$executeRawUnsafe(`INSERT INTO "ProcessingActivity" (id,name,purpose,"legalBasis","organizationId","createdAt","updatedAt") VALUES ('${TAG}-paB','P','p','consent','${ORG_B}',now(),now())`);
  });
  afterAll(cleanup);
  beforeEach(clearIncidentData);

  // ── Constraints, trigger, tenant-bound evidence ──────────────────────────────
  it("migration constraints, indexes and the strengthened append-only trigger exist", async () => {
    const p = await db();
    const mig = await p.$queryRawUnsafe<{ migration_name: string }[]>(`SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%incident_evidence_integrity%' AND finished_at IS NOT NULL`);
    expect(mig.length).toBeGreaterThanOrEqual(1);
    const con = await p.$queryRawUnsafe<{ conname: string }[]>(`SELECT conname FROM pg_constraint WHERE conname IN (
      'ComplianceIncidentEvent_incident_tuple_fkey','ComplianceIncidentEvent_organizationId_fkey','ComplianceIncidentEvent_action_tuple_fkey',
      'ComplianceIncident_owner_membership_fkey','ComplianceIncident_assignee_membership_fkey','LegalHold_incident_tuple_fkey',
      'ComplianceIncident_decision_evidence_check','ComplianceIncident_closure_decision_check','ComplianceIncident_decision_no_stale_check',
      'ComplianceIncidentAction_priority_check','ComplianceIncidentAction_status_check','ComplianceIncidentAction_terminal_attribution_check',
      'ComplianceIncidentAction_highprio_evidence_check','ComplianceIncidentEvent_action_consistency_check','ComplianceIncidentEvent_decision_consistency_check')`);
    expect(con.length).toBe(15);
    const trg = await p.$queryRawUnsafe<{ tgname: string }[]>(`SELECT tgname FROM pg_trigger WHERE tgname='compliance_incident_event_no_mutation'`);
    expect(trg.length).toBe(1);
  });

  it("the timeline is append-only (UPDATE and DELETE both rejected) and its parent incident cannot be hard-deleted", async () => {
    const r = await createIncidentForOrg({ organizationId: ORG, actorId: U1, idempotencyKey: `${TAG}-ap`, data: {}, now: new Date() });
    const id = r.ok ? r.row.id : "";
    const p = await db();
    await expect(p.$executeRawUnsafe(`UPDATE "ComplianceIncidentEvent" SET "eventCode"='UPDATED' WHERE "complianceIncidentId"=$1`, id)).rejects.toBeTruthy(); // INCIDENT_EVENT_UPDATE=0
    await expect(p.$executeRawUnsafe(`DELETE FROM "ComplianceIncidentEvent" WHERE "complianceIncidentId"=$1`, id)).rejects.toBeTruthy();           // INCIDENT_EVENT_DELETE=0
    await expect(p.$executeRawUnsafe(`DELETE FROM "ComplianceIncident" WHERE id=$1`, id)).rejects.toBeTruthy();                                     // INCIDENT_DELETE_WITH_TIMELINE=0
  });

  it("PG rejects a null-actor event, a parent-org mismatch, a bad decision, and a resolved action without attribution", async () => {
    await insIncident(`${TAG}-c`, { lifecycle: "INVESTIGATING" });
    const p = await db();
    // Event without actor (INCIDENT_EVENT_WITHOUT_ACTOR=0).
    await expect(p.$executeRawUnsafe(`INSERT INTO "ComplianceIncidentEvent" (id,"organizationId","complianceIncidentId",sequence,"eventCode","actorId","createdAt") VALUES ('${TAG}-e1','${ORG}','${TAG}-c',99,'UPDATED',NULL,now())`)).rejects.toBeTruthy();
    // Parent-org mismatch (INCIDENT_EVENT_ORGANIZATION_MISMATCH=0): event org ≠ incident org.
    await expect(p.$executeRawUnsafe(`INSERT INTO "ComplianceIncidentEvent" (id,"organizationId","complianceIncidentId",sequence,"eventCode","actorId","createdAt") VALUES ('${TAG}-e2','${ORG_B}','${TAG}-c',98,'UPDATED','x',now())`)).rejects.toBeTruthy();
    // Decision state without evidence (DECISION_WITHOUT_EVIDENCE=0).
    await expect(p.$executeRawUnsafe(`INSERT INTO "ComplianceIncident" (id,"organizationId","assessmentStatus","idempotencyKey","updatedAt") VALUES ('${TAG}-d','${ORG}','DECISION_RECORDED','${TAG}-kd',now())`)).rejects.toBeTruthy();
    // Resolved action without attribution.
    await expect(p.$executeRawUnsafe(`INSERT INTO "ComplianceIncidentAction" (id,"organizationId","complianceIncidentId",priority,status,"actionCode","updatedAt") VALUES ('${TAG}-a','${ORG}','${TAG}-c','LOW','RESOLVED','FOLLOW_UP_REQUIRED',now())`)).rejects.toBeTruthy();
  });

  it("composite FKs reject a foreign-tenant owner, reference and incident hold", async () => {
    const p = await db();
    // Owner from another org (FOREIGN_TENANT_INCIDENT_OWNER=0).
    await expect(insIncident(`${TAG}-fo`, { lifecycle: "OPEN", owner: UB })).rejects.toBeTruthy();
    // Arbitrary non-member owner (ARBITRARY_INCIDENT_OWNER_ACCEPTED=0).
    await expect(insIncident(`${TAG}-ao`, { lifecycle: "OPEN", owner: "ghost" })).rejects.toBeTruthy();
    // Foreign-tenant governed reference (CROSS_TENANT_INCIDENT_RELATION=0).
    const bad = await createIncidentForOrg({ organizationId: ORG, actorId: U1, idempotencyKey: `${TAG}-fr`, data: { processingActivityId: `${TAG}-paB` }, now: new Date() });
    expect(bad.ok).toBe(false);
    // Incident-scoped hold bound to a foreign-tenant incident id.
    await insIncident(`${TAG}-hi`, { lifecycle: "INVESTIGATING" });
    await expect(p.$executeRawUnsafe(`INSERT INTO "LegalHold" (id,"organizationId",name,"scopeType","incidentId",status,"updatedAt") VALUES ('${TAG}-hb','${ORG_B}','H','INCIDENT','${TAG}-hi','PROPOSED',now())`)).rejects.toBeTruthy();
  });

  // ── Ownership binding ────────────────────────────────────────────────────────
  it("assignment binds ownership to an ACTIVE same-org member; foreign / inactive / unknown rejected", async () => {
    await insIncident(`${TAG}-as`, { lifecycle: "INVESTIGATING", owner: null });
    expect((await assignIncidentOwnerForOrg({ id: `${TAG}-as`, organizationId: ORG, actorId: U1, ownerId: UB, now: new Date() })).ok).toBe(false);   // foreign
    expect((await assignIncidentOwnerForOrg({ id: `${TAG}-as`, organizationId: ORG, actorId: U1, ownerId: US, now: new Date() })).ok).toBe(false);   // inactive
    expect((await assignIncidentOwnerForOrg({ id: `${TAG}-as`, organizationId: ORG, actorId: U1, ownerId: "ghost", now: new Date() })).ok).toBe(false); // unknown
    expect((await assignIncidentOwnerForOrg({ id: `${TAG}-as`, organizationId: ORG, actorId: U1, ownerId: U2, now: new Date() })).ok).toBe(true);
    expect(await field(`${TAG}-as`, "ownerId")).toBe(U2);
  });

  it("BARRIER — assignment blocks on a held membership lock, then fails after the member is committed SUSPENDED", async () => {
    await insIncident(`${TAG}-ab`, { lifecycle: "INVESTIGATING", owner: null });
    const p = await db();
    let result: Awaited<ReturnType<typeof assignIncidentOwnerForOrg>> | null = null;
    let started: Promise<void> | null = null;
    await p.$transaction(async (txA) => {
      await txA.$queryRawUnsafe(`SELECT "id" FROM "OrganizationMember" WHERE "organizationId"=$1 AND "userId"=$2 FOR UPDATE`, ORG, U2);
      started = assignIncidentOwnerForOrg({ id: `${TAG}-ab`, organizationId: ORG, actorId: U1, ownerId: U2, now: new Date() }).then((r) => { result = r; });
      await sleep(700);
      expect(result).toBeNull();
      await txA.$executeRawUnsafe(`UPDATE "OrganizationMember" SET status='SUSPENDED', "updatedAt"=now() WHERE "organizationId"=$1 AND "userId"=$2`, ORG, U2);
    }, { timeout: 20000, maxWait: 20000 });
    await started;
    const res = result!;
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("INVALID_MEMBERSHIP");
    await p.$executeRawUnsafe(`UPDATE "OrganizationMember" SET status='ACTIVE', "updatedAt"=now() WHERE "organizationId"=$1 AND "userId"=$2`, ORG, U2); // restore
  });

  it("a now-inactive owner no longer satisfies closure (real transactional membership read)", async () => {
    await insIncident(`${TAG}-in`, { lifecycle: "INVESTIGATING", assessment: "DECISION_RECORDED", owner: US }); // owner US is SUSPENDED
    const r = await transitionIncidentForOrg({ id: `${TAG}-in`, organizationId: ORG, actorId: U1, from: "INVESTIGATING", to: "RESOLVED", action: "resolve", now: new Date() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(reasons(r)).toContain("OWNER_MEMBERSHIP_INACTIVE");
  });

  // ── Decision evidence + versioning + reopen ─────────────────────────────────
  it("decision recording binds hash + monotonic version to the incident AND the event; reopen invalidates", async () => {
    const c = await createIncidentForOrg({ organizationId: ORG, actorId: U1, idempotencyKey: `${TAG}-dv`, data: {}, now: new Date() });
    const id = c.ok ? c.row.id : "";
    await transitionIncidentForOrg({ id, organizationId: ORG, actorId: U1, from: "OPEN", to: "TRIAGED", action: "manage", now: new Date() });
    await transitionIncidentForOrg({ id, organizationId: ORG, actorId: U1, from: "TRIAGED", to: "INVESTIGATING", action: "manage", now: new Date() });
    await assignIncidentOwnerForOrg({ id, organizationId: ORG, actorId: U1, ownerId: U1, now: new Date() });
    await recordAssessmentForOrg({ id, organizationId: ORG, actorId: U1, to: "IN_ASSESSMENT", action: "assess", now: new Date() });
    // Decision without evidence is rejected.
    expect((await recordAssessmentForOrg({ id, organizationId: ORG, actorId: U1, to: "DECISION_RECORDED", action: "decide", evidenceHash: null, now: new Date() })).ok).toBe(false);
    await recordAssessmentForOrg({ id, organizationId: ORG, actorId: U1, to: "DECISION_RECORDED", action: "decide", evidenceHash: HASH, now: new Date() });
    expect(await field(id, "decisionEvidenceHash")).toBe(HASH);
    expect(await field(id, "decisionVersion")).toBe(1);
    const p = await db();
    const ev = await p.$queryRawUnsafe<{ evidenceHash: string; decisionVersion: number; decisionOutcome: string }[]>(`SELECT "evidenceHash","decisionVersion","decisionOutcome" FROM "ComplianceIncidentEvent" WHERE "complianceIncidentId"=$1 AND "eventCode"='DECISION_RECORDED' ORDER BY sequence DESC LIMIT 1`, id);
    expect(ev[0]).toMatchObject({ evidenceHash: HASH, decisionVersion: 1, decisionOutcome: "RECORDED" });
    // Resolve → close → reopen: decision invalidated, cannot immediately resolve.
    await transitionIncidentForOrg({ id, organizationId: ORG, actorId: U1, from: "INVESTIGATING", to: "RESOLVED", action: "resolve", now: new Date() });
    await transitionIncidentForOrg({ id, organizationId: ORG, actorId: U1, from: "RESOLVED", to: "CLOSED", action: "close", now: new Date() });
    await transitionIncidentForOrg({ id, organizationId: ORG, actorId: U1, from: "CLOSED", to: "INVESTIGATING", action: "reopen", now: new Date() });
    expect(await field(id, "decisionEvidenceHash")).toBeNull();
    expect(await field(id, "assessmentStatus")).toBe("IN_ASSESSMENT");
    expect(await field(id, "decisionVersion")).toBe(1); // preserved as lineage
    const blocked = await transitionIncidentForOrg({ id, organizationId: ORG, actorId: U1, from: "INVESTIGATING", to: "RESOLVED", action: "resolve", now: new Date() });
    expect(blocked.ok).toBe(false); // REOPEN_WITH_VALID_OLD_DECISION=0 / REOPENED_INCIDENT_IMMEDIATE_RESOLUTION=0
    await recordAssessmentForOrg({ id, organizationId: ORG, actorId: U1, to: "DECISION_RECORDED", action: "decide", evidenceHash: HASH2, now: new Date() });
    expect(await field(id, "decisionVersion")).toBe(2); // monotonic
  });

  // ── Authoritative actions + cache reconciliation ────────────────────────────
  it("actions are the authoritative blocker; the cache reconciles to the OPEN count", async () => {
    await driveResolvable(`${TAG}-ac`);
    const a1 = await createIncidentActionForOrg({ id: `${TAG}-ac`, organizationId: ORG, actorId: U1, priority: "CRITICAL", actionCode: "CONTAINMENT_REQUIRED", now: new Date() });
    await createIncidentActionForOrg({ id: `${TAG}-ac`, organizationId: ORG, actorId: U1, priority: "LOW", actionCode: "FOLLOW_UP_REQUIRED", now: new Date() });
    expect(await field(`${TAG}-ac`, "openBlockerCount")).toBe(2);
    expect((await transitionIncidentForOrg({ id: `${TAG}-ac`, organizationId: ORG, actorId: U1, from: "INVESTIGATING", to: "RESOLVED", action: "resolve", now: new Date() })).ok).toBe(false); // OPEN action blocks
    const actionId = a1.ok ? a1.row.id : "";
    expect((await resolveIncidentActionForOrg({ incidentId: `${TAG}-ac`, organizationId: ORG, actorId: U1, actionId, evidenceHash: null, now: new Date() })).ok).toBe(false); // CRITICAL needs evidence
    await resolveIncidentActionForOrg({ incidentId: `${TAG}-ac`, organizationId: ORG, actorId: U1, actionId, evidenceHash: HASH, now: new Date() });
    expect((await resolveIncidentActionForOrg({ incidentId: `${TAG}-ac`, organizationId: ORG, actorId: U1, actionId, now: new Date() })).ok).toBe(false); // double-resolution → not found
    expect(await field(`${TAG}-ac`, "openBlockerCount")).toBe(1);
    // Cancel the remaining LOW action, then resolve succeeds.
    const rows = await (await db()).$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "ComplianceIncidentAction" WHERE "complianceIncidentId"=$1 AND status='OPEN'`, `${TAG}-ac`);
    await cancelIncidentActionForOrg({ incidentId: `${TAG}-ac`, organizationId: ORG, actorId: U1, actionId: rows[0].id, now: new Date() });
    expect(await field(`${TAG}-ac`, "openBlockerCount")).toBe(0);
    expect((await transitionIncidentForOrg({ id: `${TAG}-ac`, organizationId: ORG, actorId: U1, from: "INVESTIGATING", to: "RESOLVED", action: "resolve", now: new Date() })).ok).toBe(true);
  });

  // ── Concurrency (independent connections) ───────────────────────────────────
  it("BARRIER — simultaneous lifecycle transitions linearise to exactly one", async () => {
    await insIncident(`${TAG}-lt`, { lifecycle: "OPEN" });
    const [a, b] = await Promise.all([
      transitionIncidentForOrg({ id: `${TAG}-lt`, organizationId: ORG, actorId: U1, from: "OPEN", to: "TRIAGED", action: "manage", now: new Date() }),
      transitionIncidentForOrg({ id: `${TAG}-lt`, organizationId: ORG, actorId: U2, from: "OPEN", to: "CANCELLED", action: "manage", now: new Date() }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await eventCount(`${TAG}-lt`)).toBe(1);
  });

  it("BARRIER — simultaneous decisions apply exactly one (no double version)", async () => {
    await insIncident(`${TAG}-2d`, { lifecycle: "INVESTIGATING", assessment: "IN_ASSESSMENT" });
    const [a, b] = await Promise.all([
      recordAssessmentForOrg({ id: `${TAG}-2d`, organizationId: ORG, actorId: U1, to: "DECISION_RECORDED", action: "decide", evidenceHash: HASH, now: new Date() }),
      recordAssessmentForOrg({ id: `${TAG}-2d`, organizationId: ORG, actorId: U2, to: "DECISION_RECORDED", action: "decide", evidenceHash: HASH2, now: new Date() }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await field(`${TAG}-2d`, "decisionVersion")).toBe(1);
  });

  it("BARRIER — decision racing reassessment never leaves RESOLVED-eligible with a cleared decision", async () => {
    for (let i = 0; i < 8; i++) {
      await clearIncidentData();
      await insIncident(`${TAG}-dr`, { lifecycle: "INVESTIGATING", assessment: "IN_ASSESSMENT" });
      await Promise.all([
        recordAssessmentForOrg({ id: `${TAG}-dr`, organizationId: ORG, actorId: U1, to: "DECISION_RECORDED", action: "decide", evidenceHash: HASH, now: new Date() }),
        recordAssessmentForOrg({ id: `${TAG}-dr`, organizationId: ORG, actorId: U2, to: "INSUFFICIENT_EVIDENCE", action: "assess", now: new Date() }),
      ]);
      const status = await field(`${TAG}-dr`, "assessmentStatus");
      const hash = await field(`${TAG}-dr`, "decisionEvidenceHash");
      if (status === "DECISION_RECORDED") expect(hash).toBe(HASH); else expect(hash).toBeNull();
    }
  });

  it("BARRIER — action creation racing closure never commits RESOLVED with an open action", async () => {
    for (let i = 0; i < 8; i++) {
      await clearIncidentData();
      await driveResolvable(`${TAG}-ax`);
      await Promise.all([
        createIncidentActionForOrg({ id: `${TAG}-ax`, organizationId: ORG, actorId: U1, priority: "LOW", actionCode: "FOLLOW_UP_REQUIRED", now: new Date() }),
        transitionIncidentForOrg({ id: `${TAG}-ax`, organizationId: ORG, actorId: U2, from: "INVESTIGATING", to: "RESOLVED", action: "resolve", now: new Date() }),
      ]);
      if ((await field(`${TAG}-ax`, "lifecycle")) === "RESOLVED") {
        const c = await (await db()).$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM "ComplianceIncidentAction" WHERE "complianceIncidentId"=$1 AND status='OPEN'`, `${TAG}-ax`);
        expect(c[0].c).toBe(0);
      }
    }
  });

  it("BARRIER — Legal hold activation racing closure never yields CLOSED/RESOLVED with an ACTIVE hold", async () => {
    for (let i = 0; i < 8; i++) {
      await clearIncidentData();
      await driveResolvable(`${TAG}-hz`);
      await insHold(`${TAG}-hzh`, `${TAG}-hz`, "PROPOSED");
      await Promise.all([
        applyIncidentScopedHoldTransition({ holdId: `${TAG}-hzh`, organizationId: ORG, incidentId: `${TAG}-hz`, fromStatus: "PROPOSED", toStatus: "ACTIVE", data: { status: "ACTIVE", approvedBy: "a", approvedAt: new Date() }, now: new Date() }),
        transitionIncidentForOrg({ id: `${TAG}-hz`, organizationId: ORG, actorId: U1, from: "INVESTIGATING", to: "RESOLVED", action: "resolve", now: new Date() }),
      ]);
      const lc = await field(`${TAG}-hz`, "lifecycle");
      const hs = await holdStatus(`${TAG}-hzh`);
      expect(!(["RESOLVED", "CLOSED"].includes(lc as string) && hs === "ACTIVE")).toBe(true);
    }
  });

  it("BARRIER — Legal hold release racing closure linearises to a valid outcome", async () => {
    for (let i = 0; i < 8; i++) {
      await clearIncidentData();
      await driveResolvable(`${TAG}-hr`);
      await insHold(`${TAG}-hrh`, `${TAG}-hr`, "ACTIVE");
      await Promise.all([
        applyIncidentScopedHoldTransition({ holdId: `${TAG}-hrh`, organizationId: ORG, incidentId: `${TAG}-hr`, fromStatus: "ACTIVE", toStatus: "RELEASED", data: { status: "RELEASED", releaseApprovedBy: "a", releasedAt: new Date() }, now: new Date() }),
        transitionIncidentForOrg({ id: `${TAG}-hr`, organizationId: ORG, actorId: U1, from: "INVESTIGATING", to: "RESOLVED", action: "resolve", now: new Date() }),
      ]);
      const lc = await field(`${TAG}-hr`, "lifecycle");
      const hs = await holdStatus(`${TAG}-hrh`);
      expect(!(lc === "RESOLVED" && hs === "ACTIVE")).toBe(true); // NOT(CLOSED/RESOLVED AND ACTIVE)
    }
  });

  it("a blocked transition changes neither the incident nor the timeline (atomic rollback)", async () => {
    await insIncident(`${TAG}-rb`, { lifecycle: "INVESTIGATING", assessment: "REVIEW_REQUIRED", owner: null });
    const before = await eventCount(`${TAG}-rb`);
    const r = await transitionIncidentForOrg({ id: `${TAG}-rb`, organizationId: ORG, actorId: U1, from: "INVESTIGATING", to: "RESOLVED", action: "resolve", now: new Date() });
    expect(r.ok).toBe(false);
    expect(await field(`${TAG}-rb`, "lifecycle")).toBe("INVESTIGATING");
    expect(await eventCount(`${TAG}-rb`)).toBe(before);
  });

  it("activating an incident-scoped hold is refused once the incident is CLOSED", async () => {
    const c = await createIncidentForOrg({ organizationId: ORG, actorId: U1, idempotencyKey: `${TAG}-hc`, data: {}, now: new Date() });
    const id = c.ok ? c.row.id : "";
    await transitionIncidentForOrg({ id, organizationId: ORG, actorId: U1, from: "OPEN", to: "TRIAGED", action: "manage", now: new Date() });
    await transitionIncidentForOrg({ id, organizationId: ORG, actorId: U1, from: "TRIAGED", to: "INVESTIGATING", action: "manage", now: new Date() });
    await assignIncidentOwnerForOrg({ id, organizationId: ORG, actorId: U1, ownerId: U1, now: new Date() });
    await recordAssessmentForOrg({ id, organizationId: ORG, actorId: U1, to: "IN_ASSESSMENT", action: "assess", now: new Date() });
    await recordAssessmentForOrg({ id, organizationId: ORG, actorId: U1, to: "DECISION_RECORDED", action: "decide", evidenceHash: HASH, now: new Date() });
    await transitionIncidentForOrg({ id, organizationId: ORG, actorId: U1, from: "INVESTIGATING", to: "RESOLVED", action: "resolve", now: new Date() });
    await transitionIncidentForOrg({ id, organizationId: ORG, actorId: U1, from: "RESOLVED", to: "CLOSED", action: "close", now: new Date() });
    await insHold(`${TAG}-hch`, id, "PROPOSED");
    const res = await applyIncidentScopedHoldTransition({ holdId: `${TAG}-hch`, organizationId: ORG, incidentId: id, fromStatus: "PROPOSED", toStatus: "ACTIVE", data: { status: "ACTIVE", approvedBy: "a", approvedAt: new Date() }, now: new Date() });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("INCIDENT_NOT_ACTIVE");
    const fresh = await getIncidentForOrg(id, ORG);
    expect(fresh?.lifecycle).toBe("CLOSED");
    expect(await holdStatus(`${TAG}-hch`)).toBe("PROPOSED");
  });
});
