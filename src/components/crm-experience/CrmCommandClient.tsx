"use client";

// PHASE 87G — premium CRM landing surface (client island).
//
// One-shot fetch of the two EXISTING endpoints (/api/crm/dashboard +
// /api/crm/leads — same authz, no polling, no new API), reorganized into the
// prioritized sales IA: attention → pipeline → recent leads → KPIs → actions.
// Every number is a field of the fetched records (or the backend's existing
// deterministic stats); nothing is fabricated. Raw errors are never rendered.

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn, KpiCard, TechnicalValue } from "@/components/ds";
import {
  DashboardSection,
  AttentionPanel,
  SafeActionGrid,
  DashboardSkeleton,
  DataUnavailableState,
  type AttentionItem,
  type SafeAction,
} from "@/components/dashboard-experience";
import { deriveCrmAttention, formatMoney } from "./logic";
import { LeadStatusBadge } from "./LeadStatusBadge";
import type { CrmDashboardStats, CrmPipelineStage, CrmLead } from "@/lib/crm/types";

function CrmLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

type LoadState =
  | { phase: "loading" }
  | { phase: "unavailable" }
  | { phase: "ready"; stats: CrmDashboardStats; pipeline: CrmPipelineStage[]; leads: CrmLead[] };

export function CrmCommandClient() {
  const t = useTranslations("crm");
  const locale = useLocale();
  const [state, setState] = useState<LoadState>({ phase: "loading" });

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [dashRes, leadsRes] = await Promise.all([
          fetch("/api/crm/dashboard"),
          fetch("/api/crm/leads"),
        ]);
        if (!live) return;
        if (!dashRes.ok || !leadsRes.ok) {
          setState({ phase: "unavailable" });
          return;
        }
        const dash = (await dashRes.json()) as { stats?: CrmDashboardStats; pipeline?: CrmPipelineStage[] };
        const leadsBody = (await leadsRes.json()) as { leads?: CrmLead[] };
        if (!live) return;
        if (!dash.stats) {
          setState({ phase: "unavailable" });
          return;
        }
        setState({ phase: "ready", stats: dash.stats, pipeline: dash.pipeline ?? [], leads: leadsBody.leads ?? [] });
      } catch {
        if (live) setState({ phase: "unavailable" });
      }
    })();
    return () => { live = false; };
  }, []);

  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const df = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });

  if (state.phase === "loading") return <DashboardSkeleton label={t("states.loading")} />;
  if (state.phase === "unavailable") {
    return <DataUnavailableState title={t("states.unavailableTitle")} body={t("states.unavailableBody")} />;
  }

  const { stats, pipeline, leads } = state;

  const attention: AttentionItem[] = deriveCrmAttention(leads, stats).map((a) => ({
    id: a.id,
    severity: a.kind === "newLead" ? "medium" : "high",
    severityLabel: a.kind === "newLead" ? t("attention.severityInfo") : t("attention.severityAction"),
    object: a.kind === "atRiskAccounts" ? t("attention.reviewCs") : a.object,
    reason:
      a.kind === "newLead"
        ? t("attention.newLead")
        : a.kind === "unassignedLead"
          ? t("attention.unassignedLead")
          : t("attention.atRiskAccounts", { count: nf.format(a.count ?? 0) }),
    meta: a.createdAt ? df.format(new Date(a.createdAt)) : undefined,
    href: a.href,
    viewLabel: t("attention.view"),
  }));

  const openPipeline = pipeline.filter((s) => s.stage !== "LOST" && s.stage !== "WON");
  const maxValue = Math.max(...openPipeline.map((s) => s.value), 1);

  const recent = leads.filter((l) => !l.deletedAt).slice(0, 5);

  const actions: SafeAction[] = [
    { key: "leads", label: t("actions.reviewLeads"), description: t("actions.reviewLeadsDesc"), href: "/crm/leads", glyph: "◆" },
    { key: "pipeline", label: t("actions.viewPipeline"), description: t("actions.viewPipelineDesc"), href: "/crm/opportunities", glyph: "◈" },
    { key: "accounts", label: t("actions.openAccounts"), description: t("actions.openAccountsDesc"), href: "/crm/accounts", glyph: "◇" },
    { key: "cs", label: t("actions.openCs"), description: t("actions.openCsDesc"), href: "/crm/customer-success", glyph: "◉" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <DashboardSection id="crm-attention" title={t("attention.title")}>
        <AttentionPanel items={attention} emptyLabel={t("attention.empty")} LinkComponent={CrmLink} />
      </DashboardSection>

      <DashboardSection
        id="crm-pipeline"
        title={t("pipeline.title")}
        action={
          <span className="text-caption text-text-muted">
            {t("pipeline.open", { count: nf.format(stats.activeOpportunities) })}
          </span>
        }
      >
        <div className="rounded-md border border-border-default bg-surface-primary p-5">
          {openPipeline.length === 0 ? (
            <p className="text-body-compact text-text-secondary">{t("pipeline.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {openPipeline.map((s) => (
                <li key={s.stage}>
                  <div className="flex items-baseline justify-between gap-2 text-caption">
                    <span className="font-medium text-text-primary" dir="auto">{t(`stage.${s.stage}`)}</span>
                    <span className="text-text-secondary">
                      <span dir="ltr" className="tabular-nums">{nf.format(s.count)}</span>
                      {" · "}
                      <TechnicalValue mono={false}>{formatMoney(s.value)}</TechnicalValue>
                      {" · "}
                      <span dir="ltr" className="tabular-nums">{s.probability}%</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-surface-interactive">
                    <div
                      className="h-1.5 rounded-full bg-brand-primary"
                      style={{ inlineSize: `${Math.round((s.value / maxValue) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-caption text-text-muted">{t("pipeline.weightedNote")}</p>
        </div>
      </DashboardSection>

      <DashboardSection
        id="crm-recent"
        title={t("recent.title")}
        action={
          <Link href="/crm/leads" className="ds-focus rounded-sm text-label font-semibold text-brand-primary hover:underline">
            {t("recent.viewAll")}
          </Link>
        }
      >
        {recent.length === 0 ? (
          <div className="rounded-md border border-border-default bg-surface-primary p-5">
            <p className="text-body-compact text-text-secondary">{t("recent.empty")}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((l) => (
              <li key={l.id}>
                <Link
                  href="/crm/leads"
                  className={cn(
                    "ds-focus flex items-center gap-3 rounded-md border border-border-default bg-surface-primary p-3",
                    "transition-colors duration-fast hover:border-border-active hover:bg-surface-interactive",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-compact font-semibold text-text-primary" dir="auto">
                      {[l.firstName, l.lastName].filter(Boolean).join(" ")}
                      {l.company ? <span className="font-normal text-text-secondary"> — {l.company}</span> : null}
                    </span>
                    <span className="mt-0.5 block text-caption text-text-muted" dir="ltr">
                      {df.format(new Date(l.createdAt))}
                    </span>
                  </span>
                  <LeadStatusBadge status={l.status} label={t(`status.${l.status}`)} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      {/* KPI strip — every value is a backend stats field. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={t("kpi.totalLeads")}
          value={<span dir="ltr">{nf.format(stats.totalLeads)}</span>}
          deltaLabel={t("kpi.newThisMonth", { count: nf.format(stats.newLeadsThisMonth) })}
        />
        <KpiCard
          label={t("kpi.pipelineValue")}
          value={<TechnicalValue mono={false}>{formatMoney(stats.pipelineValue)}</TechnicalValue>}
          deltaLabel={t("kpi.openOpps", { count: nf.format(stats.activeOpportunities) })}
        />
        <KpiCard
          label={t("kpi.forecast")}
          value={<TechnicalValue mono={false}>{formatMoney(stats.forecastRevenue)}</TechnicalValue>}
          deltaLabel={t("kpi.conversion") + ` · ${stats.conversionRate}%`}
        />
        <KpiCard
          label={t("kpi.accounts")}
          value={<span dir="ltr">{nf.format(stats.healthyAccounts + stats.atRiskAccounts)}</span>}
          deltaLabel={t("kpi.healthySplit", {
            healthy: nf.format(stats.healthyAccounts),
            atRisk: nf.format(stats.atRiskAccounts),
          })}
        />
      </div>

      <DashboardSection id="crm-actions" title={t("actions.title")}>
        <SafeActionGrid actions={actions} LinkComponent={CrmLink} />
      </DashboardSection>
    </div>
  );
}
