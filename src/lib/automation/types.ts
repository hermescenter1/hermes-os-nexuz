// Phase 67 — Workflow & Automation Engine types

export type WorkflowStatus         = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
export type WorkflowExecutionStatus = "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED" | "PARTIAL" | "CANCELLED";

export type WorkflowTriggerType =
  | "MANUAL" | "SCHEDULED"
  | "CRM_LEAD_CREATED" | "CRM_OPPORTUNITY_WON" | "CRM_CUSTOMER_AT_RISK"
  | "ATS_CANDIDATE_CREATED" | "ATS_APPLICATION_SUBMITTED"
  | "ACADEMY_COURSE_COMPLETED"
  | "VENDOR_ONBOARDING_REQUESTED"
  | "CUSTOMER_SUPPORT_TICKET_CREATED"
  | "INDUSTRIAL_ASSET_RISK_HIGH"
  | "KNOWLEDGE_ARTICLE_CREATED";

export type WorkflowConditionType =
  | "ALWAYS" | "FIELD_EQUALS" | "FIELD_NOT_EQUALS"
  | "FIELD_GREATER_THAN" | "FIELD_LESS_THAN"
  | "STATUS_IS" | "ROLE_IS" | "HEALTH_SCORE_BELOW" | "PRIORITY_IS";

export type WorkflowActionType =
  | "CREATE_NOTIFICATION" | "CREATE_TASK" | "CREATE_SUPPORT_TICKET"
  | "CREATE_CRM_ACTIVITY" | "UPDATE_RECORD_STATUS" | "ASSIGN_OWNER"
  | "CREATE_AUDIT_LOG" | "SEND_WEBHOOK" | "CREATE_KNOWLEDGE_NOTE"
  | "CREATE_MAINTENANCE_ALERT";

export interface WorkflowDefinition {
  id:             string;
  organizationId: string | null;
  name:           string;
  description:    string | null;
  status:         WorkflowStatus;
  triggerType:    WorkflowTriggerType;
  templateId:     string | null;
  createdBy:      string | null;
  updatedBy:      string | null;
  deletedAt:      string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface WorkflowCondition {
  id:         string;
  workflowId: string;
  type:       WorkflowConditionType;
  field:      string | null;
  operator:   string | null;
  value:      string | null;
  logicGroup: number;
  createdAt:  string;
  updatedAt:  string;
}

export interface WorkflowAction {
  id:         string;
  workflowId: string;
  type:       WorkflowActionType;
  order:      number;
  config:     Record<string, unknown>;
  createdAt:  string;
  updatedAt:  string;
}

export interface WorkflowExecution {
  id:           string;
  workflowId:   string;
  status:       WorkflowExecutionStatus;
  triggeredBy:  string | null;
  triggerData:  Record<string, unknown>;
  startedAt:    string | null;
  finishedAt:   string | null;
  durationMs:   number | null;
  errorMessage: string | null;
  isSimulation: boolean;
  createdAt:    string;
}

export interface WorkflowExecutionStep {
  id:          string;
  executionId: string;
  stepType:    string;
  stepOrder:   number;
  status:      string;
  input:       Record<string, unknown>;
  output:      Record<string, unknown>;
  error:       string | null;
  durationMs:  number | null;
  executedAt:  string | null;
  createdAt:   string;
}

export interface WorkflowExecutionLog {
  id:          string;
  executionId: string;
  level:       string;
  message:     string;
  metadata:    Record<string, unknown>;
  createdAt:   string;
}

export interface WorkflowTemplate {
  id:          string;
  name:        string;
  description: string | null;
  category:    string;
  triggerType: WorkflowTriggerType;
  definition:  WorkflowTemplateDef;
  isBuiltIn:   boolean;
  usageCount:  number;
  createdAt:   string;
  updatedAt:   string;
}

export interface WorkflowTemplateDef {
  triggerType:  WorkflowTriggerType;
  conditions:   Array<{ type: WorkflowConditionType; field?: string; value?: string }>;
  actions:      Array<{ type: WorkflowActionType; order: number; config: Record<string, unknown> }>;
}

export interface WorkflowWebhookEndpoint {
  id:              string;
  workflowId:      string | null;
  organizationId:  string | null;
  name:            string;
  url:             string;
  isActive:        boolean;
  lastDeliveredAt: string | null;
  failureCount:    number;
  retryCount:      number;
  deletedAt:       string | null;
  createdAt:       string;
  updatedAt:       string;
}

export interface WorkflowAuditEvent {
  id:          string;
  workflowId:  string | null;
  userId:      string | null;
  eventType:   string;
  description: string;
  before:      Record<string, unknown> | null;
  after:       Record<string, unknown> | null;
  metadata:    Record<string, unknown>;
  createdAt:   string;
}

// ── Composite types ───────────────────────────────────────────────────────────

export interface WorkflowDefinitionFull extends WorkflowDefinition {
  conditions: WorkflowCondition[];
  actions:    WorkflowAction[];
}

export interface WorkflowExecutionFull extends WorkflowExecution {
  steps: WorkflowExecutionStep[];
  logs:  WorkflowExecutionLog[];
  workflow: { id: string; name: string } | null;
}

export interface AutomationOverview {
  activeWorkflows:      number;
  executionsToday:      number;
  successRate:          number;
  failedExecutions:     number;
  totalExecutions:      number;
  mostUsedTemplates:    Array<{ id: string; name: string; usageCount: number }>;
  recentExecutions:     WorkflowExecution[];
  workflowsByStatus:    Record<WorkflowStatus, number>;
  executionsByStatus:   Record<WorkflowExecutionStatus, number>;
}

export interface SimulateResult {
  workflowId:   string;
  workflowName: string;
  triggerType:  WorkflowTriggerType;
  conditions:   Array<{ type: WorkflowConditionType; passed: boolean; reason: string }>;
  actions:      Array<{ type: WorkflowActionType; order: number; wouldExecute: boolean; preview: string }>;
  wouldExecute: boolean;
  summary:      string;
}
