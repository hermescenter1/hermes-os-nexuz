/**
 * /{locale}/dashboard/executive/settings — the active organization's reporting
 * settings: time zone, business-day cutoff and priority thresholds.
 *
 * Every executive reader may SEE the settings in force and where they came
 * from, because they explain the boundaries of every figure on the other
 * pages. Only an `update_org` holder (OWNER, ADMIN) gets the form; the API
 * enforces the same rule independently, so hiding the form is a convenience,
 * not the control.
 */
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader, PageStatusBadge } from "@/components/ui/PageHeader";
import { AppShell } from "@/components/app-shell";
import { noIndexMetadata } from "@/lib/seo/metadata";
import { canUpdateExecutiveSettings } from "@/lib/executive/settings-auth";
import { formatDateTime, formatNumber } from "@/lib/i18n/format";
import { resolveExecutiveScope } from "@/lib/executive/scope";
import { loadExecutiveSettings } from "@/lib/executive/settings";
import { ExecutiveScopeNotice } from "@/components/executive/ExecutiveScopeNotice";
import { Panel } from "@/components/executive/ExecutiveSummaryView";
import { ExecutiveSettingsForm } from "@/components/executive/ExecutiveSettingsForm";

export const metadata = noIndexMetadata("Executive settings");
export const dynamic = "force-dynamic";

const PROBLEM_CODES = ["UNKNOWN_TIME_ZONE", "NOT_A_STRING", "NOT_AN_INTEGER", "OUT_OF_RANGE", "NOT_AFTER_STALE"] as const;

/** Every IANA zone the runtime knows, with the current value guaranteed present. */
function zoneList(current: string): string[] {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return zones.includes(current) ? zones : [current, ...zones];
}

export default async function ExecutiveSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("executive");

  const resolved = await resolveExecutiveScope();

  let body: React.ReactNode;
  if (!resolved.ok) {
    body = <ExecutiveScopeNotice code={resolved.code} memberships={resolved.memberships} />;
  } else {
    const settings = await loadExecutiveSettings(resolved.scope.organizationId);
    const canEdit = canUpdateExecutiveSettings(resolved.scope.role);
    const v = settings.values;
    // Digits through the locale: a padded String() printed Latin "06:00" in
    // the Persian view.
    const twoDigits = (n: number) => formatNumber(n, locale, { minimumIntegerDigits: 2, useGrouping: false });
    const hhmm = `${twoDigits(Math.floor(v.dayCutoffMinutes / 60))}:${twoDigits(v.dayCutoffMinutes % 60)}`;

    body = (
      <div className="space-y-6">
        <Panel
          title={t("settings.currentTitle")}
          badge={
            <PageStatusBadge
              label={settings.source === "ORGANIZATION" ? t("settings.sourceOrganization") : t("settings.sourceDefault")}
              variant={settings.source === "ORGANIZATION" ? "live" : "neutral"}
            />
          }
        >
          {settings.storedRowRejected && (
            <p role="alert" className="mb-3 rounded-lg border border-status-warning-border bg-status-warning-subtle px-4 py-2 text-xs text-warn">
              {t("settings.storedRejected")}
            </p>
          )}
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                [t("settings.field.timeZone"), v.timeZone],
                [t("settings.field.dayCutoff"), hhmm],
                [t("settings.field.approvalStaleDays"), formatNumber(v.priority.approvalStaleDays, locale)],
                [t("settings.field.approvalCriticalDays"), formatNumber(v.priority.approvalCriticalDays, locale)],
                [t("settings.field.alertAgeHours"), formatNumber(v.priority.alertAgeHours, locale)],
                [t("settings.field.maxItems"), formatNumber(v.priority.maxItems, locale)],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-line bg-surface-glass p-3">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="mt-1 tabular-nums text-text-primary" dir="ltr">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          {settings.updatedAtIso && (
            <p className="mt-3 text-xs text-muted">
              {t("settings.lastChanged", {
                when: formatDateTime(settings.updatedAtIso, locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: v.timeZone,
                }),
              })}
            </p>
          )}
          <p className="mt-3 text-xs text-muted">{t("settings.effectNote")}</p>
        </Panel>

        <Panel title={t("settings.editTitle")}>
          {canEdit ? (
            <ExecutiveSettingsForm
              version={settings.version}
              timeZones={zoneList(v.timeZone)}
              initial={{
                timeZone: v.timeZone,
                dayCutoffMinutes: v.dayCutoffMinutes,
                approvalStaleDays: v.priority.approvalStaleDays,
                approvalCriticalDays: v.priority.approvalCriticalDays,
                alertAgeHours: v.priority.alertAgeHours,
                maxItems: v.priority.maxItems,
              }}
              labels={{
                timeZone: t("settings.field.timeZone"),
                timeZoneHelp: t("settings.help.timeZone"),
                dayCutoff: t("settings.field.dayCutoff"),
                dayCutoffHelp: t("settings.help.dayCutoff"),
                approvalStaleDays: t("settings.field.approvalStaleDays"),
                approvalCriticalDays: t("settings.field.approvalCriticalDays"),
                alertAgeHours: t("settings.field.alertAgeHours"),
                maxItems: t("settings.field.maxItems"),
                save: t("settings.save"),
                saving: t("settings.saving"),
                saved: t("settings.result.saved"),
                conflict: t("settings.result.conflict"),
                failed: t("settings.result.failed"),
                problems: Object.fromEntries(PROBLEM_CODES.map(code => [code, t(`settings.problem.${code}` as never)])),
              }}
            />
          ) : (
            <p className="text-sm text-muted">{t("settings.readOnly")}</p>
          )}
        </Panel>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 px-6 sm:px-8">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("settings.pageTitle")}
          subtitle={t("settings.pageLede")}
          level="page"
        />
        {body}
      </div>
    </AppShell>
  );
}
