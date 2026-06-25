// Phase 66 — CRM & Customer Success Intelligence types

export type CrmLeadStatus =
  | "NEW" | "CONTACTED" | "QUALIFIED" | "PROPOSAL"
  | "NEGOTIATION" | "CONVERTED" | "LOST";

export type CrmLeadSource =
  | "WEBSITE" | "LINKEDIN" | "REFERRAL" | "VENDOR"
  | "ACADEMY" | "ATS" | "MANUAL";

export type CrmOpportunityStage =
  | "DISCOVERY" | "QUALIFICATION" | "PROPOSAL" | "TECHNICAL_REVIEW"
  | "COMMERCIAL_REVIEW" | "NEGOTIATION" | "WON" | "LOST";

export type CrmHealthCategory = "HEALTHY" | "WATCH" | "AT_RISK" | "CRITICAL";

export type CrmJourneyEventType =
  | "LEAD_CREATED" | "LEAD_QUALIFIED" | "DEMO_REQUESTED" | "PROPOSAL_SENT"
  | "CUSTOMER_WON" | "PORTAL_ACTIVATED" | "ACADEMY_ENROLLED"
  | "SUPPORT_TICKET_CREATED" | "RENEWAL_STARTED" | "RENEWAL_COMPLETED";

export interface CrmLead {
  id:             string;
  organizationId: string | null;
  firstName:      string;
  lastName:       string;
  email:          string;
  phone:          string | null;
  company:        string | null;
  jobTitle:       string | null;
  status:         CrmLeadStatus;
  source:         CrmLeadSource;
  score:          number;
  ownerId:        string | null;
  notes:          string | null;
  convertedAt:    string | null;
  convertedToId:  string | null;
  deletedAt:      string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface CrmLeadActivity {
  id:        string;
  leadId:    string;
  userId:    string | null;
  type:      string;
  summary:   string;
  metadata:  Record<string, unknown>;
  createdAt: string;
}

export interface CrmLeadNote {
  id:        string;
  leadId:    string;
  authorId:  string | null;
  body:      string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmAccount {
  id:             string;
  organizationId: string | null;
  name:           string;
  industry:       string | null;
  website:        string | null;
  phone:          string | null;
  address:        string | null;
  country:        string | null;
  tier:           string;
  status:         string;
  annualRevenue:  number | null;
  employeeCount:  number | null;
  ownerId:        string | null;
  notes:          string | null;
  deletedAt:      string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface CrmAccountContact {
  id:        string;
  accountId: string;
  firstName: string;
  lastName:  string;
  email:     string;
  phone:     string | null;
  jobTitle:  string | null;
  isPrimary: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrmOpportunity {
  id:                string;
  accountId:         string | null;
  leadId:            string | null;
  title:             string;
  stage:             CrmOpportunityStage;
  value:             number;
  probability:       number;
  expectedCloseDate: string | null;
  ownerId:           string | null;
  teamIds:           string[];
  notes:             string | null;
  wonAt:             string | null;
  lostAt:            string | null;
  lostReason:        string | null;
  deletedAt:         string | null;
  createdAt:         string;
  updatedAt:         string;
}

export interface CrmOpportunityActivity {
  id:            string;
  opportunityId: string;
  userId:        string | null;
  type:          string;
  summary:       string;
  metadata:      Record<string, unknown>;
  createdAt:     string;
}

export interface CrmDeal {
  id:            string;
  accountId:     string | null;
  opportunityId: string | null;
  title:         string;
  value:         number;
  status:        string;
  closedAt:      string | null;
  deletedAt:     string | null;
  createdAt:     string;
  updatedAt:     string;
}

export interface CrmDealNote {
  id:        string;
  dealId:    string;
  authorId:  string | null;
  body:      string;
  createdAt: string;
}

export interface CrmHealthScore {
  id:            string;
  accountId:     string;
  score:         number;
  category:      CrmHealthCategory;
  loginScore:    number;
  projectScore:  number;
  ticketScore:   number;
  academyScore:  number;
  billingScore:  number;
  adoptionScore: number;
  metadata:      Record<string, unknown>;
  computedAt:    string;
}

export interface CrmJourneyEvent {
  id:          string;
  accountId:   string | null;
  leadId:      string | null;
  eventType:   CrmJourneyEventType;
  description: string | null;
  metadata:    Record<string, unknown>;
  occurredAt:  string;
}

export interface CrmSuccessManager {
  id:          string;
  userId:      string;
  displayName: string;
  email:       string;
  accountIds:  string[];
  capacity:    number;
  isActive:    boolean;
  createdAt:   string;
  updatedAt:   string;
}

export interface CrmRenewalForecast {
  id:          string;
  accountId:   string;
  renewalDate: string;
  value:       number;
  probability: number;
  status:      string;
  notes:       string | null;
  createdAt:   string;
  updatedAt:   string;
}

export interface CrmExpansionOpportunity {
  id:          string;
  accountId:   string;
  title:       string;
  description: string | null;
  value:       number;
  status:      string;
  type:        string;
  dueDate:     string | null;
  deletedAt:   string | null;
  createdAt:   string;
  updatedAt:   string;
}

// ── Composite view types ──────────────────────────────────────────────────────

export interface CrmDashboardStats {
  totalLeads:           number;
  newLeadsThisMonth:    number;
  pipelineValue:        number;
  activeOpportunities:  number;
  conversionRate:       number;
  forecastRevenue:      number;
  renewalsThisQuarter:  number;
  healthyAccounts:      number;
  atRiskAccounts:       number;
  churnRisk:            number;
}

export interface CrmPipelineStage {
  stage:       CrmOpportunityStage;
  label:       string;
  count:       number;
  value:       number;
  probability: number;
}

export interface CrmAccountWithHealth extends CrmAccount {
  health:     CrmHealthScore | null;
  openDeals:  number;
  openTickets?: number;
}

export interface CrmLeadWithActivity extends Omit<CrmLead, "activities" | "notes"> {
  activities: CrmLeadActivity[];
  notes:      CrmLeadNote[];
}

export interface CrmOpportunityWithAccount extends CrmOpportunity {
  account: CrmAccount | null;
  activities: CrmOpportunityActivity[];
}

export interface CrmCustomerSuccessOverview {
  accounts:        CrmAccountWithHealth[];
  renewals:        CrmRenewalForecast[];
  expansions:      CrmExpansionOpportunity[];
  managers:        CrmSuccessManager[];
  healthSummary: {
    healthy:  number;
    watch:    number;
    atRisk:   number;
    critical: number;
  };
}
