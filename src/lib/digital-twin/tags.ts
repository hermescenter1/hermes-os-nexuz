/**
 * AssetTag service — Phase 36.
 *
 * tagPath mirrors TelemetryRecord.tag format.
 * Strict enforcement between AssetTag.tagPath and TelemetryRecord.tag deferred to Phase 37+.
 * These helpers allow Phase 37 to resolve telemetry records for an asset without
 * scanning by tag prefix alone.
 */

import { getPrisma }      from "@/lib/db/prisma";
import type { AssetTagRecord } from "./types";

type TagModel = {
  findMany:  (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  create:    (a: unknown) => Promise<Record<string, unknown>>;
  update:    (a: unknown) => Promise<Record<string, unknown>>;
};

export function rowToTag(r: Record<string, unknown>): AssetTagRecord {
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    assetId:        r.assetId        as string,
    tagName:        r.tagName        as string,
    tagPath:        r.tagPath        as string,
    unit:           (r.unit          ?? null) as string | null,
    dataType:       r.dataType       as string,
    description:    (r.description   ?? null) as string | null,
    metadata:       (r.metadata       ?? {}) as Record<string, unknown>,
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
}

export async function listTagsForAsset(assetId: string, organizationId: string): Promise<AssetTagRecord[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];
  const rows = await (prisma.assetTag as unknown as TagModel).findMany({
    where:   { assetId, organizationId },
    orderBy: { tagPath: "asc" },
  });
  return rows.map(rowToTag);
}

export async function getTag(id: string, organizationId: string): Promise<AssetTagRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const r = await (prisma.assetTag as unknown as TagModel).findFirst({
    where: { id, organizationId },
  });
  return r ? rowToTag(r) : null;
}

export async function createTag(params: {
  organizationId: string;
  assetId:        string;
  tagName:        string;
  tagPath:        string;
  unit?:          string;
  dataType?:      string;
  description?:   string;
  metadata?:      Record<string, unknown>;
}): Promise<AssetTagRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const r = await (prisma.assetTag as unknown as TagModel).create({
    data: {
      organizationId: params.organizationId,
      assetId:        params.assetId,
      tagName:        params.tagName,
      tagPath:        params.tagPath,
      unit:           params.unit        ?? null,
      dataType:       params.dataType    ?? "float",
      description:    params.description ?? null,
      metadata:       params.metadata    ?? {},
    },
  });
  return rowToTag(r);
}

export async function updateTag(id: string, organizationId: string, patch: {
  tagName?:     string;
  unit?:        string | null;
  dataType?:    string;
  description?: string | null;
  metadata?:    Record<string, unknown>;
}): Promise<AssetTagRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const exists = await (prisma.assetTag as unknown as TagModel).findFirst({
    where: { id, organizationId },
  });
  if (!exists) return null;
  const r = await (prisma.assetTag as unknown as TagModel).update({
    where: { id },
    data:  patch,
  });
  return rowToTag(r);
}

/** Resolve all tag paths registered for a given asset (for Phase 37 telemetry lookup). */
export async function resolveTagsForAsset(
  assetId:        string,
  organizationId: string,
): Promise<string[]> {
  const tags = await listTagsForAsset(assetId, organizationId);
  return tags.map((t) => t.tagPath);
}

/** Find the asset that owns a given tag path within an org. Returns null if unmapped. */
export async function getAssetByTag(
  tagPath:        string,
  organizationId: string,
): Promise<AssetTagRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const r = await (prisma.assetTag as unknown as TagModel).findFirst({
    where: { tagPath, organizationId },
  });
  return r ? rowToTag(r) : null;
}
