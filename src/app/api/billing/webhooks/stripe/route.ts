/**
 * POST /api/billing/webhooks/stripe
 *
 * Stripe webhook endpoint. Verified via HMAC signature (STRIPE_WEBHOOK_SECRET).
 * This route must NOT be behind session auth — Stripe calls it server-to-server.
 *
 * Phase 96 hardening:
 *   - Raw-body HMAC signature + timestamp-tolerance verification (unchanged).
 *   - Every verified event is CLAIMED through the BillingWebhookEvent unique
 *     (provider, providerEventId) index → duplicates & simultaneous deliveries
 *     are ignored, failures are retryable, successes are never re-applied.
 *   - Subscription state changes go through the deterministic state machine with
 *     out-of-order protection (a strictly older provider event never overwrites
 *     a newer state). Stripe status strings are mapped to internal domain events.
 *   - The organisation is resolved through the SERVER-OWNED local subscription
 *     record (found by stripeSubscriptionId), never from a payload field — a
 *     valid signature proves authenticity, not tenant ownership.
 *   - Unknown events are acknowledged (200) and recorded as safely ignored.
 *   - Audit metadata is redacted through the billing allow-list.
 */

export const dynamic = "force-dynamic";

import type Stripe from "stripe";
import { getStripeClient } from "@/lib/billing/stripe";
import {
  findSubscriptionByStripeId,
  findActiveSubscriptionForOrg,
  linkStripeSubscription,
} from "@/lib/billing/stripe";
import { createSubscription } from "@/lib/billing/subscriptions";
import { getPlanById } from "@/lib/billing/plans";
import { getPrisma } from "@/lib/db/prisma";
import { getNotificationService } from "@/lib/notifications/service";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { logger } from "@/lib/logger";
import {
  BILLING_GOVERNANCE_AUDIT,
  buildBillingAuditMetadata,
  mapStripeEventToDomain,
  type StripeEventView,
} from "@/lib/billing-governance";
import {
  hashObjectReference,
  runIdempotentWebhook,
  type HandlerResult,
  type WebhookEnvelope,
} from "@/lib/billing-governance/webhook-idempotency";
import { prismaWebhookClaimStore } from "@/lib/billing-governance/runtime/webhook-store";
import { applySubscriptionProviderEvent } from "@/lib/billing-governance/runtime/subscription-events";

const PROVIDER = "stripe";

// ─── Stripe type helpers ──────────────────────────────────────────────────────

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const invoiceWithSubscription = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
  };
  const subscription = invoiceWithSubscription.subscription;
  if (typeof subscription === "string") return subscription;
  return subscription?.id ?? null;
}

/** Extract the primary object id referenced by an event (for the audit hash). */
function primaryObjectId(event: Stripe.Event): string | null {
  const obj = event.data.object as { id?: string } | null;
  return obj?.id ?? null;
}

async function orgOwnerUserId(organizationId: string): Promise<string | null> {
  const db = await getPrisma();
  if (!db) return null;
  try {
    const m = (db as Record<string, unknown>).organizationMember as {
      findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
    };
    const member = await m.findFirst({ where: { organizationId, role: "OWNER" }, select: { userId: true } });
    return member ? String(member.userId) : null;
  } catch {
    return null;
  }
}

// ─── Event handlers ───────────────────────────────────────────────────────────

/** Checkout completion CREATES / links a subscription (idempotent via the active-
 *  subscription lookup). Returns APPLIED when it created/linked, IGNORED otherwise. */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<HandlerResult> {
  const meta = session.metadata ?? {};
  const organizationId = meta.organizationId;
  const planId = meta.planId;
  const actorUserId = meta.actorUserId;
  const billingCycle = (meta.billingCycle ?? "MONTHLY") as "MONTHLY" | "YEARLY";
  const stripeSubId =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription as Stripe.Subscription | null)?.id ?? null;

  if (!organizationId || !planId) {
    logger.warn("[stripe.webhook] checkout.session.completed missing metadata.", { sessionId: session.id });
    return "IGNORED";
  }

  const existing = await findActiveSubscriptionForOrg(organizationId);
  if (existing) {
    if (stripeSubId && !existing.stripeSubscriptionId) {
      await linkStripeSubscription(String(existing.id), stripeSubId);
    }
    // Activate via the state machine when still trialing/past-due.
    if (existing.status === "TRIALING" || existing.status === "PAST_DUE") {
      await applySubscriptionProviderEvent({
        localSubscriptionId: String(existing.id),
        event: "ACTIVATE",
        providerEventId: `checkout:${session.id}`,
        providerCreatedAt: new Date(),
      });
    }
    return "APPLIED";
  }

  const sub = await createSubscription({
    organizationId,
    planId,
    billingCycle,
    trialDays: 0,
    actorUserId: actorUserId ?? undefined,
  });
  if (!sub.ok) {
    logger.error("[stripe.webhook] createSubscription failed after checkout.", { error: sub.error, organizationId, planId });
    throw new Error("CHECKOUT_SUBSCRIPTION_CREATE_FAILED"); // retryable
  }
  if (stripeSubId) await linkStripeSubscription(sub.subscription.id, stripeSubId);

  const ownerUserId = await orgOwnerUserId(organizationId);
  if (ownerUserId) {
    const plan = await getPlanById(planId);
    void getNotificationService().create({
      userId: ownerUserId,
      type: "success",
      title: "Subscription Activated",
      message: `Your ${plan?.name ?? "paid"} plan is now active. Thank you!`,
      metadata: { organizationId, planId },
    });
  }
  return "APPLIED";
}

/** Resolve the local, server-owned subscription for a subscription/invoice event
 *  and apply the mapped domain event with out-of-order protection. */
async function handleSubscriptionDomainEvent(
  view: StripeEventView,
  localSubscriptionId: string | null,
  providerEventId: string,
  providerCreatedAt: Date,
): Promise<HandlerResult> {
  const domainEvent = mapStripeEventToDomain(view);
  if (!domainEvent) return "IGNORED"; // informational / unknown → no mutation
  if (!localSubscriptionId) return "IGNORED"; // no local match (or foreign sub) → ignore

  const result = await applySubscriptionProviderEvent({
    localSubscriptionId,
    event: domainEvent,
    providerEventId,
    providerCreatedAt,
  });

  if (!result.applied) {
    // Record the specific ignore reason (duplicate / out-of-order / invalid).
    const action =
      result.reason === "OUT_OF_ORDER"
        ? BILLING_GOVERNANCE_AUDIT.WEBHOOK_OUT_OF_ORDER_IGNORED
        : result.reason === "DUPLICATE"
          ? BILLING_GOVERNANCE_AUDIT.WEBHOOK_DUPLICATE_IGNORED
          : BILLING_GOVERNANCE_AUDIT.WEBHOOK_REJECTED;
    await recordAuditEvent({
      action,
      entityType: "Subscription",
      entityId: localSubscriptionId,
      outcome: "denied",
      metadata: buildBillingAuditMetadata({ provider: PROVIDER, providerEventId, eventType: view.type, failureCode: result.reason } as Record<string, unknown>),
    });
    return "IGNORED";
  }
  return "APPLIED";
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const stripe = getStripeClient();
  if (!stripe) return new Response("Stripe not configured", { status: 503 });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error("[stripe.webhook] STRIPE_WEBHOOK_SECRET is not set.");
    return new Response("Webhook secret not configured", { status: 503 });
  }

  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing stripe-signature header", { status: 400 });

  let event: Stripe.Event;
  try {
    // Verifies HMAC signature AND timestamp tolerance; throws on either failure.
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    logger.warn("[stripe.webhook] Signature verification failed.", { error: String(err) });
    await recordAuditEvent({
      action: BILLING_GOVERNANCE_AUDIT.WEBHOOK_REJECTED,
      entityType: "BillingWebhookEvent",
      outcome: "denied",
      metadata: buildBillingAuditMetadata({ provider: PROVIDER, failureCode: "INVALID_SIGNATURE" } as Record<string, unknown>),
    });
    return new Response("Invalid signature", { status: 400 });
  }

  // Provider environment guard (where available): reject a livemode mismatch.
  const expectLive = process.env.STRIPE_EXPECT_LIVEMODE;
  if (expectLive === "true" || expectLive === "false") {
    if (event.livemode !== (expectLive === "true")) {
      logger.warn("[stripe.webhook] livemode mismatch — rejected.", { livemode: event.livemode });
      return new Response("Environment mismatch", { status: 400 });
    }
  }

  const env: WebhookEnvelope = {
    provider: PROVIDER,
    providerEventId: event.id,
    providerCreatedAt: new Date(event.created * 1000),
    eventType: event.type,
    objectReferenceHash: hashObjectReference(primaryObjectId(event)),
  };

  const outcome = await runIdempotentWebhook(prismaWebhookClaimStore(), env, async (): Promise<HandlerResult> => {
    switch (event.type) {
      case "checkout.session.completed":
        return handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.resumed":
      case "customer.subscription.paused":
      case "customer.subscription.deleted": {
        const s = event.data.object as Stripe.Subscription;
        const local = await findSubscriptionByStripeId(s.id);
        const view: StripeEventView = {
          type: event.type,
          subscriptionStatus: s.status,
          cancelAtPeriodEnd: (s as Stripe.Subscription & { cancel_at_period_end?: boolean }).cancel_at_period_end ?? false,
        };
        return handleSubscriptionDomainEvent(view, local ? String(local.id) : null, env.providerEventId, env.providerCreatedAt);
      }

      case "invoice.payment_succeeded":
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeSubId = getInvoiceSubscriptionId(invoice);
        const local = stripeSubId ? await findSubscriptionByStripeId(stripeSubId) : null;
        const result = await handleSubscriptionDomainEvent(
          { type: event.type },
          local ? String(local.id) : null,
          env.providerEventId,
          env.providerCreatedAt,
        );
        // Owner notification side-effect (best effort).
        if (local) {
          const ownerUserId = await orgOwnerUserId(String(local.organizationId));
          if (ownerUserId) {
            const failed = event.type === "invoice.payment_failed";
            void getNotificationService().create({
              userId: ownerUserId,
              type: failed ? "error" : "success",
              title: failed ? "Payment Failed" : "Payment Successful",
              message: failed
                ? "We were unable to process your subscription payment. Please update your payment method to avoid interruption."
                : "Your subscription payment was processed successfully.",
              metadata: { organizationId: String(local.organizationId) },
            });
          }
        }
        return result;
      }

      default:
        logger.info("[stripe.webhook] Unhandled event type — acknowledged.", { type: event.type });
        return "IGNORED";
    }
  });

  logger.info("[stripe.webhook] Event processed.", { type: event.type, id: event.id, outcome });

  // Always 200 after a verified event so Stripe does not retry indefinitely.
  return new Response(JSON.stringify({ received: true, outcome }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
