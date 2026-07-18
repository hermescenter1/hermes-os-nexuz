// PHASE 87I — CMMS maintenance command surface (Server Component). Receives
// the ALREADY server-fetched, already-authorized CmmsDashboard and reorganizes
// it into the maintenance IA: attention → work-order flow → priority →
// upcoming maintenance → failure records → reliability indicators → actions
// (incl. the Asset Registry cross-link). Every value is a real dashboard field
// or the EXISTING CMMS reliability calculation (kpis) — nothing fabricated.

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { TechnicalValue } from "@/components/ds";
import {
  DashboardSection, AttentionPanel, SafeActionGrid,
  type AttentionItem, type SafeAction,
} from "@/components/dashboard-experience";
import { MaintenanceStatusBadge, MaintenancePriorityBadge } from "./StatusBadges";
import { deriveMaintenanceAttention, orderedDistribution } from "./logic";
import { DistributionCard } from "./DistributionCard";
import type { CmmsDashboard, MaintenanceStatus, MaintenancePriority } from "@/lib/cmms/types";

function AmLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return <Link href={href} className={className}>{children}</Link>;
}

const STATUS_ORDER: MaintenanceStatus[] = [
  "OVERDUE", "IN_PROGRESS", "ON_HOLD", "SCHEDULED", "PLANNED", "DRAFT", "COMPLETED", "CANCELLED",
];
const PRIORITY_ORDER: MaintenancePriority[] = ["EMERGENCY", "CRITICAL", "HIGH", "MEDIUM", "LOW"];

export async function MaintenanceCommandSurface({
  data, locale,
}: {
  data: CmmsDashboard;
  locale: string;
}) {
  const t = await getTranslations("assetMaintenance");
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const df = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" });

  const attention: AttentionItem[] = deriveMaintenanceAttention(data).map((a) => ({
    id: a.id,
    severity: a.severity === "action" ? "high" : "medium",
    severityLabel: a.severity === "action" ? t("attention.severityAction") : t("attention.severityReview"),
    object: t("cmms.eyebrow"),
    reason: t(`attention.${a.kind}`, { count: nf.format(a.count) }),
    href: a.href,
    viewLabel: t("attention.view"),
  }));

  const statusRows = orderedDistribution(STATUS_ORDER, data.tasksByStatus);
  const priorityRows = orderedDistribution(PRIORITY_ORDER, data.tasksByPriority);

  const actions: SafeAction[] = [
    { key: "workOrders", label: t("actions.workOrders"), description: t("actions.workOrdersDesc"), href: "/cmms/work-orders", glyph: "◆" },
    { key: "plans", label: t("actions.plans"), description: t("actions.plansDesc"), href: "/cmms/plans", glyph: "◈" },
    { key: "failures", label: t("actions.failures"), description: t("actions.failuresDesc"), href: "/cmms/failures", glyph: "◉" },
    // Cross-module link: equipment identity/criticality lives in Asset Registry.
    { key: "assets", label: t("crossLinks.toAssets"), description: t("crossLinks.toAssetsDesc"), href: "/assets/registry", glyph: "◇" },
  ];

  const noWork = statusRows.length === 0 && priorityRows.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <DashboardSection id="am-attention" title={t("attention.title")}>
        <AttentionPanel items={attention} emptyLabel={t("attention.emptyMaintenance")} LinkComponent={AmLink} />
      </DashboardSection>

      <DashboardSection id="am-flow" title={t("sections.workFlow")}>
        {noWork ? (
          <div className="rounded-md border border-border-default bg-surface-primary p-5">
            <p className="text-body-compact text-text-secondary">{t("states.noMaintenance")}</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <DistributionCard
              title={t("sections.workFlow")}
              rows={statusRows.map((r) => ({
                key: r.key, count: r.count,
                badge: <MaintenanceStatusBadge status={r.key} label={t(`maintenanceStatus.${r.key}`)} />,
              }))}
              nf={nf}
            />
            <DistributionCard
              title={t("sections.priority")}
              rows={priorityRows.map((r) => ({
                key: r.key, count: r.count,
                badge: <MaintenancePriorityBadge priority={r.key} label={t(`maintenancePriority.${r.key}`)} />,
              }))}
              nf={nf}
            />
          </div>
        )}
      </DashboardSection>

      {/* Upcoming maintenance — real scheduled tasks; no invented recurrence. */}
      <DashboardSection id="am-upcoming" title={t("sections.upcoming")}>
        <div className="rounded-md border border-border-default bg-surface-primary p-5">
          {data.upcomingTasks.length === 0 ? (
            <p className="text-body-compact text-text-secondary">{t("states.noUpcoming")}</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {data.upcomingTasks.slice(0, 6).map((task) => (
                <li key={task.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 flex-1 truncate text-body-compact text-text-primary" dir="auto">
                    {task.title}
                  </span>
                  <MaintenancePriorityBadge priority={task.priority} label={t(`maintenancePriority.${task.priority}`)} />
                  <span className="shrink-0 text-caption text-text-muted">
                    {task.dueDate
                      ? <span dir="ltr">{df.format(new Date(task.dueDate))}</span>
                      : t("fields.noDueDate")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DashboardSection>

      {/* Failure records — reported/recorded failures, NOT diagnostic hypotheses. */}
      <DashboardSection id="am-failures" title={t("sections.failures")}>
        <div className="rounded-md border border-border-default bg-surface-primary p-5">
          {data.recentFailures.length === 0 ? (
            <p className="text-body-compact text-text-secondary">{t("states.noFailures")}</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {data.recentFailures.slice(0, 5).map((f) => (
                <li key={f.id} className="flex items-center gap-3">
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-danger" />
                  <span className="min-w-0 flex-1 truncate text-body-compact text-text-primary" dir="auto">
                    {f.title}
                  </span>
                  <span className="shrink-0 text-caption text-text-muted" dir="ltr">
                    {df.format(new Date(f.detectedAt ?? f.createdAt))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DashboardSection>

      {/* Reliability indicators — the EXISTING CmmsKpis calculation, with its
          assumptions stated. Not fabricated, not presented as predictive. */}
      <DashboardSection id="am-reliability" title={t("sections.reliability")}>
        <div className="rounded-md border border-border-default bg-surface-primary p-5">
          <dl className="grid gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-caption text-text-muted"><TechnicalValue mono={false}>{t("reliability.mtbf")}</TechnicalValue></dt>
              <dd className="mt-0.5 text-title font-semibold text-text-primary" dir="ltr">
                {nf1.format(data.kpis.mtbf)}<span className="ms-0.5 text-caption font-normal text-text-muted">{t("reliability.hours")}</span>
              </dd>
            </div>
            <div>
              <dt className="text-caption text-text-muted"><TechnicalValue mono={false}>{t("reliability.mttr")}</TechnicalValue></dt>
              <dd className="mt-0.5 text-title font-semibold text-text-primary" dir="ltr">
                {nf1.format(data.kpis.mttr)}<span className="ms-0.5 text-caption font-normal text-text-muted">{t("reliability.hours")}</span>
              </dd>
            </div>
            <div>
              <dt className="text-caption text-text-muted">{t("reliability.availability")}</dt>
              <dd className="mt-0.5 text-title font-semibold text-text-primary" dir="ltr">{nf1.format(data.kpis.availability)}%</dd>
            </div>
            <div>
              <dt className="text-caption text-text-muted">{t("reliability.compliance")}</dt>
              <dd className="mt-0.5 text-title font-semibold text-text-primary" dir="ltr">{nf1.format(data.kpis.maintenanceCompliance)}%</dd>
            </div>
          </dl>
          <p className="mt-3 text-caption text-text-muted">{t("reliability.note")}</p>
        </div>
      </DashboardSection>

      <DashboardSection id="am-actions" title={t("sections.actions")}>
        <SafeActionGrid actions={actions} LinkComponent={AmLink} />
      </DashboardSection>
    </div>
  );
}
