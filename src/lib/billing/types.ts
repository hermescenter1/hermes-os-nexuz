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
export type OrgRole            = "OWNER" | "ADMIN" | "MEMBER";

/** Terminal subscription states — no second active sub can be created while one is in these */
export const TERMINAL_STATUSES: SubscriptionStatus[] = ["CANCELED", "EXPIRED"];
/** Non-terminal statuses — org may have at most ONE subscription in any of these */
export const ACTIVE_STATUSES: SubscriptionStatus[]   = ["TRIALING", "ACTIVE", "PAST_DUE"];

export interface PlanLimits {
  ai_requests:        number;  // -1 = unlimited
  projects:           number;
  members:            number;
  storage_gb:         number;
  industrial_gateway: boolean;
  multi_agent:        boolean;
  api_access:         boolean;
  priority_support:   boolean;
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
