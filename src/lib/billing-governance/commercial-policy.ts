// PHASE 96 — commercial policy constants + derived access mode.
//
// Encodes the owner-approved commercial decisions as version-controlled
// constants and pure helpers. No I/O, no invented prices/limits. These values
// are authoritative and must not be silently overridden elsewhere.

import type { CommercialAccessMode, DomainSubscriptionStatus } from "./types";

/* ── Owner-approved policy constants ─────────────────────────────────────── */

export const TRIAL_DURATION_DAYS = 14 as const;
export const TRIAL_MAX_PER_ORGANISATION = 1 as const;
export const PAYMENT_FAILURE_GRACE_PERIOD_DAYS = 7 as const;

/** Upgrades take effect immediately; downgrades and default cancellations take
 *  effect at the end of the current billing period. Immediate cancellation is a
 *  Billing-Admin-only privileged action. */
export const UPGRADE_EFFECTIVE = "IMMEDIATE" as const;
export const DOWNGRADE_EFFECTIVE = "END_OF_CURRENT_PERIOD" as const;
export const DEFAULT_CANCELLATION = "END_OF_CURRENT_PERIOD" as const;
export const IMMEDIATE_CANCELLATION_REQUIRES = "BILLING_ADMIN" as const;

/** Tenant data is PRESERVED after downgrade / cancellation / suspension /
 *  expiry. Automatic tenant data deletion is FORBIDDEN. */
export const AUTOMATIC_TENANT_DATA_DELETION_FORBIDDEN = true as const;

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/* ── Commercial access mode ──────────────────────────────────────────────── */

/**
 * Derive the commercial access mode from a subscription's domain state.
 *
 * FULL_ACCESS       — normal operation (paid entitlements still gated separately).
 * READ_ONLY         — data preserved, no new resources (suspended/expired/canceled).
 * REMEDIATION_ONLY  — must complete/repair billing before normal use.
 * DENIED            — never returned here for a real state; reserved for callers.
 *
 * NOTE: READ_ONLY / REMEDIATION_ONLY must NOT be used by callers to block invoice
 * history, compliance-driven data export, or account recovery — those surfaces
 * are exempt by policy and are simply not gated on write access.
 */
export function accessModeForStatus(status: DomainSubscriptionStatus): CommercialAccessMode {
  switch (status) {
    case "NONE": // no subscription → Community baseline, full use of free features.
    case "TRIALING":
    case "ACTIVE":
    case "CANCEL_AT_PERIOD_END": // still paid until the period ends.
    case "PAST_DUE": // inside the payment grace window.
    case "PAYMENT_FAILED":
    case "GRACE_PERIOD":
      return "FULL_ACCESS";
    case "INCOMPLETE": // checkout not completed — remediate to proceed.
      return "REMEDIATION_ONLY";
    case "SUSPENDED":
    case "CANCELED":
    case "EXPIRED":
      return "READ_ONLY";
    default: {
      // Exhaustiveness guard: any unmapped state fails closed to READ_ONLY.
      const _never: never = status;
      void _never;
      return "READ_ONLY";
    }
  }
}

/** Whether a write/create is permitted under an access mode. Read-only and
 *  remediation-only modes deny creation (data is preserved, growth is blocked). */
export function accessModeAllowsCreate(mode: CommercialAccessMode): boolean {
  return mode === "FULL_ACCESS";
}

/** States in which paid-plan entitlements may be granted at all. Expired/
 *  suspended/canceled never grant paid access. */
export function statusGrantsPaidAccess(status: DomainSubscriptionStatus): boolean {
  switch (status) {
    case "TRIALING":
    case "ACTIVE":
    case "CANCEL_AT_PERIOD_END":
    case "PAST_DUE":
    case "PAYMENT_FAILED":
    case "GRACE_PERIOD":
      return true;
    default:
      return false; // NONE / INCOMPLETE / SUSPENDED / CANCELED / EXPIRED
  }
}
