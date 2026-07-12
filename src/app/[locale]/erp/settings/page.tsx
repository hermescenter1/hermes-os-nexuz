import Link                 from "next/link";
import { getTranslations }  from "next-intl/server";
import { noIndexMetadata }  from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("ERP Settings");

const MODULE_KEYS = ["projects", "tasks", "teams", "resources", "inventory", "workOrders", "approvals", "kpis"];

export default async function ErpSettingsPage() {
  const t = await getTranslations("enterpriseOperations");
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">{t("settings.pageTitle")}</h1>
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div>
          <h3 className="font-semibold mb-1">{t("settings.moduleStatus")}</h3>
          <p className="text-sm text-muted-foreground">{t("settings.moduleStatusDesc")}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {MODULE_KEYS.map(m => (
            <div key={m} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
              <span>{t(`nav.items.${m}`)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold mb-2">{t("settings.workflowIntegration")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("settings.workflowIntegrationDesc")}{" "}
          <Link href="/en/automation" className="text-primary hover:underline">/automation</Link>.
        </p>
      </div>
    </div>
  );
}
