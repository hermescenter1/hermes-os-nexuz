/**
 * Context assembly — Phase 38.
 *
 * Builds bounded context objects from Phase 35/36/37 read-only services.
 * Each builder enforces a cap so context never grows unbounded on large orgs.
 *
 * INJECTION BOUNDARY: all strings from industrial data pass through escapeUntrustedData().
 * READ-ONLY: imports only list/get functions, never write/ingest/control functions.
 *
 * SITE SCOPE (slice C, IR-03): every builder takes a server-built {@link CopilotScope}. An asset, site or
 * graph outside `scope.siteIds` (the actor's readable ACTIVE sites) is "not found"; there is no
 * organisation-wide entry point.
 */

import { getPrisma }           from "@/lib/db/prisma";
import { listAssets }          from "@/lib/industrial/assets";
import { listSites }           from "@/lib/industrial/sites";
import { getAssetGraph }       from "@/lib/digital-twin/graph";
import { calculateHealthScore } from "@/lib/digital-twin/health";
import { listTagsForAsset }    from "@/lib/digital-twin/tags";
import { getAlarmFrequency }   from "@/lib/time-series/alarms";
import { getPeriodRange }      from "@/lib/time-series/periods";
import { escapeUntrustedData } from "./safety";
import type { CopilotScope } from "./scope";
import type { AssetRecord, SiteRecord } from "@/lib/industrial/types";
import type { TwinNodeRecord }          from "@/lib/digital-twin/types";

// Context caps — prevent unbounded growth on large orgs
const MAX_ASSETS_IN_CONTEXT   = 20;
const MAX_SITES_IN_CONTEXT    = 10;
const MAX_NODES_IN_CONTEXT    = 30;

export interface AssetContextSummary {
  assetId:      string;
  name:         string;
  assetType:    string;
  status:       string;
  healthScore:  number | null;
  alarmRate:    number | null;
  tags:         string[];
  truncated:    boolean;
}

export interface SiteContextSummary {
  siteId:     string;
  name:       string;
  status:     string;
  assetCount: number;
  assets:     AssetContextSummary[];
  moreAssets: number;
}

export interface OrgContextSummary {
  organizationId: string;
  siteCount:      number;
  assetCount:     number;
  sites:          { siteId: string; name: string; status: string }[];
  moreSites:      number;
}

export interface TelemetryContextSummary {
  assetId:          string;
  tag:              string;
  lastValue:        number | null;
  lastReceivedAt:   string | null;
  quality:          string | null;
}

type TelemetryModel = {
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
};

type AssetModel = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };

/** The asset row, only if it is the organisation's AND stands on one of the scope's sites. */
async function scopedAsset(scope: CopilotScope, assetId: string): Promise<Record<string, unknown> | null> {
  if (scope.siteIds.length === 0) return null;
  const prisma = await getPrisma();
  if (!prisma) return null;
  const db = prisma as unknown as Record<string, unknown>;
  return (db.industrialAsset as unknown as AssetModel).findFirst({
    where: { id: assetId, organizationId: scope.organizationId, siteId: { in: [...scope.siteIds] } },
  });
}

export async function getAssetContextSummary(
  scope:   CopilotScope,
  assetId: string,
): Promise<AssetContextSummary | null> {
  const organizationId = scope.organizationId;
  const rawAsset = await scopedAsset(scope, assetId);
  if (!rawAsset) return null;

  const range = getPeriodRange("last24Hours");
  const [health, alarmFreq, tags] = await Promise.all([
    calculateHealthScore({ organizationId, assetId, assetStatus: rawAsset.status as string }),
    getAlarmFrequency(organizationId, assetId, range),
    listTagsForAsset(assetId, organizationId, { allowedSiteIds: [...scope.siteIds] }),
  ]);

  return {
    assetId,
    name:        escapeUntrustedData(rawAsset.name as string),
    assetType:   rawAsset.assetType as string,
    status:      rawAsset.status as string,
    healthScore: health?.score ?? null,
    alarmRate:   alarmFreq?.alarmRate ?? null,
    tags:        tags.slice(0, 10).map((t) => escapeUntrustedData(t.tagPath)),
    truncated:   tags.length > 10,
  };
}

export async function getSiteContextSummary(
  scope:  CopilotScope,
  siteId: string,
): Promise<SiteContextSummary | null> {
  if (!scope.siteIds.includes(siteId)) return null;
  const organizationId = scope.organizationId;
  const sites  = await listSites(organizationId);
  const site   = sites.find((s) => s.id === siteId);
  if (!site) return null;

  const allAssets = await listAssets(organizationId, { siteId, allowedSiteIds: [...scope.siteIds] });
  const capped    = allAssets.slice(0, MAX_ASSETS_IN_CONTEXT);

  const assetSummaries = await Promise.all(
    capped.map((a) => getAssetContextSummary(scope, a.id)),
  );

  return {
    siteId,
    name:       escapeUntrustedData(site.name),
    status:     site.status,
    assetCount: allAssets.length,
    assets:     assetSummaries.filter(Boolean) as AssetContextSummary[],
    moreAssets: Math.max(0, allAssets.length - MAX_ASSETS_IN_CONTEXT),
  };
}

/** The actor's readable part of the organisation — never every site of it. */
export async function getOrganizationContextSummary(
  scope: CopilotScope,
): Promise<OrgContextSummary> {
  const organizationId = scope.organizationId;
  const allSites  = (await listSites(organizationId)).filter((s) => scope.siteIds.includes(s.id));
  const capped    = allSites.slice(0, MAX_SITES_IN_CONTEXT);
  const allAssets = await listAssets(organizationId, { allowedSiteIds: [...scope.siteIds] });

  return {
    organizationId,
    siteCount:  allSites.length,
    assetCount: allAssets.length,
    sites:      capped.map((s) => ({
      siteId: s.id,
      name:   escapeUntrustedData(s.name),
      status: s.status,
    })),
    moreSites: Math.max(0, allSites.length - MAX_SITES_IN_CONTEXT),
  };
}

export async function getTelemetryContextSummary(
  scope:   CopilotScope,
  assetId: string,
  tag:     string,
): Promise<TelemetryContextSummary> {
  const organizationId = scope.organizationId;
  const empty: TelemetryContextSummary = {
    assetId, tag, lastValue: null, lastReceivedAt: null, quality: null,
  };
  if (!(await scopedAsset(scope, assetId))) return empty;
  const prisma = await getPrisma();
  if (!prisma) return empty;

  const db  = prisma as unknown as Record<string, unknown>;
  const row = await (db.telemetryRecord as unknown as TelemetryModel).findFirst({
    where:   { organizationId, assetId, tag },
    orderBy: { receivedAt: "desc" },
  });
  if (!row) return empty;

  return {
    assetId,
    tag,
    lastValue:      (row.numericValue as number | null) ?? null,
    lastReceivedAt: row.receivedAt ? new Date(row.receivedAt as string).toISOString() : null,
    quality:        row.quality as string | null,
  };
}

export async function getDigitalTwinContextSummary(
  scope:  CopilotScope,
  siteId: string,
): Promise<{ nodeCount: number; relationCount: number; nodes: TwinNodeRecord[]; moreNodes: number } | null> {
  if (!scope.siteIds.includes(siteId)) return null;
  const graph = await getAssetGraph(scope.organizationId, siteId);
  if (!graph) return null;

  const nodes   = [...graph.nodes.values()];
  const capped  = nodes.slice(0, MAX_NODES_IN_CONTEXT);
  return {
    nodeCount:     nodes.length,
    relationCount: graph.relations.length,
    nodes:         capped,
    moreNodes:     Math.max(0, nodes.length - MAX_NODES_IN_CONTEXT),
  };
}
