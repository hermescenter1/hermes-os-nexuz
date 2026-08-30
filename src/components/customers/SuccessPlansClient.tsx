"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { SuccessPlan, PlanStatus } from "@/lib/customers/types";

interface PlansData {
  plans:               SuccessPlan[];
  total:               number;
  statusCount:         Record<PlanStatus, number>;
  completedMilestones: number;
  totalMilestones:     number;
}

const STATUS_BADGE: Record<PlanStatus, string> = {
  "on-track": "hs-badge hs--reasoning",
  "at-risk":  "hs-badge hs--warning",
  delayed:    "hs-badge hs--risk",
  completed:  "hs-badge hs--confident",
};

/*
 * GATE B.1 F03 — stored enum value -> CATALOGUE KEY. The stored values
 * ("on-track", "at-risk", "delayed", "completed") are NOT mutated; only the
 * rendered label is resolved through next-intl.
 */
const STATUS_LABEL_KEY: Record<PlanStatus, string> = {
  "on-track": "statusOnTrack",
  "at-risk":  "statusAtRisk",
  delayed:    "statusDelayed",
  completed:  "statusCompleted",
};

export function SuccessPlansClient() {
  const t = useTranslations("customerSuccess");
  const [data,    setData]    = useState<PlansData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<PlanStatus | "all">("all");
  const [expanded,setExpanded]= useState<string | null>(null);

  useEffect(() => {
    fetch("/api/customers/success-plans")
      .then(r => r.json())
      .then((d: PlansData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <div className="global-ops-strip animate-pulse">
          {[1,2,3,4,5].map(i => <div key={i} className="global-ops-cell h-16" />)}
        </div>
        <div className="flex flex-col gap-3">
          {[1,2,3].map(i => <div key={i} className="rounded-xl border border-line bg-surface h-24 animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const filtered = filter === "all" ? data.plans : data.plans.filter(p => p.status === filter);
  const completedPct = data.totalMilestones > 0
    ? Math.round((data.completedMilestones / data.totalMilestones) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-5">

      {/* KPI strip */}
      <div className="global-ops-strip">
        <div className="global-ops-cell">
          <p className="kpi-label mb-1.5">{t("totalPlans")}</p>
          <p className="exec-kpi-value text-ink">{data.total}</p>
        </div>
        {(["on-track", "at-risk", "delayed", "completed"] as PlanStatus[]).map(s => (
          <div key={s} className="global-ops-cell">
            <p className="kpi-label mb-1.5">{t(STATUS_LABEL_KEY[s])}</p>
            <p className={`exec-kpi-value ${
              s === "on-track" ? "text-signal" : s === "completed" ? "text-signal" :
              s === "at-risk" ? "text-warn" : "text-danger"
            }`}>{data.statusCount[s]}</p>
          </div>
        ))}
        <div className="global-ops-cell">
          <p className="kpi-label mb-1.5">{t("milestonesDone")}</p>
          <p className="exec-kpi-value text-ink">{data.completedMilestones}/{data.totalMilestones}</p>
        </div>
        <div className="global-ops-cell">
          <p className="kpi-label mb-1.5">{t("milestoneProgress")}</p>
          <p className="exec-kpi-value text-signal">{completedPct}%</p>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-1 flex-wrap">
        {(["all", "on-track", "at-risk", "delayed", "completed"] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded border kpi-label transition-colors ${
              filter === s
                ? "border-signal bg-signal/10 text-signal"
                : "border-line text-muted hover:text-ink"
            }`}
          >
            {s === "all" ? t("filterAll") : t(STATUS_LABEL_KEY[s as PlanStatus])}
          </button>
        ))}
        <span className="ml-auto kpi-label text-metadata">{t("plansCount", { count: filtered.length })}</span>
      </div>

      {/* Plan list */}
      <div className="flex flex-col gap-3">
        {filtered.map(plan => {
          const done  = plan.milestones.filter(m => m.completed).length;
          const total = plan.milestones.length;
          const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
          const isOpen = expanded === plan.id;

          return (
            <div
              key={plan.id}
              className="rounded-xl border border-line bg-surface overflow-hidden"
            >
              {/* Header */}
              <button
                className="w-full px-5 py-4 text-left hover:bg-surface2 transition-colors"
                onClick={() => setExpanded(e => e === plan.id ? null : plan.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-body text-sm font-semibold text-ink">{plan.companyName}</p>
                      <span className={STATUS_BADGE[plan.status]}>{t(STATUS_LABEL_KEY[plan.status])}</span>
                    </div>
                    <p className="kpi-label text-metadata truncate">{plan.goal}</p>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    {/* Milestone progress */}
                    <div className="text-right hidden sm:block">
                      <p className="kpi-label text-metadata">{t("milestones")}</p>
                      <p className="font-mono text-sm font-bold text-ink">{done}/{total}</p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="kpi-label text-metadata">{t("due")}</p>
                      <p className="font-mono text-xs text-ink">{plan.dueDate}</p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="kpi-label text-metadata">{t("owner")}</p>
                      <p className="font-mono text-xs text-ink">{plan.owner}</p>
                    </div>
                    <span className="kpi-label text-metadata">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3 h-1.5 rounded-full bg-line overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      plan.status === "delayed" ? "bg-danger/60" :
                      plan.status === "at-risk" ? "bg-warn" : "bg-signal/70"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between mt-0.5">
                  <span className="kpi-label text-metadata">{t("percentComplete", { pct })}</span>
                  <span className="kpi-label text-metadata">{done}/{total} milestones</span>
                </div>
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div className="border-t border-line px-5 py-4 bg-surface2">

                  {/* Milestones */}
                  <div className="mb-4">
                    <p className="kpi-label text-metadata mb-2">{t("milestones")}</p>
                    <div className="space-y-2">
                      {plan.milestones.map(m => (
                        <div key={m.id} className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            m.completed ? "border-signal bg-signal/20" : "border-line"
                          }`}>
                            {m.completed && <span className="text-signal text-xs">✓</span>}
                          </div>
                          <p className={`font-body text-xs flex-1 ${m.completed ? "text-metadata line-through" : "text-ink"}`}>
                            {m.title}
                          </p>
                          <span className="kpi-label text-metadata flex-shrink-0">{m.dueDate}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="h-layer-sep mb-3" />

                  {/* Next action */}
                  <div className="rounded border border-signal/30 bg-signal/5 px-4 py-3">
                    <p className="kpi-label text-signal mb-1">{t("nextAction")}</p>
                    <p className="font-body text-xs text-ink">{plan.nextAction}</p>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <div>
                      <p className="kpi-label text-metadata">{t("owner")}</p>
                      <p className="font-mono text-xs text-ink">{plan.owner}</p>
                    </div>
                    <div>
                      <p className="kpi-label text-metadata">{t("dueDate")}</p>
                      <p className="font-mono text-xs text-ink">{plan.dueDate}</p>
                    </div>
                    <div>
                      <p className="kpi-label text-metadata">{t("created")}</p>
                      <p className="font-mono text-xs text-ink">{plan.createdAt}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-line bg-surface px-5 py-8 text-center">
            <p className="kpi-label text-metadata">{t("noPlansMatch")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
