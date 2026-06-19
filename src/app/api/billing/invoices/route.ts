/**
 * GET /api/billing/invoices
 * Returns invoice history for the requesting user's organization.
 * Pagination: ?limit=N (max 50).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext }          from "@/lib/billing/context";
import { listInvoices }               from "@/lib/billing/invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await requireOrgContext(req);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { ctx } = result;

  const raw   = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(raw ?? "20", 10) || 20, 1), 50);

  const invoices = await listInvoices(ctx.orgId, limit);
  return NextResponse.json({ invoices });
}
