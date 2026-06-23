/**
 * POST /api/billing/portal
 *
 * Creates a Stripe Billing Portal session for the authenticated user's org.
 * Returns { url } — the caller redirects the browser to this URL so the
 * customer can manage their subscription, update payment methods, and
 * view invoice history directly in Stripe's hosted portal.
 *
 * Only available when Stripe is configured (STRIPE_SECRET_KEY set).
 * Falls back to a 503 if Stripe is not configured.
 *
 * Security: auth is enforced via requireOrgContext (session cookie).
 * No org data is trusted from the request body.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireOrgContext }              from "@/lib/billing/context";
import {
  getStripeClient,
  getOrCreateStripeCustomer,
  isStripeConfigured,
}                                        from "@/lib/billing/stripe";
import { logger }                        from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const result = await requireOrgContext(req);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { ctx } = result;

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Payment provider is not configured. Contact support." },
      { status: 503 },
    );
  }

  const customerId = await getOrCreateStripeCustomer(ctx.orgId);
  if (!customerId) {
    return NextResponse.json(
      { error: "No payment profile found. Please subscribe first." },
      { status: 404 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const stripe = getStripeClient()!;
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: `${appUrl}/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    logger.error("[billing.portal] Stripe portal session creation failed.", {
      error: String(err),
      orgId: ctx.orgId,
    });
    return NextResponse.json(
      { error: "Failed to open billing portal. Please try again." },
      { status: 500 },
    );
  }
}
