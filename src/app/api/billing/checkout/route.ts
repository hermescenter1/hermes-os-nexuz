/**
 * POST /api/billing/checkout
 *
 * Creates a Stripe Checkout Session for a paid plan subscription.
 * Returns { url } — the caller redirects the browser to this URL.
 *
 * Free ("community") plan: handled locally without Stripe.
 * All paid plans: delegates to Stripe Checkout (hosted payment page).
 *
 * Metadata stored on the Stripe session so the webhook can reconcile:
 *   { organizationId, planId, planSlug, billingCycle }
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireOrgContext }              from "@/lib/billing/context";
import { requirePermission }              from "@/lib/org/rbac";
import { getPlanBySlug }                 from "@/lib/billing/plans";
import { createSubscription }            from "@/lib/billing/subscriptions";
import {
  getStripeClient,
  getStripePriceId,
  getOrCreateStripeCustomer,
  isStripeConfigured,
}                                        from "@/lib/billing/stripe";
import { logger }                        from "@/lib/logger";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const result = await requireOrgContext(req);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { ctx } = result;
  const perm = requirePermission(ctx.role, "manage_billing");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { planSlug, billingCycle } = body as { planSlug?: string; billingCycle?: string };

  if (!planSlug || typeof planSlug !== "string") {
    return NextResponse.json({ error: "planSlug is required" }, { status: 422 });
  }
  const cycle = billingCycle === "YEARLY" ? "YEARLY" : "MONTHLY";

  const plan = await getPlanBySlug(planSlug);
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  // ── Free plan: create local subscription, no Stripe ──────────────────────
  if (parseFloat(plan.monthlyPrice) === 0) {
    const sub = await createSubscription({
      organizationId: ctx.orgId,
      planId:         plan.id,
      billingCycle:   cycle,
      trialDays:      0,
      actorUserId:    ctx.userId,
    });
    if (!sub.ok) return NextResponse.json({ error: sub.error }, { status: 409 });
    return NextResponse.json({ ok: true, subscription: sub.subscription });
  }

  // ── Paid plan: Stripe Checkout ────────────────────────────────────────────
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Payment provider is not configured. Contact support." },
      { status: 503 },
    );
  }

  const priceId = getStripePriceId(planSlug, cycle);
  if (!priceId) {
    logger.warn("[checkout] Missing Stripe Price ID.", { planSlug, cycle });
    return NextResponse.json(
      { error: `No Stripe Price configured for ${planSlug} (${cycle}). Contact support.` },
      { status: 503 },
    );
  }

  const customerId = await getOrCreateStripeCustomer(ctx.orgId);
  if (!customerId) {
    return NextResponse.json({ error: "Failed to create payment profile." }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const stripe = getStripeClient()!;
  try {
    const session = await stripe.checkout.sessions.create({
      customer:   customerId,
      mode:       "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        organizationId: ctx.orgId,
        actorUserId:    ctx.userId,
        planId:         plan.id,
        planSlug,
        billingCycle:   cycle,
      },
      subscription_data: {
        metadata: {
          organizationId: ctx.orgId,
          planId:         plan.id,
        },
      },
      success_url: `${appUrl}/billing?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url:  `${appUrl}/billing?status=canceled`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    logger.error("[checkout] Stripe session creation failed.", { error: String(err), orgId: ctx.orgId });
    return NextResponse.json({ error: "Payment session creation failed." }, { status: 500 });
  }
}
