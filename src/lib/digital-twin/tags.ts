/**
 * AssetTag service — Phase 36.
 *
 * tagPath mirrors TelemetryRecord.tag format.
 * Strict enforcement between AssetTag.tagPath and TelemetryRecord.tag deferred to Phase 37+.
 * These helpers allow Phase 37 to resolve telemetry records for an asset without
 * scanning by tag prefix alone.
 *
 * Slice 1: writes verify the asset belongs to the caller's organisation inside the
 * writing transaction and audit on that same transaction; reads can be narrowed to
 * the sites the caller may reach (through the asset's site, in the query).
 */

import { getPrisma }      from "@/lib/db/prisma";
import { DT_AUDIT }       from "@/lib/audit/audit-service";
import type { AssetTagRecord } from "./types";
import { TWIN_LIMITS }    from "./schemas";
import { TwinDomainError, isUniqueViolation, twinNotFound } from "./errors";
import { auditInTx, runTwinTransaction, type Row, type TwinModel } from "./tx";

type TagModel = TwinModel;

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

/**
 * Tags of one asset. With `allowedSiteIds` the asset's SITE must be in the set —
 * an asset at an unreachable site yields an empty list, exactly as an unknown
 * asset does (the `listAssets` convention).
 */
export async function listTagsPage(
  assetId: string,
  organizationId: string,
  opts?: { allowedSiteIds?: string[] },
): Promise<{ tags: AssetTagRecord[]; truncated: boolean }> {
  if (opts?.allowedSiteIds !== undefined && opts.allowedSiteIds.length === 0) {
    return { tags: [], truncated: false };
  }
  const prisma = await getPrisma();
  if (!prisma) return { tags: [], truncated: false };
  const where: Record<string, unknown> = { assetId, organizationId };
  if (opts?.allowedSiteIds !== undefined) where.asset = { siteId: { in: opts.allowedSiteIds } };
  // `limit + 1` rows are requested so a result of exactly `limit` is not mistaken
  // for a truncated one. (assetId, tagPath) is unique, so tagPath is a total order.
  const limit = TWIN_LIMITS.LIST_TAGS;
  const rows = await (prisma.assetTag as unknown as TagModel).findMany({
    where,
    orderBy: { tagPath: "asc" },
    take: limit + 1,
  });
  return { tags: rows.slice(0, limit).map(rowToTag), truncated: rows.length > limit };
}

/** Array-returning form for internal callers (Copilot, brain). Bounded, no `truncated` flag. */
export async function listTagsForAsset(
  assetId: string,
  organizationId: string,
  opts?: { allowedSiteIds?: string[] },
): Promise<AssetTagRecord[]> {
  return (await listTagsPage(assetId, organizationId, opts)).tags;
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
  unit?:          string | null;
  dataType?:      string;
  description?:   string | null;
  metadata?:      Record<string, unknown>;
  actorUserId?:   string | null;
}): Promise<AssetTagRecord | null> {
  try {
    const created = await runTwinTransaction(async (tx) => {
      const asset = await tx.industrialAsset.findFirst({
        where: { id: params.assetId, organizationId: params.organizationId },
        select: { id: true, siteId: true },
      });
      if (!asset) throw twinNotFound.asset();

      const r = await tx.assetTag.create({
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

      await auditInTx(tx, {
        organizationId: params.organizationId,
        userId:         params.actorUserId ?? null,
        action:         DT_AUDIT.TAG_CREATED,
        entityId:       String(r.id),
        siteId:         String(asset.siteId),
        details:        { assetId: params.assetId, tagPath: params.tagPath },
      });
      return r;
    });
    return created ? rowToTag(created) : null;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new TwinDomainError("DUPLICATE_TAG", 409, "This asset already has a tag with that path");
    }
    throw err;
  }
}

export async function updateTag(
  id: string,
  organizationId: string,
  patch: {
    tagName?:     string;
    unit?:        string | null;
    dataType?:    string;
    description?: string | null;
    metadata?:    Record<string, unknown>;
  },
  actorUserId?: string | null,
): Promise<AssetTagRecord | null> {
  const updated = await runTwinTransaction(async (tx) => {
    const current: Row | null = await tx.assetTag.findFirst({
      where: { id, organizationId },
      include: { asset: { select: { siteId: true } } },
    });
    if (!current) throw twinNotFound.tag();

    const data: Record<string, unknown> = {};
    if (patch.tagName     !== undefined) data.tagName     = patch.tagName;
    if (patch.unit        !== undefined) data.unit        = patch.unit;
    if (patch.dataType    !== undefined) data.dataType    = patch.dataType;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.metadata    !== undefined) data.metadata    = patch.metadata;
    if (Object.keys(data).length === 0) return current;

    const r = await tx.assetTag.update({ where: { id, organizationId }, data });
    await auditInTx(tx, {
      organizationId,
      userId:   actorUserId ?? null,
      action:   DT_AUDIT.TAG_UPDATED,
      entityId: id,
      siteId:   (current.asset as Row | null)?.siteId as string | undefined,
      details:  { changedFields: Object.keys(data).sort() },
    });
    return r;
  });
  return updated ? rowToTag(updated) : null;
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
