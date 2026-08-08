// PHASE 96 — pure view-model helpers for the public pricing page.
//
// No I/O; derives everything from the billing-governance registries
// (plan-registry.ts / entitlement-registry.ts), which are themselves pure
// data. Nothing here invents a price or a numeric limit: every value handed
// to the UI is either a registry-derived display string or one of a small,
// closed set of safe status keys ("availableSelfServe" / "configurationRequired"
// / "contactSales" / "configurable"). The server is the only place this is
// computed — the page (a server component) calls these helpers directly, so
// the client never re-derives entitlements or a price.

import {
  getPlanEntitlements,
  getEntitlementDefinition,
} from "@/lib/billing-governance/entitlement-registry";
import { allPlanDefinitions } from "@/lib/billing-governance/plan-registry";
import type {
  CommercialStatus,
  EntitlementGrant,
  PlanDefinition,
  PlanKey,
} from "@/lib/billing-governance/types";

/** i18n key for the safe commercial-status label shown instead of any price. */
export type PricingStatusKey = "availableSelfServe" | "configurationRequired" | "contactSales";

const STATUS_TO_KEY: Readonly<Record<CommercialStatus, PricingStatusKey>> = Object.freeze({
  AVAILABLE_SELF_SERVE: "availableSelfServe",
  CONFIGURATION_REQUIRED: "configurationRequired",
  CONTACT_SALES: "contactSales",
});

/** Maps a plan's server-decided commercial status to the safe UI status key.
 *  Never returns a number; unresolved prices are always a status, not a value. */
export function pricingStatusKey(status: CommercialStatus): PricingStatusKey {
  return STATUS_TO_KEY[status];
}

/** Lowercase plan slug — keys into the existing, already-localised
 *  `billing.plans.*.name` / `.description` catalog entries. */
export function planSlug(planKey: PlanKey): string {
  return planKey.toLowerCase();
}

export interface PlanFeatureRow {
  readonly entitlementKey: string;
  readonly displayName: string;
}

export type ResourceStatusKey = "configurable" | "contactSales";

export interface PlanMeteredRow {
  readonly entitlementKey: string;
  readonly displayName: string;
  /** Never a number — metered resources always render a safe status. */
  readonly statusKey: ResourceStatusKey;
}

export interface PlanCatalogEntry {
  readonly definition: PlanDefinition;
  readonly slug: string;
  readonly statusKey: PricingStatusKey;
  readonly features: PlanFeatureRow[];
  readonly metered: PlanMeteredRow[];
}

function isVisibleFeatureGrant(grant: EntitlementGrant): boolean {
  return grant.kind === "FEATURE" && grant.limitType !== "FEATURE_DISABLED";
}

function isVisibleMeteredGrant(grant: EntitlementGrant): boolean {
  return grant.kind === "METERED" && grant.limitType !== "FEATURE_DISABLED";
}

/** FEATURE entitlements a plan structurally includes, in registry order. */
export function planFeatureRows(planKey: PlanKey): PlanFeatureRow[] {
  const grants = getPlanEntitlements(planKey) ?? [];
  return grants.filter(isVisibleFeatureGrant).map((grant) => {
    const def = getEntitlementDefinition(grant.entitlementKey);
    return {
      entitlementKey: grant.entitlementKey,
      displayName: def?.displayName ?? grant.entitlementKey,
    };
  });
}

/**
 * Metered resources a plan includes, with a safe status derived from the
 * PLAN's own commercial status — never from an invented ceiling. A
 * manual-contract plan (Enterprise) resolves its ceilings through sales; a
 * self-serve / awaiting-configuration plan resolves them once the owner
 * configures pricing, so it reads as "configurable".
 */
export function planMeteredRows(plan: PlanDefinition): PlanMeteredRow[] {
  const grants = getPlanEntitlements(plan.planKey) ?? [];
  const statusKey: ResourceStatusKey = plan.commercialStatus === "CONTACT_SALES" ? "contactSales" : "configurable";
  return grants.filter(isVisibleMeteredGrant).map((grant) => {
    const def = getEntitlementDefinition(grant.entitlementKey);
    return {
      entitlementKey: grant.entitlementKey,
      displayName: def?.displayName ?? grant.entitlementKey,
      statusKey,
    };
  });
}

/**
 * Full server-side view model for the public pricing page, in canonical tier
 * order (Community → Enterprise). Pure derivation from the registries.
 */
export function buildPlanCatalog(): PlanCatalogEntry[] {
  return allPlanDefinitions().map((definition) => ({
    definition,
    slug: planSlug(definition.planKey),
    statusKey: pricingStatusKey(definition.commercialStatus),
    features: planFeatureRows(definition.planKey),
    metered: planMeteredRows(definition),
  }));
}
