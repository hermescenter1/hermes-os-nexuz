import { getPrisma }      from "@/lib/db/prisma";
import { DT_AUDIT }       from "@/lib/audit/audit-service";
import type { TwinLayoutRecord } from "./types";
import { TWIN_LIMITS }    from "./schemas";
import { twinNotFound }   from "./errors";
import { auditInTx, runTwinTransaction, type TwinModel } from "./tx";

type LayoutModel = TwinModel;

function rowToLayout(r: Record<string, unknown>): TwinLayoutRecord {
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    siteId:         r.siteId         as string,
    name:           r.name           as string,
    layoutData:     (r.layoutData    ?? {}) as Record<string, unknown>,
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
}

/**
 * Layouts of an organisation. `allowedSiteIds` follows the `listAssets`
 * contract (undefined = unrestricted internal call, [] = nothing, a requested
 * `siteId` narrows the allowed set and never replaces it).
 */
export async function listLayoutsPage(
  organizationId: string,
  siteId?: string,
  allowedSiteIds?: string[],
): Promise<{ layouts: TwinLayoutRecord[]; truncated: boolean }> {
  if (allowedSiteIds !== undefined && allowedSiteIds.length === 0) {
    return { layouts: [], truncated: false };
  }
  const prisma = await getPrisma();
  if (!prisma) return { layouts: [], truncated: false };
  const where: Record<string, unknown> = { organizationId };
  if (allowedSiteIds !== undefined) {
    if (siteId && !allowedSiteIds.includes(siteId)) return { layouts: [], truncated: false };
    where.siteId = siteId ?? { in: allowedSiteIds };
  } else if (siteId) {
    where.siteId = siteId;
  }
  const limit = TWIN_LIMITS.LIST_LAYOUTS;
  const rows = await (prisma.digitalTwinLayout as unknown as LayoutModel).findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: limit + 1,
  });
  return { layouts: rows.slice(0, limit).map(rowToLayout), truncated: rows.length > limit };
}

/** Array-returning form for internal callers. Bounded, no `truncated` flag. */
export async function listLayouts(
  organizationId: string,
  siteId?: string,
  allowedSiteIds?: string[],
): Promise<TwinLayoutRecord[]> {
  return (await listLayoutsPage(organizationId, siteId, allowedSiteIds)).layouts;
}

export async function getLayout(id: string, organizationId: string): Promise<TwinLayoutRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const r = await (prisma.digitalTwinLayout as unknown as LayoutModel).findFirst({
    where: { id, organizationId },
  });
  return r ? rowToLayout(r) : null;
}

export async function createLayout(params: {
  organizationId: string;
  siteId:         string;
  name:           string;
  layoutData?:    Record<string, unknown>;
  actorUserId?:   string | null;
}): Promise<TwinLayoutRecord | null> {
  const created = await runTwinTransaction(async (tx) => {
    const site = await tx.industrialSite.findFirst({
      where: { id: params.siteId, organizationId: params.organizationId },
      select: { id: true },
    });
    if (!site) throw twinNotFound.site();

    const r = await tx.digitalTwinLayout.create({
      data: {
        organizationId: params.organizationId,
        siteId:         params.siteId,
        name:           params.name,
        layoutData:     params.layoutData ?? {},
      },
    });
    await auditInTx(tx, {
      organizationId: params.organizationId,
      userId:         params.actorUserId ?? null,
      action:         DT_AUDIT.LAYOUT_UPDATED,
      entityId:       String(r.id),
      siteId:         params.siteId,
      details:        { operation: "create" },
    });
    return r;
  });
  return created ? rowToLayout(created) : null;
}

export async function updateLayout(id: string, organizationId: string, patch: {
  name?:       string;
  layoutData?: Record<string, unknown>;
}): Promise<TwinLayoutRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const exists = await (prisma.digitalTwinLayout as unknown as LayoutModel).findFirst({
    where: { id, organizationId },
  });
  if (!exists) return null;
  const r = await (prisma.digitalTwinLayout as unknown as LayoutModel).update({
    where: { id },
    data:  patch,
  });
  return rowToLayout(r);
}
