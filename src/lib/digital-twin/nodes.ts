import { getPrisma }      from "@/lib/db/prisma";
import { DT_AUDIT }      from "@/lib/audit/audit-service";
import type { TwinNodeRecord, DigitalTwinNodeType } from "./types";
import { TWIN_LIMITS }   from "./schemas";
import { twinNotFound, TwinDomainError } from "./errors";
import { assertParentChainAcyclic, lockHierarchy } from "./hierarchy";
import { auditInTx, runTwinTransaction, type Row, type TwinModel, type TwinTx } from "./tx";
import { lockActiveSitesForWrite, lockAssetsForWrite } from "@/lib/site/write-locks";

type NodeModel = TwinModel;

/**
 * DT-01 review F2 — what a node's references are read with.
 *
 * `assetId` and `parentNodeId` are plain foreign keys, so a row written before the
 * Slice 1 ownership checks (or an asset moved since) can point at an asset or a
 * node of ANOTHER site — or another organisation — and returning the raw id would
 * hand a site-limited viewer an id from a site it cannot see. Every read that
 * feeds `rowToNode` loads the referenced row's owner with this include, and
 * `rowToNode` shows a reference only when it resolves inside the node's own
 * organisation AND site — the only place a reference may legitimately live.
 */
export const NODE_REFERENCE_INCLUDE = {
  parent: { select: { organizationId: true, siteId: true } },
  asset:  { select: { organizationId: true, siteId: true } },
} as const;

function referenceInScope(ref: unknown, organizationId: unknown, siteId: unknown): boolean {
  if (!ref || typeof ref !== "object") return false;
  const owner = ref as Record<string, unknown>;
  return owner.organizationId === organizationId && owner.siteId === siteId;
}

/**
 * Fail-closed: a reference whose owner was NOT loaded (a query without
 * `NODE_REFERENCE_INCLUDE`) is withheld rather than trusted.
 */
export function rowToNode(r: Record<string, unknown>): TwinNodeRecord {
  const assetId      = (r.assetId      ?? null) as string | null;
  const parentNodeId = (r.parentNodeId ?? null) as string | null;
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    siteId:         r.siteId         as string,
    assetId:        assetId      && referenceInScope(r.asset,  r.organizationId, r.siteId) ? assetId      : null,
    parentNodeId:   parentNodeId && referenceInScope(r.parent, r.organizationId, r.siteId) ? parentNodeId : null,
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
    include: NODE_REFERENCE_INCLUDE,
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
    include: NODE_REFERENCE_INCLUDE,
  });
  return r ? rowToNode(r) : null;
}

/**
 * Ownership check shared by create and update. The lookup carries the
 * organisation AND the node's site, so "exists", "is another tenant's" and "is at
 * another site" are the same answer — not found. (Assets are checked through
 * `lockAssetsForWrite`, which also returns their CURRENT site under a lock.)
 */
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

    // DT-01 review F1: the route authorised the site BEFORE this transaction. The
    // rows that decision rests on — the asset's current site and the site being
    // ACTIVE — are re-read here under `FOR SHARE` (write-locks.ts lock order:
    // assets, then sites), so a concurrent asset move or site deactivation either
    // commits first and is seen here, or waits until this insert has committed.
    const assetSites  = params.assetId
      ? await lockAssetsForWrite(tx, params.organizationId, [params.assetId])
      : new Map<string, string>();
    const activeSites = await lockActiveSitesForWrite(tx, params.organizationId, [params.siteId]);
    if (!activeSites.has(params.siteId)) throw twinNotFound.site();

    if (params.assetId && assetSites.get(params.assetId) !== params.siteId) throw twinNotFound.asset();
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
      include: NODE_REFERENCE_INCLUDE,
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

    // DT-01 review F1 — lock order of write-locks.ts: the written row first,
    // then the asset it is re-pointed at, then its site. The route authorised the
    // node's site before this transaction; the decision is re-read here, under the
    // locks, so it cannot change before this write commits. NO KEY UPDATE, not
    // UPDATE: the id never changes, so foreign-key checks of concurrent child
    // nodes and relations (KEY SHARE) need not wait for this patch.
    const lockedNode = await tx.$queryRaw`
      SELECT n."id" AS "id"
      FROM "DigitalTwinNode" n
      WHERE n."id" = ${id} AND n."organizationId" = ${organizationId}
      FOR NO KEY UPDATE
    `;
    if (lockedNode.length === 0) throw twinNotFound.node();

    const current: Row | null = await tx.digitalTwinNode.findFirst({
      where: { id, organizationId },
      include: NODE_REFERENCE_INCLUDE,
    });
    if (!current) throw twinNotFound.node();
    const siteId = String(current.siteId);

    const assetSites  = patch.assetId
      ? await lockAssetsForWrite(tx, organizationId, [patch.assetId])
      : new Map<string, string>();
    const activeSites = await lockActiveSitesForWrite(tx, organizationId, [siteId]);
    if (!activeSites.has(siteId)) throw twinNotFound.node();

    if (patch.assetId && assetSites.get(patch.assetId) !== siteId) throw twinNotFound.asset();
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

    const r = await tx.digitalTwinNode.update({ where: { id, organizationId }, data, include: NODE_REFERENCE_INCLUDE });

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
