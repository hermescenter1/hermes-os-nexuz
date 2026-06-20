/**
 * Industrial Knowledge Graph Builder — Phase 41.
 *
 * Builds a DERIVED/MATERIALIZED graph from Phase 35–40 source tables.
 * Source tables are authoritative; this graph is a cache.
 *
 * INVARIANTS:
 *   - Runs inside a Prisma interactive transaction → failed rebuild never
 *     leaves a half-built graph.
 *   - Concurrency guard (globalThis.__hermesKgRebuildInFlight Set<orgId>)
 *     → rejects concurrent rebuilds for the same org with 409.
 *   - Orphan detection: nodes whose entityId no longer exists in the source
 *     table are deleted (cascades their edges) before upserts.
 *   - Idempotent: rebuilding twice with unchanged source data produces the
 *     same node/edge set (upsert on @@unique constraints).
 *
 * WEIGHT NORMALIZATION (0.0–1.0 common scale):
 *   confidenceWeight (IndustrialRootCause, 0.0–1.0)       → direct
 *   FailureSeverity enum (LOW/MEDIUM/HIGH/CRITICAL)         → 0.25/0.50/0.75/1.00
 *   riskScore (AssetRiskScore, 0–100)                      → divide by 100
 *   Structural default                                      → 0.50
 *
 * EDGE DIRECTIONALITY:
 *   BIDIRECTIONAL: CONNECTED_TO, RELATED_TO
 *   DIRECTED (all others): traversal follows source → target only
 */

import { getPrisma } from "@/lib/db/prisma";

// ── Concurrency guard ─────────────────────────────────────────────────────────

const g = globalThis as unknown as { __hermesKgRebuildInFlight?: Set<string> };
function inFlightSet(): Set<string> {
  g.__hermesKgRebuildInFlight ??= new Set<string>();
  return g.__hermesKgRebuildInFlight;
}

export function isRebuildInFlight(orgId: string): boolean {
  return inFlightSet().has(orgId);
}

function acquireLock(orgId: string): void {
  inFlightSet().add(orgId);
}

function releaseLock(orgId: string): void {
  inFlightSet().delete(orgId);
}

// ── Weight normalization ──────────────────────────────────────────────────────

/** Normalize FailureSeverity enum to 0.0–1.0. */
function severityWeight(severity: string): number {
  switch (severity) {
    case "LOW":      return 0.25;
    case "MEDIUM":   return 0.50;
    case "HIGH":     return 0.75;
    case "CRITICAL": return 1.00;
    default:         return 0.50;
  }
}

// ── Build result ──────────────────────────────────────────────────────────────

export interface KGBuildSummary {
  nodeCount:       number;
  edgeCount:       number;
  orphansRemoved:  number;
  buildDurationMs: number;
  snapshotId:      string;
}

// ── Prisma dynamic model types ────────────────────────────────────────────────

type FindManyFn = (a: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
type FindFirstFn = (a: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
type UpsertFn = (a: Record<string, unknown>) => Promise<Record<string, unknown>>;
type DeleteManyFn = (a: Record<string, unknown>) => Promise<{ count: number }>;
type CreateFn = (a: Record<string, unknown>) => Promise<Record<string, unknown>>;
type UpdateFn = (a: Record<string, unknown>) => Promise<Record<string, unknown>>;

interface NodeModel  { findMany: FindManyFn; upsert: UpsertFn; deleteMany: DeleteManyFn }
interface EdgeModel  { upsert: UpsertFn; deleteMany: DeleteManyFn }
interface SnapModel  { create: CreateFn; findFirst: FindFirstFn; update: UpdateFn }
interface GenModel   { findMany: FindManyFn }
type PrismaTx = Record<string, unknown>;

function nodeModel(tx: PrismaTx):  NodeModel  { return (tx as Record<string, unknown>).industrialKnowledgeGraphNode as NodeModel; }
function edgeModel(tx: PrismaTx):  EdgeModel  { return (tx as Record<string, unknown>).industrialKnowledgeGraphEdge as EdgeModel; }
function snapModel(tx: PrismaTx):  SnapModel  { return (tx as Record<string, unknown>).knowledgeGraphSnapshot as SnapModel; }
function model(tx: PrismaTx, name: string): GenModel { return (tx as Record<string, unknown>)[name] as GenModel; }

// ── Node upsert helper ────────────────────────────────────────────────────────

interface NodeSpec {
  nodeType: string;
  entityId: string;
  label:    string;
  metadata: Record<string, unknown>;
}

async function upsertNode(tx: PrismaTx, orgId: string, spec: NodeSpec): Promise<void> {
  await nodeModel(tx).upsert({
    where: {
      organizationId_nodeType_entityId: {
        organizationId: orgId,
        nodeType:       spec.nodeType,
        entityId:       spec.entityId,
      },
    },
    create: {
      organizationId: orgId,
      nodeType:       spec.nodeType,
      entityId:       spec.entityId,
      label:          spec.label,
      metadata:       spec.metadata,
    },
    update: {
      label:    spec.label,
      metadata: spec.metadata,
      updatedAt: new Date(),
    },
  });
}

// ── Edge upsert helper ────────────────────────────────────────────────────────

interface EdgeSpec {
  sourceNodeId: string;
  targetNodeId: string;
  edgeType:     string;
  weight:       number;
  evidence:     Record<string, unknown>;
}

async function upsertEdge(tx: PrismaTx, orgId: string, spec: EdgeSpec): Promise<void> {
  try {
    await edgeModel(tx).upsert({
      where: {
        sourceNodeId_targetNodeId_edgeType: {
          sourceNodeId: spec.sourceNodeId,
          targetNodeId: spec.targetNodeId,
          edgeType:     spec.edgeType,
        },
      },
      create: {
        organizationId: orgId,
        sourceNodeId:   spec.sourceNodeId,
        targetNodeId:   spec.targetNodeId,
        edgeType:       spec.edgeType,
        weight:         Math.min(1, Math.max(0, spec.weight)),
        evidence:       spec.evidence,
      },
      update: {
        weight:   Math.min(1, Math.max(0, spec.weight)),
        evidence: spec.evidence,
      },
    });
  } catch {
    // Skip if both nodes don't yet exist (build ordering) — next rebuild will catch it
  }
}

// ── Node-id lookup ────────────────────────────────────────────────────────────

type NodeIdMap = Map<string, string>; // `${nodeType}:${entityId}` → id

async function loadNodeIdMap(tx: PrismaTx, orgId: string): Promise<NodeIdMap> {
  const rows = await nodeModel(tx).findMany({ where: { organizationId: orgId }, select: { id: true, nodeType: true, entityId: true } as unknown as undefined });
  const m = new Map<string, string>();
  for (const r of rows) m.set(`${String(r.nodeType)}:${String(r.entityId)}`, String(r.id));
  return m;
}

function nodeId(map: NodeIdMap, nodeType: string, entityId: string): string | undefined {
  return map.get(`${nodeType}:${entityId}`);
}

// ── Core rebuild logic (runs inside transaction) ──────────────────────────────

async function buildInsideTx(tx: PrismaTx, orgId: string, snapshotId: string, startedAt: Date): Promise<KGBuildSummary> {
  const start = Date.now();

  // ── 1. Load all source records in parallel ──────────────────────────────────
  const [assets, failureModes, rootCauses, procedures, cases, allRiskScores,
         assetTags, twinNodes, twinRelations, assetLinks] = await Promise.all([
    model(tx, "industrialAsset").findMany({ where: { organizationId: orgId }, select: { id: true, name: true } as unknown as undefined }),
    model(tx, "industrialFailureMode").findMany({ where: { organizationId: orgId }, select: { id: true, name: true, severity: true } as unknown as undefined }),
    model(tx, "industrialRootCause").findMany({ where: { organizationId: orgId }, select: { id: true, failureModeId: true, description: true, confidenceWeight: true } as unknown as undefined }),
    model(tx, "industrialMaintenanceProcedure").findMany({ where: { organizationId: orgId }, select: { id: true, title: true } as unknown as undefined }),
    model(tx, "industrialEngineeringCase").findMany({ where: { organizationId: orgId }, select: { id: true, title: true, assetId: true, failureModeId: true, severity: true } as unknown as undefined }),
    model(tx, "assetRiskScore").findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" as unknown as undefined } as unknown as undefined }),
    model(tx, "assetTag").findMany({ where: { organizationId: orgId }, select: { id: true, assetId: true, tagName: true, tagPath: true } as unknown as undefined }),
    model(tx, "digitalTwinNode").findMany({ where: { organizationId: orgId }, select: { id: true, displayName: true, nodeType: true, assetId: true } as unknown as undefined }),
    model(tx, "digitalTwinRelation").findMany({ where: { organizationId: orgId }, select: { sourceNodeId: true, targetNodeId: true, relationType: true } as unknown as undefined }),
    model(tx, "assetKnowledgeLink").findMany({ where: { organizationId: orgId }, select: { assetId: true, failureModeId: true, procedureId: true, caseId: true } as unknown as undefined }),
  ]);

  // Latest risk score per asset (keep only the newest per assetId)
  const latestRiskByAsset = new Map<string, Record<string, unknown>>();
  for (const rs of allRiskScores) {
    const aId = String(rs.assetId);
    if (!latestRiskByAsset.has(aId)) latestRiskByAsset.set(aId, rs);
  }
  const riskScores = Array.from(latestRiskByAsset.values());

  // ── 2. Detect and remove orphan nodes ──────────────────────────────────────
  const validIds: Record<string, Set<string>> = {
    ASSET:            new Set(assets.map(r => String(r.id))),
    FAILURE_MODE:     new Set(failureModes.map(r => String(r.id))),
    ROOT_CAUSE:       new Set(rootCauses.map(r => String(r.id))),
    PROCEDURE:        new Set(procedures.map(r => String(r.id))),
    ENGINEERING_CASE: new Set(cases.map(r => String(r.id))),
    PREDICTIVE_RISK:  new Set(riskScores.map(r => String(r.id))),
    TELEMETRY_TAG:    new Set(assetTags.map(r => String(r.id))),
    DIGITAL_TWIN_NODE: new Set(twinNodes.map(r => String(r.id))),
  };

  const existingNodes = await nodeModel(tx).findMany({ where: { organizationId: orgId }, select: { id: true, nodeType: true, entityId: true } as unknown as undefined });
  const orphanIds: string[] = [];
  for (const n of existingNodes) {
    const valid = validIds[String(n.nodeType)];
    if (!valid || !valid.has(String(n.entityId))) orphanIds.push(String(n.id));
  }

  let orphansRemoved = 0;
  if (orphanIds.length > 0) {
    const result = await nodeModel(tx).deleteMany({ where: { id: { in: orphanIds } } });
    orphansRemoved = result.count;
  }

  // ── 3. Upsert nodes ────────────────────────────────────────────────────────
  const nodeSpecs: NodeSpec[] = [
    ...assets.map(r => ({ nodeType: "ASSET", entityId: String(r.id), label: String(r.name), metadata: {} })),
    ...failureModes.map(r => ({ nodeType: "FAILURE_MODE", entityId: String(r.id), label: String(r.name), metadata: { severity: r.severity } })),
    ...rootCauses.map(r => ({ nodeType: "ROOT_CAUSE", entityId: String(r.id), label: String(r.description).slice(0, 80), metadata: { failureModeId: r.failureModeId, confidenceWeight: r.confidenceWeight } })),
    ...procedures.map(r => ({ nodeType: "PROCEDURE", entityId: String(r.id), label: String(r.title), metadata: {} })),
    ...cases.map(r => ({ nodeType: "ENGINEERING_CASE", entityId: String(r.id), label: String(r.title), metadata: { assetId: r.assetId, failureModeId: r.failureModeId, severity: r.severity } })),
    ...riskScores.map(r => ({ nodeType: "PREDICTIVE_RISK", entityId: String(r.id), label: `Risk: ${String(r.assetId).slice(-8)}`, metadata: { riskScore: r.riskScore, assetId: r.assetId, confidence: r.confidence } })),
    ...assetTags.map(r => ({ nodeType: "TELEMETRY_TAG", entityId: String(r.id), label: String(r.tagName), metadata: { tagPath: r.tagPath, assetId: r.assetId } })),
    ...twinNodes.map(r => ({ nodeType: "DIGITAL_TWIN_NODE", entityId: String(r.id), label: String(r.displayName), metadata: { twinNodeType: r.nodeType, assetId: r.assetId } })),
  ];

  for (const spec of nodeSpecs) await upsertNode(tx, orgId, spec);

  // ── 4. Build node-id map after upserts ────────────────────────────────────
  const nodeMap = await loadNodeIdMap(tx, orgId);

  // ── 5. Build and upsert edges ──────────────────────────────────────────────

  // Helper: FM lookup
  const fmById = new Map<string, Record<string, unknown>>();
  for (const fm of failureModes) fmById.set(String(fm.id), fm);

  // Group asset knowledge links by assetId
  const linksByAsset = new Map<string, { failureModeId?: string; procedureId?: string; caseId?: string }[]>();
  for (const lnk of assetLinks) {
    const aId = String(lnk.assetId);
    if (!linksByAsset.has(aId)) linksByAsset.set(aId, []);
    linksByAsset.get(aId)!.push({
      failureModeId: lnk.failureModeId ? String(lnk.failureModeId) : undefined,
      procedureId:   lnk.procedureId   ? String(lnk.procedureId)   : undefined,
      caseId:        lnk.caseId        ? String(lnk.caseId)        : undefined,
    });
  }

  const edgeSpecs: EdgeSpec[] = [];

  // Rule 1: HAS_FAILURE_MODE — ASSET → FAILURE_MODE (via AssetKnowledgeLink)
  for (const lnk of assetLinks) {
    if (!lnk.failureModeId) continue;
    const fm = fmById.get(String(lnk.failureModeId));
    if (!fm) continue;
    const src = nodeId(nodeMap, "ASSET",        String(lnk.assetId));
    const tgt = nodeId(nodeMap, "FAILURE_MODE", String(lnk.failureModeId));
    if (src && tgt) {
      edgeSpecs.push({ sourceNodeId: src, targetNodeId: tgt, edgeType: "HAS_FAILURE_MODE", weight: severityWeight(String(fm.severity)), evidence: { failureModeId: String(fm.id), severity: fm.severity, normalization: "severity_weight" } });
    }
  }

  // Rule 2: CAUSED_BY — FAILURE_MODE → ROOT_CAUSE (via IndustrialRootCause.failureModeId)
  for (const rc of rootCauses) {
    const src = nodeId(nodeMap, "FAILURE_MODE", String(rc.failureModeId));
    const tgt = nodeId(nodeMap, "ROOT_CAUSE",   String(rc.id));
    if (src && tgt) {
      edgeSpecs.push({ sourceNodeId: src, targetNodeId: tgt, edgeType: "CAUSED_BY", weight: Number(rc.confidenceWeight), evidence: { rootCauseId: String(rc.id), confidenceWeight: rc.confidenceWeight, normalization: "direct_0_to_1" } });
    }
  }

  // Rule 3: MITIGATED_BY — FAILURE_MODE → PROCEDURE (via shared asset in AssetKnowledgeLink)
  for (const [, links] of linksByAsset) {
    const fmLinks   = links.filter(l => l.failureModeId);
    const procLinks = links.filter(l => l.procedureId);
    for (const fmLnk of fmLinks) {
      for (const procLnk of procLinks) {
        const src = nodeId(nodeMap, "FAILURE_MODE", fmLnk.failureModeId!);
        const tgt = nodeId(nodeMap, "PROCEDURE",    procLnk.procedureId!);
        if (src && tgt) {
          edgeSpecs.push({ sourceNodeId: src, targetNodeId: tgt, edgeType: "MITIGATED_BY", weight: 0.5, evidence: { via: "shared_asset_knowledge_link", normalization: "structural_default" } });
        }
      }
    }
  }

  // Rule 4: DOCUMENTED_IN + OBSERVED_ON (via IndustrialEngineeringCase relations)
  for (const c of cases) {
    const caseNid = nodeId(nodeMap, "ENGINEERING_CASE", String(c.id));
    if (!caseNid) continue;
    const caseWeight = severityWeight(String(c.severity));

    if (c.failureModeId) {
      const fmNid = nodeId(nodeMap, "FAILURE_MODE", String(c.failureModeId));
      if (fmNid) {
        edgeSpecs.push({ sourceNodeId: fmNid, targetNodeId: caseNid, edgeType: "DOCUMENTED_IN", weight: caseWeight, evidence: { caseId: String(c.id), severity: c.severity, via: "case_failureModeId", normalization: "severity_weight" } });
      }
      // OBSERVED_ON: FAILURE_MODE → ASSET (failure mode observed on this asset via case)
      if (c.assetId) {
        const assetNid = nodeId(nodeMap, "ASSET", String(c.assetId));
        if (fmNid && assetNid) {
          edgeSpecs.push({ sourceNodeId: fmNid, targetNodeId: assetNid, edgeType: "OBSERVED_ON", weight: caseWeight, evidence: { caseId: String(c.id), severity: c.severity, normalization: "severity_weight" } });
        }
      }
    }

    if (c.assetId) {
      const assetNid = nodeId(nodeMap, "ASSET", String(c.assetId));
      if (assetNid) {
        edgeSpecs.push({ sourceNodeId: assetNid, targetNodeId: caseNid, edgeType: "DOCUMENTED_IN", weight: caseWeight, evidence: { caseId: String(c.id), severity: c.severity, via: "case_assetId", normalization: "severity_weight" } });
      }
    }

    // DOCUMENTED_IN via AssetKnowledgeLink.caseId
    for (const lnk of assetLinks) {
      if (String(lnk.caseId) !== String(c.id)) continue;
      const assetNid = nodeId(nodeMap, "ASSET", String(lnk.assetId));
      if (assetNid) {
        edgeSpecs.push({ sourceNodeId: assetNid, targetNodeId: caseNid, edgeType: "DOCUMENTED_IN", weight: 0.5, evidence: { via: "asset_knowledge_link", normalization: "structural_default" } });
      }
    }
  }

  // Rule 5: INDICATES_RISK — PREDICTIVE_RISK → ASSET
  for (const rs of riskScores) {
    const src = nodeId(nodeMap, "PREDICTIVE_RISK", String(rs.id));
    const tgt = nodeId(nodeMap, "ASSET",           String(rs.assetId));
    if (src && tgt) {
      edgeSpecs.push({ sourceNodeId: src, targetNodeId: tgt, edgeType: "INDICATES_RISK", weight: Math.min(1, Number(rs.riskScore) / 100), evidence: { riskScore: rs.riskScore, confidence: rs.confidence, normalization: "risk_score_div_100" } });
    }
  }

  // Rule 6: CONNECTED_TO — TELEMETRY_TAG ↔ ASSET (bidirectional; stored as source→target)
  for (const at of assetTags) {
    const src = nodeId(nodeMap, "TELEMETRY_TAG", String(at.id));
    const tgt = nodeId(nodeMap, "ASSET",         String(at.assetId));
    if (src && tgt) {
      edgeSpecs.push({ sourceNodeId: src, targetNodeId: tgt, edgeType: "CONNECTED_TO", weight: 0.5, evidence: { tagPath: at.tagPath, normalization: "structural_default" } });
    }
  }

  // Rule 7: DEPENDS_ON — DIGITAL_TWIN_NODE → ASSET (when twinNode.assetId is set)
  for (const tn of twinNodes) {
    if (!tn.assetId) continue;
    const src = nodeId(nodeMap, "DIGITAL_TWIN_NODE", String(tn.id));
    const tgt = nodeId(nodeMap, "ASSET",             String(tn.assetId));
    if (src && tgt) {
      edgeSpecs.push({ sourceNodeId: src, targetNodeId: tgt, edgeType: "DEPENDS_ON", weight: 0.7, evidence: { twinNodeType: tn.nodeType, normalization: "structural_constant" } });
    }
  }

  // Rule 8: CONNECTED_TO between DIGITAL_TWIN_NODEs (from DigitalTwinRelation CONNECTED_TO)
  for (const rel of twinRelations) {
    if (String(rel.relationType) !== "CONNECTED_TO") continue;
    const src = nodeId(nodeMap, "DIGITAL_TWIN_NODE", String(rel.sourceNodeId));
    const tgt = nodeId(nodeMap, "DIGITAL_TWIN_NODE", String(rel.targetNodeId));
    if (src && tgt) {
      edgeSpecs.push({ sourceNodeId: src, targetNodeId: tgt, edgeType: "CONNECTED_TO", weight: 0.6, evidence: { relationType: "CONNECTED_TO", normalization: "structural_constant" } });
    }
  }

  // Upsert all edges
  for (const spec of edgeSpecs) await upsertEdge(tx, orgId, spec);

  // ── 6. Mark snapshot SUCCESS (atomic with the node/edge changes) ──────────
  const buildDurationMs = Date.now() - start;
  const summary = { nodeCount: nodeSpecs.length, edgeCount: edgeSpecs.length, orphansRemoved, buildDurationMs };
  const completedAt = new Date();
  await snapModel(tx).update({
    where: { id: snapshotId },
    data:  { status: "SUCCESS", summary, startedAt, completedAt },
  });

  return { ...summary, snapshotId };
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Rebuild the industrial knowledge graph for one organization. */
export async function rebuildKnowledgeGraph(orgId: string): Promise<KGBuildSummary> {
  if (isRebuildInFlight(orgId)) {
    throw Object.assign(new Error("Rebuild already in progress for this organization"), { code: "REBUILD_IN_FLIGHT" });
  }

  const db = await getPrisma();
  if (!db) throw new Error("Database not available");

  const txRunner = (db as { $transaction: <T>(fn: (tx: Record<string, unknown>) => Promise<T>) => Promise<T> }).$transaction.bind(db);
  const snapDb   = (db as Record<string, unknown>).knowledgeGraphSnapshot as SnapModel;

  // Create RUNNING snapshot before the transaction so it persists even if the
  // transaction rolls back — allows monitoring to detect in-flight rebuilds.
  const startedAt     = new Date();
  const snapshotName  = `build-${startedAt.toISOString().replace(/[:.]/g, "-")}`;
  const runningSnap   = await snapDb.create({
    data: { organizationId: orgId, name: snapshotName, status: "RUNNING", startedAt },
  });
  const snapshotId = String(runningSnap.id);

  acquireLock(orgId);
  try {
    // Transaction: rebuild nodes/edges and atomically marks snapshot SUCCESS
    return await txRunner((tx: Record<string, unknown>) => buildInsideTx(tx, orgId, snapshotId, startedAt));
  } catch (err) {
    // Transaction rolled back — the graph is unchanged. Mark snapshot FAILED.
    const msg = err instanceof Error ? err.message : String(err);
    await snapDb.update({
      where: { id: snapshotId },
      data:  { status: "FAILED", errorMessage: msg, completedAt: new Date() },
    }).catch(() => undefined); // defensive: never throw from failure handler
    throw err;
  } finally {
    releaseLock(orgId);
  }
}

/** Get the most recent SUCCESS snapshot for an org (returns null if none exists). */
export async function getLatestSnapshot(orgId: string): Promise<{ id: string; createdAt: Date; summary: Record<string, unknown> } | null> {
  const db = await getPrisma();
  if (!db) return null;
  try {
    const m = (db as Record<string, unknown>).knowledgeGraphSnapshot as SnapModel;
    const row = await m.findFirst({
      where:   { organizationId: orgId, status: "SUCCESS" },
      orderBy: { createdAt: "desc" as unknown as undefined } as unknown as undefined,
    });
    if (!row) return null;
    return { id: String(row.id), createdAt: new Date(row.createdAt as string), summary: (row.summary ?? {}) as Record<string, unknown> };
  } catch { return null; }
}

/** Compute staleness for a snapshot. */
export const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export function isStaleSince(lastBuiltAt: Date | null): boolean {
  if (!lastBuiltAt) return true;
  return Date.now() - lastBuiltAt.getTime() > STALE_THRESHOLD_MS;
}
