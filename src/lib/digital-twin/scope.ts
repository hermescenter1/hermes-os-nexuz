/**
 * Effective site scope of the Digital Twin COLLECTION reads — corrective slice A (IR-01).
 *
 * `getAllowedSiteIds` (site/context.ts) is the repository's official site list, but for every
 * role except OWNER/ADMIN it only checks that the `UserSite` row is ACTIVE. It never looks at
 * the `IndustrialSite` itself, so a member whose grant was left in place after the site was
 * deactivated still listed that site's nodes, relations, tags and layouts — while every detail
 * route (which goes through `requireSiteActor`, and that DOES require an ACTIVE site) answered
 * NOT FOUND for the same record.
 *
 * The global helper is deliberately left alone (it has many callers outside the twin). The twin
 * narrows its result here, once, and every twin collection route uses this function:
 *
 *   effective scope = getAllowedSiteIds(user, org)  ∩  { ACTIVE IndustrialSite of THIS org }
 *
 * - OWNER/ADMIN: every ACTIVE site of the organisation (unchanged).
 * - everyone else: the ACTIVE sites they hold an ACTIVE `UserSite` grant for.
 * - a grant on an inactive, foreign, unknown or malformed site grants nothing.
 * - any failure resolves to an EMPTY scope (fail closed); callers already treat `[]` as the
 *   authorised-empty answer.
 *
 * The result is server-derived only. A client-supplied `siteId` is intersected with it by the
 * list layer and can therefore narrow the scope, never widen it.
 *
 * The name is the one the Phase 99 tenant scanner already recognises as site-scope evidence.
 */

import { getPrisma } from "@/lib/db/prisma";
import { getAllowedSiteIds } from "@/lib/site/context";
import { logInfraFailure } from "@/lib/logger/security-events";

type SiteModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export async function resolveSiteScope(userId: string, organizationId: string): Promise<string[]> {
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
    return Array.from(new Set(rows.map((r) => r.id).filter(isId).filter((id) => grantedSet.has(id))));
  } catch (err) {
    logInfraFailure("database", "digital_twin.resolve_site_scope", err);
    return [];
  }
}
