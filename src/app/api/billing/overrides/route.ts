/**
 * Billing entitlement overrides API (Phase 96).
 *
 * GET  /api/billing/overrides   — list active overrides for the caller org
 * POST /api/billing/overrides   — create a time-bounded, audited override
 *
 * Billing-Admin only (manage_billing). The organizationId is ALWAYS the
 * server-derived caller org — never taken from the request body — so an override
 * can never target or grant another organisation's resources.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/billing/context";
import { requirePermission } from "@/lib/org/rbac";
import { createEntitlementOverride, listActiveOverrides } from "@/lib/billing-governance/runtime/override-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await requireOrgContext(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { ctx } = result;
  const perm = requirePermission(ctx.role, "manage_billing");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const overrides = await listActiveOverrides(ctx.orgId);
  // Return a safe projection (no internal ids beyond what the admin owns).
  return NextResponse.json({
    overrides: overrides.map((o) => ({
      id: o.id,
      entitlementKey: o.entitlementKey,
      decision: o.decision,
      limitOverride: o.limitOverride,
      reason: o.reason,
      approvedBy: o.approvedBy,
      effectiveFrom: o.effectiveFrom,
      expiresAt: o.expiresAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const result = await requireOrgContext(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { ctx } = result;
  const perm = requirePermission(ctx.role, "manage_billing");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const expiresAtRaw = body.expiresAt;
  const expiresAt = typeof expiresAtRaw === "string" || typeof expiresAtRaw === "number" ? new Date(expiresAtRaw) : undefined;

  const out = await createEntitlementOverride({
    organizationId: ctx.orgId, // server-derived — never from body
    entitlementKey: String(body.entitlementKey ?? ""),
    decision: body.decision === "DENY" ? "DENY" : "GRANT",
    limitOverride:
      body.limitOverride === undefined || body.limitOverride === null ? null : Number(body.limitOverride),
    reason: String(body.reason ?? ""),
    approvedBy: ctx.userId,
    expiresAt: expiresAt ?? new Date(NaN),
  });

  if (!out.ok) {
    const status = out.code === "NO_DB" ? 503 : 400;
    return NextResponse.json({ error: out.message, code: out.code }, { status });
  }
  return NextResponse.json({ overrideId: out.overrideId }, { status: 201 });
}
