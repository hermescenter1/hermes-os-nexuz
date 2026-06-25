// Phase 68 — ERP deterministic mock data

import type {
  ErpProject, ErpProjectMilestone, ErpTask, ErpTeam, ErpTeamMember,
  ErpResource, ErpInventoryItem, ErpInventoryMovement, ErpWorkOrder,
  ErpWorkOrderActivity, ErpOperationalKpi, ErpProjectCost,
  ErpApprovalRequest, ErpApprovalStep,
} from "./types";

const NOW = new Date("2026-06-25T12:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString();
const from = (d: number) => new Date(NOW.getTime() + d * 86400000).toISOString();

// ── Projects ──────────────────────────────────────────────────────────────────

export const MOCK_PROJECTS: ErpProject[] = [
  { id: "prj-01", organizationId: null, name: "Hermes Platform Upgrade",      description: "Core platform modernization and feature parity",              status: "ACTIVE",    startDate: ago(60), endDate: from(30),  budget: 280000, actualCost: 142000, crmAccountId: "acc-01", crmOpportunityId: null, managerId: "admin", createdBy: "admin", deletedAt: null, createdAt: ago(60), updatedAt: ago(2) },
  { id: "prj-02", organizationId: null, name: "Industrial IoT Rollout",       description: "Deploy IoT sensors across 3 manufacturing sites",              status: "ACTIVE",    startDate: ago(30), endDate: from(60),  budget: 175000, actualCost: 52000,  crmAccountId: "acc-02", crmOpportunityId: null, managerId: "admin", createdBy: "admin", deletedAt: null, createdAt: ago(30), updatedAt: ago(1) },
  { id: "prj-03", organizationId: null, name: "Customer Success Automation",  description: "Automate onboarding and health score workflows",               status: "PLANNED",   startDate: from(7), endDate: from(90),  budget: 95000,  actualCost: 0,      crmAccountId: null,     crmOpportunityId: null, managerId: "admin", createdBy: "admin", deletedAt: null, createdAt: ago(5),  updatedAt: ago(1) },
  { id: "prj-04", organizationId: null, name: "Compliance Infrastructure",    description: "GDPR/SOC2 hardening and audit trail implementation",           status: "COMPLETED", startDate: ago(90), endDate: ago(10),   budget: 60000,  actualCost: 58500,  crmAccountId: null,     crmOpportunityId: null, managerId: "admin", createdBy: "admin", deletedAt: null, createdAt: ago(90), updatedAt: ago(10) },
  { id: "prj-05", organizationId: null, name: "ATS & Talent Pipeline",        description: "Build enterprise recruiting and candidate tracking system",     status: "COMPLETED", startDate: ago(120),endDate: ago(45),   budget: 80000,  actualCost: 79000,  crmAccountId: null,     crmOpportunityId: null, managerId: "admin", createdBy: "admin", deletedAt: null, createdAt: ago(120),updatedAt: ago(45) },
  { id: "prj-06", organizationId: null, name: "Vendor Ecosystem Integration", description: "Onboard 20 vendors and integrate vendor management portal",    status: "ON_HOLD",   startDate: ago(15), endDate: from(45),  budget: 40000,  actualCost: 12000,  crmAccountId: "acc-03", crmOpportunityId: null, managerId: "admin", createdBy: "admin", deletedAt: null, createdAt: ago(15), updatedAt: ago(7) },
  { id: "prj-07", organizationId: null, name: "Academy Content Creation",     description: "Build 50 training modules for Hermes Academy",                 status: "ACTIVE",    startDate: ago(20), endDate: from(40),  budget: 35000,  actualCost: 9800,   crmAccountId: null,     crmOpportunityId: null, managerId: "admin", createdBy: "admin", deletedAt: null, createdAt: ago(20), updatedAt: ago(3) },
  { id: "prj-08", organizationId: null, name: "Multi-Site Dashboard",         description: "Executive dashboard for multi-site industrial operations",      status: "CANCELLED", startDate: ago(45), endDate: from(0),   budget: 25000,  actualCost: 8200,   crmAccountId: null,     crmOpportunityId: null, managerId: "admin", createdBy: "admin", deletedAt: null, createdAt: ago(45), updatedAt: ago(30) },
];

export const MOCK_MILESTONES: ErpProjectMilestone[] = [
  { id: "ms-01", projectId: "prj-01", name: "Architecture Review",   description: null, dueDate: ago(45), completedAt: ago(43), createdAt: ago(60), updatedAt: ago(43) },
  { id: "ms-02", projectId: "prj-01", name: "Backend APIs Complete", description: null, dueDate: ago(10), completedAt: ago(8),  createdAt: ago(60), updatedAt: ago(8) },
  { id: "ms-03", projectId: "prj-01", name: "UAT Sign-off",          description: null, dueDate: from(15),completedAt: null,    createdAt: ago(60), updatedAt: ago(2) },
  { id: "ms-04", projectId: "prj-01", name: "Production Deploy",     description: null, dueDate: from(30),completedAt: null,    createdAt: ago(60), updatedAt: ago(2) },
  { id: "ms-05", projectId: "prj-02", name: "Site A Sensor Install", description: null, dueDate: from(10),completedAt: null,    createdAt: ago(30), updatedAt: ago(1) },
  { id: "ms-06", projectId: "prj-02", name: "Telemetry Live",        description: null, dueDate: from(30),completedAt: null,    createdAt: ago(30), updatedAt: ago(1) },
];

// ── Tasks ─────────────────────────────────────────────────────────────────────

export const MOCK_TASKS: ErpTask[] = [
  { id: "tsk-01", projectId: "prj-01", teamId: "tm-01", assigneeId: "eng-01", createdBy: "admin", title: "Upgrade Prisma schema",           description: "Migrate to latest Prisma models",                   status: "DONE",        priority: "HIGH",     dueDate: ago(5),  completedAt: ago(4),  estimatedHours: 8,  actualHours: 7,   deletedAt: null, createdAt: ago(20), updatedAt: ago(4) },
  { id: "tsk-02", projectId: "prj-01", teamId: "tm-01", assigneeId: "eng-02", createdBy: "admin", title: "Build REST API layer",             description: "All CRUD endpoints with Zod validation",            status: "DONE",        priority: "HIGH",     dueDate: ago(3),  completedAt: ago(2),  estimatedHours: 16, actualHours: 18,  deletedAt: null, createdAt: ago(20), updatedAt: ago(2) },
  { id: "tsk-03", projectId: "prj-01", teamId: "tm-01", assigneeId: "eng-01", createdBy: "admin", title: "Frontend component library",      description: "Glassmorphism design system",                        status: "IN_PROGRESS", priority: "MEDIUM",   dueDate: from(5), completedAt: null,    estimatedHours: 24, actualHours: 12,  deletedAt: null, createdAt: ago(10), updatedAt: ago(1) },
  { id: "tsk-04", projectId: "prj-01", teamId: "tm-02", assigneeId: "eng-03", createdBy: "admin", title: "Security audit",                  description: "OWASP top 10 + penetration test",                   status: "TODO",        priority: "CRITICAL", dueDate: from(10),completedAt: null,    estimatedHours: 20, actualHours: null,deletedAt: null, createdAt: ago(5),  updatedAt: ago(1) },
  { id: "tsk-05", projectId: "prj-02", teamId: "tm-03", assigneeId: "eng-04", createdBy: "admin", title: "Sensor firmware configuration",   description: "Configure edge firmware for Site A sensors",        status: "IN_PROGRESS", priority: "HIGH",     dueDate: from(8), completedAt: null,    estimatedHours: 12, actualHours: 5,   deletedAt: null, createdAt: ago(10), updatedAt: ago(1) },
  { id: "tsk-06", projectId: "prj-02", teamId: "tm-03", assigneeId: "eng-04", createdBy: "admin", title: "MQTT broker setup",               description: "Deploy MQTT broker for telemetry routing",          status: "DONE",        priority: "HIGH",     dueDate: ago(2),  completedAt: ago(1),  estimatedHours: 8,  actualHours: 9,   deletedAt: null, createdAt: ago(15), updatedAt: ago(1) },
  { id: "tsk-07", projectId: "prj-07", teamId: "tm-02", assigneeId: "eng-02", createdBy: "admin", title: "Write Module 1-10 content",       description: "Core ERP and operations modules",                   status: "IN_PROGRESS", priority: "MEDIUM",   dueDate: from(20),completedAt: null,    estimatedHours: 40, actualHours: 18,  deletedAt: null, createdAt: ago(10), updatedAt: ago(2) },
  { id: "tsk-08", projectId: "prj-01", teamId: "tm-01", assigneeId: "eng-03", createdBy: "admin", title: "Performance optimization",        description: "Database query optimization and caching layer",      status: "BLOCKED",     priority: "HIGH",     dueDate: ago(1),  completedAt: null,    estimatedHours: 16, actualHours: 3,   deletedAt: null, createdAt: ago(8),  updatedAt: ago(1) },
  { id: "tsk-09", projectId: "prj-03", teamId: null,    assigneeId: null,     createdBy: "admin", title: "Requirements gathering",          description: "Define automation rules with stakeholders",         status: "TODO",        priority: "MEDIUM",   dueDate: from(7), completedAt: null,    estimatedHours: 8,  actualHours: null,deletedAt: null, createdAt: ago(2),  updatedAt: ago(2) },
  { id: "tsk-10", projectId: "prj-01", teamId: "tm-01", assigneeId: "eng-01", createdBy: "admin", title: "Documentation",                  description: "API and developer documentation",                   status: "REVIEW",      priority: "LOW",      dueDate: from(3), completedAt: null,    estimatedHours: 10, actualHours: 8,   deletedAt: null, createdAt: ago(7),  updatedAt: ago(1) },
];

// ── Teams ─────────────────────────────────────────────────────────────────────

export const MOCK_TEAMS: ErpTeam[] = [
  { id: "tm-01", organizationId: null, name: "Platform Engineering", description: "Core backend and infrastructure",  leadId: "eng-01", capacity: 4, createdAt: ago(180), updatedAt: ago(5) },
  { id: "tm-02", organizationId: null, name: "Product & Design",     description: "UX, content, and product strategy",leadId: "eng-02", capacity: 3, createdAt: ago(180), updatedAt: ago(5) },
  { id: "tm-03", organizationId: null, name: "Industrial & IoT",     description: "Edge devices and telemetry systems", leadId: "eng-04", capacity: 3, createdAt: ago(90),  updatedAt: ago(5) },
  { id: "tm-04", organizationId: null, name: "Customer Success",     description: "Onboarding and account management",  leadId: "csm-01", capacity: 5, createdAt: ago(120), updatedAt: ago(10) },
];

export const MOCK_TEAM_MEMBERS: ErpTeamMember[] = [
  { id: "tm-mbr-01", teamId: "tm-01", userId: "eng-01", role: "lead",   availability: 100, joinedAt: ago(180) },
  { id: "tm-mbr-02", teamId: "tm-01", userId: "eng-02", role: "member", availability: 80,  joinedAt: ago(150) },
  { id: "tm-mbr-03", teamId: "tm-01", userId: "eng-03", role: "member", availability: 100, joinedAt: ago(120) },
  { id: "tm-mbr-04", teamId: "tm-02", userId: "eng-02", role: "lead",   availability: 60,  joinedAt: ago(180) },
  { id: "tm-mbr-05", teamId: "tm-02", userId: "eng-05", role: "member", availability: 100, joinedAt: ago(90) },
  { id: "tm-mbr-06", teamId: "tm-03", userId: "eng-04", role: "lead",   availability: 100, joinedAt: ago(90) },
  { id: "tm-mbr-07", teamId: "tm-03", userId: "eng-06", role: "member", availability: 90,  joinedAt: ago(60) },
  { id: "tm-mbr-08", teamId: "tm-04", userId: "csm-01", role: "lead",  availability: 100, joinedAt: ago(120) },
  { id: "tm-mbr-09", teamId: "tm-04", userId: "csm-02", role: "member",availability: 100, joinedAt: ago(100) },
];

// ── Resources ─────────────────────────────────────────────────────────────────

export const MOCK_RESOURCES: ErpResource[] = [
  { id: "res-01", organizationId: null, name: "Senior Backend Engineer",   type: "HUMAN",     description: null, costRate: 120, currency: "USD", isAvailable: true,  projectId: "prj-01", workOrderId: null,  createdAt: ago(180), updatedAt: ago(2) },
  { id: "res-02", organizationId: null, name: "DevOps Engineer",           type: "HUMAN",     description: null, costRate: 110, currency: "USD", isAvailable: false, projectId: "prj-02", workOrderId: "wo-01",createdAt: ago(90),  updatedAt: ago(1) },
  { id: "res-03", organizationId: null, name: "IoT Gateway Device",        type: "EQUIPMENT", description: "Siemens IoT 2040", costRate: null, currency: "USD", isAvailable: false, projectId: "prj-02", workOrderId: null,  createdAt: ago(60),  updatedAt: ago(1) },
  { id: "res-04", organizationId: null, name: "Cloud Compute Cluster",     type: "SOFTWARE",  description: "4x c6i.4xlarge instances", costRate: 480, currency: "USD", isAvailable: true, projectId: "prj-01", workOrderId: null, createdAt: ago(120), updatedAt: ago(5) },
  { id: "res-05", organizationId: null, name: "UX Designer",               type: "HUMAN",     description: null, costRate: 95, currency: "USD", isAvailable: true,  projectId: "prj-01", workOrderId: null,  createdAt: ago(150), updatedAt: ago(3) },
  { id: "res-06", organizationId: null, name: "Field Service Vehicle",     type: "VEHICLE",   description: "Site inspection vehicle", costRate: 80, currency: "USD", isAvailable: true, projectId: "prj-02", workOrderId: null,  createdAt: ago(30),  updatedAt: ago(7) },
  { id: "res-07", organizationId: null, name: "Warehouse Forklift #2",     type: "EQUIPMENT", description: "Electric forklift capacity 2.5T", costRate: 35, currency: "USD", isAvailable: true, projectId: null, workOrderId: "wo-03", createdAt: ago(200), updatedAt: ago(10) },
  { id: "res-08", organizationId: null, name: "Calibration Toolkit",       type: "TOOL",      description: "Precision calibration instruments", costRate: 20, currency: "USD", isAvailable: false, projectId: null, workOrderId: "wo-02", createdAt: ago(45), updatedAt: ago(2) },
];

// ── Inventory ─────────────────────────────────────────────────────────────────

export const MOCK_INVENTORY: ErpInventoryItem[] = [
  { id: "inv-01", organizationId: null, sku: "SNS-001", name: "Temperature Sensor — Pt100",   category: "SENSORS",    description: null, quantity: 45,  reserved: 12, reorderLevel: 20, unitCost: 28.5,  currency: "USD", location: "Warehouse A", deletedAt: null, createdAt: ago(90), updatedAt: ago(2) },
  { id: "inv-02", organizationId: null, sku: "SNS-002", name: "Pressure Transducer 0-10bar",  category: "SENSORS",    description: null, quantity: 18,  reserved: 5,  reorderLevel: 15, unitCost: 72.0,  currency: "USD", location: "Warehouse A", deletedAt: null, createdAt: ago(90), updatedAt: ago(3) },
  { id: "inv-03", organizationId: null, sku: "GW-001",  name: "Industrial IoT Gateway",       category: "NETWORKING", description: null, quantity: 6,   reserved: 3,  reorderLevel: 5,  unitCost: 340.0, currency: "USD", location: "IT Storage", deletedAt: null, createdAt: ago(60), updatedAt: ago(1) },
  { id: "inv-04", organizationId: null, sku: "CAB-001", name: "Ethernet Cable CAT6 100m",     category: "CABLING",    description: null, quantity: 200, reserved: 60, reorderLevel: 50, unitCost: 18.0,  currency: "USD", location: "Warehouse B", deletedAt: null, createdAt: ago(120),updatedAt: ago(5) },
  { id: "inv-05", organizationId: null, sku: "BAT-001", name: "Li-Ion Battery Pack 48V",      category: "POWER",      description: null, quantity: 8,   reserved: 2,  reorderLevel: 10, unitCost: 280.0, currency: "USD", location: "Warehouse A", deletedAt: null, createdAt: ago(45), updatedAt: ago(4) },
  { id: "inv-06", organizationId: null, sku: "HW-001",  name: "Server Rack Unit 2U",          category: "HARDWARE",   description: null, quantity: 4,   reserved: 4,  reorderLevel: 2,  unitCost: 520.0, currency: "USD", location: "Data Center", deletedAt: null, createdAt: ago(80), updatedAt: ago(6) },
  { id: "inv-07", organizationId: null, sku: "LUB-001", name: "Industrial Lubricant 5L",      category: "CONSUMABLES",description: null, quantity: 3,   reserved: 0,  reorderLevel: 10, unitCost: 42.0,  currency: "USD", location: "Maintenance", deletedAt: null, createdAt: ago(30), updatedAt: ago(8) },
  { id: "inv-08", organizationId: null, sku: "SNS-003", name: "Vibration Sensor 3-axis MEMS", category: "SENSORS",    description: null, quantity: 22,  reserved: 10, reorderLevel: 10, unitCost: 95.0,  currency: "USD", location: "Warehouse A", deletedAt: null, createdAt: ago(50), updatedAt: ago(2) },
];

export const MOCK_INVENTORY_MOVEMENTS: ErpInventoryMovement[] = [
  { id: "mv-01", itemId: "inv-01", type: "IN",  quantity: 50,  reason: "Initial stock",     reference: "PO-2026-001", createdBy: "admin", createdAt: ago(90) },
  { id: "mv-02", itemId: "inv-01", type: "OUT", quantity: 5,   reason: "Site A deployment", reference: "WO-001",      createdBy: "admin", createdAt: ago(20) },
  { id: "mv-03", itemId: "inv-02", type: "IN",  quantity: 20,  reason: "Replenishment",     reference: "PO-2026-003", createdBy: "admin", createdAt: ago(30) },
  { id: "mv-04", itemId: "inv-05", type: "IN",  quantity: 10,  reason: "Initial stock",     reference: "PO-2026-005", createdBy: "admin", createdAt: ago(45) },
  { id: "mv-05", itemId: "inv-05", type: "OUT", quantity: 2,   reason: "Site B power unit", reference: "WO-003",      createdBy: "admin", createdAt: ago(10) },
  { id: "mv-06", itemId: "inv-07", type: "OUT", quantity: 7,   reason: "Monthly consumption",reference: null,         createdBy: "admin", createdAt: ago(5) },
];

// ── Work Orders ───────────────────────────────────────────────────────────────

export const MOCK_WORK_ORDERS: ErpWorkOrder[] = [
  { id: "wo-01", organizationId: null, projectId: "prj-02", teamId: "tm-03", title: "Site A Sensor Installation",      description: "Install 12 temperature sensors on production line 1-3", status: "IN_PROGRESS",    priority: "HIGH",   assigneeId: "eng-04", createdBy: "admin", dueDate: from(8),  completedAt: null,  completionNote: null, requiresApproval: false, deletedAt: null, createdAt: ago(10), updatedAt: ago(1) },
  { id: "wo-02", organizationId: null, projectId: "prj-02", teamId: "tm-03", title: "Calibrate Pressure Transducers", description: "Annual calibration for all process pressure sensors",   status: "WAITING_APPROVAL", priority: "MEDIUM", assigneeId: "eng-06", createdBy: "admin", dueDate: from(3),  completedAt: null,  completionNote: null, requiresApproval: true,  deletedAt: null, createdAt: ago(7),  updatedAt: ago(1) },
  { id: "wo-03", organizationId: null, projectId: null,     teamId: "tm-04", title: "Warehouse Inventory Audit",      description: "Full physical inventory count — Warehouse A & B",       status: "OPEN",           priority: "HIGH",   assigneeId: null,     createdBy: "admin", dueDate: from(5),  completedAt: null,  completionNote: null, requiresApproval: false, deletedAt: null, createdAt: ago(3),  updatedAt: ago(3) },
  { id: "wo-04", organizationId: null, projectId: "prj-01", teamId: "tm-01", title: "Database Failover Test",         description: "Scheduled DR test for primary PostgreSQL cluster",      status: "ASSIGNED",       priority: "CRITICAL",assigneeId: "eng-03", createdBy: "admin", dueDate: from(1),  completedAt: null,  completionNote: null, requiresApproval: true,  deletedAt: null, createdAt: ago(5),  updatedAt: ago(2) },
  { id: "wo-05", organizationId: null, projectId: "prj-04", teamId: "tm-02", title: "GDPR Compliance Documentation", description: "Finalize GDPR DPA and privacy notices",                  status: "COMPLETED",      priority: "HIGH",   assigneeId: "eng-05", createdBy: "admin", dueDate: ago(12), completedAt: ago(14),completionNote: "All docs signed and archived", requiresApproval: false, deletedAt: null, createdAt: ago(30), updatedAt: ago(14) },
  { id: "wo-06", organizationId: null, projectId: null,     teamId: null,    title: "Server Room HVAC Inspection",   description: "Quarterly HVAC maintenance and filter replacement",      status: "OPEN",           priority: "MEDIUM", assigneeId: null,     createdBy: "admin", dueDate: from(14), completedAt: null,  completionNote: null, requiresApproval: false, deletedAt: null, createdAt: ago(1),  updatedAt: ago(1) },
];

export const MOCK_WO_ACTIVITIES: ErpWorkOrderActivity[] = [
  { id: "woa-01", workOrderId: "wo-01", userId: "eng-04", action: "started",  notes: "Equipment delivered to Site A",   createdAt: ago(8) },
  { id: "woa-02", workOrderId: "wo-01", userId: "eng-04", action: "progress", notes: "4/12 sensors installed on Line 1", createdAt: ago(4) },
  { id: "woa-03", workOrderId: "wo-02", userId: "eng-06", action: "submitted",notes: "Calibration complete, awaiting QA sign-off", createdAt: ago(2) },
  { id: "woa-04", workOrderId: "wo-04", userId: "eng-03", action: "assigned", notes: "Assigned to database team",        createdAt: ago(4) },
  { id: "woa-05", workOrderId: "wo-05", userId: "eng-05", action: "completed",notes: "All documentation finalized",       createdAt: ago(14) },
];

// ── KPIs ──────────────────────────────────────────────────────────────────────

export const MOCK_KPIS: ErpOperationalKpi[] = [
  { id: "kpi-01", projectId: null, name: "Project Completion Rate",    value: 62.5, target: 75, unit: "%",   category: "PROJECTS",   periodStart: ago(30), periodEnd: null, createdAt: ago(1), updatedAt: ago(1) },
  { id: "kpi-02", projectId: null, name: "Task Throughput",            value: 23,   target: 30, unit: "tasks/week", category: "TASKS", periodStart: ago(7), periodEnd: null, createdAt: ago(1), updatedAt: ago(1) },
  { id: "kpi-03", projectId: null, name: "Work Order Completion Rate", value: 78.0, target: 90, unit: "%",   category: "OPERATIONS", periodStart: ago(30), periodEnd: null, createdAt: ago(1), updatedAt: ago(1) },
  { id: "kpi-04", projectId: null, name: "Inventory Risk Items",       value: 3,    target: 0,  unit: "items",category: "INVENTORY", periodStart: null,    periodEnd: null, createdAt: ago(1), updatedAt: ago(1) },
  { id: "kpi-05", projectId: null, name: "Resource Utilization",       value: 71.4, target: 80, unit: "%",   category: "RESOURCES",  periodStart: ago(7),  periodEnd: null, createdAt: ago(1), updatedAt: ago(1) },
  { id: "kpi-06", projectId: "prj-01", name: "Budget Variance",        value: -5.3, target: 0, unit: "%",   category: "FINANCE",    periodStart: ago(60), periodEnd: null, createdAt: ago(1), updatedAt: ago(1) },
  { id: "kpi-07", projectId: "prj-01", name: "Schedule Variance",      value: -3.2, target: 0, unit: "days",category: "SCHEDULE",   periodStart: ago(60), periodEnd: null, createdAt: ago(1), updatedAt: ago(1) },
  { id: "kpi-08", projectId: null, name: "Approval Cycle Time",        value: 2.4,  target: 2,  unit: "days",category: "APPROVALS",  periodStart: ago(30), periodEnd: null, createdAt: ago(1), updatedAt: ago(1) },
];

// ── Approvals ─────────────────────────────────────────────────────────────────

export const MOCK_APPROVALS: ErpApprovalRequest[] = [
  { id: "apr-01", organizationId: null, projectId: "prj-02", workOrderId: "wo-02", requestedBy: "eng-06", title: "Calibration Sign-off",          description: "Approve calibration results for 18 pressure sensors", status: "PENDING",  decidedAt: null,  decidedBy: null,  decision: null, createdAt: ago(2),  updatedAt: ago(2) },
  { id: "apr-02", organizationId: null, projectId: "prj-01", workOrderId: "wo-04", requestedBy: "eng-03", title: "DR Test Approval",              description: "Approve scheduled database failover test",            status: "PENDING",  decidedAt: null,  decidedBy: null,  decision: null, createdAt: ago(4),  updatedAt: ago(4) },
  { id: "apr-03", organizationId: null, projectId: "prj-02", workOrderId: null,    requestedBy: "admin",  title: "IoT Procurement Budget",        description: "Additional $42,000 for Site B sensor installation",   status: "APPROVED", decidedAt: ago(5),decidedBy: "admin",decision: "Approved — within project contingency", createdAt: ago(10), updatedAt: ago(5) },
  { id: "apr-04", organizationId: null, projectId: null,     workOrderId: "wo-06", requestedBy: "admin",  title: "HVAC Maintenance Contract",     description: "Annual HVAC maintenance contract renewal $8,500",     status: "REJECTED", decidedAt: ago(1),decidedBy: "admin",decision: "Rejected — seek 3 alternative quotes", createdAt: ago(7),  updatedAt: ago(1) },
];

export const MOCK_APPROVAL_STEPS: ErpApprovalStep[] = [
  { id: "aps-01", requestId: "apr-01", order: 1, approverRole: "engineer", status: "PENDING", decidedBy: null, decidedAt: null, notes: null, createdAt: ago(2) },
  { id: "aps-02", requestId: "apr-01", order: 2, approverRole: "admin",    status: "PENDING", decidedBy: null, decidedAt: null, notes: null, createdAt: ago(2) },
  { id: "aps-03", requestId: "apr-02", order: 1, approverRole: "admin",    status: "PENDING", decidedBy: null, decidedAt: null, notes: null, createdAt: ago(4) },
  { id: "aps-04", requestId: "apr-03", order: 1, approverRole: "admin",    status: "APPROVED",decidedBy: "admin", decidedAt: ago(5), notes: "Within budget", createdAt: ago(10) },
  { id: "aps-05", requestId: "apr-04", order: 1, approverRole: "admin",    status: "REJECTED",decidedBy: "admin", decidedAt: ago(1), notes: "Need 3 quotes", createdAt: ago(7) },
];

// ── Project Costs ─────────────────────────────────────────────────────────────

export const MOCK_PROJECT_COSTS: ErpProjectCost[] = [
  { id: "cst-01", projectId: "prj-01", description: "Backend engineering — Sprint 1-4",  amount: 82000, currency: "USD", category: "LABOR",   date: ago(30), createdBy: "admin", createdAt: ago(30) },
  { id: "cst-02", projectId: "prj-01", description: "Cloud infrastructure Q1",           amount: 28000, currency: "USD", category: "INFRA",   date: ago(15), createdBy: "admin", createdAt: ago(15) },
  { id: "cst-03", projectId: "prj-01", description: "Third-party API licenses",          amount: 12000, currency: "USD", category: "LICENSE", date: ago(10), createdBy: "admin", createdAt: ago(10) },
  { id: "cst-04", projectId: "prj-01", description: "Security audit",                    amount: 20000, currency: "USD", category: "AUDIT",   date: ago(5),  createdBy: "admin", createdAt: ago(5) },
  { id: "cst-05", projectId: "prj-02", description: "IoT hardware — Site A",             amount: 38000, currency: "USD", category: "HARDWARE",date: ago(20), createdBy: "admin", createdAt: ago(20) },
  { id: "cst-06", projectId: "prj-02", description: "Field engineer deployment",         amount: 14000, currency: "USD", category: "LABOR",   date: ago(10), createdBy: "admin", createdAt: ago(10) },
];

// ── Derived helpers ────────────────────────────────────────────────────────────

const NOW_ISO = NOW.toISOString();
export const LOW_STOCK_ITEMS = MOCK_INVENTORY.filter(i => i.quantity <= i.reorderLevel && !i.deletedAt);
export const OVERDUE_TASKS   = MOCK_TASKS.filter(t => t.dueDate && t.dueDate < NOW_ISO && !t.completedAt && t.deletedAt === null);
export const OPEN_WO         = MOCK_WORK_ORDERS.filter(w => !["COMPLETED","CANCELLED"].includes(w.status) && !w.deletedAt);
export const PENDING_APPROVALS = MOCK_APPROVALS.filter(a => a.status === "PENDING");
export const ACTIVE_PROJECTS = MOCK_PROJECTS.filter(p => p.status === "ACTIVE" && !p.deletedAt);

export const MOCK_PROJECTS_FULL = MOCK_PROJECTS.map(p => ({
  ...p,
  milestones: MOCK_MILESTONES.filter(m => m.projectId === p.id),
  tasks:      MOCK_TASKS.filter(t => t.projectId === p.id),
  workOrders: MOCK_WORK_ORDERS.filter(w => w.projectId === p.id),
  costs:      MOCK_PROJECT_COSTS.filter(c => c.projectId === p.id),
}));

export const MOCK_TEAMS_FULL = MOCK_TEAMS.map(t => ({
  ...t,
  members: MOCK_TEAM_MEMBERS.filter(m => m.teamId === t.id),
}));

export const MOCK_INVENTORY_FULL = MOCK_INVENTORY.map(i => ({
  ...i,
  movements: MOCK_INVENTORY_MOVEMENTS.filter(m => m.itemId === i.id),
}));

export const MOCK_WORK_ORDERS_FULL = MOCK_WORK_ORDERS.map(w => ({
  ...w,
  activities: MOCK_WO_ACTIVITIES.filter(a => a.workOrderId === w.id),
}));

export const MOCK_APPROVALS_FULL = MOCK_APPROVALS.map(a => ({
  ...a,
  steps: MOCK_APPROVAL_STEPS.filter(s => s.requestId === a.id),
}));
