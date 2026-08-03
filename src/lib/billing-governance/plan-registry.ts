// PHASE 96 — canonical plan registry (version-controlled commercial source of
// truth). Pure data + lookups; no I/O, no invented prices or numeric limits.
//
// The four plans are owner-approved. Prices, seat/site/gateway/asset/document/
// storage/AI limits are DELIBERATELY unresolved (owner decision pending) and are
// therefore NOT encoded here — they live in the entitlement registry as explicit
// CONFIGURATION_REQUIRED / OWNER_DECISION_REQUIRED states.

import {
  COMMERCIAL_POLICY_VERSION,
  type PlanDefinition,
  type PlanKey,
  isPlanKey,
} from "./types";

/** The commercial policy came into effect on the Phase 96 authoring date. Fixed
 *  literal so registry lookups are deterministic. */
const EFFECTIVE_FROM = new Date("2026-08-03T00:00:00.000Z");

/**
 * Canonical, immutable plan definitions.
 *
 * Feature availability per plan is a STRUCTURAL commercial decision (which tier
 * unlocks which capability) and lives in the entitlement registry. Prices and
 * numeric limits are NOT here — they are owner-decision-required and must not be
 * invented.
 */
const PLAN_DEFINITIONS: Readonly<Record<PlanKey, PlanDefinition>> = Object.freeze({
  COMMUNITY: Object.freeze({
    planKey: "COMMUNITY",
    displayName: "Community",
    // Free baseline — resolvable without any owner price input.
    commercialStatus: "AVAILABLE_SELF_SERVE",
    billingModes: Object.freeze(["FREE"] as const),
    allowedCurrencies: Object.freeze(["GBP", "EUR", "USD"] as const),
    trialEligible: false, // already free; a trial adds nothing.
    manualContractAllowed: false,
    policyVersion: COMMERCIAL_POLICY_VERSION,
    effectiveFrom: EFFECTIVE_FROM,
    effectiveUntil: null,
  }),
  PROFESSIONAL: Object.freeze({
    planKey: "PROFESSIONAL",
    displayName: "Professional",
    // Paid self-serve, but price is owner-decision-pending → not purchasable
    // until configured (checkout fails closed).
    commercialStatus: "CONFIGURATION_REQUIRED",
    billingModes: Object.freeze(["STRIPE_SELF_SERVE"] as const),
    allowedCurrencies: Object.freeze(["GBP", "EUR", "USD"] as const),
    trialEligible: true,
    manualContractAllowed: false,
    policyVersion: COMMERCIAL_POLICY_VERSION,
    effectiveFrom: EFFECTIVE_FROM,
    effectiveUntil: null,
  }),
  TEAM: Object.freeze({
    planKey: "TEAM",
    displayName: "Team",
    commercialStatus: "CONFIGURATION_REQUIRED",
    billingModes: Object.freeze(["STRIPE_SELF_SERVE"] as const),
    allowedCurrencies: Object.freeze(["GBP", "EUR", "USD"] as const),
    trialEligible: true,
    manualContractAllowed: false,
    policyVersion: COMMERCIAL_POLICY_VERSION,
    effectiveFrom: EFFECTIVE_FROM,
    effectiveUntil: null,
  }),
  ENTERPRISE: Object.freeze({
    planKey: "ENTERPRISE",
    displayName: "Enterprise",
    // Manual contract only — sold through sales, invoiced manually.
    commercialStatus: "CONTACT_SALES",
    billingModes: Object.freeze(["MANUAL_CONTRACT"] as const),
    allowedCurrencies: Object.freeze(["GBP", "EUR", "USD"] as const),
    trialEligible: false,
    manualContractAllowed: true,
    policyVersion: COMMERCIAL_POLICY_VERSION,
    effectiveFrom: EFFECTIVE_FROM,
    effectiveUntil: null,
  }),
});

/** The baseline plan resolved when an organisation has no paid subscription. */
export const BASELINE_PLAN_KEY: PlanKey = "COMMUNITY";

/** Look up a plan definition. Returns null for unknown keys (caller fails
 *  closed) — never throws, never guesses. */
export function getPlanDefinition(planKey: unknown): PlanDefinition | null {
  if (!isPlanKey(planKey)) return null;
  return PLAN_DEFINITIONS[planKey];
}

/** All plan definitions in canonical display order (cheapest → enterprise). */
export function allPlanDefinitions(): PlanDefinition[] {
  return ["COMMUNITY", "PROFESSIONAL", "TEAM", "ENTERPRISE"].map((k) => PLAN_DEFINITIONS[k as PlanKey]);
}

/** Whether a plan can be purchased self-serve through Stripe. False whenever the
 *  price is unresolved — checkout must fail closed in that case. */
export function isSelfServePurchasable(planKey: PlanKey): boolean {
  const def = PLAN_DEFINITIONS[planKey];
  return def.billingModes.includes("STRIPE_SELF_SERVE") && def.commercialStatus === "AVAILABLE_SELF_SERVE";
}

/** Whether an organisation on this plan may be granted the single automatic
 *  trial. Community/Enterprise are ineligible by policy. */
export function isTrialEligiblePlan(planKey: PlanKey): boolean {
  return PLAN_DEFINITIONS[planKey].trialEligible;
}
