import { NextResponse }   from "next/server";
import { CUSTOMERS }     from "@/lib/customers/mock-data";
import type { CustomerPlan, HealthTier, CustomerStatus } from "@/lib/customers/types";
import { PLAN_LABELS }   from "@/lib/customers/types";

export async function GET() {
  const total          = CUSTOMERS.length;
  const active         = CUSTOMERS.filter(c => c.status === "active").length;
  const atRisk         = CUSTOMERS.filter(c => c.status === "at-risk").length;
  const expansionReady = CUSTOMERS.filter(c => c.status === "expansion-ready").length;
  const onboarding     = CUSTOMERS.filter(c => c.status === "onboarding").length;
  const churned        = CUSTOMERS.filter(c => c.status === "churned").length;
  const averageHealth  = Math.round(CUSTOMERS.reduce((s, c) => s + c.healthScore.total, 0) / total);
  const totalArr       = CUSTOMERS.reduce((s, c) => s + c.arr, 0);

  const planMap: Record<string, { count: number; arr: number }> = {};
  CUSTOMERS.forEach(c => {
    if (!planMap[c.plan]) planMap[c.plan] = { count: 0, arr: 0 };
    planMap[c.plan].count++;
    planMap[c.plan].arr += c.arr;
  });
  const byPlan = (["enterprise-plus", "enterprise", "professional", "starter"] as CustomerPlan[]).map(plan => ({
    plan, label: PLAN_LABELS[plan],
    count: planMap[plan]?.count ?? 0,
    arr:   planMap[plan]?.arr   ?? 0,
  }));

  const industryMap: Record<string, number> = {};
  CUSTOMERS.forEach(c => { industryMap[c.industry] = (industryMap[c.industry] ?? 0) + 1; });
  const byIndustry = Object.entries(industryMap)
    .sort(([, a], [, b]) => b - a)
    .map(([industry, count]) => ({ industry, count }));

  const tierMap: Record<string, number> = {};
  CUSTOMERS.forEach(c => { tierMap[c.healthScore.tier] = (tierMap[c.healthScore.tier] ?? 0) + 1; });
  const TIER_ORDER: HealthTier[] = ["excellent", "good", "fair", "poor", "critical"];
  const byHealth = TIER_ORDER.map(tier => ({ tier, count: tierMap[tier] ?? 0 }));

  const sorted = [...CUSTOMERS].sort((a, b) => b.healthScore.total - a.healthScore.total);
  const topHealthAccounts = sorted.slice(0, 5).map(c => ({
    id: c.id, name: c.companyName, score: c.healthScore.total, tier: c.healthScore.tier,
  }));
  const bottomHealthAccounts = sorted.slice(-5).reverse().map(c => ({
    id: c.id, name: c.companyName, score: c.healthScore.total, tier: c.healthScore.tier,
  }));

  const statusCounts: Record<CustomerStatus, number> = {
    active: 0, "at-risk": 0, churned: 0, "expansion-ready": 0, onboarding: 0,
  };
  CUSTOMERS.forEach(c => { statusCounts[c.status]++; });

  return NextResponse.json({
    total, active, atRisk, expansionReady, onboarding, churned,
    averageHealth, totalArr, byPlan, byIndustry, byHealth,
    topHealthAccounts, bottomHealthAccounts, statusCounts,
  });
}
