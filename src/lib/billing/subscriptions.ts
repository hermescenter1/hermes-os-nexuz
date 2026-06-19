/**
 * Subscription service (Phase 31).
 *
 * Invariant enforced here: an organization may have at most ONE non-terminal
 * subscription (ACTIVE | TRIALING | PAST_DUE) at a time.
 * upgrade/downgrade transitions the existing subscription rather than creating
 * a second active one.
 */

import { getPrisma }          from "@/lib/db/prisma";
import { recordAuditEvent }   from "@/lib/audit/audit-service";
import { BILLING_AUDIT }      from "@/lib/audit/audit-service";
import { generateInvoice }    from "./invoices";
import { getPlanById }        from "./plans";
import type {
  SubscriptionRecord,
  SubscriptionStatus,
  BillingCycle,
  Currency,
} from "./types";
import { ACTIVE_STATUSES }    from "./types";

type SubModel = {
  findFirst:  (a: unknown) => Promise<Record<string, unknown> | null>;
  findMany:   (a: unknown) => Promise<Record<string, unknown>[]>;
  create:     (a: unknown) => Promise<Record<string, unknown>>;
  update:     (a: unknown) => Promise<Record<string, unknown>>;
};

async function model(): Promise<SubModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).subscription as SubModel) : null;
}

function rowToSub(r: Record<string, unknown>, plan: unknown = null): SubscriptionRecord {
  return {
    id:             String(r.id),
    organizationId: String(r.organizationId),
    planId:         String(r.planId),
    plan:           plan as SubscriptionRecord["plan"],
    status:         String(r.status) as SubscriptionStatus,
    billingCycle:   String(r.billingCycle) as BillingCycle,
    startsAt:       new Date(r.startsAt as string).toISOString(),
    expiresAt:      new Date(r.expiresAt as string).toISOString(),
    autoRenew:      Boolean(r.autoRenew),
    createdAt:      new Date(r.createdAt as string).toISOString(),
  };
}

/** Get the current (non-terminal) subscription for an org, or null. */
export async function getSubscription(
  organizationId: string,
): Promise<SubscriptionRecord | null> {
  const m = await model();
  if (!m) return null;
  try {
    const row = await m.findFirst({
      where:   { organizationId, status: { in: ACTIVE_STATUSES } },
      orderBy: { createdAt: "desc" },
      include: { plan: true },
    });
    if (!row) return null;
    const plan = row.plan ? await getPlanById(String((row.plan as Record<string,unknown>).id)) : null;
    return rowToSub(row, plan);
  } catch {
    return null;
  }
}

export interface CreateSubscriptionInput {
  organizationId: string;
  planId:         string;
  billingCycle:   BillingCycle;
  trialDays?:     number;
  actorUserId?:   string;
}

/** Create a new subscription. Fails if the org already has a non-terminal one. */
export async function createSubscription(
  input: CreateSubscriptionInput,
): Promise<{ ok: true; subscription: SubscriptionRecord } | { ok: false; error: string }> {
  const m = await model();
  if (!m) return { ok: false, error: "Database unavailable" };

  // Enforce one-active-subscription invariant
  const existing = await getSubscription(input.organizationId);
  if (existing) return { ok: false, error: "Organization already has an active subscription. Use upgrade/downgrade instead." };

  const plan = await getPlanById(input.planId);
  if (!plan) return { ok: false, error: "Plan not found" };

  const now      = new Date();
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + (input.trialDays ?? 14));

  try {
    const row = await m.create({
      data: {
        organizationId: input.organizationId,
        planId:         input.planId,
        status:         input.trialDays !== 0 ? "TRIALING" : "ACTIVE",
        billingCycle:   input.billingCycle,
        startsAt:       now,
        expiresAt:      trialEnd,
        autoRenew:      true,
      },
    });
    const sub = rowToSub(row, plan);

    await recordAuditEvent({
      userId:     input.actorUserId,
      action:     BILLING_AUDIT.SUBSCRIPTION_CREATED,
      entityType: "Subscription",
      entityId:   sub.id,
      metadata:   { planId: input.planId, cycle: input.billingCycle, orgId: input.organizationId },
    });

    // Generate initial invoice (zero for trial, full price otherwise)
    const price  = input.billingCycle === "MONTHLY"
      ? parseFloat(plan.monthlyPrice)
      : parseFloat(plan.yearlyPrice);
    const amount = (input.trialDays ?? 14) > 0 ? 0 : price;
    if (amount > 0) {
      await generateInvoice({
        organizationId: input.organizationId,
        subscriptionId: sub.id,
        currency:       plan.currency as Currency,
        subtotal:       amount,
      });
    }

    return { ok: true, subscription: sub };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export interface ChangePlanInput {
  organizationId: string;
  newPlanId:      string;
  actorUserId?:   string;
}

/** Upgrade or downgrade: transitions existing subscription to the new plan. */
export async function changePlan(
  input: ChangePlanInput,
): Promise<{ ok: true; subscription: SubscriptionRecord } | { ok: false; error: string }> {
  const m = await model();
  if (!m) return { ok: false, error: "Database unavailable" };

  const existing = await getSubscription(input.organizationId);
  if (!existing) return { ok: false, error: "No active subscription to change" };

  const newPlan = await getPlanById(input.newPlanId);
  if (!newPlan) return { ok: false, error: "Target plan not found" };

  const isUpgrade = parseFloat(newPlan.monthlyPrice) > parseFloat(existing.plan?.monthlyPrice ?? "0");
  const action    = isUpgrade ? BILLING_AUDIT.SUBSCRIPTION_UPGRADED : BILLING_AUDIT.SUBSCRIPTION_DOWNGRADED;

  try {
    const row = await m.update({
      where: { id: existing.id },
      data:  { planId: input.newPlanId, status: "ACTIVE", updatedAt: new Date() },
    });
    const sub = rowToSub(row, newPlan);

    await recordAuditEvent({
      userId:     input.actorUserId,
      action,
      entityType: "Subscription",
      entityId:   sub.id,
      metadata:   { fromPlanId: existing.planId, toPlanId: input.newPlanId, orgId: input.organizationId },
    });

    return { ok: true, subscription: sub };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export interface CancelSubscriptionInput {
  organizationId: string;
  actorUserId?:   string;
}

/**
 * Cancel the current subscription.
 * Sets status to CANCELED and disables autoRenew.
 * No data is deleted — access remains until expiresAt.
 */
export async function cancelSubscription(
  input: CancelSubscriptionInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const m = await model();
  if (!m) return { ok: false, error: "Database unavailable" };

  const existing = await getSubscription(input.organizationId);
  if (!existing) return { ok: false, error: "No active subscription to cancel" };

  try {
    await m.update({
      where: { id: existing.id },
      data:  { status: "CANCELED", autoRenew: false, updatedAt: new Date() },
    });

    await recordAuditEvent({
      userId:     input.actorUserId,
      action:     BILLING_AUDIT.SUBSCRIPTION_CANCELED,
      entityType: "Subscription",
      entityId:   existing.id,
      metadata:   { planId: existing.planId, expiresAt: existing.expiresAt, orgId: input.organizationId },
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export interface RenewSubscriptionInput {
  organizationId: string;
  actorUserId?:   string;
}

/** Renew a subscription by extending expiresAt by one billing cycle. */
export async function renewSubscription(
  input: RenewSubscriptionInput,
): Promise<{ ok: true; subscription: SubscriptionRecord } | { ok: false; error: string }> {
  const m = await model();
  if (!m) return { ok: false, error: "Database unavailable" };

  const existing = await getSubscription(input.organizationId);
  if (!existing) return { ok: false, error: "No subscription to renew" };
  if (existing.status === "CANCELED") return { ok: false, error: "Canceled subscriptions cannot be renewed" };

  const base       = new Date(existing.expiresAt);
  const newExpiry  = new Date(base);
  if (existing.billingCycle === "MONTHLY") {
    newExpiry.setMonth(newExpiry.getMonth() + 1);
  } else {
    newExpiry.setFullYear(newExpiry.getFullYear() + 1);
  }

  const plan = await getPlanById(existing.planId);

  try {
    const row = await m.update({
      where: { id: existing.id },
      data:  { status: "ACTIVE", expiresAt: newExpiry, updatedAt: new Date() },
    });
    const sub = rowToSub(row, plan);

    await recordAuditEvent({
      userId:     input.actorUserId,
      action:     BILLING_AUDIT.SUBSCRIPTION_RENEWED,
      entityType: "Subscription",
      entityId:   sub.id,
      metadata:   { newExpiresAt: newExpiry.toISOString(), orgId: input.organizationId },
    });

    if (plan) {
      const price = existing.billingCycle === "MONTHLY"
        ? parseFloat(plan.monthlyPrice)
        : parseFloat(plan.yearlyPrice);
      if (price > 0) {
        await generateInvoice({
          organizationId: input.organizationId,
          subscriptionId: sub.id,
          currency:       plan.currency as Currency,
          subtotal:       price,
        });
      }
    }

    return { ok: true, subscription: sub };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
