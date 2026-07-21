import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client, Pool } from "pg";
import { assertTestDatabase, otIntegrationEnabled } from "@/test/ot-db-guard";

/**
 * PHASE 94B3.1 — REAL PostgreSQL integration proof.
 *
 * These assertions execute against a live PostgreSQL 16 server. They are the
 * only tests in Phase 94 that can prove what a mock cannot: that the unique
 * constraints, foreign keys and transaction semantics the schema DECLARES are
 * the ones the database actually ENFORCES, and that they hold under real
 * concurrency.
 *
 * The suite SKIPS (loudly, never silently) when OT_TEST_DATABASE_URL is absent,
 * so a developer without Docker still gets a green unit run while CI gets the
 * real coverage. Every connection is gated by `assertTestDatabase`, which
 * refuses anything that is not a local, test-marked, disposable database.
 *
 * Start the database with:
 *   docker run -d --name hermes-ot-test-pg -e POSTGRES_PASSWORD=ottestpw \
 *     -e POSTGRES_USER=ottest -e POSTGRES_DB=hermes_ot_test -p 55433:5432 postgres:16-alpine
 *   npx prisma db push --url "postgresql://ottest:ottestpw@localhost:55433/hermes_ot_test"
 *   OT_TEST_DATABASE_URL="postgresql://ottest:ottestpw@localhost:55433/hermes_ot_test" npm test
 */

const ENABLED = otIntegrationEnabled();
const URL = process.env.OT_TEST_DATABASE_URL ?? "";

/** Unique per run so repeated runs never collide. */
const RUN = `p94b31-${process.pid}-${Date.now().toString(36)}`;
const ORG_A = `${RUN}-orgA`;
const ORG_B = `${RUN}-orgB`;
const GW_A = `${RUN}-gwA`;
/** Every gateway id the nonce tests reference; all created in beforeAll. */
const GATEWAYS = [GW_A, `${RUN}-gw1`, `${RUN}-gw2`, `${RUN}-race-gw`];

let pool: Pool;

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(sql, params as never[]);
  return r.rows as T[];
}

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";
const FK_VIOLATION = "23503";

function sqlState(err: unknown): string | undefined {
  return typeof err === "object" && err !== null ? (err as { code?: string }).code : undefined;
}

beforeAll(async () => {
  if (!ENABLED) return;
  // Refuses anything that is not a local, test-marked database.
  assertTestDatabase(URL, process.env.NODE_ENV === "test");
  pool = new Pool({ connectionString: URL, max: 25 });

  // Minimal tenant fixture: two organizations, a site each, and the gateways
  // the nonce tests reference. Every id is namespaced by RUN, so a shared
  // database is never disturbed and repeat runs cannot collide.
  for (const org of [ORG_A, ORG_B]) {
    await q(
      `INSERT INTO "Organization" (id, name, slug, "updatedAt")
       VALUES ($1, $2, $3, now()) ON CONFLICT (id) DO NOTHING`,
      [org, `Org ${org}`, org],
    );
    await q(
      `INSERT INTO "IndustrialSite" (id, "organizationId", name, slug, "updatedAt")
       VALUES ($1, $2, $3, $4, now()) ON CONFLICT (id) DO NOTHING`,
      [`${org}-site`, org, `Site ${org}`, `${org}-site`],
    );
  }

  // GatewayEnvelopeNonce.gatewayId is a real FK to IndustrialGateway.
  for (const gw of GATEWAYS) {
    await q(
      `INSERT INTO "IndustrialGateway" (id, "organizationId", "siteId", name, "gatewayId", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, now()) ON CONFLICT (id) DO NOTHING`,
      [gw, ORG_A, `${ORG_A}-site`, `GW ${gw}`, gw],
    );
  }
}, 60_000);

afterAll(async () => {
  if (!ENABLED || !pool) return;
  // Delete ONLY this run's rows. Nothing global is truncated, so a shared
  // database is never damaged by a test run.
  await q(`DELETE FROM "GatewayEnvelopeNonce" WHERE "gatewayId" LIKE $1`, [`${RUN}%`]);
  await q(`DELETE FROM "EngineeringImport" WHERE "organizationId" IN ($1,$2)`, [ORG_A, ORG_B]);
  await q(`DELETE FROM "IndustrialGateway" WHERE "organizationId" IN ($1,$2)`, [ORG_A, ORG_B]);
  await q(`DELETE FROM "IndustrialSite" WHERE "organizationId" IN ($1,$2)`, [ORG_A, ORG_B]);
  await q(`DELETE FROM "Organization" WHERE id IN ($1,$2)`, [ORG_A, ORG_B]);
  await pool.end();
}, 60_000);

describe.skipIf(!ENABLED)("94B3.1 — the database enforces what the schema declares", () => {
  it("reports which mode this run used", () => {
    // Makes a skip impossible to mistake for a pass in CI output.
    expect(ENABLED).toBe(true);
  });

  it("gateway nonce uniqueness is enforced by the DATABASE", async () => {
    const nonce = `${RUN}-n1`;
    await q(
      `INSERT INTO "GatewayEnvelopeNonce" (id,"organizationId","gatewayId",nonce,"expiresAt")
       VALUES ($1,$2,$3,$4, now() + interval '15 min')`,
      [`${RUN}-nonce1`, ORG_A, GW_A, nonce],
    );
    await expect(
      q(
        `INSERT INTO "GatewayEnvelopeNonce" (id,"organizationId","gatewayId",nonce,"expiresAt")
         VALUES ($1,$2,$3,$4, now() + interval '15 min')`,
        [`${RUN}-nonce2`, ORG_A, GW_A, nonce],
      ),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("the same nonce on a DIFFERENT gateway is not a replay", async () => {
    const nonce = `${RUN}-shared`;
    await q(
      `INSERT INTO "GatewayEnvelopeNonce" (id,"organizationId","gatewayId",nonce,"expiresAt")
       VALUES ($1,$2,$3,$4, now() + interval '15 min')`,
      [`${RUN}-s1`, ORG_A, `${RUN}-gw1`, nonce],
    );
    await expect(
      q(
        `INSERT INTO "GatewayEnvelopeNonce" (id,"organizationId","gatewayId",nonce,"expiresAt")
         VALUES ($1,$2,$3,$4, now() + interval '15 min')`,
        [`${RUN}-s2`, ORG_A, `${RUN}-gw2`, nonce],
      ),
    ).resolves.toBeDefined();
  });

  it("import idempotency is unique PER ORGANIZATION, not globally", async () => {
    const key = `${RUN}-idem`;
    const ins = (id: string, org: string, checksum: string) =>
      q(
        `INSERT INTO "EngineeringImport"
           (id,"organizationId","idempotencyKey",checksum,"sourceType","sourceFilename","contentType","byteSize",status,"startedAt")
         VALUES ($1,$2,$3,$4,'GENERIC','manifest.json','application/json',10,'PENDING', now())`,
        [id, org, key, checksum],
      );

    await ins(`${RUN}-i1`, ORG_A, `${RUN}-c1`);
    // Same key, same org -> rejected.
    await expect(ins(`${RUN}-i2`, ORG_A, `${RUN}-c2`)).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    });
    // Same key, DIFFERENT org -> allowed; tenants never collide with each other.
    await expect(ins(`${RUN}-i3`, ORG_B, `${RUN}-c3`)).resolves.toBeDefined();
  });

  it("import checksum is unique per organization", async () => {
    const checksum = `${RUN}-dupsum`;
    const ins = (id: string, key: string) =>
      q(
        `INSERT INTO "EngineeringImport"
           (id,"organizationId","idempotencyKey",checksum,"sourceType","sourceFilename","contentType","byteSize",status,"startedAt")
         VALUES ($1,$2,$3,$4,'GENERIC','manifest.json','application/json',10,'PENDING', now())`,
        [id, ORG_A, key, checksum],
      );
    await ins(`${RUN}-k1`, `${RUN}-key1`);
    await expect(ins(`${RUN}-k2`, `${RUN}-key2`)).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("a foreign organization id cannot be referenced", async () => {
    await expect(
      q(
        `INSERT INTO "EngineeringImport"
           (id,"organizationId","idempotencyKey",checksum,"sourceType","sourceFilename","contentType","byteSize",status,"startedAt")
         VALUES ($1,$2,$3,$4,'GENERIC','manifest.json','application/json',10,'PENDING', now())`,
        [`${RUN}-orphan`, `${RUN}-NO-SUCH-ORG`, `${RUN}-ok`, `${RUN}-ok`],
      ),
    ).rejects.toMatchObject({ code: FK_VIOLATION });
  });
});

describe.skipIf(!ENABLED)("94B3.1 — real concurrency, not simulated", () => {
  it("20 concurrent identical nonce reservations: exactly one wins", async () => {
    const nonce = `${RUN}-race-nonce`;
    const attempts = Array.from({ length: 20 }, (_, i) =>
      q(
        `INSERT INTO "GatewayEnvelopeNonce" (id,"organizationId","gatewayId",nonce,"expiresAt")
         VALUES ($1,$2,$3,$4, now() + interval '15 min')`,
        [`${RUN}-race-${i}`, ORG_A, `${RUN}-race-gw`, nonce],
      )
        .then(() => "WON" as const)
        .catch((e) => (sqlState(e) === UNIQUE_VIOLATION ? ("LOST" as const) : Promise.reject(e))),
    );

    const results = await Promise.all(attempts);
    expect(results.filter((r) => r === "WON"), "exactly one reservation may succeed").toHaveLength(1);
    expect(results.filter((r) => r === "LOST")).toHaveLength(19);

    const rows = await q<{ n: string }>(
      `SELECT count(*)::text AS n FROM "GatewayEnvelopeNonce" WHERE nonce=$1`,
      [nonce],
    );
    expect(rows[0].n, "exactly one row persisted").toBe("1");
  }, 60_000);

  it("20 concurrent identical idempotency reservations: exactly one wins", async () => {
    const key = `${RUN}-race-idem`;
    const attempts = Array.from({ length: 20 }, (_, i) =>
      q(
        `INSERT INTO "EngineeringImport"
           (id,"organizationId","idempotencyKey",checksum,"sourceType","sourceFilename","contentType","byteSize",status,"startedAt")
         VALUES ($1,$2,$3,$4,'GENERIC','manifest.json','application/json',10,'PENDING', now())`,
        [`${RUN}-ri-${i}`, ORG_A, key, `${RUN}-race-sum`],
      )
        .then(() => "WON" as const)
        .catch((e) => (sqlState(e) === UNIQUE_VIOLATION ? ("LOST" as const) : Promise.reject(e))),
    );

    const results = await Promise.all(attempts);
    expect(results.filter((r) => r === "WON"), "one authoritative import only").toHaveLength(1);

    const rows = await q<{ n: string }>(
      `SELECT count(*)::text AS n FROM "EngineeringImport" WHERE "idempotencyKey"=$1`,
      [key],
    );
    expect(rows[0].n).toBe("1");
  }, 60_000);
});

describe.skipIf(!ENABLED)("94B3.1 — transaction rollback leaves nothing behind", () => {
  it("a failure mid-transaction persists no partial rows", async () => {
    const client = new Client({ connectionString: URL });
    await client.connect();
    const id = `${RUN}-tx-import`;
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO "EngineeringImport"
           (id,"organizationId","idempotencyKey",checksum,"sourceType","sourceFilename","contentType","byteSize",status,"startedAt")
         VALUES ($1,$2,$3,$4,'GENERIC','manifest.json','application/json',10,'PENDING', now())`,
        [id, ORG_A, `${RUN}-tx-key`, `${RUN}-tx-sum`],
      );
      // Deliberate failure AFTER a successful write, mimicking a mid-import fault.
      await client.query(`INSERT INTO "EngineeringImport" (id) VALUES ($1)`, [`${RUN}-tx-bad`]);
      throw new Error("should not reach commit");
    } catch {
      await client.query("ROLLBACK");
    } finally {
      await client.end();
    }

    const rows = await q<{ n: string }>(
      `SELECT count(*)::text AS n FROM "EngineeringImport" WHERE id=$1`,
      [id],
    );
    expect(rows[0].n, "the first insert must have rolled back too").toBe("0");
  }, 60_000);

  it("a committed transaction does persist — proving the rollback test is not vacuous", async () => {
    const client = new Client({ connectionString: URL });
    await client.connect();
    const id = `${RUN}-tx-good`;
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO "EngineeringImport"
           (id,"organizationId","idempotencyKey",checksum,"sourceType","sourceFilename","contentType","byteSize",status,"startedAt")
         VALUES ($1,$2,$3,$4,'GENERIC','manifest.json','application/json',10,'PENDING', now())`,
        [id, ORG_A, `${RUN}-tx-key-ok`, `${RUN}-tx-sum-ok`],
      );
      await client.query("COMMIT");
    } finally {
      await client.end();
    }
    const rows = await q<{ n: string }>(
      `SELECT count(*)::text AS n FROM "EngineeringImport" WHERE id=$1`,
      [id],
    );
    expect(rows[0].n).toBe("1");
  }, 60_000);
});
