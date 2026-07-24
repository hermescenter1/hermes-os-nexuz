import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { assertTestDatabase, resolveOtIntegrationMode } from "@/test/ot-db-guard";
import { buildOtServiceContext, type OtServiceContext } from "../../service-context";
import {
  createOtRepositories,
  createTransactionManager,
  type OtPrismaClient,
  type OtTransactionalPrismaClient,
} from "../prisma-adapters";
import type { OtRepositories } from "../ports";

/**
 * PHASE 94B3.2 — the adapters, executed against real PostgreSQL.
 *
 * These call the REPOSITORY ADAPTERS, not equivalent raw SQL. Raw SQL appears
 * only to build fixtures and to cross-check a result independently, because a
 * test that re-implements the query it is validating proves nothing about the
 * code that ships.
 *
 * With OT_DB_REQUIRED=1 an unusable database throws instead of skipping, so a
 * required run can never be green by omission.
 */

const MODE = resolveOtIntegrationMode();
const ENABLED = MODE.mode === "RUN";
const URL = process.env.OT_TEST_DATABASE_URL ?? "";

const RUN = `b32-${process.pid}-${Date.now().toString(36)}`;
const ORG_A = `${RUN}-orgA`;
const ORG_B = `${RUN}-orgB`;
const SITE_A1 = `${RUN}-siteA1`;
const SITE_A2 = `${RUN}-siteA2`;
const SITE_B1 = `${RUN}-siteB1`;
const GW_A1 = `${RUN}-gwA1`;
const GW_A2 = `${RUN}-gwA2`;
const GW_B1 = `${RUN}-gwB1`;
const ASSET_A1 = `${RUN}-assetA1`;
const ASSET_A2 = `${RUN}-assetA2`;
const ASSET_B1 = `${RUN}-assetB1`;

let pool: Pool;
let prisma: OtTransactionalPrismaClient;
let repos: OtRepositories;

/** Raw SQL — fixtures and independent cross-checks only. */
async function sql<T = Record<string, unknown>>(q: string, p: unknown[] = []): Promise<T[]> {
  const r = await pool.query(q, p as never[]);
  return r.rows as T[];
}

/** Trusted contexts, exactly as an HTTP route would construct them. */
const ctxAllSites = (): OtServiceContext =>
  buildOtServiceContext({ userId: `${RUN}-u`, organizationId: ORG_A, role: "ADMIN", allowedSiteIds: null });
const ctxA1Only = (): OtServiceContext =>
  buildOtServiceContext({ userId: `${RUN}-u1`, organizationId: ORG_A, role: "ENGINEER", allowedSiteIds: [SITE_A1] });
const ctxZeroSite = (): OtServiceContext =>
  buildOtServiceContext({ userId: `${RUN}-u0`, organizationId: ORG_A, role: "ENGINEER", allowedSiteIds: [] });
const ctxOrgB = (): OtServiceContext =>
  buildOtServiceContext({ userId: `${RUN}-ub`, organizationId: ORG_B, role: "ADMIN", allowedSiteIds: null });

beforeAll(async () => {
  if (!ENABLED) return;
  assertTestDatabase(URL, process.env.NODE_ENV === "test");
  pool = new Pool({ connectionString: URL, max: 30 });

  for (const [org, site, gw, asset] of [
    [ORG_A, SITE_A1, GW_A1, ASSET_A1],
    [ORG_B, SITE_B1, GW_B1, ASSET_B1],
  ] as const) {
    await sql(`INSERT INTO "Organization" (id,name,slug,"updatedAt") VALUES ($1,$2,$3,now()) ON CONFLICT DO NOTHING`, [org, `Org ${org}`, org]);
    await sql(`INSERT INTO "IndustrialSite" (id,"organizationId",name,slug,"updatedAt") VALUES ($1,$2,$3,$4,now()) ON CONFLICT DO NOTHING`, [site, org, `Site ${site}`, site]);
    await sql(`INSERT INTO "IndustrialGateway" (id,"organizationId","siteId",name,"gatewayId","updatedAt") VALUES ($1,$2,$3,$4,$5,now()) ON CONFLICT DO NOTHING`, [gw, org, site, `GW ${gw}`, gw]);
    await sql(`INSERT INTO "IndustrialAsset" (id,"organizationId","siteId",name,"updatedAt") VALUES ($1,$2,$3,$4,now()) ON CONFLICT DO NOTHING`, [asset, org, site, `Asset ${asset}`]);
  }
  // Reviewers referenced by finding transitions. `reviewedById` is a real FK to
  // User, so these must exist for a transition to be accepted. The password
  // hash is an obvious non-credential placeholder.
  for (const reviewer of [`${RUN}-r1`, `${RUN}-r2`]) {
    await sql(
      `INSERT INTO "User" (id,name,email,"passwordHash","updatedAt") VALUES ($1,$2,$3,$4,now()) ON CONFLICT DO NOTHING`,
      [reviewer, `Reviewer ${reviewer}`, `${reviewer}@test.invalid`, "not-a-real-hash"],
    );
  }

  // A second site inside Organization A, to prove site isolation WITHIN a tenant.
  await sql(`INSERT INTO "IndustrialSite" (id,"organizationId",name,slug,"updatedAt") VALUES ($1,$2,$3,$4,now()) ON CONFLICT DO NOTHING`, [SITE_A2, ORG_A, `Site ${SITE_A2}`, SITE_A2]);
  await sql(`INSERT INTO "IndustrialGateway" (id,"organizationId","siteId",name,"gatewayId","updatedAt") VALUES ($1,$2,$3,$4,$5,now()) ON CONFLICT DO NOTHING`, [GW_A2, ORG_A, SITE_A2, `GW ${GW_A2}`, GW_A2]);
  await sql(`INSERT INTO "IndustrialAsset" (id,"organizationId","siteId",name,"updatedAt") VALUES ($1,$2,$3,$4,now()) ON CONFLICT DO NOTHING`, [ASSET_A2, ORG_A, SITE_A2, `Asset ${ASSET_A2}`]);

  const { PrismaClient } = (await import("@prisma/client")) as unknown as {
    PrismaClient: new (o?: unknown) => unknown;
  };
  const { PrismaPg } = (await import("@prisma/adapter-pg")) as unknown as {
    PrismaPg: new (c: { connectionString: string }) => unknown;
  };
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL }) }) as OtTransactionalPrismaClient;
  repos = createOtRepositories(prisma as OtPrismaClient);
}, 120_000);

afterAll(async () => {
  if (!ENABLED || !pool) return;
  // Only this run's rows, children before parents.
  for (const t of ["EngineeringFinding", "AutomationTag", "AlarmDefinition", "IndustrialNetworkNode", "EngineeringProject", "EngineeringImport", "GatewayEnvelopeNonce", "EdgeGatewayProfile", "OtDeviceProfile"]) {
    await sql(`DELETE FROM "${t}" WHERE "organizationId" IN ($1,$2)`, [ORG_A, ORG_B]);
  }
  for (const t of ["IndustrialAsset", "IndustrialGateway", "IndustrialSite"]) {
    await sql(`DELETE FROM "${t}" WHERE "organizationId" IN ($1,$2)`, [ORG_A, ORG_B]);
  }
  await sql(`DELETE FROM "Organization" WHERE id IN ($1,$2)`, [ORG_A, ORG_B]);
  await sql(`DELETE FROM "User" WHERE id LIKE $1`, [`${RUN}%`]);
  await (prisma as unknown as { $disconnect?: () => Promise<void> }).$disconnect?.();
  await pool.end();
}, 120_000);

describe.skipIf(!ENABLED)("94B3.2 — gateway adapter tenant + site scope", () => {
  it("runs in required mode when demanded", () => {
    expect(ENABLED).toBe(true);
  });

  it("creates a profile and lists it for an org-wide actor", async () => {
    const created = await repos.gateways.createProfile(ctxAllSites(), {
      gatewayId: GW_A1,
      capabilities: ["PROJECT_METADATA_IMPORT"],
      signingKeyRef: "env:OT_GATEWAY_HMAC_PRIMARY",
    });
    expect(created.ok, JSON.stringify(created)).toBe(true);
    if (!created.ok) return;
    expect(created.value.siteId).toBe(SITE_A1);
    // The reference must NOT cross the boundary — only its presence.
    expect(created.value.signingConfigured).toBe(true);
    expect(JSON.stringify(created.value)).not.toContain("OT_GATEWAY_HMAC");

    const list = await repos.gateways.listVisible(ctxAllSites());
    expect(list.ok && list.value.items.some((g) => g.gatewayId === GW_A1)).toBe(true);
  });

  it("Organization B cannot read Organization A's gateway", async () => {
    const a = await repos.gateways.listVisible(ctxAllSites());
    expect(a.ok).toBe(true);
    if (!a.ok || a.value.items.length === 0) throw new Error("fixture missing");
    const id = a.value.items[0].id;

    const cross = await repos.gateways.findVisibleById(ctxOrgB(), id);
    expect(cross.ok).toBe(false);
    if (!cross.ok) expect(cross.code).toBe("NOT_FOUND");

    // …and identical to a genuinely nonexistent id: no existence disclosure.
    const missing = await repos.gateways.findVisibleById(ctxOrgB(), `${RUN}-no-such`);
    expect(JSON.stringify(cross)).toBe(JSON.stringify(missing));
  });

  it("Organization B cannot UPDATE Organization A's gateway", async () => {
    const a = await repos.gateways.listVisible(ctxAllSites());
    if (!a.ok || !a.value.items.length) throw new Error("fixture missing");
    const id = a.value.items[0].id;
    const res = await repos.gateways.updateLifecycle(ctxOrgB(), id, "DISABLED");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NOT_FOUND");

    const still = await repos.gateways.findVisibleById(ctxAllSites(), id);
    expect(still.ok && still.value.lifecycle).not.toBe("DISABLED");
  });

  it("cannot attach a profile to a gateway from another organization", async () => {
    const res = await repos.gateways.createProfile(ctxAllSites(), { gatewayId: GW_B1 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("VALIDATION_FAILED");
  });

  it("a site-A1 actor cannot see a site-A2 gateway", async () => {
    const made = await repos.gateways.createProfile(ctxAllSites(), { gatewayId: GW_A2 });
    expect(made.ok).toBe(true);
    if (!made.ok) return;

    const seen = await repos.gateways.findVisibleById(ctxA1Only(), made.value.id);
    expect(seen.ok).toBe(false);

    const listed = await repos.gateways.listVisible(ctxA1Only());
    expect(listed.ok && listed.value.items.every((g) => g.gatewayId !== GW_A2)).toBe(true);
    // The count must reflect only what this actor may see.
    expect(listed.ok && listed.value.total).toBe(1);
  });

  it("a zero-site actor sees nothing and cannot mutate", async () => {
    const list = await repos.gateways.listVisible(ctxZeroSite());
    expect(list.ok && list.value.items).toEqual([]);
    expect(list.ok && list.value.total).toBe(0);

    const create = await repos.gateways.createProfile(ctxZeroSite(), { gatewayId: GW_A1 });
    expect(create.ok).toBe(false);
    if (!create.ok) expect(["FORBIDDEN", "CONFLICT"]).toContain(create.code);
  });

  it("signing configuration is reachable only through the internal method", async () => {
    const cfg = await repos.gateways.findSigningConfiguration(ctxAllSites(), GW_A1);
    expect(cfg.ok).toBe(true);
    if (cfg.ok) expect(cfg.value.signingKeyRef).toBe("env:OT_GATEWAY_HMAC_PRIMARY");

    // A foreign tenant gets nothing.
    const foreign = await repos.gateways.findSigningConfiguration(ctxOrgB(), GW_A1);
    expect(foreign.ok).toBe(false);
  });

  it("the 1:1 gateway profile constraint is enforced", async () => {
    const dup = await repos.gateways.createProfile(ctxAllSites(), { gatewayId: GW_A1 });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.code).toBe("CONFLICT");
  });
});

describe.skipIf(!ENABLED)("94B3.2 — device adapter", () => {
  it("creates, and rejects a cross-organization asset", async () => {
    const ok = await repos.devices.createProfile(ctxAllSites(), { assetId: ASSET_A1, category: "PLC" });
    expect(ok.ok, JSON.stringify(ok)).toBe(true);

    const foreign = await repos.devices.createProfile(ctxAllSites(), { assetId: ASSET_B1 });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.code).toBe("VALIDATION_FAILED");
  });

  it("enforces the 1:1 asset constraint", async () => {
    const dup = await repos.devices.createProfile(ctxAllSites(), { assetId: ASSET_A1 });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.code).toBe("CONFLICT");
  });

  it("site scope applies to reads and to updates", async () => {
    const a2 = await repos.devices.createProfile(ctxAllSites(), { assetId: ASSET_A2 });
    expect(a2.ok).toBe(true);
    if (!a2.ok) return;

    const hidden = await repos.devices.findVisibleById(ctxA1Only(), a2.value.id);
    expect(hidden.ok).toBe(false);

    const blocked = await repos.devices.updateProfile(ctxA1Only(), a2.value.id, { firmwareVersion: "9.9" });
    expect(blocked.ok).toBe(false);

    const zero = await repos.devices.listVisible(ctxZeroSite());
    expect(zero.ok && zero.value.total).toBe(0);
  });
});

describe.skipIf(!ENABLED)("94B3.2 — import adapter idempotency", () => {
  const input = (key: string, checksum: string) => ({
    siteId: SITE_A1,
    sourceType: "GENERIC",
    sourceFilename: "manifest.json",
    contentType: "application/json",
    checksum,
    idempotencyKey: key,
    byteSize: 128,
  });

  it("reserves once and returns the authoritative original on retry", async () => {
    const k = `${RUN}-idem-1`;
    const first = await repos.imports.reserveIdempotency(ctxAllSites(), input(k, `${RUN}-sum-1`));
    expect(first.ok && first.value.outcome).toBe("RESERVED");

    const retry = await repos.imports.reserveIdempotency(ctxAllSites(), input(k, `${RUN}-sum-1b`));
    expect(retry.ok && retry.value.outcome).toBe("DUPLICATE");
    if (first.ok && retry.ok) expect(retry.value.record.id).toBe(first.value.record.id);
  });

  it("never exposes the idempotency key through the record", async () => {
    const rec = await repos.imports.reserveIdempotency(ctxAllSites(), input(`${RUN}-secret-key`, `${RUN}-sum-2`));
    expect(rec.ok).toBe(true);
    if (rec.ok) expect(JSON.stringify(rec.value.record)).not.toContain("secret-key");
  });

  it("20 concurrent reservations through the ADAPTER yield one winner", async () => {
    const k = `${RUN}-race`;
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        repos.imports.reserveIdempotency(ctxAllSites(), input(k, `${RUN}-race-sum-${i % 2}`)),
      ),
    );
    const reserved = results.filter((r) => r.ok && r.value.outcome === "RESERVED");
    expect(reserved, "exactly one authoritative execution").toHaveLength(1);

    // Independent cross-check with raw SQL.
    const [{ n }] = await sql<{ n: string }>(
      `SELECT count(*)::text AS n FROM "EngineeringImport" WHERE "idempotencyKey"=$1`,
      [k],
    );
    expect(n).toBe("1");
  }, 60_000);

  it("a FAILED import cannot later be marked completed", async () => {
    const res = await repos.imports.reserveIdempotency(ctxAllSites(), input(`${RUN}-fail`, `${RUN}-sum-fail`));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const id = res.value.record.id;

    const failed = await repos.imports.markFailed(ctxAllSites(), id, "SCHEMA_INVALID");
    expect(failed.ok && failed.value.status).toBe("FAILED");

    const late = await repos.imports.markCompleted(ctxAllSites(), id, { tagCount: 5 });
    expect(late.ok, "a terminal import must not walk forward").toBe(false);
    if (!late.ok) expect(late.code).toBe("CONFLICT");
  });

  it("a zero-site actor cannot reserve a site-scoped import", async () => {
    const res = await repos.imports.reserveIdempotency(ctxZeroSite(), input(`${RUN}-zero`, `${RUN}-sum-zero`));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("FORBIDDEN");
  });
});

describe.skipIf(!ENABLED)("94B3.2 — project, findings and the transaction boundary", () => {
  async function newImport(key: string): Promise<string> {
    const r = await repos.imports.reserveIdempotency(ctxAllSites(), {
      siteId: SITE_A1,
      sourceType: "GENERIC",
      sourceFilename: "m.json",
      contentType: "application/json",
      checksum: `${RUN}-${key}-sum`,
      idempotencyKey: `${RUN}-${key}`,
      byteSize: 10,
    });
    if (!r.ok) throw new Error("import fixture failed");
    return r.value.record.id;
  }

  it("creates a project with all artifact types atomically", async () => {
    const importId = await newImport("proj1");
    const res = await repos.projects.createProjectWithArtifacts(ctxAllSites(), {
      siteId: SITE_A1,
      importId,
      name: "Line 1",
      normalizedName: `${RUN}-line1`,
      sourceType: "GENERIC",
      schemaVersion: "1.0",
      checksum: `${RUN}-proj1`,
      tags: [{ name: "M1", normalizedName: "m1", dataType: "BOOL", address: "%I0.0", symbolicPath: null, unit: null, description: null, accessMode: "READ", safetyClass: "NON_SAFETY", validationState: "VALID" }],
      alarms: [{ code: "A1", normalizedCode: "a1", severity: "HIGH", message: "Overload", conditionReference: "C1", requiresAck: true, safetyClass: "NON_SAFETY", productionRelevant: true, validationState: "VALID" }],
      networkNodes: [{ nodeName: "N1", normalizedName: "n1", zone: "CONTROL", protocol: "SIEMENS_S7", address: "10.0.0.1", subnet: "24", stationId: "1", conflictState: "VALID" }],
    });
    expect(res.ok, JSON.stringify(res)).toBe(true);
    if (!res.ok) return;

    const tags = await repos.projects.listTags(ctxAllSites(), res.value.id);
    const alarms = await repos.projects.listAlarms(ctxAllSites(), res.value.id);
    const nodes = await repos.projects.listNetworkNodes(ctxAllSites(), res.value.id);
    expect(tags.ok && tags.value.total).toBe(1);
    expect(alarms.ok && alarms.value.total).toBe(1);
    expect(nodes.ok && nodes.value.total).toBe(1);

    const analysis = await repos.projects.loadAnalysisInput(ctxAllSites(), res.value.id);
    expect(analysis.ok && analysis.value.tags).toHaveLength(1);
  });

  it("a foreign tenant sees neither the project nor its artifacts", async () => {
    const mine = await repos.projects.listVisible(ctxAllSites());
    expect(mine.ok && mine.value.total).toBeGreaterThan(0);
    if (!mine.ok) return;
    const id = mine.value.items[0].id;

    expect((await repos.projects.findVisibleById(ctxOrgB(), id)).ok).toBe(false);
    const tags = await repos.projects.listTags(ctxOrgB(), id);
    expect(tags.ok && tags.value.total).toBe(0);
  });

  it("a rolled-back transaction leaves NO project and NO artifacts", async () => {
    const importId = await newImport("rollback");
    const tx = createTransactionManager(prisma);
    const marker = `${RUN}-rollback-proj`;

    const res = await tx.runInTransaction(async (r) => {
      const created = await r.projects.createProjectWithArtifacts(ctxAllSites(), {
        siteId: SITE_A1,
        importId,
        name: "Doomed",
        normalizedName: marker,
        sourceType: "GENERIC",
        schemaVersion: "1.0",
        checksum: marker,
        tags: [{ name: "T", normalizedName: `${marker}-t`, dataType: "INT", address: null, symbolicPath: null, unit: null, description: null, accessMode: "READ", safetyClass: "UNKNOWN", validationState: "VALID" }],
      });
      expect(created.ok).toBe(true);
      // Fail AFTER successful writes — the project and tag must both vanish.
      throw new Error("deliberate mid-transaction failure");
    });
    expect(res.ok).toBe(false);

    const [{ n: projects }] = await sql<{ n: string }>(
      `SELECT count(*)::text AS n FROM "EngineeringProject" WHERE "normalizedName"=$1`, [marker],
    );
    const [{ n: tags }] = await sql<{ n: string }>(
      `SELECT count(*)::text AS n FROM "AutomationTag" WHERE "normalizedName"=$1`, [`${marker}-t`],
    );
    expect(projects, "project rolled back").toBe("0");
    expect(tags, "artifact rolled back").toBe("0");
  }, 60_000);

  it("a committed transaction persists — the rollback test is not vacuous", async () => {
    const importId = await newImport("commit");
    const tx = createTransactionManager(prisma);
    const marker = `${RUN}-commit-proj`;
    const res = await tx.runInTransaction(async (r) =>
      r.projects.createProjectWithArtifacts(ctxAllSites(), {
        siteId: SITE_A1, importId, name: "Kept", normalizedName: marker,
        sourceType: "GENERIC", schemaVersion: "1.0", checksum: marker,
      }),
    );
    expect(res.ok).toBe(true);
    const [{ n }] = await sql<{ n: string }>(
      `SELECT count(*)::text AS n FROM "EngineeringProject" WHERE "normalizedName"=$1`, [marker],
    );
    expect(n).toBe("1");
  }, 60_000);

  it("deterministic findings upsert idempotently and transition atomically", async () => {
    const importId = await newImport("findings");
    const p = await repos.projects.createProjectWithArtifacts(ctxAllSites(), {
      siteId: SITE_A1, importId, name: "F", normalizedName: `${RUN}-fproj`,
      sourceType: "GENERIC", schemaVersion: "1.0", checksum: `${RUN}-fproj`,
    });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const projectId = p.value.id;

    const finding = {
      ruleId: "OT-DUP-TAG", ruleVersion: "1.0", category: "consistency", severity: "HIGH",
      title: "Duplicate tag", description: "Two tags share a name.",
      artifactType: "TAG", artifactRef: "tag:m1", evidenceRefs: ["tag:m1"],
      recommendation: "Rename one tag.", humanApprovalRequired: true,
    };

    const first = await repos.findings.upsertDeterministicFindings(ctxAllSites(), projectId, [finding]);
    expect(first.ok && first.value.created).toBe(1);

    // Re-running analysis must not duplicate.
    const second = await repos.findings.upsertDeterministicFindings(ctxAllSites(), projectId, [finding]);
    expect(second.ok && second.value.created).toBe(0);
    expect(second.ok && second.value.updated).toBe(1);

    const list = await repos.findings.listVisible(ctxAllSites(), projectId);
    expect(list.ok && list.value.total, "no duplicate finding").toBe(1);
    if (!list.ok) return;
    const id = list.value.items[0].id;
    expect(list.value.items[0].humanApprovalRequired).toBe(true);

    // Two reviewers race from OPEN; exactly one may win.
    const [r1, r2] = await Promise.all([
      repos.findings.transitionAtomically(ctxAllSites(), id, { expectedStatus: "OPEN", nextStatus: "ACKNOWLEDGED", reviewedById: `${RUN}-r1`, reviewedAt: new Date() }),
      repos.findings.transitionAtomically(ctxAllSites(), id, { expectedStatus: "OPEN", nextStatus: "REJECTED", reviewedById: `${RUN}-r2`, reviewedAt: new Date() }),
    ]);
    const applied = [r1, r2].filter((r) => r.ok && r.value.outcome === "APPLIED");
    expect(applied, "concurrent reviewers cannot both win").toHaveLength(1);

    // Repeating the winning transition is an idempotent NOOP.
    const winner = applied[0];
    if (winner.ok) {
      const again = await repos.findings.transitionAtomically(ctxAllSites(), id, {
        expectedStatus: winner.value.record.status,
        nextStatus: winner.value.record.status,
        reviewedById: `${RUN}-r1`,
        reviewedAt: new Date(),
      });
      expect(again.ok && again.value.outcome).toBe("NOOP");
    }

    // A foreign tenant cannot transition it.
    const cross = await repos.findings.transitionAtomically(ctxOrgB(), id, {
      expectedStatus: "OPEN", nextStatus: "RESOLVED", reviewedById: `${RUN}-x`, reviewedAt: new Date(),
    });
    expect(cross.ok).toBe(false);
  }, 60_000);
});

describe.skipIf(!ENABLED)("94B3.2 — nonce adapter", () => {
  it("reserves once; 20 concurrent duplicates yield one winner", async () => {
    const nonce = `${RUN}-nonce-race`;
    const exp = new Date(Date.now() + 15 * 60_000);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => repos.nonces.reserve(ctxAllSites(), { gatewayId: GW_A1, nonce, expiresAt: exp })),
    );
    expect(results.filter((r) => r.ok && r.value === "RESERVED")).toHaveLength(1);
    expect(results.filter((r) => r.ok && r.value === "DUPLICATE")).toHaveLength(19);

    const conflict = await repos.nonces.identifyConflict(ctxAllSites(), GW_A1, nonce);
    expect(conflict.ok && conflict.value).toBe(true);
  }, 60_000);

  it("pruning is bounded and never removes a live nonce", async () => {
    const live = `${RUN}-live-nonce`;
    await repos.nonces.reserve(ctxAllSites(), { gatewayId: GW_A1, nonce: live, expiresAt: new Date(Date.now() + 15 * 60_000) });

    // Prune everything already expired; the live nonce must survive.
    const pruned = await repos.nonces.pruneExpired(ctxAllSites(), new Date(Date.now() - 1000));
    expect(pruned.ok).toBe(true);

    const still = await repos.nonces.identifyConflict(ctxAllSites(), GW_A1, live);
    expect(still.ok && still.value, "a nonce inside the replay window survives pruning").toBe(true);
  });
});
