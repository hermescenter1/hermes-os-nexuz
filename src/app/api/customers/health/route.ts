import { NextResponse } from "next/server";
import { CUSTOMERS }   from "@/lib/customers/mock-data";
import type { HealthTier } from "@/lib/customers/types";

export async function GET() {
  const accounts = CUSTOMERS.map(c => ({
    id:     c.id,
    name:   c.companyName,
    plan:   c.plan,
    status: c.status,
    csm:    c.csm,
    health: c.healthScore,
  })).sort((a, b) => b.health.total - a.health.total);

  const n = accounts.length;
  const avg = (key: keyof typeof accounts[0]["health"]) =>
    Math.round(accounts.reduce((s, a) => s + (a.health[key] as number), 0) / n);

  const averageScores = {
    total:              avg("total"),
    loginActivity:      avg("loginActivity"),
    featureAdoption:    avg("featureAdoption"),
    assetScore:         avg("assetScore"),
    knowledgeScore:     avg("knowledgeScore"),
    alertHandling:      avg("alertHandling"),
    supportRisk:        avg("supportRisk"),
    billingRisk:        avg("billingRisk"),
    expansionPotential: avg("expansionPotential"),
  };

  const TIER_ORDER: HealthTier[] = ["excellent", "good", "fair", "poor", "critical"];
  const tierMap: Record<string, number> = {};
  accounts.forEach(a => { tierMap[a.health.tier] = (tierMap[a.health.tier] ?? 0) + 1; });
  const byTier = TIER_ORDER.map(tier => ({
    tier, label: tier.charAt(0).toUpperCase() + tier.slice(1),
    count: tierMap[tier] ?? 0,
  }));

  return NextResponse.json({ accounts, averageScores, byTier });
}
