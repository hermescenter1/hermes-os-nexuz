import { getPrisma }     from "@/lib/db/prisma";
import type { SiteRecord, IndustrialSiteStatus } from "./types";

type SiteModel = {
  findMany:  (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  create:    (a: unknown) => Promise<Record<string, unknown>>;
  update:    (a: unknown) => Promise<Record<string, unknown>>;
};

function row(r: Record<string, unknown>): SiteRecord {
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    name:           r.name           as string,
    slug:           r.slug           as string,
    location:       (r.location      ?? null) as string | null,
    description:    (r.description   ?? null) as string | null,
    status:         r.status         as IndustrialSiteStatus,
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
}

export async function listSites(
  organizationId: string,
  allowedIds?: string[],
): Promise<SiteRecord[]> {
  if (allowedIds !== undefined && allowedIds.length === 0) return [];
  const prisma = await getPrisma();
  if (!prisma) return [];
  const where: Record<string, unknown> = { organizationId };
  if (allowedIds !== undefined) where.id = { in: allowedIds };
  const rows = await (prisma.industrialSite as unknown as SiteModel).findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(row);
}

export async function getSite(id: string, organizationId: string): Promise<SiteRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const r = await (prisma.industrialSite as unknown as SiteModel).findFirst({
    where: { id, organizationId },
  });
  return r ? row(r) : null;
}

export async function createSite(params: {
  organizationId: string;
  name:           string;
  slug:           string;
  location?:      string;
  description?:   string;
  status?:        IndustrialSiteStatus;
}): Promise<SiteRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const r = await (prisma.industrialSite as unknown as SiteModel).create({
    data: {
      organizationId: params.organizationId,
      name:           params.name,
      slug:           params.slug,
      location:       params.location   ?? null,
      description:    params.description ?? null,
      status:         params.status      ?? "ACTIVE",
    },
  });
  return row(r);
}

export async function updateSite(id: string, organizationId: string, patch: {
  name?:        string;
  location?:    string | null;
  description?: string | null;
  status?:      IndustrialSiteStatus;
}): Promise<SiteRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const exists = await (prisma.industrialSite as unknown as SiteModel).findFirst({
    where: { id, organizationId },
  });
  if (!exists) return null;
  const r = await (prisma.industrialSite as unknown as SiteModel).update({
    where: { id },
    data:  patch,
  });
  return row(r);
}
