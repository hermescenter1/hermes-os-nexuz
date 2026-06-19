/**
 * Gateway authentication helper — Phase 35.
 *
 * Enforces the key↔gateway binding: the API key used to authenticate
 * MUST be the same key registered to the gateway being accessed.
 * This prevents a key from one gateway ingesting data on behalf of
 * a different gateway, even within the same organization.
 */

import { getPrisma }              from "@/lib/db/prisma";
import type { PlatformActorContext } from "@/lib/api/types";
import type { GatewayRecord }       from "./types";

function rowToGateway(r: Record<string, unknown>): GatewayRecord {
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    siteId:         r.siteId         as string,
    name:           r.name           as string,
    gatewayId:      r.gatewayId      as string,
    status:         r.status         as GatewayRecord["status"],
    version:        (r.version        ?? null) as string | null,
    apiKeyId:       (r.apiKeyId       ?? null) as string | null,
    lastSeenAt:     r.lastSeenAt ? new Date(r.lastSeenAt as string).toISOString() : null,
    metadata:       (r.metadata        ?? {}) as Record<string, unknown>,
    revokedAt:      r.revokedAt ? new Date(r.revokedAt as string).toISOString() : null,
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
}

/**
 * Verifies that:
 *  1. The gateway exists and belongs to ctx.orgId
 *  2. The gateway has not been revoked
 *  3. The API key (ctx.keyId) matches the gateway's registered apiKeyId
 *
 * Only valid for API-key auth (ctx.authMethod === "apikey").
 */
export async function verifyGatewayBinding(
  ctx:       PlatformActorContext,
  gatewayDbId: string,
): Promise<{ ok: true; gateway: GatewayRecord } | { ok: false; error: string; status: number }> {
  if (ctx.authMethod !== "apikey" || !ctx.keyId) {
    return { ok: false, error: "Gateway operations require API-key authentication", status: 401 };
  }

  const prisma = await getPrisma();
  if (!prisma) return { ok: false, error: "Database unavailable", status: 503 };

  const gw = await (prisma.industrialGateway as unknown as {
    findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  }).findFirst({
    where: { id: gatewayDbId, organizationId: ctx.orgId },
  });

  if (!gw) {
    return { ok: false, error: "Gateway not found", status: 404 };
  }
  if (gw.revokedAt) {
    return { ok: false, error: "Gateway has been revoked", status: 403 };
  }
  // key↔gateway binding check
  if (!gw.apiKeyId || gw.apiKeyId !== ctx.keyId) {
    return { ok: false, error: "API key is not authorized for this gateway", status: 403 };
  }

  return { ok: true, gateway: rowToGateway(gw) };
}
