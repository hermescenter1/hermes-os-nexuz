// PHASE 94B3.2 — production Prisma adapters.
//
// THE RULE THIS FILE EXISTS TO ENFORCE
// Every query composes its `where` from `orgScope`/`siteScope`. There is no
// `findUnique({ where: { id } })` anywhere: a lookup by a caller-supplied id
// ALWAYS goes through `findFirst` with the tenant predicate in the same query,
// so a foreign row is never fetched and then rejected — it is never fetched.
// That difference matters because "fetch then check" leaks existence through
// timing and through any later refactor that forgets the check.
//
// The Prisma client is INJECTED, never imported as a singleton. That is what
// lets the transaction manager hand the same adapters a transaction client and
// guarantee that writes inside a transaction cannot escape it.

import type { OtServiceContext } from "../service-context";
import { generateIngestionId, type GatewayAuthLookup, type GatewayAuthRecord } from "../machine-context";
import { boundedPage } from "../service-context";
import {
  guarded,
  succeed,
  fail,
  orgScope,
  siteScope,
  hasNoSiteAccess,
  siteAllowed,
  safeOrderBy,
  type RepoResult,
} from "./core";
import type {
  AlarmDefinitionRecord,
  AnalysisInput,
  AutomationTagRecord,
  CreateGatewayProfileInput,
  DeviceListFilters,
  GatewayListFilters,
  CreateImportInput,
  CreateOtDeviceProfileInput,
  CreateProjectWithArtifactsInput,
  DeterministicFindingInput,
  EngineeringFindingRecord,
  EngineeringFindingRepository,
  EngineeringImportRecord,
  EngineeringImportRepository,
  EngineeringProjectRecord,
  EngineeringProjectRepository,
  GatewayNonceRepository,
  GatewayProfileRecord,
  GatewayProfileRepository,
  GatewaySigningConfiguration,
  ImportCounts,
  NetworkNodeRecord,
  OtDeviceProfileRecord,
  OtDeviceProfileRepository,
  OtRepositories,
  OtPersistenceTransactionManager,
  Page,
  PageRequest,
  ReserveOutcome,
  TransitionInput,
  TransitionOutcome,
  UpdateGatewayProfileInput,
  UpdateOtDeviceProfileInput,
} from "./ports";

/* ── Minimal structural view of the Prisma client ───────────────────────── */

interface Delegate {
  findFirst(args: unknown): Promise<Record<string, unknown> | null>;
  findMany(args: unknown): Promise<Record<string, unknown>[]>;
  count(args: unknown): Promise<number>;
  create(args: unknown): Promise<Record<string, unknown>>;
  createMany?(args: unknown): Promise<{ count: number }>;
  update(args: unknown): Promise<Record<string, unknown>>;
  updateMany(args: unknown): Promise<{ count: number }>;
  deleteMany(args: unknown): Promise<{ count: number }>;
  upsert(args: unknown): Promise<Record<string, unknown>>;
}

/**
 * The subset of the client the adapters use.
 *
 * Structural rather than the generated type so a transaction client (which
 * lacks `$transaction`) satisfies it too — that is precisely what makes the
 * transaction boundary enforceable at the type level.
 */
export interface OtPrismaClient {
  edgeGatewayProfile: Delegate;
  otDeviceProfile: Delegate;
  engineeringImport: Delegate;
  engineeringProject: Delegate;
  automationTag: Delegate;
  alarmDefinition: Delegate;
  industrialNetworkNode: Delegate;
  engineeringFinding: Delegate;
  gatewayEnvelopeNonce: Delegate;
  industrialGateway: Delegate;
  industrialAsset: Delegate;
  industrialSite: Delegate;
}

export interface OtTransactionalPrismaClient extends OtPrismaClient {
  $transaction<T>(fn: (tx: OtPrismaClient) => Promise<T>): Promise<T>;
}

/* ── helpers ────────────────────────────────────────────────────────────── */

const s = (v: unknown): string => (typeof v === "string" ? v : "");
const ns = (v: unknown): string | null => (typeof v === "string" ? v : null);
const n = (v: unknown): number => (typeof v === "number" ? v : 0);
const b = (v: unknown): boolean => v === true;
const d = (v: unknown): Date => (v instanceof Date ? v : new Date(0));
const nd = (v: unknown): Date | null => (v instanceof Date ? v : null);
const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function pageArgs(page?: PageRequest) {
  const { take, skip } = boundedPage(page);
  return { take, skip };
}

/* ── Gateway adapter ────────────────────────────────────────────────────── */

type Row = Record<string, unknown>;

function gatewayRecord(row: Row): GatewayProfileRecord {
  const gw = (row.gateway ?? {}) as Row;
  return {
    id: s(row.id),
    gatewayId: s(row.gatewayId),
    // Display name and site live on the reused IndustrialGateway, not on the
    // profile: Phase 94 extends the existing registry rather than cloning it.
    displayName: s(gw.name),
    siteId: ns(gw.siteId),
    lifecycle: s(row.lifecycle),
    environment: s(row.environment),
    capabilities: arr(row.capabilities),
    softwareVersion: ns(row.softwareVersion),
    readOnlyMode: b(row.readOnlyMode),
    simulatorMode: b(row.simulatorMode),
    disabled: b(row.disabled),
    signingConfigured: typeof row.signingKeyRef === "string" && row.signingKeyRef.length > 0,
    lastEnvelopeAt: nd(row.lastEnvelopeAt),
    createdAt: d(row.createdAt),
    updatedAt: d(row.updatedAt),
  };
}

const GATEWAY_INCLUDE = { gateway: { select: { name: true, siteId: true, organizationId: true } } };

/**
 * PHASE 94B.1 — make a search term match itself, not a pattern.
 *
 * Prisma compiles `contains` to `col ILIKE '%' || $1 || '%'` and emits no
 * ESCAPE clause, so `%` and `_` inside the bound parameter are still LIKE
 * wildcards. The value is parameterised — this is not an injection — but the
 * contract promises a SUBSTRING match, and without this a lone `%` would match
 * every row while `_` would match any character. Underscores are pervasive in
 * automation identifiers (`Motor_Run`), so this is an everyday case, not an
 * exotic one.
 *
 * PostgreSQL treats backslash as the default LIKE escape character when no
 * ESCAPE clause is given, which is exactly the situation here.
 */
function literalContains(term: string): Row {
  return { contains: term.replace(/[\\%_]/g, (ch) => `\\${ch}`), mode: "insensitive" };
}

/**
 * PHASE 94B.1 — narrowing predicates for the gateway list.
 *
 * Each entry becomes one member of an `AND` array beside the trusted scope, so
 * a filter intersects with tenancy rather than replacing any part of it. Every
 * value is passed as a Prisma argument, never concatenated into a query
 * fragment, and every value has already been checked against a closed
 * allow-list at the route boundary.
 *
 * There is no `category` predicate: `EdgeGatewayProfile` has no such column.
 */
function gatewayFilterPredicates(filters?: GatewayListFilters): Row[] {
  const out: Row[] = [];
  if (!filters) return out;
  if (filters.lifecycle) out.push({ lifecycle: filters.lifecycle });
  // The site lives on the related registry row, which is also where the scope
  // reads it from — so scope and filter constrain the same relation.
  if (filters.siteId) out.push({ gateway: { is: { siteId: filters.siteId } } });
  // `has` on the enum array: the profile must DECLARE this capability.
  if (filters.capability) out.push({ capabilities: { has: filters.capability } });
  if (filters.search) {
    const contains = literalContains(filters.search);
    // Both targets are required, always-populated columns on the registry row.
    // The hardware identifier is searchABLE but is still never RETURNED — this
    // adds no field to the DTO.
    out.push({
      OR: [
        { gateway: { is: { name: contains } } },
        { gateway: { is: { gatewayId: contains } } },
      ],
    });
  }
  return out;
}

/**
 * PHASE 94B.1 — narrowing predicates for the device list.
 *
 * There is no `vendor` predicate: `OtDeviceProfile` stores no manufacturer,
 * model or protocol column, so such a filter could only ever match nothing.
 */
function deviceFilterPredicates(filters?: DeviceListFilters): Row[] {
  const out: Row[] = [];
  if (!filters) return out;
  // The public filter is called `lifecycle`; the column is `lifecycleState`.
  if (filters.lifecycle) out.push({ lifecycleState: filters.lifecycle });
  if (filters.siteId) out.push({ asset: { is: { siteId: filters.siteId } } });
  if (filters.category) out.push({ category: filters.category });
  if (filters.search) {
    const contains = literalContains(filters.search);
    // `asset.name` is required by the registry; `engineeringId` is optional but
    // genuinely written by imports and by the create route — neither is one of
    // the always-null columns.
    out.push({
      OR: [{ asset: { is: { name: contains } } }, { engineeringId: contains }],
    });
  }
  return out;
}

export function createGatewayRepository(db: OtPrismaClient): GatewayProfileRepository {
  /** Tenant + site predicate. Site lives on the related IndustrialGateway. */
  const scope = (ctx: OtServiceContext): Row => {
    const site = siteScope(ctx);
    return site === undefined
      ? orgScope(ctx)
      : { ...orgScope(ctx), gateway: { is: { siteId: site } } };
  };

  return {
    async listVisible(ctx, page, filters) {
      const { take, skip } = pageArgs(page);
      // AND, never a spread. Spreading a `siteId` filter over `scope(ctx)`
      // would REPLACE the actor's site allow-list with the requested site and
      // hand a site-restricted actor another site's gateways. Composing with
      // AND makes the filter an intersection, so it can only ever narrow.
      const where = { AND: [scope(ctx), ...gatewayFilterPredicates(filters)] };
      return guarded(async () => {
        const [rows, total] = await Promise.all([
          db.edgeGatewayProfile.findMany({
            where,
            take,
            skip,
            orderBy: safeOrderBy("gateway", page?.sortBy, page?.sortDir),
            include: GATEWAY_INCLUDE,
          }),
          db.edgeGatewayProfile.count({ where }),
        ]);
        return { items: rows.map(gatewayRecord), total, take, skip } as Page<GatewayProfileRecord>;
      });
    },

    async findVisibleById(ctx, id) {
      // findFirst with the tenant predicate in the SAME query — a foreign row
      // is never loaded, so it is indistinguishable from a missing one.
      const res = await guarded(() =>
        db.edgeGatewayProfile.findFirst({ where: { id, ...scope(ctx) }, include: GATEWAY_INCLUDE }),
      );
      if (!res.ok) return res;
      return res.value ? succeed(gatewayRecord(res.value)) : fail("NOT_FOUND");
    },

    async createProfile(ctx, input) {
      // The referenced gateway must belong to this organization AND to a site
      // this actor may act on. Checked by query, not by trusting the caller.
      const parent = await guarded(() =>
        db.industrialGateway.findFirst({
          where: { id: input.gatewayId, ...orgScope(ctx) },
          select: { id: true, siteId: true },
        }),
      );
      if (!parent.ok) return parent;
      if (!parent.value) return fail("VALIDATION_FAILED", "unknown gateway");
      if (!siteAllowed(ctx, ns(parent.value.siteId))) return fail("FORBIDDEN");

      const ingestionId = generateIngestionId();

      const created = await guarded(() =>
        db.edgeGatewayProfile.create({
          data: {
            organizationId: ctx.organizationId,
            gatewayId: input.gatewayId,
            ...(input.environment ? { environment: input.environment } : {}),
            ...(input.capabilities ? { capabilities: input.capabilities } : {}),
            softwareVersion: input.softwareVersion ?? null,
            ...(input.readOnlyMode === undefined ? {} : { readOnlyMode: input.readOnlyMode }),
            ...(input.simulatorMode === undefined ? {} : { simulatorMode: input.simulatorMode }),
            signingKeyRef: input.signingKeyRef ?? null,
            // PHASE 94B4.1 — every profile is born with a machine handle, so a
            // gateway is ingestion-capable the moment it exists and nobody has
            // to remember a second provisioning step. Server-generated: a
            // client-chosen value would let a caller pick another tenant's.
            ingestionId,
          },
          include: GATEWAY_INCLUDE,
        }),
      );
      // The handle is echoed exactly once, here, because the operator must
      // configure the device with it. It is deliberately absent from every
      // other mapping.
      return created.ok ? succeed({ ...gatewayRecord(created.value), ingestionId }) : created;
    },

    async updateProfile(ctx, id, input) {
      // updateMany carries the tenant predicate; a foreign id updates 0 rows.
      const patch: Row = {};
      if (input.environment !== undefined) patch.environment = input.environment;
      if (input.capabilities !== undefined) patch.capabilities = input.capabilities;
      if (input.softwareVersion !== undefined) patch.softwareVersion = input.softwareVersion;
      if (input.readOnlyMode !== undefined) patch.readOnlyMode = input.readOnlyMode;
      if (input.simulatorMode !== undefined) patch.simulatorMode = input.simulatorMode;
      if (input.signingKeyRef !== undefined) patch.signingKeyRef = input.signingKeyRef;

      // Visibility (including site, which lives on the related gateway) is
      // resolved with findFirst; updateMany then uses scalar-only predicates.
      const visible = await this.findVisibleById(ctx, id);
      if (!visible.ok) return visible;

      const res = await guarded(() =>
        db.edgeGatewayProfile.updateMany({ where: { id, ...orgScope(ctx) }, data: patch }),
      );
      if (!res.ok) return res;
      if (res.value.count === 0) return fail("NOT_FOUND");
      return this.findVisibleById(ctx, id);
    },

    async updateLifecycle(ctx, id, lifecycle) {
      const visible = await this.findVisibleById(ctx, id);
      if (!visible.ok) return visible;

      const res = await guarded(() =>
        db.edgeGatewayProfile.updateMany({ where: { id, ...orgScope(ctx) }, data: { lifecycle } }),
      );
      if (!res.ok) return res;
      if (res.value.count === 0) return fail("NOT_FOUND");
      return this.findVisibleById(ctx, id);
    },

    async findSigningConfiguration(ctx, gatewayId) {
      const res = await guarded(() =>
        db.edgeGatewayProfile.findFirst({
          where: { gatewayId, ...orgScope(ctx) },
          select: {
            gatewayId: true,
            organizationId: true,
            signingKeyRef: true,
            disabled: true,
            lifecycle: true,
            simulatorMode: true,
            capabilities: true,
          },
        }),
      );
      if (!res.ok) return res;
      if (!res.value) return fail("NOT_FOUND");
      const r = res.value;
      return succeed({
        gatewayId: s(r.gatewayId),
        organizationId: s(r.organizationId),
        signingKeyRef: ns(r.signingKeyRef),
        disabled: b(r.disabled),
        lifecycle: s(r.lifecycle),
        simulatorMode: b(r.simulatorMode),
        capabilities: arr(r.capabilities),
      } satisfies GatewaySigningConfiguration);
    },
  };
}

/* ── Device adapter ─────────────────────────────────────────────────────── */

function deviceRecord(row: Row): OtDeviceProfileRecord {
  const asset = (row.asset ?? {}) as Row;
  return {
    id: s(row.id),
    assetId: s(row.assetId),
    siteId: ns(asset.siteId),
    category: s(row.category),
    lifecycleState: s(row.lifecycleState),
    networkZone: s(row.networkZone),
    safetyClass: s(row.safetyClass),
    productFamily: ns(row.productFamily),
    firmwareVersion: ns(row.firmwareVersion),
    engineeringId: ns(row.engineeringId),
    createdAt: d(row.createdAt),
    updatedAt: d(row.updatedAt),
  };
}

const DEVICE_INCLUDE = { asset: { select: { siteId: true, organizationId: true } } };

export function createDeviceRepository(db: OtPrismaClient): OtDeviceProfileRepository {
  const scope = (ctx: OtServiceContext): Row => {
    const site = siteScope(ctx);
    return site === undefined ? orgScope(ctx) : { ...orgScope(ctx), asset: { is: { siteId: site } } };
  };

  return {
    async listVisible(ctx, page, filters) {
      const { take, skip } = pageArgs(page);
      // See the gateway repository: AND-composition keeps a filter subordinate
      // to the tenant and site scope instead of overwriting it.
      const where = { AND: [scope(ctx), ...deviceFilterPredicates(filters)] };
      return guarded(async () => {
        const [rows, total] = await Promise.all([
          db.otDeviceProfile.findMany({
            where,
            take,
            skip,
            orderBy: safeOrderBy("device", page?.sortBy, page?.sortDir),
            include: DEVICE_INCLUDE,
          }),
          db.otDeviceProfile.count({ where }),
        ]);
        return { items: rows.map(deviceRecord), total, take, skip } as Page<OtDeviceProfileRecord>;
      });
    },

    async findVisibleById(ctx, id) {
      const res = await guarded(() =>
        db.otDeviceProfile.findFirst({ where: { id, ...scope(ctx) }, include: DEVICE_INCLUDE }),
      );
      if (!res.ok) return res;
      return res.value ? succeed(deviceRecord(res.value)) : fail("NOT_FOUND");
    },

    async createProfile(ctx, input) {
      // The asset must be in this organization; its site must be permitted.
      const asset = await guarded(() =>
        db.industrialAsset.findFirst({
          where: { id: input.assetId, ...orgScope(ctx) },
          select: { id: true, siteId: true },
        }),
      );
      if (!asset.ok) return asset;
      if (!asset.value) return fail("VALIDATION_FAILED", "unknown asset");
      if (!siteAllowed(ctx, ns(asset.value.siteId))) return fail("FORBIDDEN");

      const created = await guarded(() =>
        db.otDeviceProfile.create({
          data: {
            organizationId: ctx.organizationId,
            assetId: input.assetId,
            ...(input.category ? { category: input.category } : {}),
            ...(input.lifecycleState ? { lifecycleState: input.lifecycleState } : {}),
            ...(input.networkZone ? { networkZone: input.networkZone } : {}),
            ...(input.safetyClass ? { safetyClass: input.safetyClass } : {}),
            productFamily: input.productFamily ?? null,
            firmwareVersion: input.firmwareVersion ?? null,
            engineeringId: input.engineeringId ?? null,
          },
          include: DEVICE_INCLUDE,
        }),
      );
      return created.ok ? succeed(deviceRecord(created.value)) : created;
    },

    async updateProfile(ctx, id, input: UpdateOtDeviceProfileInput) {
      const patch: Row = {};
      for (const k of [
        "category",
        "lifecycleState",
        "networkZone",
        "safetyClass",
        "productFamily",
        "firmwareVersion",
        "engineeringId",
      ] as const) {
        if (input[k] !== undefined) patch[k] = input[k];
      }
      const visible = await this.findVisibleById(ctx, id);
      if (!visible.ok) return visible;

      const res = await guarded(() =>
        db.otDeviceProfile.updateMany({ where: { id, ...orgScope(ctx) }, data: patch }),
      );
      if (!res.ok) return res;
      if (res.value.count === 0) return fail("NOT_FOUND");
      return this.findVisibleById(ctx, id);
    },
  };
}

/* ── Import adapter ─────────────────────────────────────────────────────── */

function importRecord(row: Row): EngineeringImportRecord {
  return {
    id: s(row.id),
    siteId: ns(row.siteId),
    sourceType: s(row.sourceType),
    sourceFilename: s(row.sourceFilename),
    contentType: s(row.contentType),
    checksum: s(row.checksum),
    byteSize: n(row.byteSize),
    status: s(row.status),
    failureReason: s(row.failureReason),
    deviceCount: n(row.deviceCount),
    tagCount: n(row.tagCount),
    alarmCount: n(row.alarmCount),
    networkCount: n(row.networkCount),
    warningCount: n(row.warningCount),
    errorCount: n(row.errorCount),
    startedAt: d(row.startedAt),
    completedAt: nd(row.completedAt),
  };
}

/** Statuses from which an import may still be completed. */
const NON_TERMINAL = ["PENDING", "VALIDATING"];

export function createImportRepository(db: OtPrismaClient): EngineeringImportRepository {
  const scope = (ctx: OtServiceContext): Row => {
    const site = siteScope(ctx);
    return site === undefined ? orgScope(ctx) : { ...orgScope(ctx), siteId: site };
  };

  const data = (ctx: OtServiceContext, input: CreateImportInput): Row => ({
    organizationId: ctx.organizationId,
    siteId: input.siteId ?? null,
    gatewayId: input.gatewayId ?? null,
    uploadedById: input.uploadedById ?? null,
    sourceType: input.sourceType,
    sourceFilename: input.sourceFilename,
    contentType: input.contentType,
    checksum: input.checksum,
    idempotencyKey: input.idempotencyKey,
    byteSize: input.byteSize,
    status: "PENDING",
  });

  return {
    async reserveIdempotency(ctx, input) {
      if (input.siteId !== undefined && !siteAllowed(ctx, input.siteId)) return fail("FORBIDDEN");
      try {
        // The INSERT *is* the reservation. No read-then-create: under
        // concurrency the unique index picks exactly one winner.
        const row = await db.engineeringImport.create({ data: data(ctx, input) });
        return succeed({ outcome: "RESERVED", record: importRecord(row) } as ReserveOutcome);
      } catch (err) {
        const mapped = (await guarded(async () => {
          throw err;
        })) as ReturnType<typeof fail>;
        if (mapped.code !== "CONFLICT") return mapped;
        // Return the authoritative original so a retry observes one execution.
        const existing = await guarded(() =>
          db.engineeringImport.findFirst({
            where: { ...orgScope(ctx), idempotencyKey: input.idempotencyKey },
          }),
        );
        if (!existing.ok) return existing;
        if (existing.value) {
          return succeed({ outcome: "DUPLICATE", record: importRecord(existing.value) } as ReserveOutcome);
        }
        // Same checksum under a different key — also "already imported".
        const byChecksum = await guarded(() =>
          db.engineeringImport.findFirst({ where: { ...orgScope(ctx), checksum: input.checksum } }),
        );
        if (!byChecksum.ok) return byChecksum;
        return byChecksum.value
          ? succeed({ outcome: "DUPLICATE", record: importRecord(byChecksum.value) } as ReserveOutcome)
          : fail("CONFLICT");
      }
    },

    async createProcessingImport(ctx, input) {
      if (input.siteId !== undefined && !siteAllowed(ctx, input.siteId)) return fail("FORBIDDEN");
      const res = await guarded(() =>
        db.engineeringImport.create({ data: { ...data(ctx, input), status: "VALIDATING" } }),
      );
      return res.ok ? succeed(importRecord(res.value)) : res;
    },

    async findById(ctx, id) {
      const res = await guarded(() => db.engineeringImport.findFirst({ where: { id, ...scope(ctx) } }));
      if (!res.ok) return res;
      return res.value ? succeed(importRecord(res.value)) : fail("NOT_FOUND");
    },

    async findByIdempotency(ctx, key) {
      const res = await guarded(() =>
        db.engineeringImport.findFirst({ where: { ...scope(ctx), idempotencyKey: key } }),
      );
      if (!res.ok) return res;
      return res.value ? succeed(importRecord(res.value)) : fail("NOT_FOUND");
    },

    async markCompleted(ctx, id, counts: ImportCounts) {
      // The status guard is part of the WHERE: a FAILED import can never be
      // walked forward to APPLIED by a late-arriving success.
      const res = await guarded(() =>
        db.engineeringImport.updateMany({
          where: { id, ...scope(ctx), status: { in: NON_TERMINAL } },
          data: { ...counts, status: "APPLIED", failureReason: "NONE", completedAt: new Date() },
        }),
      );
      if (!res.ok) return res;
      if (res.value.count === 0) return fail("CONFLICT", "import is not in a completable state");
      return this.findById(ctx, id);
    },

    async markFailed(ctx, id, failureReason) {
      const res = await guarded(() =>
        db.engineeringImport.updateMany({
          where: { id, ...scope(ctx), status: { in: NON_TERMINAL } },
          data: { status: "FAILED", failureReason, completedAt: new Date() },
        }),
      );
      if (!res.ok) return res;
      if (res.value.count === 0) return fail("CONFLICT", "import is not in a failable state");
      return this.findById(ctx, id);
    },
  };
}

/* ── Project adapter ────────────────────────────────────────────────────── */

function projectRecord(row: Row): EngineeringProjectRecord {
  return {
    id: s(row.id),
    siteId: ns(row.siteId),
    importId: s(row.importId),
    name: s(row.name),
    normalizedName: s(row.normalizedName),
    projectVersion: ns(row.projectVersion),
    revision: n(row.revision),
    vendor: ns(row.vendor),
    platform: ns(row.platform),
    sourceType: s(row.sourceType),
    schemaVersion: s(row.schemaVersion),
    checksum: s(row.checksum),
    analysisState: s(row.analysisState),
    validationState: s(row.validationState),
    lastAnalysedAt: nd(row.lastAnalysedAt),
    createdAt: d(row.createdAt),
    updatedAt: d(row.updatedAt),
  };
}

const tagRecord = (row: Row): AutomationTagRecord => ({
  id: s(row.id),
  projectId: s(row.projectId),
  name: s(row.name),
  normalizedName: s(row.normalizedName),
  dataType: s(row.dataType),
  address: ns(row.address),
  symbolicPath: ns(row.symbolicPath),
  unit: ns(row.unit),
  description: ns(row.description),
  accessMode: s(row.accessMode),
  safetyClass: s(row.safetyClass),
  validationState: s(row.validationState),
});

const alarmRecord = (row: Row): AlarmDefinitionRecord => ({
  id: s(row.id),
  projectId: s(row.projectId),
  code: s(row.code),
  normalizedCode: s(row.normalizedCode),
  severity: s(row.severity),
  message: ns(row.message),
  conditionReference: ns(row.conditionReference),
  requiresAck: b(row.requiresAck),
  safetyClass: s(row.safetyClass),
  productionRelevant: b(row.productionRelevant),
  validationState: s(row.validationState),
});

const nodeRecord = (row: Row): NetworkNodeRecord => ({
  id: s(row.id),
  projectId: s(row.projectId),
  nodeName: s(row.nodeName),
  normalizedName: s(row.normalizedName),
  zone: s(row.zone),
  protocol: s(row.protocol),
  address: ns(row.address),
  subnet: ns(row.subnet),
  stationId: ns(row.stationId),
  conflictState: s(row.conflictState),
});

export function createProjectRepository(db: OtPrismaClient): EngineeringProjectRepository {
  const scope = (ctx: OtServiceContext): Row => {
    const site = siteScope(ctx);
    return site === undefined ? orgScope(ctx) : { ...orgScope(ctx), siteId: site };
  };

  /** Artifact reads are scoped through their project, which carries the site. */
  const artifactScope = (ctx: OtServiceContext, projectId: string): Row => ({
    ...orgScope(ctx),
    projectId,
    project: { is: scope(ctx) },
  });

  async function listArtifacts<T>(
    delegate: Delegate,
    ctx: OtServiceContext,
    projectId: string,
    entity: "tag" | "alarm" | "networkNode",
    map: (row: Row) => T,
    page?: PageRequest,
  ): Promise<RepoResult<Page<T>>> {
    const { take, skip } = pageArgs(page);
    const where = artifactScope(ctx, projectId);
    return guarded(async () => {
      const [rows, total] = await Promise.all([
        delegate.findMany({
          where,
          take,
          skip,
          orderBy: safeOrderBy(entity, page?.sortBy, page?.sortDir),
        }),
        delegate.count({ where }),
      ]);
      return { items: rows.map(map), total, take, skip } as Page<T>;
    });
  }

  return {
    async listVisible(ctx, page) {
      const { take, skip } = pageArgs(page);
      const where = scope(ctx);
      return guarded(async () => {
        const [rows, total] = await Promise.all([
          db.engineeringProject.findMany({
            where,
            take,
            skip,
            orderBy: safeOrderBy("project", page?.sortBy, page?.sortDir),
          }),
          db.engineeringProject.count({ where }),
        ]);
        return { items: rows.map(projectRecord), total, take, skip } as Page<EngineeringProjectRecord>;
      });
    },

    async findVisibleById(ctx, id) {
      const res = await guarded(() => db.engineeringProject.findFirst({ where: { id, ...scope(ctx) } }));
      if (!res.ok) return res;
      return res.value ? succeed(projectRecord(res.value)) : fail("NOT_FOUND");
    },

    async findByChecksum(ctx, checksum) {
      const res = await guarded(() =>
        db.engineeringProject.findFirst({ where: { ...scope(ctx), checksum } }),
      );
      if (!res.ok) return res;
      return res.value ? succeed(projectRecord(res.value)) : fail("NOT_FOUND");
    },

    async createProjectWithArtifacts(ctx, input) {
      if (input.siteId !== undefined && !siteAllowed(ctx, input.siteId)) return fail("FORBIDDEN");

      // The parent import must belong to this tenant; otherwise a caller could
      // graft a project onto another organization's import.
      const parent = await guarded(() =>
        db.engineeringImport.findFirst({ where: { id: input.importId, ...orgScope(ctx) }, select: { id: true } }),
      );
      if (!parent.ok) return parent;
      if (!parent.value) return fail("VALIDATION_FAILED", "unknown import");

      return guarded(async () => {
        const project = await db.engineeringProject.create({
          data: {
            organizationId: ctx.organizationId,
            siteId: input.siteId ?? null,
            importId: input.importId,
            name: input.name,
            normalizedName: input.normalizedName,
            projectVersion: input.projectVersion ?? null,
            ...(input.revision === undefined ? {} : { revision: input.revision }),
            vendor: input.vendor ?? null,
            platform: input.platform ?? null,
            sourceType: input.sourceType,
            schemaVersion: input.schemaVersion,
            checksum: input.checksum,
          },
        });
        const projectId = s(project.id);
        const org = ctx.organizationId;

        // Artifacts are written in the SAME call chain; when this adapter is
        // built on a transaction client every insert shares one transaction, so
        // a later failure removes the project and every artifact together.
        for (const t of input.tags ?? []) {
          await db.automationTag.create({ data: { ...t, organizationId: org, projectId } });
        }
        for (const a of input.alarms ?? []) {
          await db.alarmDefinition.create({ data: { ...a, organizationId: org, projectId } });
        }
        for (const nn of input.networkNodes ?? []) {
          await db.industrialNetworkNode.create({ data: { ...nn, organizationId: org, projectId } });
        }
        return projectRecord(project);
      });
    },

    async listTags(ctx, projectId, page) {
      return listArtifacts(db.automationTag, ctx, projectId, "tag", tagRecord, page);
    },
    async listAlarms(ctx, projectId, page) {
      return listArtifacts(db.alarmDefinition, ctx, projectId, "alarm", alarmRecord, page);
    },
    async listNetworkNodes(ctx, projectId, page) {
      return listArtifacts(db.industrialNetworkNode, ctx, projectId, "networkNode", nodeRecord, page);
    },

    async loadAnalysisInput(ctx, projectId) {
      const project = await this.findVisibleById(ctx, projectId);
      if (!project.ok) return project;
      const where = artifactScope(ctx, projectId);
      return guarded(async () => {
        // Deterministic ordering: the rule engine must see the same sequence
        // on every run or "repeat analysis is idempotent" is unprovable.
        const [tags, alarms, nodes] = await Promise.all([
          db.automationTag.findMany({ where, orderBy: { normalizedName: "asc" } }),
          db.alarmDefinition.findMany({ where, orderBy: { normalizedCode: "asc" } }),
          db.industrialNetworkNode.findMany({ where, orderBy: { normalizedName: "asc" } }),
        ]);
        const p = project.value;
        return {
          project: {
            id: p.id,
            name: p.name,
            revision: p.revision,
            vendor: p.vendor,
            platform: p.platform,
            sourceType: p.sourceType,
            checksum: p.checksum,
          },
          tags: tags.map(tagRecord),
          alarms: alarms.map(alarmRecord),
          networkNodes: nodes.map(nodeRecord),
        } as AnalysisInput;
      });
    },
  };
}

/* ── Finding adapter ────────────────────────────────────────────────────── */

function findingRecord(row: Row): EngineeringFindingRecord {
  return {
    id: s(row.id),
    projectId: s(row.projectId),
    ruleId: s(row.ruleId),
    ruleVersion: s(row.ruleVersion),
    category: s(row.category),
    severity: s(row.severity),
    title: s(row.title),
    description: s(row.description),
    artifactType: s(row.artifactType),
    artifactRef: s(row.artifactRef),
    evidenceRefs: arr(row.evidenceRefs),
    recommendation: s(row.recommendation),
    humanApprovalRequired: b(row.humanApprovalRequired),
    status: s(row.status),
    reviewedById: ns(row.reviewedById),
    reviewedAt: nd(row.reviewedAt),
    createdAt: d(row.createdAt),
    updatedAt: d(row.updatedAt),
  };
}

export function createFindingRepository(db: OtPrismaClient): EngineeringFindingRepository {
  const projectScope = (ctx: OtServiceContext): Row => {
    const site = siteScope(ctx);
    return site === undefined ? orgScope(ctx) : { ...orgScope(ctx), siteId: site };
  };
  const scope = (ctx: OtServiceContext): Row => ({
    ...orgScope(ctx),
    project: { is: projectScope(ctx) },
  });

  return {
    async upsertDeterministicFindings(ctx, projectId, findings) {
      const project = await guarded(() =>
        db.engineeringProject.findFirst({
          where: { id: projectId, ...projectScope(ctx) },
          select: { id: true },
        }),
      );
      if (!project.ok) return project;
      if (!project.value) return fail("NOT_FOUND");

      return guarded(async () => {
        let created = 0;
        let updated = 0;
        for (const f of findings as DeterministicFindingInput[]) {
          // Keyed by (project, rule, artifact): re-running analysis over
          // unchanged data updates in place instead of duplicating. The
          // deterministic fields are rewritten from the engine output; the
          // review columns are deliberately NOT touched, so a human decision
          // survives re-analysis.
          const before = await db.engineeringFinding.findFirst({
            where: { projectId, ruleId: f.ruleId, artifactRef: f.artifactRef },
            select: { id: true },
          });
          await db.engineeringFinding.upsert({
            where: {
              projectId_ruleId_artifactRef: {
                projectId,
                ruleId: f.ruleId,
                artifactRef: f.artifactRef,
              },
            },
            create: { ...f, organizationId: ctx.organizationId, projectId },
            update: {
              ruleVersion: f.ruleVersion,
              category: f.category,
              severity: f.severity,
              title: f.title,
              description: f.description,
              artifactType: f.artifactType,
              evidenceRefs: f.evidenceRefs,
              recommendation: f.recommendation,
              humanApprovalRequired: f.humanApprovalRequired,
            },
          });
          if (before) updated += 1;
          else created += 1;
        }
        return { created, updated };
      });
    },

    async listVisible(ctx, projectId, page) {
      const { take, skip } = pageArgs(page);
      const where = { ...scope(ctx), projectId };
      return guarded(async () => {
        const [rows, total] = await Promise.all([
          db.engineeringFinding.findMany({
            where,
            take,
            skip,
            orderBy: safeOrderBy("finding", page?.sortBy, page?.sortDir),
          }),
          db.engineeringFinding.count({ where }),
        ]);
        return { items: rows.map(findingRecord), total, take, skip } as Page<EngineeringFindingRecord>;
      });
    },

    async findVisibleById(ctx, id) {
      const res = await guarded(() => db.engineeringFinding.findFirst({ where: { id, ...scope(ctx) } }));
      if (!res.ok) return res;
      return res.value ? succeed(findingRecord(res.value)) : fail("NOT_FOUND");
    },

    async transitionAtomically(ctx, id, input: TransitionInput) {
      // Already there? Idempotent NOOP, and crucially no second audit event.
      const current = await this.findVisibleById(ctx, id);
      if (!current.ok) return current;
      if (current.value.status === input.nextStatus) {
        return succeed({ outcome: "NOOP", record: current.value } as TransitionOutcome);
      }

      // The expected status is part of the WHERE, so two reviewers racing on
      // the same finding cannot both "win": the second updates 0 rows.
      // `findVisibleById` above already applied the project/site relation
      // filter, so the compare-and-set uses scalar predicates only. The
      // `status` guard is what makes it atomic: two racing reviewers both
      // target the same row and the loser updates zero rows.
      const res = await guarded(() =>
        db.engineeringFinding.updateMany({
          where: { id, ...orgScope(ctx), status: input.expectedStatus },
          data: {
            status: input.nextStatus,
            reviewedById: input.reviewedById,
            reviewedAt: input.reviewedAt,
          },
        }),
      );
      if (!res.ok) return res;
      if (res.value.count === 0) return fail("CONFLICT", "finding changed since it was read");

      const after = await this.findVisibleById(ctx, id);
      if (!after.ok) return after;
      return succeed({ outcome: "APPLIED", record: after.value } as TransitionOutcome);
    },

    async supersedeObsolete(ctx, projectId, keepRuleArtifactKeys) {
      const project = await guarded(() =>
        db.engineeringProject.findFirst({
          where: { id: projectId, ...projectScope(ctx) },
          select: { id: true },
        }),
      );
      if (!project.ok) return project;
      if (!project.value) return fail("NOT_FOUND");

      const keep = new Set(keepRuleArtifactKeys);
      return guarded(async () => {
        const rows = await db.engineeringFinding.findMany({
          where: { ...orgScope(ctx), projectId, status: { in: ["OPEN", "ACKNOWLEDGED", "ACCEPTED"] } },
          select: { id: true, ruleId: true, artifactRef: true },
        });
        const obsolete = rows
          .filter((r) => !keep.has(`${s(r.ruleId)}\u0000${s(r.artifactRef)}`))
          .map((r) => s(r.id));
        if (obsolete.length === 0) return { superseded: 0 };
        const res = await db.engineeringFinding.updateMany({
          where: { id: { in: obsolete }, ...orgScope(ctx) },
          data: { status: "SUPERSEDED" },
        });
        return { superseded: res.count };
      });
    },
  };
}

/* ── Nonce adapter ──────────────────────────────────────────────────────── */

/** Upper bound on one prune pass, so cleanup can never lock the table. */
export const MAX_NONCE_PRUNE = 1000;

export function createNonceRepository(db: OtPrismaClient): GatewayNonceRepository {
  return {
    async reserve(ctx, input) {
      try {
        // Insert-decides. The unique index on (gatewayId, nonce) is the sole
        // authority; there is no in-process Set that a restart could forget.
        await db.gatewayEnvelopeNonce.create({
          data: {
            organizationId: ctx.organizationId,
            gatewayId: input.gatewayId,
            nonce: input.nonce,
            expiresAt: input.expiresAt,
          },
        });
        return succeed("RESERVED" as const);
      } catch (err) {
        const mapped = (await guarded(async () => {
          throw err;
        })) as ReturnType<typeof fail>;
        return mapped.code === "CONFLICT" ? succeed("DUPLICATE" as const) : mapped;
      }
    },

    async reserveForMachine(ctx, input) {
      try {
        // Identical insert-decides semantics; the ONLY difference is where the
        // tenant comes from — an authenticated gateway record rather than a
        // human session.
        await db.gatewayEnvelopeNonce.create({
          data: {
            organizationId: ctx.organizationId,
            gatewayId: input.gatewayId,
            nonce: input.nonce,
            expiresAt: input.expiresAt,
          },
        });
        return succeed("RESERVED" as const);
      } catch (err) {
        const mapped = (await guarded(async () => {
          throw err;
        })) as ReturnType<typeof fail>;
        return mapped.code === "CONFLICT" ? succeed("DUPLICATE" as const) : mapped;
      }
    },

    async identifyConflict(ctx, gatewayId, nonce) {
      const res = await guarded(() =>
        db.gatewayEnvelopeNonce.findFirst({
          where: { ...orgScope(ctx), gatewayId, nonce },
          select: { id: true },
        }),
      );
      return res.ok ? succeed(res.value !== null) : res;
    },

    async pruneExpired(ctx, before, limit = MAX_NONCE_PRUNE) {
      // Bounded and tenant-scoped. `expiresAt < before` can only match nonces
      // already outside the accepted replay window, so pruning cannot admit a
      // replay — it only reclaims space.
      const capped = Math.min(Math.max(Math.trunc(limit), 1), MAX_NONCE_PRUNE);
      const ids = await guarded(() =>
        db.gatewayEnvelopeNonce.findMany({
          where: { ...orgScope(ctx), expiresAt: { lt: before } },
          select: { id: true },
          take: capped,
        }),
      );
      if (!ids.ok) return ids;
      if (ids.value.length === 0) return succeed({ pruned: 0 });
      const res = await guarded(() =>
        db.gatewayEnvelopeNonce.deleteMany({
          where: { id: { in: ids.value.map((r) => s(r.id)) }, ...orgScope(ctx) },
        }),
      );
      return res.ok ? succeed({ pruned: res.value.count }) : res;
    },
  };
}


/* ── Machine authentication lookup ──────────────────────────────────────── */

/**
 * Resolve a gateway by its opaque ingestion identifier — GLOBALLY.
 *
 * THIS IS THE ONE DELIBERATELY UNSCOPED QUERY IN THIS LAYER, and it is correct:
 * a machine authenticating itself does not yet know its organization, so the
 * organization must be an OUTPUT of the lookup rather than an input to it. The
 * caller then treats the returned `organizationId` as the authenticated tenant.
 *
 * Safety comes from the PROJECTION, not from a tenant filter: only the fields
 * required to check a signature are selected. No organization name, no user, no
 * metadata, no tenant configuration — so guessing identifiers cannot become a
 * way to read tenant data. A row without an `ingestionId` is unreachable here,
 * which is why the column is nullable and deny-by-default.
 */
export function createGatewayAuthLookup(db: OtPrismaClient): GatewayAuthLookup {
  return async (ingestionId: string): Promise<GatewayAuthRecord | null> => {
    if (!ingestionId) return null;
    try {
      const row = await db.edgeGatewayProfile.findFirst({
        where: { ingestionId },
        select: {
          gatewayId: true,
          ingestionId: true,
          organizationId: true,
          lifecycle: true,
          disabled: true,
          simulatorMode: true,
          capabilities: true,
          signingKeyRef: true,
          gateway: { select: { siteId: true } },
        },
      });
      if (!row) return null;
      const gw = (row.gateway ?? {}) as Row;
      return {
        gatewayId: s(row.gatewayId),
        ingestionId: s(row.ingestionId),
        organizationId: s(row.organizationId),
        siteId: ns(gw.siteId),
        lifecycle: s(row.lifecycle),
        disabled: b(row.disabled),
        simulatorMode: b(row.simulatorMode),
        capabilities: arr(row.capabilities),
        signingKeyRef: ns(row.signingKeyRef),
      };
    } catch {
      // A lookup failure is indistinguishable from "no such gateway": the
      // caller answers both with the same generic authentication failure.
      return null;
    }
  };
}

/* ── Repository set + transaction manager ───────────────────────────────── */

/** Build the full repository set over any client (global or transactional). */
export function createOtRepositories(db: OtPrismaClient): OtRepositories {
  return {
    gateways: createGatewayRepository(db),
    devices: createDeviceRepository(db),
    imports: createImportRepository(db),
    projects: createProjectRepository(db),
    findings: createFindingRepository(db),
    nonces: createNonceRepository(db),
  };
}

/**
 * The transaction boundary.
 *
 * The callback receives repositories built over the TRANSACTION client `tx`.
 * The global client is not passed in and is not reachable from the callback, so
 * a write issued inside cannot bypass the transaction and survive a rollback —
 * the property the instrumented-client test asserts.
 */
export function createTransactionManager(
  db: OtTransactionalPrismaClient,
): OtPersistenceTransactionManager {
  return {
    async runInTransaction<T>(fn: (repos: OtRepositories) => Promise<T>): Promise<RepoResult<T>> {
      return guarded(() => db.$transaction((tx) => fn(createOtRepositories(tx))));
    },
  };
}
