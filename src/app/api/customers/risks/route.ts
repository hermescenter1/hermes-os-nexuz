import { NextResponse }  from "next/server";
import { CUSTOMERS }    from "@/lib/customers/mock-data";
import { daysSince }    from "@/lib/customers/health";
import type { CustomerRisk, RiskType, RiskSeverity } from "@/lib/customers/types";
import { RISK_TYPE_LABELS } from "@/lib/customers/types";

export async function GET() {
  const risks: CustomerRisk[] = [];

  CUSTOMERS.forEach(c => {
    const days = daysSince(c.lastActiveAt);

    // No recent activity risk
    if (days > 20) {
      risks.push({
        id: `risk-${c.id}-activity`,
        customerId: c.id, companyName: c.companyName,
        type: "no-activity",
        severity: days > 45 ? "high" : days > 30 ? "medium" : "low",
        description: `No login activity for ${days} days. Engagement risk.`,
        detectedAt: "2026-06-24",
        owner: c.csm, status: "open",
      });
    }

    // Low adoption risk
    if (c.healthScore.featureAdoption < 40) {
      risks.push({
        id: `risk-${c.id}-adoption`,
        customerId: c.id, companyName: c.companyName,
        type: "low-adoption",
        severity: c.healthScore.featureAdoption < 20 ? "high" : "medium",
        description: `Only ${Math.round(c.healthScore.featureAdoption / 20)}/5 platform features actively used.`,
        detectedAt: "2026-06-24",
        owner: c.csm, status: "open",
      });
    }

    // Churn risk
    if (c.healthScore.total < 40) {
      risks.push({
        id: `risk-${c.id}-churn`,
        customerId: c.id, companyName: c.companyName,
        type: "churn",
        severity: c.healthScore.total < 30 ? "high" : "medium",
        description: `Overall health score ${c.healthScore.total}/100 — below churn threshold.`,
        detectedAt: "2026-06-24",
        owner: c.csm, status: c.status === "at-risk" ? "in-progress" : "open",
      });
    }

    // Billing risk
    if (c.healthScore.billingRisk > 40) {
      risks.push({
        id: `risk-${c.id}-billing`,
        customerId: c.id, companyName: c.companyName,
        type: "payment-risk",
        severity: c.healthScore.billingRisk > 60 ? "high" : "medium",
        description: `Billing risk indicator elevated (${c.healthScore.billingRisk}). Plan: ${c.plan}.`,
        detectedAt: "2026-06-24",
        owner: c.csm, status: "open",
      });
    }

    // Support overload (high support risk)
    if (c.healthScore.supportRisk > 65) {
      risks.push({
        id: `risk-${c.id}-support`,
        customerId: c.id, companyName: c.companyName,
        type: "support-overload",
        severity: c.healthScore.supportRisk > 80 ? "high" : "medium",
        description: `Support risk ${c.healthScore.supportRisk}/100 — proactive outreach required.`,
        detectedAt: "2026-06-24",
        owner: c.csm, status: "open",
      });
    }
  });

  // Deduplicate (a customer shouldn't have same risk type twice)
  const seen = new Set<string>();
  const unique = risks.filter(r => {
    const key = `${r.customerId}-${r.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => {
    const sev = { high: 0, medium: 1, low: 2 };
    return sev[a.severity] - sev[b.severity];
  });

  const severityCount: Record<RiskSeverity, number> = { high: 0, medium: 0, low: 0 };
  unique.forEach(r => { severityCount[r.severity]++; });
  const bySeverity = (["high", "medium", "low"] as RiskSeverity[]).map(s => ({
    severity: s, count: severityCount[s],
  }));

  const typeCount: Record<string, number> = {};
  unique.forEach(r => { typeCount[r.type] = (typeCount[r.type] ?? 0) + 1; });
  const byType = (Object.keys(RISK_TYPE_LABELS) as RiskType[])
    .map(type => ({ type, label: RISK_TYPE_LABELS[type], count: typeCount[type] ?? 0 }))
    .filter(t => t.count > 0);

  const customersAtRisk = new Set(unique.filter(r => r.severity === "high").map(r => r.customerId)).size;

  return NextResponse.json({ risks: unique, total: unique.length, bySeverity, byType, customersAtRisk });
}
