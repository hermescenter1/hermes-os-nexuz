/**
 * Site membership CRUD — Phase 43.
 *
 * Grant, update, revoke, and list UserSite rows.
 * OWNER/ADMIN are never given UserSite rows — callers must not call
 * grantSiteAccess() for a user whose org role is OWNER or ADMIN.
 */

import { getPrisma }         from "@/lib/db/prisma";
import type { SiteRole, SiteMemberStatus, UserSiteRecord } from "./types";

type UserSiteModel = {
  create:    (a: unknown) => Promise<Record<string, unknown>>;
  update:    (a: unknown) => Promise<Record<string, unknown>>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  findMany:  (a: unknown) => Promise<Record<string, unknown>[]>;
  delete:    (a: unknown) => Promise<Record<string, unknown>>;
};

function toRecord(r: Record<string, unknown>): UserSiteRecord {
  return {
    id:             String(r.id),
    userId:         String(r.userId),
    siteId:         String(r.siteId),
    organizationId: String(r.organizationId),
    role:           r.role   as SiteRole,
    status:         r.status as SiteMemberStatus,
    grantedById:    r.grantedById ? String(r.grantedById) : null,
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
}

async function model(): Promise<UserSiteModel | null> {
  const db = await getPrisma();
  return db ? ((db as unknown as Record<string, unknown>).userSite as UserSiteModel) : null;
}

/** List all UserSite rows for a user within an org. */
export async function getUserSites(
  userId: string,
  orgId:  string,
): Promise<UserSiteRecord[]> {
  const m = await model();
  if (!m) return [];
  const rows = await m.findMany({
    where:   { userId, organizationId: orgId },
    orderBy: { createdAt: "asc" },
  }).catch(() => []);
  return rows.map(toRecord);
}

/** List all UserSite rows for a given site (for admin/site membership management). */
export async function getSiteMembers(
  siteId: string,
  orgId:  string,
): Promise<UserSiteRecord[]> {
  const m = await model();
  if (!m) return [];
  const rows = await m.findMany({
    where:   { siteId, organizationId: orgId },
    orderBy: { createdAt: "asc" },
  }).catch(() => []);
  return rows.map(toRecord);
}

/** Grant explicit site access. Upserts: if row exists, updates role. */
export async function grantSiteAccess(opts: {
  userId:         string;
  siteId:         string;
  organizationId: string;
  role:           SiteRole;
  grantedById?:   string;
}): Promise<UserSiteRecord | null> {
  const m = await model();
  if (!m) return null;
  try {
    const existing = await m.findFirst({ where: { userId: opts.userId, siteId: opts.siteId } });
    if (existing) {
      const updated = await m.update({
        where: { id: existing.id as string },
        data:  { role: opts.role, status: "ACTIVE", grantedById: opts.grantedById ?? null, updatedAt: new Date() },
      });
      return toRecord(updated);
    }
    const created = await m.create({
      data: {
        userId:         opts.userId,
        siteId:         opts.siteId,
        organizationId: opts.organizationId,
        role:           opts.role,
        status:         "ACTIVE",
        grantedById:    opts.grantedById ?? null,
      },
    });
    return toRecord(created);
  } catch { return null; }
}

/** Update role or status of an existing UserSite row. */
export async function updateSiteRole(
  userId:  string,
  siteId:  string,
  updates: { role?: SiteRole; status?: SiteMemberStatus },
): Promise<UserSiteRecord | null> {
  const m = await model();
  if (!m) return null;
  try {
    const existing = await m.findFirst({ where: { userId, siteId } });
    if (!existing) return null;
    const updated = await m.update({
      where: { id: existing.id as string },
      data:  { ...updates, updatedAt: new Date() },
    });
    return toRecord(updated);
  } catch { return null; }
}

/** Remove explicit site access. Returns true if a row was deleted. */
export async function revokeSiteAccess(
  userId: string,
  siteId: string,
): Promise<boolean> {
  const m = await model();
  if (!m) return false;
  try {
    const existing = await m.findFirst({ where: { userId, siteId } });
    if (!existing) return false;
    await m.delete({ where: { id: existing.id as string } });
    return true;
  } catch { return false; }
}
