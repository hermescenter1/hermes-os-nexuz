import { getPrisma }          from "@/lib/db/prisma";
import { DT_AUDIT }          from "@/lib/audit/audit-service";
import type { TwinRelationRecord, DigitalTwinRelationType } from "./types";
import { BIDIRECTIONAL_RELATIONS, MAX_TRAVERSAL_DEPTH } from "./types";
import { TWIN_LIMITS }       from "./schemas";
import { TwinDomainError, isUniqueViolation, twinNotFound } from "./errors";
import { assertPartOfAcyclic, lockHierarchy } from "./hierarchy";
import { auditInTx, runTwinTransaction, type Row, type TwinModel } from "./tx";
import { lockActiveSitesForWrite } from "@/lib/site/write-locks";

type RelModel = TwinModel;

export function rowToRelation(r: Record<string, unknown>): TwinRelationRecord {
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    sourceNodeId:   r.sourceNodeId   as string,
    targetNodeId:   r.targetNodeId   as string,
    relationType:   r.relationType   as DigitalTwinRelationType,
    metadata:       (r.metadata       ?? {}) as Record<string, unknown>,
    createdAt:      new Date(r.createdAt as string).toISOString(),
  };
}

/**
 * Relations of an organisation. A relation is visible only when BOTH endpoints
 * are at sites the caller may reach (`allowedSiteIds` — same contract as
 * `listNodesPage`), decided in the query via the relation's node joins.
 *
 * Slice D2: `allowedSiteIds` is REQUIRED — the unscoped `listRelations`,
 * `getRelation` and `countRelations` exports had no caller and were removed.
 */
export async function listRelationsPage(organizationId: string, opts: {
  sourceNodeId?:  string;
  targetNodeId?:  string;
  allowedSiteIds: readonly string[];
  limit?:         number;
}): Promise<{ relations: TwinRelationRecord[]; truncated: boolean }> {
  if (opts.allowedSiteIds.length === 0) return { relations: [], truncated: false };
  const prisma = await getPrisma();
  if (!prisma) return { relations: [], truncated: false };

  const where: Record<string, unknown> = {
    organizationId,
    sourceNode: { siteId: { in: [...opts.allowedSiteIds] } },
    targetNode: { siteId: { in: [...opts.allowedSiteIds] } },
  };
  if (opts.sourceNodeId) where.sourceNodeId = opts.sourceNodeId;
  if (opts.targetNodeId) where.targetNodeId = opts.targetNodeId;

  // A caller-supplied limit can only LOWER the server ceiling.
  const requested = Number.isFinite(opts.limit) ? Math.trunc(opts.limit as number) : TWIN_LIMITS.LIST_RELATIONS;
  const limit = Math.min(Math.max(1, requested), TWIN_LIMITS.LIST_RELATIONS);
  const rows = await (prisma.digitalTwinRelation as unknown as RelModel).findMany({
    where,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
  });
  return { relations: rows.slice(0, limit).map(rowToRelation), truncated: rows.length > limit };
}

/** A relation with the sites of its two endpoints, so a route can authorise both. */
export async function getRelationWithSites(
  id: string,
  organizationId: string,
): Promise<{ relation: TwinRelationRecord; siteIds: string[] } | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const r = await (prisma.digitalTwinRelation as unknown as RelModel).findFirst({
    where: { id, organizationId },
    include: {
      sourceNode: { select: { siteId: true } },
      targetNode: { select: { siteId: true } },
    },
  });
  if (!r) return null;
  const src = (r.sourceNode as Row | null)?.siteId;
  const tgt = (r.targetNode as Row | null)?.siteId;
  const siteIds = [...new Set([src, tgt].filter((x): x is string => typeof x === "string"))];
  return { relation: rowToRelation(r), siteIds };
}

export async function createRelation(params: {
  organizationId: string;
  sourceNodeId:   string;
  targetNodeId:   string;
  relationType:   DigitalTwinRelationType;
  metadata?:      Record<string, unknown>;
  actorUserId?:   string | null;
}): Promise<TwinRelationRecord | null> {
  try {
    const created = await runTwinTransaction(async (tx) => {
      // PART_OF is the hierarchy: serialise its writers so two concurrent
      // inserts cannot each pass the cycle check and together close a loop.
      if (params.relationType === "PART_OF") await lockHierarchy(tx, params.organizationId);

      const [src, tgt] = await Promise.all([
        tx.digitalTwinNode.findFirst({
          where: { id: params.sourceNodeId, organizationId: params.organizationId },
          select: { id: true, siteId: true },
        }),
        tx.digitalTwinNode.findFirst({
          where: { id: params.targetNodeId, organizationId: params.organizationId },
          select: { id: true, siteId: true },
        }),
      ]);
      if (!src) throw twinNotFound.source();
      if (!tgt) throw twinNotFound.target();

      if (src.id === tgt.id) {
        throw new TwinDomainError("SELF_RELATION", 422, "A node cannot be related to itself");
      }
      // The schema has no organisation-level (cross-site) relation model, so an
      // edge between two sites has nowhere legitimate to live. Refused, not
      // "allowed if the caller can see both".
      if (src.siteId !== tgt.siteId) {
        throw new TwinDomainError("CROSS_SITE_RELATION", 422, "Both nodes of a relation must belong to the same site");
      }

      // DT-01 review F1: the route authorised the endpoints' site before this
      // transaction; it must still be ACTIVE (FOR SHARE) when the edge is written.
      const activeSites = await lockActiveSitesForWrite(tx, params.organizationId, [String(src.siteId)]);
      if (!activeSites.has(String(src.siteId))) throw twinNotFound.source();

      // The unique index covers (source, target, type) only. For a bidirectional
      // type the reverse pair is the SAME link, so it is checked explicitly.
      const reverse = BIDIRECTIONAL_RELATIONS.has(params.relationType)
        ? [{ sourceNodeId: params.targetNodeId, targetNodeId: params.sourceNodeId }]
        : [];
      const existing = await tx.digitalTwinRelation.findFirst({
        where: {
          organizationId: params.organizationId,
          relationType:   params.relationType,
          OR: [{ sourceNodeId: params.sourceNodeId, targetNodeId: params.targetNodeId }, ...reverse],
        },
        select: { id: true },
      });
      if (existing) throw new TwinDomainError("DUPLICATE_RELATION", 409, "This relation already exists");

      if (params.relationType === "PART_OF") {
        await assertPartOfAcyclic(tx, params.organizationId, String(src.siteId), params.sourceNodeId, params.targetNodeId);
      }

      const r = await tx.digitalTwinRelation.create({
        data: {
          organizationId: params.organizationId,
          sourceNodeId:   params.sourceNodeId,
          targetNodeId:   params.targetNodeId,
          relationType:   params.relationType,
          metadata:       params.metadata ?? {},
        },
      });

      await auditInTx(tx, {
        organizationId: params.organizationId,
        userId:         params.actorUserId ?? null,
        action:         DT_AUDIT.RELATION_CREATED,
        entityId:       String(r.id),
        siteId:         String(src.siteId),
        details: {
          relationType: params.relationType,
          sourceNodeId: params.sourceNodeId,
          targetNodeId: params.targetNodeId,
        },
      });
      return r;
    });
    return created ? rowToRelation(created) : null;
  } catch (err) {
    // The unique index lost a race with a concurrent identical insert.
    if (isUniqueViolation(err)) {
      throw new TwinDomainError("DUPLICATE_RELATION", 409, "This relation already exists");
    }
    throw err;
  }
}

export async function updateRelation(
  id: string,
  organizationId: string,
  patch: { metadata?: Record<string, unknown> },
  actorUserId?: string | null,
): Promise<TwinRelationRecord | null> {
  const updated = await runTwinTransaction(async (tx) => {
    const current = await tx.digitalTwinRelation.findFirst({
      where: { id, organizationId },
      include: { sourceNode: { select: { siteId: true } } },
    });
    if (!current) throw twinNotFound.relation();

    const data: Record<string, unknown> = {};
    if (patch.metadata !== undefined) data.metadata = patch.metadata;
    if (Object.keys(data).length === 0) return current;

    const r = await tx.digitalTwinRelation.update({ where: { id, organizationId }, data });
    await auditInTx(tx, {
      organizationId,
      userId:   actorUserId ?? null,
      action:   DT_AUDIT.RELATION_UPDATED,
      entityId: id,
      siteId:   (current.sourceNode as Row | null)?.siteId as string | undefined,
      details:  { changedFields: Object.keys(data).sort() },
    });
    return r;
  });
  return updated ? rowToRelation(updated) : null;
}

// ── Directed graph traversal ───────────────────────────────────────────────────
//
// Builds adjacency lists from a flat array of relations.
// BIDIRECTIONAL_RELATIONS (CONNECTED_TO) are traversed in both directions.
// All other relations are directed: only from source → target.

export function buildAdjacency(relations: TwinRelationRecord[]): {
  forward: Map<string, { targetId: string; relationType: DigitalTwinRelationType }[]>;
  backward: Map<string, { sourceId: string; relationType: DigitalTwinRelationType }[]>;
} {
  const forward  = new Map<string, { targetId: string; relationType: DigitalTwinRelationType }[]>();
  const backward = new Map<string, { sourceId: string; relationType: DigitalTwinRelationType }[]>();

  for (const rel of relations) {
    if (!forward.has(rel.sourceNodeId))  forward.set(rel.sourceNodeId, []);
    if (!backward.has(rel.targetNodeId)) backward.set(rel.targetNodeId, []);

    forward.get(rel.sourceNodeId)!.push({ targetId: rel.targetNodeId, relationType: rel.relationType });
    backward.get(rel.targetNodeId)!.push({ sourceId: rel.sourceNodeId, relationType: rel.relationType });

    // Bidirectional: also add the reverse
    if (BIDIRECTIONAL_RELATIONS.has(rel.relationType)) {
      if (!forward.has(rel.targetNodeId))  forward.set(rel.targetNodeId, []);
      if (!backward.has(rel.sourceNodeId)) backward.set(rel.sourceNodeId, []);
      forward.get(rel.targetNodeId)!.push({ targetId: rel.sourceNodeId, relationType: rel.relationType });
      backward.get(rel.sourceNodeId)!.push({ sourceId: rel.targetNodeId, relationType: rel.relationType });
    }
  }

  return { forward, backward };
}

/**
 * Traverse forward (downstream): follow source → target edges.
 * Returns all reachable node IDs from startId.
 * Cycle-safe: terminates when a node is revisited or maxDepth is reached.
 */
export function traverseDownstream(
  startId:   string,
  forward:   Map<string, { targetId: string; relationType: DigitalTwinRelationType }[]>,
  maxDepth = MAX_TRAVERSAL_DEPTH,
): { nodeIds: string[]; cycleDetected: boolean; truncated: boolean } {
  const visited   = new Set<string>();
  const result:   string[] = [];
  let cycleDetected = false;
  let truncated     = false;

  const stack: { id: string; depth: number }[] = [{ id: startId, depth: 0 }];
  while (stack.length > 0) {
    const { id, depth } = stack.pop()!;
    if (visited.has(id)) { cycleDetected = true; continue; }
    if (depth > maxDepth) { truncated = true; continue; }
    visited.add(id);
    if (id !== startId) result.push(id);
    for (const { targetId } of (forward.get(id) ?? [])) {
      stack.push({ id: targetId, depth: depth + 1 });
    }
  }
  return { nodeIds: result, cycleDetected, truncated };
}

/**
 * Traverse backward (upstream): follow target → source edges.
 * Cycle-safe.
 */
export function traverseUpstream(
  startId:  string,
  backward: Map<string, { sourceId: string; relationType: DigitalTwinRelationType }[]>,
  maxDepth = MAX_TRAVERSAL_DEPTH,
): { nodeIds: string[]; cycleDetected: boolean; truncated: boolean } {
  const visited   = new Set<string>();
  const result:   string[] = [];
  let cycleDetected = false;
  let truncated     = false;

  const stack: { id: string; depth: number }[] = [{ id: startId, depth: 0 }];
  while (stack.length > 0) {
    const { id, depth } = stack.pop()!;
    if (visited.has(id)) { cycleDetected = true; continue; }
    if (depth > maxDepth) { truncated = true; continue; }
    visited.add(id);
    if (id !== startId) result.push(id);
    for (const { sourceId } of (backward.get(id) ?? [])) {
      stack.push({ id: sourceId, depth: depth + 1 });
    }
  }
  return { nodeIds: result, cycleDetected, truncated };
}

/**
 * BFS dependency path between two nodes. Traverses the forward adjacency.
 * Returns the shortest path (node IDs) or null if unreachable.
 * Cycle-safe via visited set.
 */
export function findDependencyPath(
  fromId:  string,
  toId:    string,
  forward: Map<string, { targetId: string; relationType: DigitalTwinRelationType }[]>,
  maxDepth = MAX_TRAVERSAL_DEPTH,
): string[] | null {
  if (fromId === toId) return [fromId];
  const visited = new Set<string>();
  const queue: { id: string; path: string[] }[] = [{ id: fromId, path: [fromId] }];

  while (queue.length > 0) {
    const { id, path } = queue.shift()!;
    if (visited.has(id)) continue;
    if (path.length > maxDepth) continue;
    visited.add(id);
    for (const { targetId } of (forward.get(id) ?? [])) {
      const newPath = [...path, targetId];
      if (targetId === toId) return newPath;
      queue.push({ id: targetId, path: newPath });
    }
  }
  return null;
}
