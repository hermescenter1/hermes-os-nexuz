// Phase 67 — Built-in workflow templates

import type { WorkflowTemplate } from "./types";

const NOW = "2026-06-25T12:00:00Z";

export const BUILT_IN_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "tpl-01",
    name: "New Lead Follow-up",
    description: "When a new CRM lead is created, log a CRM activity, notify the owner, and auto-assign.",
    category: "CRM",
    triggerType: "CRM_LEAD_CREATED",
    isBuiltIn: true,
    usageCount: 47,
    createdAt: NOW,
    updatedAt: NOW,
    definition: {
      triggerType: "CRM_LEAD_CREATED",
      conditions: [{ type: "ALWAYS" }],
      actions: [
        { type: "CREATE_CRM_ACTIVITY", order: 1, config: { activityType: "lead_intake", message: "New lead received — initial contact required" } },
        { type: "ASSIGN_OWNER",        order: 2, config: { strategy: "round_robin" } },
        { type: "CREATE_NOTIFICATION", order: 3, config: { channel: "in_app", message: "New lead assigned to you" } },
      ],
    },
  },
  {
    id: "tpl-02",
    name: "Customer At Risk Alert",
    description: "When a customer health score drops below 50, open a support ticket and alert the CSM.",
    category: "CUSTOMER_SUCCESS",
    triggerType: "CRM_CUSTOMER_AT_RISK",
    isBuiltIn: true,
    usageCount: 31,
    createdAt: NOW,
    updatedAt: NOW,
    definition: {
      triggerType: "CRM_CUSTOMER_AT_RISK",
      conditions: [{ type: "HEALTH_SCORE_BELOW", value: "50" }],
      actions: [
        { type: "CREATE_SUPPORT_TICKET", order: 1, config: { priority: "HIGH", category: "customer_success", title: "Customer At Risk — Health Score Critical" } },
        { type: "CREATE_NOTIFICATION",   order: 2, config: { channel: "in_app", message: "Customer health score dropped below 50 — immediate action required" } },
        { type: "CREATE_AUDIT_LOG",      order: 3, config: { severity: "WARN", event: "customer_at_risk_alert" } },
      ],
    },
  },
  {
    id: "tpl-03",
    name: "Candidate Application Intake",
    description: "When an ATS application is submitted, log the activity and notify the recruiter.",
    category: "ATS",
    triggerType: "ATS_APPLICATION_SUBMITTED",
    isBuiltIn: true,
    usageCount: 28,
    createdAt: NOW,
    updatedAt: NOW,
    definition: {
      triggerType: "ATS_APPLICATION_SUBMITTED",
      conditions: [{ type: "ALWAYS" }],
      actions: [
        { type: "CREATE_NOTIFICATION", order: 1, config: { channel: "in_app", message: "New job application received" } },
        { type: "CREATE_AUDIT_LOG",    order: 2, config: { severity: "INFO", event: "ats_application_received" } },
      ],
    },
  },
  {
    id: "tpl-04",
    name: "Academy Completion Follow-up",
    description: "When a user completes an Academy course, create a CRM activity and send a congratulation notification.",
    category: "ACADEMY",
    triggerType: "ACADEMY_COURSE_COMPLETED",
    isBuiltIn: true,
    usageCount: 22,
    createdAt: NOW,
    updatedAt: NOW,
    definition: {
      triggerType: "ACADEMY_COURSE_COMPLETED",
      conditions: [{ type: "ALWAYS" }],
      actions: [
        { type: "CREATE_CRM_ACTIVITY", order: 1, config: { activityType: "academy_completion", message: "User completed Academy course" } },
        { type: "CREATE_NOTIFICATION", order: 2, config: { channel: "in_app", message: "Congratulations! You completed the course." } },
      ],
    },
  },
  {
    id: "tpl-05",
    name: "Vendor Onboarding Review",
    description: "When a vendor requests onboarding, notify the vendor team and create an audit trail.",
    category: "VENDOR",
    triggerType: "VENDOR_ONBOARDING_REQUESTED",
    isBuiltIn: true,
    usageCount: 15,
    createdAt: NOW,
    updatedAt: NOW,
    definition: {
      triggerType: "VENDOR_ONBOARDING_REQUESTED",
      conditions: [{ type: "ALWAYS" }],
      actions: [
        { type: "CREATE_NOTIFICATION", order: 1, config: { channel: "in_app", message: "New vendor onboarding request requires review" } },
        { type: "CREATE_AUDIT_LOG",    order: 2, config: { severity: "INFO", event: "vendor_onboarding_requested" } },
      ],
    },
  },
  {
    id: "tpl-06",
    name: "Industrial High Risk Asset",
    description: "When an industrial asset enters high-risk status, create a maintenance alert and audit log.",
    category: "INDUSTRIAL",
    triggerType: "INDUSTRIAL_ASSET_RISK_HIGH",
    isBuiltIn: true,
    usageCount: 38,
    createdAt: NOW,
    updatedAt: NOW,
    definition: {
      triggerType: "INDUSTRIAL_ASSET_RISK_HIGH",
      conditions: [{ type: "ALWAYS" }],
      actions: [
        { type: "CREATE_MAINTENANCE_ALERT", order: 1, config: { priority: "CRITICAL", message: "Asset risk level: HIGH — immediate inspection required" } },
        { type: "CREATE_NOTIFICATION",      order: 2, config: { channel: "in_app", message: "Industrial asset risk alert triggered" } },
        { type: "CREATE_AUDIT_LOG",         order: 3, config: { severity: "CRITICAL", event: "industrial_asset_risk_high" } },
      ],
    },
  },
];
