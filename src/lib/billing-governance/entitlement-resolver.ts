// PHASE 96 — fail-closed, server-side entitlement resolver.
//
// The SINGLE commercial authority. Pure decision logic over injected snapshots
// (mirrors ai-governance/provider-policy.ts). No I/O, no secrets, no invented
// numbers. The client is never trusted for plan, usage or entitlement values.
//
// Fail-closed guarantees (verified by the offline eval + unit tests):
//   - unknown entitlement / unknown plan / missing org / cross-tenant → deny
//   - paid feature with no subscription → deny (MISSING_SUBSCRIPTION)
//   - expired / suspended subscription → no paid access
//   - unconfigured metered limit → deny (COMMERCIAL_CONFIGURATION_REQUIRED)
//   - invalid / expired override → ignored (falls back to plan), never grants
//   - read-only access modes block creation but preserve data

import { accessModeForStatus, accessModeAllowsCreate, statusGrantsPaidAccess } from "./commercial-policy";
import { getEntitlementDefinition, getPlanEntitlementGrant } from "./entitlement-registry";
import type {
  EntitlementOverrideSnapshot,
  EntitlementResolutionInputs,
  EntitlementStore,
  EntitlementSubscriptionSnapshot,
} from "./entitlement-store";
import { BASELINE_PLAN_KEY, getPlanDefinition } from "./plan-registry";
import {
  COMMERCIAL_POLICY_VERSION,
  type DomainSubscriptionStatus,
  type EntitlementDecision,
  type EntitlementDenyReason,
  type EntitlementKey,
  type LimitType,
  type PlanKey,
  isEntitlementKey,
} from "./types";

/** What the caller wants to authorise. */
export interface EntitlementContext {
  /** The org that OWNS the request (authenticated, server-derived — never from
   *  the request body). */
  organisationId: string;
  siteId?: string | null;
  userId?: string | null;
  entitlementKey: EntitlementKey;
  /** Units the caller intends to consume NOW. 0 = a read/availability check;
   *  >0 = a create/consume that is additionally gated by write-access mode and
   *  metered ceilings. Defaults to 1 when omitted at the async wrapper. */
  requestedUnits: number;
  now: Date;
}

function deny(
  reason: EntitlementDenyReason,
  ctx: EntitlementContext,
  partial: Partial<EntitlementDecision> = {},
): EntitlementDecision {
  return {
    allowed: false,
    reason,
    entitlementKey: ctx.entitlementKey,
    effectivePlan: partial.effectivePlan ?? BASELINE_PLAN_KEY,
    subscriptionStatus: partial.subscriptionStatus ?? "NONE",
    limitType: partial.limitType ?? "FEATURE_DISABLED",
    limit: partial.limit ?? null,
    used: partial.used ?? null,
    remaining: partial.remaining ?? null,
    effectiveFrom: partial.effectiveFrom ?? null,
    effectiveUntil: partial.effectiveUntil ?? null,
    policyVersion: COMMERCIAL_POLICY_VERSION,
    overrideApplied: partial.overrideApplied ?? false,
  };
}

/** Is this override currently valid for this org+entitlement+time? */
function overrideIsValid(
  override: EntitlementOverrideSnapshot | null,
  ctx: EntitlementContext,
): override is EntitlementOverrideSnapshot {
  if (!override) return false;
  if (override.organisationId !== ctx.organisationId) return false; // cross-tenant → ignore
  if (override.entitlementKey !== ctx.entitlementKey) return false;
  if (override.revokedAt !== null) return false; // revoked
  if (override.effectiveFrom.getTime() > ctx.now.getTime()) return false; // not yet active
  if (override.expiresAt.getTime() <= ctx.now.getTime()) return false; // expired
  return true;
}

function denyReasonForNoPaidAccess(status: DomainSubscriptionStatus): EntitlementDenyReason {
  switch (status) {
    case "EXPIRED":
    case "CANCELED":
      return "SUBSCRIPTION_EXPIRED";
    case "SUSPENDED":
      return "SUBSCRIPTION_SUSPENDED";
    case "NONE":
    case "INCOMPLETE":
      return "MISSING_SUBSCRIPTION";
    default:
      return "FEATURE_NOT_IN_PLAN";
  }
}

function denyReasonForWriteBlock(status: DomainSubscriptionStatus): EntitlementDenyReason {
  switch (status) {
    case "SUSPENDED":
      return "SUBSCRIPTION_SUSPENDED";
    case "EXPIRED":
    case "CANCELED":
      return "SUBSCRIPTION_EXPIRED";
    default:
      return "ACCESS_READ_ONLY";
  }
}

/**
 * PURE fail-closed evaluation over already-fetched snapshots. Order matters:
 * identity/existence first, then override, then feature availability, then paid
 * access, then write-access mode, then metered ceilings.
 */
export function evaluateEntitlement(
  ctx: EntitlementContext,
  input: EntitlementResolutionInputs,
): EntitlementDecision {
  // 1) Known entitlement.
  const def = getEntitlementDefinition(ctx.entitlementKey);
  if (!def || !isEntitlementKey(ctx.entitlementKey)) return deny("UNKNOWN_ENTITLEMENT", ctx);

  // 2) Determinable tenant state (null snapshot = fail closed).
  const sub: EntitlementSubscriptionSnapshot | null = input.subscription;
  if (!sub || !ctx.organisationId) return deny("MISSING_ORGANISATION", ctx);

  // 3) Cross-tenant guard.
  if (sub.organisationId !== ctx.organisationId) return deny("CROSS_TENANT", ctx);

  const status = sub.status;

  // 4) Effective plan. Community baseline when there is no subscription row.
  const effectivePlan: PlanKey | null = status === "NONE" ? BASELINE_PLAN_KEY : sub.planKey;
  if (!effectivePlan || !getPlanDefinition(effectivePlan)) return deny("UNKNOWN_PLAN", ctx, { subscriptionStatus: status });

  const base = { effectivePlan, subscriptionStatus: status, effectiveFrom: sub.currentPeriodStart, effectiveUntil: sub.currentPeriodEnd };

  // 5) Override (Billing-Admin, time-bounded). Valid DENY hard-denies; valid
  //    GRANT bypasses plan/paid gates (an authorised commercial decision).
  const override = input.override;
  const validOverride = overrideIsValid(override, ctx) ? override : null;
  if (validOverride && validOverride.decision === "DENY") {
    return deny("ACCESS_DENIED", ctx, { ...base, overrideApplied: true });
  }
  const granted = validOverride?.decision === "GRANT";

  // 6) Feature availability (skipped when an override GRANTs it).
  const grant = getPlanEntitlementGrant(effectivePlan, ctx.entitlementKey)!; // non-null: plan+key validated
  if (!granted && grant.limitType === "FEATURE_DISABLED") {
    return deny("FEATURE_NOT_IN_PLAN", ctx, { ...base, limitType: "FEATURE_DISABLED" });
  }

  // 7) Paid-access gate (skipped when an override GRANTs it). A paid capability
  //    requires a paid-granting subscription state.
  if (!granted && def.paid && !statusGrantsPaidAccess(status)) {
    return deny(denyReasonForNoPaidAccess(status), ctx, { ...base, limitType: grant.limitType });
  }

  // 8) Write-access mode gate for create/consume. Read-only / remediation-only /
  //    incomplete states preserve data but block growth. (An override GRANT does
  //    NOT bypass a hard suspension/expiry write-block — payment state stands.)
  if (ctx.requestedUnits > 0) {
    const mode = accessModeForStatus(status);
    if (!accessModeAllowsCreate(mode)) {
      return deny(denyReasonForWriteBlock(status), ctx, { ...base, limitType: grant.limitType });
    }
  }

  // 9) FEATURE entitlements: available → allow.
  if (def.kind === "FEATURE") {
    return {
      allowed: true,
      reason: "ALLOWED",
      entitlementKey: ctx.entitlementKey,
      ...base,
      limitType: granted ? "UNLIMITED" : grant.limitType,
      limit: null,
      used: null,
      remaining: null,
      policyVersion: COMMERCIAL_POLICY_VERSION,
      overrideApplied: granted,
    };
  }

  // 10) METERED entitlements: resolve the effective ceiling.
  let limitType: LimitType = grant.limitType;
  let limit: number | null = grant.limit;
  if (granted) {
    if (validOverride!.limitOverride !== null && Number.isFinite(validOverride!.limitOverride)) {
      limitType = "FIXED_LIMIT";
      limit = validOverride!.limitOverride;
    } else {
      // Admin GRANT with no numeric ceiling = explicit unlimited assignment.
      limitType = "UNLIMITED";
      limit = null;
    }
  }

  if (limitType === "CONFIGURATION_REQUIRED") {
    return deny("COMMERCIAL_CONFIGURATION_REQUIRED", ctx, { ...base, limitType });
  }
  if (limitType === "OWNER_DECISION_REQUIRED") {
    return deny("OWNER_DECISION_REQUIRED", ctx, { ...base, limitType });
  }
  if (limitType === "UNLIMITED") {
    return {
      allowed: true,
      reason: "ALLOWED",
      entitlementKey: ctx.entitlementKey,
      ...base,
      limitType: "UNLIMITED",
      limit: null,
      used: input.usage,
      remaining: null,
      policyVersion: COMMERCIAL_POLICY_VERSION,
      overrideApplied: granted,
    };
  }

  // FIXED_LIMIT / METERED_LIMIT — a real numeric ceiling.
  const effectiveLimit = limit ?? 0;
  // Unknown usage = fail closed (cannot prove we are under the ceiling).
  const used = input.usage === null ? Number.POSITIVE_INFINITY : input.usage;
  const remaining = Number.isFinite(used) ? Math.max(0, effectiveLimit - used) : 0;
  const allowed = used + ctx.requestedUnits <= effectiveLimit;
  if (!allowed) {
    return deny("PLAN_LIMIT_REACHED", ctx, {
      ...base,
      limitType,
      limit: effectiveLimit,
      used: Number.isFinite(used) ? used : null,
      remaining,
      overrideApplied: granted,
    });
  }
  return {
    allowed: true,
    reason: "ALLOWED",
    entitlementKey: ctx.entitlementKey,
    ...base,
    limitType,
    limit: effectiveLimit,
    used: Number.isFinite(used) ? used : null,
    remaining,
    policyVersion: COMMERCIAL_POLICY_VERSION,
    overrideApplied: granted,
  };
}

/**
 * Async wrapper that binds the injected store, then applies the pure evaluation.
 * Fetches only what each stage needs and fails closed on any store null.
 */
export async function resolveEntitlement(
  store: EntitlementStore,
  ctxInput: Omit<EntitlementContext, "requestedUnits"> & { requestedUnits?: number },
): Promise<EntitlementDecision> {
  const ctx: EntitlementContext = { ...ctxInput, requestedUnits: ctxInput.requestedUnits ?? 1 };

  // Cheap denial without any store round-trip.
  if (!isEntitlementKey(ctx.entitlementKey)) return deny("UNKNOWN_ENTITLEMENT", ctx);
  if (!ctx.organisationId) return deny("MISSING_ORGANISATION", ctx);

  const subscription = await safe(() => store.getSubscription(ctx.organisationId));
  const override = await safe(() => store.getOverride(ctx.organisationId, ctx.entitlementKey));
  const def = getEntitlementDefinition(ctx.entitlementKey);
  const usage =
    def?.kind === "METERED" ? await safe(() => store.getUsage(ctx.organisationId, ctx.entitlementKey, ctx.now)) : null;

  return evaluateEntitlement(ctx, { subscription, override, usage });
}

/** Any store error resolves to null → the pure evaluator fails closed. */
async function safe<T>(fn: () => Promise<T | null>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
