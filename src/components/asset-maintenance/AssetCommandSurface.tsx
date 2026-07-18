// PHASE 87I — Asset Registry command surface (Server Component). Receives the
// ALREADY server-fetched, already-authorized AssetDashboard and reorganizes it
// into the asset IA: attention → operational status → criticality → health →
// critical watch → lifecycle → next actions (incl. the CMMS cross-link).
// Every value is a real dashboard field (see logic.ts). No fetch, no auth
// decision, no fabricated health score.

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { TechnicalValue } from "@/components/ds";
import {
  DashboardSection, AttentionPanel, SafeActionGrid,
  type AttentionItem, type SafeAction,
} from "@/components/dashboard-experience";
import { AssetStatusBadge, AssetCriticalityBadge, AssetRiskBadge } from "./StatusBadges";
import { deriveAssetAttention, orderedDistribution } from "./logic";
import { DistributionCard } from "./DistributionCard";
import type { AssetDashboard, AssetStatus, AssetCriticality, AssetRiskState } from "@/lib/assets/types";

function AmLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return <Link href={href} className={className}>{children}</Link>;
}

const STATUS_ORDER: AssetStatus[] = [
  "IN_SERVICE", "DEGRADED", "UNDER_MAINTENANCE", "STANDBY", "COMMISSIONED",
  "PLANNED", "RETIRED", "REPLACED", "DECOMMISSIONED",
];
const CRITICALITY_ORDER: AssetCriticality[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NON_CRITICAL"];
const RISK_ORDER: AssetRiskState[] = ["CRITICAL", "AT_RISK", "MONITOR", "HEALTHY", "UNKNOWN"];

export async function AssetCommandSurface({
  data, locale,
}: {
  data: AssetDashboard;
  locale: string;
}) {
  const t = await getTranslations("assetMaintenance");
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const df = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" });

  const attention: AttentionItem[] = deriveAssetAttention(data).map((a) => ({
    id: a.id,
    severity: a.severity === "action" ? "high" : "medium",
    severityLabel: a.severity === "action" ? t("attention.severityAction") : t("attention.severityReview"),
    object: t("fields.totalAssets"),
    reason: t(`attention.${a.kind}`, { count: nf.format(a.count) }),
    href: a.href,
    viewLabel: t("attention.view"),
  }));

  const statusRows = orderedDistribution(STATUS_ORDER, data.assetsByStatus);
  const criticalityRows = orderedDistribution(CRITICALITY_ORDER, data.assetsByCriticality);
  const healthDist: Record<string, number> = {
    CRITICAL: data.healthDistribution.critical,
    AT_RISK: data.healthDistribution.atRisk,
    MONITOR: data.healthDistribution.monitor,
    HEALTHY: data.healthDistribution.healthy,
    UNKNOWN: data.healthDistribution.unknown,
  };
  const healthRows = orderedDistribution(RISK_ORDER, healthDist);

  const actions: SafeAction[] = [
    { key: "registry", label: t("actions.registry"), description: t("actions.registryDesc"), href: "/assets/registry", glyph: "◆" },
    { key: "hierarchy", label: t("actions.hierarchy"), description: t("actions.hierarchyDesc"), href: "/assets/hierarchy", glyph: "◈" },
    { key: "criticality", label: t("actions.criticality"), description: t("actions.criticalityDesc"), href: "/assets/criticality", glyph: "◉" },
    // Cross-module link: maintenance work for these assets lives in CMMS.
    { key: "cmms", label: t("crossLinks.toCmms"), description: t("crossLinks.toCmmsDesc"), href: "/cmms/work-orders", glyph: "◇" },
  ];

  const registryEmpty = data.totalAssets === 0;

  return (
    <div className="flex flex-col gap-6">
      <DashboardSection id="am-attention" title={t("attention.title")}>
        <AttentionPanel items={attention} emptyLabel={t("attention.emptyAssets")} LinkComponent={AmLink} />
      </DashboardSection>

      <DashboardSection id="am-status" title={t("sections.assetStatus")}>
        {registryEmpty ? (
          <div className="ds-glass-card rounded-lg p-5">
            <p className="text-body-compact text-text-secondary">{t("states.emptyRegistry")}</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <DistributionCard
              title={t("sections.assetStatus")}
              rows={statusRows.map((r) => ({
                key: r.key, count: r.count,
                badge: <AssetStatusBadge status={r.key} label={t(`assetStatus.${r.key}`)} />,
              }))}
              nf={nf}
            />
            <DistributionCard
              title={t("sections.criticality")}
              rows={criticalityRows.map((r) => ({
                key: r.key, count: r.count,
                badge: <AssetCriticalityBadge criticality={r.key} label={t(`criticality.${r.key}`)} />,
              }))}
              nf={nf}
            />
            <DistributionCard
              title={t("sections.health")}
              rows={healthRows.map((r) => ({
                key: r.key, count: r.count,
                badge: <AssetRiskBadge risk={r.key} label={t(`risk.${r.key}`)} />,
              }))}
              nf={nf}
            />
          </div>
        )}
      </DashboardSection>

      {/* Critical asset watch — real registry records, progressive detail via the asset page. */}
      {data.topCriticalAssets.length > 0 ? (
        <DashboardSection id="am-critical" title={t("sections.criticalWatch")}>
          <ul className="flex flex-col gap-2">
            {data.topCriticalAssets.slice(0, 6).map((a) => (
              <li key={a.id}>
                <Link
                  href={`/assets/${a.id}`}
                  className="ds-focus flex items-center gap-3 ds-glass-interactive rounded-lg p-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-compact font-semibold text-text-primary" dir="auto">
                      {a.name}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-text-muted">
                      {/* Asset number is a machine identifier — always LTR-isolated. */}
                      <TechnicalValue>{a.assetNumber}</TechnicalValue>
                      {a.siteId
                        ? <span>· <TechnicalValue>{a.siteId}</TechnicalValue></span>
                        : <span dir="auto">· {t("fields.noSite")}</span>}
                    </span>
                  </span>
                  <AssetCriticalityBadge criticality={a.criticality} label={t(`criticality.${a.criticality}`)} />
                </Link>
              </li>
            ))}
          </ul>
        </DashboardSection>
      ) : null}

      <DashboardSection id="am-lifecycle" title={t("sections.lifecycle")}>
        <div className="ds-glass-card rounded-lg p-5">
          {data.recentLifecycleEvents.length === 0 ? (
            <p className="text-body-compact text-text-secondary">{t("states.noLifecycle")}</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {data.recentLifecycleEvents.slice(0, 6).map((e) => (
                <li key={e.id} className="flex items-center gap-3">
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" />
                  {/* toState is an AssetLifecycleState (NOT AssetStatus) — its
                      own localized label set; enum value stays internal. */}
                  <span className="flex-1 text-body-compact text-text-primary" dir="auto">
                    {t(`lifecycle.${e.toState}`)}
                  </span>
                  <span className="shrink-0 text-caption text-text-muted" dir="ltr">
                    {df.format(new Date(e.occurredAt))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DashboardSection>

      <DashboardSection id="am-actions" title={t("sections.actions")}>
        <SafeActionGrid actions={actions} LinkComponent={AmLink} />
      </DashboardSection>
    </div>
  );
}
