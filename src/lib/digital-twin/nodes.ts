import { getPrisma }      from "@/lib/db/prisma";
import type { TwinNodeRecord, DigitalTwinNodeType } from "./types";

type NodeModel = {
  findMany:  (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  create:    (a: unknown) => Promise<Record<string, unknown>>;
  update:    (a: unknown) => Promise<Record<string, unknown>>;
  count:     (a: unknown) => Promise<number>;
};

export function rowToNode(r: Record<string, unknown>): TwinNodeRecord {
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    siteId:         r.siteId         as string,
    assetId:        (r.assetId       ?? null) as string | null,
    parentNodeId:   (r.parentNodeId  ?? null) as string | null,
    displayName:    r.displayName    as string,
    nodeType:       r.nodeType       as DigitalTwinNodeType,
    metadata:       (r.metadata       ?? {}) as Record<string, unknown>,
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
}

export async function listNodes(organizationId: string, siteId?: string): Promise<TwinNodeRecord[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];
  const where: Record<string, unknown> = { organizationId };
  if (siteId) where.siteId = siteId;
  const rows = await (prisma.digitalTwinNode as unknown as NodeModel).findMany({
    where,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(rowToNode);
}

export async function getNode(id: string, organizationId: string): Promise<TwinNodeRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const r = await (prisma.digitalTwinNode as unknown as NodeModel).findFirst({
    where: { id, organizationId },
  });
  return r ? rowToNode(r) : null;
}

export async function createNode(params: {
  organizationId: string;
  siteId:         string;
  displayName:    string;
  nodeType:       DigitalTwinNodeType;
  assetId?:       string;
  parentNodeId?:  string;
  metadata?:      Record<string, unknown>;
}): Promise<TwinNodeRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const r = await (prisma.digitalTwinNode as unknown as NodeModel).create({
    data: {
      organizationId: params.organizationId,
      siteId:         params.siteId,
      displayName:    params.displayName,
      nodeType:       params.nodeType,
      assetId:        params.assetId    ?? null,
      parentNodeId:   params.parentNodeId ?? null,
      metadata:       params.metadata   ?? {},
    },
  });
  return rowToNode(r);
}

export async function updateNode(id: string, organizationId: string, patch: {
  displayName?:  string;
  nodeType?:     DigitalTwinNodeType;
  assetId?:      string | null;
  parentNodeId?: string | null;
  metadata?:     Record<string, unknown>;
}): Promise<TwinNodeRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const exists = await (prisma.digitalTwinNode as unknown as NodeModel).findFirst({
    where: { id, organizationId },
  });
  if (!exists) return null;
  const r = await (prisma.digitalTwinNode as unknown as NodeModel).update({
    where: { id },
    data:  patch,
  });
  return rowToNode(r);
}

export async function countNodes(organizationId: string): Promise<number> {
  const prisma = await getPrisma();
  if (!prisma) return 0;
  return (prisma.digitalTwinNode as unknown as NodeModel).count({ where: { organizationId } });
}
