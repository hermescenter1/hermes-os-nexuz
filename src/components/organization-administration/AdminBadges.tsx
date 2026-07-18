import { Badge, type BadgeVariant } from "@/components/ds";
import type { MemberStatus, InvitationStatus, OrgRole } from "@/lib/org/types";
import type { SubscriptionStatus } from "@/lib/billing/types";

// PHASE 87K — administration badges on ds tokens. The localized TEXT is the
// primary signal — billing and security state are never conveyed by colour
// alone. Enum VALUES stay internal; the caller supplies the display label.
//
// Membership status, invitation status and subscription status are DISTINCT
// families and never share a component: a member can be ACTIVE while an
// invitation is EXPIRED and the subscription is PAST_DUE.

const MEMBER_VARIANT: Record<MemberStatus, BadgeVariant> = {
  ACTIVE: "success",
  INVITED: "information",
  SUSPENDED: "danger",
};

const INVITATION_VARIANT: Record<InvitationStatus, BadgeVariant> = {
  PENDING: "warning",
  ACCEPTED: "success",
  REJECTED: "neutral",
  EXPIRED: "danger",
};

const SUBSCRIPTION_VARIANT: Record<SubscriptionStatus, BadgeVariant> = {
  TRIALING: "information",
  ACTIVE: "success",
  PAST_DUE: "danger",
  CANCELED: "neutral",
  EXPIRED: "neutral",
};

const ROLE_VARIANT: Record<OrgRole, BadgeVariant> = {
  OWNER: "brand",
  ADMIN: "brand",
  MANAGER: "information",
  ENGINEER: "information",
  VIEWER: "neutral",
  BILLING_ADMIN: "hypothesis",
  MEMBER: "neutral",
};

export function MembershipStatusBadge({ status, label }: { status: MemberStatus; label: string }) {
  return <Badge variant={MEMBER_VARIANT[status]}>{label}</Badge>;
}
export function InvitationStatusBadge({ status, label }: { status: InvitationStatus; label: string }) {
  return <Badge variant={INVITATION_VARIANT[status]}>{label}</Badge>;
}
export function SubscriptionStatusBadge({ status, label }: { status: SubscriptionStatus; label: string }) {
  return <Badge variant={SUBSCRIPTION_VARIANT[status]}>{label}</Badge>;
}
export function OrgRoleBadge({ role, label }: { role: OrgRole; label: string }) {
  return <Badge variant={ROLE_VARIANT[role]}>{label}</Badge>;
}
