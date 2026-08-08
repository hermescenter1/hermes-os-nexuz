/**
 * DELETE /api/billing/overrides/[id] — revoke an entitlement override.
 *
 * Billing-Admin only (manage_billing). Cross-tenant safe: the override must
 * belong to the caller org, else 404 (never reveals another tenant's override).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/billing/context";
import { requirePermission } from "@/lib/org/rbac";
import { revokeEntitlementOverride } from "@/lib/billing-governance/runtime/override-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const result = await requireOrgContext(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { ctx } = result;
  const perm = requirePermission(ctx.role, "manage_billing");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const out = await revokeEntitlementOverride({ organizationId: ctx.orgId, overrideId: id, revokedById: ctx.userId });
  if (!out.ok) {
    const status = out.code === "NO_DB" ? 503 : out.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: out.message, code: out.code }, { status });
  }
  return NextResponse.json({ revoked: out.overrideId });
}
