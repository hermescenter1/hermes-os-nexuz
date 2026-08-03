/**
 * POST /api/billing/payments/[id]/refund — record a manual, bounded refund.
 *
 * Billing-Admin only (manage_billing). Manual only — no provider call. The
 * amount is bounded to (paid - already refunded); the payment must belong to the
 * caller org (else 404, no existence leak). Reason required; fully audited.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/billing/context";
import { requirePermission } from "@/lib/org/rbac";
import { recordManualRefund } from "@/lib/billing-governance/runtime/refund-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const result = await requireOrgContext(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { ctx } = result;
  const perm = requirePermission(ctx.role, "manage_billing");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const amount = typeof body.amount === "string" ? body.amount : String(body.amount ?? "");
  const reason = String(body.reason ?? "");

  const out = await recordManualRefund({
    organizationId: ctx.orgId,
    paymentId: id,
    amount,
    reason,
    refundedById: ctx.userId,
  });

  if (!out.ok) {
    const status = out.code === "NO_DB" ? 503 : out.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: out.message, code: out.code }, { status });
  }
  return NextResponse.json({ paymentId: out.paymentId, refundedTotal: out.refundedTotal });
}
