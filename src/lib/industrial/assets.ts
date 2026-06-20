import { getPrisma }    from "@/lib/db/prisma";
import type { AssetRecord, IndustrialAssetType, IndustrialProtocol } from "./types";

type AssetModel = {
  findMany:  (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  create:    (a: unknown) => Promise<Record<string, unknown>>;
  update:    (a: unknown) => Promise<Record<string, unknown>>;
};

function row(r: Record<string, unknown>): AssetRecord {
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    siteId:         r.siteId         as string,
    gatewayId:      (r.gatewayId     ?? null) as string | null,
    name:           r.name           as string,
    assetType:      r.assetType      as IndustrialAssetType,
    manufacturer:   (r.manufacturer  ?? null) as string | null,
    model:          (r.model         ?? null) as string | null,
    protocol:       r.protocol       as IndustrialProtocol,
    tagPrefix:      (r.tagPrefix     ?? null) as string | null,
    status:         r.status         as string,
    metadata:       (r.metadata       ?? {}) as Record<string, unknown>,
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
}

export async function listAssets(organizationId: string, opts?: {
  siteId?:       string;
  gatewayId?:    string;
  allowedSiteIds?: string[];
}): Promise<AssetRecord[]> {
  if (opts?.allowedSiteIds !== undefined && opts.allowedSiteIds.length === 0) return [];
  const prisma = await getPrisma();
  if (!prisma) return [];
  const where: Record<string, unknown> = { organizationId };
  if (opts?.siteId)    where.siteId    = opts.siteId;
  if (opts?.gatewayId) where.gatewayId = opts.gatewayId;
  // Phase 43: if no specific siteId filter, scope to allowed sites
  if (!opts?.siteId && opts?.allowedSiteIds !== undefined) {
    where.siteId = { in: opts.allowedSiteIds };
  }
  const rows = await (prisma.industrialAsset as unknown as AssetModel).findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(row);
}

export async function getAsset(id: string, organizationId: string): Promise<AssetRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const r = await (prisma.industrialAsset as unknown as AssetModel).findFirst({
    where: { id, organizationId },
  });
  return r ? row(r) : null;
}

export async function createAsset(params: {
  organizationId: string;
  siteId:         string;
  name:           string;
  assetType?:     IndustrialAssetType;
  gatewayId?:     string;
  manufacturer?:  string;
  model?:         string;
  protocol?:      IndustrialProtocol;
  tagPrefix?:     string;
  status?:        string;
  metadata?:      Record<string, unknown>;
}): Promise<AssetRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const r = await (prisma.industrialAsset as unknown as AssetModel).create({
    data: {
      organizationId: params.organizationId,
      siteId:         params.siteId,
      name:           params.name,
      assetType:      params.assetType    ?? "OTHER",
      gatewayId:      params.gatewayId    ?? null,
      manufacturer:   params.manufacturer ?? null,
      model:          params.model        ?? null,
      protocol:       params.protocol     ?? "OTHER",
      tagPrefix:      params.tagPrefix    ?? null,
      status:         params.status       ?? "ACTIVE",
      metadata:       params.metadata     ?? {},
    },
  });
  return row(r);
}

export async function updateAsset(id: string, organizationId: string, patch: {
  name?:         string;
  assetType?:    IndustrialAssetType;
  manufacturer?: string | null;
  model?:        string | null;
  protocol?:     IndustrialProtocol;
  tagPrefix?:    string | null;
  status?:       string;
  gatewayId?:    string | null;
  metadata?:     Record<string, unknown>;
}): Promise<AssetRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const exists = await (prisma.industrialAsset as unknown as AssetModel).findFirst({
    where: { id, organizationId },
  });
  if (!exists) return null;
  const r = await (prisma.industrialAsset as unknown as AssetModel).update({
    where: { id },
    data:  patch,
  });
  return row(r);
}
