/**
 * IndustrialEngineeringCase CRUD + search + getRelatedCases() — Phase 40.
 *
 * getRelatedCases() uses the same deterministic normalization pipeline as
 * searchKnowledge() — no separate similarity logic, no AI.
 *
 * RV-01: every read takes a server-built {@link GraphViewerScope} and goes through the single
 * visibility policy in ./case-visibility.ts (organisation + site + live asset, applied in the
 * database before any limit). Every write validates the COMPLETE resulting site/asset scope
 * against that same scope. There is no organisation-only entry point left.
 */

import { getPrisma }                  from "@/lib/db/prisma";
import { logInfraFailure }            from "@/lib/logger/security-events";
import type { GraphViewerScope }      from "@/lib/knowledge-graph/visibility";
import { assertCaseScopeWritable, loadVisibleCaseRows } from "./case-visibility";
import { normalizeText, tokenize }    from "./normalize";
import { KNOWLEDGE_ENGINE_VERSION }   from "./types";
import { recordAuditEvent, KNOWLEDGE_AUDIT } from "@/lib/audit/audit-service";
import type { CaseRecord } from "./types";
import { _rowToCase } from "./failures";

type CaseModel = {
  create:     (a: unknown) => Promise<Record<string, unknown>>;
  findMany:   (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst:  (a: unknown) => Promise<Record<string, unknown> | null>;
  update:     (a: unknown) => Promise<Record<string, unknown>>;
  updateMany: (a: unknown) => Promise<{ count: number }>;
};

async function caseModel(): Promise<CaseModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).industrialEngineeringCase as CaseModel) : null;
}

/** The visible cases, newest first. A read failure answers with an EMPTY list (fail closed) and is logged. */
async function visibleRows(
  scope: GraphViewerScope,
  query: Parameters<typeof loadVisibleCaseRows>[2],
  operation: string,
): Promise<Record<string, unknown>[]> {
  const db = await getPrisma();
  if (!db) return [];
  try {
    return await loadVisibleCaseRows(db as unknown as Record<string, unknown>, scope, query);
  } catch (err) {
    logInfraFailure("database", `knowledge.cases.${operation}`, err);
    return [];
  }
}

export async function listCases(
  scope:          GraphViewerScope,
  status?:        string,
  assetId?:       string,
  limit           = 50,
): Promise<CaseRecord[]> {
  const rows = await visibleRows(scope, { status, assetId, limit }, "list");
  return rows.map(_rowToCase);
}

/** A hidden, foreign, inactive-site and nonexistent id are the same answer: `null`. */
export async function getCase(
  scope: GraphViewerScope,
  id:    string,
): Promise<CaseRecord | null> {
  const rows = await visibleRows(scope, { id, limit: 1 }, "get");
  return rows.length > 0 ? _rowToCase(rows[0]) : null;
}

export async function createCase(
  scope: GraphViewerScope,
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
  const organizationId = scope.organizationId;
  const m = await caseModel();
  const db = await getPrisma();
  if (!m || !db) return null;
  // Validate the COMPLETE scope before anything is written. Throws CaseScopeError (see ./case-visibility.ts).
  const resolved = await assertCaseScopeWritable(db as unknown as Record<string, unknown>, scope, input);
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
        assetId:        resolved.assetId,
        siteId:         resolved.siteId,
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

/** Fields a client may mutate through PATCH. Server-owned columns
 *  (id, organizationId, titleNorm, createdAt, updatedAt) are excluded —
 *  never spread a raw request body into Prisma. */
const CASE_MUTABLE_FIELDS = [
  "title", "symptoms", "diagnosis", "resolution", "lessonsLearned", "assetTypes",
  "assetId", "siteId", "failureModeId", "keywords", "status", "severity",
  "reportedById", "resolvedAt",
] as const;

export async function updateCase(
  scope:          GraphViewerScope,
  id:             string,
  input: Partial<Omit<CaseRecord, "id" | "organizationId" | "createdAt" | "updatedAt" | "titleNorm">>,
  userId?: string,
): Promise<CaseRecord | null> {
  void userId; // accepted for signature/route compatibility; not persisted here
  const organizationId = scope.organizationId;
  const m = await caseModel();
  const db = await getPrisma();
  if (!m || !db) return null;

  // 1. The case must be VISIBLE to the actor; otherwise it is "not found" (same answer as a missing id).
  const existingRows = await visibleRows(scope, { id, limit: 1 }, "update");
  if (existingRows.length === 0) return null;
  const existing = existingRows[0];

  // 2. Validate the RESULTING scope after the patch is applied (not just the patched fields), so a
  //    partial update cannot move a case into a hidden, foreign or inactive site, create a
  //    site/asset disagreement, or turn a site case into an organisation-level one.
  const src = input as Record<string, unknown>;
  const touchesScope = src.siteId !== undefined || src.assetId !== undefined;
  let nextScope: { siteId: string | null; assetId: string | null } | null = null;
  if (touchesScope) {
    nextScope = await assertCaseScopeWritable(db as unknown as Record<string, unknown>, scope, {
      siteId:  src.siteId  !== undefined ? src.siteId  : existing.siteId,
      assetId: src.assetId !== undefined ? src.assetId : existing.assetId,
    });
  }
  try {
    const data: Record<string, unknown> = {};
    for (const k of CASE_MUTABLE_FIELDS) {
      if (k === "siteId" || k === "assetId") continue;      // written from the validated scope below
      if (src[k] !== undefined) data[k] = src[k];
    }
    if (nextScope) { data.siteId = nextScope.siteId; data.assetId = nextScope.assetId; }
    if (typeof data.title === "string" && data.title) {
      data.titleNorm = normalizeText(data.title);
    }
    if (data.status === "resolved" && data.resolvedAt == null) {
      data.resolvedAt = new Date();
    }
    // Tenant-scoped write: a case owned by another org cannot be mutated even
    // if its id is known (Phase 82E.0 — closes cross-tenant IDOR write).
    // The WHERE also pins the scope that was validated: if it changed since the read, nothing is written.
    const res = await m.updateMany({
      where: { id, organizationId, siteId: existing.siteId ?? null, assetId: existing.assetId ?? null },
      data,
    });
    if (!res || res.count === 0) return null;
    return getCase(scope, id);
  } catch { return null; }
}

/**
 * searchCases — deterministic normalized search within cases.
 * Uses same normalization pipeline as searchKnowledge().
 * Tie-breaker: updatedAt DESC, then id ASC.
 */
export async function searchCases(
  scope:          GraphViewerScope,
  query:          string,
  limit           = 20,
): Promise<CaseRecord[]> {
  try {
    const all = await visibleRows(scope, { limit: 500 }, "search");
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
  scope:          GraphViewerScope,
  caseId:         string,
  limit           = 10,
): Promise<CaseRecord[]> {
  try {
    const sourceRows = await visibleRows(scope, { id: caseId, limit: 1 }, "related-source");
    if (sourceRows.length === 0) return [];
    const src = _rowToCase(sourceRows[0]);
    const srcTokens = tokenize(normalizeText([
      src.title, ...src.symptoms, ...src.keywords,
    ].join(" ")));

    const all = await visibleRows(scope, { excludeId: caseId, limit: 500 }, "related");

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
