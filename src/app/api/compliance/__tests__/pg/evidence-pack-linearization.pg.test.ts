import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import {
  createEvidencePackForOrg, generateEvidencePackForOrg, revokeEvidencePackForOrg,
  getEvidencePackForOrg, getEvidencePackItemsForOrg,
} from "@/lib/compliance/evidence-pack-db";

/**
 * Phase 97 — governed compliance evidence packs: REAL-PostgreSQL rehearsal.
 * Proves against the ACTUAL DB + persistence functions: one authoritative pack per
 * idempotency key; deterministic canonical hash (same data → same hash across packs);
 * atomic finalization + READY/item immutability triggers; cross-tenant target rejection;
 * governed revocation preserving historical evidence; and a historical pack's hash never
 * changing when the source data later changes. Held-lock finalization barrier, no
 * scheduler luck.
 */
const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;
const TAG = "pgep97";
const ORG = `${TAG}-orgA`, ORG_B = `${TAG}-orgB`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Tx = { $executeRawUnsafe: (s: string, ...a: unknown[]) => Promise<number>; $queryRawUnsafe: <T = unknown>(s: string, ...a: unknown[]) => Promise<T>; $transaction: <T>(fn: (tx: Tx) => Promise<T>, o?: { timeout?: number; maxWait?: number }) => Promise<T> };
async function db(): Promise<Tx> { const p = await getPrisma(); if (!p) throw new Error("PG rehearsal requires a real Prisma client"); return p as unknown as Tx; }

async function clearPacks() {
  const p = await db();
  await p.$executeRawUnsafe(`ALTER TABLE "ComplianceEvidencePackItem" DISABLE TRIGGER USER`);
  await p.$executeRawUnsafe(`DELETE FROM "ComplianceEvidencePackItem" WHERE "organizationId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`ALTER TABLE "ComplianceEvidencePackItem" ENABLE TRIGGER USER`);
  await p.$executeRawUnsafe(`ALTER TABLE "ComplianceEvidencePack" DISABLE TRIGGER USER`);
  await p.$executeRawUnsafe(`DELETE FROM "ComplianceEvidencePack" WHERE "organizationId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`ALTER TABLE "ComplianceEvidencePack" ENABLE TRIGGER USER`);
}
async function cleanup() {
  await clearPacks();
  const p = await db();
  for (const t of ["ProcessingActivity", "RetentionPolicy", "LegalHold", "ComplianceIncident"]) {
    await p.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "organizationId" LIKE '${TAG}%'`);
  }
  await p.$executeRawUnsafe(`DELETE FROM "Organization" WHERE id LIKE '${TAG}%'`);
}

async function seedOrgData(org: string) {
  const p = await db();
  await p.$executeRawUnsafe(`INSERT INTO "ProcessingActivity" (id,name,purpose,"legalBasis","organizationId","legalBasisStatus","approvalState",status,"createdAt","updatedAt") VALUES ($1,'PA','p','consent',$2,'CONFIGURED','APPROVED','ACTIVE',$3,$3)`, `${org}-pa`, org, new Date("2026-01-01T00:00:00Z"));
  await p.$executeRawUnsafe(`INSERT INTO "RetentionPolicy" (id,"organizationId",name,"dataClass","targetResource","retentionDays","approvalState","legalHoldAware","dryRunOnly",enabled,"createdAt","updatedAt") VALUES ($1,$2,'R','pii','case',30,'APPROVED',true,true,false,$3,$3)`, `${org}-rp`, org, new Date("2026-01-01T00:00:00Z"));
  await p.$executeRawUnsafe(`INSERT INTO "LegalHold" (id,"organizationId",name,"scopeType",status,"updatedAt") VALUES ($1,$2,'H','ORGANIZATION','ACTIVE',$3)`, `${org}-lh`, org, new Date("2026-01-01T00:00:00Z"));
  await p.$executeRawUnsafe(
    `INSERT INTO "ComplianceIncident" (id,"organizationId","incidentType",severity,lifecycle,"assessmentStatus","sourceClass","idempotencyKey","openBlockerCount",
       "decisionBy","decisionAt","decisionEvidenceHash","decisionVersion","resolvedBy","resolvedAt","closedBy","closedAt","updatedAt")
     VALUES ($1,$2,'SECURITY','HIGH','CLOSED','DECISION_RECORDED','MANUAL',$1,0,'dec',$3,$4,1,'res',$3,'clo',$3,$3)`,
    `${org}-inc`, org, new Date("2026-01-01T00:00:00Z"), "a".repeat(64));
}

const target = { incidentId: null, processingActivityId: null, privacyRequestId: null };
async function packField(id: string, col: string): Promise<unknown> {
  const p = await db();
  const r = await p.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT "${col}" AS v FROM "ComplianceEvidencePack" WHERE id=$1`, id);
  return r[0]?.v ?? null;
}

it("integration database is configured (guards against a silent all-skip pass)", () => { expect(PG_ENABLED).toBe(true); });

describe.skipIf(!PG_ENABLED)("Phase 97 — evidence pack linearization (real PG)", () => {
  beforeAll(async () => {
    await cleanup();
    const p = await db();
    for (const org of [ORG, ORG_B]) await p.$executeRawUnsafe(`INSERT INTO "Organization" (id,name,slug,settings,"createdAt","updatedAt") VALUES ($1,'O',$2,'{}'::jsonb,now(),now())`, org, `${org}-slug`);
    await seedOrgData(ORG);
  });
  afterAll(cleanup);
  beforeEach(clearPacks);

  it("migration + constraints exist", async () => {
    const p = await db();
    const mig = await p.$queryRawUnsafe<{ migration_name: string }[]>(`SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%compliance_evidence_packs%' AND finished_at IS NOT NULL`);
    expect(mig.length).toBeGreaterThanOrEqual(1);
    const con = await p.$queryRawUnsafe<{ conname: string }[]>(`SELECT conname FROM pg_constraint WHERE conname IN (
      'ComplianceEvidencePackItem_pack_tuple_fkey','ComplianceEvidencePack_incident_tuple_fkey',
      'ComplianceEvidencePack_processing_activity_tuple_fkey','ComplianceEvidencePack_privacy_request_tuple_fkey',
      'ComplianceEvidencePack_scope_target_check')`);
    expect(con.length).toBe(5);
  });

  it("generates an ORGANIZATION pack: READY, deterministic hash, items present, no forbidden data", async () => {
    const c = await createEvidencePackForOrg({ organizationId: ORG, actorId: "u1", idempotencyKey: `${TAG}-k1`, scopeType: "ORGANIZATION", target });
    expect(c.ok).toBe(true);
    const g = await generateEvidencePackForOrg({ id: c.ok ? c.row.id : "", organizationId: ORG, actorId: "u1" });
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(g.row.lifecycle).toBe("READY");
    expect(g.row.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(g.row.itemCount).toBeGreaterThan(0);
    expect(g.row.snapshotAt).not.toBeNull();
    const items = await getEvidencePackItemsForOrg(g.row.id, ORG);
    expect(items.length).toBe(g.row.itemCount);
    for (const it of items) expect(it.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
    // Forbidden-field scan over the whole manifest + items.
    const blob = JSON.stringify(g.row.manifestJson) + JSON.stringify(items.map((i) => i.safeMetadata));
    for (const bad of ["sensitiveSummary", "email", "ipAddress", "userAgent", "\"content\"", "\"description\"", "\"name\"", "\"purpose\"", "\"title\"", "planJson", "packageKey", "tokenHash", "apiKey", "secret"]) {
      expect(blob.includes(bad)).toBe(false);
    }
  });

  it("SAME_SNAPSHOT_SAME_DATA_SAME_HASH — two packs over identical data share a manifestHash", async () => {
    const a = await createEvidencePackForOrg({ organizationId: ORG, actorId: "u1", idempotencyKey: `${TAG}-ka`, scopeType: "ORGANIZATION", target });
    const ga = await generateEvidencePackForOrg({ id: a.ok ? a.row.id : "", organizationId: ORG, actorId: "u1" });
    const b = await createEvidencePackForOrg({ organizationId: ORG, actorId: "u2", idempotencyKey: `${TAG}-kb`, scopeType: "ORGANIZATION", target });
    const gb = await generateEvidencePackForOrg({ id: b.ok ? b.row.id : "", organizationId: ORG, actorId: "u2" });
    expect(ga.ok && gb.ok).toBe(true);
    if (ga.ok && gb.ok) expect(ga.row.manifestHash).toBe(gb.row.manifestHash);
  });

  it("idempotent creation + generation — one authoritative pack per key", async () => {
    const a = await createEvidencePackForOrg({ organizationId: ORG, actorId: "u1", idempotencyKey: `${TAG}-idem`, scopeType: "ORGANIZATION", target });
    const b = await createEvidencePackForOrg({ organizationId: ORG, actorId: "u1", idempotencyKey: `${TAG}-idem`, scopeType: "ORGANIZATION", target });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.row.id).toBe(b.row.id);
    const p = await db();
    const n = await p.$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM "ComplianceEvidencePack" WHERE "organizationId"=$1 AND "idempotencyKey"=$2`, ORG, `${TAG}-idem`);
    expect(n[0].c).toBe(1);
  });

  it("BARRIER — two finalizers race → exactly one finalization, no duplicate items", async () => {
    const c = await createEvidencePackForOrg({ organizationId: ORG, actorId: "u1", idempotencyKey: `${TAG}-race`, scopeType: "ORGANIZATION", target });
    const id = c.ok ? c.row.id : "";
    const p = await db();
    let opRes: Awaited<ReturnType<typeof generateEvidencePackForOrg>> | null = null;
    let opP: Promise<void> | null = null;
    // txA holds the pack row lock while a concurrent generate provably blocks; then txA
    // finalizes to READY itself and commits. The blocked generate must NOT double-finalize.
    await p.$transaction(async (txA) => {
      await txA.$queryRawUnsafe(`SELECT "id" FROM "ComplianceEvidencePack" WHERE "id"=$1 AND "organizationId"=$2 FOR UPDATE`, id, ORG);
      opP = generateEvidencePackForOrg({ id, organizationId: ORG, actorId: "u2" }).then((r) => { opRes = r; });
      await sleep(500);
      expect(opRes).toBeNull(); // provably blocked on the pack lock
      await txA.$executeRawUnsafe(`UPDATE "ComplianceEvidencePack" SET lifecycle='READY',readiness='COMPLETE',"manifestHash"=$2,"manifestJson"='{"x":1}'::jsonb,"itemCount"=0,"snapshotAt"=now(),"generatedBy"='txA',"generatedAt"=now(),"updatedAt"=now() WHERE id=$1`, id, "f".repeat(64));
    }, { timeout: 20000, maxWait: 20000 });
    await opP;
    expect(opRes!.ok).toBe(true); // returns the (already) READY pack, idempotent
    expect(await packField(id, "generatedBy")).toBe("txA"); // the blocked op did NOT overwrite
    const items = await getEvidencePackItemsForOrg(id, ORG);
    expect(items.length).toBe(0); // no duplicate/partial items from the losing generate
  });

  it("READY pack + items are immutable; only governed revocation follows", async () => {
    const c = await createEvidencePackForOrg({ organizationId: ORG, actorId: "u1", idempotencyKey: `${TAG}-imm`, scopeType: "ORGANIZATION", target });
    const g = await generateEvidencePackForOrg({ id: c.ok ? c.row.id : "", organizationId: ORG, actorId: "u1" });
    const id = g.ok ? g.row.id : "";
    const p = await db();
    await expect(p.$executeRawUnsafe(`UPDATE "ComplianceEvidencePack" SET "manifestHash"=$2 WHERE id=$1`, id, "0".repeat(64))).rejects.toBeTruthy();
    await expect(p.$executeRawUnsafe(`UPDATE "ComplianceEvidencePackItem" SET "evidenceStatus"='X' WHERE "evidencePackId"=$1`, id)).rejects.toBeTruthy();
    await expect(p.$executeRawUnsafe(`DELETE FROM "ComplianceEvidencePackItem" WHERE "evidencePackId"=$1`, id)).rejects.toBeTruthy();
    const originalHash = g.ok ? g.row.manifestHash : null;
    // Governed revocation preserves evidence.
    const rev = await revokeEvidencePackForOrg({ id, organizationId: ORG, actorId: "u9" });
    expect(rev.ok).toBe(true);
    if (rev.ok) { expect(rev.row.lifecycle).toBe("REVOKED"); expect(rev.row.manifestHash).toBe(originalHash); expect(rev.row.revokedBy).toBe("u9"); }
    // A revoked pack cannot be revoked again.
    const rev2 = await revokeEvidencePackForOrg({ id, organizationId: ORG, actorId: "u9" });
    expect(rev2.ok).toBe(false); if (!rev2.ok) expect(rev2.reason).toBe("NOT_REVOCABLE");
  });

  it("historical pack hash unchanged after source data changes", async () => {
    const c = await createEvidencePackForOrg({ organizationId: ORG, actorId: "u1", idempotencyKey: `${TAG}-hist`, scopeType: "ORGANIZATION", target });
    const g = await generateEvidencePackForOrg({ id: c.ok ? c.row.id : "", organizationId: ORG, actorId: "u1" });
    const id = g.ok ? g.row.id : "";
    const before = await packField(id, "manifestHash");
    const p = await db();
    await p.$executeRawUnsafe(`UPDATE "ProcessingActivity" SET "approvalState"='PENDING_REVIEW',"updatedAt"=now() WHERE id=$1`, `${ORG}-pa`);
    const after = await packField(id, "manifestHash");
    expect(after).toBe(before); // the stored historical evidence is immutable
    // restore
    await p.$executeRawUnsafe(`UPDATE "ProcessingActivity" SET "approvalState"='APPROVED',"updatedAt"=$2 WHERE id=$1`, `${ORG}-pa`, new Date("2026-01-01T00:00:00Z"));
  });

  it("cross-tenant target is rejected (uniform failure, no pack)", async () => {
    // A pack for ORG_B whose target incident belongs to ORG must be rejected by the FK.
    const p = await db();
    await p.$executeRawUnsafe(`INSERT INTO "ComplianceIncident" (id,"organizationId","incidentType",severity,lifecycle,"assessmentStatus","sourceClass","idempotencyKey","openBlockerCount","decisionVersion","updatedAt") VALUES ($1,$2,'SECURITY','LOW','OPEN','REVIEW_REQUIRED','MANUAL',$1,0,0,now()) ON CONFLICT DO NOTHING`, `${ORG}-inc2`, ORG);
    const r = await createEvidencePackForOrg({ organizationId: ORG_B, actorId: "u1", idempotencyKey: `${TAG}-xt`, scopeType: "INCIDENT", target: { incidentId: `${ORG}-inc2`, processingActivityId: null, privacyRequestId: null } });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe("TARGET_NOT_FOUND");
    const n = await p.$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM "ComplianceEvidencePack" WHERE "organizationId"=$1 AND "idempotencyKey"=$2`, ORG_B, `${TAG}-xt`);
    expect(n[0].c).toBe(0);
  });

  it("foreign-tenant read returns null (uniform not-found)", async () => {
    const c = await createEvidencePackForOrg({ organizationId: ORG, actorId: "u1", idempotencyKey: `${TAG}-ft`, scopeType: "ORGANIZATION", target });
    const id = c.ok ? c.row.id : "";
    expect(await getEvidencePackForOrg(id, ORG_B)).toBeNull();
    expect(await getEvidencePackForOrg(id, ORG)).not.toBeNull();
  });

  it("INCIDENT scope pack generates and reflects its incident", async () => {
    const c = await createEvidencePackForOrg({ organizationId: ORG, actorId: "u1", idempotencyKey: `${TAG}-inc`, scopeType: "INCIDENT", target: { incidentId: `${ORG}-inc`, processingActivityId: null, privacyRequestId: null } });
    const g = await generateEvidencePackForOrg({ id: c.ok ? c.row.id : "", organizationId: ORG, actorId: "u1" });
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    const items = await getEvidencePackItemsForOrg(g.row.id, ORG);
    expect(items.some((i) => i.entityType === "COMPLIANCE_INCIDENT")).toBe(true);
  });
});
