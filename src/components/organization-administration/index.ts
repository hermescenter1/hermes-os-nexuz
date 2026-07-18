/**
 * PHASE 87K — organization administration & platform-billing experience.
 *
 * Organization membership is a SEPARATE concept from ERP teams/resources, ATS
 * candidates, CRM contacts and authentication accounts — this namespace never
 * merges them. Platform subscription billing is likewise separate from ERP
 * project budgets and internal company finance.
 *
 * The command surface reuses the dashboard-experience layout primitives
 * (AttentionPanel, SafeActionGrid, DashboardSection) and the asset-maintenance
 * DistributionCard instead of duplicating them. Presentation only: records are
 * fetched server-side through the EXISTING org/billing service functions;
 * authorization stays with those functions, the APIs and middleware.
 */
export {
  AdministrationCommandSurface, OrganizationIdentity,
  type AdministrationCommandSurfaceProps,
} from "./AdministrationCommandSurface";
export {
  MembershipStatusBadge, InvitationStatusBadge, SubscriptionStatusBadge, OrgRoleBadge,
} from "./AdminBadges";
export {
  deriveAdminAttention, buildLimitRows, membersByStatus, invitationsByStatus,
  isExpiredInvitation, isLiveInvitation,
  type AdminAttentionItem, type AdminAttentionKind, type LimitRow,
} from "./logic";
