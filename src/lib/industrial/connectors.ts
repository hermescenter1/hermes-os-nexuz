import { getPrisma }      from "@/lib/db/prisma";
import type { ConnectorRecord, ConnectorType } from "./types";

type ConnectorModel = {
  findMany:  (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  create:    (a: unknown) => Promise<Record<string, unknown>>;
  update:    (a: unknown) => Promise<Record<string, unknown>>;
};

function row(r: Record<string, unknown>): ConnectorRecord {
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    siteId:         r.siteId         as string,
    gatewayId:      r.gatewayId      as string,
    connectorType:  r.connectorType  as ConnectorType,
    name:           r.name           as string,
    enabled:        r.enabled        as boolean,
    config:         (r.config        ?? {}) as Record<string, unknown>,
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
}

export async function listConnectors(organizationId: string, opts?: {
  gatewayId?:      string;
  allowedSiteIds?: string[];
}): Promise<ConnectorRecord[]> {
  if (opts?.allowedSiteIds !== undefined && opts.allowedSiteIds.length === 0) return [];
  const prisma = await getPrisma();
  if (!prisma) return [];
  const where: Record<string, unknown> = { organizationId };
  if (opts?.gatewayId) where.gatewayId = opts.gatewayId;
  if (!opts?.gatewayId && opts?.allowedSiteIds !== undefined) {
    where.siteId = { in: opts.allowedSiteIds };
  }
  const rows = await (prisma.industrialConnectorConfig as unknown as ConnectorModel).findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(row);
}

export async function getConnector(id: string, organizationId: string): Promise<ConnectorRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const r = await (prisma.industrialConnectorConfig as unknown as ConnectorModel).findFirst({
    where: { id, organizationId },
  });
  return r ? row(r) : null;
}

export async function createConnector(params: {
  organizationId: string;
  siteId:         string;
  gatewayId:      string;
  connectorType:  ConnectorType;
  name:           string;
  enabled?:       boolean;
  config?:        Record<string, unknown>;
}): Promise<ConnectorRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const r = await (prisma.industrialConnectorConfig as unknown as ConnectorModel).create({
    data: {
      organizationId: params.organizationId,
      siteId:         params.siteId,
      gatewayId:      params.gatewayId,
      connectorType:  params.connectorType,
      name:           params.name,
      enabled:        params.enabled ?? false,
      config:         params.config  ?? {},
    },
  });
  return row(r);
}

export async function updateConnector(id: string, organizationId: string, patch: {
  name?:    string;
  enabled?: boolean;
  config?:  Record<string, unknown>;
}): Promise<ConnectorRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const exists = await (prisma.industrialConnectorConfig as unknown as ConnectorModel).findFirst({
    where: { id, organizationId },
  });
  if (!exists) return null;
  const r = await (prisma.industrialConnectorConfig as unknown as ConnectorModel).update({
    where: { id },
    data:  patch,
  });
  return row(r);
}
