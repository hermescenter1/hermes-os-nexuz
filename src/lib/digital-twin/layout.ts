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
 * Layouts of an organisation, within the sites the caller may reach. `[]` =
 * nothing (no read); a requested `siteId` narrows the allowed set and never
 * replaces it.
 *
 * Slice D2: `allowedSiteIds` is REQUIRED. The unscoped `listLayouts`,
 * `getLayout` and `updateLayout` exports had no caller (`updateLayout` also
 * wrote outside a transaction, without the site check or an audit event) and
 * were removed.
 *
 * `layoutData` is OPAQUE: the schema (`layoutDataSchema`) defines no node
 * reference field, the server never interprets it, never resolves any value in
 * it as a Digital Twin node and makes no authorisation decision on it. It is
 * bounded (size, depth) and rejects prototype-pollution keys, nothing more.
 */
export async function listLayoutsPage(
  organizationId: string,
  siteId: string | undefined,
  allowedSiteIds: readonly string[],
): Promise<{ layouts: TwinLayoutRecord[]; truncated: boolean }> {
  if (allowedSiteIds.length === 0) return { layouts: [], truncated: false };
  if (siteId && !allowedSiteIds.includes(siteId)) return { layouts: [], truncated: false };
  const prisma = await getPrisma();
  if (!prisma) return { layouts: [], truncated: false };
  const where: Record<string, unknown> = { organizationId, siteId: siteId ?? { in: [...allowedSiteIds] } };
  const limit = TWIN_LIMITS.LIST_LAYOUTS;
  const rows = await (prisma.digitalTwinLayout as unknown as LayoutModel).findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: limit + 1,
  });
  return { layouts: rows.slice(0, limit).map(rowToLayout), truncated: rows.length > limit };
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
