// PHASE 96 runtime — route-level entitlement enforcement.
//
// Wires the fail-closed resolver into real create/execute paths. RBAC and
// entitlement are SEPARATE checks; callers run RBAC first, then this. On denial
// it returns a stable, non-leaking error response and records a redacted audit
// event. The organisationId is always server-derived (never the request body).

import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { BILLING_GOVERNANCE_AUDIT, buildBillingAuditMetadata } from "../audit";
import { deniedResponseBody, mapDenyReason } from "../entitlement-errors";
import { resolveEntitlement } from "../entitlement-resolver";
import { prismaEntitlementStore } from "./entitlement-store";
import type { EntitlementDecision, EntitlementKey } from "../types";

export interface EnforceEntitlementArgs {
  organisationId: string;
  entitlementKey: EntitlementKey;
  /** 0 = availability/read check; >0 = create/consume. Defaults to 1. */
  requestedUnits?: number;
  userId?: string | null;
  siteId?: string | null;
  now?: Date;
}

export type EnforceResult =
  | { ok: true; decision: EntitlementDecision }
  | { ok: false; decision: EntitlementDecision; response: NextResponse };

/** Resolve + audit an entitlement decision, returning a ready error response on
 *  denial. Use after the route's RBAC check. */
export async function enforceEntitlement(args: EnforceEntitlementArgs): Promise<EnforceResult> {
  const now = args.now ?? new Date();
  const decision = await resolveEntitlement(prismaEntitlementStore(), {
    organisationId: args.organisationId,
    entitlementKey: args.entitlementKey,
    requestedUnits: args.requestedUnits ?? 1,
    userId: args.userId ?? null,
    siteId: args.siteId ?? null,
    now,
  });

  // Audit (redacted). Never blocks the request on an audit failure.
  const action = decision.allowed
    ? BILLING_GOVERNANCE_AUDIT.ENTITLEMENT_ALLOWED
    : decision.reason === "PLAN_LIMIT_REACHED"
      ? BILLING_GOVERNANCE_AUDIT.LIMIT_REACHED
      : BILLING_GOVERNANCE_AUDIT.ENTITLEMENT_DENIED;
  void recordAuditEvent({
    action,
    entityType: "Entitlement",
    entityId: args.entitlementKey,
    organizationId: args.organisationId,
    userId: args.userId ?? undefined,
    outcome: decision.allowed ? "success" : "denied",
    metadata: buildBillingAuditMetadata({
      organizationId: args.organisationId,
      entitlementKey: args.entitlementKey,
      reason: decision.reason,
      effectivePlan: undefined,
      planKey: decision.effectivePlan,
      subscriptionStatus: decision.subscriptionStatus,
      limitType: decision.limitType,
      limit: decision.limit,
      used: decision.used,
      remaining: decision.remaining,
      overrideApplied: decision.overrideApplied,
      policyVersion: decision.policyVersion,
    }),
  });

  if (decision.allowed) return { ok: true, decision };

  const mapped = mapDenyReason(decision.reason === "ALLOWED" ? "ACCESS_DENIED" : decision.reason);
  const response = NextResponse.json(deniedResponseBody(decision), { status: mapped.status });
  return { ok: false, decision, response };
}
