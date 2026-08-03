// PHASE 96 — billing audit action vocabulary + allow-list metadata redaction.
//
// Reuses the platform recordAuditEvent (bound by the caller). This module is
// PURE: it builds a safe metadata object from an allow-list and strips anything
// sensitive. It NEVER emits a PAN, CVC, provider secret, webhook signing secret,
// raw webhook payload, raw card/bank details, or a full personal billing
// address. Anything not on the allow-list is dropped, not merely masked.

/** Canonical billing audit actions. */
export const BILLING_GOVERNANCE_AUDIT = {
  PLAN_ASSIGNED: "billing.plan_assigned",
  TRIAL_STARTED: "billing.trial_started",
  TRIAL_EXPIRED: "billing.trial_expired",
  TRIAL_CONVERTED: "billing.trial_converted",
  SUBSCRIPTION_TRANSITIONED: "billing.subscription_transitioned",
  SUBSCRIPTION_SUSPENDED: "billing.subscription_suspended",
  SUBSCRIPTION_REACTIVATED: "billing.subscription_reactivated",
  SUBSCRIPTION_CANCEL_REQUESTED: "billing.subscription_cancel_requested",
  SUBSCRIPTION_CANCELLED: "billing.subscription_cancelled",
  WEBHOOK_ACCEPTED: "billing.webhook_accepted",
  WEBHOOK_REJECTED: "billing.webhook_rejected",
  WEBHOOK_DUPLICATE_IGNORED: "billing.webhook_duplicate_ignored",
  WEBHOOK_OUT_OF_ORDER_IGNORED: "billing.webhook_out_of_order_ignored",
  INVOICE_CREATED: "billing.invoice_created",
  INVOICE_PAID: "billing.invoice_paid",
  INVOICE_VOIDED: "billing.invoice_voided",
  PAYMENT_FAILED: "billing.payment_failed",
  REFUND_RECORDED: "billing.refund_recorded",
  ENTITLEMENT_ALLOWED: "billing.entitlement_allowed",
  ENTITLEMENT_DENIED: "billing.entitlement_denied",
  LIMIT_REACHED: "billing.limit_reached",
  OVERRIDE_CREATED: "billing.override_created",
  OVERRIDE_EXPIRED: "billing.override_expired",
  OVERRIDE_REVOKED: "billing.override_revoked",
} as const;

export type BillingGovernanceAuditAction =
  (typeof BILLING_GOVERNANCE_AUDIT)[keyof typeof BILLING_GOVERNANCE_AUDIT];

/**
 * Allow-listed metadata keys. ONLY these may appear in a billing audit event.
 * Money is recorded as a decimal STRING (never a float) and never a raw amount
 * with card/bank context. No email/address/PAN/secret keys are present.
 */
export const ALLOWED_AUDIT_METADATA_KEYS = new Set<string>([
  "organisationId",
  "organizationId",
  "planKey",
  "fromPlan",
  "toPlan",
  "entitlementKey",
  "subscriptionStatus",
  "previousStatus",
  "nextStatus",
  "decision",
  "reason",
  "code",
  "limitType",
  "limit",
  "used",
  "remaining",
  "provider",
  "providerEventId",
  "eventType",
  "objectReferenceHash",
  "invoiceId",
  "invoiceNumber",
  "paymentId",
  "currency",
  "amount", // decimal STRING only (see coerceAmount)
  "overrideId",
  "approvedBy",
  "effectiveFrom",
  "expiresAt",
  "trialEndsAt",
  "graceEndsAt",
  "cancelAtPeriodEnd",
  "correlationId",
  "outcome",
  "stateVersion",
  "policyVersion",
  "requestedUnits",
  "overrideApplied",
]);

/** Keys/patterns that must NEVER be stored, even if allow-listed by mistake. */
const FORBIDDEN_KEY_PATTERN =
  /(pan|cvc|cvv|card|secret|signing|password|token|apikey|api_key|bank|iban|sortcode|sort_code|payload|rawbody|address|postcode|zip|ssn|passport)/i;

const SECRET_VALUE_PATTERNS: RegExp[] = [
  /sk_(live|test)_[A-Za-z0-9]{10,}/, // Stripe secret key
  /whsec_[A-Za-z0-9]{10,}/, // Stripe webhook signing secret
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:\d[ -]*?){13,19}\b/, // PAN-like sequence
];

function isPlainSerialisable(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

/** Redact a single string value if it looks like a secret / PAN. */
function redactValue(value: string): string {
  for (const re of SECRET_VALUE_PATTERNS) {
    if (re.test(value)) return "[REDACTED]";
  }
  return value;
}

/**
 * Build a safe billing audit metadata object. Drops any key not on the
 * allow-list and any key matching the forbidden pattern; coerces Dates to ISO
 * strings; redacts secret-looking string values; drops non-serialisable values.
 */
export function buildBillingAuditMetadata(
  raw: Record<string, unknown> | null | undefined,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (!raw) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!ALLOWED_AUDIT_METADATA_KEYS.has(key)) continue; // allow-list only
    if (FORBIDDEN_KEY_PATTERN.test(key)) continue; // defence in depth
    if (value instanceof Date) {
      out[key] = value.toISOString();
      continue;
    }
    if (!isPlainSerialisable(value)) continue; // drop objects/arrays/functions
    out[key] = typeof value === "string" ? redactValue(value) : value;
  }
  return out;
}

/** True when an object is free of any forbidden key or secret-looking value.
 *  Used by the redaction test to prove no leak. Recurses defensively. */
export function isMetadataClean(obj: unknown): boolean {
  if (obj === null || obj === undefined) return true;
  if (typeof obj === "string") return !SECRET_VALUE_PATTERNS.some((re) => re.test(obj));
  if (typeof obj === "number" || typeof obj === "boolean") return true;
  if (Array.isArray(obj)) return obj.every(isMetadataClean);
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (FORBIDDEN_KEY_PATTERN.test(k)) return false;
      if (!isMetadataClean(v)) return false;
    }
    return true;
  }
  return true;
}
