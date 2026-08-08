// PHASE 96 — entitlement store contract (injected persistence seam).
//
// The resolver is PURE decision logic over already-fetched snapshots. All I/O is
// bound by the caller through this interface, mirroring the ai-governance
// ProviderPolicyStore pattern. A Prisma-backed implementation lives in
// runtime/entitlement-store.ts and is fail-closed: no DB / no row / any error →
// a null/NONE snapshot so the resolver denies paid access.

import type {
  DomainSubscriptionStatus,
  EntitlementKey,
  PlanKey,
} from "./types";

/** The organisation's effective commercial subscription snapshot. `status`
 *  "NONE" means there is no subscription row (Community baseline). A null return
 *  from the store means the state could NOT be determined (fail closed). */
export interface EntitlementSubscriptionSnapshot {
  organisationId: string;
  /** Resolved plan; null only when the persisted plan cannot be mapped to a
   *  canonical PlanKey → the resolver denies UNKNOWN_PLAN. For status NONE the
   *  store may return null (resolver uses the Community baseline). */
  planKey: PlanKey | null;
  status: DomainSubscriptionStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
}

/** A Billing-Admin authorised, time-bounded override for one entitlement. */
export interface EntitlementOverrideSnapshot {
  organisationId: string;
  entitlementKey: EntitlementKey;
  decision: "GRANT" | "DENY";
  /** Only meaningful for metered entitlements. null on a GRANT = unlimited. */
  limitOverride: number | null;
  reason: string;
  approvedBy: string;
  effectiveFrom: Date;
  /** REQUIRED — no permanent override. A past value is expired (ignored). */
  expiresAt: Date;
  revokedAt: Date | null;
}

/** Injected persistence for entitlement resolution. Every method fails closed by
 *  returning null (subscription) / null (usage → treated as fail-closed) on any
 *  error, so the resolver never accidentally grants on an I/O failure. */
export interface EntitlementStore {
  getSubscription(organisationId: string): Promise<EntitlementSubscriptionSnapshot | null>;
  /** Current consumed units for a metered entitlement in the enforcement window.
   *  null = could not be determined (resolver fails closed). */
  getUsage(organisationId: string, entitlementKey: EntitlementKey, now: Date): Promise<number | null>;
  getOverride(organisationId: string, entitlementKey: EntitlementKey): Promise<EntitlementOverrideSnapshot | null>;
}

/** A resolver input snapshot bundle — everything the pure evaluator needs. */
export interface EntitlementResolutionInputs {
  subscription: EntitlementSubscriptionSnapshot | null;
  override: EntitlementOverrideSnapshot | null;
  usage: number | null;
}
