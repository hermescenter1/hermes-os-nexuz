// Phase 67 — Automation deterministic mock data

import type {
  WorkflowDefinition, WorkflowCondition, WorkflowAction,
  WorkflowExecution, WorkflowWebhookEndpoint, WorkflowAuditEvent,
} from "./types";

const NOW = new Date("2026-06-25T12:00:00Z");
const ago = (h: number) => new Date(NOW.getTime() - h * 3600000).toISOString();

export const MOCK_WORKFLOWS: WorkflowDefinition[] = [
  { id: "wf-01", organizationId: null, name: "New Lead Follow-up",             description: "Automated lead intake and owner assignment",       status: "ACTIVE",   triggerType: "CRM_LEAD_CREATED",                  templateId: "tpl-01", createdBy: "admin", updatedBy: null, deletedAt: null, createdAt: ago(720), updatedAt: ago(48) },
  { id: "wf-02", organizationId: null, name: "Customer At Risk Alert",          description: "Health score monitoring and intervention",         status: "ACTIVE",   triggerType: "CRM_CUSTOMER_AT_RISK",              templateId: "tpl-02", createdBy: "admin", updatedBy: null, deletedAt: null, createdAt: ago(600), updatedAt: ago(24) },
  { id: "wf-03", organizationId: null, name: "ATS Application Intake",          description: "Notify recruiter on new application",              status: "ACTIVE",   triggerType: "ATS_APPLICATION_SUBMITTED",         templateId: "tpl-03", createdBy: "admin", updatedBy: null, deletedAt: null, createdAt: ago(480), updatedAt: ago(12) },
  { id: "wf-04", organizationId: null, name: "Academy Course Completion",       description: "Log CRM activity on course completion",            status: "ACTIVE",   triggerType: "ACADEMY_COURSE_COMPLETED",          templateId: "tpl-04", createdBy: "admin", updatedBy: null, deletedAt: null, createdAt: ago(360), updatedAt: ago(6) },
  { id: "wf-05", organizationId: null, name: "Vendor Onboarding Review",        description: "Vendor review notification pipeline",              status: "PAUSED",   triggerType: "VENDOR_ONBOARDING_REQUESTED",       templateId: "tpl-05", createdBy: "admin", updatedBy: null, deletedAt: null, createdAt: ago(240), updatedAt: ago(72) },
  { id: "wf-06", organizationId: null, name: "Industrial Asset Risk Alert",     description: "Critical asset monitoring and maintenance alert",  status: "ACTIVE",   triggerType: "INDUSTRIAL_ASSET_RISK_HIGH",        templateId: "tpl-06", createdBy: "admin", updatedBy: null, deletedAt: null, createdAt: ago(200), updatedAt: ago(2) },
  { id: "wf-07", organizationId: null, name: "Opportunity Won Follow-up",       description: "Post-deal activities on opportunity won",          status: "DRAFT",    triggerType: "CRM_OPPORTUNITY_WON",               templateId: null,     createdBy: "admin", updatedBy: null, deletedAt: null, createdAt: ago(48),  updatedAt: ago(1) },
  { id: "wf-08", organizationId: null, name: "Support Ticket Escalation",       description: "Auto-escalate critical support tickets",           status: "ACTIVE",   triggerType: "CUSTOMER_SUPPORT_TICKET_CREATED",  templateId: null,     createdBy: "admin", updatedBy: null, deletedAt: null, createdAt: ago(120), updatedAt: ago(3) },
];

export const MOCK_CONDITIONS: WorkflowCondition[] = [
  { id: "cond-01", workflowId: "wf-02", type: "HEALTH_SCORE_BELOW", field: null, operator: null, value: "50",       logicGroup: 0, createdAt: ago(600), updatedAt: ago(600) },
  { id: "cond-02", workflowId: "wf-07", type: "STATUS_IS",          field: null, operator: null, value: "WON",      logicGroup: 0, createdAt: ago(48),  updatedAt: ago(48)  },
  { id: "cond-03", workflowId: "wf-08", type: "PRIORITY_IS",        field: null, operator: null, value: "CRITICAL", logicGroup: 0, createdAt: ago(120), updatedAt: ago(120) },
];

export const MOCK_ACTIONS: WorkflowAction[] = [
  { id: "act-01", workflowId: "wf-01", type: "CREATE_CRM_ACTIVITY", order: 1, config: { activityType: "lead_intake" }, createdAt: ago(720), updatedAt: ago(720) },
  { id: "act-02", workflowId: "wf-01", type: "ASSIGN_OWNER",        order: 2, config: { strategy: "round_robin" },     createdAt: ago(720), updatedAt: ago(720) },
  { id: "act-03", workflowId: "wf-01", type: "CREATE_NOTIFICATION", order: 3, config: { channel: "in_app" },           createdAt: ago(720), updatedAt: ago(720) },
  { id: "act-04", workflowId: "wf-02", type: "CREATE_SUPPORT_TICKET", order: 1, config: { priority: "HIGH" },           createdAt: ago(600), updatedAt: ago(600) },
  { id: "act-05", workflowId: "wf-02", type: "CREATE_NOTIFICATION",   order: 2, config: { channel: "in_app" },          createdAt: ago(600), updatedAt: ago(600) },
  { id: "act-06", workflowId: "wf-02", type: "CREATE_AUDIT_LOG",      order: 3, config: { severity: "WARN" },           createdAt: ago(600), updatedAt: ago(600) },
  { id: "act-07", workflowId: "wf-06", type: "CREATE_MAINTENANCE_ALERT", order: 1, config: { priority: "CRITICAL" },   createdAt: ago(200), updatedAt: ago(200) },
  { id: "act-08", workflowId: "wf-06", type: "CREATE_NOTIFICATION",      order: 2, config: { channel: "in_app" },      createdAt: ago(200), updatedAt: ago(200) },
  { id: "act-09", workflowId: "wf-06", type: "CREATE_AUDIT_LOG",         order: 3, config: { severity: "CRITICAL" },   createdAt: ago(200), updatedAt: ago(200) },
];

export const MOCK_EXECUTIONS: WorkflowExecution[] = [
  { id: "exec-01", workflowId: "wf-01", status: "SUCCESS",  triggeredBy: "system", triggerData: { source: "lead_form" },   startedAt: ago(2),   finishedAt: ago(2),  durationMs: 142,  errorMessage: null, isSimulation: false, createdAt: ago(2) },
  { id: "exec-02", workflowId: "wf-02", status: "SUCCESS",  triggeredBy: "system", triggerData: { healthScore: 38 },        startedAt: ago(4),   finishedAt: ago(4),  durationMs: 231,  errorMessage: null, isSimulation: false, createdAt: ago(4) },
  { id: "exec-03", workflowId: "wf-01", status: "SUCCESS",  triggeredBy: "system", triggerData: { source: "linkedin" },     startedAt: ago(6),   finishedAt: ago(6),  durationMs: 118,  errorMessage: null, isSimulation: false, createdAt: ago(6) },
  { id: "exec-04", workflowId: "wf-06", status: "SUCCESS",  triggeredBy: "system", triggerData: { assetId: "ast-047" },     startedAt: ago(8),   finishedAt: ago(8),  durationMs: 305,  errorMessage: null, isSimulation: false, createdAt: ago(8) },
  { id: "exec-05", workflowId: "wf-03", status: "SUCCESS",  triggeredBy: "system", triggerData: { jobId: "job-02" },        startedAt: ago(10),  finishedAt: ago(10), durationMs: 89,   errorMessage: null, isSimulation: false, createdAt: ago(10) },
  { id: "exec-06", workflowId: "wf-02", status: "FAILED",   triggeredBy: "system", triggerData: { healthScore: 42 },        startedAt: ago(14),  finishedAt: ago(14), durationMs: 512,  errorMessage: "Notification service timeout", isSimulation: false, createdAt: ago(14) },
  { id: "exec-07", workflowId: "wf-06", status: "SUCCESS",  triggeredBy: "system", triggerData: { assetId: "ast-112" },     startedAt: ago(18),  finishedAt: ago(18), durationMs: 287,  errorMessage: null, isSimulation: false, createdAt: ago(18) },
  { id: "exec-08", workflowId: "wf-04", status: "SUCCESS",  triggeredBy: "system", triggerData: { courseId: "c-003" },      startedAt: ago(22),  finishedAt: ago(22), durationMs: 95,   errorMessage: null, isSimulation: false, createdAt: ago(22) },
  { id: "exec-09", workflowId: "wf-08", status: "PARTIAL",  triggeredBy: "system", triggerData: { ticketId: "t-089" },      startedAt: ago(26),  finishedAt: ago(26), durationMs: 441,  errorMessage: "Partial: 2/3 actions completed", isSimulation: false, createdAt: ago(26) },
  { id: "exec-10", workflowId: "wf-01", status: "SUCCESS",  triggeredBy: "system", triggerData: { source: "website" },      startedAt: ago(30),  finishedAt: ago(30), durationMs: 133,  errorMessage: null, isSimulation: false, createdAt: ago(30) },
  { id: "exec-11", workflowId: "wf-07", status: "CANCELLED",triggeredBy: "manual", triggerData: { opportunityId: "opp-03" },startedAt: ago(36), finishedAt: ago(36), durationMs: 21,   errorMessage: null, isSimulation: false, createdAt: ago(36) },
  { id: "exec-12", workflowId: "wf-01", status: "SUCCESS",  triggeredBy: "system", triggerData: { source: "academy" },      startedAt: ago(40),  finishedAt: ago(40), durationMs: 127,  errorMessage: null, isSimulation: false, createdAt: ago(40) },
  // simulation
  { id: "exec-13", workflowId: "wf-02", status: "SUCCESS",  triggeredBy: "admin",  triggerData: { healthScore: 35 },        startedAt: ago(50),  finishedAt: ago(50), durationMs: 0,    errorMessage: null, isSimulation: true,  createdAt: ago(50) },
];

export const MOCK_WEBHOOKS: WorkflowWebhookEndpoint[] = [
  { id: "wh-01", workflowId: "wf-01", organizationId: null, name: "CRM Lead Webhook",            url: "https://hooks.example.com/crm-leads",   isActive: true,  lastDeliveredAt: ago(2),  failureCount: 0, retryCount: 0, deletedAt: null, createdAt: ago(720), updatedAt: ago(2) },
  { id: "wh-02", workflowId: "wf-06", organizationId: null, name: "Industrial Alert Webhook",    url: "https://hooks.example.com/industrial",  isActive: true,  lastDeliveredAt: ago(8),  failureCount: 1, retryCount: 1, deletedAt: null, createdAt: ago(200), updatedAt: ago(8) },
  { id: "wh-03", workflowId: "wf-02", organizationId: null, name: "Customer Risk Notification",  url: "https://hooks.example.com/cs-alerts",   isActive: false, lastDeliveredAt: ago(72), failureCount: 3, retryCount: 3, deletedAt: null, createdAt: ago(600), updatedAt: ago(72) },
];

export const MOCK_AUDIT_EVENTS: WorkflowAuditEvent[] = [
  { id: "aud-01", workflowId: "wf-01", userId: "admin", eventType: "created",   description: "Workflow 'New Lead Follow-up' created",    before: null, after: { status: "DRAFT" },  metadata: {}, createdAt: ago(720) },
  { id: "aud-02", workflowId: "wf-01", userId: "admin", eventType: "activated", description: "Workflow activated",                        before: { status: "DRAFT" }, after: { status: "ACTIVE" }, metadata: {}, createdAt: ago(710) },
  { id: "aud-03", workflowId: "wf-02", userId: "admin", eventType: "created",   description: "Workflow 'Customer At Risk Alert' created", before: null, after: { status: "DRAFT" },  metadata: {}, createdAt: ago(600) },
  { id: "aud-04", workflowId: "wf-02", userId: "admin", eventType: "activated", description: "Workflow activated",                        before: { status: "DRAFT" }, after: { status: "ACTIVE" }, metadata: {}, createdAt: ago(590) },
  { id: "aud-05", workflowId: "wf-05", userId: "admin", eventType: "paused",    description: "Workflow paused for maintenance",           before: { status: "ACTIVE" }, after: { status: "PAUSED" }, metadata: {}, createdAt: ago(72) },
  { id: "aud-06", workflowId: "wf-06", userId: "system", eventType: "executed", description: "Workflow executed via INDUSTRIAL_ASSET_RISK_HIGH", before: null, after: { executionId: "exec-04" }, metadata: {}, createdAt: ago(8) },
];

// Pre-computed today's stats
const today = new Date("2026-06-25T00:00:00Z").toISOString();
export const EXECUTIONS_TODAY = MOCK_EXECUTIONS.filter(e => e.createdAt >= today);
export const SUCCESS_COUNT     = MOCK_EXECUTIONS.filter(e => e.status === "SUCCESS").length;
export const FAILED_COUNT      = MOCK_EXECUTIONS.filter(e => e.status === "FAILED").length;
export const SUCCESS_RATE      = Math.round((SUCCESS_COUNT / MOCK_EXECUTIONS.length) * 100);

export const MOCK_WORKFLOWS_WITH_DETAILS = MOCK_WORKFLOWS.map(wf => ({
  ...wf,
  conditions: MOCK_CONDITIONS.filter(c => c.workflowId === wf.id),
  actions:    MOCK_ACTIONS.filter(a => a.workflowId === wf.id),
}));
