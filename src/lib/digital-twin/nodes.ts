import { getPrisma }      from "@/lib/db/prisma";
import { DT_AUDIT }      from "@/lib/audit/audit-service";
import type { TwinNodeRecord, DigitalTwinNodeType } from "./types";
import { TWIN_LIMITS }   from "./schemas";
import { twinNotFound, TwinDomainError } from "./errors";
import { assertParentChainAcyclic, lockHierarchy } from "./hierarchy";
import { auditInTx, runTwinTransaction, type Row, type TwinModel, type TwinTx } from "./tx";

type NodeModel = TwinModel;

export function rowToNode(r: Record<string, unknown>): TwinNodeRecord {
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    siteId:         r.siteId         as string,
    assetId:        (r.assetId       ?? null) as string | null,
    parentNodeId:   (r.parentNodeId  ?? null) as string | null,
    displayName:    r.displayName    as string,
    nodeType:       r.nodeType       as DigitalTwinNodeType,
    metadata:       (r.metadata       ?? {}) as Record<string, unknown>,
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
}

/**
 * Nodes of an organisation, within the sites the caller may reach, optionally
 * narrowed to one of them.
 *
 * Slice D2: `allowedSiteIds` is REQUIRED — there is no organisation-wide form any
 * more (the unscoped `listNodes` / `countNodes` wrappers had no caller and were
 * removed). `[]` = the caller reaches no site, so the answer is empty without a
 * read; a requested `siteId` NARROWS the allowed set and never replaces it. The
 * restriction is part of the query, not a filter applied to a fetched result.
 */
export async function listNodesPage(
  organizationId: string,
  opts: { siteId?: string; allowedSiteIds: readonly string[]; limit?: number },
): Promise<{ nodes: TwinNodeRecord[]; truncated: boolean }> {
  if (opts.allowedSiteIds.length === 0) return { nodes: [], truncated: false };
  if (opts.siteId && !opts.allowedSiteIds.includes(opts.siteId)) return { nodes: [], truncated: false };
  const prisma = await getPrisma();
  if (!prisma) return { nodes: [], truncated: false };

  const where: Record<string, unknown> = {
    organizationId,
    siteId: opts.siteId ?? { in: [...opts.allowedSiteIds] },
  };

  // A caller-supplied limit can only LOWER the server ceiling.
  const requested = Number.isFinite(opts.limit) ? Math.trunc(opts.limit as number) : TWIN_LIMITS.LIST_NODES;
  const limit = Math.min(Math.max(1, requested), TWIN_LIMITS.LIST_NODES);
  const rows = await (prisma.digitalTwinNode as unknown as NodeModel).findMany({
    where,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
  });
  return { nodes: rows.slice(0, limit).map(rowToNode), truncated: rows.length > limit };
}

export async function getNode(id: string, organizationId: string): Promise<TwinNodeRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const r = await (prisma.digitalTwinNode as unknown as NodeModel).findFirst({
    where: { id, organizationId },
  });
  return r ? rowToNode(r) : null;
}

/**
 * Ownership checks shared by create and update. Every lookup carries the
 * organisation AND the node's site, so "exists", "is another tenant's" and "is at
 * another site" are the same answer — not found.
 */
async function assertAssetInSite(tx: TwinTx, assetId: string, organizationId: string, siteId: string): Promise<void> {
  const asset = await tx.industrialAsset.findFirst({
    where: { id: assetId, organizationId, siteId },
    select: { id: true },
  });
  if (!asset) throw twinNotFound.asset();
}

async function assertParentInSite(tx: TwinTx, parentId: string, organizationId: string, siteId: string): Promise<void> {
  const parent = await tx.digitalTwinNode.findFirst({
    where: { id: parentId, organizationId, siteId },
    select: { id: true },
  });
  if (!parent) throw twinNotFound.parent();
}

export async function createNode(params: {
  organizationId: string;
  siteId:         string;
  displayName:    string;
  nodeType:       DigitalTwinNodeType;
  assetId?:       string | null;
  parentNodeId?:  string | null;
  metadata?:      Record<string, unknown>;
  actorUserId?:   string | null;
}): Promise<TwinNodeRecord | null> {
  const created = await runTwinTransaction(async (tx) => {
    // A new node has no children yet, so it cannot close a loop by itself; the
    // lock still matters because the parent chain it joins may be changing.
    if (params.parentNodeId) await lockHierarchy(tx, params.organizationId);

    const site = await tx.industrialSite.findFirst({
      where: { id: params.siteId, organizationId: params.organizationId },
      select: { id: true },
    });
    if (!site) throw twinNotFound.site();

    if (params.assetId)      await assertAssetInSite(tx, params.assetId, params.organizationId, params.siteId);
    if (params.parentNodeId) await assertParentInSite(tx, params.parentNodeId, params.organizationId, params.siteId);

    const r = await tx.digitalTwinNode.create({
      data: {
        organizationId: params.organizationId,
        siteId:         params.siteId,
        displayName:    params.displayName,
        nodeType:       params.nodeType,
        assetId:        params.assetId      ?? null,
        parentNodeId:   params.parentNodeId ?? null,
        metadata:       params.metadata     ?? {},
      },
    });

    await auditInTx(tx, {
      organizationId: params.organizationId,
      userId:         params.actorUserId ?? null,
      action:         DT_AUDIT.NODE_CREATED,
      entityId:       String(r.id),
      siteId:         params.siteId,
      details: {
        nodeType:  params.nodeType,
        hasAsset:  Boolean(params.assetId),
        hasParent: Boolean(params.parentNodeId),
      },
    });
    return r;
  });
  return created ? rowToNode(created) : null;
}

export async function updateNode(
  id: string,
  organizationId: string,
  patch: {
    displayName?:  string;
    nodeType?:     DigitalTwinNodeType;
    assetId?:      string | null;
    parentNodeId?: string | null;
    metadata?:     Record<string, unknown>;
  },
  actorUserId?: string | null,
): Promise<TwinNodeRecord | null> {
  const touchesParent = patch.parentNodeId !== undefined;

  const updated = await runTwinTransaction(async (tx) => {
    if (touchesParent) await lockHierarchy(tx, organizationId);

    const current: Row | null = await tx.digitalTwinNode.findFirst({ where: { id, organizationId } });
    if (!current) throw twinNotFound.node();
    const siteId = String(current.siteId);

    if (patch.assetId) await assertAssetInSite(tx, patch.assetId, organizationId, siteId);
    if (patch.parentNodeId) {
      if (patch.parentNodeId === id) {
        throw new TwinDomainError("HIERARCHY_CYCLE", 422, "A node cannot be its own parent");
      }
      await assertParentInSite(tx, patch.parentNodeId, organizationId, siteId);
      await assertParentChainAcyclic(tx, organizationId, siteId, id, patch.parentNodeId);
    }

    // Only fields actually supplied are written; `undefined` never reaches Prisma.
    const data: Record<string, unknown> = {};
    if (patch.displayName  !== undefined) data.displayName  = patch.displayName;
    if (patch.nodeType     !== undefined) data.nodeType     = patch.nodeType;
    if (patch.assetId      !== undefined) data.assetId      = patch.assetId;
    if (patch.parentNodeId !== undefined) data.parentNodeId = patch.parentNodeId;
    if (patch.metadata     !== undefined) data.metadata     = patch.metadata;

    // An empty patch is a no-op: nothing to write, nothing to audit.
    if (Object.keys(data).length === 0) return current;

    const r = await tx.digitalTwinNode.update({ where: { id, organizationId }, data });

    await auditInTx(tx, {
      organizationId,
      userId:   actorUserId ?? null,
      action:   DT_AUDIT.NODE_UPDATED,
      entityId: id,
      siteId,
      details:  { changedFields: Object.keys(data).sort() },
    });
    return r;
  });
  return updated ? rowToNode(updated) : null;
}
