import { getPrisma }      from "@/lib/db/prisma";
import type { GatewayRecord, IndustrialGatewayStatus } from "./types";

type GatewayModel = {
  findMany:  (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  create:    (a: unknown) => Promise<Record<string, unknown>>;
  update:    (a: unknown) => Promise<Record<string, unknown>>;
};

export function rowToGateway(r: Record<string, unknown>): GatewayRecord {
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    siteId:         r.siteId         as string,
    name:           r.name           as string,
    gatewayId:      r.gatewayId      as string,
    status:         r.status         as IndustrialGatewayStatus,
    version:        (r.version        ?? null) as string | null,
    apiKeyId:       (r.apiKeyId       ?? null) as string | null,
    lastSeenAt:     r.lastSeenAt ? new Date(r.lastSeenAt as string).toISOString() : null,
    metadata:       (r.metadata        ?? {}) as Record<string, unknown>,
    revokedAt:      r.revokedAt ? new Date(r.revokedAt as string).toISOString() : null,
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
}

export async function listGateways(
  organizationId:  string,
  siteId?:         string,
  allowedSiteIds?: string[],
): Promise<GatewayRecord[]> {
  if (allowedSiteIds !== undefined && allowedSiteIds.length === 0) return [];
  const prisma = await getPrisma();
  if (!prisma) return [];
  const where: Record<string, unknown> = { organizationId };
  if (siteId) {
    where.siteId = siteId;
  } else if (allowedSiteIds !== undefined) {
    where.siteId = { in: allowedSiteIds };
  }
  const rows = await (prisma.industrialGateway as unknown as GatewayModel).findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(rowToGateway);
}

export async function getGateway(id: string, organizationId: string): Promise<GatewayRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const r = await (prisma.industrialGateway as unknown as GatewayModel).findFirst({
    where: { id, organizationId },
  });
  return r ? rowToGateway(r) : null;
}

export async function createGateway(params: {
  organizationId: string;
  siteId:         string;
  name:           string;
  gatewayId:      string;
  version?:       string;
  apiKeyId?:      string;
  metadata?:      Record<string, unknown>;
}): Promise<GatewayRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const r = await (prisma.industrialGateway as unknown as GatewayModel).create({
    data: {
      organizationId: params.organizationId,
      siteId:         params.siteId,
      name:           params.name,
      gatewayId:      params.gatewayId,
      status:         "OFFLINE",
      version:        params.version  ?? null,
      apiKeyId:       params.apiKeyId ?? null,
      metadata:       params.metadata ?? {},
    },
  });
  return rowToGateway(r);
}

export async function updateGateway(id: string, organizationId: string, patch: {
  name?:     string;
  version?:  string | null;
  apiKeyId?: string | null;
  metadata?: Record<string, unknown>;
  status?:   IndustrialGatewayStatus;
}): Promise<GatewayRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const exists = await (prisma.industrialGateway as unknown as GatewayModel).findFirst({
    where: { id, organizationId },
  });
  if (!exists) return null;
  const r = await (prisma.industrialGateway as unknown as GatewayModel).update({
    where: { id },
    data:  patch,
  });
  return rowToGateway(r);
}

export async function revokeGateway(id: string, organizationId: string): Promise<GatewayRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const exists = await (prisma.industrialGateway as unknown as GatewayModel).findFirst({
    where: { id, organizationId },
  });
  if (!exists || exists.revokedAt) return null;
  const r = await (prisma.industrialGateway as unknown as GatewayModel).update({
    where: { id },
    data:  { revokedAt: new Date(), status: "REVOKED" },
  });
  return rowToGateway(r);
}

export async function touchGatewayHeartbeat(id: string): Promise<void> {
  const prisma = await getPrisma();
  if (!prisma) return;
  await (prisma.industrialGateway as unknown as GatewayModel).update({
    where: { id },
    data:  { lastSeenAt: new Date(), status: "ONLINE" },
  });
}
