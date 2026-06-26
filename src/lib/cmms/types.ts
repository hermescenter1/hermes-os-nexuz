// Phase 70 — Enterprise CMMS types

export type MaintenancePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "EMERGENCY";
export type MaintenanceStatus   = "DRAFT" | "PLANNED" | "SCHEDULED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CANCELLED" | "OVERDUE";
export type MaintenanceType     = "PREVENTIVE" | "PREDICTIVE" | "CORRECTIVE" | "EMERGENCY" | "SHUTDOWN" | "INSPECTION" | "LUBRICATION" | "CALIBRATION";
export type CmmsFailureSeverity     = "MINOR" | "MODERATE" | "MAJOR" | "CRITICAL";
export type CmmsFailureCategory     = "MECHANICAL" | "ELECTRICAL" | "INSTRUMENTATION" | "SOFTWARE" | "HYDRAULIC" | "PNEUMATIC" | "STRUCTURAL" | "OPERATIONAL";
export type WorkOrderType       = "PLANNED" | "UNPLANNED" | "EMERGENCY" | "PROJECT";
export type DowntimeReason      = "PLANNED_MAINTENANCE" | "BREAKDOWN" | "SETUP" | "WAITING_PARTS" | "WAITING_APPROVAL" | "EXTERNAL" | "UNKNOWN";
export type CmmsApprovalStatus  = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface MaintenancePlan {
  id:              string;
  organizationId:  string | null;
  assetId:         string | null;
  workCenterId:    string | null;
  name:            string;
  description:     string | null;
  maintenanceType: MaintenanceType;
  priority:        MaintenancePriority;
  frequencyDays:   number;
  estimatedHours:  number;
  leadTimeDays:    number;
  isActive:        boolean;
  lastExecutedAt:  string | null;
  nextDueAt:       string | null;
  createdBy:       string | null;
  createdAt:       string;
  updatedAt:       string;
  _count?: { tasks: number; schedules: number };
}

export interface MaintenanceSchedule {
  id:             string;
  organizationId: string | null;
  planId:         string | null;
  assetId:        string | null;
  taskId:         string | null;
  name:           string;
  scheduledDate:  string;
  estimatedHours: number;
  priority:       MaintenancePriority;
  status:         MaintenanceStatus;
  technicianId:   string | null;
  teamId:         string | null;
  notes:          string | null;
  completedAt:    string | null;
  createdBy:      string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface MaintenanceTask {
  id:               string;
  organizationId:   string | null;
  planId:           string | null;
  assetId:          string | null;
  workCenterId:     string | null;
  failureId:        string | null;
  workOrderType:    WorkOrderType;
  title:            string;
  description:      string | null;
  maintenanceType:  MaintenanceType;
  priority:         MaintenancePriority;
  status:           MaintenanceStatus;
  scheduledDate:    string | null;
  dueDate:          string | null;
  startedAt:        string | null;
  completedAt:      string | null;
  estimatedHours:   number | null;
  actualHours:      number | null;
  technicianId:     string | null;
  teamId:           string | null;
  workCenterCode:   string | null;
  erpWorkOrderId:   string | null;
  vendorId:         string | null;
  requiresApproval: boolean;
  approvalStatus:   CmmsApprovalStatus | null;
  createdBy:        string | null;
  deletedAt:        string | null;
  createdAt:        string;
  updatedAt:        string;
}

export interface MaintenanceExecution {
  id:           string;
  taskId:       string;
  technicianId: string | null;
  startedAt:    string;
  completedAt:  string | null;
  actualHours:  number | null;
  notes:        string | null;
  outcome:      string | null;
  meterReading: number | null;
  createdAt:    string;
  updatedAt:    string;
}

export interface MaintenanceChecklist {
  id:          string;
  taskId:      string | null;
  templateId:  string | null;
  name:        string;
  description: string | null;
  isTemplate:  boolean;
  assetType:   string | null;
  createdBy:   string | null;
  createdAt:   string;
  updatedAt:   string;
  items:       ChecklistItem[];
}

export interface ChecklistItem {
  id:            string;
  checklistId:   string;
  order:         number;
  description:   string;
  isRequired:    boolean;
  expectedValue: string | null;
  actualValue:   string | null;
  isCompleted:   boolean;
  completedBy:   string | null;
  completedAt:   string | null;
  notes:         string | null;
  createdAt:     string;
}

export interface MaintenanceTechnician {
  id:             string;
  organizationId: string | null;
  userId:         string | null;
  name:           string;
  employeeId:     string | null;
  specialty:      string | null;
  skills:         string[];
  certifications: string[];
  teamId:         string | null;
  isAvailable:    boolean;
  laborRate:      number | null;
  phone:          string | null;
  email:          string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface MaintenanceTeam {
  id:             string;
  organizationId: string | null;
  name:           string;
  description:    string | null;
  leadId:         string | null;
  specialty:      string | null;
  capacity:       number;
  createdAt:      string;
  updatedAt:      string;
}

export interface MaintenanceWorkCenter {
  id:             string;
  organizationId: string | null;
  code:           string;
  name:           string;
  description:    string | null;
  location:       string | null;
  costCenter:     string | null;
  isActive:       boolean;
  createdAt:      string;
  updatedAt:      string;
}

export interface MaintenanceCalendarEvent {
  id:             string;
  organizationId: string | null;
  taskId:         string | null;
  title:          string;
  description:    string | null;
  startDate:      string;
  endDate:        string | null;
  allDay:         boolean;
  eventType:      string;
  assetId:        string | null;
  technicianId:   string | null;
  priority:       MaintenancePriority;
  color:          string | null;
  createdBy:      string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface MaintenanceDowntime {
  id:              string;
  organizationId:  string | null;
  assetId:         string | null;
  taskId:          string | null;
  reason:          DowntimeReason;
  startedAt:       string;
  endedAt:         string | null;
  durationMinutes: number | null;
  description:     string | null;
  impact:          string | null;
  productionLoss:  number | null;
  currency:        string;
  reportedBy:      string | null;
  createdAt:       string;
  updatedAt:       string;
}

export interface MaintenanceFailure {
  id:              string;
  organizationId:  string | null;
  assetId:         string | null;
  taskId:          string | null;
  failureCodeId:   string | null;
  title:           string;
  description:     string;
  severity:        CmmsFailureSeverity;
  category:        CmmsFailureCategory;
  occurredAt:      string;
  detectedAt:      string | null;
  resolvedAt:      string | null;
  downtimeMinutes: number | null;
  reportedBy:      string | null;
  createdAt:       string;
  updatedAt:       string;
  causes?:         FailureCause[];
  correctiveActions?: CorrectiveAction[];
}

export interface FailureCode {
  id:          string;
  code:        string;
  name:        string;
  category:    CmmsFailureCategory;
  description: string | null;
  severity:    CmmsFailureSeverity;
  isActive:    boolean;
  createdAt:   string;
}

export interface FailureCause {
  id:          string;
  failureId:   string;
  cause:       string;
  probability: number;
  isConfirmed: boolean;
  notes:       string | null;
  createdAt:   string;
}

export interface CorrectiveAction {
  id:          string;
  failureId:   string;
  action:      string;
  assignedTo:  string | null;
  dueDate:     string | null;
  completedAt: string | null;
  status:      string;
  notes:       string | null;
  createdAt:   string;
  updatedAt:   string;
}

export interface MaintenanceCost {
  id:          string;
  taskId:      string;
  category:    string;
  description: string;
  amount:      number;
  currency:    string;
  date:        string;
  invoiceRef:  string | null;
  vendorId:    string | null;
  createdBy:   string | null;
  createdAt:   string;
}

export interface MaintenanceSparePart {
  id:             string;
  organizationId: string | null;
  partNumber:     string;
  name:           string;
  description:    string | null;
  category:       string | null;
  manufacturer:   string | null;
  unitCost:       number;
  currency:       string;
  stockQty:       number;
  minStockQty:    number;
  unit:           string;
  location:       string | null;
  erpItemId:      string | null;
  vendorId:       string | null;
  isActive:       boolean;
  createdAt:      string;
  updatedAt:      string;
}

export interface MaintenanceSpareUsage {
  id:        string;
  taskId:    string;
  partId:    string;
  quantity:  number;
  unitCost:  number;
  totalCost: number;
  usedBy:    string | null;
  notes:     string | null;
  usedAt:    string;
}

export interface MaintenanceComment {
  id:         string;
  taskId:     string;
  userId:     string | null;
  content:    string;
  isInternal: boolean;
  createdAt:  string;
  updatedAt:  string;
}

export interface MaintenanceApproval {
  id:           string;
  taskId:       string;
  stage:        number;
  approverRole: string;
  assignedTo:   string | null;
  status:       CmmsApprovalStatus;
  comment:      string | null;
  decidedAt:    string | null;
  decidedBy:    string | null;
  dueDate:      string | null;
  createdAt:    string;
  updatedAt:    string;
}

export interface MaintenanceHistory {
  id:          string;
  taskId:      string;
  userId:      string | null;
  action:      string;
  description: string | null;
  before:      Record<string, unknown> | null;
  after:       Record<string, unknown> | null;
  metadata:    Record<string, unknown>;
  createdAt:   string;
}

export interface MaintenanceNotification {
  id:      string;
  taskId:  string | null;
  userId:  string | null;
  type:    string;
  title:   string;
  message: string;
  isRead:  boolean;
  readAt:  string | null;
  sentAt:  string;
}

// ── KPI types ────────────────────────────────────────────────────────────────

export interface CmmsKpis {
  mtbf:                number;
  mttr:                number;
  availability:        number;
  maintenanceCompliance: number;
  overdueCount:        number;
  emergencyWorkPct:    number;
  technicianUtilization: number;
  totalDowntimeHours:  number;
  totalCost:           number;
  failureCount:        number;
  completedThisMonth:  number;
  scheduledThisMonth:  number;
}

export interface CmmsDashboard {
  kpis:            CmmsKpis;
  tasksByStatus:   Record<string, number>;
  tasksByType:     Record<string, number>;
  tasksByPriority: Record<string, number>;
  recentTasks:     MaintenanceTask[];
  recentFailures:  MaintenanceFailure[];
  upcomingTasks:   MaintenanceTask[];
  downtimeTrend:   { month: string; minutes: number }[];
  costTrend:       { month: string; amount: number }[];
}
