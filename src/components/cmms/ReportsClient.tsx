"use client";
import { useTranslations } from "next-intl";
import type { CmmsKpis } from "@/lib/cmms/types";

interface ReportData {
  kpis:           CmmsKpis;
  failurePareto:  { category: string; count: number }[];
  costByCategory: Record<string, number>;
  totalCost:      number;
  lowStockParts:  number;
  totalParts:     number;
  taskSummary:    { total: number; completed: number; overdue: number; inProgress: number; planned: number };
}

export function ReportsClient({ report }: { report: ReportData }) {
  const t = useTranslations("maintenanceOperations");
  const { kpis, failurePareto, costByCategory, totalCost, taskSummary } = report;

  return (
    <div className="space-y-7">
      {/* Module hero */}
      <div className="rounded-xl border border-warn/15 bg-warn/[0.04] px-6 py-5">
        <p className="eyebrow-mono text-warn mb-1">{t("reports.eyebrow")}</p>
        <h1 className="text-xl font-bold text-ink">{t("reports.title")}</h1>
      </div>

      {/* Reliability KPIs */}
      <section>
        <p className="eyebrow-label text-faint mb-3">{t("reports.reliabilityKpis")}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            // "MTBF"/"MTTR" are protected reliability acronyms shown identically
            // in every locale — raw labels, not catalog keys.
            { label: "MTBF", sub: t("reports.mtbfSub"), value: kpis.mtbf, unit: "h", color: "text-ice",  border: "border-ice/20" },
            { label: "MTTR", sub: t("reports.mttrSub"), value: kpis.mttr, unit: "h", color: "text-warn", border: "border-warn/20" },
            { label: t("reports.availability"),
              sub: t("reports.availabilitySub"),
              value: `${kpis.availability}%`, unit: "",
              color: kpis.availability >= 95 ? "text-signal" : "text-danger",
              border: kpis.availability >= 95 ? "border-signal/20" : "border-danger/20" },
            { label: t("reports.pmCompliance"),
              sub: t("reports.pmComplianceSub"),
              value: `${kpis.maintenanceCompliance}%`, unit: "",
              color: kpis.maintenanceCompliance >= 90 ? "text-signal" : "text-warn",
              border: "border-warn/20" },
          ].map(k => (
            <div key={k.label} className={`card-enterprise rounded-xl p-4 border-s-2 ${k.border}`}>
              <div className="text-xs text-faint mb-1">{k.label}</div>
              <div className={`text-2xl font-bold font-mono ${k.color}`}>
                {k.value}{k.unit && <span className="text-xs font-normal text-faint ms-1">{k.unit}</span>}
              </div>
              <div className="text-xs text-faint mt-1.5 leading-snug">{k.sub}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Failure Pareto */}
        <section>
          <p className="eyebrow-label text-faint mb-3">{t("reports.failurePareto")}</p>
          <div className="card-enterprise rounded-xl p-5 space-y-4">
            {failurePareto.map(({ category, count }, i) => {
              const max   = failurePareto[0]?.count ?? 1;
              const width = Math.round((count / max) * 100);
              return (
                <div key={category}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-medium text-ink">{i + 1}. {category}</span>
                    <span className="text-faint font-mono">{count} {t("reports.failuresUnit")}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface3">
                    <div className="h-1.5 rounded-full bg-danger/70" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Cost Breakdown */}
        <section>
          <p className="eyebrow-label text-faint mb-3">{t("reports.costBreakdown")}</p>
          <div className="card-enterprise rounded-xl p-5 space-y-4">
            {Object.entries(costByCategory).map(([cat, amt]) => {
              const pct = Math.round((amt / (totalCost || 1)) * 100);
              return (
                <div key={cat}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-medium text-ink">{cat}</span>
                    <span className="text-faint font-mono">${Math.round(amt).toLocaleString()} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface3">
                    <div className="h-1.5 rounded-full bg-warn/70" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="pt-3 border-t border-line flex justify-between text-sm font-bold">
              <span className="text-muted">{t("reports.total")}</span>
              <span className="text-signal font-mono">${Math.round(totalCost).toLocaleString()}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Work Order Summary */}
      <section>
        <p className="eyebrow-label text-faint mb-3">{t("reports.woSummary")}</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: t("reports.sumTotal"),      value: taskSummary.total,      ac: "text-ink",    b: "border-line"      },
            { label: t("reports.sumCompleted"),  value: taskSummary.completed,  ac: "text-signal", b: "border-signal/20" },
            { label: t("reports.sumInProgress"), value: taskSummary.inProgress, ac: "text-warn",   b: "border-warn/20"   },
            { label: t("reports.sumPlanned"),    value: taskSummary.planned,    ac: "text-ice",    b: "border-ice/20"    },
            { label: t("reports.sumOverdue"),    value: taskSummary.overdue,    ac: taskSummary.overdue > 0 ? "text-danger" : "text-signal", b: taskSummary.overdue > 0 ? "border-danger/30" : "border-signal/20" },
          ].map(s => (
            <div key={s.label} className={`card-enterprise rounded-xl p-4 border-s-2 ${s.b}`}>
              <div className={`text-2xl font-bold font-mono ${s.ac}`}>{s.value}</div>
              <div className="text-xs text-muted mt-1.5">{s.label}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
