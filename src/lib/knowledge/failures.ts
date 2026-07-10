/**
 * IndustrialFailureMode CRUD + failure knowledge retrieval — Phase 40.
 *
 * getFailureKnowledge() assembles matched failure modes, root causes,
 * applicable procedures, and related cases for a given asset context.
 * Every result carries linked evidence (real record IDs, traceable).
 */

import { getPrisma }             from "@/lib/db/prisma";
import { normalizeText, tokenize } from "./normalize";
import { confidenceFromWeight }  from "./types";
import type {
  FailureModeRecord, RootCauseRecord, ProcedureRecord, CaseRecord,
  FailureKnowledgeResult, KnowledgeEvidence,
} from "./types";

type FMModel = {
  create:     (a: unknown) => Promise<Record<string, unknown>>;
  findMany:   (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst:  (a: unknown) => Promise<Record<string, unknown> | null>;
  update:     (a: unknown) => Promise<Record<string, unknown>>;
  updateMany: (a: unknown) => Promise<{ count: number }>;
};
type RCModel  = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
type ProcModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
type CaseModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

function rowToFM(r: Record<string, unknown>): FailureModeRecord {
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    categoryId:     (r.categoryId    ?? null) as string | null,
    name:           r.name           as string,
    nameNorm:       r.nameNorm       as string,
    description:    r.description    as string,
    severity:       r.severity       as FailureModeRecord["severity"],
    symptoms:       (r.symptoms      as string[]) ?? [],
    assetTypes:     (r.assetTypes    as string[]) ?? [],
    keywords:       (r.keywords      as string[]) ?? [],
    sourceType:     r.sourceType     as FailureModeRecord["sourceType"],
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
}

function rowToRC(r: Record<string, unknown>): RootCauseRecord {
  const w = (r.confidenceWeight as number) ?? 0.5;
  return {
    id:                 r.id                 as string,
    organizationId:     r.organizationId     as string,
    failureModeId:      r.failureModeId      as string,
    description:        r.description        as string,
    confidenceWeight:   w,
    confidence:         confidenceFromWeight(w),
    supportingEvidence: (r.supportingEvidence as string[]) ?? [],
    sourceType:         r.sourceType         as RootCauseRecord["sourceType"],
    createdAt:          new Date(r.createdAt as string).toISOString(),
    updatedAt:          new Date(r.updatedAt as string).toISOString(),
  };
}

function rowToProc(r: Record<string, unknown>): ProcedureRecord {
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    categoryId:     (r.categoryId    ?? null) as string | null,
    title:          r.title          as string,
    titleNorm:      r.titleNorm      as string,
    description:    r.description    as string,
    steps:          (r.steps         as ProcedureRecord["steps"]) ?? [],
    assetTypes:     (r.assetTypes    as string[]) ?? [],
    estimatedHours: (r.estimatedHours ?? null) as number | null,
    requiredRoles:  (r.requiredRoles  as string[]) ?? [],
    safetyNotes:    (r.safetyNotes    ?? null) as string | null,
    sourceType:     r.sourceType     as ProcedureRecord["sourceType"],
    version:        r.version        as number,
    status:         r.status         as string,
    approvedById:   (r.approvedById  ?? null) as string | null,
    approvedAt:     (r.approvedAt    != null ? new Date(r.approvedAt as string).toISOString() : null),
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
}

function rowToCase(r: Record<string, unknown>): CaseRecord {
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    title:          r.title          as string,
    titleNorm:      r.titleNorm      as string,
    symptoms:       (r.symptoms      as string[]) ?? [],
    diagnosis:      (r.diagnosis     ?? null) as string | null,
    resolution:     (r.resolution    ?? null) as string | null,
    lessonsLearned: (r.lessonsLearned ?? null) as string | null,
    assetTypes:     (r.assetTypes    as string[]) ?? [],
    assetId:        (r.assetId       ?? null) as string | null,
    siteId:         (r.siteId        ?? null) as string | null,
    failureModeId:  (r.failureModeId ?? null) as string | null,
    keywords:       (r.keywords      as string[]) ?? [],
    status:         r.status         as string,
    severity:       r.severity       as CaseRecord["severity"],
    reportedById:   (r.reportedById  ?? null) as string | null,
    resolvedAt:     (r.resolvedAt    != null ? new Date(r.resolvedAt as string).toISOString() : null),
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
}

async function fmModel(): Promise<FMModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).industrialFailureMode as FMModel) : null;
}

export async function listFailureModes(
  organizationId: string,
  limit = 100,
): Promise<FailureModeRecord[]> {
  const m = await fmModel();
  if (!m) return [];
  try {
    const rows = await m.findMany({
      where:   { organizationId },
      orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
      take:    limit,
    });
    return rows.map(rowToFM);
  } catch { return []; }
}

export async function getFailureMode(
  organizationId: string,
  id:             string,
): Promise<FailureModeRecord | null> {
  const m = await fmModel();
  if (!m) return null;
  try {
    const row = await m.findFirst({ where: { id, organizationId } });
    return row ? rowToFM(row) : null;
  } catch { return null; }
}

export async function createFailureMode(
  organizationId: string,
  input: {
    name:        string;
    description: string;
    severity?:   string;
    symptoms?:   string[];
    assetTypes?: string[];
    keywords?:   string[];
    sourceType?: string;
    categoryId?: string;
  },
): Promise<FailureModeRecord | null> {
  const m = await fmModel();
  if (!m) return null;
  try {
    const row = await m.create({
      data: {
        organizationId,
        name:        input.name,
        nameNorm:    normalizeText(input.name),
        description: input.description,
        severity:    input.severity   ?? "MEDIUM",
        symptoms:    input.symptoms   ?? [],
        assetTypes:  input.assetTypes ?? [],
        keywords:    input.keywords   ?? [],
        sourceType:  input.sourceType ?? "MANUAL",
        categoryId:  input.categoryId ?? null,
      },
    });
    return rowToFM(row);
  } catch { return null; }
}

/** Fields a client may mutate through PATCH. Server-owned columns
 *  (id, organizationId, nameNorm, createdAt, updatedAt) are excluded —
 *  never spread a raw request body into Prisma. */
const FAILURE_MODE_MUTABLE_FIELDS = [
  "name", "description", "severity", "symptoms", "assetTypes", "keywords",
  "sourceType", "categoryId",
] as const;

export async function updateFailureMode(
  organizationId: string,
  id:             string,
  input: Partial<Pick<FailureModeRecord, "name" | "description" | "severity" | "symptoms" | "assetTypes" | "keywords" | "sourceType" | "categoryId">>,
): Promise<FailureModeRecord | null> {
  const m = await fmModel();
  if (!m) return null;
  try {
    const src = input as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    for (const k of FAILURE_MODE_MUTABLE_FIELDS) {
      if (src[k] !== undefined) data[k] = src[k];
    }
    if (typeof data.name === "string" && data.name) {
      data.nameNorm = normalizeText(data.name);
    }
    // Tenant-scoped write: a failure mode owned by another org cannot be
    // mutated even if its id is known (Phase 82E.0 — cross-tenant IDOR write).
    const res = await m.updateMany({ where: { id, organizationId }, data });
    if (!res || res.count === 0) return null;
    const row = await m.findFirst({ where: { id, organizationId } });
    return row ? rowToFM(row) : null;
  } catch { return null; }
}

/**
 * getFailureKnowledge — assemble full knowledge context for an asset.
 *
 * Matches failure modes by assetType; loads their root causes, linked procedures
 * and related cases. Every result carries evidence with real record IDs.
 */
export async function getFailureKnowledge(
  organizationId: string,
  assetId:        string,
  assetType?:     string,
  symptoms?:      string[],
): Promise<FailureKnowledgeResult> {
  const empty: FailureKnowledgeResult = {
    assetId, failureModes: [], rootCauses: [], procedures: [], relatedCases: [], evidence: [],
  };

  const db = await getPrisma();
  if (!db) return empty;
  const d = db as unknown as Record<string, unknown>;

  try {
    // 1. All failure modes for this org
    const fmRows = await (d.industrialFailureMode as FMModel).findMany({
      where:   { organizationId },
      orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
      take:    200,
    });
    const allFMs = fmRows.map(rowToFM);

    // 2. Filter: match by assetType, or by symptom overlap if symptoms provided
    const normSymptoms = (symptoms ?? []).map(normalizeText);
    let matchedFMs = allFMs.filter((fm) => {
      if (assetType && fm.assetTypes.length > 0 && !fm.assetTypes.includes(assetType)) return false;
      return true;
    });

    if (normSymptoms.length > 0) {
      matchedFMs = matchedFMs.filter((fm) => {
        const fmSympNorm = fm.symptoms.map(normalizeText);
        return normSymptoms.some((s) => fmSympNorm.some((fs) => fs.includes(s) || s.includes(fs)));
      });
    }

    matchedFMs = matchedFMs.slice(0, 20);

    // 3. Root causes for matched failure modes
    const fmIds = matchedFMs.map((fm) => fm.id);
    let rootCauses: RootCauseRecord[] = [];
    if (fmIds.length > 0) {
      const rcRows = await (d.industrialRootCause as RCModel).findMany({
        where:   { organizationId, failureModeId: { in: fmIds } },
        orderBy: { confidenceWeight: "desc" },
        take:    50,
      });
      rootCauses = rcRows.map(rowToRC);
    }

    // 4. Procedures linked to matched failure modes (via AssetKnowledgeLink)
    let procedures: ProcedureRecord[] = [];
    if (fmIds.length > 0) {
      const linkRows = await (d.assetKnowledgeLink as unknown as { findMany: (a: unknown) => Promise<Record<string, unknown>[]> }).findMany({
        where:   { organizationId, failureModeId: { in: fmIds }, procedureId: { not: null } },
        orderBy: { createdAt: "desc" },
        take:    20,
      });
      const procIds = [...new Set(linkRows.map((r) => r.procedureId as string).filter(Boolean))];
      if (procIds.length > 0) {
        const procRows = await (d.industrialMaintenanceProcedure as ProcModel).findMany({
          where:   { organizationId, id: { in: procIds } },
          orderBy: { updatedAt: "desc" },
        });
        procedures = procRows.map(rowToProc);
      }
    }

    // 5. Cases referencing these failure modes
    let relatedCases: CaseRecord[] = [];
    if (fmIds.length > 0) {
      const caseRows = await (d.industrialEngineeringCase as CaseModel).findMany({
        where:   { organizationId, failureModeId: { in: fmIds } },
        orderBy: { updatedAt: "desc" },
        take:    20,
      });
      relatedCases = caseRows.map(rowToCase);
    }

    // 6. Build evidence list
    const evidence: KnowledgeEvidence[] = [
      ...matchedFMs.map((fm): KnowledgeEvidence => ({
        type: "failureMode", recordId: fm.id, assetId,
        description: `Matched failure mode: ${fm.name} (${fm.severity})`,
        sourceType: fm.sourceType,
      })),
      ...rootCauses.map((rc): KnowledgeEvidence => ({
        type: "failureMode", recordId: rc.id, assetId,
        description: `Root cause: ${rc.description} (confidence ${rc.confidence})`,
        sourceType: rc.sourceType,
      })),
    ];

    return { assetId, failureModes: matchedFMs, rootCauses, procedures, relatedCases, evidence };
  } catch { return empty; }
}

export { rowToFM as _rowToFM, rowToRC as _rowToRC, rowToProc as _rowToProc, rowToCase as _rowToCase };
