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
import { lockActiveSitesForWrite, lockAssetsForWrite } from "@/lib/site/write-locks";

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
 * Tags of one asset. The asset's SITE must be in `allowedSiteIds` — an asset at
 * an unreachable site yields an empty list, exactly as an unknown asset does.
 *
 * Slice D2: `allowedSiteIds` is REQUIRED (`[]` = nothing, no read). The unscoped
 * `resolveTagsForAsset` and `getAssetByTag` exports had no caller and were removed.
 */
export async function listTagsPage(
  assetId: string,
  organizationId: string,
  opts: { allowedSiteIds: readonly string[] },
): Promise<{ tags: AssetTagRecord[]; truncated: boolean }> {
  if (opts.allowedSiteIds.length === 0) return { tags: [], truncated: false };
  const prisma = await getPrisma();
  if (!prisma) return { tags: [], truncated: false };
  const where: Record<string, unknown> = { assetId, organizationId, asset: { siteId: { in: [...opts.allowedSiteIds] } } };
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
  opts: { allowedSiteIds: readonly string[] },
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
  /**
   * The site the caller was authorised on — the asset's site as the route read
   * it. Required: the write is refused unless the asset still stands there.
   */
  siteId:         string;
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
      // DT-01 review F1: the route authorised the asset's site BEFORE this
      // transaction. Re-read under FOR SHARE (assets, then sites): the asset must
      // still be in this organisation, still at the authorised site, and that site
      // still ACTIVE — otherwise the same not-found as a missing asset.
      const assetSites = await lockAssetsForWrite(tx, params.organizationId, [params.assetId]);
      if (assetSites.get(params.assetId) !== params.siteId) throw twinNotFound.asset();
      const activeSites = await lockActiveSitesForWrite(tx, params.organizationId, [params.siteId]);
      if (!activeSites.has(params.siteId)) throw twinNotFound.asset();

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
        siteId:         params.siteId,
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
