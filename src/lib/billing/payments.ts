/**
 * Payment service (Phase 31).
 *
 * Foundation only — no real payment provider.
 * Payments are recorded manually; future phases attach Stripe/Zarinpal here.
 */

import { getPrisma }        from "@/lib/db/prisma";
import { recordAuditEvent, BILLING_AUDIT } from "@/lib/audit/audit-service";
import { markInvoicePaid }  from "./invoices";
import type { PaymentStatus, Currency } from "./types";

type PaymentModel = {
  create:   (a: unknown) => Promise<Record<string, unknown>>;
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
  update:   (a: unknown) => Promise<Record<string, unknown>>;
};

async function model(): Promise<PaymentModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).payment as PaymentModel) : null;
}

export interface PaymentRecord {
  id:                string;
  invoiceId:         string;
  provider:          string;
  providerReference: string | null;
  amount:            string;
  currency:          Currency;
  status:            PaymentStatus;
  createdAt:         string;
}

function rowToPayment(r: Record<string, unknown>): PaymentRecord {
  return {
    id:                String(r.id),
    invoiceId:         String(r.invoiceId),
    provider:          String(r.provider),
    providerReference: r.providerReference ? String(r.providerReference) : null,
    amount:            String(r.amount),
    currency:          String(r.currency) as Currency,
    status:            String(r.status) as PaymentStatus,
    createdAt:         new Date(r.createdAt as string).toISOString(),
  };
}

export interface RecordPaymentInput {
  invoiceId:  string;
  amount:     number;
  currency:   Currency;
  actorUserId?: string;
}

/**
 * Record a manual payment and mark the invoice as PAID.
 * Provider is "manual" until a real provider is integrated.
 */
export async function recordManualPayment(
  input: RecordPaymentInput,
): Promise<{ ok: true; payment: PaymentRecord } | { ok: false; error: string }> {
  const m = await model();
  if (!m) return { ok: false, error: "Database unavailable" };

  try {
    const row = await m.create({
      data: {
        invoiceId: input.invoiceId,
        provider:  "manual",
        amount:    input.amount.toFixed(4),
        currency:  input.currency,
        status:    "SUCCEEDED",
      },
    });
    const payment = rowToPayment(row);

    await markInvoicePaid(input.invoiceId);

    await recordAuditEvent({
      userId:     input.actorUserId,
      action:     BILLING_AUDIT.PAYMENT_RECORDED,
      entityType: "Payment",
      entityId:   payment.id,
      metadata:   { invoiceId: input.invoiceId, amount: input.amount, currency: input.currency },
    });

    return { ok: true, payment };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** List payment history for an invoice. */
export async function listPayments(invoiceId: string): Promise<PaymentRecord[]> {
  const m = await model();
  if (!m) return [];
  try {
    const rows = await m.findMany({
      where:   { invoiceId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(rowToPayment);
  } catch {
    return [];
  }
}
