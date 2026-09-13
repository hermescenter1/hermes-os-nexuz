/**
 * Asset Registry data access.
 *
 * PHASE 110-A2.0 — THIS LAYER NEVER REACHED POSTGRESQL, IN ANY ENVIRONMENT.
 *
 * What was here until this round:
 *
 *     let prisma = null;
 *     async function getDb() {
 *       if (!process.env.DATABASE_URL) return null;
 *       if (!prisma) {
 *         try { prisma = new PrismaClient(); } catch { return null; }
 *       }
 *       return prisma;
 *     }
 *
 * Under Prisma 7 with `driverAdapters`, `new PrismaClient()` with no arguments
 * throws `PrismaClientInitializationError` BEFORE it attempts a connection — it
 * requires an adapter. So `getDb()` always returned null, every caller fell
 * through its `catch { /* fall through *\/ }` to a `MOCK_*` array, and the asset
 * registry served fabricated rows on a production deployment with a valid
 * `DATABASE_URL`. That was measured, not inferred: see the A2.0 pack's
 * `probe-bare-client.log`.
 *
 * Three things changed together, because fixing any one alone leaves a lie:
 *
 *   1. THE CLIENT. `getPrisma()` — the repository's single accessor, already
 *      used by 184 modules — constructs with the `@prisma/adapter-pg` adapter.
 *      No private constructor here any more, and no third one invented.
 *
 *   2. THE TENANT. Every query is filtered by the organization the SERVER
 *      resolved for this request. No function takes an organization id, so no
 *      URL, body or header can supply one. A platform or holding-level role
 *      does not widen it.
 *
 *   3. THE FAILURES. No mock, no `[]` on error, no silent catch. An outage, a
 *      missing selection and a genuinely empty registry are three different
 *      answers and the caller can tell them apart.
 *
 * ON THE NULLABLE PARENTS. `RegistryAsset` carries `organizationId` directly, so
 * assets, their locations and everything hanging off an asset are reachable
 * without a join through a nullable column. `AssetLocation` also carries it
 * directly. Nothing in this layer depends on an optional relation to find its
 * tenant, which is why nothing here disappears under fail-closed.
 */

import type {
  RegistryAssetRecord, AssetLocation, AssetCriticalityAssessment,
  AssetHealthSnapshot, AssetLifecycleEvent, AssetMaintenanceLink,
  AssetDocumentLink, AssetTelemetryLink, AssetTag, AssetDashboard,
} from "./types";
import { requireDatabase, requireTenantScope, runScoped } from "@/lib/data-access/tenant-scope";
import { logInfraFailure } from "@/lib/logger/security-events";

function ts(rows: unknown[]): unknown[] {
  return rows.map(r => {
    const obj = r as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      out[k] = v instanceof Date ? v.toISOString() : v;
    }
    return out;
  });
}

/** The model surface this layer uses, named rather than cast at each call. */
interface Model {
  findMany: (args: unknown) => Promise<unknown[]>;
  findFirst: (args: unknown) => Promise<unknown | null>;
}
const model = (db: Record<string, unknown>, name: string): Model => db[name] as unknown as Model;

/**
 * Drop an INCLUDED location that does not belong to this organization.
 *
 * MEASURED, not anticipated. `relation-reads.log` records the leak: an Alpha
 * asset whose `locationId` pointed at Beta's plant returned
 * `location.name = "Beta Plant"` on a 200 to an Alpha user. The top-level
 * predicate was correct the whole time — the row WAS Alpha's — and the foreign
 * bytes travelled inside it.
 *
 * WHY IT IS DONE HERE AND NOT IN THE QUERY. Prisma cannot filter a to-one
 * `include`: `include: { location: { where: … } }` is not accepted for a
 * non-list relation. The alternatives are to select `locationId` and fetch
 * locations separately with their own predicate — a second round trip on every
 * asset screen — or to refuse to hand back what the predicate cannot vouch for.
 * This does the second.
 *
 * NULL-OWNER IS ALSO DROPPED. A location with no organization belongs to nobody
 * and is therefore not this tenant's, the same fail-closed rule the rest of the
 * slice follows.
 *
 * The FK itself is left alone. Nothing here writes, adopts or repairs a row: the
 * durable fix is the composite foreign key named in `relation-ownership.ts`, and
 * an operator must see the inconsistency rather than have it quietly corrected.
 * The count of dropped relations is logged with no id, name or value in it.
 */
function dropForeignLocations(rows: unknown[], organizationId: string, operation: string): unknown[] {
  let dropped = 0;

  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const v of value) walk(v);
      return;
    }
    if (value === null || typeof value !== "object") return;
    const row = value as Record<string, unknown>;

    const loc = row.location;
    if (loc !== null && typeof loc === "object") {
      const owner = (loc as Record<string, unknown>).organizationId;
      if (owner !== organizationId) {
        row.location = null;
        dropped += 1;
      }
    }
    // The hierarchy nests assets, and every level carries its own location.
    if (Array.isArray(row.children)) walk(row.children);
  };

  walk(rows);

  if (dropped > 0) {
    logInfraFailure("database", `${operation} foreign-location-dropped`, new Error(`count=${dropped}`));
  }
  return rows;
}

/**
 * The counts every asset row carries, with the one that needs a tenant
 * predicate carrying it.
 *
 * READ FROM THE SCHEMA, RELATION BY RELATION — the distinction is the whole
 * point, so it is written down rather than assumed:
 *
 *   children          `RegistryAsset` again, and it carries its OWN nullable
 *                     `organizationId`. A row belonging to Beta, or to nobody,
 *                     can point at an Alpha parent through `parentAssetId`.
 *                     An unfiltered count therefore reports another tenant's
 *                     rows as a number on an Alpha screen. FILTERED.
 *   maintenanceLinks  `AssetMaintenanceLink.assetId` is REQUIRED and there is no
 *   documentLinks     organization column on any of these four. Each row can
 *   telemetryLinks    only exist under one asset, and that asset is already this
 *   healthSnapshots   organization's because the outer predicate said so. There
 *                     is nothing for a filter to exclude, and inventing one
 *                     would suggest a boundary that does not exist here.
 *
 * A leaked count is still a leak. It is only harder to notice than a leaked row,
 * because the row that produced it is never shown.
 */
const assetCounts = (organizationId: string) =>
  ({
    _count: {
      select: {
        children: { where: { organizationId } },
        maintenanceLinks: true,
        documentLinks: true,
        telemetryLinks: true,
        healthSnapshots: true,
      },
    },
  }) as const;

// ── Assets ────────────────────────────────────────────────────────────────────

export interface AssetFilters {
  type?:       string;
  status?:     string;
  criticality?:string;
  locationId?: string;
  search?:     string;
}

export async function getAssets(filters: AssetFilters = {}): Promise<RegistryAssetRecord[]> {
  const { organizationId } = await requireTenantScope();
  const db = await requireDatabase("assets.getAssets");

  /*
   * The tenant predicate is written FIRST and the caller's filters are spread
   * after it, but `organizationId` is re-stated last so no filter key can
   * overwrite it. `AssetFilters` has no such key today; the ordering is what
   * makes that still true if one is ever added.
   */
  const where: Record<string, unknown> = { organizationId };
  if (filters.type)        where.assetType   = filters.type;
  if (filters.status)      where.status      = filters.status;
  if (filters.criticality) where.criticality = filters.criticality;
  if (filters.locationId)  where.locationId  = filters.locationId;
  if (filters.search) {
    where.OR = [
      { name:        { contains: filters.search, mode: "insensitive" } },
      { assetNumber: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  where.organizationId = organizationId;

  const rows = await runScoped("assets.getAssets", () =>
    model(db, "registryAsset").findMany({
      where,
      include: { location: true, ...assetCounts(organizationId) },
      orderBy: [{ criticality: "desc" }, { name: "asc" }],
    }),
  );
  return ts(dropForeignLocations(rows, organizationId, "assets.getAssets")) as RegistryAssetRecord[];
}

/**
 * One asset, with everything hanging off it.
 *
 * `findFirst` with the tenant in the predicate.
 *
 * A CORRECTION TO WHAT THIS COMMENT FIRST SAID. It claimed `findUnique` "cannot
 * carry a second predicate". That is false on the installed client: Prisma
 * 7.8.0 generates `WhereUniqueInput` as `Prisma.AtLeast<{ id?, organizationId?,
 * … }>`, so `findUnique({ where: { id, organizationId } })` is valid and was
 * verified against a real database (`probe-prisma-where.log` in the A2.0 pack).
 * The choice of `findFirst` is therefore a STYLE decision, not a workaround for
 * a library limit, and the code is left as it is rather than churned to prove a
 * point.
 *
 * What matters is the property, which either API delivers: the organization is
 * IN the predicate, so an id belonging to another organization matches nothing
 * and the answer is indistinguishable from an id that does not exist. It is not
 * an existence oracle.
 */
export async function getAssetById(id: string): Promise<(RegistryAssetRecord & {
  criticalities:   AssetCriticalityAssessment[];
  healthSnapshots: AssetHealthSnapshot[];
  lifecycleEvents: AssetLifecycleEvent[];
  maintenanceLinks:AssetMaintenanceLink[];
  documentLinks:   AssetDocumentLink[];
  telemetryLinks:  AssetTelemetryLink[];
  assetTags:       AssetTag[];
}) | null> {
  const { organizationId } = await requireTenantScope();
  const db = await requireDatabase("assets.getAssetById");

  const row = await runScoped("assets.getAssetById", () =>
    model(db, "registryAsset").findFirst({
      where: { id, organizationId },
      include: {
        location:        true,
        criticalities:   { where: { isActive: true }, orderBy: { assessedAt: "desc" } },
        healthSnapshots: { orderBy: { takenAt: "desc" }, take: 10 },
        lifecycleEvents: { orderBy: { occurredAt: "desc" } },
        maintenanceLinks:{ orderBy: { linkedAt: "desc" } },
        documentLinks:   { orderBy: { linkedAt: "asc"  } },
        telemetryLinks:  { where: { isActive: true } },
        /*
         * PHASE 110-A2.1 — THE FIELD IS `registryTags`, NOT `assetTags`.
         *
         * `RegistryAsset` has no `assetTags` relation; the tag model attached to
         * it is `RegistryAssetTag`, exposed as `registryTags`. `AssetTag` is a
         * different model that hangs off `IndustrialAsset` entirely. Asking
         * Prisma for `assetTags` here raised a validation error at RUNTIME on
         * every call — and the typechecker could not see it, because the model
         * surface this layer uses takes its arguments as `unknown`.
         *
         * Nothing caught it earlier because nothing exercised this function:
         * `/api/assets/[id]` and the asset detail page are its only callers and
         * neither was in the previous rehearsal. It is measured now — see
         * `loop4-asset-detail.json` — and the coverage matrix says so.
         *
         * The client component reads `asset.assetTags`, and the two models have
         * the same shape, so the relation is fetched under its real name and
         * presented under the name the contract already uses.
         */
        registryTags:    true,
        ...assetCounts(organizationId),
      },
    }),
  );
  if (!row) return null;

  const scrubbed = ts(dropForeignLocations([row], organizationId, "assets.getAssetById"))[0] as
    Record<string, unknown>;
  const { registryTags, ...rest } = scrubbed;
  return { ...rest, assetTags: registryTags ?? [] } as never;
}

export async function getAssetLocations(): Promise<AssetLocation[]> {
  const { organizationId } = await requireTenantScope();
  const db = await requireDatabase("assets.getAssetLocations");

  const rows = await runScoped("assets.getAssetLocations", () =>
    model(db, "assetLocation").findMany({
      where: { isActive: true, organizationId },
      orderBy: { name: "asc" },
    }),
  );
  return ts(rows) as AssetLocation[];
}

/**
 * The asset tree.
 *
 * Every level carries the tenant predicate, not just the root. A nested
 * `include` without one would walk `children` across organizations from a root
 * that legitimately belongs to this one — the classic place a tenant filter is
 * applied to the query and forgotten on the relation.
 */
export async function getAssetHierarchy(): Promise<RegistryAssetRecord[]> {
  const { organizationId } = await requireTenantScope();
  const db = await requireDatabase("assets.getAssetHierarchy");

  const childScope = { where: { organizationId } };
  const rows = await runScoped("assets.getAssetHierarchy", () =>
    model(db, "registryAsset").findMany({
      where: { parentAssetId: null, organizationId },
      include: {
        location: true,
        children: {
          ...childScope,
          include: {
            location: true,
            children: { ...childScope, include: { location: true } },
          },
        },
        ...assetCounts(organizationId),
      },
      orderBy: [{ criticality: "desc" }, { name: "asc" }],
    }),
  );
  return ts(dropForeignLocations(rows, organizationId, "assets.getAssetHierarchy")) as RegistryAssetRecord[];
}

/**
 * The dashboard aggregate.
 *
 * All three reads are scoped. An aggregate is the easiest place for a leak to
 * hide, because a wrong total looks like a number rather than like somebody
 * else's data — the row that produced it is never shown.
 */
export async function getAssetDashboard(): Promise<AssetDashboard> {
  const { organizationId } = await requireTenantScope();
  const db = await requireDatabase("assets.getAssetDashboard");

  const [assets, recentEvents, maintenanceLinks] = await runScoped(
    "assets.getAssetDashboard",
    () =>
      Promise.all([
        model(db, "registryAsset").findMany({
          where: { organizationId },
          include: { _count: { select: { maintenanceLinks: true, documentLinks: true } } },
        }),
        model(db, "assetLifecycleEvent").findMany({
          where: { asset: { organizationId } },
          orderBy: { occurredAt: "desc" },
          take: 8,
        }),
        model(db, "assetMaintenanceLink").findMany({
          where: { asset: { organizationId } },
          select: { assetId: true, linkType: true },
        }),
      ]),
  );

  return buildDashboard(
    ts(assets) as RegistryAssetRecord[],
    ts(recentEvents) as AssetLifecycleEvent[],
    ts(maintenanceLinks) as AssetMaintenanceLink[],
  );
}

/* ── Collections the asset SECTION pages render ──────────────────────────────
 *
 * PHASE 110-A2.0 — these five exports are new, and they exist because five
 * product pages were importing `MOCK_*` arrays directly and filtering them by
 * asset id. Those pages rendered real assets beside fabricated criticality
 * assessments, health snapshots, lifecycle events, maintenance links and
 * document links, in one view, with nothing marking which was which.
 *
 * The tables all exist. Nothing needed inventing — only asking.
 */

interface AssetCollections {
  criticalities:    AssetCriticalityAssessment[];
  healthSnapshots:  AssetHealthSnapshot[];
  lifecycleEvents:  AssetLifecycleEvent[];
  maintenanceLinks: AssetMaintenanceLink[];
  documentLinks:    AssetDocumentLink[];
}

/** One asset with one of its collections attached, for a section page. */
export type AssetWith<K extends keyof AssetCollections> =
  RegistryAssetRecord & Pick<AssetCollections, K>;

async function assetsWith<K extends keyof AssetCollections>(
  operation: string,
  include: Record<string, unknown>,
): Promise<AssetWith<K>[]> {
  const { organizationId } = await requireTenantScope();
  const db = await requireDatabase(operation);

  const rows = await runScoped(operation, () =>
    model(db, "registryAsset").findMany({
      where: { organizationId },
      include: { location: true, ...assetCounts(organizationId), ...include },
      orderBy: [{ criticality: "desc" }, { name: "asc" }],
    }),
  );
  return ts(dropForeignLocations(rows, organizationId, operation)) as AssetWith<K>[];
}

export const getAssetsWithCriticality = () =>
  assetsWith<"criticalities">("assets.withCriticality", {
    criticalities: { where: { isActive: true }, orderBy: { assessedAt: "desc" } },
  });

export const getAssetsWithHealth = () =>
  assetsWith<"healthSnapshots">("assets.withHealth", {
    healthSnapshots: { orderBy: { takenAt: "desc" } },
  });

export const getAssetsWithMaintenance = () =>
  assetsWith<"maintenanceLinks">("assets.withMaintenance", {
    maintenanceLinks: { orderBy: { linkedAt: "desc" } },
  });

export const getAssetsWithDocuments = () =>
  assetsWith<"documentLinks">("assets.withDocuments", {
    documentLinks: { orderBy: { linkedAt: "asc" } },
  });

/**
 * Lifecycle events for this organization's assets.
 *
 * Reached through `asset: { organizationId }` because `AssetLifecycleEvent` has
 * no organization column of its own. That relation is REQUIRED in the schema —
 * an event cannot exist without an asset — so nothing becomes unreachable here
 * under fail-closed. Where a relation is nullable this layer would have to make
 * a different decision; it has none.
 */
export async function getAssetLifecycleEvents(): Promise<AssetLifecycleEvent[]> {
  const { organizationId } = await requireTenantScope();
  const db = await requireDatabase("assets.getLifecycleEvents");

  const rows = await runScoped("assets.getLifecycleEvents", () =>
    model(db, "assetLifecycleEvent").findMany({
      where: { asset: { organizationId } },
      orderBy: { occurredAt: "desc" },
    }),
  );
  return ts(rows) as AssetLifecycleEvent[];
}

function buildDashboard(assets: RegistryAssetRecord[], lifecycleEvents: AssetLifecycleEvent[], maintenanceLinks: AssetMaintenanceLink[]): AssetDashboard {
  const totalAssets = assets.length;
  const criticalAssets = assets.filter(a => a.criticality === "CRITICAL").length;
  const degradedAssets = assets.filter(a => a.status === "DEGRADED" || a.riskState === "AT_RISK" || a.riskState === "CRITICAL").length;
  const atRiskAssets = assets.filter(a => a.riskState === "AT_RISK" || a.riskState === "CRITICAL").length;
  const assetsWithOpenWO = maintenanceLinks.filter(m => m.linkType === "CORRECTIVE_WORK_ORDER" || m.linkType === "WORK_ORDER").map(m => m.assetId);
  const uniqueAssetsWithWO = new Set(assetsWithOpenWO).size;
  const assetsMissingDocs = assets.filter(a => (a._count?.documentLinks ?? 0) === 0).length;

  const assetsByType: Record<string, number> = {};
  const assetsByStatus: Record<string, number> = {};
  const assetsByCriticality: Record<string, number> = {};
  const lifecycleDistribution: Record<string, number> = {};
  const healthDist = { healthy: 0, monitor: 0, atRisk: 0, critical: 0, unknown: 0 };

  for (const a of assets) {
    assetsByType[a.assetType]      = (assetsByType[a.assetType]      ?? 0) + 1;
    assetsByStatus[a.status]       = (assetsByStatus[a.status]       ?? 0) + 1;
    assetsByCriticality[a.criticality] = (assetsByCriticality[a.criticality] ?? 0) + 1;
    lifecycleDistribution[a.lifecycleState] = (lifecycleDistribution[a.lifecycleState] ?? 0) + 1;
    if      (a.riskState === "HEALTHY")  healthDist.healthy++;
    else if (a.riskState === "MONITOR")  healthDist.monitor++;
    else if (a.riskState === "AT_RISK")  healthDist.atRisk++;
    else if (a.riskState === "CRITICAL") healthDist.critical++;
    else                                  healthDist.unknown++;
  }

  const topCriticalAssets = assets
    .filter(a => a.criticality === "CRITICAL" || a.criticality === "HIGH")
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, 6);

  const recentLifecycleEvents = [...lifecycleEvents]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 8);

  return {
    totalAssets,
    criticalAssets,
    degradedAssets,
    atRiskAssets,
    assetsWithOpenWO:   uniqueAssetsWithWO,
    assetsMissingDocs,
    assetsByType,
    assetsByStatus,
    assetsByCriticality,
    lifecycleDistribution,
    recentLifecycleEvents,
    topCriticalAssets,
    healthDistribution: healthDist,
  };
}
