export type CustomerPlan   = "starter" | "professional" | "enterprise" | "enterprise-plus";
export type CustomerStatus = "active" | "at-risk" | "churned" | "expansion-ready" | "onboarding";
export type HealthTier     = "excellent" | "good" | "fair" | "poor" | "critical";
export type RiskType       = "churn" | "low-adoption" | "support-overload" | "payment-risk" | "no-activity";
export type RiskSeverity   = "high" | "medium" | "low";
export type PlanStatus     = "on-track" | "at-risk" | "delayed" | "completed";
export type RiskStatus     = "open" | "in-progress" | "resolved";

export const PLAN_LABELS: Record<CustomerPlan, string> = {
  "starter":        "Starter",
  "professional":   "Professional",
  "enterprise":     "Enterprise",
  "enterprise-plus":"Enterprise+",
};

export const HEALTH_TIER_LABELS: Record<HealthTier, string> = {
  excellent: "Excellent",
  good:      "Good",
  fair:      "Fair",
  poor:      "Poor",
  critical:  "Critical",
};

export const RISK_TYPE_LABELS: Record<RiskType, string> = {
  churn:             "Churn Risk",
  "low-adoption":    "Low Adoption",
  "support-overload":"Support Overload",
  "payment-risk":    "Payment Risk",
  "no-activity":     "No Recent Activity",
};

export const STATUS_LABELS: Record<CustomerStatus, string> = {
  active:             "Active",
  "at-risk":          "At Risk",
  churned:            "Churned",
  "expansion-ready":  "Expansion Ready",
  onboarding:         "Onboarding",
};

export const PLAN_SORT: Record<CustomerPlan, number> = {
  "enterprise-plus": 0, enterprise: 1, professional: 2, starter: 3,
};

export interface CustomerUsage {
  copilotQueries:            number;
  knowledgeGraphViews:       number;
  industrialDashboardLogins: number;
  atsApplicationsProcessed:  number;
  knowledgeArticlesRead:     number;
  alertsHandled:             number;
  casesOpened:               number;
}

export interface CustomerHealth {
  total:              number;
  loginActivity:      number;
  featureAdoption:    number;
  assetScore:         number;
  knowledgeScore:     number;
  alertHandling:      number;
  supportRisk:        number;      // 0-100, LOWER is better
  billingRisk:        number;      // 0-100, LOWER is better
  expansionPotential: number;      // 0-100, HIGHER = more opportunity
  tier:               HealthTier;
  explanations:       string[];
}

export interface CustomerAccount {
  id:           string;
  companyName:  string;
  industry:     string;
  country:      string;
  plan:         CustomerPlan;
  status:       CustomerStatus;
  sites:        number;
  assets:       number;
  arr:          number;
  currency:     string;
  csm:          string;
  joinedAt:     string;
  lastActiveAt: string;
  healthScore:  CustomerHealth;
  usage:        CustomerUsage;
}

export interface CustomerRisk {
  id:          string;
  customerId:  string;
  companyName: string;
  type:        RiskType;
  severity:    RiskSeverity;
  description: string;
  detectedAt:  string;
  owner:       string;
  status:      RiskStatus;
}

export interface Milestone {
  id:        string;
  title:     string;
  dueDate:   string;
  completed: boolean;
}

export interface SuccessPlan {
  id:          string;
  customerId:  string;
  companyName: string;
  goal:        string;
  milestones:  Milestone[];
  owner:       string;
  nextAction:  string;
  dueDate:     string;
  status:      PlanStatus;
  createdAt:   string;
}
