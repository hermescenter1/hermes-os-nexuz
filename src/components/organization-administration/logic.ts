// PHASE 87K — pure derivation of the organization-administration attention
// layer (JSX-free, unit-testable). Every item is a deterministic predicate on
// a real record field — no invented severity, no claimed financial risk, no
// inferred security incident from a routine configuration gap.
//
// Deterministic rules (stable priority order — security/billing impact first):
//   1. subscription.status === "PAST_DUE"                → action → /dashboard/billing
//   2. subscription.status ∈ {EXPIRED, CANCELED}          → action → /dashboard/billing
//   3. invitations: status === "PENDING" && expiresAt < now
//        (an expired-but-still-PENDING record; the stored EXPIRED status is
//         counted here too)                               → action → …/invitations
//   4. members: status === "SUSPENDED"                    → action → …/members
//   5. plan limits reached: limit >= 0 && used >= limit   → action → /dashboard/billing
//      (limit === -1 means UNLIMITED per PlanLimits and never counts;
//       a metric with no usage record is NOT treated as 0 and never counts)
//   6. invitations: status === "PENDING" && expiresAt >= now → review → …/invitations
//   7. members: status === "INVITED"                      → review → …/members
//   8. no subscription record at all                      → review → /dashboard/billing
//
// NOTE: no rule claims a payment failure, security score or compliance state —
// only the subscription status the record actually carries.

import type { MemberRecord, InvitationRecord } from "@/lib/org/types";
import type { SubscriptionRecord } from "@/lib/billing/types";

export type AdminAttentionKind =
  | "pastDue" | "subscriptionEnded" | "expiredInvitations" | "suspendedMembers"
  | "limitReached" | "pendingInvitations" | "invitedMembers" | "noSubscription";

export interface AdminAttentionItem {
  id: string;
  kind: AdminAttentionKind;
  severity: "action" | "review";
  /** Aggregate count; 1 for singular subscription-state items. */
  count: number;
  href: string;
}

const MEMBERS_HREF = "/dashboard/organization/members";
const INVITATIONS_HREF = "/dashboard/organization/invitations";
const BILLING_HREF = "/dashboard/billing";

/** A PENDING invitation whose expiry has passed, or one already stored EXPIRED. */
export function isExpiredInvitation(inv: InvitationRecord, now: number): boolean {
  if (inv.status === "EXPIRED") return true;
  if (inv.status !== "PENDING") return false;
  const at = Date.parse(inv.expiresAt);
  return Number.isFinite(at) && at < now;
}

/** A PENDING invitation still inside its validity window. */
export function isLiveInvitation(inv: InvitationRecord, now: number): boolean {
  if (inv.status !== "PENDING") return false;
  const at = Date.parse(inv.expiresAt);
  return Number.isFinite(at) && at >= now;
}

export interface LimitRow {
  metric: string;
  /** Absent when the period has no usage record — NEVER coerced to 0. */
  used: number | null;
  /** -1 means unlimited (PlanLimits convention). */
  limit: number;
  unlimited: boolean;
  reached: boolean;
}

/**
 * Usage against real plan limits. A metric missing from the usage summary is
 * reported as `used: null` (not measured) and can never be "reached".
 */
export function buildLimitRows(
  limits: Record<string, number | boolean> | null | undefined,
  usage: Record<string, number> | null | undefined,
  metrics: readonly string[],
): LimitRow[] {
  if (!limits) return [];
  const rows: LimitRow[] = [];
  for (const metric of metrics) {
    const raw = limits[metric];
    if (typeof raw !== "number") continue; // boolean feature flags are not limits
    const used = usage && typeof usage[metric] === "number" ? usage[metric] : null;
    const unlimited = raw === -1;
    rows.push({
      metric,
      used,
      limit: raw,
      unlimited,
      reached: !unlimited && used !== null && used >= raw,
    });
  }
  return rows;
}

export function deriveAdminAttention(input: {
  members: MemberRecord[];
  invitations: InvitationRecord[];
  subscription: SubscriptionRecord | null;
  limitRows: LimitRow[];
  now: number;
}): AdminAttentionItem[] {
  const { members, invitations, subscription, limitRows, now } = input;
  const items: AdminAttentionItem[] = [];

  const expiredInv = invitations.filter((i) => isExpiredInvitation(i, now)).length;
  const liveInv = invitations.filter((i) => isLiveInvitation(i, now)).length;
  const suspended = members.filter((m) => m.status === "SUSPENDED").length;
  const invited = members.filter((m) => m.status === "INVITED").length;
  const reached = limitRows.filter((r) => r.reached).length;

  if (subscription?.status === "PAST_DUE")
    items.push({ id: "past-due", kind: "pastDue", severity: "action", count: 1, href: BILLING_HREF });
  if (subscription && (subscription.status === "EXPIRED" || subscription.status === "CANCELED"))
    items.push({ id: "sub-ended", kind: "subscriptionEnded", severity: "action", count: 1, href: BILLING_HREF });
  if (expiredInv > 0)
    items.push({ id: "inv-expired", kind: "expiredInvitations", severity: "action", count: expiredInv, href: INVITATIONS_HREF });
  if (suspended > 0)
    items.push({ id: "suspended", kind: "suspendedMembers", severity: "action", count: suspended, href: MEMBERS_HREF });
  if (reached > 0)
    items.push({ id: "limits", kind: "limitReached", severity: "action", count: reached, href: BILLING_HREF });
  if (liveInv > 0)
    items.push({ id: "inv-pending", kind: "pendingInvitations", severity: "review", count: liveInv, href: INVITATIONS_HREF });
  if (invited > 0)
    items.push({ id: "invited", kind: "invitedMembers", severity: "review", count: invited, href: MEMBERS_HREF });
  if (!subscription)
    items.push({ id: "no-sub", kind: "noSubscription", severity: "review", count: 1, href: BILLING_HREF });

  return items;
}

/** Member counts by status, in a stable display order. */
export function membersByStatus(members: MemberRecord[]): { status: string; count: number }[] {
  const order = ["ACTIVE", "INVITED", "SUSPENDED"] as const;
  return order
    .map((status) => ({ status, count: members.filter((m) => m.status === status).length }))
    .filter((r) => r.count > 0);
}

/** Invitation counts by status, in a stable display order. */
export function invitationsByStatus(invitations: InvitationRecord[]): { status: string; count: number }[] {
  const order = ["PENDING", "EXPIRED", "ACCEPTED", "REJECTED"] as const;
  return order
    .map((status) => ({ status, count: invitations.filter((i) => i.status === status).length }))
    .filter((r) => r.count > 0);
}
