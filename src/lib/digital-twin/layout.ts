import { getPrisma }      from "@/lib/db/prisma";
import type { TwinLayoutRecord } from "./types";

type LayoutModel = {
  findMany:  (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  create:    (a: unknown) => Promise<Record<string, unknown>>;
  update:    (a: unknown) => Promise<Record<string, unknown>>;
};

function rowToLayout(r: Record<string, unknown>): TwinLayoutRecord {
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    siteId:         r.siteId         as string,
    name:           r.name           as string,
    layoutData:     (r.layoutData    ?? {}) as Record<string, unknown>,
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
}

export async function listLayouts(organizationId: string, siteId?: string): Promise<TwinLayoutRecord[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];
  const where: Record<string, unknown> = { organizationId };
  if (siteId) where.siteId = siteId;
  const rows = await (prisma.digitalTwinLayout as unknown as LayoutModel).findMany({
    where,
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(rowToLayout);
}

export async function getLayout(id: string, organizationId: string): Promise<TwinLayoutRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const r = await (prisma.digitalTwinLayout as unknown as LayoutModel).findFirst({
    where: { id, organizationId },
  });
  return r ? rowToLayout(r) : null;
}

export async function createLayout(params: {
  organizationId: string;
  siteId:         string;
  name:           string;
  layoutData?:    Record<string, unknown>;
}): Promise<TwinLayoutRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const r = await (prisma.digitalTwinLayout as unknown as LayoutModel).create({
    data: {
      organizationId: params.organizationId,
      siteId:         params.siteId,
      name:           params.name,
      layoutData:     params.layoutData ?? {},
    },
  });
  return rowToLayout(r);
}

export async function updateLayout(id: string, organizationId: string, patch: {
  name?:       string;
  layoutData?: Record<string, unknown>;
}): Promise<TwinLayoutRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const exists = await (prisma.digitalTwinLayout as unknown as LayoutModel).findFirst({
    where: { id, organizationId },
  });
  if (!exists) return null;
  const r = await (prisma.digitalTwinLayout as unknown as LayoutModel).update({
    where: { id },
    data:  patch,
  });
  return rowToLayout(r);
}
