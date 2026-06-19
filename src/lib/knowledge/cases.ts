/**
 * IndustrialEngineeringCase CRUD + search + getRelatedCases() — Phase 40.
 *
 * getRelatedCases() uses the same deterministic normalization pipeline as
 * searchKnowledge() — no separate similarity logic, no AI.
 */

import { getPrisma }                  from "@/lib/db/prisma";
import { normalizeText, tokenize }    from "./normalize";
import { KNOWLEDGE_ENGINE_VERSION }   from "./types";
import { recordAuditEvent, KNOWLEDGE_AUDIT } from "@/lib/audit/audit-service";
import type { CaseRecord } from "./types";
import { _rowToCase } from "./failures";

type CaseModel = {
  create:   (a: unknown) => Promise<Record<string, unknown>>;
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst:(a: unknown) => Promise<Record<string, unknown> | null>;
  update:   (a: unknown) => Promise<Record<string, unknown>>;
};

async function caseModel(): Promise<CaseModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).industrialEngineeringCase as CaseModel) : null;
}

export async function listCases(
  organizationId: string,
  status?:        string,
  assetId?:       string,
  limit           = 50,
): Promise<CaseRecord[]> {
  const m = await caseModel();
  if (!m) return [];
  try {
    const where: Record<string, unknown> = { organizationId };
    if (status)  where.status  = status;
    if (assetId) where.assetId = assetId;
    const rows = await m.findMany({ where, orderBy: { updatedAt: "desc" }, take: limit });
    return rows.map(_rowToCase);
  } catch { return []; }
}

export async function getCase(
  organizationId: string,
  id:             string,
): Promise<CaseRecord | null> {
  const m = await caseModel();
  if (!m) return null;
  try {
    const row = await m.findFirst({ where: { id, organizationId } });
    return row ? _rowToCase(row) : null;
  } catch { return null; }
}

export async function createCase(
  organizationId: string,
  input: {
    title:          string;
    symptoms?:      string[];
    diagnosis?:     string;
    resolution?:    string;
    lessonsLearned?: string;
    assetTypes?:    string[];
    assetId?:       string;
    siteId?:        string;
    failureModeId?: string;
    keywords?:      string[];
    status?:        string;
    severity?:      string;
    reportedById?:  string;
  },
  userId?: string,
): Promise<CaseRecord | null> {
  const m = await caseModel();
  if (!m) return null;
  try {
    const row = await m.create({
      data: {
        organizationId,
        title:          input.title,
        titleNorm:      normalizeText(input.title),
        symptoms:       input.symptoms       ?? [],
        diagnosis:      input.diagnosis      ?? null,
        resolution:     input.resolution     ?? null,
        lessonsLearned: input.lessonsLearned ?? null,
        assetTypes:     input.assetTypes     ?? [],
        assetId:        input.assetId        ?? null,
        siteId:         input.siteId         ?? null,
        failureModeId:  input.failureModeId  ?? null,
        keywords:       input.keywords       ?? [],
        status:         input.status         ?? "open",
        severity:       input.severity       ?? "MEDIUM",
        reportedById:   input.reportedById   ?? null,
      },
    });
    const created = _rowToCase(row);
    recordAuditEvent({
      action:     KNOWLEDGE_AUDIT.ENGINEERING_CASE_CREATED,
      entityType: "case",
      entityId:   created.id,
      userId,
      metadata:   { organizationId, title: created.title, engineVersion: KNOWLEDGE_ENGINE_VERSION },
    });
    return created;
  } catch { return null; }
}

export async function updateCase(
  organizationId: string,
  id:             string,
  input: Partial<Omit<CaseRecord, "id" | "organizationId" | "createdAt" | "updatedAt" | "titleNorm">>,
  userId?: string,
): Promise<CaseRecord | null> {
  const m = await caseModel();
  if (!m) return null;
  try {
    const data: Record<string, unknown> = { ...input };
    if (input.title) data.titleNorm = normalizeText(input.title as string);
    if (input.status === "resolved" && !input.resolvedAt) {
      data.resolvedAt = new Date();
    }
    const row = await m.update({ where: { id }, data });
    return _rowToCase(row);
  } catch { return null; }
}

/**
 * searchCases — deterministic normalized search within cases.
 * Uses same normalization pipeline as searchKnowledge().
 * Tie-breaker: updatedAt DESC, then id ASC.
 */
export async function searchCases(
  organizationId: string,
  query:          string,
  limit           = 20,
): Promise<CaseRecord[]> {
  const m = await caseModel();
  if (!m) return [];
  try {
    const all = await m.findMany({
      where:   { organizationId },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take:    500,
    });
    const normQuery = normalizeText(query);
    const tokens    = tokenize(normQuery);

    const scored = all.map((r) => {
      const c    = _rowToCase(r);
      let score  = 0;
      const tn   = c.titleNorm;
      const allText = normalizeText([c.title, c.symptoms.join(" "), c.keywords.join(" "), c.diagnosis ?? "", c.resolution ?? ""].join(" "));

      if (tn === normQuery)              score += 100;
      else if (tn.startsWith(normQuery)) score += 80;
      else if (tn.includes(normQuery))   score += 60;

      for (const t of tokens) {
        if (tn.includes(t))      score += 40;
        if (allText.includes(t)) score += 10;
      }

      return { case: c, score };
    });

    return scored
      .filter((x) => x.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.case.updatedAt !== a.case.updatedAt)
          return b.case.updatedAt.localeCompare(a.case.updatedAt);
        return a.case.id.localeCompare(b.case.id);
      })
      .slice(0, limit)
      .map((x) => x.case);
  } catch { return []; }
}

/**
 * getRelatedCases — find cases related to the given case by:
 *   1. Same assetId
 *   2. Same failureModeId
 *   3. Keyword overlap (normalized)
 * Uses deterministic search; same normalization pipeline. Tie-breaker: updatedAt DESC, id ASC.
 */
export async function getRelatedCases(
  organizationId: string,
  caseId:         string,
  limit           = 10,
): Promise<CaseRecord[]> {
  const m = await caseModel();
  if (!m) return [];
  try {
    const source = await m.findFirst({ where: { id: caseId, organizationId } });
    if (!source) return [];
    const src = _rowToCase(source);
    const srcTokens = tokenize(normalizeText([
      src.title, ...src.symptoms, ...src.keywords,
    ].join(" ")));

    const all = await m.findMany({
      where:   { organizationId, NOT: { id: caseId } },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take:    500,
    });

    const scored = all.map((r) => {
      const c = _rowToCase(r);
      let score = 0;

      if (src.assetId && c.assetId === src.assetId)             score += 40;
      if (src.failureModeId && c.failureModeId === src.failureModeId) score += 35;

      const cText = normalizeText([c.title, ...c.symptoms, ...c.keywords].join(" "));
      for (const t of srcTokens) {
        if (t.length > 2 && cText.includes(t)) score += 10;
      }

      return { case: c, score };
    });

    return scored
      .filter((x) => x.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.case.updatedAt !== a.case.updatedAt)
          return b.case.updatedAt.localeCompare(a.case.updatedAt);
        return a.case.id.localeCompare(b.case.id);
      })
      .slice(0, limit)
      .map((x) => x.case);
  } catch { return []; }
}
