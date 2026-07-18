"use client";

// PHASE 87F — premium operational command surface for the dashboard landing.
//
// Reorganizes the ALREADY-FETCHED, already-authorized DashboardSnapshot into
// the prioritized information architecture (operational status → attention →
// risk & evidence → safe actions). It fetches nothing and makes no auth
// decision; it receives `snap` from DashboardClient's existing telemetry poll,
// so there is no second polling loop and no new data exposure. Every value is
// traceable to a real snapshot field via command-logic.ts.

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  DashboardSection,
  OperationalStatusHeader,
  AttentionPanel,
  RiskEvidence,
  SafeActionGrid,
  type AttentionItem,
  type SafeAction,
} from "@/components/dashboard-experience";
import { buildCommandModel } from "@/components/dashboard-experience/command-logic";
import type { DashboardSnapshot } from "@/lib/services/types";

/** Locale-aware Link adapter matching the primitives' injected-Link contract. */
function DashLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

const REASON_KEY = {
  criticalAlarm: "reasonCriticalAlarm",
  highAlarm: "reasonHighAlarm",
  assetCritical: "reasonAssetCritical",
  assetDue: "reasonAssetDue",
} as const;

export function DashboardCommandSurface({ snap }: { snap: DashboardSnapshot }) {
  const t = useTranslations("dashboard.command");
  const tSev = useTranslations("dashboard.severity");
  const tAlarms = useTranslations("dashboard.alarmsP.msgs");
  const tAssets = useTranslations("dashboard.maintenanceP.assets");
  const tRiskTrend = useTranslations("dashboard.riskP.trend");
  const tFactors = useTranslations("dashboard.riskP.factors");
  const locale = useLocale();

  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const tf = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const pct = locale === "fa" ? "٪" : "%";

  const model = buildCommandModel(snap);

  const attentionItems: AttentionItem[] = model.attention.map((a) => ({
    id: a.id,
    severity: a.severity,
    severityLabel: tSev(a.severity),
    object: a.kind === "criticalAlarm" || a.kind === "highAlarm" ? tAlarms(a.objectKey) : tAssets(a.objectKey),
    reason: t(`attention.${REASON_KEY[a.kind]}`),
    meta:
      a.ts !== undefined
        ? tf.format(a.ts)
        : a.dueDays !== undefined
          ? `${t("attention.dueIn")} ${nf.format(a.dueDays)}${t("attention.days")}`
          : undefined,
    href: a.href,
    viewLabel: t("attention.view"),
  }));

  const actions: SafeAction[] = [
    { key: "brain", label: t("actions.openBrain"), description: t("actions.openBrainDesc"), href: "/industrial-brain", glyph: "◆" },
    { key: "ops", label: t("actions.openOperations"), description: t("actions.openOperationsDesc"), href: "/dashboard/operations", glyph: "◈" },
    { key: "predictive", label: t("actions.openPredictive"), description: t("actions.openPredictiveDesc"), href: "/dashboard/predictive", glyph: "◉" },
    { key: "knowledge", label: t("actions.openKnowledge"), description: t("actions.openKnowledgeDesc"), href: "/dashboard/knowledge", glyph: "◇" },
  ];

  const readinessLabelKey = { ready: "readinessReady", guarded: "readinessGuarded", hold: "readinessHold" } as const;

  return (
    <div className="mb-8 flex flex-col gap-6">
      <OperationalStatusHeader
        posture={model.posture}
        postureLabel={t(`posture.${model.posture}`)}
        summaryTitle={t("summaryTitle")}
        summaryNote={t(`posture.${model.posture}Note`)}
        linesLabel={t("signal.linesActive", { active: nf.format(model.activeLines), total: nf.format(model.totalLines) })}
        lastUpdatedLabel={t("lastUpdated")}
        lastUpdatedValue={tf.format(model.ts)}
        autoNote={t("autoNote")}
      />

      <DashboardSection id="attention" title={t("attention.title")}>
        <AttentionPanel items={attentionItems} emptyLabel={t("attention.empty")} LinkComponent={DashLink} />
      </DashboardSection>

      <DashboardSection id="risk-evidence" title={t("riskEvidence.title")}>
        <div className="ds-glass-card rounded-lg p-5">
          <RiskEvidence
            score={model.risk.score}
            trendLabel={tRiskTrend(model.risk.trend)}
            riskLabel={t("riskEvidence.riskLabel")}
            postureLabel={t("riskEvidence.posture")}
            factorsTitle={t("riskEvidence.factorsTitle")}
            factors={model.risk.factors.map((f) => ({ key: f.key, label: tFactors(f.key), weight: f.weight }))}
            evidenceTitle={t("riskEvidence.evidenceTitle")}
            evidence={{
              supportedLabel: t("riskEvidence.supported"),
              supported: model.evidence.supported,
              watchLabel: t("riskEvidence.watch"),
              watch: model.evidence.watch,
              missingLabel: t("riskEvidence.missing"),
              missing: model.evidence.missing,
            }}
            confidenceLabel={t("riskEvidence.confidenceLabel")}
            readiness={{ label: t(`riskEvidence.${readinessLabelKey[model.readiness]}`), tone: model.readiness }}
            formatNumber={nf.format}
            pct={pct}
          />
        </div>
      </DashboardSection>

      <DashboardSection id="safe-actions" title={t("actions.title")}>
        <SafeActionGrid actions={actions} LinkComponent={DashLink} />
      </DashboardSection>
    </div>
  );
}
