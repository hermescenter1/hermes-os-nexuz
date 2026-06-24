import { NextResponse } from "next/server";
import { CUSTOMERS }   from "@/lib/customers/mock-data";

export async function GET() {
  const totals = {
    copilotQueries:            CUSTOMERS.reduce((s, c) => s + c.usage.copilotQueries,            0),
    knowledgeGraphViews:       CUSTOMERS.reduce((s, c) => s + c.usage.knowledgeGraphViews,       0),
    industrialDashboardLogins: CUSTOMERS.reduce((s, c) => s + c.usage.industrialDashboardLogins, 0),
    atsApplicationsProcessed:  CUSTOMERS.reduce((s, c) => s + c.usage.atsApplicationsProcessed,  0),
    knowledgeArticlesRead:     CUSTOMERS.reduce((s, c) => s + c.usage.knowledgeArticlesRead,     0),
    alertsHandled:             CUSTOMERS.reduce((s, c) => s + c.usage.alertsHandled,             0),
  };

  const n = CUSTOMERS.length;
  const featureAdoption = [
    { feature: "copilot",    label: "Hermes Copilot",       customersUsing: CUSTOMERS.filter(c => c.usage.copilotQueries > 10).length,            totalCustomers: n },
    { feature: "knowledge",  label: "Knowledge Graph",       customersUsing: CUSTOMERS.filter(c => c.usage.knowledgeGraphViews > 10).length,       totalCustomers: n },
    { feature: "industrial", label: "Industrial Dashboard",  customersUsing: CUSTOMERS.filter(c => c.usage.industrialDashboardLogins > 20).length, totalCustomers: n },
    { feature: "ats",        label: "ATS Recruitment",       customersUsing: CUSTOMERS.filter(c => c.usage.atsApplicationsProcessed > 0).length,   totalCustomers: n },
    { feature: "knowledge2", label: "Knowledge Articles",    customersUsing: CUSTOMERS.filter(c => c.usage.knowledgeArticlesRead > 5).length,       totalCustomers: n },
  ].map(f => ({ ...f, pct: Math.round((f.customersUsing / n) * 100) }));

  const topByFeature = {
    copilot: CUSTOMERS
      .sort((a, b) => b.usage.copilotQueries - a.usage.copilotQueries)
      .slice(0, 5)
      .map(c => ({ id: c.id, name: c.companyName, count: c.usage.copilotQueries })),
    knowledge: CUSTOMERS
      .sort((a, b) => b.usage.knowledgeGraphViews - a.usage.knowledgeGraphViews)
      .slice(0, 5)
      .map(c => ({ id: c.id, name: c.companyName, count: c.usage.knowledgeGraphViews })),
    industrial: CUSTOMERS
      .sort((a, b) => b.usage.industrialDashboardLogins - a.usage.industrialDashboardLogins)
      .slice(0, 5)
      .map(c => ({ id: c.id, name: c.companyName, count: c.usage.industrialDashboardLogins })),
    ats: CUSTOMERS
      .sort((a, b) => b.usage.atsApplicationsProcessed - a.usage.atsApplicationsProcessed)
      .slice(0, 5)
      .map(c => ({ id: c.id, name: c.companyName, count: c.usage.atsApplicationsProcessed })),
  };

  const perCustomer = [...CUSTOMERS]
    .sort((a, b) => (
      b.usage.copilotQueries + b.usage.knowledgeGraphViews + b.usage.industrialDashboardLogins
    ) - (
      a.usage.copilotQueries + a.usage.knowledgeGraphViews + a.usage.industrialDashboardLogins
    ))
    .map(c => ({
      id:         c.id,
      name:       c.companyName,
      plan:       c.plan,
      copilot:    c.usage.copilotQueries,
      knowledge:  c.usage.knowledgeGraphViews,
      industrial: c.usage.industrialDashboardLogins,
      ats:        c.usage.atsApplicationsProcessed,
      alerts:     c.usage.alertsHandled,
    }));

  return NextResponse.json({ totals, featureAdoption, topByFeature, perCustomer });
}
