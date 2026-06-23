/**
 * Stripe client and helpers (Phase 48C).
 *
 * Pattern: all public functions return null / false when Stripe is not
 * configured (STRIPE_SECRET_KEY absent). Callers degrade gracefully and fall
 * back to the existing manual-payment flow rather than throwing.
 *
 * Price ID resolution: each paid plan exposes Stripe Price IDs via env vars.
 * Convention: STRIPE_PRICE_{SLUG_UPPER}_{MONTHLY|YEARLY}
 *   e.g. STRIPE_PRICE_PROFESSIONAL_MONTHLY=price_xxx
 *
 * Customer storage: Stripe Customer IDs are stored on Organization.stripeCustomerId
 * and on Subscription.stripeSubscriptionId, written on first checkout/webhook.
 */

import Stripe from "stripe";
import { getPrisma } from "@/lib/db/prisma";
import { logger }    from "@/lib/logger";

// ─── Client ──────────────────────────────────────────────────────────────────

let _stripe: Stripe | null = null;

export function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  _stripe ??= new Stripe(key);
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

// ─── Price ID resolution ──────────────────────────────────────────────────────

export function getStripePriceId(
  planSlug:     string,
  billingCycle: "MONTHLY" | "YEARLY",
): string | null {
  const envKey = `STRIPE_PRICE_${planSlug.toUpperCase()}_${billingCycle}`;
  return process.env[envKey] ?? null;
}

// ─── Customer management ──────────────────────────────────────────────────────

type OrgModel = {
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
  update:     (a: unknown) => Promise<Record<string, unknown>>;
};

async function orgModel(): Promise<OrgModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).organization as OrgModel) : null;
}

/**
 * Returns the Stripe Customer ID for an org, creating it if it doesn't exist yet.
 * Persists the customer ID to Organization.stripeCustomerId.
 */
export async function getOrCreateStripeCustomer(
  organizationId: string,
): Promise<string | null> {
  const stripe = getStripeClient();
  if (!stripe) return null;

  const m = await orgModel();
  if (!m) return null;

  try {
    const org = await m.findUnique({ where: { id: organizationId } });
    if (!org) return null;

    // Already has a customer — return it
    if (org.stripeCustomerId) return String(org.stripeCustomerId);

    // Create new Stripe customer
    const customer = await stripe.customers.create({
      name:     String(org.name),
      metadata: { organizationId },
    });

    // Persist to DB
    await m.update({
      where: { id: organizationId },
      data:  { stripeCustomerId: customer.id },
    });

    logger.info("[stripe] Customer created.", { organizationId, customerId: customer.id });
    return customer.id;
  } catch (err) {
    logger.error("[stripe] getOrCreateStripeCustomer failed.", {
      error: String(err),
      organizationId,
    });
    return null;
  }
}

// ─── Subscription lookup ──────────────────────────────────────────────────────

type SubModel = {
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  update:    (a: unknown) => Promise<Record<string, unknown>>;
};

async function subModel(): Promise<SubModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).subscription as SubModel) : null;
}

/** Find the local Subscription row for a given Stripe subscription ID. */
export async function findSubscriptionByStripeId(
  stripeSubscriptionId: string,
): Promise<Record<string, unknown> | null> {
  const m = await subModel();
  if (!m) return null;
  try {
    return await m.findFirst({ where: { stripeSubscriptionId } });
  } catch {
    return null;
  }
}

/** Find the local Subscription row for the org's current active subscription. */
export async function findActiveSubscriptionForOrg(
  organizationId: string,
): Promise<Record<string, unknown> | null> {
  const m = await subModel();
  if (!m) return null;
  try {
    return await m.findFirst({
      where:   { organizationId, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] } },
      orderBy: { createdAt: "desc" },
    });
  } catch {
    return null;
  }
}

/** Set stripeSubscriptionId on a local Subscription row. */
export async function linkStripeSubscription(
  localSubId:          string,
  stripeSubscriptionId: string,
): Promise<void> {
  const m = await subModel();
  if (!m) return;
  try {
    await m.update({ where: { id: localSubId }, data: { stripeSubscriptionId } });
  } catch (err) {
    logger.error("[stripe] linkStripeSubscription failed.", { error: String(err), localSubId });
  }
}

// ─── Stripe status → local status mapping ────────────────────────────────────

export function mapStripeStatus(
  stripeStatus: string,
): "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED" {
  switch (stripeStatus) {
    case "trialing":         return "TRIALING";
    case "active":           return "ACTIVE";
    case "past_due":         return "PAST_DUE";
    case "canceled":
    case "cancelled":        return "CANCELED";
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
    default:                 return "PAST_DUE";
  }
}
