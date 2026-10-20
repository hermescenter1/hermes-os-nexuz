/**
 * Copilot viewer scope and request selectors — corrective slice C (IR-03).
 *
 * WHAT WAS WRONG. Every Copilot entry point (text query, conversation message, voice) passed the
 * client's `siteId` / `assetId` straight into the engine, and the engine read the organisation:
 * `generateInsights` listed every asset of the organisation when no site was given, the dependency
 * traversal loaded every Digital Twin relation of the organisation, and the asset context read any asset
 * of the organisation by id. A member granted one site could therefore receive other sites' asset names,
 * Digital Twin node names and derived insights.
 *
 * THE RULE. The engine only ever runs with a {@link CopilotScope} built here, server side:
 *
 *   siteIds  = getAllowedSiteIds(user, org) ∩ { ACTIVE IndustrialSite of THIS organisation }
 *   siteId   = a requested site, accepted only if it is one of `siteIds`
 *   asset    = a requested asset, loaded IN this organisation; its site is derived from the row and must be
 *              one of `siteIds` (and equal the requested site when both are given)
 *
 * A hidden, inactive, foreign, nonexistent or malformed selector — or an asset that is not on the requested
 * site — is one answer: {@link COPILOT_SCOPE_NOT_FOUND}. Nothing is read before that decision. With no
 * selector the engine works across `siteIds` only (OWNER/ADMIN: every active site; never "the
 * organisation"). Any failure resolves to an empty scope.
 */

import { getPrisma } from "@/lib/db/prisma";
import { getAllowedSiteIds } from "@/lib/site/context";
import { logInfraFailure } from "@/lib/logger/security-events";

const MAX_ID_LENGTH = 128;
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_ID_LENGTH;

/** The authority a Copilot request runs with. Built only by this module. */
export interface CopilotScope {
  readonly organizationId: string;
  readonly userId: string;
  /** ACTIVE sites of the organisation the actor may read. Empty = nothing site-derived. */
  readonly siteIds: readonly string[];
  /** The authorised site selection, if any. */
  readonly siteId: string | null;
  /** The authorised asset selection, with its server-derived site. */
  readonly asset: { readonly id: string; readonly siteId: string } | null;
}

/** The one public answer for a refused selector — identical for hidden, inactive, foreign and missing. */
export const COPILOT_SCOPE_NOT_FOUND = {
  status: 404,
  body: { error: "Site or asset not found", code: "COPILOT_SCOPE_NOT_FOUND" },
} as const;

type FindManyModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

/** The actor's readable sites: official allowed sites ∩ ACTIVE sites of the organisation. Fails closed. */
export async function resolveCopilotSiteIds(userId: string | null | undefined, organizationId: string): Promise<string[]> {
  if (!isId(userId) || !isId(organizationId)) return [];
  try {
    const granted = Array.from(new Set((await getAllowedSiteIds(userId, organizationId)).filter(isId)));
    if (granted.length === 0) return [];
    const prisma = await getPrisma();
    if (!prisma) return [];
    const rows = await (prisma.industrialSite as unknown as FindManyModel).findMany({
      where:  { organizationId, status: "ACTIVE", id: { in: granted } },
      select: { id: true },
    });
    const grantedSet = new Set(granted);
    return Array.from(new Set(rows.map((r) => r.id).filter(isId).filter((id) => grantedSet.has(id)))).sort();
  } catch (err) {
    logInfraFailure("database", "copilot.resolve_site_ids", err);
    return [];
  }
}

export type CopilotScopeResult = { ok: true; scope: CopilotScope } | { ok: false };

const present = (v: unknown): boolean => v !== undefined && v !== null;

/**
 * Builds the request's scope from the authenticated actor and the (untrusted) selectors.
 * Refuses — without reading any Copilot data — when a selector is not readable by the actor.
 */
export async function authorizeCopilotSelectors(
  userId: string | null | undefined,
  organizationId: string,
  selectors: { siteId?: unknown; assetId?: unknown } = {},
): Promise<CopilotScopeResult> {
  const siteIds = await resolveCopilotSiteIds(userId, organizationId);
  const base = { organizationId, userId: isId(userId) ? userId : "", siteIds, siteId: null, asset: null } as const;

  let siteId: string | null = null;
  if (present(selectors.siteId)) {
    if (!isId(selectors.siteId) || !siteIds.includes(selectors.siteId)) return { ok: false };
    siteId = selectors.siteId;
  }

  let asset: { id: string; siteId: string } | null = null;
  if (present(selectors.assetId)) {
    if (!isId(selectors.assetId) || siteIds.length === 0) return { ok: false };
    try {
      const prisma = await getPrisma();
      if (!prisma) return { ok: false };
      const rows = await (prisma.industrialAsset as unknown as FindManyModel).findMany({
        where:  { id: selectors.assetId, organizationId, siteId: { in: [...siteIds] } },
        select: { id: true, siteId: true },
        take:   1,
      });
      const row = rows[0];
      if (!row || !isId(row.siteId) || !siteIds.includes(row.siteId)) return { ok: false };
      if (siteId !== null && row.siteId !== siteId) return { ok: false };     // both given: they must agree
      asset = { id: selectors.assetId, siteId: row.siteId };
    } catch (err) {
      logInfraFailure("database", "copilot.authorize_asset", err);
      return { ok: false };
    }
  }

  return { ok: true, scope: { ...base, siteId, asset } };
}

/**
 * The sites a response may draw from: the asset's site, else the selected site, else every readable site.
 * Recorded with each stored answer so a later read can be re-authorised against the CURRENT scope.
 */
export function effectiveSiteIds(scope: CopilotScope): string[] {
  if (scope.asset) return [scope.asset.siteId];
  if (scope.siteId) return [scope.siteId];
  return [...scope.siteIds];
}
