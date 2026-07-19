/**
 * GET /api/billing/invoices
 * Returns invoice history for the requesting user's organization.
 * Pagination: ?limit=N (max 50).
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission }          from "@/lib/org/rbac";
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
  // PHASE 87L.6G — sensitive billing READ. requireOrgContext establishes
  // authentication and the tenant boundary but grants no privilege, so an
  // ordinary org member (including an ENGINEER) could read the whole
  // organisation's billing history. "view_billing" is OWNER/ADMIN/
  // BILLING_ADMIN only and is the same permission the mutations already use.
  const perm = requirePermission(ctx.role, "view_billing");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });


  const raw   = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(raw ?? "20", 10) || 20, 1), 50);

  const invoices = await listInvoices(ctx.orgId, limit);
  return NextResponse.json({ invoices });
}
