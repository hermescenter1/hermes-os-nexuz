// PHASE 96 — Commercialisation, Billing & Entitlements: shared contracts.
//
// This module holds the fail-closed, deterministic commercial domain types the
// rest of the billing-governance package builds on. It contains TYPES and
// CONSTANTS ONLY — no I/O, no provider calls, no secrets, no invented prices or
// limits. Every downstream decision (entitlement resolution, subscription state
// machine, webhook idempotency, audit redaction) is expressed against these
// types so "the server is the single commercial authority" is structural.
//
// Non-negotiable invariants encoded here:
//   - A missing subscription NEVER grants a paid feature (fail closed).
//   - Unknown plan / unknown entitlement / cross-tenant / expired / suspended
//     ALWAYS deny.
//   - Numeric prices and per-resource limits are DELIBERATELY unresolved: they
//     are represented as explicit CONFIGURATION_REQUIRED / OWNER_DECISION_REQUIRED
//     states, never as invented numbers.
//   - The client is never trusted for plan, price, subscription, usage or
//     entitlement values.

/* ── Canonical plans ─────────────────────────────────────────────────────── */

/** The four authoritative commercial plans (owner-approved). */
export const PLAN_KEYS = ["COMMUNITY", "PROFESSIONAL", "TEAM", "ENTERPRISE"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && (PLAN_KEYS as readonly string[]).includes(value);
}

/** How a plan is transacted. A plan with no self-serve price is NOT purchasable
 *  until the owner configures pricing (fail closed at checkout). */
export type BillingMode = "FREE" | "STRIPE_SELF_SERVE" | "MANUAL_CONTRACT";

/** Commercial availability surfaced to the UI. Unconfigured price → the UI shows
 *  a safe status ("Contact sales" / "Pricing unavailable"), never a number. */
export type CommercialStatus =
  | "AVAILABLE_SELF_SERVE" // free / self-serve, resolvable without owner price input
  | "CONFIGURATION_REQUIRED" // paid but price/limits unresolved → checkout fails closed
  | "CONTACT_SALES"; // manual / enterprise contract

/** Currencies the platform is READY to model. Only active currencies may be
 *  charged; readiness ≠ activation. No implicit conversion between them. */
export const SUPPORTED_CURRENCIES = ["GBP", "EUR", "USD"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Launch currency (owner-approved). Only this currency is active for charging. */
export const ACTIVE_CURRENCIES = ["GBP"] as const;
export type ActiveCurrency = (typeof ACTIVE_CURRENCIES)[number];

export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return typeof value === "string" && (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}
export function isActiveCurrency(value: unknown): value is ActiveCurrency {
  return typeof value === "string" && (ACTIVE_CURRENCIES as readonly string[]).includes(value);
}

/** A canonical plan definition. Deliberately carries NO price and NO numeric
 *  limit — those live in the entitlement registry as explicit unresolved
 *  states, so this object can never encode an invented value. */
export interface PlanDefinition {
  readonly planKey: PlanKey;
  readonly displayName: string;
  readonly commercialStatus: CommercialStatus;
  readonly billingModes: readonly BillingMode[];
  readonly allowedCurrencies: readonly SupportedCurrency[];
  readonly trialEligible: boolean;
  readonly manualContractAllowed: boolean;
  readonly policyVersion: string;
  readonly effectiveFrom: Date;
  /** null = open-ended. */
  readonly effectiveUntil: Date | null;
}

/* ── Entitlements ────────────────────────────────────────────────────────── */

/** FEATURE = boolean capability (on/off per plan). METERED = a countable
 *  resource/usage with a per-plan numeric ceiling (which may be unresolved). */
export type EntitlementKind = "FEATURE" | "METERED";

/** Every commercially relevant entitlement key. Unknown keys fail closed. */
export const ENTITLEMENT_KEYS = [
  // FEATURE (boolean capabilities)
  "industrial_brain",
  "external_ai",
  "copilot",
  "knowledge_graph",
  "library",
  "journal",
  "video_hub",
  "automation_studio",
  "ot_gateway",
  "gateway_enrollment",
  "scada_plc_connectivity",
  "engineering_cases",
  "evidence_pack",
  "public_profiles",
  "editorial_workflow",
  "analytics",
  "api_access",
  "data_export",
  "audit_retention",
  // METERED (countable resources / usage)
  "members",
  "sites",
  "gateways",
  "assets",
  "documents",
  "storage_bytes",
  "ai_executions",
  "api_requests",
] as const;
export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

export function isEntitlementKey(value: unknown): value is EntitlementKey {
  return typeof value === "string" && (ENTITLEMENT_KEYS as readonly string[]).includes(value);
}

/** How a per-plan entitlement resolves. The unresolved states are first-class so
 *  the platform can fail closed on unconfigured commercial values WITHOUT
 *  inventing a number. */
export type LimitType =
  | "UNLIMITED" // no ceiling (still gated by feature availability)
  | "FIXED_LIMIT" // a resolved, configured numeric ceiling
  | "METERED_LIMIT" // a resolved metered ceiling (usage window enforced)
  | "FEATURE_DISABLED" // the plan does not include this feature at all
  | "CONFIGURATION_REQUIRED" // numeric ceiling not yet configured → deny paid use
  | "OWNER_DECISION_REQUIRED"; // commercial value awaits an explicit owner decision

/** Per-plan grant for a single entitlement. `limit` is meaningful ONLY when
 *  limitType is FIXED_LIMIT or METERED_LIMIT; it is null otherwise (never 0 as a
 *  disguised limit, never an invented number). */
export interface EntitlementGrant {
  readonly entitlementKey: EntitlementKey;
  readonly kind: EntitlementKind;
  readonly limitType: LimitType;
  readonly limit: number | null;
}

/** Registry description of an entitlement independent of any plan. */
export interface EntitlementDefinition {
  readonly entitlementKey: EntitlementKey;
  readonly kind: EntitlementKind;
  readonly displayName: string;
  /** True when using this without an explicit grant must fail closed even for a
   *  metered resource (i.e. it is a paid capability, not a free baseline). */
  readonly paid: boolean;
}

/* ── Resolver decision envelope ──────────────────────────────────────────── */

/** The single fail-closed reason vocabulary surfaced by entitlement denials.
 *  Never carries a secret, raw provider payload, price or tenant billing PII. */
export type EntitlementDenyReason =
  | "UNKNOWN_ENTITLEMENT"
  | "UNKNOWN_PLAN"
  | "MISSING_ORGANISATION"
  | "CROSS_TENANT"
  | "WRONG_SITE"
  | "MISSING_SUBSCRIPTION" // paid feature with no subscription
  | "SUBSCRIPTION_EXPIRED"
  | "SUBSCRIPTION_SUSPENDED"
  | "FEATURE_NOT_IN_PLAN"
  | "PLAN_LIMIT_REACHED"
  | "COMMERCIAL_CONFIGURATION_REQUIRED" // limit/price unconfigured → fail closed
  | "OWNER_DECISION_REQUIRED"
  | "INVALID_OVERRIDE"
  | "OVERRIDE_EXPIRED"
  | "ACCESS_READ_ONLY" // subscription state permits read only
  | "ACCESS_DENIED";

/** Stable HTTP-facing error codes routes may surface. Distinct from the internal
 *  deny-reason vocabulary so we never leak internal billing identifiers. */
export type EntitlementErrorCode =
  | "ENTITLEMENT_REQUIRED"
  | "PLAN_LIMIT_REACHED"
  | "SUBSCRIPTION_SUSPENDED"
  | "SUBSCRIPTION_EXPIRED"
  | "COMMERCIAL_CONFIGURATION_REQUIRED";

/** Full resolver output. Callers read `allowed`; the rest is for audit, UI and
 *  remediation. Nothing here is authoritative on the client. */
export interface EntitlementDecision {
  readonly allowed: boolean;
  readonly reason: EntitlementDenyReason | "ALLOWED";
  readonly entitlementKey: EntitlementKey;
  readonly effectivePlan: PlanKey;
  readonly subscriptionStatus: DomainSubscriptionStatus;
  readonly limitType: LimitType;
  readonly limit: number | null;
  readonly used: number | null;
  readonly remaining: number | null;
  readonly effectiveFrom: Date | null;
  readonly effectiveUntil: Date | null;
  readonly policyVersion: string;
  readonly overrideApplied: boolean;
}

/* ── Subscription domain states ──────────────────────────────────────────── */

/** The full deterministic lifecycle vocabulary. Richer than the persisted Prisma
 *  enum; the state machine is the authority and maps to/from the DB additively. */
export const DOMAIN_SUBSCRIPTION_STATES = [
  "INCOMPLETE",
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "PAYMENT_FAILED",
  "GRACE_PERIOD",
  "SUSPENDED",
  "CANCEL_AT_PERIOD_END",
  "CANCELED",
  "EXPIRED",
  "NONE", // no subscription row at all → Community baseline resolution only
] as const;
export type DomainSubscriptionStatus = (typeof DOMAIN_SUBSCRIPTION_STATES)[number];

export function isDomainSubscriptionStatus(value: unknown): value is DomainSubscriptionStatus {
  return typeof value === "string" && (DOMAIN_SUBSCRIPTION_STATES as readonly string[]).includes(value);
}

/** Commercial access mode derived from subscription state. Governs what an
 *  organisation may DO while unpaid/expired without ever deleting tenant data. */
export type CommercialAccessMode = "FULL_ACCESS" | "READ_ONLY" | "REMEDIATION_ONLY" | "DENIED";

/* ── Policy version ──────────────────────────────────────────────────────── */

/** Bump when the commercial policy semantics change. Recorded on every decision
 *  and audit event for traceability. */
export const COMMERCIAL_POLICY_VERSION = "phase96.1.0";
