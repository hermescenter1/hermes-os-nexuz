import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import {
  createIncidentForOrg, transitionIncidentForOrg, recordAssessmentForOrg, assignIncidentOwnerForOrg,
  createIncidentActionForOrg, resolveIncidentActionForOrg, cancelIncidentActionForOrg,
  applyIncidentScopedHoldTransition, getIncidentForOrg,
} from "@/lib/compliance/incident-db";

/**
 * Phase 97 — compliance-incident lineage + concurrency REAL-PostgreSQL rehearsal.
 * Proves against the actual DB + the ACTUAL persistence functions: same-incident action
 * event binding; authoritative timeline-actor + action-creator membership; the LegalHold
 * authoritative-parent snapshot revalidation; post-lock authoritative evidence time; and
 * DETERMINISTIC forced-ordering barriers (both orderings) across independent pooled
 * connections — no Promise.all luck, no sleep-decides-ordering.
 */
const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;
const TAG = "pginc97l";
const ORG = `${TAG}-orgA`, ORG_B = `${TAG}-orgB`;
const U1 = `${TAG}-u1`, U2 = `${TAG}-u2`, UB = `${TAG}-ub`, US = `${TAG}-us`;
const HASH = "a".repeat(64), HASH2 = "b".repeat(64);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Tx = { $executeRawUnsafe: (s: string, ...a: unknown[]) => Promise<number>; $queryRawUnsafe: <T = unknown>(s: string, ...a: unknown[]) => Promise<T>; $transaction: <T>(fn: (tx: Tx) => Promise<T>, o?: { timeout?: number; maxWait?: number }) => Promise<T> };
async function db(): Promise<Tx> { const p = await getPrisma(); if (!p) throw new Error("PG rehearsal requires a real Prisma client"); return p as unknown as Tx; }

async function clearIncidentData() {
  const p = await db();
  // Events reference actions/incidents/member-actors; delete events FIRST (trigger off),
  // then actions (member-creator FK), holds, incidents.
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
async function insAction(id: string, incidentId: string, org = ORG, priority = "LOW", creator = U1) {
  const p = await db();
  await p.$executeRawUnsafe(
    `INSERT INTO "ComplianceIncidentAction" (id,"organizationId","complianceIncidentId",priority,status,"actionCode","createdBy","updatedBy","updatedAt")
     VALUES ($1,$2,$3,$4,'OPEN','FOLLOW_UP_REQUIRED',$5,$5,now())`,
    id, org, incidentId, priority, creator);
}
async function driveResolvable(id: string) { await insIncident(id, { lifecycle: "INVESTIGATING", assessment: "DECISION_RECORDED" }); }
async function field(id: string, col: string): Promise<unknown> {
  const p = await db();
  const r = await p.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT "${col}" AS v FROM "ComplianceIncident" WHERE id=$1`, id);
  return r[0]?.v ?? null;
}
async function holdOf(id: string): Promise<{ status: string; incidentId: string | null }> {
  const p = await db();
  const r = await p.$queryRawUnsafe<{ status: string; incidentId: string | null }[]>(`SELECT status,"incidentId" FROM "LegalHold" WHERE id=$1`, id);
  return r[0] ?? { status: "MISSING", incidentId: null };
}
async function holdSnapshot(id: string): Promise<{ status: string; scopeType: string; incidentId: string; updatedAt: Date }> {
  const p = await db();
  const r = await p.$queryRawUnsafe<{ status: string; scopeType: string; incidentId: string; updatedAt: Date }[]>(`SELECT status,"scopeType","incidentId","updatedAt" FROM "LegalHold" WHERE id=$1`, id);
  return r[0];
}
async function eventCount(id: string): Promise<number> {
  const p = await db();
  const r = await p.$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM "ComplianceIncidentEvent" WHERE "complianceIncidentId"=$1`, id);
  return r[0].c;
}
const reasons = (r: { blockers?: Array<{ reason: string }> }) => (r.blockers ?? []).map((b) => b.reason);

it("integration database is configured (guards against a silent all-skip pass)", () => { expect(PG_ENABLED).toBe(true); });

describe.skipIf(!PG_ENABLED)("Phase 97 — incident lineage + concurrency (real PG)", () => {
  beforeAll(async () => {
    await cleanup();
    const p = await db();
    for (const org of [ORG, ORG_B]) await p.$executeRawUnsafe(`INSERT INTO "Organization" (id,name,slug,settings,"createdAt","updatedAt") VALUES ($1,'O',$2,'{}'::jsonb,now(),now())`, org, `${org}-slug`);
    for (const [u, e] of [[U1, "u1"], [U2, "u2"], [UB, "ub"], [US, "us"]]) await p.$executeRawUnsafe(`INSERT INTO "User" (id,name,email,"passwordHash","updatedAt") VALUES ($1,'U',$2,'x',now())`, u, `${e}-${TAG}@x.com`);
    const insMember = (u: string, org: string, status: string) => p.$executeRawUnsafe(`INSERT INTO "OrganizationMember" (id,"organizationId","userId",role,status,"updatedAt") VALUES ($1,$2,$3,'ENGINEER',$4,now())`, `${TAG}-m-${u}-${org}`, org, u, status);
    await insMember(U1, ORG, "ACTIVE"); await insMember(U2, ORG, "ACTIVE"); await insMember(UB, ORG_B, "ACTIVE"); await insMember(US, ORG, "SUSPENDED");
    await p.$executeRawUnsafe(`INSERT INTO "ProcessingActivity" (id,name,purpose,"legalBasis","organizationId","createdAt","updatedAt") VALUES ('${TAG}-paA','P','p','consent','${ORG}',now(),now())`);
  });
  afterAll(cleanup);
  beforeEach(clearIncidentData);

  // ── Lineage constraints ──────────────────────────────────────────────────────
  it("migration constraints exist", async () => {
    const p = await db();
    const mig = await p.$queryRawUnsafe<{ migration_name: string }[]>(`SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%incident_lineage_integrity%' AND finished_at IS NOT NULL`);
    expect(mig.length).toBeGreaterThanOrEqual(1);
    const con = await p.$queryRawUnsafe<{ conname: string }[]>(`SELECT conname FROM pg_constraint WHERE conname IN (
      'ComplianceIncidentEvent_action_incident_tuple_fkey','ComplianceIncidentEvent_actor_membership_fkey',
      'ComplianceIncidentAction_createdBy_membership_fkey','ComplianceIncidentAction_updatedBy_membership_fkey')`);
    expect(con.length).toBe(4);
  });

  it("an ACTION event can only reference an action of its OWN incident (same-org, foreign, missing all rejected)", async () => {
    await driveResolvable(`${TAG}-i1`); await driveResolvable(`${TAG}-i2`);
    await insIncident(`${TAG}-ib`, { org: ORG_B, lifecycle: "INVESTIGATING" });
    await insAction(`${TAG}-act1`, `${TAG}-i1`);                       // action of incident i1
    await insAction(`${TAG}-actB`, `${TAG}-ib`, ORG_B, "LOW", UB);     // foreign-org action (creator = ORG_B member)
    const p = await db();
    const ev = (evId: string, actId: string, incId: string, org = ORG) => p.$executeRawUnsafe(
      `INSERT INTO "ComplianceIncidentEvent" (id,"organizationId","complianceIncidentId",sequence,"eventCode","actorId","actorClass","actionId","createdAt")
       VALUES ($1,$2,$3,999,'ACTION_CREATED',$4,'ORGANIZATION_MEMBER',$5,now())`, evId, org, incId, U1, actId);
    // Action of a DIFFERENT same-org incident → rejected (CROSS_INCIDENT_ACTION_EVENT=0).
    await expect(ev(`${TAG}-ex`, `${TAG}-act1`, `${TAG}-i2`)).rejects.toBeTruthy();
    // Foreign-org action id under this org → rejected (FOREIGN_TENANT_ACTION_EVENT=0).
    await expect(ev(`${TAG}-ex2`, `${TAG}-actB`, `${TAG}-i1`)).rejects.toBeTruthy();
    // Missing action → rejected (ACTION_EVENT_WITHOUT_AUTHORITATIVE_ACTION=0).
    await expect(ev(`${TAG}-ex3`, `${TAG}-ghost`, `${TAG}-i1`)).rejects.toBeTruthy();
    // Same-incident action → accepted.
    await ev(`${TAG}-ok`, `${TAG}-act1`, `${TAG}-i1`);
  });

  it("every timeline actor + action creator must be an authoritative same-org member; PLATFORM class rejected", async () => {
    await driveResolvable(`${TAG}-am`);
    const p = await db();
    // Event actor not a member → rejected (ARBITRARY/FOREIGN_TENANT_TIMELINE_ACTOR=0).
    await expect(p.$executeRawUnsafe(`INSERT INTO "ComplianceIncidentEvent" (id,"organizationId","complianceIncidentId",sequence,"eventCode","actorId","actorClass","createdAt") VALUES ('${TAG}-ea','${ORG}','${TAG}-am',999,'UPDATED','ghost-user','ORGANIZATION_MEMBER',now())`)).rejects.toBeTruthy();
    // Non-member (foreign-org) actor → rejected.
    await expect(p.$executeRawUnsafe(`INSERT INTO "ComplianceIncidentEvent" (id,"organizationId","complianceIncidentId",sequence,"eventCode","actorId","actorClass","createdAt") VALUES ('${TAG}-eb','${ORG}','${TAG}-am',998,'UPDATED','${UB}','ORGANIZATION_MEMBER',now())`)).rejects.toBeTruthy();
    // Unproven PLATFORM class → rejected (UNPROVEN_ACTOR_CLASSIFICATION=0).
    await expect(p.$executeRawUnsafe(`INSERT INTO "ComplianceIncidentEvent" (id,"organizationId","complianceIncidentId",sequence,"eventCode","actorId","actorClass","createdAt") VALUES ('${TAG}-ec','${ORG}','${TAG}-am',997,'UPDATED','${U1}','PLATFORM',now())`)).rejects.toBeTruthy();
    // Action creator not a member → rejected (INCIDENT_ACTION_WITHOUT_CREATOR / creator membership).
    await expect(p.$executeRawUnsafe(`INSERT INTO "ComplianceIncidentAction" (id,"organizationId","complianceIncidentId",priority,status,"actionCode","createdBy","updatedBy","updatedAt") VALUES ('${TAG}-ac','${ORG}','${TAG}-am','LOW','OPEN','FOLLOW_UP_REQUIRED','ghost','ghost',now())`)).rejects.toBeTruthy();
  });

  // ── Post-lock authoritative time ────────────────────────────────────────────
  it("BARRIER — persisted evidence time is captured AFTER lock acquisition, never at route entry", async () => {
    await insIncident(`${TAG}-pt`, { lifecycle: "INVESTIGATING" });
    const p = await db();
    const routeEntry = Date.now();
    let opResult: Awaited<ReturnType<typeof recordAssessmentForOrg>> | null = null;
    let opP: Promise<void> | null = null;
    await p.$transaction(async (txA) => {
      await txA.$queryRawUnsafe(`SELECT "id" FROM "ComplianceIncident" WHERE "id"=$1 AND "organizationId"=$2 FOR UPDATE`, `${TAG}-pt`, ORG);
      opP = recordAssessmentForOrg({ id: `${TAG}-pt`, organizationId: ORG, actorId: U1, to: "IN_ASSESSMENT", action: "assess" }).then((r) => { opResult = r; });
      await sleep(800); // holds the lock well past route entry; the op is provably blocked
      expect(opResult).toBeNull();
    }, { timeout: 20000, maxWait: 20000 });
    await opP;
    expect(opResult!.ok).toBe(true);
    const updatedAt = new Date(await field(`${TAG}-pt`, "updatedAt") as string).getTime();
    expect(updatedAt - routeEntry).toBeGreaterThan(500); // captured after the ~800ms lock wait
    // The appended event's createdAt equals the incident's updatedAt (same tx clock).
    const ev = await p.$queryRawUnsafe<{ createdAt: Date }[]>(`SELECT "createdAt" FROM "ComplianceIncidentEvent" WHERE "complianceIncidentId"=$1 ORDER BY sequence DESC LIMIT 1`, `${TAG}-pt`);
    expect(new Date(ev[0].createdAt).getTime()).toBe(updatedAt); // TIMELINE_SEQUENCE_TIME_REGRESSION=0
  });

  // ── LegalHold authoritative parent snapshot (barriers) ──────────────────────
  async function holdBindingBarrier(mutate: (txA: Tx, holdId: string) => Promise<void>) {
    await insIncident(`${TAG}-A`, { lifecycle: "INVESTIGATING" });
    await insIncident(`${TAG}-B`, { lifecycle: "INVESTIGATING" });
    await insHold(`${TAG}-h`, `${TAG}-A`, "PROPOSED");
    const snap = await holdSnapshot(`${TAG}-h`);
    const p = await db();
    let res: Awaited<ReturnType<typeof applyIncidentScopedHoldTransition>> | null = null;
    let opP: Promise<void> | null = null;
    await p.$transaction(async (txA) => {
      await txA.$queryRawUnsafe(`SELECT "id" FROM "LegalHold" WHERE "id"=$1 AND "organizationId"=$2 FOR UPDATE`, `${TAG}-h`, ORG); // hold the HOLD row
      opP = applyIncidentScopedHoldTransition({ holdId: `${TAG}-h`, organizationId: ORG, actorId: U1, toStatus: "ACTIVE", expected: snap }).then((r) => { res = r; });
      await sleep(600);
      expect(res).toBeNull(); // blocked on the hold lock (incident A already locked by the op)
      await mutate(txA, `${TAG}-h`); // change the binding under the waiting op, then commit
    }, { timeout: 20000, maxWait: 20000 });
    await opP;
    return res!;
  }
  it("BARRIER — a PROPOSED hold moved to another incident while activation waits → HOLD_BINDING_CHANGED", async () => {
    const res = await holdBindingBarrier((txA) => txA.$executeRawUnsafe(`UPDATE "LegalHold" SET "incidentId"=$1, "updatedAt"=now() WHERE id=$2`, `${TAG}-B`, `${TAG}-h`) as unknown as Promise<void>);
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe("HOLD_BINDING_CHANGED");
    expect((await holdOf(`${TAG}-h`)).status).toBe("PROPOSED"); // not activated
  });
  it("BARRIER — scopeType changed while activation waits → HOLD_BINDING_CHANGED", async () => {
    const res = await holdBindingBarrier((txA) => txA.$executeRawUnsafe(`UPDATE "LegalHold" SET "scopeType"='ORGANIZATION', "incidentId"=NULL, "updatedAt"=now() WHERE id=$1`, `${TAG}-h`) as unknown as Promise<void>);
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe("HOLD_BINDING_CHANGED");
  });
  it("BARRIER — updatedAt changed while activation waits → HOLD_BINDING_CHANGED", async () => {
    const res = await holdBindingBarrier((txA) => txA.$executeRawUnsafe(`UPDATE "LegalHold" SET "reviewDate"=now(), "updatedAt"=now() WHERE id=$1`, `${TAG}-h`) as unknown as Promise<void>);
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe("HOLD_BINDING_CHANGED");
    expect((await holdOf(`${TAG}-h`)).status).toBe("PROPOSED");
  });

  // ── Deterministic forced-ordering barriers (both orderings) ─────────────────
  /** txA locks the incident, performs `first` (committing on tx end), while op B blocks
   *  on the incident lock; returns B's result after A commits. */
  async function orderBarrier<T>(incidentId: string, first: (txA: Tx) => Promise<void>, opB: () => Promise<T>): Promise<T> {
    const p = await db();
    let res: T | null = null; let done = false; let opP: Promise<void> | null = null;
    await p.$transaction(async (txA) => {
      await txA.$queryRawUnsafe(`SELECT "id" FROM "ComplianceIncident" WHERE "id"=$1 AND "organizationId"=$2 FOR UPDATE`, incidentId, ORG);
      opP = opB().then((r) => { res = r; done = true; });
      await sleep(500);
      expect(done).toBe(false); // op B is provably blocked on the incident lock
      await first(txA);          // commit the "first" event on tx end
    }, { timeout: 20000, maxWait: 20000 });
    await opP;
    return res as T;
  }

  it("ACTION_CLOSURE_ORDER_A/B — action-vs-closure both orderings", async () => {
    // A: action creation commits first → closure observes it and fails.
    await driveResolvable(`${TAG}-ca`);
    const rA = await orderBarrier(`${TAG}-ca`,
      (txA) => insActionInTx(txA, `${TAG}-caAct`, `${TAG}-ca`),
      () => transitionIncidentForOrg({ id: `${TAG}-ca`, organizationId: ORG, actorId: U1, from: "INVESTIGATING", to: "RESOLVED", action: "resolve" }));
    expect(rA.ok).toBe(false); if (!rA.ok) expect(reasons(rA)).toContain("UNRESOLVED_ACTIONS");
    expect(await field(`${TAG}-ca`, "lifecycle")).toBe("INVESTIGATING");
    // B: closure commits first → action creation observes non-editable lifecycle and fails.
    await clearIncidentData(); await driveResolvable(`${TAG}-cb`);
    const rB = await orderBarrier(`${TAG}-cb`,
      (txA) => txA.$executeRawUnsafe(`UPDATE "ComplianceIncident" SET lifecycle='RESOLVED', "resolvedBy"='r', "resolvedAt"=now(), "updatedAt"=now() WHERE id=$1`, `${TAG}-cb`) as unknown as Promise<void>,
      () => createIncidentActionForOrg({ id: `${TAG}-cb`, organizationId: ORG, actorId: U1, priority: "LOW", actionCode: "FOLLOW_UP_REQUIRED" }));
    expect(rB.ok).toBe(false); if (!rB.ok) expect(rB.reason).toBe("IMMUTABLE_LIFECYCLE");
  });

  it("HOLD_CLOSURE_ORDER_A/B — hold-activation-vs-closure both orderings", async () => {
    // A: hold activation commits first → closure observes ACTIVE and fails.
    await driveResolvable(`${TAG}-ha`); await insHold(`${TAG}-haH`, `${TAG}-ha`, "PROPOSED");
    const rA = await orderBarrier(`${TAG}-ha`,
      (txA) => txA.$executeRawUnsafe(`UPDATE "LegalHold" SET status='ACTIVE', "approvedBy"='a', "approvedAt"=now(), "updatedAt"=now() WHERE id=$1`, `${TAG}-haH`) as unknown as Promise<void>,
      () => transitionIncidentForOrg({ id: `${TAG}-ha`, organizationId: ORG, actorId: U1, from: "INVESTIGATING", to: "RESOLVED", action: "resolve" }));
    expect(rA.ok).toBe(false); if (!rA.ok) expect(reasons(rA)).toContain("ACTIVE_LEGAL_HOLD");
    expect(await field(`${TAG}-ha`, "lifecycle")).toBe("INVESTIGATING");
    expect((await holdOf(`${TAG}-haH`)).status).toBe("ACTIVE");
    // B: closure commits first → hold activation observes RESOLVED and fails (NOT active).
    await clearIncidentData(); await driveResolvable(`${TAG}-hb`); await insHold(`${TAG}-hbH`, `${TAG}-hb`, "PROPOSED");
    const snap = await holdSnapshot(`${TAG}-hbH`);
    const rB = await orderBarrier(`${TAG}-hb`,
      (txA) => txA.$executeRawUnsafe(`UPDATE "ComplianceIncident" SET lifecycle='RESOLVED', "resolvedBy"='r', "resolvedAt"=now(), "updatedAt"=now() WHERE id=$1`, `${TAG}-hb`) as unknown as Promise<void>,
      () => applyIncidentScopedHoldTransition({ holdId: `${TAG}-hbH`, organizationId: ORG, actorId: U1, toStatus: "ACTIVE", expected: snap }));
    expect(rB.ok).toBe(false); if (!rB.ok) expect(rB.reason).toBe("INCIDENT_NOT_ACTIVE");
    expect(await field(`${TAG}-hb`, "lifecycle")).toBe("RESOLVED");
    expect((await holdOf(`${TAG}-hbH`)).status).toBe("PROPOSED"); // never activated over a closed incident
  });

  it("HOLD_RELEASE_CLOSURE_ORDER_A/B — hold-release-vs-closure both orderings", async () => {
    // A: release commits first → closure observes no active hold and may succeed.
    await driveResolvable(`${TAG}-ra`); await insHold(`${TAG}-raH`, `${TAG}-ra`, "ACTIVE");
    const rA = await orderBarrier(`${TAG}-ra`,
      (txA) => txA.$executeRawUnsafe(`UPDATE "LegalHold" SET status='RELEASED', "releaseApprovedBy"='a', "releasedAt"=now(), "updatedAt"=now() WHERE id=$1`, `${TAG}-raH`) as unknown as Promise<void>,
      () => transitionIncidentForOrg({ id: `${TAG}-ra`, organizationId: ORG, actorId: U1, from: "INVESTIGATING", to: "RESOLVED", action: "resolve" }));
    expect(rA.ok).toBe(true);
    // B: closure waits while release is uncommitted → never reads a mixed CLOSED+ACTIVE state.
    await clearIncidentData(); await driveResolvable(`${TAG}-rb2`); await insHold(`${TAG}-rbH`, `${TAG}-rb2`, "ACTIVE");
    const rB = await orderBarrier(`${TAG}-rb2`,
      (txA) => txA.$executeRawUnsafe(`UPDATE "LegalHold" SET status='RELEASED', "releaseApprovedBy"='a', "releasedAt"=now(), "updatedAt"=now() WHERE id=$1`, `${TAG}-rbH`) as unknown as Promise<void>,
      () => transitionIncidentForOrg({ id: `${TAG}-rb2`, organizationId: ORG, actorId: U1, from: "INVESTIGATING", to: "RESOLVED", action: "resolve" }));
    expect(rB.ok).toBe(true);
    const p = await db();
    const bad = await p.$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM "ComplianceIncident" i JOIN "LegalHold" h ON h."incidentId"=i.id WHERE i.lifecycle IN ('RESOLVED','CLOSED') AND h.status='ACTIVE' AND i.id LIKE '${TAG}%'`);
    expect(bad[0].c).toBe(0);
  });

  it("DECISION_REASSESSMENT_ORDER_A/B — decision-vs-reassessment both orderings", async () => {
    // A: decision commits first → reassessment invalidates the exact evidence.
    await insIncident(`${TAG}-da`, { lifecycle: "INVESTIGATING", assessment: "IN_ASSESSMENT" });
    const rA = await orderBarrier(`${TAG}-da`,
      (txA) => txA.$executeRawUnsafe(`UPDATE "ComplianceIncident" SET "assessmentStatus"='DECISION_RECORDED', "decisionBy"='d', "decisionAt"=now(), "decisionEvidenceHash"=$1, "decisionVersion"=1, "updatedAt"=now() WHERE id=$2`, HASH, `${TAG}-da`) as unknown as Promise<void>,
      () => recordAssessmentForOrg({ id: `${TAG}-da`, organizationId: ORG, actorId: U1, to: "IN_ASSESSMENT", action: "assess" }));
    expect(rA.ok).toBe(true);
    expect(await field(`${TAG}-da`, "decisionEvidenceHash")).toBeNull();
    expect(await field(`${TAG}-da`, "decisionVersion")).toBe(1); // preserved lineage
    // B: reassessment commits first → a fresh decision gets a NEW version from the authoritative state.
    await clearIncidentData(); await insIncident(`${TAG}-db`, { lifecycle: "INVESTIGATING", assessment: "DECISION_RECORDED", version: 1 });
    const rB = await orderBarrier(`${TAG}-db`,
      (txA) => txA.$executeRawUnsafe(`UPDATE "ComplianceIncident" SET "assessmentStatus"='IN_ASSESSMENT', "decisionEvidenceHash"=NULL, "decisionBy"=NULL, "decisionAt"=NULL, "updatedAt"=now() WHERE id=$1`, `${TAG}-db`) as unknown as Promise<void>,
      () => recordAssessmentForOrg({ id: `${TAG}-db`, organizationId: ORG, actorId: U1, to: "DECISION_RECORDED", action: "decide", evidenceHash: HASH2 }));
    expect(rB.ok).toBe(true);
    expect(await field(`${TAG}-db`, "decisionEvidenceHash")).toBe(HASH2);
    expect(await field(`${TAG}-db`, "decisionVersion")).toBe(2); // monotonic from the authoritative post-reassessment state
  });

  // ── Append-only + happy path (regression) ────────────────────────────────────
  it("timeline stays append-only and a full happy path reaches CLOSED", async () => {
    const c = await createIncidentForOrg({ organizationId: ORG, actorId: U1, idempotencyKey: `${TAG}-hp`, data: {} });
    const id = c.ok ? c.row.id : "";
    const p = await db();
    await expect(p.$executeRawUnsafe(`UPDATE "ComplianceIncidentEvent" SET "eventCode"='UPDATED' WHERE "complianceIncidentId"=$1`, id)).rejects.toBeTruthy();
    await expect(p.$executeRawUnsafe(`DELETE FROM "ComplianceIncidentEvent" WHERE "complianceIncidentId"=$1`, id)).rejects.toBeTruthy();
    await transitionIncidentForOrg({ id, organizationId: ORG, actorId: U1, from: "OPEN", to: "TRIAGED", action: "manage" });
    await transitionIncidentForOrg({ id, organizationId: ORG, actorId: U1, from: "TRIAGED", to: "INVESTIGATING", action: "manage" });
    await assignIncidentOwnerForOrg({ id, organizationId: ORG, actorId: U1, ownerId: U1 });
    await recordAssessmentForOrg({ id, organizationId: ORG, actorId: U1, to: "IN_ASSESSMENT", action: "assess" });
    await recordAssessmentForOrg({ id, organizationId: ORG, actorId: U1, to: "DECISION_RECORDED", action: "decide", evidenceHash: HASH });
    const a = await createIncidentActionForOrg({ id, organizationId: ORG, actorId: U1, priority: "LOW", actionCode: "FOLLOW_UP_REQUIRED" });
    expect((await transitionIncidentForOrg({ id, organizationId: ORG, actorId: U1, from: "INVESTIGATING", to: "RESOLVED", action: "resolve" })).ok).toBe(false); // open action blocks
    await cancelIncidentActionForOrg({ incidentId: id, organizationId: ORG, actorId: U1, actionId: a.ok ? a.row.id : "" });
    expect((await resolveIncidentActionForOrg({ incidentId: id, organizationId: ORG, actorId: U1, actionId: "nope" })).ok).toBe(false); // uniform not-found
    expect((await transitionIncidentForOrg({ id, organizationId: ORG, actorId: U1, from: "INVESTIGATING", to: "RESOLVED", action: "resolve" })).ok).toBe(true);
    expect((await transitionIncidentForOrg({ id, organizationId: ORG, actorId: U1, from: "RESOLVED", to: "CLOSED", action: "close" })).ok).toBe(true);
    const fresh = await getIncidentForOrg(id, ORG);
    expect(fresh?.lifecycle).toBe("CLOSED");
    expect(await eventCount(id)).toBeGreaterThanOrEqual(8);
  });

  it("BARRIER — assignment blocks on a held membership lock, then fails after the member is committed SUSPENDED", async () => {
    await insIncident(`${TAG}-ms`, { lifecycle: "INVESTIGATING", owner: null });
    const p = await db();
    let result: Awaited<ReturnType<typeof assignIncidentOwnerForOrg>> | null = null; let started: Promise<void> | null = null;
    await p.$transaction(async (txA) => {
      await txA.$queryRawUnsafe(`SELECT "id" FROM "OrganizationMember" WHERE "organizationId"=$1 AND "userId"=$2 FOR UPDATE`, ORG, U2);
      started = assignIncidentOwnerForOrg({ id: `${TAG}-ms`, organizationId: ORG, actorId: U1, ownerId: U2 }).then((r) => { result = r; });
      await sleep(600); expect(result).toBeNull();
      await txA.$executeRawUnsafe(`UPDATE "OrganizationMember" SET status='SUSPENDED', "updatedAt"=now() WHERE "organizationId"=$1 AND "userId"=$2`, ORG, U2);
    }, { timeout: 20000, maxWait: 20000 });
    await started;
    const res = result!;
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe("INVALID_MEMBERSHIP");
    await p.$executeRawUnsafe(`UPDATE "OrganizationMember" SET status='ACTIVE', "updatedAt"=now() WHERE "organizationId"=$1 AND "userId"=$2`, ORG, U2);
  });
});

/** Raw insert of an OPEN action WITHIN an already-open transaction (barrier helper). */
async function insActionInTx(tx: Tx, id: string, incidentId: string): Promise<void> {
  await tx.$executeRawUnsafe(
    `INSERT INTO "ComplianceIncidentAction" (id,"organizationId","complianceIncidentId",priority,status,"actionCode","createdBy","updatedBy","updatedAt")
     VALUES ($1,$2,$3,'LOW','OPEN','FOLLOW_UP_REQUIRED',$4,$4,now())`,
    id, ORG, incidentId, U1);
}
