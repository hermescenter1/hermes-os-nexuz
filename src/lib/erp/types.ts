// Phase 68 — ERP & Operations Intelligence types

export type ErpProjectStatus        = "PLANNED" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED";
export type ErpTaskStatus           = "TODO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "DONE" | "CANCELLED";
export type ErpTaskPriority         = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ErpResourceType         = "HUMAN" | "EQUIPMENT" | "SOFTWARE" | "VEHICLE" | "FACILITY" | "TOOL";
export type ErpInventoryMovementType = "IN" | "OUT" | "TRANSFER" | "ADJUSTMENT" | "RESERVED" | "RELEASED";
export type ErpWorkOrderStatus      = "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "WAITING_APPROVAL" | "COMPLETED" | "CANCELLED";
export type ErpApprovalStatus       = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface ErpProject {
  id:               string;
  organizationId:   string | null;
  name:             string;
  description:      string | null;
  status:           ErpProjectStatus;
  startDate:        string | null;
  endDate:          string | null;
  budget:           number | null;
  actualCost:       number;
  crmAccountId:     string | null;
  crmOpportunityId: string | null;
  managerId:        string | null;
  createdBy:        string | null;
  deletedAt:        string | null;
  createdAt:        string;
  updatedAt:        string;
}

export interface ErpProjectMilestone {
  id:          string;
  projectId:   string;
  name:        string;
  description: string | null;
  dueDate:     string | null;
  completedAt: string | null;
  createdAt:   string;
  updatedAt:   string;
}

export interface ErpTask {
  id:             string;
  projectId:      string | null;
  teamId:         string | null;
  assigneeId:     string | null;
  createdBy:      string | null;
  title:          string;
  description:    string | null;
  status:         ErpTaskStatus;
  priority:       ErpTaskPriority;
  dueDate:        string | null;
  completedAt:    string | null;
  estimatedHours: number | null;
  actualHours:    number | null;
  deletedAt:      string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface ErpTaskComment {
  id:        string;
  taskId:    string;
  userId:    string | null;
  content:   string;
  createdAt: string;
}

export interface ErpTeam {
  id:             string;
  organizationId: string | null;
  name:           string;
  description:    string | null;
  leadId:         string | null;
  capacity:       number;
  createdAt:      string;
  updatedAt:      string;
}

export interface ErpTeamMember {
  id:           string;
  teamId:       string;
  userId:       string;
  role:         string;
  availability: number;
  joinedAt:     string;
}

export interface ErpResource {
  id:             string;
  organizationId: string | null;
  name:           string;
  type:           ErpResourceType;
  description:    string | null;
  costRate:       number | null;
  currency:       string;
  isAvailable:    boolean;
  projectId:      string | null;
  workOrderId:    string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface ErpInventoryItem {
  id:             string;
  organizationId: string | null;
  sku:            string;
  name:           string;
  category:       string | null;
  description:    string | null;
  quantity:       number;
  reserved:       number;
  reorderLevel:   number;
  unitCost:       number | null;
  currency:       string;
  location:       string | null;
  deletedAt:      string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface ErpInventoryMovement {
  id:        string;
  itemId:    string;
  type:      ErpInventoryMovementType;
  quantity:  number;
  reason:    string | null;
  reference: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface ErpWorkOrder {
  id:               string;
  organizationId:   string | null;
  projectId:        string | null;
  teamId:           string | null;
  title:            string;
  description:      string | null;
  status:           ErpWorkOrderStatus;
  priority:         ErpTaskPriority;
  assigneeId:       string | null;
  createdBy:        string | null;
  dueDate:          string | null;
  completedAt:      string | null;
  completionNote:   string | null;
  requiresApproval: boolean;
  deletedAt:        string | null;
  createdAt:        string;
  updatedAt:        string;
}

export interface ErpWorkOrderActivity {
  id:          string;
  workOrderId: string;
  userId:      string | null;
  action:      string;
  notes:       string | null;
  createdAt:   string;
}

export interface ErpOperationalKpi {
  id:          string;
  projectId:   string | null;
  name:        string;
  value:       number;
  target:      number | null;
  unit:        string | null;
  category:    string;
  periodStart: string | null;
  periodEnd:   string | null;
  createdAt:   string;
  updatedAt:   string;
}

export interface ErpProjectCost {
  id:          string;
  projectId:   string;
  description: string;
  amount:      number;
  currency:    string;
  category:    string | null;
  date:        string;
  createdBy:   string | null;
  createdAt:   string;
}

export interface ErpApprovalRequest {
  id:             string;
  organizationId: string | null;
  projectId:      string | null;
  workOrderId:    string | null;
  requestedBy:    string | null;
  title:          string;
  description:    string | null;
  status:         ErpApprovalStatus;
  decidedAt:      string | null;
  decidedBy:      string | null;
  decision:       string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface ErpApprovalStep {
  id:           string;
  requestId:    string;
  order:        number;
  approverRole: string;
  status:       ErpApprovalStatus;
  decidedBy:    string | null;
  decidedAt:    string | null;
  notes:        string | null;
  createdAt:    string;
}

// ── Composite / overview types ────────────────────────────────────────────────

export interface ErpProjectFull extends ErpProject {
  milestones: ErpProjectMilestone[];
  tasks:      ErpTask[];
  workOrders: ErpWorkOrder[];
  costs:      ErpProjectCost[];
}

export interface ErpTeamFull extends ErpTeam {
  members: ErpTeamMember[];
}

export interface ErpInventoryItemFull extends ErpInventoryItem {
  movements: ErpInventoryMovement[];
}

export interface ErpWorkOrderFull extends ErpWorkOrder {
  activities: ErpWorkOrderActivity[];
}

export interface ErpApprovalRequestFull extends ErpApprovalRequest {
  steps: ErpApprovalStep[];
}

export interface ErpOverview {
  activeProjects:     number;
  overdueTasks:       number;
  openWorkOrders:     number;
  inventoryWarnings:  number;
  pendingApprovals:   number;
  totalBudget:        number;
  totalActualCost:    number;
  resourceUtilization: number;
  recentActivity:     Array<{ type: string; description: string; createdAt: string }>;
  projectsByStatus:   Record<ErpProjectStatus, number>;
  tasksByStatus:      Record<ErpTaskStatus, number>;
  workOrdersByStatus: Record<ErpWorkOrderStatus, number>;
  kpiSummary:         ErpOperationalKpi[];
}

export interface ErpKpiReport {
  projectCompletionRate: number;
  taskThroughput:        number;
  workOrderCompletionRate: number;
  inventoryRisk:         number;
  resourceUtilization:   number;
  budgetVariance:        number;
  scheduleVariance:      number;
  approvalCycleTime:     number;
  kpis:                  ErpOperationalKpi[];
}
