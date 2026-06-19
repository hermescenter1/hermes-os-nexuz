import { getPrisma }          from "@/lib/db/prisma";
import type { TwinRelationRecord, DigitalTwinRelationType } from "./types";
import { BIDIRECTIONAL_RELATIONS, MAX_TRAVERSAL_DEPTH } from "./types";

type RelModel = {
  findMany:  (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  create:    (a: unknown) => Promise<Record<string, unknown>>;
  update:    (a: unknown) => Promise<Record<string, unknown>>;
  count:     (a: unknown) => Promise<number>;
};

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

export async function listRelations(organizationId: string, opts?: {
  sourceNodeId?: string;
  targetNodeId?: string;
}): Promise<TwinRelationRecord[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];
  const where: Record<string, unknown> = { organizationId };
  if (opts?.sourceNodeId) where.sourceNodeId = opts.sourceNodeId;
  if (opts?.targetNodeId) where.targetNodeId = opts.targetNodeId;
  const rows = await (prisma.digitalTwinRelation as unknown as RelModel).findMany({
    where,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(rowToRelation);
}

export async function getRelation(id: string, organizationId: string): Promise<TwinRelationRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const r = await (prisma.digitalTwinRelation as unknown as RelModel).findFirst({
    where: { id, organizationId },
  });
  return r ? rowToRelation(r) : null;
}

export async function createRelation(params: {
  organizationId: string;
  sourceNodeId:   string;
  targetNodeId:   string;
  relationType:   DigitalTwinRelationType;
  metadata?:      Record<string, unknown>;
}): Promise<TwinRelationRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const r = await (prisma.digitalTwinRelation as unknown as RelModel).create({
    data: {
      organizationId: params.organizationId,
      sourceNodeId:   params.sourceNodeId,
      targetNodeId:   params.targetNodeId,
      relationType:   params.relationType,
      metadata:       params.metadata ?? {},
    },
  });
  return rowToRelation(r);
}

export async function updateRelation(id: string, organizationId: string, patch: {
  metadata?: Record<string, unknown>;
}): Promise<TwinRelationRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const exists = await (prisma.digitalTwinRelation as unknown as RelModel).findFirst({
    where: { id, organizationId },
  });
  if (!exists) return null;
  const r = await (prisma.digitalTwinRelation as unknown as RelModel).update({
    where: { id },
    data:  patch,
  });
  return rowToRelation(r);
}

export async function countRelations(organizationId: string): Promise<number> {
  const prisma = await getPrisma();
  if (!prisma) return 0;
  return (prisma.digitalTwinRelation as unknown as RelModel).count({ where: { organizationId } });
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
