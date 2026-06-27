// Phase 72 — Enterprise Asset Registry data access layer (Prisma + deterministic mock fallback)

import type {
  RegistryAssetRecord, AssetLocation, AssetCriticalityAssessment,
  AssetHealthSnapshot, AssetLifecycleEvent, AssetMaintenanceLink,
  AssetDocumentLink, AssetTelemetryLink, AssetTag, AssetDashboard,
} from "./types";
import {
  MOCK_ASSETS, MOCK_LOCATIONS, MOCK_CRITICALITY_ASSESSMENTS,
  MOCK_HEALTH_SNAPSHOTS, MOCK_LIFECYCLE_EVENTS, MOCK_MAINTENANCE_LINKS,
  MOCK_DOCUMENT_LINKS, MOCK_TELEMETRY_LINKS, MOCK_ASSET_TAGS,
} from "./mock-data";

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

let prisma: typeof import("@prisma/client").PrismaClient.prototype | null = null;
async function getDb() {
  if (!process.env.DATABASE_URL) return null;
  if (!prisma) {
    try {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
    } catch { return null; }
  }
  return prisma;
}

// ── Assets ────────────────────────────────────────────────────────────────────

export interface AssetFilters {
  type?:       string;
  status?:     string;
  criticality?:string;
  locationId?: string;
  search?:     string;
}

export async function getAssets(filters: AssetFilters = {}): Promise<RegistryAssetRecord[]> {
  const db = await getDb();
  if (db) {
    try {
      const where: Record<string, unknown> = {};
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
      const rows = await (db as never as { registryAsset: { findMany: (args: unknown) => Promise<unknown[]> } }).registryAsset.findMany({
        where,
        include: {
          location: true,
          _count: { select: { children: true, maintenanceLinks: true, documentLinks: true, telemetryLinks: true, healthSnapshots: true } },
        },
        orderBy: [{ criticality: "desc" }, { name: "asc" }],
      });
      return ts(rows) as RegistryAssetRecord[];
    } catch { /* fall through */ }
  }
  // Mock fallback
  let data = [...MOCK_ASSETS];
  if (filters.type)        data = data.filter(a => a.assetType   === filters.type);
  if (filters.status)      data = data.filter(a => a.status      === filters.status);
  if (filters.criticality) data = data.filter(a => a.criticality === filters.criticality);
  if (filters.locationId)  data = data.filter(a => a.locationId  === filters.locationId);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    data = data.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.assetNumber.toLowerCase().includes(q) ||
      (a.description ?? "").toLowerCase().includes(q)
    );
  }
  return data.map(a => ({
    ...a,
    location: a.locationId ? MOCK_LOCATIONS.find(l => l.id === a.locationId) ?? null : null,
  }));
}

export async function getAssetById(id: string): Promise<(RegistryAssetRecord & {
  criticalities:   AssetCriticalityAssessment[];
  healthSnapshots: AssetHealthSnapshot[];
  lifecycleEvents: AssetLifecycleEvent[];
  maintenanceLinks:AssetMaintenanceLink[];
  documentLinks:   AssetDocumentLink[];
  telemetryLinks:  AssetTelemetryLink[];
  assetTags:       AssetTag[];
}) | null> {
  const db = await getDb();
  if (db) {
    try {
      const row = await (db as never as { registryAsset: { findUnique: (args: unknown) => Promise<unknown> } }).registryAsset.findUnique({
        where: { id },
        include: {
          location:        true,
          criticalities:   { where: { isActive: true }, orderBy: { assessedAt: "desc" } },
          healthSnapshots: { orderBy: { takenAt: "desc" }, take: 10 },
          lifecycleEvents: { orderBy: { occurredAt: "desc" } },
          maintenanceLinks:{ orderBy: { linkedAt: "desc" } },
          documentLinks:   { orderBy: { linkedAt: "asc"  } },
          telemetryLinks:  { where: { isActive: true } },
          assetTags:       true,
          _count: { select: { children: true, maintenanceLinks: true, documentLinks: true, telemetryLinks: true, healthSnapshots: true } },
        },
      });
      return row ? (ts([row])[0] as never) : null;
    } catch { /* fall through */ }
  }
  const asset = MOCK_ASSETS.find(a => a.id === id);
  if (!asset) return null;
  return {
    ...asset,
    location:        asset.locationId ? MOCK_LOCATIONS.find(l => l.id === asset.locationId) ?? null : null,
    criticalities:   MOCK_CRITICALITY_ASSESSMENTS.filter(c => c.assetId === id),
    healthSnapshots: MOCK_HEALTH_SNAPSHOTS.filter(s => s.assetId === id).sort((a, b) => b.takenAt.localeCompare(a.takenAt)),
    lifecycleEvents: MOCK_LIFECYCLE_EVENTS.filter(e => e.assetId === id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    maintenanceLinks:MOCK_MAINTENANCE_LINKS.filter(m => m.assetId === id),
    documentLinks:   MOCK_DOCUMENT_LINKS.filter(d => d.assetId === id),
    telemetryLinks:  MOCK_TELEMETRY_LINKS.filter(t => t.assetId === id),
    assetTags:       MOCK_ASSET_TAGS.filter(t => t.assetId === id),
  };
}

export async function getAssetLocations(): Promise<AssetLocation[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await (db as never as { assetLocation: { findMany: (args: unknown) => Promise<unknown[]> } }).assetLocation.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });
      return ts(rows) as AssetLocation[];
    } catch { /* fall through */ }
  }
  return MOCK_LOCATIONS.filter(l => l.isActive);
}

export async function getAssetHierarchy(): Promise<RegistryAssetRecord[]> {
  const db = await getDb();
  if (db) {
    try {
      const topLevel = await (db as never as { registryAsset: { findMany: (args: unknown) => Promise<unknown[]> } }).registryAsset.findMany({
        where: { parentAssetId: null },
        include: {
          location: true,
          children: {
            include: {
              location: true,
              children: { include: { location: true } },
            },
          },
          _count: { select: { children: true, maintenanceLinks: true, documentLinks: true, telemetryLinks: true, healthSnapshots: true } },
        },
        orderBy: [{ criticality: "desc" }, { name: "asc" }],
      });
      return ts(topLevel) as RegistryAssetRecord[];
    } catch { /* fall through */ }
  }
  // Build hierarchy from mock
  function buildChildren(parentId: string): RegistryAssetRecord[] {
    return MOCK_ASSETS
      .filter(a => a.parentAssetId === parentId)
      .map(a => ({
        ...a,
        location: a.locationId ? MOCK_LOCATIONS.find(l => l.id === a.locationId) ?? null : null,
        children: buildChildren(a.id),
      }));
  }
  return MOCK_ASSETS
    .filter(a => !a.parentAssetId)
    .map(a => ({
      ...a,
      location: a.locationId ? MOCK_LOCATIONS.find(l => l.id === a.locationId) ?? null : null,
      children: buildChildren(a.id),
    }));
}

export async function getAssetDashboard(): Promise<AssetDashboard> {
  const db = await getDb();
  if (db) {
    try {
      const [assets, recentEvents, maintenanceLinks] = await Promise.all([
        (db as never as { registryAsset: { findMany: (args: unknown) => Promise<unknown[]> } }).registryAsset.findMany({
          include: { _count: { select: { maintenanceLinks: true, documentLinks: true } } },
        }),
        (db as never as { assetLifecycleEvent: { findMany: (args: unknown) => Promise<unknown[]> } }).assetLifecycleEvent.findMany({
          orderBy: { occurredAt: "desc" },
          take: 8,
        }),
        (db as never as { assetMaintenanceLink: { findMany: (args: unknown) => Promise<unknown[]> } }).assetMaintenanceLink.findMany({
          select: { assetId: true, linkType: true },
        }),
      ]);
      const tsAssets = ts(assets) as RegistryAssetRecord[];
      const tsEvents = ts(recentEvents) as AssetLifecycleEvent[];
      const tsLinks  = ts(maintenanceLinks) as AssetMaintenanceLink[];
      return buildDashboard(tsAssets, tsEvents, tsLinks);
    } catch { /* fall through */ }
  }
  return buildDashboard(MOCK_ASSETS, MOCK_LIFECYCLE_EVENTS, MOCK_MAINTENANCE_LINKS);
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
