/**
 * PHASE 87J — EDMS / engineering-documents experience.
 *
 * Controlled engineering documents are a SEPARATE product from the public
 * Knowledge library, the Journal, Asset Registry document links and Industrial
 * Brain case evidence — this namespace never merges them.
 *
 * The command surface reuses the dashboard-experience layout primitives
 * (AttentionPanel, SafeActionGrid, DashboardSection) and the asset-maintenance
 * DistributionCard instead of duplicating them. Presentation only: data comes
 * from the existing server-side getDocumentDashboard(); authorization stays
 * with the route layout RequireCapability("admin") + the /api/edms routes.
 */
export { EdmsCommandSurface } from "./EdmsCommandSurface";
export { EdmsSubNav } from "./EdmsSubNav";
export { DocumentStatusBadge, ApprovalStatusBadge, RevisionTypeBadge } from "./DocumentBadges";
export {
  deriveDocumentAttention, documentsWithoutCurrentRevision, orderedCounts, linkedContext,
  type DocumentAttentionItem, type DocumentAttentionKind,
} from "./logic";
