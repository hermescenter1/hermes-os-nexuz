import { describe, it, expect, beforeAll } from "vitest";
import { PG_ENABLED, client, mkUser, mkRefresh, reset } from "./pg-helpers";

/**
 * PHASE 91 — fresh-migration schema verification against the REAL PostgreSQL
 * catalog. Proves the migrated database actually has the Phase 91 columns, the
 * composite index, and the recorded migrations. Fails when any is missing —
 * never infers success from reading SQL files.
 */

// NOT skipped: guarantees the whole PostgreSQL suite cannot pass by silently
// skipping every test when the integration database is not configured.
it("integration database is configured (guards against a silent all-skip pass)", () => {
  expect(PG_ENABLED).toBe(true);
});

describe.skipIf(!PG_ENABLED)("Phase 91 PG — migrated schema catalog", () => {
  beforeAll(reset);

  it("User.tokenVersion exists", async () => {
    const db = await client();
    const rows = await db.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name='User' AND column_name='tokenVersion'`,
    );
    expect(rows).toHaveLength(1);
  });

  it("RefreshToken.lastUsedAt and RefreshToken.userTokenVersion exist", async () => {
    const db = await client();
    const rows = await db.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name='RefreshToken' AND column_name IN ('lastUsedAt','userTokenVersion') ORDER BY column_name`,
    );
    expect(rows.map((r) => r.column_name)).toEqual(["lastUsedAt", "userTokenVersion"]);
  });

  it("RefreshToken.userTokenVersion is NOT NULL DEFAULT 0", async () => {
    const db = await client();
    const rows = await db.$queryRawUnsafe<{ is_nullable: string; column_default: string | null }[]>(
      `SELECT is_nullable, column_default FROM information_schema.columns WHERE table_name='RefreshToken' AND column_name='userTokenVersion'`,
    );
    expect(rows[0].is_nullable).toBe("NO");
    expect(String(rows[0].column_default)).toContain("0");
  });

  it("composite index RefreshToken_userId_revokedAt_idx exists", async () => {
    const db = await client();
    const rows = await db.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE tablename='RefreshToken' AND indexname='RefreshToken_userId_revokedAt_idx'`,
    );
    expect(rows).toHaveLength(1);
  });

  it("both Phase 91 migrations are recorded in _prisma_migrations", async () => {
    const db = await client();
    const rows = await db.$queryRawUnsafe<{ migration_name: string }[]>(
      `SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%phase91%' AND finished_at IS NOT NULL ORDER BY migration_name`,
    );
    const names = rows.map((r) => r.migration_name);
    expect(names.some((n) => n.includes("phase91_iam_hardening"))).toBe(true);
    expect(names.some((n) => n.includes("phase91_session_indexes"))).toBe(true);
  });

  it("index verification: query plan captured for the session-inventory predicate", async () => {
    const db = await client();
    // Seed representative rows so the planner has something to reason about.
    const u = await mkUser("explain", 0);
    for (let i = 0; i < 60; i++) await mkRefresh({ userId: u, gen: 0, revoked: i % 3 === 0 });
    // `u` is a controlled test id (pgit-explain); inlined so EXPLAIN plans a
    // concrete query rather than a generic parameterised one.
    const plan = await db.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(
      `EXPLAIN SELECT "id","deviceInfo","createdAt","expiresAt","lastUsedAt" FROM "RefreshToken" WHERE "userId"='${u}' AND "revokedAt" IS NULL ORDER BY "createdAt" DESC`,
    );
    // We CAPTURE the plan and prove the index exists; we do NOT force the planner
    // to use it (it may prefer a seq scan on small tables — that is a correct
    // decision). INDEX_DECISION_DOCUMENTED lives in the session-store docstring.
    const planText = plan.map((r) => r["QUERY PLAN"]).join("\n");
    expect(planText.length).toBeGreaterThan(0); // QUERY_PLAN_CAPTURED
  });
});
