/**
 * Hierarchy integrity for the Digital Twin — Slice 1.
 *
 * Two structures express "belongs to": the `PART_OF` relation (canonical) and
 * the `parentNodeId` convenience pointer. Both must stay acyclic. Nothing in the
 * database enforces that, so it is enforced here, inside the writing
 * transaction.
 *
 * BOUNDED. A cycle check that walks an attacker-shaped graph without a ceiling
 * is a denial-of-service lever, so every walk has a depth cap and a visited cap.
 * Hitting a cap REFUSES the write (HIERARCHY_TOO_DEEP) rather than approving a
 * graph that could not be verified — fail closed.
 *
 * RACES. Two concurrent transactions can each pass the check and together close
 * a loop (A→B and B→A written at the same moment). READ COMMITTED does not stop
 * that, so hierarchy writes for one organisation are serialised with a
 * transaction-scoped advisory lock, released automatically at commit/rollback.
 * This is an APPLICATION guarantee: a writer that bypasses this module (a script,
 * a future code path) is not covered. The database-level guarantee needs the
 * Slice 2 migration; until then this limit stands.
 */

import { TwinDomainError } from "./errors";
import { TWIN_LIMITS } from "./schemas";
import type { TwinTx } from "./tx";

const LOCK_NAMESPACE = "digital-twin:hierarchy:";

/** Serialise hierarchy writes for one organisation until the transaction ends. */
export async function lockHierarchy(tx: TwinTx, organizationId: string): Promise<void> {
  const key = LOCK_NAMESPACE + organizationId;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

const cycle = () =>
  new TwinDomainError("HIERARCHY_CYCLE", 422, "This change would create a cycle in the hierarchy");
const tooDeep = () =>
  new TwinDomainError(
    "HIERARCHY_TOO_DEEP",
    422,
    "The hierarchy is too large to verify; the change was refused",
  );

/**
 * Adding `source PART_OF target` closes a loop iff `target` already reaches
 * `source` by following PART_OF edges forward. Breadth-first, one query per
 * level, so the number of round trips is bounded by the depth cap.
 */
export async function assertPartOfAcyclic(
  tx: TwinTx,
  organizationId: string,
  sourceNodeId: string,
  targetNodeId: string,
): Promise<void> {
  if (sourceNodeId === targetNodeId) throw cycle();

  const visited = new Set<string>([targetNodeId]);
  let frontier: string[] = [targetNodeId];

  for (let depth = 0; frontier.length > 0; depth++) {
    if (depth >= TWIN_LIMITS.HIERARCHY_MAX_DEPTH) throw tooDeep();

    const edges = await tx.digitalTwinRelation.findMany({
      where: {
        organizationId,
        relationType: "PART_OF",
        sourceNodeId: { in: frontier },
      },
      select: { targetNodeId: true },
      take: TWIN_LIMITS.HIERARCHY_MAX_VISITED + 1,
    });
    if (edges.length > TWIN_LIMITS.HIERARCHY_MAX_VISITED) throw tooDeep();

    const next: string[] = [];
    for (const e of edges) {
      const id = String(e.targetNodeId);
      if (id === sourceNodeId) throw cycle();
      if (visited.has(id)) continue;
      visited.add(id);
      if (visited.size > TWIN_LIMITS.HIERARCHY_MAX_VISITED) throw tooDeep();
      next.push(id);
    }
    frontier = next;
  }
}

/**
 * Setting `node.parentNodeId = newParentId` closes a loop iff `node` is already
 * an ancestor of `newParentId` (or the node is its own parent). Walks the parent
 * chain upward, one lookup per level, bounded.
 */
export async function assertParentChainAcyclic(
  tx: TwinTx,
  organizationId: string,
  nodeId: string,
  newParentId: string,
): Promise<void> {
  let cursor: string | null = newParentId;
  const seen = new Set<string>();

  for (let depth = 0; cursor !== null; depth++) {
    if (cursor === nodeId) throw cycle();
    if (depth >= TWIN_LIMITS.HIERARCHY_MAX_DEPTH || seen.has(cursor)) {
      // `seen` hit means the EXISTING data already loops somewhere above the
      // new parent; refuse rather than extend a structure we cannot reason about.
      throw seen.has(cursor) ? cycle() : tooDeep();
    }
    seen.add(cursor);

    const row: Record<string, unknown> | null = await tx.digitalTwinNode.findFirst({
      where: { id: cursor, organizationId },
      select: { parentNodeId: true },
    });
    cursor = row && row.parentNodeId ? String(row.parentNodeId) : null;
  }
}
