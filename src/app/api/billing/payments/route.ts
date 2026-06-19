/**
 * Billing payments API (Phase 31).
 *
 * POST /api/billing/payments           — record a manual payment against an invoice
 * GET  /api/billing/payments?invoiceId — list payment history for an invoice
 */

import { NextRequest, NextResponse }    from "next/server";
import { requireOrgContext }             from "@/lib/billing/context";
import { recordManualPayment, listPayments } from "@/lib/billing/payments";
import type { Currency }                 from "@/lib/billing/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const result = await requireOrgContext(req);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { ctx } = result;

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

  const payments = await listPayments(invoiceId);
  return NextResponse.json({ payments });
}
