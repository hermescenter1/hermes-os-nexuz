import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import {
  createIncidentForOrg, transitionIncidentForOrg,
  recordAssessmentForOrg, adjustBlockerForOrg, getIncidentForOrg,
} from "@/lib/compliance/incident-db";

/**
 * Phase 97 — governed compliance-incident REAL-PostgreSQL rehearsal. Proves against
 * the actual DB + the ACTUAL persistence functions: the closed-vocab + attribution
 * CHECKs; the append-only timeline trigger; composite tenant-safe reference FKs
 * (CROSS_TENANT_INCIDENT_RELATION=0); idempotent creation; atomic incident+timeline
 * writes; the closure gate with a real LegalHold; and transition/closure/reopen/
 * duplicate concurrency linearising across independent pooled connections.
 */
const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;
const TAG = "pginc97";
const ORG = `${TAG}-orgA`, ORG_B = `${TAG}-orgB`;

type Tx = { $executeRawUnsafe: (s: string, ...a: unknown[]) => Promise<number>; $queryRawUnsafe: <T = unknown>(s: string, ...a: unknown[]) => Promise<T> };
async function db(): Promise<Tx> { const p = await getPrisma(); if (!p) throw new Error("PG rehearsal requires a real Prisma client"); return p as unknown as Tx; }

async function cleanup() {
  const p = await db();
  await p.$executeRawUnsafe(`DELETE FROM "ComplianceIncidentEvent" WHERE "organizationId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "ComplianceIncident" WHERE "organizationId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "LegalHold" WHERE "organizationId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "ProcessingActivity" WHERE id LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "Organization" WHERE id LIKE '${TAG}%'`);
}
async function reset() {
  const p = await db();
  await p.$executeRawUnsafe(`DELETE FROM "ComplianceIncidentEvent" WHERE "organizationId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "ComplianceIncident" WHERE "organizationId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "LegalHold" WHERE "organizationId" LIKE '${TAG}%'`);
}

/** Raw-insert an incident in a chosen state, satisfying the attribution CHECKs. */
async function insIncident(id: string, opts: { org?: string; lifecycle?: string; assessment?: string; owner?: string | null; blockerCount?: number; key?: string; paRef?: string | null } = {}) {
  const p = await db();
  const org = opts.org ?? ORG;
  const lifecycle = opts.lifecycle ?? "OPEN";
  const assessment = opts.assessment ?? "REVIEW_REQUIRED";
  const decided = assessment === "DECISION_RECORDED" || assessment === "NO_EXTERNAL_NOTIFICATION_DECISION";
  const resolvedish = lifecycle === "RESOLVED" || lifecycle === "CLOSED";
  await p.$executeRawUnsafe(
    `INSERT INTO "ComplianceIncident"
      (id,"organizationId","incidentType",severity,lifecycle,"assessmentStatus","sourceClass","idempotencyKey","openBlockerCount",
       "ownerId","processingActivityId","decisionBy","decisionAt","resolvedBy","resolvedAt","closedBy","closedAt","updatedAt")
     VALUES ($1,$2,'SECURITY','HIGH',$3,$4,'MANUAL',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())`,
    id, org, lifecycle, assessment, opts.key ?? id, opts.blockerCount ?? 0,
    opts.owner === undefined ? "u1" : opts.owner, opts.paRef ?? null,
    decided ? "dec" : null, decided ? new Date() : null,
    resolvedish ? "res" : null, resolvedish ? new Date() : null,
    lifecycle === "CLOSED" ? "clo" : null, lifecycle === "CLOSED" ? new Date() : null,
  );
}
async function lifecycleOf(id: string): Promise<string> {
  const p = await db();
  const r = await p.$queryRawUnsafe<{ lifecycle: string }[]>(`SELECT lifecycle FROM "ComplianceIncident" WHERE id=$1`, id);
  return r[0]?.lifecycle ?? "MISSING";
}
async function fieldOf(id: string, col: string): Promise<unknown> {
  const p = await db();
  const r = await p.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT "${col}" AS v FROM "ComplianceIncident" WHERE id=$1`, id);
  return r[0]?.v ?? null;
}
async function timelineCount(id: string): Promise<number> {
  const p = await db();
  const r = await p.$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM "ComplianceIncidentEvent" WHERE "complianceIncidentId"=$1`, id);
  return r[0].c;
}
async function insActiveIncidentHold(id: string, incidentId: string, org = ORG) {
  const p = await db();
  await p.$executeRawUnsafe(
    `INSERT INTO "LegalHold" (id,"organizationId",name,"scopeType","incidentId",status,"updatedAt") VALUES ($1,$2,'H','INCIDENT',$3,'ACTIVE',now())`,
    id, org, incidentId);
}
const reasons = (r: { blockers?: Array<{ reason: string }> }) => (r.blockers ?? []).map((b) => b.reason);

it("integration database is configured (guards against a silent all-skip pass)", () => { expect(PG_ENABLED).toBe(true); });

describe.skipIf(!PG_ENABLED)("Phase 97 — compliance incidents (real PG)", () => {
  beforeAll(async () => {
    await cleanup();
    const p = await db();
    for (const org of [ORG, ORG_B]) {
      await p.$executeRawUnsafe(`INSERT INTO "Organization" (id,name,slug,settings,"createdAt","updatedAt") VALUES ($1,'O',$2,'{}'::jsonb,now(),now())`, org, `${org}-slug`);
    }
    await p.$executeRawUnsafe(`INSERT INTO "ProcessingActivity" (id,name,purpose,"legalBasis","organizationId","createdAt","updatedAt") VALUES ('${TAG}-paA','P','p','consent','${ORG}',now(),now())`);
    await p.$executeRawUnsafe(`INSERT INTO "ProcessingActivity" (id,name,purpose,"legalBasis","organizationId","createdAt","updatedAt") VALUES ('${TAG}-paB','P','p','consent','${ORG_B}',now(),now())`);
  });
  afterAll(cleanup);
  beforeEach(reset);

  it("the migration tables, key constraints and the append-only trigger exist", async () => {
    const p = await db();
    const mig = await p.$queryRawUnsafe<{ migration_name: string }[]>(`SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%compliance_incidents%' AND finished_at IS NOT NULL`);
    expect(mig.length).toBeGreaterThanOrEqual(1);
    const con = await p.$queryRawUnsafe<{ conname: string }[]>(`SELECT conname FROM pg_constraint WHERE conname IN (
      'ComplianceIncident_type_check','ComplianceIncident_lifecycle_check','ComplianceIncident_assessment_check',
      'ComplianceIncident_resolved_check','ComplianceIncident_closed_check','ComplianceIncident_decision_check',
      'ComplianceIncident_processing_activity_tuple_fkey','ComplianceIncident_subprocessor_tuple_fkey','ComplianceIncident_data_transfer_tuple_fkey') ORDER BY conname`);
    expect(con.length).toBe(9);
    const idx = await p.$queryRawUnsafe<{ indexname: string }[]>(`SELECT indexname FROM pg_indexes WHERE indexname IN (
      'ComplianceIncident_organizationId_idempotencyKey_key','ComplianceIncidentEvent_complianceIncidentId_sequence_key')`);
    expect(idx.length).toBe(2);
    const trg = await p.$queryRawUnsafe<{ tgname: string }[]>(`SELECT tgname FROM pg_trigger WHERE tgname='compliance_incident_event_no_update'`);
    expect(trg.length).toBe(1);
  });

  it("closed-vocab + attribution CHECKs are enforced", async () => {
    const p = await db();
    // Unknown incidentType is rejected by the closed-vocab CHECK.
    await expect(p.$executeRawUnsafe(`INSERT INTO "ComplianceIncident" (id,"organizationId","incidentType","idempotencyKey","updatedAt") VALUES ('${TAG}-bt','${ORG}','MADE_UP','k1',now())`)).rejects.toBeTruthy();
    // RESOLVED / CLOSED / decision states require their attribution.
    await expect(p.$executeRawUnsafe(`INSERT INTO "ComplianceIncident" (id,"organizationId",lifecycle,"idempotencyKey","updatedAt") VALUES ('${TAG}-br','${ORG}','RESOLVED','k2',now())`)).rejects.toBeTruthy();
    await expect(p.$executeRawUnsafe(`INSERT INTO "ComplianceIncident" (id,"organizationId",lifecycle,"resolvedBy","resolvedAt","idempotencyKey","updatedAt") VALUES ('${TAG}-bc','${ORG}','CLOSED','r',now(),'k3',now())`)).rejects.toBeTruthy();
    await expect(p.$executeRawUnsafe(`INSERT INTO "ComplianceIncident" (id,"organizationId","assessmentStatus","idempotencyKey","updatedAt") VALUES ('${TAG}-bd','${ORG}','DECISION_RECORDED','k4',now())`)).rejects.toBeTruthy();
    // A fully-attributed CLOSED row is accepted.
    await p.$executeRawUnsafe(`INSERT INTO "ComplianceIncident" (id,"organizationId",lifecycle,"assessmentStatus","resolvedBy","resolvedAt","closedBy","closedAt","decisionBy","decisionAt","idempotencyKey","updatedAt") VALUES ('${TAG}-ok','${ORG}','CLOSED','DECISION_RECORDED','r',now(),'c',now(),'d',now(),'k5',now())`);
  });

  it("idempotent creation: a duplicate (org, key) returns the existing incident; a raw duplicate is rejected", async () => {
    const first = await createIncidentForOrg({ organizationId: ORG, actorId: "a", idempotencyKey: `${TAG}-K`, data: { incidentType: "SECURITY" }, now: new Date() });
    expect(first.ok && first.created).toBe(true);
    const second = await createIncidentForOrg({ organizationId: ORG, actorId: "a", idempotencyKey: `${TAG}-K`, data: { incidentType: "PRIVACY" }, now: new Date() });
    expect(second.ok && !second.created).toBe(true);
    if (first.ok && second.ok) expect(second.row.id).toBe(first.row.id);
    const p = await db();
    const c = await p.$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM "ComplianceIncident" WHERE "organizationId"=$1 AND "idempotencyKey"=$2`, ORG, `${TAG}-K`);
    expect(c[0].c).toBe(1);
  });

  it("composite reference FKs reject a foreign-tenant record even with a valid id (CROSS_TENANT_INCIDENT_RELATION=0)", async () => {
    // Same-org reference is accepted.
    const ok = await createIncidentForOrg({ organizationId: ORG, actorId: "a", idempotencyKey: `${TAG}-r1`, data: { processingActivityId: `${TAG}-paA` }, now: new Date() });
    expect(ok.ok).toBe(true);
    // Org A incident → Org B ProcessingActivity: valid id, wrong tenant → rejected.
    const bad = await createIncidentForOrg({ organizationId: ORG, actorId: "a", idempotencyKey: `${TAG}-r2`, data: { processingActivityId: `${TAG}-paB` }, now: new Date() });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe("INVALID_RELATION");
  });

  it("the timeline is append-only: a recorded event cannot be mutated", async () => {
    const r = await createIncidentForOrg({ organizationId: ORG, actorId: "a", idempotencyKey: `${TAG}-ap`, data: {}, now: new Date() });
    expect(r.ok).toBe(true);
    const id = r.ok ? r.row.id : "";
    const p = await db();
    await expect(p.$executeRawUnsafe(`UPDATE "ComplianceIncidentEvent" SET "eventCode"='UPDATED' WHERE "complianceIncidentId"=$1`, id)).rejects.toBeTruthy();
  });

  it("a lifecycle transition commits the incident update AND its timeline event atomically; a blocked transition changes nothing", async () => {
    await insIncident(`${TAG}-a1`, { lifecycle: "OPEN" });
    const before = await timelineCount(`${TAG}-a1`);
    const ok = await transitionIncidentForOrg({ id: `${TAG}-a1`, organizationId: ORG, actorId: "a", from: "OPEN", to: "TRIAGED", action: "manage", now: new Date() });
    expect(ok.ok).toBe(true);
    expect(await lifecycleOf(`${TAG}-a1`)).toBe("TRIAGED");
    expect(await timelineCount(`${TAG}-a1`)).toBe(before + 1); // exactly one event
    // A blocked resolution (un-decided assessment) leaves neither the state nor a new event.
    await insIncident(`${TAG}-a2`, { lifecycle: "INVESTIGATING", assessment: "REVIEW_REQUIRED", owner: null });
    const t2 = await timelineCount(`${TAG}-a2`);
    const blocked = await transitionIncidentForOrg({ id: `${TAG}-a2`, organizationId: ORG, actorId: "a", from: "INVESTIGATING", to: "RESOLVED", action: "resolve", now: new Date() });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) { expect(blocked.reason).toBe("NOT_CLOSABLE"); expect(reasons(blocked)).toContain("ASSESSMENT_REQUIRED"); }
    expect(await lifecycleOf(`${TAG}-a2`)).toBe("INVESTIGATING");
    expect(await timelineCount(`${TAG}-a2`)).toBe(t2);
  });

  it("an active LegalHold blocks resolution; removing it unblocks (real query)", async () => {
    await insIncident(`${TAG}-h`, { lifecycle: "INVESTIGATING", assessment: "DECISION_RECORDED", owner: "u1" });
    await insActiveIncidentHold(`${TAG}-hold`, `${TAG}-h`);
    const blocked = await transitionIncidentForOrg({ id: `${TAG}-h`, organizationId: ORG, actorId: "a", from: "INVESTIGATING", to: "RESOLVED", action: "resolve", now: new Date() });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(reasons(blocked)).toContain("ACTIVE_LEGAL_HOLD");
    const p = await db();
    await p.$executeRawUnsafe(`UPDATE "LegalHold" SET status='RELEASED' WHERE id=$1`, `${TAG}-hold`);
    const ok = await transitionIncidentForOrg({ id: `${TAG}-h`, organizationId: ORG, actorId: "a", from: "INVESTIGATING", to: "RESOLVED", action: "resolve", now: new Date() });
    expect(ok.ok).toBe(true);
  });

  it("a CLOSED incident's assessment is frozen (CLOSED_INCIDENT_SILENT_MUTATION=0)", async () => {
    await insIncident(`${TAG}-cl`, { lifecycle: "CLOSED", assessment: "DECISION_RECORDED", owner: "u1" });
    const r = await recordAssessmentForOrg({ id: `${TAG}-cl`, organizationId: ORG, actorId: "a", to: "IN_ASSESSMENT", action: "assess", now: new Date() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("IMMUTABLE_LIFECYCLE");
    expect(await fieldOf(`${TAG}-cl`, "assessmentStatus")).toBe("DECISION_RECORDED");
  });

  // ── Concurrency (independent pooled connections, real row locks) ────────────
  it("BARRIER — simultaneous transitions on one incident linearise to exactly one", async () => {
    await insIncident(`${TAG}-s`, { lifecycle: "OPEN" });
    const [a, b] = await Promise.all([
      transitionIncidentForOrg({ id: `${TAG}-s`, organizationId: ORG, actorId: "a", from: "OPEN", to: "TRIAGED", action: "manage", now: new Date() }),
      transitionIncidentForOrg({ id: `${TAG}-s`, organizationId: ORG, actorId: "b", from: "OPEN", to: "CANCELLED", action: "manage", now: new Date() }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);          // exactly one wins
    expect(["TRIAGED", "CANCELLED"]).toContain(await lifecycleOf(`${TAG}-s`));
    expect(await timelineCount(`${TAG}-s`)).toBe(1);               // exactly one event committed
  });

  it("BARRIER — resolution racing a new blocker never commits RESOLVED with an open blocker", async () => {
    for (let i = 0; i < 10; i++) {
      await reset();
      await insIncident(`${TAG}-rb`, { lifecycle: "INVESTIGATING", assessment: "DECISION_RECORDED", owner: "u1", blockerCount: 0 });
      await Promise.all([
        transitionIncidentForOrg({ id: `${TAG}-rb`, organizationId: ORG, actorId: "a", from: "INVESTIGATING", to: "RESOLVED", action: "resolve", now: new Date() }),
        adjustBlockerForOrg({ id: `${TAG}-rb`, organizationId: ORG, actorId: "b", action: "RAISE", now: new Date() }),
      ]);
      if ((await lifecycleOf(`${TAG}-rb`)) === "RESOLVED") expect(await fieldOf(`${TAG}-rb`, "openBlockerCount")).toBe(0);
    }
  });

  it("BARRIER — resolution racing an un-deciding assessment never commits RESOLVED while un-decided", async () => {
    for (let i = 0; i < 10; i++) {
      await reset();
      await insIncident(`${TAG}-ra`, { lifecycle: "INVESTIGATING", assessment: "DECISION_RECORDED", owner: "u1" });
      await Promise.all([
        transitionIncidentForOrg({ id: `${TAG}-ra`, organizationId: ORG, actorId: "a", from: "INVESTIGATING", to: "RESOLVED", action: "resolve", now: new Date() }),
        recordAssessmentForOrg({ id: `${TAG}-ra`, organizationId: ORG, actorId: "b", to: "IN_ASSESSMENT", action: "assess", now: new Date() }),
      ]);
      if ((await lifecycleOf(`${TAG}-ra`)) === "RESOLVED") {
        expect(["DECISION_RECORDED", "NO_EXTERNAL_NOTIFICATION_DECISION"]).toContain(await fieldOf(`${TAG}-ra`, "assessmentStatus"));
      }
    }
  });

  it("BARRIER — reopen racing closure commits exactly one outcome", async () => {
    for (let i = 0; i < 10; i++) {
      await reset();
      await insIncident(`${TAG}-rc`, { lifecycle: "RESOLVED", assessment: "DECISION_RECORDED", owner: "u1" });
      const [close, reopen] = await Promise.all([
        transitionIncidentForOrg({ id: `${TAG}-rc`, organizationId: ORG, actorId: "a", from: "RESOLVED", to: "CLOSED", action: "close", now: new Date() }),
        transitionIncidentForOrg({ id: `${TAG}-rc`, organizationId: ORG, actorId: "b", from: "RESOLVED", to: "INVESTIGATING", action: "reopen", now: new Date() }),
      ]);
      expect([close.ok, reopen.ok].filter(Boolean)).toHaveLength(1);
      const lc = await lifecycleOf(`${TAG}-rc`);
      expect(["CLOSED", "INVESTIGATING"]).toContain(lc);
      // A reopen that won must have cleared closure evidence.
      if (lc === "INVESTIGATING") expect(await fieldOf(`${TAG}-rc`, "closedBy")).toBeNull();
    }
  });

  it("BARRIER — concurrent duplicate creation resolves to one incident (DUPLICATE_INCIDENT_IDEMPOTENCY_BYPASS=0)", async () => {
    for (let i = 0; i < 8; i++) {
      await reset();
      const key = `${TAG}-dup-${i}`;
      const [a, b] = await Promise.all([
        createIncidentForOrg({ organizationId: ORG, actorId: "a", idempotencyKey: key, data: { incidentType: "SECURITY" }, now: new Date() }),
        createIncidentForOrg({ organizationId: ORG, actorId: "b", idempotencyKey: key, data: { incidentType: "PRIVACY" }, now: new Date() }),
      ]);
      expect(a.ok && b.ok).toBe(true);
      if (a.ok && b.ok) expect(a.row.id).toBe(b.row.id); // both see the same committed winner
      const p = await db();
      const c = await p.$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM "ComplianceIncident" WHERE "organizationId"=$1 AND "idempotencyKey"=$2`, ORG, key);
      expect(c[0].c).toBe(1);
    }
  });

  it("a full happy path via the persistence functions reaches CLOSED with a coherent timeline", async () => {
    const c = await createIncidentForOrg({ organizationId: ORG, actorId: "a", idempotencyKey: `${TAG}-hp`, data: { incidentType: "EXPORT_FAILURE", ownerId: "u1" }, now: new Date() });
    expect(c.ok).toBe(true);
    const id = c.ok ? c.row.id : "";
    await transitionIncidentForOrg({ id, organizationId: ORG, actorId: "a", from: "OPEN", to: "TRIAGED", action: "manage", now: new Date() });
    await transitionIncidentForOrg({ id, organizationId: ORG, actorId: "a", from: "TRIAGED", to: "INVESTIGATING", action: "manage", now: new Date() });
    await recordAssessmentForOrg({ id, organizationId: ORG, actorId: "a", to: "IN_ASSESSMENT", action: "assess", now: new Date() });
    await recordAssessmentForOrg({ id, organizationId: ORG, actorId: "a", to: "DECISION_RECORDED", action: "decide", now: new Date() });
    const res = await transitionIncidentForOrg({ id, organizationId: ORG, actorId: "a", from: "INVESTIGATING", to: "RESOLVED", action: "resolve", now: new Date() });
    expect(res.ok).toBe(true);
    const clo = await transitionIncidentForOrg({ id, organizationId: ORG, actorId: "a", from: "RESOLVED", to: "CLOSED", action: "close", now: new Date() });
    expect(clo.ok).toBe(true);
    const fresh = await getIncidentForOrg(id, ORG);
    expect(fresh?.lifecycle).toBe("CLOSED");
    expect(fresh?.decisionBy).toBe("a");
    expect(await timelineCount(id)).toBe(7); // CREATED + 2 lifecycle + 2 assessment + resolve + close
  });
});
