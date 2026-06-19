/**
 * Billing subscription API (Phase 31).
 *
 * GET    /api/billing/subscription         — current subscription
 * POST   /api/billing/subscription         — create subscription
 * PATCH  /api/billing/subscription         — change plan (upgrade/downgrade)
 * DELETE /api/billing/subscription         — cancel
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext }          from "@/lib/billing/context";
import {
  getSubscription,
  createSubscription,
  changePlan,
  cancelSubscription,
  renewSubscription,
}                                     from "@/lib/billing/subscriptions";
import type { BillingCycle }          from "@/lib/billing/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const result = await requireOrgContext(req);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { ctx } = result;
  const subscription = await getSubscription(ctx.orgId);
  return NextResponse.json({ subscription });
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const result = await requireOrgContext(req);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { ctx } = result;

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const { planId, billingCycle, trialDays } = body as {
    planId?:      string;
    billingCycle?: BillingCycle;
    trialDays?:   number;
  };

  if (!planId)      return NextResponse.json({ error: "planId is required" },      { status: 400 });
  if (!billingCycle) return NextResponse.json({ error: "billingCycle is required" }, { status: 400 });
  if (billingCycle !== "MONTHLY" && billingCycle !== "YEARLY") {
    return NextResponse.json({ error: "billingCycle must be MONTHLY or YEARLY" }, { status: 400 });
  }

  const out = await createSubscription({
    organizationId: ctx.orgId,
    planId,
    billingCycle,
    trialDays,
    actorUserId:    ctx.userId,
  });

  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 409 });
  return NextResponse.json({ subscription: out.subscription }, { status: 201 });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const result = await requireOrgContext(req);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { ctx } = result;

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const { planId } = body as { planId?: string };

  if (!planId) return NextResponse.json({ error: "planId is required" }, { status: 400 });

  const out = await changePlan({
    organizationId: ctx.orgId,
    newPlanId:      planId,
    actorUserId:    ctx.userId,
  });

  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 422 });
  return NextResponse.json({ subscription: out.subscription });
}

// ── PUT (renew) ───────────────────────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  const result = await requireOrgContext(req);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { ctx } = result;

  const out = await renewSubscription({
    organizationId: ctx.orgId,
    actorUserId:    ctx.userId,
  });

  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 422 });
  return NextResponse.json({ subscription: out.subscription });
}

// ── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const result = await requireOrgContext(req);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { ctx } = result;

  const out = await cancelSubscription({
    organizationId: ctx.orgId,
    actorUserId:    ctx.userId,
  });

  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 422 });
  return NextResponse.json({ ok: true });
}
