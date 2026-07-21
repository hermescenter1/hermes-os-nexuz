/**
 * Billing payments API (Phase 31).
 *
 * POST /api/billing/payments           — record a manual payment against an invoice
 * GET  /api/billing/payments?invoiceId — list payment history for an invoice
 */

import { NextRequest, NextResponse }    from "next/server";
import { requireOrgContext }             from "@/lib/billing/context";
import { requirePermission }             from "@/lib/org/rbac";
import { recordManualPayment, listPayments } from "@/lib/billing/payments";
import { getInvoiceById }                from "@/lib/billing/invoices";
import type { Currency }                 from "@/lib/billing/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const result = await requireOrgContext(req);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { ctx } = result;
  // Financial mutation → requires the manage_billing privilege (OWNER / ADMIN /
  // BILLING_ADMIN), not mere org membership (Phase SECURITY-8 amendment).
  const perm = requirePermission(ctx.role, "manage_billing");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const { invoiceId, amount, currency } = body as {
    invoiceId?: string;
    amount?:    number;
    currency?:  Currency;
  };

  if (!invoiceId) return NextResponse.json({ error: "invoiceId is required" }, { status: 400 });
  if (typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }
  if (!currency) return NextResponse.json({ error: "currency is required" }, { status: 400 });

  // Phase 86C4B2B1D-SECURITY-8: tenant isolation. recordManualPayment marks the
  // invoice SUCCEEDED/PAID with no ownership check, so ANY authenticated member
  // of ANY org could mark ANY invoice paid by id (cross-tenant financial
  // integrity break). Verify the invoice belongs to the caller's organization
  // BEFORE recording the payment; a foreign or missing invoice gets 404.
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice || invoice.organizationId !== ctx.orgId) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const out = await recordManualPayment({
    invoiceId,
    amount,
    currency,
    actorUserId: ctx.userId,
  });

  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 422 });
  return NextResponse.json({ payment: out.payment }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const result = await requireOrgContext(req);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const invoiceId = req.nextUrl.searchParams.get("invoiceId");
  if (!invoiceId) return NextResponse.json({ error: "invoiceId query param is required" }, { status: 400 });

  // PHASE 90: same tenant-isolation guard the POST above already applies.
  // listPayments resolves by invoice id alone, so without this check any
  // member of any organization could read another tenant's payment history
  // (amounts, currencies, timestamps) by guessing or harvesting an invoice id.
  // A foreign or missing invoice yields 404 — the existence of another
  // tenant's invoice is never disclosed.
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice || invoice.organizationId !== result.ctx.orgId) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const payments = await listPayments(invoiceId);
  return NextResponse.json({ payments });
}
