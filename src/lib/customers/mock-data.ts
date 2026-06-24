import type {
  CustomerAccount, CustomerStatus, CustomerPlan, CustomerUsage, SuccessPlan,
} from "./types";
import { computeHealth } from "./health";

type RawAccount = Omit<CustomerAccount, "healthScore">;

const RAW_ACCOUNTS: RawAccount[] = [
  {
    id: "cust-001", companyName: "Siemens Engineering GmbH",
    industry: "Oil & Gas", country: "Germany",
    plan: "enterprise-plus", status: "active",
    sites: 8, assets: 340, arr: 180000, currency: "EUR",
    csm: "Thomas Weber", joinedAt: "2023-01-15", lastActiveAt: "2026-06-24",
    usage: { copilotQueries: 450, knowledgeGraphViews: 320, industrialDashboardLogins: 890, atsApplicationsProcessed: 45, knowledgeArticlesRead: 78, alertsHandled: 234, casesOpened: 12 },
  },
  {
    id: "cust-002", companyName: "ABB Industrial Solutions",
    industry: "Manufacturing", country: "Switzerland",
    plan: "enterprise", status: "active",
    sites: 5, assets: 180, arr: 96000, currency: "USD",
    csm: "Sofia Martins", joinedAt: "2023-06-20", lastActiveAt: "2026-06-22",
    usage: { copilotQueries: 280, knowledgeGraphViews: 190, industrialDashboardLogins: 560, atsApplicationsProcessed: 28, knowledgeArticlesRead: 45, alertsHandled: 156, casesOpened: 8 },
  },
  {
    id: "cust-003", companyName: "Schneider Manufacturing Inc",
    industry: "Automotive", country: "France",
    plan: "enterprise", status: "active",
    sites: 4, assets: 145, arr: 84000, currency: "EUR",
    csm: "Thomas Weber", joinedAt: "2024-02-01", lastActiveAt: "2026-06-20",
    usage: { copilotQueries: 210, knowledgeGraphViews: 145, industrialDashboardLogins: 420, atsApplicationsProcessed: 18, knowledgeArticlesRead: 32, alertsHandled: 98, casesOpened: 6 },
  },
  {
    id: "cust-004", companyName: "BP Refinery Operations",
    industry: "Oil & Gas", country: "United Kingdom",
    plan: "enterprise-plus", status: "at-risk",
    sites: 6, assets: 420, arr: 156000, currency: "GBP",
    csm: "James Okafor", joinedAt: "2024-03-15", lastActiveAt: "2026-05-28",
    usage: { copilotQueries: 45, knowledgeGraphViews: 22, industrialDashboardLogins: 89, atsApplicationsProcessed: 0, knowledgeArticlesRead: 5, alertsHandled: 18, casesOpened: 1 },
  },
  {
    id: "cust-005", companyName: "Volkswagen Automation GmbH",
    industry: "Automotive", country: "Germany",
    plan: "professional", status: "active",
    sites: 3, assets: 42, arr: 36000, currency: "EUR",
    csm: "Sofia Martins", joinedAt: "2024-08-10", lastActiveAt: "2026-06-18",
    usage: { copilotQueries: 45, knowledgeGraphViews: 28, industrialDashboardLogins: 95, atsApplicationsProcessed: 0, knowledgeArticlesRead: 12, alertsHandled: 38, casesOpened: 2 },
  },
  {
    id: "cust-006", companyName: "Delta Controls UAE",
    industry: "Utilities", country: "UAE",
    plan: "professional", status: "at-risk",
    sites: 2, assets: 28, arr: 28800, currency: "USD",
    csm: "James Okafor", joinedAt: "2024-12-01", lastActiveAt: "2026-06-01",
    usage: { copilotQueries: 12, knowledgeGraphViews: 8, industrialDashboardLogins: 34, atsApplicationsProcessed: 0, knowledgeArticlesRead: 3, alertsHandled: 9, casesOpened: 0 },
  },
  {
    id: "cust-007", companyName: "Omron Asia Pacific",
    industry: "Manufacturing", country: "Japan",
    plan: "enterprise", status: "active",
    sites: 4, assets: 165, arr: 84000, currency: "USD",
    csm: "Li Wei", joinedAt: "2024-04-22", lastActiveAt: "2026-06-23",
    usage: { copilotQueries: 195, knowledgeGraphViews: 134, industrialDashboardLogins: 388, atsApplicationsProcessed: 22, knowledgeArticlesRead: 38, alertsHandled: 112, casesOpened: 7 },
  },
  {
    id: "cust-008", companyName: "Phoenix Contact GmbH",
    industry: "Manufacturing", country: "Germany",
    plan: "starter", status: "onboarding",
    sites: 1, assets: 8, arr: 9600, currency: "EUR",
    csm: "Thomas Weber", joinedAt: "2026-04-10", lastActiveAt: "2026-06-23",
    usage: { copilotQueries: 8, knowledgeGraphViews: 5, industrialDashboardLogins: 22, atsApplicationsProcessed: 0, knowledgeArticlesRead: 4, alertsHandled: 2, casesOpened: 0 },
  },
  {
    id: "cust-009", companyName: "Mitsubishi Electric EU",
    industry: "Utilities", country: "Belgium",
    plan: "professional", status: "active",
    sites: 2, assets: 38, arr: 32400, currency: "EUR",
    csm: "Sofia Martins", joinedAt: "2025-01-15", lastActiveAt: "2026-06-10",
    usage: { copilotQueries: 55, knowledgeGraphViews: 38, industrialDashboardLogins: 145, atsApplicationsProcessed: 8, knowledgeArticlesRead: 14, alertsHandled: 42, casesOpened: 2 },
  },
  {
    id: "cust-010", companyName: "BASF Process Automation",
    industry: "Pharmaceuticals", country: "Germany",
    plan: "enterprise", status: "expansion-ready",
    sites: 6, assets: 192, arr: 108000, currency: "EUR",
    csm: "Li Wei", joinedAt: "2023-06-01", lastActiveAt: "2026-06-24",
    usage: { copilotQueries: 380, knowledgeGraphViews: 265, industrialDashboardLogins: 720, atsApplicationsProcessed: 38, knowledgeArticlesRead: 65, alertsHandled: 198, casesOpened: 10 },
  },
  {
    id: "cust-011", companyName: "ArcelorMittal Mining",
    industry: "Mining", country: "Luxembourg",
    plan: "enterprise-plus", status: "at-risk",
    sites: 5, assets: 285, arr: 132000, currency: "USD",
    csm: "James Okafor", joinedAt: "2023-09-15", lastActiveAt: "2026-05-20",
    usage: { copilotQueries: 28, knowledgeGraphViews: 15, industrialDashboardLogins: 48, atsApplicationsProcessed: 0, knowledgeArticlesRead: 4, alertsHandled: 11, casesOpened: 1 },
  },
  {
    id: "cust-012", companyName: "Danone Food Systems",
    industry: "Food & Beverage", country: "France",
    plan: "professional", status: "expansion-ready",
    sites: 3, assets: 45, arr: 42000, currency: "EUR",
    csm: "Li Wei", joinedAt: "2024-11-01", lastActiveAt: "2026-06-23",
    usage: { copilotQueries: 145, knowledgeGraphViews: 98, industrialDashboardLogins: 298, atsApplicationsProcessed: 12, knowledgeArticlesRead: 28, alertsHandled: 78, casesOpened: 4 },
  },
];

export const CUSTOMERS: CustomerAccount[] = RAW_ACCOUNTS.map(a => ({
  ...a,
  healthScore: computeHealth(a),
}));

export const SUCCESS_PLANS: SuccessPlan[] = [
  {
    id: "sp-001", customerId: "cust-001", companyName: "Siemens Engineering GmbH",
    goal: "Scale IIoT Knowledge Graph integration to 500 industrial assets",
    milestones: [
      { id: "ms-001-1", title: "Connect all Frankfurt plants to Knowledge Graph", dueDate: "2026-07-15", completed: true },
      { id: "ms-001-2", title: "Enable automated alert-to-case routing", dueDate: "2026-08-01", completed: false },
      { id: "ms-001-3", title: "Train 10 engineers on Knowledge Studio", dueDate: "2026-08-30", completed: false },
    ],
    owner: "Thomas Weber",
    nextAction: "Schedule Knowledge Studio onboarding workshop for engineering leads",
    dueDate: "2026-08-30", status: "on-track", createdAt: "2026-06-01",
  },
  {
    id: "sp-002", customerId: "cust-010", companyName: "BASF Process Automation",
    goal: "Upgrade to Enterprise+ and deploy ATS module for 200-hire annual plan",
    milestones: [
      { id: "ms-002-1", title: "Demo Enterprise+ feature set to CTO", dueDate: "2026-07-08", completed: true },
      { id: "ms-002-2", title: "Commercial proposal signed", dueDate: "2026-07-22", completed: false },
      { id: "ms-002-3", title: "ATS onboarding and first job postings live", dueDate: "2026-08-15", completed: false },
    ],
    owner: "Li Wei",
    nextAction: "Follow up on Enterprise+ proposal — pending legal review",
    dueDate: "2026-08-15", status: "on-track", createdAt: "2026-06-10",
  },
  {
    id: "sp-003", customerId: "cust-004", companyName: "BP Refinery Operations",
    goal: "Re-engage operations team and restore platform adoption to baseline",
    milestones: [
      { id: "ms-003-1", title: "Executive health review call with VP Operations", dueDate: "2026-07-01", completed: false },
      { id: "ms-003-2", title: "Identify 3 champion users in refinery team", dueDate: "2026-07-15", completed: false },
      { id: "ms-003-3", title: "Targeted Knowledge Base training session", dueDate: "2026-08-01", completed: false },
    ],
    owner: "James Okafor",
    nextAction: "Send executive health summary to VP Operations and book review call",
    dueDate: "2026-08-01", status: "at-risk", createdAt: "2026-06-15",
  },
  {
    id: "sp-004", customerId: "cust-012", companyName: "Danone Food Systems",
    goal: "Expand ATS adoption for 150 seasonal manufacturing hires per year",
    milestones: [
      { id: "ms-004-1", title: "ATS pilot with 5 positions in Normandy plant", dueDate: "2026-07-10", completed: true },
      { id: "ms-004-2", title: "Connect HR team to ATS platform", dueDate: "2026-07-20", completed: true },
      { id: "ms-004-3", title: "Run first full hiring cycle on platform", dueDate: "2026-08-20", completed: false },
    ],
    owner: "Li Wei",
    nextAction: "Review first batch of scored candidates with HR Director",
    dueDate: "2026-08-20", status: "on-track", createdAt: "2026-05-28",
  },
  {
    id: "sp-005", customerId: "cust-011", companyName: "ArcelorMittal Mining",
    goal: "Emergency re-activation: restore platform usage to prevent churn",
    milestones: [
      { id: "ms-005-1", title: "Root cause analysis — why did engagement drop?", dueDate: "2026-07-03", completed: false },
      { id: "ms-005-2", title: "Executive escalation call with CIO", dueDate: "2026-07-10", completed: false },
      { id: "ms-005-3", title: "Dedicated onsite success workshop", dueDate: "2026-08-01", completed: false },
    ],
    owner: "James Okafor",
    nextAction: "Escalate to VP Customer Success — account at risk of churning Q3",
    dueDate: "2026-08-01", status: "delayed", createdAt: "2026-06-20",
  },
];

// Helper maps for fast lookups in API routes
export const CUSTOMER_MAP: Map<string, CustomerAccount> = new Map(
  CUSTOMERS.map(c => [c.id, c]),
);
