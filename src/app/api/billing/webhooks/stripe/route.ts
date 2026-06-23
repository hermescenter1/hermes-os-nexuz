/**
 * POST /api/billing/webhooks/stripe
 *
 * Stripe webhook endpoint. Verified via HMAC signature (STRIPE_WEBHOOK_SECRET).
 * This route must NOT be behind session auth — Stripe calls it server-to-server.
 *
 * Handled events:
 *   checkout.session.completed        → activate subscription in DB
 *   customer.subscription.updated     → sync status changes from Stripe dashboard
 *   customer.subscription.deleted     → cancel subscription in DB
 *   invoice.payment_succeeded         → mark local invoice paid + notification
 *   invoice.payment_failed            → mark PAST_DUE + notification
 *
 * Security:
 *   - Only stripe.webhooks.constructEvent with the STRIPE_WEBHOOK_SECRET is trusted.
 *   - Raw body is read before any JSON parsing (critical for signature verification).
 *   - Unknown events are acknowledged (200) and ignored — never 4xx unknown events
 *     or Stripe will retry them indefinitely.
 */

export const dynamic = "force-dynamic";

import type Stripe from "stripe";
import { getStripeClient }                 from "@/lib/billing/stripe";
import {
  findSubscriptionByStripeId,
  findActiveSubscriptionForOrg,
  linkStripeSubscription,
  mapStripeStatus,
}                                          from "@/lib/billing/stripe";
import { createSubscription }             from "@/lib/billing/subscriptions";
import { getPlanById }                    from "@/lib/billing/plans";
import { getPrisma }                      from "@/lib/db/prisma";
import { getNotificationService }         from "@/lib/notifications/service";
import { recordAuditEvent, BILLING_AUDIT } from "@/lib/audit/audit-service";
import { logger }                         from "@/lib/logger";

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function updateSubStatus(localSubId: string, status: string): Promise<void> {
  const db = await getPrisma();
  if (!db) return;
  try {
    const m = (db as Record<string, unknown>).subscription as {
      update: (a: unknown) => Promise<unknown>;
    };
    await m.update({ where: { id: localSubId }, data: { status, updatedAt: new Date() } });
  } catch (err) {
    logger.error("[stripe.webhook] updateSubStatus failed.", { error: String(err), localSubId });
  }
}

async function orgOwnerUserId(organizationId: string): Promise<string | null> {
  const db = await getPrisma();
  if (!db) return null;
  try {
    const m = (db as Record<string, unknown>).organizationMember as {
      findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
    };
    const member = await m.findFirst({
      where:   { organizationId, role: "OWNER" },
      select:  { userId: true },
    });
    return member ? String(member.userId) : null;
  } catch {
    return null;
  }
}

// ─── Event handlers ───────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const meta = session.metadata ?? {};
  const organizationId  = meta.organizationId;
  const planId          = meta.planId;
  const actorUserId     = meta.actorUserId;
  const billingCycle    = (meta.billingCycle ?? "MONTHLY") as "MONTHLY" | "YEARLY";
  const stripeSubId     = typeof session.subscription === "string"
    ? session.subscription
    : (session.subscription as Stripe.Subscription | null)?.id ?? null;

  if (!organizationId || !planId) {
    logger.warn("[stripe.webhook] checkout.session.completed missing metadata.", { sessionId: session.id });
    return;
  }

  // Check if we already have an active local subscription
  const existing = await findActiveSubscriptionForOrg(organizationId);

  if (existing) {
    // Link the Stripe subscription ID if not already linked
    if (stripeSubId && !existing.stripeSubscriptionId) {
      await linkStripeSubscription(String(existing.id), stripeSubId);
    }
    // Activate if still trialing
    if (existing.status === "TRIALING" || existing.status === "PAST_DUE") {
      await updateSubStatus(String(existing.id), "ACTIVE");
    }
    logger.info("[stripe.webhook] Linked Stripe subscription to existing.", {
      localSubId: existing.id, stripeSubId, organizationId,
    });
    return;
  }

  // Create new local subscription (Stripe already collected payment)
  const sub = await createSubscription({
    organizationId,
    planId,
    billingCycle,
    trialDays:   0, // already paid
    actorUserId: actorUserId ?? undefined,
  });

  if (!sub.ok) {
    logger.error("[stripe.webhook] createSubscription failed after checkout.", {
      error: sub.error, organizationId, planId,
    });
    return;
  }

  if (stripeSubId) {
    await linkStripeSubscription(sub.subscription.id, stripeSubId);
  }

  // Notify org owner
  const ownerUserId = await orgOwnerUserId(organizationId);
  if (ownerUserId) {
    const plan = await getPlanById(planId);
    void getNotificationService().create({
      userId:  ownerUserId,
      type:    "success",
      title:   "Subscription Activated",
      message: `Your ${plan?.name ?? "paid"} plan is now active. Thank you!`,
      metadata: { organizationId, planId, stripeSubId },
    });
  }

  logger.info("[stripe.webhook] Subscription created from checkout.", {
    localSubId: sub.subscription.id, stripeSubId, organizationId,
  });
}

async function handleSubscriptionUpdated(stripeSub: Stripe.Subscription): Promise<void> {
  const local = await findSubscriptionByStripeId(stripeSub.id);
  if (!local) {
    logger.warn("[stripe.webhook] customer.subscription.updated — no local match.", { id: stripeSub.id });
    return;
  }

  const newStatus = mapStripeStatus(stripeSub.status);
  await updateSubStatus(String(local.id), newStatus);
  logger.info("[stripe.webhook] Subscription status synced.", {
    localSubId: local.id,
    stripeId:   stripeSub.id,
    status:     newStatus,
  });
}

async function handleSubscriptionDeleted(stripeSub: Stripe.Subscription): Promise<void> {
  const local = await findSubscriptionByStripeId(stripeSub.id);
  if (!local) return;

  await updateSubStatus(String(local.id), "CANCELED");

  await recordAuditEvent({
    action:     BILLING_AUDIT.SUBSCRIPTION_CANCELED,
    entityType: "Subscription",
    entityId:   String(local.id),
    metadata:   { stripeId: stripeSub.id, source: "stripe_webhook" },
  });

  // Notify org owner
  const ownerUserId = await orgOwnerUserId(String(local.organizationId));
  if (ownerUserId) {
    void getNotificationService().create({
      userId:  ownerUserId,
      type:    "warning",
      title:   "Subscription Canceled",
      message: "Your subscription has been canceled. You can resubscribe at any time.",
      metadata: { stripeId: stripeSub.id },
    });
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  // If the invoice is for a subscription, mark the subscription active
 const invoiceWithSubscription = invoice as Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null;
};

const stripeSubId =
  typeof invoiceWithSubscription.subscription === "string"
    ? invoiceWithSubscription.subscription
    : invoiceWithSubscription.subscription?.id ?? null;

  if (!stripeSubId) return;

  const local = await findSubscriptionByStripeId(stripeSubId);
  if (!local) return;

  if (local.status === "PAST_DUE" || local.status === "TRIALING") {
    await updateSubStatus(String(local.id), "ACTIVE");
  }

  await recordAuditEvent({
    action:     BILLING_AUDIT.PAYMENT_RECORDED,
    entityType: "Subscription",
    entityId:   String(local.id),
    metadata:   {
      stripeInvoiceId: invoice.id,
      amountPaid:      invoice.amount_paid,
      currency:        invoice.currency,
    },
  });

  const ownerUserId = await orgOwnerUserId(String(local.organizationId));
  if (ownerUserId) {
    void getNotificationService().create({
      userId:  ownerUserId,
      type:    "success",
      title:   "Payment Successful",
      message: `Your payment of ${(invoice.amount_paid / 100).toFixed(2)} ${invoice.currency.toUpperCase()} was processed successfully.`,
      metadata: { stripeInvoiceId: invoice.id },
    });
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const stripeSubId = typeof invoice.subscription === "string"
    ? invoice.subscription
    : (invoice.subscription as Stripe.Subscription | null)?.id ?? null;

  if (!stripeSubId) return;

  const local = await findSubscriptionByStripeId(stripeSubId);
  if (!local) return;

  await updateSubStatus(String(local.id), "PAST_DUE");

  const ownerUserId = await orgOwnerUserId(String(local.organizationId));
  if (ownerUserId) {
    void getNotificationService().create({
      userId:  ownerUserId,
      type:    "error",
      title:   "Payment Failed",
      message: "We were unable to process your subscription payment. Please update your payment method to avoid interruption.",
      metadata: { stripeInvoiceId: invoice.id },
    });
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const stripe = getStripeClient();
  if (!stripe) {
    return new Response("Stripe not configured", { status: 503 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error("[stripe.webhook] STRIPE_WEBHOOK_SECRET is not set.");
    return new Response("Webhook secret not configured", { status: 503 });
  }

  const rawBody = await req.text();
  const sig     = req.headers.get("stripe-signature");

  if (!sig) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    logger.warn("[stripe.webhook] Signature verification failed.", { error: String(err) });
    return new Response("Invalid signature", { status: 400 });
  }

  logger.info("[stripe.webhook] Event received.", { type: event.type, id: event.id });

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        // Acknowledge and ignore unknown event types
        logger.info("[stripe.webhook] Unhandled event type — acknowledged.", { type: event.type });
    }
  } catch (err) {
    logger.error("[stripe.webhook] Handler threw.", { type: event.type, error: String(err) });
    // Return 200 anyway — returning 5xx causes Stripe to retry the same event
    // and the error is already logged for investigation.
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
