/**
 * Context assembly — Phase 38.
 *
 * Builds bounded context objects from Phase 35/36/37 read-only services.
 * Each builder enforces a cap so context never grows unbounded on large orgs.
 *
 * INJECTION BOUNDARY: all strings from industrial data pass through escapeUntrustedData().
 * READ-ONLY: imports only list/get functions, never write/ingest/control functions.
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

export async function getAssetContextSummary(
  organizationId: string,
  assetId:        string,
): Promise<AssetContextSummary | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;

  const db = prisma as unknown as Record<string, unknown>;

  // Load asset record directly
  type AssetModel = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };
  const rawAsset = await (db.industrialAsset as unknown as AssetModel).findFirst({
    where: { id: assetId, organizationId },
  });
  if (!rawAsset) return null;

  const range = getPeriodRange("last24Hours");
  const [health, alarmFreq, tags] = await Promise.all([
    calculateHealthScore({ organizationId, assetId, assetStatus: rawAsset.status as string }),
    getAlarmFrequency(organizationId, assetId, range),
    listTagsForAsset(assetId, organizationId),
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
  organizationId: string,
  siteId:         string,
): Promise<SiteContextSummary | null> {
  const sites  = await listSites(organizationId);
  const site   = sites.find((s) => s.id === siteId);
  if (!site) return null;

  const allAssets = await listAssets(organizationId, { siteId });
  const capped    = allAssets.slice(0, MAX_ASSETS_IN_CONTEXT);

  const assetSummaries = await Promise.all(
    capped.map((a) => getAssetContextSummary(organizationId, a.id)),
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

export async function getOrganizationContextSummary(
  organizationId: string,
): Promise<OrgContextSummary> {
  const allSites  = await listSites(organizationId);
  const capped    = allSites.slice(0, MAX_SITES_IN_CONTEXT);
  const allAssets = await listAssets(organizationId);

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
  organizationId: string,
  assetId:        string,
  tag:            string,
): Promise<TelemetryContextSummary> {
  const prisma = await getPrisma();
  const empty: TelemetryContextSummary = {
    assetId, tag, lastValue: null, lastReceivedAt: null, quality: null,
  };
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
  organizationId: string,
  siteId:         string,
): Promise<{ nodeCount: number; relationCount: number; nodes: TwinNodeRecord[]; moreNodes: number } | null> {
  const graph = await getAssetGraph(organizationId, siteId);
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
