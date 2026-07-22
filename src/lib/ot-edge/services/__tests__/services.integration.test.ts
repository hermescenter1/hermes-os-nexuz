import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { createHash } from "node:crypto";
import { assertTestDatabase, resolveOtIntegrationMode } from "@/test/ot-db-guard";
import { buildOtServiceContext, type OtServiceContext } from "../../service-context";
import {
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
import { sanitizeAuditMetadata, type AuditPort, type OtAuditAction } from "../core";
import { RULE_IDS } from "../../analysis-rules";
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
const SECRET = "integration-only-secret-0123456789abcdef";

let pool: Pool;
let prisma: OtTransactionalPrismaClient;
let repos: OtRepositories;

/** Captured audit events — the real port, so payloads are the real ones. */
let audited: Array<{ action: OtAuditAction; entityId: string | null; metadata: Record<string, unknown> }>;
let metered: Array<[OtMetric, number, OtMetricLabels]>;

const auditPort = (): AuditPort => ({
  async record(input) {
    audited.push({
      action: input.action,
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
    gateway: createGatewayEnvelopeService({
      gateways: repos.gateways, nonces: repos.nonces, secrets, audit, metrics,
    }),
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

  await repos.gateways.createProfile(ctxA(), {
    gatewayId: GW_A1, capabilities: ["PROJECT_METADATA_IMPORT"], signingKeyRef: KEY_REF,
  });
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

describe.skipIf(!ENABLED)("94B3.3 — gateway envelope service", () => {
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

  const nonceCount = async (nonce: string) => {
    const [{ n }] = await sql<{ n: string }>(
      `SELECT count(*)::text AS n FROM "GatewayEnvelopeNonce" WHERE nonce=$1`, [nonce],
    );
    return Number(n);
  };

  it("accepts a correctly signed envelope and invokes the handler exactly once", async () => {
    let invoked = 0;
    const svc = createGatewayEnvelopeService({
      gateways: repos.gateways, nonces: repos.nonces, secrets,
      audit: auditPort(), metrics: metricSink(), onAccepted: async () => { invoked += 1; },
    });
    const res = await svc.process(ctxA(), envelope(), PAYLOAD);
    expect(res.ok, JSON.stringify(res)).toBe(true);
    expect(invoked).toBe(1);
    expect(audited.some((a) => a.action === "OT_GATEWAY_ENVELOPE_ACCEPTED")).toBe(true);
  });

  it.each([
    ["invalid signature", () => ({ signature: "A".repeat(43) }), "SIGNATURE_INVALID"],
    ["client-chosen key reference", () => ({ signingKeyRef: "env:OT_GATEWAY_HMAC_SECONDARY" }), "SIGNATURE_INVALID"],
    ["checksum mismatch", () => ({ payloadChecksum: "b".repeat(64) }), "VALIDATION_FAILED"],
    ["stale timestamp", () => ({ timestamp: new Date(Date.now() - 3_600_000).toISOString() }), "STALE_TIMESTAMP"],
    ["future timestamp", () => ({ timestamp: new Date(Date.now() + 3_600_000).toISOString() }), "STALE_TIMESTAMP"],
  ])("%s is rejected and reserves NO nonce", async (_label, patch, expected) => {
    const svc = services().gateway;
    const env = envelope(patch());
    const res = await svc.process(ctxA(), env, PAYLOAD);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe(expected);
    // The critical guarantee: a rejected envelope must not burn a nonce.
    expect(await nonceCount(env.nonce), "no nonce may be reserved").toBe(0);
  });

  it("an unknown and a foreign gateway give the same hidden answer", async () => {
    const svc = services().gateway;
    const unknown = await svc.process(ctxA(), envelope({ gatewayId: `${RUN}-nope` }), PAYLOAD);
    const foreign = await svc.process(ctxA(), envelope({ gatewayId: GW_B1 }), PAYLOAD);
    expect(unknown.ok).toBe(false);
    expect(foreign.ok).toBe(false);
    expect(JSON.stringify(unknown)).toBe(JSON.stringify(foreign));
  });

  it("a duplicate valid nonce is REPLAY_DETECTED, and 20 concurrent yield one winner", async () => {
    const svc = services().gateway;
    const env = envelope();
    const first = await svc.process(ctxA(), env, PAYLOAD);
    expect(first.ok).toBe(true);
    const replay = await svc.process(ctxA(), env, PAYLOAD);
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.code).toBe("REPLAY_DETECTED");

    const racy = envelope();
    const results = await Promise.all(Array.from({ length: 20 }, () => svc.process(ctxA(), racy, PAYLOAD)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await nonceCount(racy.nonce)).toBe(1);
  }, 120_000);

  it("no secret, signature, nonce or payload reaches audit or metrics", async () => {
    const svc = services().gateway;
    const env = envelope({ signature: "FORGEDSIGNATUREVALUE1234567890" });
    await svc.process(ctxA(), env, PAYLOAD);
    const raw = JSON.stringify({ audited, metered });
    for (const secret of [SECRET, env.signature, env.nonce, env.idempotencyKey, CHECKSUM, KEY_REF, PAYLOAD]) {
      expect(raw, "a sensitive value reached audit/metrics").not.toContain(secret);
    }
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
