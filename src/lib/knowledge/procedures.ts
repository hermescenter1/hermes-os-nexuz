/**
 * IndustrialMaintenanceProcedure CRUD + getRecommendedProcedures() — Phase 40.
 *
 * Safety-bearing procedure updates: every PATCH increments version AND writes
 * an audit record with { previousVersion, nextVersion, changedFields, changedBy }.
 *
 * getRecommendedProcedures() — deterministic scoring formula:
 *   +30  if procedure is linked (via AssetKnowledgeLink) to a matched failure mode
 *   +25  if FailureIndicator.probability is HIGH (Phase 39)
 *   +20  if MaintenanceRecommendation.priority is HIGH (Phase 39 PM)
 *   +15  if procedure.categoryId matches any failure mode's categoryId
 *   +10  if procedure.assetTypes includes this asset's type
 *   Sort: score DESC → updatedAt DESC → id ASC
 */

import { getPrisma }         from "@/lib/db/prisma";
import { normalizeText }     from "./normalize";
import { confidenceFromWeight, KNOWLEDGE_ENGINE_VERSION } from "./types";
import {
  PROC_SCORE_FAILURE_MATCH,
  PROC_SCORE_HIGH_PROBABILITY,
  PROC_SCORE_HIGH_PRIORITY_PM,
  PROC_SCORE_CATEGORY_MATCH,
  PROC_SCORE_ASSET_TYPE_MATCH,
} from "./types";
import { recordAuditEvent, KNOWLEDGE_AUDIT } from "@/lib/audit/audit-service";
import type { ProcedureRecord, ProcedureRecommendation, KnowledgeEvidence } from "./types";
import { _rowToProc } from "./failures";

type ProcModel = {
  create:   (a: unknown) => Promise<Record<string, unknown>>;
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst:(a: unknown) => Promise<Record<string, unknown> | null>;
  update:   (a: unknown) => Promise<Record<string, unknown>>;
};

export async function listProcedures(
  organizationId: string,
  status?:        string,
  limit           = 50,
): Promise<ProcedureRecord[]> {
  const db = await getPrisma();
  if (!db) return [];
  const m = (db as Record<string, unknown>).industrialMaintenanceProcedure as ProcModel;
  try {
    const where: Record<string, unknown> = { organizationId };
    if (status) where.status = status;
    const rows = await m.findMany({ where, orderBy: { updatedAt: "desc" }, take: limit });
    return rows.map(_rowToProc);
  } catch { return []; }
}

export async function getProcedure(
  organizationId: string,
  id:             string,
): Promise<ProcedureRecord | null> {
  const db = await getPrisma();
  if (!db) return null;
  const m = (db as Record<string, unknown>).industrialMaintenanceProcedure as ProcModel;
  try {
    const row = await m.findFirst({ where: { id, organizationId } });
    return row ? _rowToProc(row) : null;
  } catch { return null; }
}

export async function createProcedure(
  organizationId: string,
  input: {
    title:          string;
    description:    string;
    steps?:         ProcedureRecord["steps"];
    assetTypes?:    string[];
    estimatedHours?: number;
    requiredRoles?: string[];
    safetyNotes?:   string;
    sourceType?:    string;
    categoryId?:    string;
    status?:        string;
    authorId?:      string;
  },
): Promise<ProcedureRecord | null> {
  const db = await getPrisma();
  if (!db) return null;
  const m = (db as Record<string, unknown>).industrialMaintenanceProcedure as ProcModel;
  try {
    const row = await m.create({
      data: {
        organizationId,
        title:          input.title,
        titleNorm:      normalizeText(input.title),
        description:    input.description,
        steps:          input.steps          ?? [],
        assetTypes:     input.assetTypes     ?? [],
        estimatedHours: input.estimatedHours ?? null,
        requiredRoles:  input.requiredRoles  ?? [],
        safetyNotes:    input.safetyNotes    ?? null,
        sourceType:     input.sourceType     ?? "MANUAL",
        categoryId:     input.categoryId     ?? null,
        status:         input.status         ?? "draft",
        version:        1,
      },
    });
    return _rowToProc(row);
  } catch { return null; }
}

/**
 * Update a maintenance procedure (safety-bearing).
 * Increments version + writes audit diff with changedFields.
 */
export async function updateProcedure(
  organizationId: string,
  id:             string,
  input:          Partial<Omit<ProcedureRecord, "id" | "organizationId" | "createdAt" | "updatedAt" | "version" | "titleNorm">>,
  changedBy:      string,
): Promise<ProcedureRecord | null> {
  const db = await getPrisma();
  if (!db) return null;
  const m = (db as Record<string, unknown>).industrialMaintenanceProcedure as ProcModel;
  try {
    const current = await m.findFirst({ where: { id, organizationId } });
    if (!current) return null;

    const prevVersion  = current.version as number;
    const nextVersion  = prevVersion + 1;
    const changedFields = Object.keys(input).filter((k) => (input as Record<string, unknown>)[k] !== undefined);

    const data: Record<string, unknown> = { ...input, version: nextVersion };
    if (input.title) data.titleNorm = normalizeText(input.title as string);

    const row = await m.update({ where: { id }, data });

    // Audit diff — mandatory for safety-bearing procedures
    recordAuditEvent({
      action:     KNOWLEDGE_AUDIT.PROCEDURE_UPDATED,
      entityType: "procedure",
      entityId:   id,
      metadata: {
        organizationId,
        previousVersion: prevVersion,
        nextVersion,
        changedFields,
        changedBy,
        engineVersion: KNOWLEDGE_ENGINE_VERSION,
      },
    });

    return _rowToProc(row);
  } catch { return null; }
}

/**
 * getRecommendedProcedures — deterministic procedure recommendation.
 * Uses Phase 39 outputs (read-only) + AssetKnowledgeLink failure mode connections.
 */
export async function getRecommendedProcedures(
  organizationId: string,
  assetId:        string,
  assetType?:     string,
): Promise<ProcedureRecommendation[]> {
  const db = await getPrisma();
  if (!db) return [];
  const d = db as unknown as Record<string, unknown>;

  try {
    // Phase 39: most recent FailureIndicator and high-priority PM recs
    type FIModel  = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };
    type PMRModel = { findMany:  (a: unknown) => Promise<Record<string, unknown>[]> };
    const [fiRow, pmRecs] = await Promise.all([
      (d.failureIndicator as unknown as FIModel).findFirst({
        where: { organizationId, assetId }, orderBy: { createdAt: "desc" },
      }),
      (d.maintenanceRecommendation as unknown as PMRModel).findMany({
        where:   { organizationId, assetId, dismissed: false },
        orderBy: { createdAt: "desc" },
        take:    10,
      }),
    ]);

    const highPMPriority = pmRecs.some((r) => r.priority === "HIGH");
    const highProbability = fiRow && (fiRow.probability === "HIGH" || fiRow.probability === "MEDIUM");

    // Find failure modes linked to this asset
    type LinkModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
    const linkRows = await (d.assetKnowledgeLink as unknown as LinkModel).findMany({
      where:   { organizationId, assetId, failureModeId: { not: null } },
      orderBy: { createdAt: "desc" },
      take:    20,
    });
    const linkedFMIds = [...new Set(linkRows.map((r) => r.failureModeId as string).filter(Boolean))];

    // Load all procedures + failure modes
    type ProcModel2 = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
    type FMModel    = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
    const [procRows, fmRows] = await Promise.all([
      (d.industrialMaintenanceProcedure as ProcModel2).findMany({
        where:   { organizationId },
        orderBy: { updatedAt: "desc" },
        take:    200,
      }),
      linkedFMIds.length > 0
        ? (d.industrialFailureMode as FMModel).findMany({
            where:   { organizationId, id: { in: linkedFMIds } },
            take:    20,
          })
        : Promise.resolve([]),
    ]);

    const linkedFMCatIds = new Set(
      fmRows.map((r) => r.categoryId as string | null).filter(Boolean) as string[]
    );

    const recommendations: ProcedureRecommendation[] = [];

    for (const r of procRows) {
      const proc = _rowToProc(r);
      let score = 0;
      const reason: string[] = [];

      // Check if this procedure is linked to a matched failure mode via AssetKnowledgeLink
      const procLinkRows = await (d.assetKnowledgeLink as unknown as LinkModel).findMany({
        where: { organizationId, procedureId: proc.id, failureModeId: { in: linkedFMIds.length > 0 ? linkedFMIds : ["__none__"] } },
        take:  1,
      }).catch(() => []);

      if (procLinkRows.length > 0) {
        score += PROC_SCORE_FAILURE_MATCH;
        reason.push("linked to matched failure mode");
      }
      if (highProbability) {
        score += PROC_SCORE_HIGH_PROBABILITY;
        reason.push("high failure probability (Phase 39)");
      }
      if (highPMPriority) {
        score += PROC_SCORE_HIGH_PRIORITY_PM;
        reason.push("high-priority PM recommendation (Phase 39)");
      }
      if (proc.categoryId && linkedFMCatIds.has(proc.categoryId)) {
        score += PROC_SCORE_CATEGORY_MATCH;
        reason.push("category matches linked failure mode");
      }
      if (assetType && proc.assetTypes.includes(assetType)) {
        score += PROC_SCORE_ASSET_TYPE_MATCH;
        reason.push(`asset type match (${assetType})`);
      }

      if (score === 0) continue;

      const evidence: KnowledgeEvidence[] = [
        { type: "procedure", recordId: proc.id, assetId, description: `Procedure: ${proc.title} v${proc.version}` },
        ...(fiRow ? [{ type: "predictive" as const, recordId: fiRow.id as string, assetId, description: `Failure indicator: ${fiRow.probability}` }] : []),
      ];

      recommendations.push({
        procedure:  proc,
        score,
        reason,
        confidence: confidenceFromWeight(Math.min(score / 100, 1)),
        evidence,
      });
    }

    // Sort: score DESC → updatedAt DESC → id ASC
    recommendations.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.procedure.updatedAt !== a.procedure.updatedAt)
        return b.procedure.updatedAt.localeCompare(a.procedure.updatedAt);
      return a.procedure.id.localeCompare(b.procedure.id);
    });

    return recommendations.slice(0, 10);
  } catch { return []; }
}
