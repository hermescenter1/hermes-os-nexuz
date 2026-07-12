import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function AutomationSettingsPage() {
  const t = await getTranslations("automationOperations");
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="font-semibold">{t("settings.general")}</h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between py-2 border-b">
            <div>
              <div className="font-medium">{t("settings.engineMode")}</div>
              <div className="text-muted-foreground text-xs">{t("settings.engineModeDesc")}</div>
            </div>
            <span className="px-2 py-0.5 rounded bg-green-500/15 text-green-700 dark:text-green-400 text-xs font-medium">{t("settings.deterministic")}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <div>
              <div className="font-medium">{t("settings.auditTrail")}</div>
              <div className="text-muted-foreground text-xs">{t("settings.auditTrailDesc")}</div>
            </div>
            <span className="px-2 py-0.5 rounded bg-green-500/15 text-green-700 dark:text-green-400 text-xs font-medium">{t("settings.enabled")}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <div>
              <div className="font-medium">{t("settings.rbacProtection")}</div>
              <div className="text-muted-foreground text-xs">{t("settings.rbacProtectionDesc")}</div>
            </div>
            <span className="px-2 py-0.5 rounded bg-green-500/15 text-green-700 dark:text-green-400 text-xs font-medium">{t("settings.enforced")}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="font-medium">{t("settings.simulationMode")}</div>
              <div className="text-muted-foreground text-xs">{t("settings.simulationModeDesc")}</div>
            </div>
            <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-400 text-xs font-medium">{t("settings.available")}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="font-semibold">{t("settings.about")}</h2>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>{t("settings.aboutEngine")}</p>
          <p>{t("settings.aboutStats")}</p>
          <p>{t("settings.aboutWhitelist")}</p>
        </div>
      </div>
    </div>
  );
}
