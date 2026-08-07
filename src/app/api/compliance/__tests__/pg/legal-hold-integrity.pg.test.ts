import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPrisma } from "@/lib/db/prisma";

/**
 * Phase 97 — real-PostgreSQL rehearsal for the legal-hold ownership & integrity
 * migration. Proves against the ACTUAL catalog and constraints (never by reading
 * SQL):
 *   - the additive migration is recorded and the two org foreign keys exist;
 *   - an invalid organizationId is rejected by PostgreSQL (no orphan ownership);
 *   - valid organization ownership succeeds;
 *   - deleting an organization that still holds a LegalHold is RESTRICTED — the
 *     hold is neither orphaned nor destroyed;
 *   - a RetentionPolicy is CASCADE-owned;
 *   - cross-tenant reads remain database-predicate scoped.
 *
 * Runs only under a PostgreSQL rehearsal config in CI (excluded from the unit run
 * via the *.pg.test.ts exclusion). Locally BLOCKED without a Docker PostgreSQL.
 */

const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;
const TAG = "pgit97-legalhold";

type Pg = {
  $queryRawUnsafe: <T = unknown>(sql: string, ...a: unknown[]) => Promise<T>;
  organization: { create: (a: unknown) => Promise<{ id: string }>; delete: (a: unknown) => Promise<unknown>; deleteMany: (a: unknown) => Promise<{ count: number }> };
  legalHold: { create: (a: unknown) => Promise<{ id: string }>; findFirst: (a: unknown) => Promise<{ id: string } | null>; count: (a?: unknown) => Promise<number>; deleteMany: (a: unknown) => Promise<{ count: number }> };
  retentionPolicy: { create: (a: unknown) => Promise<{ id: string }>; count: (a?: unknown) => Promise<number>; deleteMany: (a: unknown) => Promise<{ count: number }> };
};

async function db(): Promise<Pg> {
  const p = await getPrisma();
  if (!p) throw new Error("PG rehearsal requires a real Prisma client");
  return p as unknown as Pg;
}

async function cleanup() {
  const p = await db();
  // Release the RESTRICT before removing the org fixtures.
  await p.legalHold.deleteMany({ where: { name: { startsWith: TAG } } });
  await p.retentionPolicy.deleteMany({ where: { name: { startsWith: TAG } } });
  await p.organization.deleteMany({ where: { slug: { startsWith: TAG } } });
}

it("integration database is configured (guards against a silent all-skip pass)", () => {
  expect(PG_ENABLED).toBe(true);
});

describe.skipIf(!PG_ENABLED)("Phase 97 PG — legal-hold ownership & integrity", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("the integrity migration is recorded as applied", async () => {
    const p = await db();
    const rows = await p.$queryRawUnsafe<{ migration_name: string }[]>(
      `SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%phase97_legal_hold_integrity%' AND finished_at IS NOT NULL`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("both organization foreign keys exist", async () => {
    const p = await db();
    const rows = await p.$queryRawUnsafe<{ conname: string }[]>(
      `SELECT conname FROM pg_constraint WHERE contype='f' AND conname IN ('LegalHold_organizationId_fkey','RetentionPolicy_organizationId_fkey') ORDER BY conname`,
    );
    expect(rows.map((r) => r.conname)).toEqual(["LegalHold_organizationId_fkey", "RetentionPolicy_organizationId_fkey"]);
  });

  it("rejects an invalid organizationId (no orphan ownership)", async () => {
    const p = await db();
    await expect(
      p.legalHold.create({ data: { name: `${TAG}-orphan`, organizationId: "org-does-not-exist", scopeType: "ORGANIZATION", status: "PROPOSED" } }),
    ).rejects.toBeTruthy();
  });

  it("valid ownership succeeds and org deletion is RESTRICTED for a hold", async () => {
    const p = await db();
    const org = await p.organization.create({ data: { name: `${TAG} org`, slug: `${TAG}-a`, settings: {} } });
    const hold = await p.legalHold.create({ data: { name: `${TAG}-h`, organizationId: org.id, scopeType: "ORGANIZATION", status: "ACTIVE" } });

    // Deleting the org while a hold references it must be blocked (RESTRICT).
    await expect(p.organization.delete({ where: { id: org.id } })).rejects.toBeTruthy();

    // The hold is neither orphaned nor destroyed.
    const still = await p.legalHold.findFirst({ where: { id: hold.id, organizationId: org.id } });
    expect(still).not.toBeNull();

    // Cross-tenant predicate scoping: a different org id never matches.
    const foreign = await p.legalHold.findFirst({ where: { id: hold.id, organizationId: "org-other" } });
    expect(foreign).toBeNull();
  });

  it("a RetentionPolicy is CASCADE-owned (removed with its org)", async () => {
    const p = await db();
    const org = await p.organization.create({ data: { name: `${TAG} org2`, slug: `${TAG}-b`, settings: {} } });
    await p.retentionPolicy.create({ data: { name: `${TAG}-p`, organizationId: org.id, dataClass: "pii", targetResource: "case" } });
    await p.organization.delete({ where: { id: org.id } }); // allowed — cascades the policy
    const remaining = await p.retentionPolicy.count({ where: { name: `${TAG}-p` } });
    expect(remaining).toBe(0);
  });
});
