/**
 * GET /api/billing/plans
 * Public endpoint — no auth required. Returns all active plans.
 */

import { NextResponse } from "next/server";
import { getActivePlans } from "@/lib/billing/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const plans = await getActivePlans();
  return NextResponse.json({ plans });
}
