/**
 * Site authorization engine — Phase 43.
 *
 * requireSiteActor(): validates in strict order:
 *   1. User authenticated (userId from JWT)
 *   2. User is ACTIVE org member
 *   3. User has site access (implicit for OWNER/ADMIN; explicit UserSite row otherwise)
 *
 * getAllowedSiteIds(): resolves the complete list of site IDs the user may access.
 *   OWNER/ADMIN  → all ACTIVE IndustrialSite IDs in the org (dynamic query, no UserSite)
 *   others       → UserSite.siteId WHERE userId=userId AND organizationId=orgId AND status=ACTIVE
 *
 * CONFIRMED RULE: OWNER/ADMIN NEVER have UserSite rows. This function MUST NOT
 * query UserSite for OWNER/ADMIN. It queries IndustrialSite directly.
 */

import type { NextRequest }    from "next/server";
import { verifyAccessToken }   from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { getPrisma }           from "@/lib/db/prisma";
import { recordAuditEvent }    from "@/lib/audit/audit-service";
import { SITE_AUDIT }          from "@/lib/audit/audit-service";
import type { OrgRole }        from "@/lib/org/types";
import type { SiteActorContext, SiteRole } from "./types";

const IMPLICIT_ROLES: OrgRole[] = ["OWNER", "ADMIN"];

type MemberModel  = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };
type SiteModel    = { findMany:  (a: unknown) => Promise<Record<string, unknown>[]> };
type UserSiteModel = {
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  findMany:  (a: unknown) => Promise<Record<string, unknown>[]>;
};

async function getUserId(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyAccessToken(token);
  return payload?.sub ?? null;
}

/**
 * Returns the resolved SiteActorContext or null.
 * Enforces: org membership BEFORE site check.
 * OWNER/ADMIN → implicit SITE_ADMIN, no UserSite row queried.
 */
export async function getSiteActorContext(
  userId: string,
  orgId:  string,
  siteId: string,
): Promise<SiteActorContext | null> {
  const db = await getPrisma();
  if (!db) return null;
  const d = db as unknown as Record<string, unknown>;

  // Step 1 — verify org membership
  const member = await (d.organizationMember as unknown as MemberModel).findFirst({
    where: { userId, organizationId: orgId, status: "ACTIVE" },
    select: { role: true },
  });
  if (!member) return null;

  const orgRole = member.role as OrgRole;

  // Step 2 — OWNER/ADMIN: implicit access, resolved from IndustrialSite directly
  if (IMPLICIT_ROLES.includes(orgRole)) {
    const site = await (d.industrialSite as unknown as SiteModel).findMany({
      where:  { id: siteId, organizationId: orgId, status: "ACTIVE" },
      select: { id: true },
    });
    if (site.length === 0) return null;
    return { userId, orgId, siteId, role: "SITE_ADMIN", implicit: true };
  }

  // Step 3 — explicit UserSite row required.
  // PHASE 90: the site must ALSO belong to the organization the caller is
  // acting in. Without this, a UserSite grant for a site in org B satisfied a
  // request scoped to org A, because the row was matched on (userId, siteId)
  // alone and IndustrialSite was only consulted on the implicit-role path.
  const siteInOrg = await (d.industrialSite as unknown as SiteModel).findMany({
    where:  { id: siteId, organizationId: orgId, status: "ACTIVE" },
    select: { id: true },
  });
  if (siteInOrg.length === 0) return null;

  const us = await (d.userSite as unknown as UserSiteModel).findFirst({
    where:  { userId, siteId, status: "ACTIVE" },
    select: { role: true },
  });
  if (!us) return null;

  return { userId, orgId, siteId, role: us.role as SiteRole, implicit: false };
}

/**
 * Enforces authentication + org membership + site access.
 * Audits denials. Never audits routine successful checks.
 * Returns 401 → 403 → 403 in that strict order.
 */
export async function requireSiteActor(
  req:    NextRequest,
  orgId:  string,
  siteId: string,
): Promise<{ ctx: SiteActorContext } | { error: string; status: number }> {
  const userId = await getUserId(req);
  if (!userId) return { error: "Authentication required", status: 401 };

  const ctx = await getSiteActorContext(userId, orgId, siteId);
  if (!ctx) {
    // Audit denial (fire-and-forget)
    recordAuditEvent({
      userId,
      action:     SITE_AUDIT.SITE_ACCESS_DENIED,
      entityType: "site",
      entityId:   siteId,
      metadata:   { organizationId: orgId, siteId },
    }).catch(() => undefined);
    return { error: "Access to this site is not permitted", status: 403 };
  }

  return { ctx };
}

/**
 * Returns the set of site IDs the user may access within the org.
 *
 * OWNER/ADMIN: queries IndustrialSite directly — never touches UserSite.
 * Others:      queries UserSite for ACTIVE rows.
 *
 * Returns [] (empty array) when the user has no site access. Callers must
 * treat [] as "no sites accessible" and return empty results, never a 500.
 */
export async function getAllowedSiteIds(
  userId: string,
  orgId:  string,
): Promise<string[]> {
  const db = await getPrisma();
  if (!db) return [];
  const d = db as unknown as Record<string, unknown>;

  try {
    // Resolve org role first
    const member = await (d.organizationMember as unknown as MemberModel).findFirst({
      where:  { userId, organizationId: orgId, status: "ACTIVE" },
      select: { role: true },
    });
    if (!member) return [];

    const orgRole = member.role as OrgRole;

    if (IMPLICIT_ROLES.includes(orgRole)) {
      // OWNER/ADMIN — implicit all-site access; query IndustrialSite, NOT UserSite
      const sites = await (d.industrialSite as unknown as SiteModel).findMany({
        where:  { organizationId: orgId, status: "ACTIVE" },
        select: { id: true },
      });
      return sites.map(s => String(s.id));
    }

    // Explicit members — query only their UserSite rows
    const rows = await (d.userSite as unknown as UserSiteModel).findMany({
      where:  { userId, organizationId: orgId, status: "ACTIVE" },
      select: { siteId: true },
    });
    return rows.map(r => String(r.siteId));
  } catch {
    return [];
  }
}
