/**
 * Viewer scope of the Multi-site analytics surfaces — corrective slice B (IR-02).
 *
 * The benchmark and everything under it (risk / KPI rows, cross-site failure patterns, the stored
 * summary) are ORGANISATION-wide artefacts. A reader may only ever see the part of them that
 * belongs to the sites the viewer may read, so every reader starts from this scope:
 *
 *   viewer scope = getAllowedSiteIds(user, org)  ∩  { ACTIVE IndustrialSite of THIS organisation }
 *
 * - OWNER/ADMIN: every ACTIVE site of the organisation.
 * - everyone else: the ACTIVE sites they hold an ACTIVE `UserSite` grant for.
 * - a grant on an inactive, foreign, unknown or malformed site grants nothing.
 * - any failure — missing user, lookup error, no database — resolves to an EMPTY scope.
 *
 * `getAllowedSiteIds` checks only the `UserSite` row; it never looks at the site's own status, so a
 * grant that outlived a site's deactivation would still select that site's rows. The global helper is
 * deliberately left alone (many callers); this module narrows its result, once, for Multi-site.
 *
 * The scope is server-derived. A client filter can only be intersected with it, never added to it.
 */

import { getPrisma } from "@/lib/db/prisma";
import { getAllowedSiteIds } from "@/lib/site/context";
import { logInfraFailure } from "@/lib/logger/security-events";

type SiteModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export async function resolveMultiSiteScope(
  userId: string | null | undefined,
  organizationId: string,
): Promise<string[]> {
  if (!isId(userId) || !isId(organizationId)) return [];
  try {
    const granted = Array.from(new Set((await getAllowedSiteIds(userId, organizationId)).filter(isId)));
    if (granted.length === 0) return [];

    const prisma = await getPrisma();
    if (!prisma) return [];

    const rows = await (prisma.industrialSite as unknown as SiteModel).findMany({
      where:  { organizationId, status: "ACTIVE", id: { in: granted } },
      select: { id: true },
    });
    // Strict intersection: only an id the official list granted AND the database confirmed is kept.
    const grantedSet = new Set(granted);
    return Array.from(new Set(rows.map((r) => r.id).filter(isId).filter((id) => grantedSet.has(id)))).sort();
  } catch (err) {
    logInfraFailure("database", "multi_site.resolve_scope", err);
    return [];
  }
}
