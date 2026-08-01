import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import { sweepAuditRetention } from "@/lib/observability/audit-retention";
import { findAuditEventsByCorrelation } from "@/lib/audit/audit-service";

/**
 * PHASE 92 — real-PostgreSQL rehearsal for the observability migration + audit
 * retention policy. Proves against the actual catalog (never by reading SQL):
 *   - the two additive AuditLog indexes exist and the migration is recorded;
 *   - the retention sweep deletes only OLD, NON-PROTECTED rows in bounded
 *     batches, and leaves recent rows and security/compliance rows intact;
 *   - dry-run deletes nothing;
 *   - correlationId lookup returns the correlated rows.
 *
 * Runs only under vitest.phase92-postgres.config.ts in CI.
 */

const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;
const CID = "pgit92-";
const DAY = 24 * 60 * 60 * 1000;

async function db() {
  const p = await getPrisma();
  if (!p) throw new Error("PG rehearsal requires a real Prisma client");
  return p as unknown as {
    $queryRawUnsafe: <T = unknown>(sql: string, ...a: unknown[]) => Promise<T>;
    auditLog: {
      create: (a: unknown) => Promise<{ id: string }>;
      findMany: (a: unknown) => Promise<{ id: string; action: string; correlationId: string | null }[]>;
      count: (a?: unknown) => Promise<number>;
      deleteMany: (a: unknown) => Promise<{ count: number }>;
    };
  };
}

async function cleanup() {
  const p = await db();
  await p.auditLog.deleteMany({ where: { correlationId: { startsWith: CID } } });
}

it("integration database is configured (guards against a silent all-skip pass)", () => {
  expect(PG_ENABLED).toBe(true);
});

describe.skipIf(!PG_ENABLED)("Phase 92 PG — observability indexes + retention", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("both additive AuditLog indexes exist", async () => {
    const p = await db();
    const rows = await p.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE tablename='AuditLog' AND indexname IN ('AuditLog_createdAt_idx','AuditLog_correlationId_idx') ORDER BY indexname`,
    );
    expect(rows.map((r) => r.indexname)).toEqual(["AuditLog_correlationId_idx", "AuditLog_createdAt_idx"]);
  });

  it("the Phase 92 migration is recorded as applied", async () => {
    const p = await db();
    const rows = await p.$queryRawUnsafe<{ migration_name: string }[]>(
      `SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%phase92%' AND finished_at IS NOT NULL`,
    );
    expect(rows.some((r) => r.migration_name.includes("phase92_audit_observability_indexes"))).toBe(true);
  });

  it("retention deletes old ordinary rows but preserves recent and protected rows", async () => {
    const p = await db();
    const now = new Date();
    const old = new Date(now.getTime() - 400 * DAY);

    await p.auditLog.create({ data: { action: "case.updated", entityType: "case", metadata: {}, createdAt: old, correlationId: `${CID}old` } });
    await p.auditLog.create({ data: { action: "login.failure", entityType: "user", metadata: {}, createdAt: old, correlationId: `${CID}prot` } });
    await p.auditLog.create({ data: { action: "case.updated", entityType: "case", metadata: {}, createdAt: now, correlationId: `${CID}recent` } });

    // correlation lookup finds the correlated row (index-backed path)
    const byCid = await findAuditEventsByCorrelation(`${CID}old`);
    expect(byCid.storageMode).toBe("database");
    expect(byCid.events.some((e) => e.correlationId === `${CID}old`)).toBe(true);

    // dry-run: nothing deleted, but the old ordinary row is a candidate
    const dry = await sweepAuditRetention({ dryRun: true, retentionDays: 365, now });
    expect(dry.deleted).toBe(0);
    expect(dry.candidates).toBeGreaterThanOrEqual(1);

    // apply: bounded delete
    const applied = await sweepAuditRetention({ dryRun: false, retentionDays: 365, batchSize: 100, now });
    expect(applied.deleted).toBeGreaterThanOrEqual(1);

    const remaining = await p.auditLog.findMany({ where: { correlationId: { startsWith: CID } }, select: { id: true, action: true, correlationId: true } });
    const cids = remaining.map((r) => r.correlationId);
    expect(cids).not.toContain(`${CID}old`);   // old ordinary deleted
    expect(cids).toContain(`${CID}prot`);      // protected survives at any age
    expect(cids).toContain(`${CID}recent`);    // recent survives
  });
});
