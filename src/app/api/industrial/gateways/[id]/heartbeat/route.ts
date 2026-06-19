/**
 * POST /api/industrial/gateways/[id]/heartbeat
 *
 * Called by the gateway process to signal it is alive.
 * Updates lastSeenAt and sets status → ONLINE.
 * Does NOT write a TelemetryRecord.
 *
 * Auth: API key with industrial.write scope.
 * Binding: the API key MUST be the key registered to this gateway.
 */

import { NextRequest, NextResponse }          from "next/server";
import { requirePlatformAuth }                from "@/lib/api/auth";
import { hasScope }                           from "@/lib/api/scopes";
import { verifyGatewayBinding }               from "@/lib/industrial/gateway-auth";
import { touchGatewayHeartbeat }              from "@/lib/industrial/gateways";
import { recordAuditEvent, INDUSTRIAL_AUDIT } from "@/lib/audit/audit-service";
import { meterIndustrialEvent }               from "@/lib/api/meter";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  if (!hasScope(ctx.scopes, "industrial.write")) {
    return NextResponse.json({ error: "Missing required scope: industrial.write" }, { status: 403 });
  }

  const binding = await verifyGatewayBinding(ctx, id);
  if (!binding.ok) return NextResponse.json({ error: binding.error }, { status: binding.status });

  await touchGatewayHeartbeat(id);

  // Meter as industrial gateway call (not counted in standard api_calls quota)
  meterIndustrialEvent(ctx.orgId, "industrial_gateway_calls");

  recordAuditEvent({
    action:   INDUSTRIAL_AUDIT.GATEWAY_HEARTBEAT,
    entityType: "industrial",
    userId:  undefined,
    entityId: id,
    metadata:  { organizationId: ctx.orgId },
  });

  return NextResponse.json({ ok: true, receivedAt: new Date().toISOString() });
}
