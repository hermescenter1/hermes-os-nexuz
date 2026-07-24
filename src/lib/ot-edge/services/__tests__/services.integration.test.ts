import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { createHash } from "node:crypto";
import { assertTestDatabase, resolveOtIntegrationMode } from "@/test/ot-db-guard";
import { buildOtServiceContext, type OtServiceContext } from "../../service-context";
import {
  createGatewayAuthLookup,
  createOtRepositories,
  createTransactionManager,
  type OtPrismaClient,
  type OtTransactionalPrismaClient,
} from "../../persistence/prisma-adapters";
import type { OtRepositories } from "../../persistence/ports";
import { createImportService, type ImportCheckpoint } from "../import-service";
import { createAnalysisService } from "../analysis-service";
import { createFindingService } from "../finding-service";
import { createGatewayEnvelopeService } from "../gateway-service";
import { computeSignature, type SecretProvider } from "../../envelope-signature";
import {
  authenticateGateway,
  INGESTION_ID_PATTERN,
  type GatewayMachineContext,
  type MachineAuthRejection,
} from "../../machine-context";
import { sanitizeAuditMetadata, type AuditPort, type OtAuditAction } from "../core";
import { RULE_IDS } from "../../analysis-rules";
import { toGatewayProfileDto, toOtDeviceProfileDto } from "../../dto";
import type { MetricSink, OtMetric, OtMetricLabels } from "../../metrics";

/**
 * PHASE 94B3.3 — the four orchestration services, executed end to end against
 * real PostgreSQL.
 *
 * Audit and metrics are captured through their real ports (not stubbed away),
 * so every assertion about "what was recorded" describes what production would
 * actually write.
 */

const MODE = resolveOtIntegrationMode();
const ENABLED = MODE.mode === "RUN";
const URL = process.env.OT_TEST_DATABASE_URL ?? "";

const RUN = `b33-${process.pid}-${Date.now().toString(36)}`;
const ORG_A = `${RUN}-orgA`;
const ORG_B = `${RUN}-orgB`;
const SITE_A1 = `${RUN}-siteA1`;
const SITE_A2 = `${RUN}-siteA2`;
const SITE_B1 = `${RUN}-siteB1`;
const GW_A1 = `${RUN}-gwA1`;
const GW_B1 = `${RUN}-gwB1`;
const USER_A = `${RUN}-userA`;
const KEY_REF = "env:OT_GATEWAY_HMAC_PRIMARY";
// Minted by the database during seeding, never hard-coded: the whole point of
// the handle is that the server chooses it.
let INGEST_A1 = "";
let INGEST_B1 = "";
const SECRET = "integration-only-secret-0123456789abcdef";

let pool: Pool;
let prisma: OtTransactionalPrismaClient;
let repos: OtRepositories;

/** Captured audit events — the real port, so payloads are the real ones. */
let audited: Array<{ action: OtAuditAction; actorId: string | null; entityId: string | null; metadata: Record<string, unknown> }>;
let metered: Array<[OtMetric, number, OtMetricLabels]>;

const auditPort = (): AuditPort => ({
  async record(input) {
    audited.push({
      action: input.action,
      // Captured so a machine action can be proven NOT to borrow a human actor.
      actorId: input.actorId,
      entityId: input.entityId,
      metadata: sanitizeAuditMetadata(input.metadata),
    });
  },
});
const metricSink = (): MetricSink => ({ emit: (m, v, l) => { metered.push([m, v, l]); } });
const secrets: SecretProvider = { resolve: (ref) => (ref === KEY_REF ? SECRET : null) };

async function sql<T = Record<string, unknown>>(q: string, p: unknown[] = []): Promise<T[]> {
  const r = await pool.query(q, p as never[]);
  return r.rows as T[];
}

const ctxA = (): OtServiceContext =>
  buildOtServiceContext({ userId: USER_A, organizationId: ORG_A, role: "ADMIN", allowedSiteIds: null });
const ctxA1 = (): OtServiceContext =>
  buildOtServiceContext({ userId: USER_A, organizationId: ORG_A, role: "ENGINEER", allowedSiteIds: [SITE_A1] });
const ctxViewer = (): OtServiceContext =>
  buildOtServiceContext({ userId: USER_A, organizationId: ORG_A, role: "VIEWER", allowedSiteIds: null });
const ctxB = (): OtServiceContext =>
  buildOtServiceContext({ userId: `${RUN}-userB`, organizationId: ORG_B, role: "ADMIN", allowedSiteIds: null });

/**
 * A minimal but rule-triggering manifest.
 *
 * `discriminator` makes the project identity — and therefore the canonical
 * checksum — unique per test. Without it every test would submit byte-identical
 * content and the organization-scoped checksum uniqueness would (correctly)
 * report a duplicate, which is a different behaviour than the one under test.
 */
function manifest(discriminator = "base", overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1.0",
    sourceType: "GENERIC",
    project: { name: `Line ${RUN} ${discriminator}`, version: "1.0", vendor: "SIEMENS", platform: "TIA PORTAL", revision: 1 },
    devices: [{ engineeringId: "PLC1", name: "Main PLC", category: "PLC", networkZone: "CONTROL", safetyClass: "NON_SAFETY" }],
    tags: [
      { name: "Motor_Run", dataType: "BOOL", address: "%I0.0", accessMode: "READ", safetyClass: "NON_SAFETY", description: "Motor running feedback" },
      { name: "Motor_Temp", dataType: "REAL", address: "%IW2", accessMode: "READ", safetyClass: "NON_SAFETY" },
    ],
    alarms: [{ code: "A100", severity: "HIGH", message: "Motor overload", conditionReference: "C1", requiresAck: true, safetyClass: "NON_SAFETY", productionRelevant: true }],
    networkNodes: [{ nodeName: "PLC1_NET", zone: "CONTROL", protocol: "SIEMENS_S7", address: "10.0.0.1", subnet: "255.255.255.0", stationId: "1" }],
    ...overrides,
  };
}

const importReq = (key: string, over: Record<string, unknown> = {}) => ({
  siteId: SITE_A1,
  idempotencyKey: `${RUN}-${key}`,
  sourceFilename: "manifest.json",
  contentType: "application/json",
  byteSize: 2048,
  // Keyed by the same discriminator as the idempotency key, so a test that
  // deliberately repeats a key repeats identical content too.
  manifest: manifest(key),
  ...over,
});

function services(onCheckpoint?: (cp: ImportCheckpoint) => void) {
  const audit = auditPort();
  const metrics = metricSink();
  return {
    imports: createImportService({
      imports: repos.imports, projects: repos.projects,
      tx: createTransactionManager(prisma), audit, metrics, onCheckpoint,
    }),
    analysis: createAnalysisService({ projects: repos.projects, findings: repos.findings, audit, metrics }),
    findings: createFindingService({ findings: repos.findings, audit, metrics }),
    gateway: createGatewayEnvelopeService({ nonces: repos.nonces, audit, metrics }),
  };
}

beforeAll(async () => {
  if (!ENABLED) return;
  assertTestDatabase(URL, process.env.NODE_ENV === "test");
  pool = new Pool({ connectionString: URL, max: 30 });

  for (const [org, site, gw] of [[ORG_A, SITE_A1, GW_A1], [ORG_B, SITE_B1, GW_B1]] as const) {
    await sql(`INSERT INTO "Organization" (id,name,slug,"updatedAt") VALUES ($1,$2,$3,now()) ON CONFLICT DO NOTHING`, [org, `Org ${org}`, org]);
    await sql(`INSERT INTO "IndustrialSite" (id,"organizationId",name,slug,"updatedAt") VALUES ($1,$2,$3,$4,now()) ON CONFLICT DO NOTHING`, [site, org, `Site ${site}`, site]);
    await sql(`INSERT INTO "IndustrialGateway" (id,"organizationId","siteId",name,"gatewayId","updatedAt") VALUES ($1,$2,$3,$4,$5,now()) ON CONFLICT DO NOTHING`, [gw, org, site, `GW ${gw}`, gw]);
  }
  await sql(`INSERT INTO "IndustrialSite" (id,"organizationId",name,slug,"updatedAt") VALUES ($1,$2,$3,$4,now()) ON CONFLICT DO NOTHING`, [SITE_A2, ORG_A, `Site ${SITE_A2}`, SITE_A2]);
  for (const u of [USER_A, `${RUN}-userB`]) {
    await sql(`INSERT INTO "User" (id,name,email,"passwordHash","updatedAt") VALUES ($1,$2,$3,$4,now()) ON CONFLICT DO NOTHING`, [u, u, `${u}@test.invalid`, "not-a-real-hash"]);
  }

  const { PrismaClient } = (await import("@prisma/client")) as unknown as { PrismaClient: new (o?: unknown) => unknown };
  const { PrismaPg } = (await import("@prisma/adapter-pg")) as unknown as { PrismaPg: new (c: { connectionString: string }) => unknown };
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL }) }) as OtTransactionalPrismaClient;
  repos = createOtRepositories(prisma as OtPrismaClient);

  // PHASE 94B4.1 — the ingestion handle is minted by the repository, revealed
  // exactly once here, and is what a machine presents instead of a session.
  const profA = await repos.gateways.createProfile(ctxA(), {
    gatewayId: GW_A1, capabilities: ["PROJECT_METADATA_IMPORT"], signingKeyRef: KEY_REF,
  });
  INGEST_A1 = profA.ok ? (profA.value.ingestionId ?? "") : "";
  // A second tenant's gateway, provisioned identically, so "another
  // organization" is tested as a real authenticated device rather than as a
  // missing row.
  const profB = await repos.gateways.createProfile(ctxB(), {
    gatewayId: GW_B1, capabilities: ["PROJECT_METADATA_IMPORT"], signingKeyRef: KEY_REF,
  });
  INGEST_B1 = profB.ok ? (profB.value.ingestionId ?? "") : "";
}, 120_000);

beforeEach(() => { audited = []; metered = []; });

afterAll(async () => {
  if (!ENABLED || !pool) return;
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

describe.skipIf(!ENABLED)("94B3.3 — import service", () => {
  it("runs with a real database (required mode)", () => expect(ENABLED).toBe(true));

  it("persists project, every artifact type and deterministic findings", async () => {
    const svc = services();
    const res = await svc.imports.execute(ctxA(), importReq("ok1"));
    expect(res.ok, JSON.stringify(res)).toBe(true);
    if (!res.ok) return;
    expect(res.value.duplicate).toBe(false);
    expect(res.value.project).not.toBeNull();

    const pid = res.value.project!.id;
    const [tags, alarms, nodes] = await Promise.all([
      repos.projects.listTags(ctxA(), pid),
      repos.projects.listAlarms(ctxA(), pid),
      repos.projects.listNetworkNodes(ctxA(), pid),
    ]);
    expect(tags.ok && tags.value.total).toBe(2);
    expect(alarms.ok && alarms.value.total).toBe(1);
    expect(nodes.ok && nodes.value.total).toBe(1);

    const findings = await repos.findings.listVisible(ctxA(), pid);
    expect(findings.ok && findings.value.total).toBeGreaterThan(0);

    // Import is APPLIED, never left mid-flight.
    expect(res.value.import.status).toBe("APPLIED");
  });

  it("emits started + completed audit events carrying no manifest content", async () => {
    const svc = services();
    await svc.imports.execute(ctxA(), importReq("audit1"));
    const actions = audited.map((a) => a.action);
    expect(actions).toContain("ENGINEERING_IMPORT_STARTED");
    expect(actions).toContain("ENGINEERING_IMPORT_COMPLETED");

    const raw = JSON.stringify(audited);
    for (const secret of ["Motor_Run", "Motor overload", "%I0.0", "A100", "PLC1_NET", "manifest.json"]) {
      expect(raw, `${secret} leaked into an audit payload`).not.toContain(secret);
    }
    expect(raw).not.toMatch(/idempotencyKey|checksum|nonce|signature/i);
  });

  it("executes once for a duplicate idempotency key", async () => {
    const svc = services();
    const first = await svc.imports.execute(ctxA(), importReq("dup1"));
    const second = await svc.imports.execute(ctxA(), importReq("dup1"));
    expect(first.ok && first.value.duplicate).toBe(false);
    expect(second.ok && second.value.duplicate).toBe(true);
    if (first.ok && second.ok) expect(second.value.import.id).toBe(first.value.import.id);

    const [{ n }] = await sql<{ n: string }>(
      `SELECT count(*)::text AS n FROM "EngineeringImport" WHERE "idempotencyKey"=$1`, [`${RUN}-dup1`],
    );
    expect(n).toBe("1");
  }, 60_000);

  it("20 concurrent identical requests produce exactly one authority", async () => {
    const svc = services();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => svc.imports.execute(ctxA(), importReq("race1"))),
    );
    const executed = results.filter((r) => r.ok && !r.value.duplicate);
    expect(executed, "exactly one authoritative execution").toHaveLength(1);

    const [{ n }] = await sql<{ n: string }>(
      `SELECT count(*)::text AS n FROM "EngineeringProject" WHERE "importId" IN
       (SELECT id FROM "EngineeringImport" WHERE "idempotencyKey"=$1)`, [`${RUN}-race1`],
    );
    expect(n, "no duplicate project data").toBe("1");
  }, 120_000);

  it("rejects CSV and XML as UNSUPPORTED_FORMAT (no HTTP mapping here)", async () => {
    const svc = services();
    for (const ct of ["text/csv", "application/xml", "text/xml"]) {
      const r = await svc.imports.execute(ctxA(), importReq(`fmt-${ct}`, { contentType: ct }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("UNSUPPORTED_FORMAT");
    }
  });

  it("rejects an unknown manifest key — an injected organizationId cannot ride along", async () => {
    const svc = services();
    const r = await svc.imports.execute(
      ctxA(),
      importReq("inject", { manifest: manifest("inject", { organizationId: ORG_B, actorId: "attacker" }) }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("VALIDATION_FAILED");
  });

  it("a VIEWER cannot import; a foreign site is refused", async () => {
    const svc = services();
    const viewer = await svc.imports.execute(ctxViewer(), importReq("viewer"));
    expect(viewer.ok).toBe(false);
    if (!viewer.ok) expect(viewer.code).toBe("FORBIDDEN");

    const foreignSite = await svc.imports.execute(ctxA1(), importReq("foreign", { siteId: SITE_A2 }));
    expect(foreignSite.ok).toBe(false);
    if (!foreignSite.ok) expect(foreignSite.code).toBe("FORBIDDEN");
  });

  it.each([
    "AFTER_PROJECT", "AFTER_FINDINGS", "BEFORE_COMPLETE", "BEFORE_COMMIT",
  ] as const)("a failure at %s leaves no partial project and never reports COMPLETED", async (cp) => {
    const key = `fail-${cp}`;
    const svc = services((c) => { if (c === cp) throw new Error("injected checkpoint failure"); });
    const res = await svc.imports.execute(ctxA(), importReq(key));
    expect(res.ok, "the import must fail").toBe(false);

    // The reservation survives, marked FAILED — never APPLIED.
    const [row] = await sql<{ status: string; failureReason: string }>(
      `SELECT status, "failureReason" FROM "EngineeringImport" WHERE "idempotencyKey"=$1`, [`${RUN}-${key}`],
    );
    expect(row.status).toBe("FAILED");
    expect(row.status).not.toBe("APPLIED");
    expect(row.failureReason).toBe("INTERNAL_ERROR");

    // …and Transaction B rolled back entirely.
    const [{ n: projects }] = await sql<{ n: string }>(
      `SELECT count(*)::text AS n FROM "EngineeringProject" WHERE "importId" IN
       (SELECT id FROM "EngineeringImport" WHERE "idempotencyKey"=$1)`, [`${RUN}-${key}`],
    );
    expect(projects, "no partial project").toBe("0");

    const failedAudit = audited.find((a) => a.action === "ENGINEERING_IMPORT_FAILED");
    expect(failedAudit).toBeTruthy();
    expect(JSON.stringify(failedAudit)).not.toContain("injected checkpoint failure");
  }, 60_000);
});

describe.skipIf(!ENABLED)("94B3.3 — analysis service", () => {
  async function seedProject(key: string): Promise<string> {
    const svc = services();
    const r = await svc.imports.execute(ctxA(), importReq(key));
    if (!r.ok || !r.value.project) throw new Error("seed failed");
    return r.value.project.id;
  }

  it("executes all rules and persists findings deterministically", async () => {
    const pid = await seedProject("an1");
    const svc = services();
    const res = await svc.analysis.run(ctxA(), pid);
    expect(res.ok, JSON.stringify(res)).toBe(true);
    if (!res.ok) return;
    expect(res.value.ruleCount).toBe(RULE_IDS.length);
    expect(res.value.findings.length).toBeGreaterThan(0);
    expect(audited.some((a) => a.action === "ENGINEERING_ANALYSIS_EXECUTED")).toBe(true);
  }, 60_000);

  it("a repeat run creates no duplicates and returns the same ordering", async () => {
    const pid = await seedProject("an2");
    const svc = services();
    const first = await svc.analysis.run(ctxA(), pid);
    const second = await svc.analysis.run(ctxA(), pid);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.value.created, "no new findings on an unchanged project").toBe(0);
    expect(first.value.findings.map((f) => f.ruleId + f.artifactRef))
      .toEqual(second.value.findings.map((f) => f.ruleId + f.artifactRef));

    const [{ n }] = await sql<{ n: string }>(
      `SELECT count(*)::text AS n FROM "EngineeringFinding" WHERE "projectId"=$1`, [pid],
    );
    expect(Number(n)).toBe(second.value.findings.length);
  }, 60_000);

  it("safety findings keep humanApprovalRequired and nothing emits a device command", async () => {
    const pid = await seedProject("an3");
    const svc = services();
    const res = await svc.analysis.run(ctxA(), pid);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const raw = JSON.stringify(res.value.findings);
    for (const forbidden of ["writeTag", "setpoint", "actuate", "PLC_WRITE", "acknowledgeAlarm"]) {
      expect(raw).not.toContain(forbidden);
    }
    for (const f of res.value.findings) {
      if (f.severity === "CRITICAL") expect(f.humanApprovalRequired).toBe(true);
    }
  }, 60_000);

  it("a VIEWER cannot run analysis; a foreign project is NOT_FOUND", async () => {
    const pid = await seedProject("an4");
    const svc = services();
    const viewer = await svc.analysis.run(ctxViewer(), pid);
    expect(viewer.ok).toBe(false);
    if (!viewer.ok) expect(viewer.code).toBe("FORBIDDEN");

    const foreign = await svc.analysis.run(ctxB(), pid);
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.code).toBe("NOT_FOUND");
  }, 60_000);
});

describe.skipIf(!ENABLED)("94B3.3 — finding service", () => {
  async function seedFinding(key: string): Promise<string> {
    const svc = services();
    const imp = await svc.imports.execute(ctxA(), importReq(key));
    if (!imp.ok || !imp.value.project) throw new Error("seed failed");
    const list = await repos.findings.listVisible(ctxA(), imp.value.project.id);
    if (!list.ok || !list.value.items.length) throw new Error("no findings seeded");
    return list.value.items[0].id;
  }

  it("applies a permitted transition, audits it once, and records a metric", async () => {
    const id = await seedFinding("fw1");
    const svc = services();
    const res = await svc.findings.transitionFinding(ctxA(), id, "ACKNOWLEDGED", "  reviewed on site  ");
    expect(res.ok, JSON.stringify(res)).toBe(true);
    if (!res.ok) return;
    expect(res.value.applied).toBe(true);
    expect(res.value.finding.state).toBe("ACKNOWLEDGED");
    expect(audited.filter((a) => a.action === "ENGINEERING_FINDING_ACKNOWLEDGED")).toHaveLength(1);
    expect(metered.some(([m]) => m === "ot_finding_transition")).toBe(true);
  }, 60_000);

  it("a repeated identical transition is a NOOP with no second audit event", async () => {
    const id = await seedFinding("fw2");
    const svc = services();
    await svc.findings.transitionFinding(ctxA(), id, "ACKNOWLEDGED");
    audited = [];
    const again = await svc.findings.transitionFinding(ctxA(), id, "ACKNOWLEDGED");
    expect(again.ok && again.value.applied).toBe(false);
    expect(audited, "a NOOP must not be audited as a decision").toEqual([]);
  }, 60_000);

  it("refuses an undocumented transition", async () => {
    const id = await seedFinding("fw3");
    const svc = services();
    await svc.findings.transitionFinding(ctxA(), id, "REJECTED");
    const illegal = await svc.findings.transitionFinding(ctxA(), id, "ACKNOWLEDGED");
    expect(illegal.ok).toBe(false);
    if (!illegal.ok) expect(illegal.code).toBe("CONFLICT");
  }, 60_000);

  it("two simultaneous reviewers: exactly one state change wins", async () => {
    const id = await seedFinding("fw4");
    const svc = services();
    const [a, b] = await Promise.all([
      svc.findings.transitionFinding(ctxA(), id, "ACCEPTED"),
      svc.findings.transitionFinding(ctxA(), id, "REJECTED"),
    ]);
    const applied = [a, b].filter((r) => r.ok && r.value.applied);
    expect(applied, "no silent overwrite").toHaveLength(1);
  }, 60_000);

  it("permission, tenant and note bounds are enforced", async () => {
    const id = await seedFinding("fw5");
    const svc = services();

    const engineer = await svc.findings.transitionFinding(ctxA1(), id, "ACCEPTED");
    expect(engineer.ok).toBe(false);
    if (!engineer.ok) expect(engineer.code).toBe("FORBIDDEN");

    const foreign = await svc.findings.transitionFinding(ctxB(), id, "ACCEPTED");
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.code).toBe("NOT_FOUND");

    const huge = await svc.findings.transitionFinding(ctxA(), id, "ACCEPTED", "x".repeat(100_000));
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.code).toBe("VALIDATION_FAILED");
  }, 60_000);

  it("evidence and rule identity are never mutated by a review", async () => {
    const id = await seedFinding("fw6");
    const before = await repos.findings.findVisibleById(ctxA(), id);
    const svc = services();
    await svc.findings.transitionFinding(ctxA(), id, "ACKNOWLEDGED", "note");
    const after = await repos.findings.findVisibleById(ctxA(), id);
    expect(before.ok && after.ok).toBe(true);
    if (!before.ok || !after.ok) return;
    for (const k of ["ruleId", "ruleVersion", "description", "artifactRef", "humanApprovalRequired"] as const) {
      expect(after.value[k], `${k} must be immutable`).toEqual(before.value[k]);
    }
  }, 60_000);
});

describe.skipIf(!ENABLED)("94B4.1 — gateway machine authentication and ingestion", () => {
  const PAYLOAD = JSON.stringify({ kind: "PROJECT_METADATA" });
  const CHECKSUM = createHash("sha256").update(Buffer.from(PAYLOAD, "utf8")).digest("hex");

  function envelope(over: Record<string, unknown> = {}) {
    const base = {
      envelopeVersion: "1.0" as const,
      organizationId: ORG_A,
      gatewayId: GW_A1,
      timestamp: new Date().toISOString(),
      nonce: `${RUN}-${Math.random().toString(36).slice(2)}`.padEnd(20, "x"),
      idempotencyKey: `${RUN}-env`,
      payloadType: "PROJECT_METADATA" as const,
      payloadChecksum: CHECKSUM,
      signingKeyRef: KEY_REF,
      signatureAlgorithm: "HMAC-SHA256" as const,
      ...over,
    };
    // A caller may pin `signature` to forge one; otherwise it is computed from
    // the signed fields. Without this the forged value was silently replaced by
    // a valid signature and the "invalid signature" case tested nothing.
    const forged = (over as { signature?: string }).signature;
    return { ...base, signature: forged ?? computeSignature(base as never, SECRET) };
  }

  /**
   * Authenticate exactly as the HTTP route does — through the real global lookup,
   * against real rows. No test double stands in for the credential check, so
   * these assertions describe production behaviour.
   */
  async function authenticate(
    env: Record<string, unknown>,
    opts: { ingestionId?: string | null; payload?: string; simulatorAllowed?: boolean } = {},
  ) {
    return authenticateGateway({
      ingestionId: opts.ingestionId === undefined ? INGEST_A1 : opts.ingestionId,
      envelope: env,
      payload: opts.payload ?? PAYLOAD,
      pathGatewayId: String(env.gatewayId),
      lookup: createGatewayAuthLookup(prisma as OtPrismaClient),
      secrets,
      now: new Date(),
      simulatorAllowed: opts.simulatorAllowed ?? false,
      requestId: null,
    });
  }

  const nonceCount = async (nonce: string) => {
    const [{ n }] = await sql<{ n: string }>(
      `SELECT count(*)::text AS n FROM "GatewayEnvelopeNonce" WHERE nonce=$1`, [nonce],
    );
    return Number(n);
  };

  it("mints an opaque handle that is neither the gateway id nor guessable", () => {
    expect(INGEST_A1).toMatch(INGESTION_ID_PATTERN);
    expect(INGEST_B1).toMatch(INGESTION_ID_PATTERN);
    // If the handle were the operator-supplied serial number it would be
    // enumerable, which is why a dedicated column was necessary.
    expect(INGEST_A1).not.toBe(GW_A1);
    expect(INGEST_A1).not.toBe(INGEST_B1);
  });

  it("a gateway ingests with NO human session, and carries no user identity", async () => {
    let invoked = 0;
    const svc = createGatewayEnvelopeService({
      nonces: repos.nonces, audit: auditPort(), metrics: metricSink(),
      onAccepted: async () => { invoked += 1; },
    });
    const auth = await authenticate(envelope());
    expect(auth.ok, JSON.stringify(auth)).toBe(true);
    if (!auth.ok) return;

    // The context is derived wholly from the server's own record.
    expect(auth.ctx.organizationId).toBe(ORG_A);
    expect(auth.ctx.siteId).toBe(SITE_A1);
    // A machine is never a user: no identity field exists to be misread as one.
    const asRecord = auth.ctx as unknown as Record<string, unknown>;
    expect(asRecord.userId).toBeUndefined();
    expect(asRecord.role).toBeUndefined();

    const res = await svc.ingest(auth.ctx, auth.envelope);
    expect(res.ok, JSON.stringify(res)).toBe(true);
    expect(invoked).toBe(1);
    const accepted = audited.find((a) => a.action === "OT_GATEWAY_ENVELOPE_ACCEPTED");
    expect(accepted).toBeTruthy();
    // The audit trail must not borrow a human actor for a machine's action.
    expect(accepted?.actorId ?? null).toBeNull();
  });

  it.each([
    ["invalid signature", () => ({ signature: "A".repeat(43) }), "INVALID_AUTH"],
    ["client-chosen key reference", () => ({ signingKeyRef: "env:OT_GATEWAY_HMAC_SECONDARY" }), "INVALID_AUTH"],
    ["checksum mismatch", () => ({ payloadChecksum: "b".repeat(64) }), "INVALID_AUTH"],
    ["stale timestamp", () => ({ timestamp: new Date(Date.now() - 3_600_000).toISOString() }), "STALE"],
    ["future timestamp", () => ({ timestamp: new Date(Date.now() + 3_600_000).toISOString() }), "STALE"],
  ])("%s fails authentication and reserves NO nonce", async (_label, patch, expected) => {
    const env = envelope(patch());
    const auth = await authenticate(env);
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.rejection).toBe(expected as MachineAuthRejection);
    // The critical guarantee: a request that fails authentication performs no
    // write, so it can neither flood the nonce table nor pre-consume the nonce
    // a legitimate gateway is about to present.
    expect(await nonceCount(String(env.nonce)), "no nonce may be reserved").toBe(0);
  });

  it("a valid signature from another organization is still refused", async () => {
    // Gateway B is real, enabled, capable, and signs with a key the server
    // accepts. The only thing wrong is the tenant it claims — and the record,
    // not the envelope, decides that.
    const env = envelope({ gatewayId: GW_B1, organizationId: ORG_A });
    const auth = await authenticate(env, { ingestionId: INGEST_B1 });
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.rejection).toBe("INVALID_AUTH");
    expect(await nonceCount(String(env.nonce))).toBe(0);
  });

  it("a handle belonging to a different gateway cannot sign for this one", async () => {
    const env = envelope();
    const auth = await authenticate(env, { ingestionId: INGEST_B1 });
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.rejection).toBe("INVALID_AUTH");
    expect(await nonceCount(String(env.nonce))).toBe(0);
  });

  it.each([
    ["absent", null],
    ["empty", ""],
    ["malformed", "../../etc/passwd"],
    ["unknown but well formed", "z".repeat(43)],
  ])("a %s handle is refused identically, without disclosing existence", async (_l, handle) => {
    const env = envelope();
    const auth = await authenticate(env, { ingestionId: handle });
    expect(auth.ok).toBe(false);
    // Same rejection AND the same absent gateway id, so nothing distinguishes
    // "no such gateway" from "wrong shape".
    if (!auth.ok) {
      expect(auth.rejection).toBe("INVALID_AUTH");
      expect(auth.gatewayId).toBeNull();
    }
    expect(await nonceCount(String(env.nonce))).toBe(0);
  });

  it("an envelope naming a gateway other than the path is refused", async () => {
    const env = envelope();
    const auth = await authenticateGateway({
      ingestionId: INGEST_A1,
      envelope: env,
      payload: PAYLOAD,
      pathGatewayId: `${GW_A1}-other`,
      lookup: createGatewayAuthLookup(prisma as OtPrismaClient),
      secrets,
      now: new Date(),
      simulatorAllowed: false,
      requestId: null,
    });
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.rejection).toBe("MALFORMED");
    expect(await nonceCount(String(env.nonce))).toBe(0);
  });

  it("a payload type outside the gateway's capabilities is refused", async () => {
    const env = envelope({ payloadType: "TAG_METADATA" });
    const auth = await authenticate(env);
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.rejection).toBe("CAPABILITY");
    expect(await nonceCount(String(env.nonce))).toBe(0);
  });

  it("a duplicate valid nonce is REPLAY_DETECTED, and 20 concurrent yield one winner", async () => {
    const svc = services().gateway;
    const env = envelope();
    const auth = await authenticate(env);
    expect(auth.ok).toBe(true);
    if (!auth.ok) return;

    const first = await svc.ingest(auth.ctx, auth.envelope);
    expect(first.ok).toBe(true);
    const replay = await svc.ingest(auth.ctx, auth.envelope);
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.code).toBe("REPLAY_DETECTED");

    const racy = envelope();
    const racyAuth = await authenticate(racy);
    expect(racyAuth.ok).toBe(true);
    if (!racyAuth.ok) return;
    const results = await Promise.all(
      Array.from({ length: 20 }, () => svc.ingest(racyAuth.ctx, racyAuth.envelope)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await nonceCount(String(racy.nonce))).toBe(1);
  }, 120_000);

  it("no secret, signature, nonce, handle or payload reaches audit or metrics", async () => {
    const svc = services().gateway;
    const env = envelope({ signature: "FORGEDSIGNATUREVALUE1234567890" });
    const auth = await authenticate(env);
    expect(auth.ok).toBe(false);
    if (!auth.ok) await svc.rejected(auth.rejection, auth.gatewayId);

    const good = await authenticate(envelope());
    if (good.ok) await svc.ingest(good.ctx, good.envelope);

    const raw = JSON.stringify({ audited, metered });
    for (const secret of [
      SECRET, String(env.signature), String(env.nonce), String(env.idempotencyKey),
      CHECKSUM, KEY_REF, PAYLOAD, INGEST_A1,
    ]) {
      expect(raw, "a sensitive value reached audit/metrics").not.toContain(secret);
    }
  });

  it("a machine context carries nothing a human-authorized service would accept", () => {
    const machine = { organizationId: ORG_A, gatewayId: GW_A1 } as unknown as GatewayMachineContext;
    expect((machine as unknown as Record<string, unknown>).userId).toBeUndefined();
    // And the human builder still refuses to manufacture an actor from nothing,
    // so there is no back door that turns a machine into a user.
    expect(() =>
      buildOtServiceContext({ userId: "", organizationId: ORG_A, role: "ADMIN", allowedSiteIds: null }),
    ).toThrow();
  });

  it("metric labels stay low-cardinality across every service", async () => {
    const svc = services();
    await svc.imports.execute(ctxA(), importReq("metrics1"));
    for (const [, , labels] of metered) {
      for (const key of Object.keys(labels)) {
        expect(["severity", "sourceType", "outcome", "payloadType"]).toContain(key);
      }
    }
  }, 60_000);
});

describe.skipIf(!ENABLED)("94B.1 — list filters against real PostgreSQL", () => {
  /**
   * These run through the REAL adapters against real rows, because the property
   * under test is a database property: a filter must narrow inside the same
   * tenant-scoped query that paginates, and must never widen it.
   *
   * The seeded fixture is self-contained (its own sites, gateways and assets)
   * so it cannot be perturbed by, or perturb, the other suites in this file.
   */
  const P = `${RUN}-f`;                      // fixture prefix
  const SITE_1 = `${P}-site1`;
  const SITE_2 = `${P}-site2`;
  const SITE_B = `${P}-siteB`;
  const SITE_3 = `${P}-site3`;

  /** [gatewayId, site, name, lifecycle, capabilities] */
  const GATEWAYS: Array<[string, string, string, string, string[]]> = [
    [`${P}-gw1`, SITE_1, "Packing line north", "ACTIVE", ["PROJECT_METADATA_IMPORT", "TAG_METADATA_IMPORT"]],
    [`${P}-gw2`, SITE_1, "Packing line south", "DISABLED", ["PROJECT_METADATA_IMPORT"]],
    [`${P}-gw3`, SITE_2, "Utilities block", "ACTIVE", ["READ_ONLY_TELEMETRY"]],
    [`${P}-gw4`, SITE_2, "Boiler house", "REVOKED", ["ALARM_METADATA_IMPORT"]],
    // A matched PAIR for the LIKE-metacharacter tests: the names differ only by
    // the wildcard characters, so an unescaped search term would match both and
    // an escaped one matches exactly the intended row.
    [`${P}-gw5`, SITE_3, "Zone_9%Alpha", "STALE", ["PROJECT_METADATA_IMPORT"]],
    [`${P}-gw6`, SITE_3, "Zone9XAlpha", "STALE", ["PROJECT_METADATA_IMPORT"]],
  ];

  /** [assetId, site, name, category, lifecycleState, engineeringId] */
  const DEVICES: Array<[string, string, string, string, string, string]> = [
    [`${P}-a1`, SITE_1, "Filler PLC", "PLC", "OPERATIONAL", `${P}-ENG-1`],
    [`${P}-a2`, SITE_1, "Filler panel", "HMI", "MAINTENANCE", `${P}-ENG-2`],
    [`${P}-a3`, SITE_2, "Chiller drive", "VFD", "OPERATIONAL", `${P}-ENG-3`],
    [`${P}-a4`, SITE_2, "Safety relay", "SAFETY_CONTROLLER", "DECOMMISSIONED", `${P}-ENG-4`],
  ];

  beforeAll(async () => {
    if (!ENABLED) return;
    for (const [site, org] of [[SITE_1, ORG_A], [SITE_2, ORG_A], [SITE_3, ORG_A], [SITE_B, ORG_B]] as const) {
      await sql(
        `INSERT INTO "IndustrialSite" (id,"organizationId",name,slug,"updatedAt") VALUES ($1,$2,$3,$4,now()) ON CONFLICT DO NOTHING`,
        [site, org, `Site ${site}`, site],
      );
    }

    for (const [gw, site, name, lifecycle, caps] of GATEWAYS) {
      await sql(
        `INSERT INTO "IndustrialGateway" (id,"organizationId","siteId",name,"gatewayId","updatedAt") VALUES ($1,$2,$3,$4,$5,now()) ON CONFLICT DO NOTHING`,
        [gw, ORG_A, site, name, `${gw}-serial`],
      );
      await sql(
        `INSERT INTO "EdgeGatewayProfile" (id,"organizationId","gatewayId",lifecycle,capabilities,"updatedAt")
         VALUES ($1,$2,$3,$4::"EdgeGatewayLifecycle",$5::"EdgeGatewayCapability"[],now()) ON CONFLICT DO NOTHING`,
        [`${gw}-p`, ORG_A, gw, lifecycle, caps],
      );
    }

    // A second tenant holding a gateway that matches every filter below, so a
    // leak would be visible rather than silent.
    await sql(
      `INSERT INTO "IndustrialGateway" (id,"organizationId","siteId",name,"gatewayId","updatedAt") VALUES ($1,$2,$3,$4,$5,now()) ON CONFLICT DO NOTHING`,
      [`${P}-gwB`, ORG_B, SITE_B, "Packing line north", `${P}-gwB-serial`],
    );
    await sql(
      `INSERT INTO "EdgeGatewayProfile" (id,"organizationId","gatewayId",lifecycle,capabilities,"updatedAt")
       VALUES ($1,$2,$3,'ACTIVE'::"EdgeGatewayLifecycle",$4::"EdgeGatewayCapability"[],now()) ON CONFLICT DO NOTHING`,
      [`${P}-gwB-p`, ORG_B, `${P}-gwB`, ["PROJECT_METADATA_IMPORT"]],
    );

    for (const [asset, site, name, category, lifecycleState, engineeringId] of DEVICES) {
      await sql(
        `INSERT INTO "IndustrialAsset" (id,"organizationId","siteId",name,"updatedAt") VALUES ($1,$2,$3,$4,now()) ON CONFLICT DO NOTHING`,
        [asset, ORG_A, site, name],
      );
      await sql(
        `INSERT INTO "OtDeviceProfile" (id,"organizationId","assetId",category,"lifecycleState","engineeringId","updatedAt")
         VALUES ($1,$2,$3,$4::"OtDeviceCategory",$5::"OtLifecycleState",$6,now()) ON CONFLICT DO NOTHING`,
        [`${asset}-p`, ORG_A, asset, category, lifecycleState, engineeringId],
      );
    }

    await sql(
      `INSERT INTO "IndustrialAsset" (id,"organizationId","siteId",name,"updatedAt") VALUES ($1,$2,$3,$4,now()) ON CONFLICT DO NOTHING`,
      [`${P}-aB`, ORG_B, SITE_B, "Filler PLC"],
    );
    await sql(
      `INSERT INTO "OtDeviceProfile" (id,"organizationId","assetId",category,"lifecycleState","updatedAt")
       VALUES ($1,$2,$3,'PLC'::"OtDeviceCategory",'OPERATIONAL'::"OtLifecycleState",now()) ON CONFLICT DO NOTHING`,
      [`${P}-aB-p`, ORG_B, `${P}-aB`],
    );
  }, 120_000);

  /** Only the ids this fixture created, so unrelated suites cannot skew a count. */
  const mine = (ids: string[]) => ids.filter((id) => id.startsWith(P));

  async function gwList(ctx: ReturnType<typeof ctxA>, filters?: Record<string, string>, page?: Record<string, number | string>) {
    const res = await repos.gateways.listVisible(ctx, page as never, filters as never);
    expect(res.ok, JSON.stringify(res)).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    return res.value;
  }

  async function devList(ctx: ReturnType<typeof ctxA>, filters?: Record<string, string>, page?: Record<string, number | string>) {
    const res = await repos.devices.listVisible(ctx, page as never, filters as never);
    expect(res.ok, JSON.stringify(res)).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    return res.value;
  }

  it("filters gateways by lifecycle", async () => {
    const { items } = await gwList(ctxA(), { lifecycle: "ACTIVE" }, { take: 200 });
    const ids = mine(items.map((g) => g.id));
    expect(ids.sort()).toEqual([`${P}-gw1-p`, `${P}-gw3-p`].sort());
  });

  it("filters gateways by site", async () => {
    const { items } = await gwList(ctxA(), { siteId: SITE_2 }, { take: 200 });
    expect(mine(items.map((g) => g.id)).sort()).toEqual([`${P}-gw3-p`, `${P}-gw4-p`].sort());
  });

  it("filters gateways by a declared capability", async () => {
    const { items } = await gwList(ctxA(), { capability: "TAG_METADATA_IMPORT" }, { take: 200 });
    expect(mine(items.map((g) => g.id))).toEqual([`${P}-gw1-p`]);
  });

  it("searches gateways by name and by hardware identifier", async () => {
    const byName = await gwList(ctxA(), { search: "packing line" }, { take: 200 });
    expect(mine(byName.items.map((g) => g.id)).sort()).toEqual([`${P}-gw1-p`, `${P}-gw2-p`].sort());

    const bySerial = await gwList(ctxA(), { search: `${P}-gw4-serial` }, { take: 200 });
    expect(mine(bySerial.items.map((g) => g.id))).toEqual([`${P}-gw4-p`]);
    // The identifier is searchable but still never returned.
    expect(JSON.stringify(bySerial.items)).not.toContain(`${P}-gw4-serial`);
  });

  it("a search term matches literally, not as a LIKE pattern", async () => {
    // Prisma compiles `contains` to ILIKE with no ESCAPE clause, so an
    // unescaped `_` matches ANY character and `%` matches anything at all.

    // `_` must be a literal underscore: "Zone_9%Alpha" only, never "Zone9XAlpha".
    const underscore = await gwList(ctxA(), { search: "Zone_9" }, { take: 200 });
    expect(mine(underscore.items.map((g) => g.id))).toEqual([`${P}-gw5-p`]);

    // `%` must be a literal percent sign, not "match everything".
    const percent = await gwList(ctxA(), { search: "%" }, { take: 200 });
    expect(mine(percent.items.map((g) => g.id))).toEqual([`${P}-gw5-p`]);

    // And a backslash must not smuggle an escape into the pattern.
    const backslash = await gwList(ctxA(), { search: "\\" }, { take: 200 });
    expect(mine(backslash.items.map((g) => g.id))).toEqual([]);

    // The ordinary case still works.
    const plain = await gwList(ctxA(), { search: "Alpha" }, { take: 200 });
    expect(mine(plain.items.map((g) => g.id)).sort()).toEqual([`${P}-gw5-p`, `${P}-gw6-p`].sort());
  });

  it("composes several gateway filters as a conjunction", async () => {
    const { items } = await gwList(
      ctxA(),
      { lifecycle: "ACTIVE", siteId: SITE_1, capability: "PROJECT_METADATA_IMPORT", search: "packing" },
      { take: 200 },
    );
    expect(mine(items.map((g) => g.id))).toEqual([`${P}-gw1-p`]);
  });

  it("applies gateway filters BEFORE pagination", async () => {
    // Two ACTIVE gateways exist in this fixture. Asking for one row must give
    // the FIRST of the filtered set with total 2 — not the first of the
    // unfiltered set narrowed afterwards.
    const all = await gwList(ctxA(), { lifecycle: "ACTIVE", search: `${P}-` }, { take: 200, sortBy: "createdAt", sortDir: "asc" });
    expect(all.total).toBe(2);

    const first = await gwList(ctxA(), { lifecycle: "ACTIVE", search: `${P}-` }, { take: 1, skip: 0, sortBy: "createdAt", sortDir: "asc" });
    expect(first.items).toHaveLength(1);
    expect(first.total, "total must count the FILTERED set").toBe(2);
    expect(first.items[0].lifecycle).toBe("ACTIVE");

    const second = await gwList(ctxA(), { lifecycle: "ACTIVE", search: `${P}-` }, { take: 1, skip: 1, sortBy: "createdAt", sortDir: "asc" });
    expect(second.items[0].id).not.toBe(first.items[0].id);
    expect(second.items[0].lifecycle).toBe("ACTIVE");
  });

  it("composes gateway filters with sorting", async () => {
    const asc = await gwList(ctxA(), { search: `${P}-` }, { take: 200, sortBy: "createdAt", sortDir: "asc" });
    const desc = await gwList(ctxA(), { search: `${P}-` }, { take: 200, sortBy: "createdAt", sortDir: "desc" });
    const a = mine(asc.items.map((g) => g.id));
    const d = mine(desc.items.map((g) => g.id));
    expect(a.length).toBeGreaterThan(1);
    expect(d).toEqual([...a].reverse());
  });

  it("a site filter cannot widen a site-restricted actor", async () => {
    // THE CRITICAL PROPERTY. ctxA1 may see SITE_A1 only — not SITE_1/SITE_2 —
    // so every request below must be empty. If the filter were spread over the
    // scope instead of composed with AND, the requested site would REPLACE the
    // allow-list and hand this actor gateways it may not see.
    for (const siteId of [SITE_1, SITE_2]) {
      const { items, total } = await gwList(ctxA1(), { siteId }, { take: 200 });
      expect(mine(items.map((g) => g.id)), `leaked ${siteId}`).toEqual([]);
      expect(total).toBe(0);
    }
    const devices = await devList(ctxA1(), { siteId: SITE_2 }, { take: 200 });
    expect(mine(devices.items.map((d) => d.id))).toEqual([]);
  });

  it("filters never cross a tenant boundary", async () => {
    // Organization B holds a gateway and a device that match these filters.
    const gw = await gwList(ctxA(), { lifecycle: "ACTIVE", search: "packing line north" }, { take: 200 });
    expect(gw.items.map((g) => g.id)).not.toContain(`${P}-gwB-p`);

    const dev = await devList(ctxA(), { category: "PLC", search: "filler plc" }, { take: 200 });
    expect(dev.items.map((d) => d.id)).not.toContain(`${P}-aB-p`);

    // And the mirror image: B sees only its own.
    const fromB = await gwList(ctxB(), { lifecycle: "ACTIVE" }, { take: 200 });
    expect(mine(fromB.items.map((g) => g.id))).toEqual([`${P}-gwB-p`]);
  });

  it("the device DTO reports the lifecycle the filter narrowed on", async () => {
    // End to end against real rows: filter by lifecycle, then confirm the
    // mapped DTO actually carries that value rather than an empty string.
    const { items } = await devList(ctxA(), { lifecycle: "MAINTENANCE" }, { take: 200 });
    const own = items.filter((d) => d.id.startsWith(P));
    expect(own.map((d) => d.id)).toEqual([`${P}-a2-p`]);
    expect(toOtDeviceProfileDto(own[0] as never).lifecycle).toBe("MAINTENANCE");
  });

  it("an unmatched gateway filter returns an empty page, not an error", async () => {
    const { items, total, take, skip } = await gwList(ctxA(), { lifecycle: "STALE", siteId: SITE_1 }, { take: 200 });
    expect(mine(items.map((g) => g.id))).toEqual([]);
    expect(total).toBe(0);
    expect(take).toBe(200);
    expect(skip).toBe(0);
  });

  it("filters devices by lifecycle, site and category", async () => {
    const byLifecycle = await devList(ctxA(), { lifecycle: "OPERATIONAL" }, { take: 200 });
    expect(mine(byLifecycle.items.map((d) => d.id)).sort()).toEqual([`${P}-a1-p`, `${P}-a3-p`].sort());

    const bySite = await devList(ctxA(), { siteId: SITE_1 }, { take: 200 });
    expect(mine(bySite.items.map((d) => d.id)).sort()).toEqual([`${P}-a1-p`, `${P}-a2-p`].sort());

    const byCategory = await devList(ctxA(), { category: "SAFETY_CONTROLLER" }, { take: 200 });
    expect(mine(byCategory.items.map((d) => d.id))).toEqual([`${P}-a4-p`]);
  });

  it("searches devices by asset name and by engineering identifier", async () => {
    const byName = await devList(ctxA(), { search: "chiller" }, { take: 200 });
    expect(mine(byName.items.map((d) => d.id))).toEqual([`${P}-a3-p`]);

    const byEngineering = await devList(ctxA(), { search: `${P}-ENG-2` }, { take: 200 });
    expect(mine(byEngineering.items.map((d) => d.id))).toEqual([`${P}-a2-p`]);
  });

  it("composes several device filters and paginates the filtered set", async () => {
    const combined = await devList(ctxA(), { lifecycle: "OPERATIONAL", siteId: SITE_1, category: "PLC" }, { take: 200 });
    expect(mine(combined.items.map((d) => d.id))).toEqual([`${P}-a1-p`]);

    const all = await devList(ctxA(), { search: `${P}-ENG-` }, { take: 200 });
    expect(all.total).toBe(4);
    const firstPage = await devList(ctxA(), { search: `${P}-ENG-` }, { take: 2, skip: 0, sortBy: "createdAt", sortDir: "asc" });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.total, "total must count the FILTERED set").toBe(4);
  });

  it("an unfiltered call behaves exactly as before this phase", async () => {
    // The additive-contract guarantee: omitting filters entirely must not
    // change what the pre-94B.1 signature returned.
    const withoutArg = await repos.gateways.listVisible(ctxA(), { take: 200 } as never);
    const withUndefined = await repos.gateways.listVisible(ctxA(), { take: 200 } as never, undefined);
    const withEmpty = await repos.gateways.listVisible(ctxA(), { take: 200 } as never, {} as never);
    expect(withoutArg.ok && withUndefined.ok && withEmpty.ok).toBe(true);
    if (!withoutArg.ok || !withUndefined.ok || !withEmpty.ok) return;
    expect(withUndefined.value.total).toBe(withoutArg.value.total);
    expect(withEmpty.value.total).toBe(withoutArg.value.total);
  });

  it("the corrected lastSeenAt reaches the DTO from real data", async () => {
    const stamped = new Date("2026-05-06T07:08:09.000Z");
    // The column is `timestamp` without a zone. Handing the raw pg driver a JS
    // Date makes IT choose the zone (local), while Prisma reads the column back
    // as UTC — a one-hour disagreement that says nothing about the code under
    // test. Casting through timestamptz pins the stored wall-clock to UTC, so
    // this asserts the mapper rather than the harness.
    await sql(
      `UPDATE "EdgeGatewayProfile" SET "lastEnvelopeAt" = $1::timestamptz AT TIME ZONE 'UTC' WHERE id=$2`,
      [stamped.toISOString(), `${P}-gw1-p`],
    );
    const { items } = await gwList(ctxA(), { search: "packing line north" }, { take: 200 });
    const seen = items.find((g) => g.id === `${P}-gw1-p`);
    expect(seen?.lastEnvelopeAt?.toISOString()).toBe(stamped.toISOString());
    expect(toGatewayProfileDto(seen as never).lastSeenAt).toBe(stamped.toISOString());

    const never = items.find((g) => g.id !== `${P}-gw1-p`) ?? null;
    if (never) expect(toGatewayProfileDto(never as never).lastSeenAt).toBeNull();
  });
});
