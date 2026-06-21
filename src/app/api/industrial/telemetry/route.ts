/**
 * Industrial Telemetry Ingestion + Query
 *
 * POST — batch ingest. API-key only, industrial.write scope, key↔gateway binding.
 *        Metered as industrial_telemetry_events (separate from api_calls quota).
 *        Max batch: 500 readings. receivedAt is ALWAYS server-set.
 *
 * GET  — list recent telemetry. JWT or API-key with industrial.read scope.
 *
 * SAFETY: This route is READ/OBSERVE only in terms of industrial impact.
 *         It writes to Hermes DB only, never to any PLC or control system.
 */

import { NextRequest, NextResponse }          from "next/server";
import { requirePlatformAuth }                from "@/lib/api/auth";
import { requireOrgActor }                    from "@/lib/org/context";
import { requirePermission }                  from "@/lib/org/rbac";
import { hasScope }                           from "@/lib/api/scopes";
import { verifyGatewayBinding }               from "@/lib/industrial/gateway-auth";
import { ingestTelemetry, listTelemetry, validateReading } from "@/lib/industrial/telemetry";
import { getGateway }                         from "@/lib/industrial/gateways";
import { getAllowedSiteIds }                   from "@/lib/site/context";
import { recordAuditEvent, INDUSTRIAL_AUDIT } from "@/lib/audit/audit-service";
import { meterIndustrialEvent }               from "@/lib/api/meter";
import { MAX_TELEMETRY_BATCH }                from "@/lib/industrial/types";
import type { TelemetryReading }              from "@/lib/industrial/types";

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  if (!hasScope(ctx.scopes, "industrial.write")) {
    return NextResponse.json({ error: "Missing required scope: industrial.write" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { gatewayId, readings } = body as { gatewayId?: string; readings?: unknown[] };
  if (!gatewayId || typeof gatewayId !== "string") {
    return NextResponse.json({ error: "gatewayId (IndustrialGateway primary key) is required" }, { status: 400 });
  }
  if (!Array.isArray(readings)) {
    return NextResponse.json({ error: "readings must be an array" }, { status: 400 });
  }
  if (readings.length === 0) {
    return NextResponse.json({ error: "readings array is empty" }, { status: 400 });
  }
  if (readings.length > MAX_TELEMETRY_BATCH) {
    return NextResponse.json({
      error: `Batch exceeds maximum of ${MAX_TELEMETRY_BATCH} readings. Received: ${readings.length}`,
    }, { status: 400 });
  }

  // key↔gateway binding: API key must be the one registered to this gateway
  const binding = await verifyGatewayBinding(ctx, gatewayId);
  if (!binding.ok) return NextResponse.json({ error: binding.error }, { status: binding.status });

  // Validate all readings before writing anything
  const errors = readings
    .map((r, i) => validateReading(r, i))
    .filter(Boolean);
  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", metadata: errors }, { status: 422 });
  }

  const { count } = await ingestTelemetry({
    organizationId: ctx.orgId,
    siteId:         binding.gateway.siteId,
    gatewayId:      gatewayId,
    readings:       readings as TelemetryReading[],
  });

  // Meter N events (one per reading, not one per HTTP call)
  meterIndustrialEvent(ctx.orgId, "industrial_telemetry_events", count);

  recordAuditEvent({
    action:   INDUSTRIAL_AUDIT.TELEMETRY_INGESTED,
    entityType: "industrial",
    userId:  undefined,
    entityId: gatewayId,
    metadata:  { count, organizationId: ctx.orgId, siteId: binding.gateway.siteId },
  });

  return NextResponse.json({ ingested: count }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  if (ctx.authMethod === "apikey" && !hasScope(ctx.scopes, "industrial.read")) {
    return NextResponse.json({ error: "Missing required scope: industrial.read" }, { status: 403 });
  }

  let allowedSiteIds: string[] | undefined;
  if (ctx.authMethod === "jwt") {
    const member = await requireOrgActor(req, ctx.orgId);
    if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
    const perm = requirePermission(member.ctx.role, "view_industrial");
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
    if (member.ctx.userId) {
      allowedSiteIds = await getAllowedSiteIds(member.ctx.userId, ctx.orgId);
    }
  }

  const q = req.nextUrl.searchParams;
  const gatewayId = q.get("gatewayId") ?? undefined;
  const assetId   = q.get("assetId")   ?? undefined;
  const tag       = q.get("tag")        ?? undefined;
  const limit     = Math.min(500, Math.max(1, parseInt(q.get("limit") ?? "100", 10) || 100));

  const records = await listTelemetry(ctx.orgId, { gatewayId, assetId, tag, limit, allowedSiteIds });
  return NextResponse.json({ records, count: records.length });
}
