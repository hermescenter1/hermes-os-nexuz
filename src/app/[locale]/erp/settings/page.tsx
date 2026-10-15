import { Link }             from "@/i18n/navigation";
import { getTranslations }  from "next-intl/server";
import { noIndexMetadata }  from "@/lib/seo/metadata";
import { getErpDatabaseStatus } from "@/lib/erp/db";

export const metadata = noIndexMetadata("ERP Settings");
export const dynamic  = "force-dynamic";

// Every ERP module reads and writes only its own organization's rows (HRIS-0.5,
// HRIS-0.5B). A module is listed here only when its data path is tenant scoped.
const SCOPED_MODULES = ["teams", "resources", "projects", "tasks", "inventory", "workOrders", "approvals", "kpis"] as const;

export default async function ErpSettingsPage() {
  const t = await getTranslations("enterpriseOperations");
  // Reports only a reachable/unreachable flag. Never a driver message or host.
  const database = await getErpDatabaseStatus();
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">{t("settings.pageTitle")}</h1>
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div>
          <h3 className="font-semibold mb-1">{t("moduleAccess.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("moduleAccess.description")}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className={`w-2 h-2 rounded-full shrink-0 ${database === "available" ? "bg-green-400" : "bg-red-400"}`} />
          <span>
            {t("moduleAccess.database")}: {database === "available" ? t("moduleAccess.databaseAvailable") : t("moduleAccess.databaseUnavailable")}
          </span>
        </div>
        <ul className="grid grid-cols-1 gap-2 text-sm">
          {SCOPED_MODULES.map(m => (
            <li key={m} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
              <span>{t(`nav.items.${m}`)}</span>
              <span className="text-muted-foreground">{t("moduleAccess.scoped")}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold mb-2">{t("settings.workflowIntegration")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("settings.workflowIntegrationDesc")}{" "}
          <Link href="/automation" className="text-primary hover:underline">/automation</Link>.
        </p>
      </div>
    </div>
  );
}
