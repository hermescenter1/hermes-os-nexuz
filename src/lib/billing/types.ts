/**
 * Shared billing types (Phase 31).
 * Mirrors the Prisma enums as TypeScript unions so service code
 * can reference them without a static @prisma/client import.
 */

export type BillingCycle       = "MONTHLY" | "YEARLY";
export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
export type InvoiceStatus      = "DRAFT" | "ISSUED" | "PAID" | "VOID" | "OVERDUE";
export type PaymentStatus      = "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
export type Currency           = "IRR" | "GBP" | "USD" | "EUR";

/*
 * PHASE 110-A1.0b — `OrgRole` is the tenant contract's `OrganizationRole`.
 *
 * This was a hand-written list of SEVEN roles while `prisma/schema.prisma`
 * declares FIFTEEN. The eight it omitted are not hypothetical — HR_MANAGER,
 * RECRUITER, ACADEMY_ADMIN and the rest are values the ATS and Academy
 * surfaces write today. Every one of them reached this type through
 * `String(member.role) as OrgRole` in the billing resolver: a cast that told
 * the compiler a lie, so a member whose real role was `RECRUITER` was typed as
 * one of seven roles that did not include it, and any `switch` over `OrgRole`
 * looked exhaustive while silently having no branch for them.
 *
 * The fix is an alias, not a longer list. `ORGANIZATION_ROLES` in
 * `src/lib/tenant/contract.ts` is already held to the schema in BOTH directions
 * by `tenant-context-static.test.ts`, so a role added to the schema tomorrow
 * fails a test instead of quietly bypassing a type. Keeping a second copy here
 * would be re-creating the drift this replaces.
 *
 * It stays a type-only import: `contract.ts` is a pure module, and importing a
 * value from it would put it in this module's runtime graph for a type fact.
 *
 * This WIDENS a type. Nothing authorizes on `OrgRole` by its width — the RBAC
 * layer in `src/lib/org/rbac.ts` matches specific roles and denies the rest —
 * so a role that now type-checks still gets exactly the permissions its own
 * policy grants it.
 */
import type { OrganizationRole } from "@/lib/tenant/contract";

export type OrgRole = OrganizationRole;

/** Terminal subscription states — no second active sub can be created while one is in these */
export const TERMINAL_STATUSES: SubscriptionStatus[] = ["CANCELED", "EXPIRED"];
/** Non-terminal statuses — org may have at most ONE subscription in any of these */
export const ACTIVE_STATUSES: SubscriptionStatus[]   = ["TRIALING", "ACTIVE", "PAST_DUE"];

export interface PlanLimits {
  ai_requests:            number;  // -1 = unlimited
  projects:               number;
  members:                number;
  storage_gb:             number;
  api_calls:              number;  // external API calls per month; -1 = unlimited
  emails_sent:            number;  // outbound emails per month; -1 = unlimited
  notifications_created:  number;  // in-app notifications per month; -1 = unlimited
  industrial_gateway:     boolean;
  multi_agent:            boolean;
  api_access:             boolean;
  priority_support:       boolean;
}

export interface PlanRecord {
  id:           string;
  name:         string;
  slug:         string;
  description:  string;
  monthlyPrice: string; // Decimal as string to avoid precision loss in JSON
  yearlyPrice:  string;
  currency:     Currency;
  features:     string[];
  limits:       PlanLimits;
  isActive:     boolean;
}

export interface SubscriptionRecord {
  id:             string;
  organizationId: string;
  planId:         string;
  plan:           PlanRecord | null;
  status:         SubscriptionStatus;
  billingCycle:   BillingCycle;
  startsAt:       string;
  expiresAt:      string;
  autoRenew:      boolean;
  createdAt:      string;
}

export interface InvoiceRecord {
  id:             string;
  organizationId: string;
  subscriptionId: string;
  invoiceNumber:  string;
  currency:       Currency;
  subtotal:       string;
  tax:            string;
  total:          string;
  status:         InvoiceStatus;
  issuedAt:       string;
  paidAt:         string | null;
  createdAt:      string;
}

export interface UsageSummary {
  organizationId: string;
  metrics:        Record<string, number>;
  recordedAt:     string;
}

export interface OrgContext {
  userId: string;
  orgId:  string;
  role:   OrgRole;
}
