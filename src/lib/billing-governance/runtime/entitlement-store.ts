// PHASE 96 runtime — Prisma-backed entitlement store.
//
// Fail-closed: no database, no reachable state, or any error resolves to a
// null/deny snapshot. Maps the persisted Subscription/Plan/Override/UsageRecord
// rows into the pure resolver's snapshot contract. Never trusts client input;
// the organisationId is always server-derived.

import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import type {
  EntitlementOverrideSnapshot,
  EntitlementStore,
  EntitlementSubscriptionSnapshot,
} from "../entitlement-store";
import {
  isDomainSubscriptionStatus,
  isPlanKey,
  type DomainSubscriptionStatus,
  type EntitlementKey,
  type PlanKey,
} from "../types";

/** Prisma SubscriptionStatus is a superset-compatible mirror of the domain
 *  states (Phase 96 migration added the missing ones). Validate, else deny. */
function toDomainStatus(raw: string | null | undefined): DomainSubscriptionStatus {
  if (raw && isDomainSubscriptionStatus(raw)) return raw;
  return "NONE";
}

function toPlanKey(raw: string | null | undefined): PlanKey | null {
  return raw && isPlanKey(raw) ? raw : null;
}

/** Entity-count-backed metered resources (live counts). */
type CountResolver = (client: PrismaClient, organisationId: string, now: Date) => Promise<number>;

const COUNT_RESOLVERS: Partial<Record<EntitlementKey, CountResolver>> = {
  members: async (client, organisationId, now) => {
    const [active, pending] = await Promise.all([
      client.organizationMember.count({ where: { organizationId: organisationId, status: "ACTIVE" } }),
      client.organizationInvitation.count({
        where: { organizationId: organisationId, status: "PENDING", expiresAt: { gt: now } },
      }),
    ]);
    // Approved seat rule: active member + pending non-expired invitation = 1 seat.
    return active + pending;
  },
  sites: (client, organisationId) => client.industrialSite.count({ where: { organizationId: organisationId } }),
  gateways: (client, organisationId) => client.industrialGateway.count({ where: { organizationId: organisationId } }),
  assets: (client, organisationId) => client.industrialAsset.count({ where: { organizationId: organisationId } }),
};

/** UsageRecord-metric-backed usage (summed over the recorded window). */
const USAGE_METRICS: Partial<Record<EntitlementKey, string>> = {
  ai_executions: "ai_requests",
  api_requests: "api_calls",
  documents: "documents",
  storage_bytes: "storage_bytes",
};

export function prismaEntitlementStore(): EntitlementStore {
  return {
    async getSubscription(organisationId: string): Promise<EntitlementSubscriptionSnapshot | null> {
      try {
        const client = (await getPrisma()) as unknown as PrismaClient | null;
        if (!client) return null; // no DB ⇒ fail closed
        const sub = await client.subscription.findFirst({
          where: {
            organizationId: organisationId,
            status: { in: ["TRIALING", "ACTIVE", "PAST_DUE", "PAYMENT_FAILED", "GRACE_PERIOD", "CANCEL_AT_PERIOD_END", "INCOMPLETE", "SUSPENDED"] },
          },
          orderBy: { createdAt: "desc" },
          include: { plan: true },
        });
        if (!sub) {
          // No active subscription row — Community baseline (DB reachable).
          return { organisationId, planKey: null, status: "NONE", currentPeriodStart: null, currentPeriodEnd: null };
        }
        return {
          organisationId,
          planKey: toPlanKey((sub.plan as { planKey?: string | null } | null)?.planKey ?? null),
          status: toDomainStatus(sub.status as unknown as string),
          currentPeriodStart: sub.currentPeriodStart ?? sub.startsAt ?? null,
          currentPeriodEnd: sub.currentPeriodEnd ?? sub.expiresAt ?? null,
        };
      } catch {
        return null; // any failure ⇒ deny
      }
    },

    async getUsage(organisationId: string, entitlementKey: EntitlementKey, now: Date): Promise<number | null> {
      try {
        const client = (await getPrisma()) as unknown as PrismaClient | null;
        if (!client) return null;
        const counter = COUNT_RESOLVERS[entitlementKey];
        if (counter) return await counter(client, organisationId, now);
        const metric = USAGE_METRICS[entitlementKey];
        if (metric) {
          const agg = await client.usageRecord.aggregate({
            where: { organizationId: organisationId, metric },
            _sum: { value: true },
          });
          const sum = agg._sum.value;
          return sum === null || sum === undefined ? 0 : Number(sum);
        }
        return null; // unmapped ⇒ resolver fails closed for a real ceiling
      } catch {
        return null;
      }
    },

    async getOverride(organisationId: string, entitlementKey: EntitlementKey): Promise<EntitlementOverrideSnapshot | null> {
      try {
        const client = (await getPrisma()) as unknown as PrismaClient | null;
        if (!client) return null;
        const row = await client.organizationEntitlementOverride.findFirst({
          where: { organizationId: organisationId, entitlementKey, revokedAt: null },
          orderBy: { approvedAt: "desc" },
        });
        if (!row) return null;
        return {
          organisationId: row.organizationId,
          entitlementKey: row.entitlementKey as EntitlementKey,
          decision: row.decision === "DENY" ? "DENY" : "GRANT",
          limitOverride: row.limitOverride ?? null,
          reason: row.reason,
          approvedBy: row.approvedBy,
          effectiveFrom: row.effectiveFrom,
          expiresAt: row.expiresAt,
          revokedAt: row.revokedAt ?? null,
        };
      } catch {
        return null;
      }
    },
  };
}
