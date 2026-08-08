// PHASE 96 runtime — manual refund recording.
//
// Refunds are MANUAL, Billing-Admin only (enforced at the route), bounded (never
// more than paid minus already-refunded), idempotent-safe, and audited. This
// records the refund in the local ledger only — it makes NO provider call.
// Money is handled as decimal strings / integer minor units (no JS float).

import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { BILLING_GOVERNANCE_AUDIT, buildBillingAuditMetadata } from "../audit";
import { compareMoney, fromMinorUnits, refundWithinBounds, toMinorUnits } from "../money";

export type RefundResult =
  | { ok: true; paymentId: string; refundedTotal: string }
  | { ok: false; code: "NO_DB" | "NOT_FOUND" | "OUT_OF_BOUNDS" | "VALIDATION"; message: string };

export interface RecordRefundInput {
  organizationId: string; // server-derived caller org
  paymentId: string;
  amount: string; // decimal string
  reason: string;
  refundedById: string;
}

/** Record a bounded manual refund against a payment owned by the caller org. */
export async function recordManualRefund(input: RecordRefundInput): Promise<RefundResult> {
  if (!input.reason || input.reason.trim().length < 3) return { ok: false, code: "VALIDATION", message: "reason required" };

  const client = (await getPrisma()) as unknown as PrismaClient | null;
  if (!client) return { ok: false, code: "NO_DB", message: "database unavailable" };

  const payment = await client.payment.findUnique({
    where: { id: input.paymentId },
    include: { invoice: { select: { organizationId: true } } },
  });
  // Cross-tenant safe: unknown OR foreign payment → NOT_FOUND (no existence leak).
  if (!payment || payment.invoice.organizationId !== input.organizationId) {
    return { ok: false, code: "NOT_FOUND", message: "payment not found" };
  }

  const amountPaid = payment.amount.toString();
  const alreadyRefunded = payment.refundedAmount.toString();
  if (!refundWithinBounds({ refund: input.amount, amountPaid, alreadyRefunded })) {
    return { ok: false, code: "OUT_OF_BOUNDS", message: "refund exceeds refundable amount" };
  }

  // New refunded total = alreadyRefunded + amount (bounded above by amountPaid).
  const refundedTotal = fromMinorUnits(toMinorUnits(alreadyRefunded) + toMinorUnits(input.amount));
  const fullyRefunded = compareMoney(refundedTotal, amountPaid) === 0;

  await client.payment.update({
    where: { id: payment.id },
    data: {
      refundedAmount: refundedTotal as unknown as never,
      refundedAt: new Date(),
      refundReason: input.reason.trim(),
      refundedById: input.refundedById,
      ...(fullyRefunded ? { status: "REFUNDED" as unknown as never } : {}),
    },
  });

  await recordAuditEvent({
    action: BILLING_GOVERNANCE_AUDIT.REFUND_RECORDED,
    entityType: "Payment",
    entityId: payment.id,
    organizationId: input.organizationId,
    userId: input.refundedById,
    outcome: "success",
    metadata: buildBillingAuditMetadata({
      organizationId: input.organizationId,
      paymentId: payment.id,
      amount: input.amount,
      currency: payment.currency as unknown as string,
      reason: input.reason.trim(),
      approvedBy: input.refundedById,
    }),
  });

  return { ok: true, paymentId: payment.id, refundedTotal };
}
