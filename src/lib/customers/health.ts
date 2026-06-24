import type { CustomerPlan, CustomerHealth, HealthTier, CustomerUsage } from "./types";

const TODAY = new Date("2026-06-24");

export function daysSince(dateStr: string): number {
  return Math.max(0, Math.floor((TODAY.getTime() - new Date(dateStr).getTime()) / 86400000));
}

export function computeTier(score: number): HealthTier {
  if (score >= 80) return "excellent";
  if (score >= 65) return "good";
  if (score >= 50) return "fair";
  if (score >= 30) return "poor";
  return "critical";
}

const PLAN_ASSET_BASELINE: Record<CustomerPlan, number> = {
  "starter":         15,
  "professional":    60,
  "enterprise":     250,
  "enterprise-plus": 600,
};

const PLAN_BILLING_RISK: Record<CustomerPlan, number> = {
  "starter":          30,
  "professional":     18,
  "enterprise":       10,
  "enterprise-plus":   5,
};

export interface HealthInput {
  plan:         CustomerPlan;
  lastActiveAt: string;
  assets:       number;
  usage:        CustomerUsage;
}

export function computeHealth(input: HealthInput): CustomerHealth {
  const explanations: string[] = [];
  const days = daysSince(input.lastActiveAt);

  // 1. Login activity (20%)
  const loginActivity =
    days <= 7  ? 100 :
    days <= 14 ? 85 :
    days <= 30 ? 65 :
    days <= 60 ? 35 : 10;
  if (days <= 7)  explanations.push(`Active within last week (${days}d ago)`);
  else if (days <= 30) explanations.push(`Last active ${days} days ago`);
  else           explanations.push(`Inactive ${days} days — engagement risk`);

  // 2. Feature adoption (25%) — 5 trackable features
  const featuresActive = [
    input.usage.copilotQueries            > 10,
    input.usage.knowledgeGraphViews       > 10,
    input.usage.industrialDashboardLogins > 20,
    input.usage.atsApplicationsProcessed  > 0,
    input.usage.knowledgeArticlesRead     > 5,
  ].filter(Boolean).length;
  const featureAdoption = Math.min(100, featuresActive * 20);
  explanations.push(`${featuresActive}/5 platform features actively used`);
  if (featuresActive < 3) explanations.push("Feature adoption below target — coaching recommended");

  // 3. Asset score (10%)
  const baseline  = PLAN_ASSET_BASELINE[input.plan];
  const assetScore = Math.min(100, Math.round((input.assets / baseline) * 100));
  if (assetScore >= 80) explanations.push(`Asset utilization strong: ${input.assets} assets (${assetScore}% of plan baseline)`);
  else                  explanations.push(`Asset coverage: ${assetScore}% of ${input.plan} plan baseline`);

  // 4. Knowledge score (15%)
  const knowledgeScore = Math.min(100,
    input.usage.knowledgeArticlesRead * 3 + input.usage.casesOpened * 8,
  );
  if (knowledgeScore >= 60) explanations.push(`Strong knowledge engagement: ${input.usage.knowledgeArticlesRead} articles, ${input.usage.casesOpened} cases`);
  else                      explanations.push(`Knowledge usage low: ${input.usage.knowledgeArticlesRead} articles read`);

  // 5. Alert handling (10%)
  const alertHandling = Math.min(100, input.usage.alertsHandled * 2);

  // 6. Support risk (10%) — lower = better, derived from engagement indicators
  const supportRisk = Math.max(0, Math.min(100, Math.round(
    100 - loginActivity * 0.50 - featureAdoption * 0.30 - alertHandling * 0.20,
  )));
  if (supportRisk >= 60) explanations.push("High support risk: low engagement across multiple indicators");

  // 7. Billing risk (5%) — lower = better, driven by plan tier + login activity
  const billingRisk = Math.min(100,
    PLAN_BILLING_RISK[input.plan] + (loginActivity < 20 ? 25 : 0),
  );

  // 8. Expansion potential (5%)
  const assetGrowthRoom   = Math.max(0, 100 - assetScore);
  const featureGrowthRoom = Math.max(0, 100 - featureAdoption);
  const expansionPotential = featureAdoption >= 60
    ? Math.min(100, Math.round((assetGrowthRoom + featureGrowthRoom) * 0.50))
    : Math.min(30,  Math.round((assetGrowthRoom + featureGrowthRoom) * 0.20));
  if (expansionPotential >= 60) explanations.push("High expansion potential: room for growth in assets and features");

  const total = Math.min(100, Math.max(0, Math.round(
    loginActivity      * 0.20 +
    featureAdoption    * 0.25 +
    assetScore         * 0.10 +
    knowledgeScore     * 0.15 +
    alertHandling      * 0.10 +
    (100 - supportRisk)* 0.10 +
    (100 - billingRisk)* 0.05 +
    expansionPotential * 0.05,
  )));

  const tier = computeTier(total);
  const tierMsg: Record<HealthTier, string> = {
    excellent: "Excellent health — model customer, review expansion",
    good:      "Good health — maintain cadence, identify upsell",
    fair:      "Fair health — coaching and re-engagement needed",
    poor:      "Poor health — at-risk, escalate to CSM",
    critical:  "Critical — immediate intervention required",
  };
  explanations.push(`Health tier: ${tierMsg[tier]}`);

  return {
    total, loginActivity, featureAdoption, assetScore, knowledgeScore,
    alertHandling, supportRisk, billingRisk, expansionPotential,
    tier, explanations,
  };
}
