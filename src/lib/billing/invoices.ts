/**
 * Invoice service (Phase 31).
 * Generates and lists invoices. No real payment processing.
 */

import { getPrisma }      from "@/lib/db/prisma";
import type { InvoiceRecord, InvoiceStatus, Currency } from "./types";

type InvoiceModel = {
  create:    (a: unknown) => Promise<Record<string, unknown>>;
  findMany:  (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  update:    (a: unknown) => Promise<Record<string, unknown>>;
};

async function model(): Promise<InvoiceModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).invoice as InvoiceModel) : null;
}

function rowToInvoice(r: Record<string, unknown>): InvoiceRecord {
  return {
    id:             String(r.id),
    organizationId: String(r.organizationId),
    subscriptionId: String(r.subscriptionId),
    invoiceNumber:  String(r.invoiceNumber),
    currency:       String(r.currency) as Currency,
    subtotal:       String(r.subtotal),
    tax:            String(r.tax),
    total:          String(r.total),
    status:         String(r.status) as InvoiceStatus,
    issuedAt:       new Date(r.issuedAt as string).toISOString(),
    paidAt:         r.paidAt ? new Date(r.paidAt as string).toISOString() : null,
    createdAt:      new Date(r.createdAt as string).toISOString(),
  };
}

/** Generate HMS-YYYY-NNNNN invoice number (DB-backed per-year sequence). */
async function generateInvoiceNumber(m: InvoiceModel): Promise<string> {
  const year   = new Date().getFullYear();
  const prefix = `HMS-${year}-`;
  const latest = await m.findFirst({
    where:   { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
  });
  let seq = 1;
  if (latest) {
    const tail = String(latest.invoiceNumber).slice(prefix.length);
    const n    = parseInt(tail, 10);
    seq = isNaN(n) ? 1 : n + 1;
  }
  return `${prefix}${String(seq).padStart(5, "0")}`;
}

export interface GenerateInvoiceInput {
  organizationId: string;
  subscriptionId: string;
  currency:       Currency;
  subtotal:       number;
  taxRate?:       number; // 0–1, default 0
}

/** Generate a new invoice in ISSUED status. */
export async function generateInvoice(
  input: GenerateInvoiceInput,
): Promise<InvoiceRecord | null> {
  const m = await model();
  if (!m) return null;

  const subtotal = input.subtotal;
  const tax      = subtotal * (input.taxRate ?? 0);
  const total    = subtotal + tax;

  try {
    const row = await m.create({
      data: {
        organizationId: input.organizationId,
        subscriptionId: input.subscriptionId,
        invoiceNumber:  await generateInvoiceNumber(m),
        currency:       input.currency,
        subtotal:       subtotal.toFixed(4),
        tax:            tax.toFixed(4),
        total:          total.toFixed(4),
        status:         "ISSUED",
        issuedAt:       new Date(),
      },
    });
    return rowToInvoice(row);
  } catch {
    return null;
  }
}

/** List invoices for an organization, newest first. */
export async function listInvoices(
  organizationId: string,
  limit = 20,
): Promise<InvoiceRecord[]> {
  const m = await model();
  if (!m) return [];
  try {
    const rows = await m.findMany({
      where:   { organizationId },
      orderBy: { createdAt: "desc" },
      take:    limit,
    });
    return rows.map(rowToInvoice);
  } catch {
    return [];
  }
}

/** Mark an invoice as paid. */
export async function markInvoicePaid(invoiceId: string): Promise<InvoiceRecord | null> {
  const m = await model();
  if (!m) return null;
  try {
    const row = await m.update({
      where: { id: invoiceId },
      data:  { status: "PAID", paidAt: new Date() },
    });
    return rowToInvoice(row);
  } catch {
    return null;
  }
}
