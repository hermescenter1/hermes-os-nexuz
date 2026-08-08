// PHASE 96 — entitlement error surface.
//
// Maps internal fail-closed deny reasons to STABLE, non-leaking HTTP error codes
// and statuses. Never carries a provider id, price, secret or tenant billing PII.

import type { EntitlementDenyReason, EntitlementDecision, EntitlementErrorCode } from "./types";

/** Thrown/returned when a commercial entitlement check denies an action. Carries
 *  only the stable code + a safe generic message; the full decision is available
 *  for server-side audit but never serialised wholesale to the client. */
export class EntitlementDeniedError extends Error {
  readonly code: EntitlementErrorCode;
  readonly status: number;
  readonly reason: EntitlementDenyReason;
  readonly decision: EntitlementDecision;

  constructor(decision: EntitlementDecision) {
    const mapped = mapDenyReason(decision.reason === "ALLOWED" ? "ACCESS_DENIED" : decision.reason);
    super(mapped.message);
    this.name = "EntitlementDeniedError";
    this.code = mapped.code;
    this.status = mapped.status;
    this.reason = decision.reason === "ALLOWED" ? "ACCESS_DENIED" : decision.reason;
    this.decision = decision;
  }
}

interface MappedError {
  code: EntitlementErrorCode;
  status: number;
  message: string;
}

/** Deterministic mapping from an internal deny reason to a client-safe error.
 *  402 = payment/plan required; 403 = access denied; 409 = configuration state. */
export function mapDenyReason(reason: EntitlementDenyReason): MappedError {
  switch (reason) {
    case "PLAN_LIMIT_REACHED":
      return { code: "PLAN_LIMIT_REACHED", status: 402, message: "Plan limit reached for this resource." };
    case "MISSING_SUBSCRIPTION":
    case "FEATURE_NOT_IN_PLAN":
      return { code: "ENTITLEMENT_REQUIRED", status: 402, message: "This capability is not included in your plan." };
    case "SUBSCRIPTION_EXPIRED":
      return { code: "SUBSCRIPTION_EXPIRED", status: 402, message: "Your subscription has expired." };
    case "SUBSCRIPTION_SUSPENDED":
      return { code: "SUBSCRIPTION_SUSPENDED", status: 402, message: "Your subscription is suspended." };
    case "COMMERCIAL_CONFIGURATION_REQUIRED":
    case "OWNER_DECISION_REQUIRED":
      return {
        code: "COMMERCIAL_CONFIGURATION_REQUIRED",
        status: 409,
        message: "This commercial limit is not yet configured.",
      };
    case "ACCESS_READ_ONLY":
      return { code: "SUBSCRIPTION_SUSPENDED", status: 402, message: "Your account is read-only." };
    case "UNKNOWN_ENTITLEMENT":
    case "UNKNOWN_PLAN":
    case "MISSING_ORGANISATION":
    case "CROSS_TENANT":
    case "WRONG_SITE":
    case "INVALID_OVERRIDE":
    case "OVERRIDE_EXPIRED":
    case "ACCESS_DENIED":
    default:
      // Deliberately generic: never disclose whether the resource/tenant exists.
      return { code: "ENTITLEMENT_REQUIRED", status: 403, message: "Access denied." };
  }
}

/** Client-safe JSON body for a denied decision. */
export function deniedResponseBody(decision: EntitlementDecision): { error: string; code: EntitlementErrorCode } {
  const mapped = mapDenyReason(decision.reason === "ALLOWED" ? "ACCESS_DENIED" : decision.reason);
  return { error: mapped.message, code: mapped.code };
}
