/**
 * PHASE 87H — ERP business-operations experience.
 *
 * Premium operations command surface on the /erp landing, reusing the
 * dashboard-experience layout primitives (AttentionPanel, SafeActionGrid,
 * DashboardSection) instead of duplicating them. Presentation only: data comes
 * from the existing server-side getErpOverview(); authorization stays with the
 * /erp layout RequireCapability("admin") + the API, unchanged.
 */
export { ErpCommandSurface } from "./ErpCommandSurface";
export { ErpSubNav } from "./ErpSubNav";
export {
  ProjectStatusBadge, TaskStatusBadge, WorkOrderStatusBadge, ApprovalStatusBadge,
} from "./WorkflowStatusBadge";
export {
  deriveErpAttention, budgetVariancePct, formatErpMoney, type ErpAttentionItem,
} from "./logic";
