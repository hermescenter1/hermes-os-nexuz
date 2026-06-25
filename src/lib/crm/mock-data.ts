// Phase 66 — CRM deterministic mock data
// Used when database mode is unavailable or for demo environments.

import type {
  CrmLead, CrmAccount, CrmAccountContact, CrmOpportunity,
  CrmDeal, CrmRenewalForecast, CrmExpansionOpportunity,
  CrmSuccessManager, CrmJourneyEvent,
} from "./types";
import { mockHealthForAccount } from "./health-engine";

const NOW = new Date("2026-06-25T12:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86400000).toISOString();
const from = (days: number) => new Date(NOW.getTime() + days * 86400000).toISOString();

export const CRM_ACCOUNTS: CrmAccount[] = [
  { id: "ca-01", organizationId: null, name: "Petrochemical Industries Co.", industry: "Oil & Gas", website: "https://pic.ir", phone: "+98 21 8800 1000", address: "Tehran, Iran", country: "IR", tier: "ENTERPRISE", status: "ACTIVE", annualRevenue: 4200000, employeeCount: 1200, ownerId: "admin", notes: null, deletedAt: null, createdAt: ago(180), updatedAt: ago(2) },
  { id: "ca-02", organizationId: null, name: "Mobarakeh Steel Complex", industry: "Manufacturing", website: "https://msc.ir", phone: "+98 31 5200 2000", address: "Isfahan, Iran", country: "IR", tier: "ENTERPRISE", status: "ACTIVE", annualRevenue: 6800000, employeeCount: 3500, ownerId: "admin", notes: null, deletedAt: null, createdAt: ago(210), updatedAt: ago(1) },
  { id: "ca-03", organizationId: null, name: "Farab Engineering Group", industry: "Engineering Services", website: "https://farab.ir", phone: "+98 21 7700 3000", address: "Tehran, Iran", country: "IR", tier: "PREMIUM", status: "ACTIVE", annualRevenue: 1500000, employeeCount: 450, ownerId: "admin", notes: null, deletedAt: null, createdAt: ago(120), updatedAt: ago(5) },
  { id: "ca-04", organizationId: null, name: "OIIC (Oil Industry Insurance)", industry: "Insurance", website: "https://oiic.ir", phone: "+98 21 6600 4000", address: "Tehran, Iran", country: "IR", tier: "PREMIUM", status: "ACTIVE", annualRevenue: 890000, employeeCount: 280, ownerId: "admin", notes: null, deletedAt: null, createdAt: ago(95), updatedAt: ago(3) },
  { id: "ca-05", organizationId: null, name: "Mapna Group", industry: "Energy", website: "https://mapna.com", phone: "+98 21 8800 5000", address: "Tehran, Iran", country: "IR", tier: "ENTERPRISE", status: "ACTIVE", annualRevenue: 5100000, employeeCount: 2800, ownerId: "admin", notes: null, deletedAt: null, createdAt: ago(300), updatedAt: ago(7) },
  { id: "ca-06", organizationId: null, name: "Saipa Auto Group", industry: "Automotive", website: "https://saipacorp.com", phone: "+98 21 4400 6000", address: "Karaj, Iran", country: "IR", tier: "STANDARD", status: "ACTIVE", annualRevenue: 340000, employeeCount: 1800, ownerId: "admin", notes: null, deletedAt: null, createdAt: ago(60), updatedAt: ago(10) },
  { id: "ca-07", organizationId: null, name: "Iran Khodro", industry: "Automotive", website: "https://ikco.ir", phone: "+98 21 7700 7000", address: "Tehran, Iran", country: "IR", tier: "ENTERPRISE", status: "ACTIVE", annualRevenue: 7200000, employeeCount: 15000, ownerId: "admin", notes: null, deletedAt: null, createdAt: ago(365), updatedAt: ago(1) },
  { id: "ca-08", organizationId: null, name: "Tehran Municipality", industry: "Government", website: "https://tehran.ir", phone: "+98 21 1180", address: "Tehran, Iran", country: "IR", tier: "PREMIUM", status: "WATCH", annualRevenue: 2200000, employeeCount: 95000, ownerId: "admin", notes: null, deletedAt: null, createdAt: ago(150), updatedAt: ago(4) },
  { id: "ca-09", organizationId: null, name: "Pasargad Bank", industry: "Financial Services", website: "https://bpi.ir", phone: "+98 21 9900 9000", address: "Tehran, Iran", country: "IR", tier: "PREMIUM", status: "ACTIVE", annualRevenue: 1800000, employeeCount: 3200, ownerId: "admin", notes: null, deletedAt: null, createdAt: ago(90), updatedAt: ago(2) },
  { id: "ca-10", organizationId: null, name: "Tejarat Zamin Smart City", industry: "Smart Cities", website: "https://tzsmarty.com", phone: "+98 21 5500 0001", address: "Tehran, Iran", country: "IR", tier: "STANDARD", status: "AT_RISK", annualRevenue: 120000, employeeCount: 45, ownerId: "admin", notes: null, deletedAt: null, createdAt: ago(45), updatedAt: ago(15) },
  { id: "ca-11", organizationId: null, name: "National Iranian Oil Company", industry: "Oil & Gas", website: "https://nioc.ir", phone: "+98 21 6100 0001", address: "Tehran, Iran", country: "IR", tier: "ENTERPRISE", status: "ACTIVE", annualRevenue: 12000000, employeeCount: 35000, ownerId: "admin", notes: null, deletedAt: null, createdAt: ago(400), updatedAt: ago(0) },
  { id: "ca-12", organizationId: null, name: "MCI (Mobile Telecom Co.)", industry: "Telecommunications", website: "https://mci.ir", phone: "+98 21 9100 2000", address: "Tehran, Iran", country: "IR", tier: "ENTERPRISE", status: "ACTIVE", annualRevenue: 9500000, employeeCount: 12000, ownerId: "admin", notes: null, deletedAt: null, createdAt: ago(270), updatedAt: ago(3) },
];

export const CRM_ACCOUNTS_WITH_HEALTH = CRM_ACCOUNTS.map(a => ({
  ...a,
  health: { id: `hs-${a.id}`, accountId: a.id, computedAt: ago(1), ...mockHealthForAccount(a.id) },
  openDeals: [2, 1, 3, 0, 2, 1, 0, 2, 1, 3, 1, 2][CRM_ACCOUNTS.indexOf(a)] ?? 0,
}));

export const CRM_LEADS: CrmLead[] = [
  { id: "lead-01", organizationId: null, firstName: "Dariush", lastName: "Mohammadi", email: "d.mohammadi@example.ir", phone: "+98 912 100 0001", company: "Arak Petrochemical", jobTitle: "CTO", status: "QUALIFIED", source: "LINKEDIN", score: 82, ownerId: "admin", notes: "High intent — attended webinar twice", convertedAt: null, convertedToId: null, deletedAt: null, createdAt: ago(30), updatedAt: ago(2) },
  { id: "lead-02", organizationId: null, firstName: "Nasrin", lastName: "Hosseini", email: "n.hosseini@example.ir", phone: "+98 912 100 0002", company: "Isfahan Steel", jobTitle: "IT Director", status: "PROPOSAL", source: "WEBSITE", score: 91, ownerId: "admin", notes: "Demo scheduled for next week", convertedAt: null, convertedToId: null, deletedAt: null, createdAt: ago(21), updatedAt: ago(1) },
  { id: "lead-03", organizationId: null, firstName: "Ali", lastName: "Rezaei", email: "a.rezaei@example.ir", phone: "+98 912 100 0003", company: "Chadormalu Mining", jobTitle: "Operations Manager", status: "CONTACTED", source: "REFERRAL", score: 65, ownerId: "admin", notes: null, convertedAt: null, convertedToId: null, deletedAt: null, createdAt: ago(15), updatedAt: ago(3) },
  { id: "lead-04", organizationId: null, firstName: "Maryam", lastName: "Karimi", email: "m.karimi@example.ir", phone: null, company: "Alborz Insurance", jobTitle: "Digital Transformation Lead", status: "NEW", source: "ACADEMY", score: 44, ownerId: "admin", notes: null, convertedAt: null, convertedToId: null, deletedAt: null, createdAt: ago(5), updatedAt: ago(5) },
  { id: "lead-05", organizationId: null, firstName: "Reza", lastName: "Ahmadi", email: "r.ahmadi@example.ir", phone: "+98 912 100 0005", company: "Bahman Motors", jobTitle: "Head of IT", status: "NEGOTIATION", source: "VENDOR", score: 95, ownerId: "admin", notes: "Close to deal — legal review pending", convertedAt: null, convertedToId: null, deletedAt: null, createdAt: ago(45), updatedAt: ago(1) },
  { id: "lead-06", organizationId: null, firstName: "Sara", lastName: "Mousavi", email: "s.mousavi@example.ir", phone: null, company: "Iran Air", jobTitle: "CIO", status: "CONVERTED", source: "ATS", score: 88, ownerId: "admin", notes: "Converted to account ca-09", convertedAt: ago(10), convertedToId: "ca-09", deletedAt: null, createdAt: ago(60), updatedAt: ago(10) },
  { id: "lead-07", organizationId: null, firstName: "Kaveh", lastName: "Tehrani", email: "k.tehrani@example.ir", phone: "+98 912 100 0007", company: "Ghadir Investment", jobTitle: "Director", status: "LOST", source: "WEBSITE", score: 38, ownerId: "admin", notes: "Lost to competitor", convertedAt: null, convertedToId: null, deletedAt: null, createdAt: ago(50), updatedAt: ago(20) },
  { id: "lead-08", organizationId: null, firstName: "Fatemeh", lastName: "Jafari", email: "f.jafari@example.ir", phone: null, company: "Bank Mellat", jobTitle: "VP Technology", status: "NEW", source: "LINKEDIN", score: 55, ownerId: "admin", notes: null, convertedAt: null, convertedToId: null, deletedAt: null, createdAt: ago(3), updatedAt: ago(3) },
  { id: "lead-09", organizationId: null, firstName: "Hossein", lastName: "Bagheri", email: "h.bagheri@example.ir", phone: "+98 912 100 0009", company: "Sadr Water Authority", jobTitle: "Infrastructure Head", status: "QUALIFIED", source: "MANUAL", score: 72, ownerId: "admin", notes: "Interested in predictive maintenance module", convertedAt: null, convertedToId: null, deletedAt: null, createdAt: ago(18), updatedAt: ago(4) },
  { id: "lead-10", organizationId: null, firstName: "Zahra", lastName: "Norouzi", email: "z.norouzi@example.ir", phone: null, company: "Parsian Gas", jobTitle: "Digitization Officer", status: "CONTACTED", source: "WEBSITE", score: 60, ownerId: "admin", notes: null, convertedAt: null, convertedToId: null, deletedAt: null, createdAt: ago(12), updatedAt: ago(6) },
  { id: "lead-11", organizationId: null, firstName: "Mohammad", lastName: "Sadeghi", email: "m.sadeghi@example.ir", phone: "+98 912 100 0011", company: "Kowsar Aerospace", jobTitle: "CTO", status: "PROPOSAL", source: "REFERRAL", score: 87, ownerId: "admin", notes: "Strategic account potential", convertedAt: null, convertedToId: null, deletedAt: null, createdAt: ago(25), updatedAt: ago(2) },
  { id: "lead-12", organizationId: null, firstName: "Elham", lastName: "Shams", email: "e.shams@example.ir", phone: null, company: "Tejarat Smart Grid", jobTitle: "Innovation Director", status: "NEW", source: "ACADEMY", score: 41, ownerId: "admin", notes: null, convertedAt: null, convertedToId: null, deletedAt: null, createdAt: ago(2), updatedAt: ago(2) },
];

export const CRM_OPPORTUNITIES: CrmOpportunity[] = [
  { id: "opp-01", accountId: "ca-01", leadId: null, title: "Predictive Maintenance Platform — PIC", stage: "NEGOTIATION", value: 480000, probability: 80, expectedCloseDate: from(15), ownerId: "admin", teamIds: [], notes: "Contract under legal review", wonAt: null, lostAt: null, lostReason: null, deletedAt: null, createdAt: ago(60), updatedAt: ago(1) },
  { id: "opp-02", accountId: "ca-02", leadId: null, title: "AI Quality Control — Mobarakeh Steel", stage: "PROPOSAL", value: 620000, probability: 60, expectedCloseDate: from(30), ownerId: "admin", teamIds: [], notes: null, wonAt: null, lostAt: null, lostReason: null, deletedAt: null, createdAt: ago(45), updatedAt: ago(3) },
  { id: "opp-03", accountId: "ca-05", leadId: null, title: "Energy Analytics Suite — Mapna", stage: "TECHNICAL_REVIEW", value: 390000, probability: 55, expectedCloseDate: from(45), ownerId: "admin", teamIds: [], notes: "Technical team evaluation in progress", wonAt: null, lostAt: null, lostReason: null, deletedAt: null, createdAt: ago(35), updatedAt: ago(5) },
  { id: "opp-04", accountId: "ca-07", leadId: null, title: "Factory Intelligence Platform — Iran Khodro", stage: "WON", value: 850000, probability: 100, expectedCloseDate: ago(5), ownerId: "admin", teamIds: [], notes: "Contract signed", wonAt: ago(5), lostAt: null, lostReason: null, deletedAt: null, createdAt: ago(90), updatedAt: ago(5) },
  { id: "opp-05", accountId: "ca-11", leadId: null, title: "SCADA Integration Layer — NIOC", stage: "DISCOVERY", value: 1200000, probability: 25, expectedCloseDate: from(90), ownerId: "admin", teamIds: [], notes: "Initial discovery meeting done", wonAt: null, lostAt: null, lostReason: null, deletedAt: null, createdAt: ago(10), updatedAt: ago(2) },
  { id: "opp-06", accountId: "ca-12", leadId: null, title: "Network Intelligence Suite — MCI", stage: "QUALIFICATION", value: 720000, probability: 40, expectedCloseDate: from(60), ownerId: "admin", teamIds: [], notes: null, wonAt: null, lostAt: null, lostReason: null, deletedAt: null, createdAt: ago(20), updatedAt: ago(4) },
  { id: "opp-07", accountId: "ca-03", leadId: "lead-05", title: "Engineering Workflow Automation — Farab", stage: "COMMERCIAL_REVIEW", value: 240000, probability: 70, expectedCloseDate: from(20), ownerId: "admin", teamIds: [], notes: "Good progress on commercial terms", wonAt: null, lostAt: null, lostReason: null, deletedAt: null, createdAt: ago(30), updatedAt: ago(2) },
  { id: "opp-08", accountId: null, leadId: "lead-02", title: "Isfahan Steel Digital Twin Pilot", stage: "PROPOSAL", value: 160000, probability: 65, expectedCloseDate: from(25), ownerId: "admin", teamIds: [], notes: null, wonAt: null, lostAt: null, lostReason: null, deletedAt: null, createdAt: ago(15), updatedAt: ago(1) },
  { id: "opp-09", accountId: "ca-04", leadId: null, title: "Insurance Claims Automation — OIIC", stage: "LOST", value: 180000, probability: 0, expectedCloseDate: ago(10), ownerId: "admin", teamIds: [], notes: null, wonAt: null, lostAt: ago(10), lostReason: "Budget freeze", deletedAt: null, createdAt: ago(50), updatedAt: ago(10) },
  { id: "opp-10", accountId: "ca-09", leadId: "lead-06", title: "Banking Intelligence Platform — Pasargad", stage: "NEGOTIATION", value: 530000, probability: 85, expectedCloseDate: from(10), ownerId: "admin", teamIds: [], notes: "Near close — final pricing discussion", wonAt: null, lostAt: null, lostReason: null, deletedAt: null, createdAt: ago(40), updatedAt: ago(1) },
];

export const CRM_DEALS: CrmDeal[] = [
  { id: "deal-01", accountId: "ca-07", opportunityId: "opp-04", title: "Iran Khodro — Factory Intelligence Platform", value: 850000, status: "WON", closedAt: ago(5), deletedAt: null, createdAt: ago(90), updatedAt: ago(5) },
  { id: "deal-02", accountId: "ca-01", opportunityId: "opp-01", title: "PIC — Predictive Maintenance Phase 1", value: 480000, status: "OPEN", closedAt: null, deletedAt: null, createdAt: ago(60), updatedAt: ago(1) },
  { id: "deal-03", accountId: "ca-02", opportunityId: "opp-02", title: "Mobarakeh Steel — AI Quality Control", value: 620000, status: "OPEN", closedAt: null, deletedAt: null, createdAt: ago(45), updatedAt: ago(3) },
  { id: "deal-04", accountId: "ca-04", opportunityId: "opp-09", title: "OIIC — Claims Automation (Lost)", value: 180000, status: "LOST", closedAt: ago(10), deletedAt: null, createdAt: ago(50), updatedAt: ago(10) },
  { id: "deal-05", accountId: "ca-09", opportunityId: "opp-10", title: "Pasargad Bank — Banking Intelligence", value: 530000, status: "OPEN", closedAt: null, deletedAt: null, createdAt: ago(40), updatedAt: ago(1) },
];

export const CRM_RENEWALS: CrmRenewalForecast[] = [
  { id: "ren-01", accountId: "ca-01", renewalDate: from(45), value: 420000, probability: 90, status: "CONFIRMED", notes: "Strong usage, high satisfaction", createdAt: ago(30), updatedAt: ago(2) },
  { id: "ren-02", accountId: "ca-02", renewalDate: from(60), value: 580000, probability: 85, status: "CONFIRMED", notes: null, createdAt: ago(25), updatedAt: ago(3) },
  { id: "ren-03", accountId: "ca-05", renewalDate: from(30), value: 310000, probability: 75, status: "PENDING", notes: "Renewal discussion started", createdAt: ago(15), updatedAt: ago(5) },
  { id: "ren-04", accountId: "ca-08", renewalDate: from(15), value: 180000, probability: 40, status: "AT_RISK", notes: "Low engagement — intervention needed", createdAt: ago(10), updatedAt: ago(1) },
  { id: "ren-05", accountId: "ca-10", renewalDate: from(10), value: 48000, probability: 20, status: "AT_RISK", notes: "Critical — account may churn", createdAt: ago(5), updatedAt: ago(1) },
  { id: "ren-06", accountId: "ca-07", renewalDate: from(90), value: 720000, probability: 95, status: "CONFIRMED", notes: null, createdAt: ago(20), updatedAt: ago(7) },
  { id: "ren-07", accountId: "ca-11", renewalDate: from(120), value: 1100000, probability: 88, status: "PENDING", notes: "Large renewal — executive sponsorship confirmed", createdAt: ago(10), updatedAt: ago(4) },
];

export const CRM_EXPANSIONS: CrmExpansionOpportunity[] = [
  { id: "exp-01", accountId: "ca-01", title: "Add Copilot Module", description: "Upsell AI Copilot to PIC operations team", value: 95000, status: "QUALIFIED", type: "UPSELL", dueDate: from(45), deletedAt: null, createdAt: ago(20), updatedAt: ago(3) },
  { id: "exp-02", accountId: "ca-07", title: "Multi-site License Expansion", description: "3 additional plants", value: 250000, status: "PROPOSED", type: "EXPANSION", dueDate: from(30), deletedAt: null, createdAt: ago(15), updatedAt: ago(2) },
  { id: "exp-03", accountId: "ca-02", title: "Academy Training Program", description: "Enterprise-wide Academy licensing", value: 120000, status: "IDENTIFIED", type: "CROSS_SELL", dueDate: from(60), deletedAt: null, createdAt: ago(10), updatedAt: ago(5) },
  { id: "exp-04", accountId: "ca-11", title: "Field Operations Module", description: "Mobile + offline-capable field ops", value: 380000, status: "IDENTIFIED", type: "UPSELL", dueDate: from(90), deletedAt: null, createdAt: ago(5), updatedAt: ago(3) },
  { id: "exp-05", accountId: "ca-09", title: "Risk Analytics Dashboard", description: "Banking risk module cross-sell", value: 140000, status: "QUALIFIED", type: "CROSS_SELL", dueDate: from(40), deletedAt: null, createdAt: ago(12), updatedAt: ago(4) },
];

export const CRM_MANAGERS: CrmSuccessManager[] = [
  { id: "mgr-01", userId: "csm-user-01", displayName: "Arash Karimi", email: "a.karimi@hermesnovin.com", accountIds: ["ca-01","ca-02","ca-05"], capacity: 20, isActive: true, createdAt: ago(365), updatedAt: ago(30) },
  { id: "mgr-02", userId: "csm-user-02", displayName: "Shirin Nazari", email: "s.nazari@hermesnovin.com", accountIds: ["ca-07","ca-11","ca-12"], capacity: 20, isActive: true, createdAt: ago(300), updatedAt: ago(15) },
  { id: "mgr-03", userId: "csm-user-03", displayName: "Omid Rostami", email: "o.rostami@hermesnovin.com", accountIds: ["ca-03","ca-04","ca-08","ca-09","ca-10"], capacity: 20, isActive: true, createdAt: ago(200), updatedAt: ago(10) },
];

export const CRM_JOURNEY_EVENTS: CrmJourneyEvent[] = [
  { id: "je-01", accountId: "ca-07", leadId: null, eventType: "LEAD_CREATED", description: "Iran Khodro lead created via LinkedIn", metadata: {}, occurredAt: ago(400) },
  { id: "je-02", accountId: "ca-07", leadId: null, eventType: "CUSTOMER_WON", description: "Deal closed: Factory Intelligence Platform", metadata: { value: 850000 }, occurredAt: ago(5) },
  { id: "je-03", accountId: "ca-07", leadId: null, eventType: "PORTAL_ACTIVATED", description: "Customer portal activated", metadata: {}, occurredAt: ago(4) },
  { id: "je-04", accountId: "ca-01", leadId: null, eventType: "RENEWAL_STARTED", description: "Annual renewal process initiated", metadata: {}, occurredAt: ago(30) },
  { id: "je-05", accountId: "ca-09", leadId: "lead-06", eventType: "LEAD_QUALIFIED", description: "Pasargad Bank lead qualified", metadata: {}, occurredAt: ago(55) },
  { id: "je-06", accountId: "ca-09", leadId: null, eventType: "DEMO_REQUESTED", description: "Banking Intelligence demo requested", metadata: {}, occurredAt: ago(48) },
  { id: "je-07", accountId: "ca-09", leadId: null, eventType: "PROPOSAL_SENT", description: "Commercial proposal sent", metadata: { proposalValue: 530000 }, occurredAt: ago(35) },
  { id: "je-08", accountId: "ca-02", leadId: null, eventType: "ACADEMY_ENROLLED", description: "3 engineers enrolled in AI Foundations", metadata: { courses: 3 }, occurredAt: ago(20) },
  { id: "je-09", accountId: "ca-08", leadId: null, eventType: "SUPPORT_TICKET_CREATED", description: "Critical support ticket opened", metadata: { ticketId: "t-mock-01" }, occurredAt: ago(8) },
  { id: "je-10", accountId: null, leadId: "lead-02", eventType: "LEAD_CREATED", description: "Isfahan Steel lead from website form", metadata: {}, occurredAt: ago(21) },
];
