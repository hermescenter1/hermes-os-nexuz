/**
 * PHASE 87I — Asset Registry & CMMS maintenance experience.
 *
 * Two SEPARATE canonical products that share one presentation vocabulary:
 *   • Asset Registry (/assets) — equipment identity, criticality, hierarchy.
 *   • CMMS (/cmms)            — maintenance work, plans, failures, reliability.
 * They cross-link contextually but never merge data ownership. CMMS
 * MaintenanceTask keeps its own record with the existing `erpWorkOrderId`
 * reference to the distinct ERP work order — untouched by this namespace.
 *
 * Surfaces reuse the dashboard-experience layout primitives (AttentionPanel,
 * SafeActionGrid, DashboardSection) instead of duplicating them. Presentation
 * only: data comes from the existing server-side getAssetDashboard() /
 * getDashboard(); authorization stays with the route layouts + APIs.
 */
export { AssetCommandSurface } from "./AssetCommandSurface";
export { MaintenanceCommandSurface } from "./MaintenanceCommandSurface";
export { AssetsSubNav, CmmsSubNav } from "./AmSubNav";
export { DistributionCard } from "./DistributionCard";
export {
  AssetStatusBadge, AssetCriticalityBadge, AssetRiskBadge,
  MaintenanceStatusBadge, MaintenancePriorityBadge,
} from "./StatusBadges";
export {
  deriveAssetAttention, deriveMaintenanceAttention, orderedDistribution,
  type AmAttentionItem, type AssetAttentionKind, type MaintenanceAttentionKind,
} from "./logic";
