/**
 * Engineering-case visibility — ONE policy for every surface that can return a case
 * (RV-01 corrective remediation).
 *
 * `IndustrialEngineeringCase` has two OPTIONAL, unconstrained references: `siteId` and
 * `assetId` (no foreign keys, no scope discriminator). Before this module the case routes,
 * the knowledge search, the failure lookup and the knowledge graph all filtered by
 * `organizationId` alone, so any member with `view_knowledge` could read the title,
 * diagnosis and resolution of a case that belongs to a site they cannot access.
 *
 * THE RULES (deny by default; `scope` is built server side, never from client input):
 *   1. A case is always limited to the viewer's organisation.
 *   2. siteId + assetId      visible only if the asset exists IN THIS ORGANISATION, the asset's
 *                            site equals the case's site, and that site is one the viewer may read.
 *                            A disagreeing pair is ambiguous and is hidden from everyone.
 *   3. siteId, no asset      visible only if the site is one the viewer may read.
 *   4. assetId, no siteId    the site is DERIVED from the asset (server side); visible only if that
 *                            site is one the viewer may read. A missing/foreign asset hides the case.
 *   5. neither               organisation-level / ambiguous: visible ONLY to OWNER and ADMIN
 *                            (`scope.organizationLevelAccess`). There is no field that proves a case
 *                            is intentionally global, so it must never become public to the members.
 *
 * The site list is the official `getAllowedSiteIds` result intersected with the organisation's ACTIVE
 * sites (see knowledge-graph/visibility.ts), so inactive, unknown and foreign sites never match.
 * Authorisation is applied INSIDE the query (a join to the live asset), before any limit, so a
 * hidden case can neither be returned nor change a count or a page.
 */

import type { GraphViewerScope } from "@/lib/knowledge-graph/visibility";

/** Hard ceiling for any id list this module returns (the graph asks for all visible ids). */
export const MAX_VISIBLE_CASE_IDS = 50_000;
export const DEFAULT_CASE_LIMIT = 50;

type Row = Record<string, unknown>;
type RawQuery = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Row[]>;
interface CaseReadModel { findMany: (args: Record<string, unknown>) => Promise<Row[]> }

export interface VisibleCaseQuery {
  /** Exact case id (detail lookup). */
  id?:             string;
  /** Exclude one case id (related-case search). */
  excludeId?:      string;
  status?:         string;
  /** Filter by the case's stored assetId. A hidden asset simply yields no rows. */
  assetId?:        string;
  failureModeIds?: readonly string[];
  limit?:          number;
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_CASE_LIMIT;
  return Math.min(MAX_VISIBLE_CASE_IDS, Math.max(1, Math.trunc(limit)));
}

/**
 * Ids of the cases the scope may read, newest first (`updatedAt DESC, id ASC`).
 * Fully parameterised; the optional filters are bound as NULL-able parameters, never concatenated.
 * Throws on a database error — callers fail closed (an empty result), never open.
 */
export async function listVisibleCaseIds(
  db: Record<string, unknown>,
  scope: GraphViewerScope,
  query: VisibleCaseQuery = {},
): Promise<string[]> {
  const raw = (db as { $queryRaw?: RawQuery }).$queryRaw;
  if (typeof raw !== "function") throw new Error("CASE_VISIBILITY_QUERY_UNAVAILABLE");
  const sites = [...scope.allowedSiteIds];
  const failureModes = query.failureModeIds ? [...query.failureModeIds] : null;
  if (failureModes !== null && failureModes.length === 0) return [];

  const rows = await (db as { $queryRaw: RawQuery }).$queryRaw`
    SELECT c."id" AS "id"
    FROM "IndustrialEngineeringCase" c
    LEFT JOIN "IndustrialAsset" a
      ON a."id" = c."assetId" AND a."organizationId" = ${scope.organizationId}
    WHERE c."organizationId" = ${scope.organizationId}
      AND (
            ( c."siteId" IS NOT NULL
              AND c."siteId" = ANY(${sites}::text[])
              AND ( c."assetId" IS NULL OR ( a."id" IS NOT NULL AND a."siteId" = c."siteId" ) ) )
         OR ( c."siteId" IS NULL
              AND c."assetId" IS NOT NULL
              AND a."id" IS NOT NULL
              AND a."siteId" = ANY(${sites}::text[]) )
         OR ( ${scope.organizationLevelAccess}::boolean
              AND c."siteId" IS NULL
              AND c."assetId" IS NULL )
      )
      AND ( ${query.id ?? null}::text            IS NULL OR c."id"            = ${query.id ?? null}::text )
      AND ( ${query.excludeId ?? null}::text     IS NULL OR c."id"           <> ${query.excludeId ?? null}::text )
      AND ( ${query.status ?? null}::text        IS NULL OR c."status"        = ${query.status ?? null}::text )
      AND ( ${query.assetId ?? null}::text       IS NULL OR c."assetId"       = ${query.assetId ?? null}::text )
      AND ( ${failureModes}::text[]              IS NULL OR c."failureModeId" = ANY(${failureModes}::text[]) )
    ORDER BY c."updatedAt" DESC, c."id" ASC
    LIMIT ${clampLimit(query.limit)}
  `;
  return rows.map((r) => String(r.id));
}

/**
 * The visible case ROWS, in the order of {@link listVisibleCaseIds}. The second query is keyed by
 * the already-authorised ids (and the organisation again), so it cannot widen the result.
 */
export async function loadVisibleCaseRows(
  db: Record<string, unknown>,
  scope: GraphViewerScope,
  query: VisibleCaseQuery = {},
): Promise<Row[]> {
  const ids = await listVisibleCaseIds(db, scope, query);
  if (ids.length === 0) return [];
  const model = db.industrialEngineeringCase as CaseReadModel | undefined;
  if (!model) throw new Error("CASE_MODEL_UNAVAILABLE");
  const rows = await model.findMany({ where: { organizationId: scope.organizationId, id: { in: ids } } });
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  return ids.map((id) => byId.get(id)).filter((r): r is Row => r !== undefined);
}

// ── write-side scope validation ───────────────────────────────────────────────

export type CaseScopeRefusal =
  | "SCOPE_NOT_FOUND"        // hidden / foreign / inactive / nonexistent site or asset (one public answer)
  | "SCOPE_MISMATCH"         // the visible site and the visible asset disagree
  | "ORG_LEVEL_FORBIDDEN";   // neither site nor asset, and the actor is not OWNER/ADMIN

export class CaseScopeError extends Error {
  readonly code: CaseScopeRefusal;
  constructor(code: CaseScopeRefusal) {
    super(code);
    this.name = "CaseScopeError";
    this.code = code;
  }
}

/**
 * The PUBLIC answer for a refused write scope. A hidden, foreign, inactive or nonexistent site/asset all
 * produce the same `404`; the other two refusals only ever reveal facts about references the actor can
 * already see (their own sites/assets) or about their own role.
 */
export function caseScopeHttp(code: CaseScopeRefusal): { status: number; error: string } {
  switch (code) {
    case "SCOPE_NOT_FOUND":      return { status: 404, error: "Site or asset not found" };
    case "SCOPE_MISMATCH":       return { status: 400, error: "siteId and assetId refer to different sites" };
    case "ORG_LEVEL_FORBIDDEN":  return { status: 403, error: "A site or an asset is required for this role" };
  }
}

export interface CaseScopeInput { siteId: string | null; assetId: string | null }

const nonEmpty = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/**
 * Validates the COMPLETE resulting scope of a case about to be written. The asset is read live from
 * this organisation; its site is server-derived; every reference must lie inside the actor's scope.
 * Throws {@link CaseScopeError}; never returns a partially valid scope.
 */
export async function assertCaseScopeWritable(
  db: Record<string, unknown>,
  scope: GraphViewerScope,
  input: { siteId?: unknown; assetId?: unknown },
): Promise<CaseScopeInput> {
  const siteId = nonEmpty(input.siteId);
  const assetId = nonEmpty(input.assetId);
  if (input.siteId !== null && input.siteId !== undefined && siteId === null) throw new CaseScopeError("SCOPE_NOT_FOUND");
  if (input.assetId !== null && input.assetId !== undefined && assetId === null) throw new CaseScopeError("SCOPE_NOT_FOUND");

  if (siteId === null && assetId === null) {
    if (!scope.organizationLevelAccess) throw new CaseScopeError("ORG_LEVEL_FORBIDDEN");
    return { siteId: null, assetId: null };
  }
  if (siteId !== null && !scope.allowedSiteIds.includes(siteId)) throw new CaseScopeError("SCOPE_NOT_FOUND");

  if (assetId !== null) {
    const assets = db.industrialAsset as CaseReadModel | undefined;
    if (!assets) throw new Error("ASSET_MODEL_UNAVAILABLE");
    const found = await assets.findMany({
      where:  { id: assetId, organizationId: scope.organizationId },
      select: { id: true, siteId: true },
      take:   1,
    });
    const assetSite = found.length > 0 ? nonEmpty(found[0].siteId) : null;
    if (assetSite === null || !scope.allowedSiteIds.includes(assetSite)) throw new CaseScopeError("SCOPE_NOT_FOUND");
    if (siteId !== null && siteId !== assetSite) throw new CaseScopeError("SCOPE_MISMATCH");
  }
  return { siteId, assetId };
}
