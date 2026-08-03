// PHASE 96 runtime — apply a provider-originated domain event to a subscription.
//
// The organisation is resolved through the SERVER-OWNED subscription record
// (found by the local subscription id / provider subscription id), never from a
// provider payload field — a valid Stripe signature proves authenticity, not
// tenant ownership. Out-of-order / duplicate provider events are rejected by the
// deterministic state machine. Every applied transition is audited (redacted).

import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { BILLING_GOVERNANCE_AUDIT, buildBillingAuditMetadata } from "../audit";
import { PAYMENT_FAILURE_GRACE_PERIOD_DAYS, MS_PER_DAY } from "../commercial-policy";
import {
  applyProviderEvent,
  type SubscriptionEvent,
  type SubscriptionStateSnapshot,
} from "../subscription-state-machine";
import { isDomainSubscriptionStatus, type DomainSubscriptionStatus } from "../types";

export interface ApplySubscriptionEventInput {
  localSubscriptionId: string;
  event: SubscriptionEvent;
  providerEventId: string;
  providerCreatedAt: Date;
  now?: Date;
}

export type ApplySubscriptionEventResult =
  | { applied: true; from: DomainSubscriptionStatus; to: DomainSubscriptionStatus }
  | { applied: false; reason: string };

/** Extra lifecycle timestamps set when entering certain states. */
function lifecycleFields(to: DomainSubscriptionStatus, now: Date): Record<string, unknown> {
  switch (to) {
    case "GRACE_PERIOD":
      return { graceEndsAt: new Date(now.getTime() + PAYMENT_FAILURE_GRACE_PERIOD_DAYS * MS_PER_DAY) };
    case "SUSPENDED":
      return { suspendedAt: now };
    case "CANCEL_AT_PERIOD_END":
      return { cancelAtPeriodEnd: true };
    case "CANCELED":
      return { cancelledAt: now };
    case "EXPIRED":
      return { expiredAt: now };
    case "ACTIVE":
      // Recovery clears the grace deadline.
      return { graceEndsAt: null };
    default:
      return {};
  }
}

/**
 * Apply a domain event to the subscription with idempotency + out-of-order
 * protection, persist the new state, and audit it. Returns the outcome so the
 * webhook layer can record duplicate/out-of-order/invalid distinctly.
 */
export async function applySubscriptionProviderEvent(
  input: ApplySubscriptionEventInput,
): Promise<ApplySubscriptionEventResult> {
  const now = input.now ?? new Date();
  const client = (await getPrisma()) as unknown as PrismaClient | null;
  if (!client) return { applied: false, reason: "NO_DB" };

  const sub = await client.subscription.findUnique({ where: { id: input.localSubscriptionId } });
  if (!sub) return { applied: false, reason: "NO_SUBSCRIPTION" };

  const rawStatus = sub.status as unknown as string;
  if (!isDomainSubscriptionStatus(rawStatus)) return { applied: false, reason: "UNMAPPED_STATE" };

  const current: SubscriptionStateSnapshot = {
    status: rawStatus,
    stateVersion: sub.stateVersion ?? 0,
    lastProviderEventCreatedAt: sub.lastProviderEventCreatedAt ?? null,
    lastProviderEventId: sub.lastProviderEventId ?? null,
  };

  const outcome = applyProviderEvent(current, {
    event: input.event,
    providerEventId: input.providerEventId,
    providerCreatedAt: input.providerCreatedAt,
  });

  if (!outcome.applied) {
    return { applied: false, reason: outcome.reason };
  }

  const to = outcome.next.status;
  await client.subscription.update({
    where: { id: sub.id },
    data: {
      status: to as unknown as never,
      stateVersion: outcome.next.stateVersion,
      lastProviderEventCreatedAt: outcome.next.lastProviderEventCreatedAt,
      lastProviderEventId: outcome.next.lastProviderEventId,
      ...lifecycleFields(to, now),
    },
  });

  await recordAuditEvent({
    action: BILLING_GOVERNANCE_AUDIT.SUBSCRIPTION_TRANSITIONED,
    entityType: "Subscription",
    entityId: sub.id,
    organizationId: sub.organizationId, // server-owned org, not from payload
    outcome: "success",
    metadata: buildBillingAuditMetadata({
      organizationId: sub.organizationId,
      previousStatus: current.status,
      nextStatus: to,
      provider: sub.provider ?? "stripe",
      providerEventId: input.providerEventId,
      stateVersion: outcome.next.stateVersion,
    }),
  });

  return { applied: true, from: current.status, to };
}
