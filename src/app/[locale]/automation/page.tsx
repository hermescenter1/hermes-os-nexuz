import { getTranslations }            from "next-intl/server";
import { AutomationDashboardClient } from "@/components/automation/AutomationDashboardClient";
import { getAutomationOverview }     from "@/lib/automation/db";

export const dynamic = "force-dynamic";

export default async function AutomationPage() {
  const t        = await getTranslations("automationOperations");
  const overview = await getAutomationOverview();
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t("pages.dashboardTitle")}</h1>
      <AutomationDashboardClient overview={overview} />
    </div>
  );
}
