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
import {
  CaseScopeError,
  assertFailureModeWritable,
  loadVisibleCaseRows,
  lockCaseRowForWrite,
  lockCaseScopesForWrite,
  parseCaseScope,
  type CaseScopeInput,
  type CaseWriteTx,
} from "./case-visibility";
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

/** A case write runs in ONE interactive transaction (locks + decision + write). */
interface CaseTxHost {
  $transaction: <T>(fn: (tx: CaseWriteTx) => Promise<T>, opts?: { maxWait?: number; timeout?: number }) => Promise<T>;
}
const CASE_TX_OPTIONS = { maxWait: 5000, timeout: 15000 } as const;

const txModel = (tx: CaseWriteTx): CaseModel => tx.industrialEngineeringCase as CaseModel;

/**
 * Creates a case. Independent review S2-01: the scope decision and the insert are ONE transaction —
 * the asset (if any), the site(s) it names or derives and the failure mode are locked (`FOR SHARE`) and
 * decided on their locked, current values, so an asset moved to a hidden site or a site deactivated
 * while the request runs either makes this create fail with the uniform 404 (nothing is inserted,
 * nothing is audited) or waits until this create has committed. The audit event is recorded only after
 * the commit.
 */
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
  const db = await getPrisma();
  if (!db) return null;
  const requested = parseCaseScope(input);                  // shape refusals before any database work
  let row: Record<string, unknown>;
  try {
    row = await (db as unknown as CaseTxHost).$transaction(async (tx) => {
      const [decided] = await lockCaseScopesForWrite(tx, scope, [requested]);
      if (decided instanceof CaseScopeError) throw decided;
      const failureModeId = await assertFailureModeWritable(tx, organizationId, input.failureModeId);
      return txModel(tx).create({
        data: {
          organizationId,
          title:          input.title,
          titleNorm:      normalizeText(input.title),
          symptoms:       input.symptoms       ?? [],
          diagnosis:      input.diagnosis      ?? null,
          resolution:     input.resolution     ?? null,
          lessonsLearned: input.lessonsLearned ?? null,
          assetTypes:     input.assetTypes     ?? [],
          assetId:        decided.assetId,
          siteId:         decided.siteId,
          failureModeId,
          keywords:       input.keywords       ?? [],
          status:         input.status         ?? "open",
          severity:       input.severity       ?? "MEDIUM",
          reportedById:   input.reportedById   ?? null,
        },
      });
    }, CASE_TX_OPTIONS);
  } catch (err) {
    if (err instanceof CaseScopeError) throw err;
    logInfraFailure("database", "knowledge.cases.create", err);
    return null;
  }
  const created = _rowToCase(row);
  recordAuditEvent({
    action:     KNOWLEDGE_AUDIT.ENGINEERING_CASE_CREATED,
    entityType: "case",
    entityId:   created.id,
    userId,
    metadata:   { organizationId, title: created.title, engineVersion: KNOWLEDGE_ENGINE_VERSION },
  });
  return created;
}

/** Fields a client may mutate through PATCH. Server-owned columns
 *  (id, organizationId, titleNorm, createdAt, updatedAt) are excluded —
 *  never spread a raw request body into Prisma. */
const CASE_MUTABLE_FIELDS = [
  "title", "symptoms", "diagnosis", "resolution", "lessonsLearned", "assetTypes",
  "assetId", "siteId", "failureModeId", "keywords", "status", "severity",
  "reportedById", "resolvedAt",
] as const;

/**
 * Updates a case. Independent review S2-01: everything that decides the write is decided INSIDE one
 * transaction, on locked rows, in a fixed order — the case row (`FOR UPDATE`), then every asset named by
 * the current or the resulting scope, then every site they name or derive, then the failure mode
 * (`FOR SHARE`). Under those locks:
 *   1. the CURRENT case must be visible to the actor (its own site, its asset's CURRENT site, ACTIVE,
 *      consistent) — otherwise `null` (404), whatever the patch contains;
 *   2. the RESULTING scope must be writable — otherwise a {@link CaseScopeError};
 *   3. the write is pinned to the locked scope and the result is read back on the same transaction.
 * A concurrent asset move, site deactivation or case re-scoping therefore either commits first (and this
 * update sees it and writes nothing) or waits for this update. No second visibility read after the write.
 */
export async function updateCase(
  scope:          GraphViewerScope,
  id:             string,
  input: Partial<Omit<CaseRecord, "id" | "organizationId" | "createdAt" | "updatedAt" | "titleNorm">>,
  userId?: string,
): Promise<CaseRecord | null> {
  void userId; // accepted for signature/route compatibility; not persisted here
  const organizationId = scope.organizationId;
  const db = await getPrisma();
  if (!db) return null;
  const src = input as Record<string, unknown>;
  const touchesScope = src.siteId !== undefined || src.assetId !== undefined;

  try {
    return await (db as unknown as CaseTxHost).$transaction(async (tx) => {
      const locked = await lockCaseRowForWrite(tx, organizationId, id);
      if (!locked) return null;
      const current: CaseScopeInput = { siteId: locked.siteId, assetId: locked.assetId };

      // The requested scope is parsed but NOT acted on until the current case is known to be visible:
      // a hidden case answers like a missing one, whatever the patch contains.
      let requested: CaseScopeInput | CaseScopeError = current;
      if (touchesScope) {
        try {
          requested = parseCaseScope({
            siteId:  src.siteId  !== undefined ? src.siteId  : current.siteId,
            assetId: src.assetId !== undefined ? src.assetId : current.assetId,
          });
        } catch (err) {
          if (!(err instanceof CaseScopeError)) throw err;
          requested = err;
        }
      }
      const toLock = requested instanceof CaseScopeError ? [current] : [current, requested];
      const [currentDecision, nextDecision] = await lockCaseScopesForWrite(tx, scope, toLock);
      if (currentDecision instanceof CaseScopeError) return null;            // hidden now: nothing written
      if (requested instanceof CaseScopeError) throw requested;
      if (nextDecision instanceof CaseScopeError) throw nextDecision;
      const next = nextDecision ?? current;

      const data: Record<string, unknown> = {};
      for (const k of CASE_MUTABLE_FIELDS) {
        if (k === "siteId" || k === "assetId") continue;      // written from the decided scope below
        if (src[k] !== undefined) data[k] = src[k];
      }
      if (src.failureModeId !== undefined) data.failureModeId = await assertFailureModeWritable(tx, organizationId, src.failureModeId);
      if (touchesScope) { data.siteId = next.siteId; data.assetId = next.assetId; }
      if (typeof data.title === "string" && data.title) data.titleNorm = normalizeText(data.title);
      if (data.status === "resolved" && data.resolvedAt == null) data.resolvedAt = new Date();

      // Tenant-scoped, and pinned to the locked scope (defence in depth: the row lock already holds it).
      const res = await txModel(tx).updateMany({
        where: { id, organizationId, siteId: current.siteId, assetId: current.assetId },
        data,
      });
      if (!res || res.count !== 1) return null;
      const row = await txModel(tx).findFirst({ where: { id, organizationId } });
      return row ? _rowToCase(row) : null;
    }, CASE_TX_OPTIONS);
  } catch (err) {
    if (err instanceof CaseScopeError) throw err;
    logInfraFailure("database", "knowledge.cases.update", err);
    return null;
  }
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
