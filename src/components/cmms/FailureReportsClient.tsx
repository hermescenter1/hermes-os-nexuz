"use client";
import { useTranslations, useLocale } from "next-intl";
import type { MaintenanceFailure } from "@/lib/cmms/types";
import { formatDate } from "@/lib/i18n/format";

const SEV_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  MINOR:    { bg: "bg-signal/[0.08]", text: "text-signal", dot: "bg-signal" },
  MODERATE: { bg: "bg-warn/[0.08]",   text: "text-warn",   dot: "bg-warn"   },
  MAJOR:    { bg: "bg-warn/[0.12]",   text: "text-warn",   dot: "bg-warn"   },
  CRITICAL: { bg: "bg-danger/[0.10]", text: "text-danger", dot: "bg-danger" },
};

const CAT_ICON: Record<string, string> = {
  MECHANICAL:      "M",
  ELECTRICAL:      "E",
  INSTRUMENTATION: "I",
  SOFTWARE:        "SW",
  HYDRAULIC:       "H",
  PNEUMATIC:       "P",
  STRUCTURAL:      "S",
  OPERATIONAL:     "O",
};

const CA_STYLE: Record<string, { bg: string; text: string }> = {
  OPEN:        { bg: "bg-ice/[0.08]",    text: "text-ice"    },
  IN_PROGRESS: { bg: "bg-warn/[0.08]",   text: "text-warn"   },
  CLOSED:      { bg: "bg-signal/[0.08]", text: "text-signal" },
  CANCELLED:   { bg: "bg-faint/[0.06]",  text: "text-faint"  },
};

export function FailureReportsClient({ failures }: { failures: MaintenanceFailure[] }) {
  const locale = useLocale();
  const t            = useTranslations("maintenanceOperations");
  const resolved     = failures.filter(f => f.resolvedAt).length;
  const critical     = failures.filter(f => f.severity === "CRITICAL").length;
  const totalDown    = failures.reduce((s, f) => s + (f.downtimeMinutes ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t("failures.kpiTotal"),    value: failures.length, ac: "text-ink",    b: "border-line"     },
          { label: t("failures.kpiCritical"), value: critical,        ac: "text-danger", b: "border-danger/30" },
          { label: t("failures.kpiResolved"), value: resolved,        ac: "text-signal", b: "border-signal/30" },
          { label: t("failures.kpiDowntime"), value: `${Math.round(totalDown / 60)}h`, ac: "text-warn", b: "border-warn/30" },
        ].map(s => (
          <div key={s.label} className={`card-enterprise rounded-xl p-4 border-s-2 ${s.b}`}>
            <div className={`text-2xl font-bold font-mono ${s.ac}`}>{s.value}</div>
            <div className="text-xs text-muted mt-1.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Failure list */}
      <div className="space-y-3">
        {failures.map(f => {
          const s = SEV_STYLE[f.severity] ?? { bg: "bg-muted/[0.06]", text: "text-muted", dot: "bg-muted" };
          const catCode = CAT_ICON[f.category] ?? f.category.charAt(0);
          return (
            <div key={f.id} className="card-enterprise rounded-xl p-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-warn/[0.08] border border-warn/15 flex items-center justify-center text-xs font-mono font-bold text-warn shrink-0">
                    {catCode}
                  </div>
                  <h3 className="font-semibold text-ink text-sm leading-snug">{f.title}</h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/[0.06] text-xs font-medium ${s.bg} ${s.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    {f.severity}
                  </span>
                  <span className={`text-xs px-2.5 py-1 rounded-lg border border-white/[0.05] font-medium ${f.resolvedAt ? "bg-signal/[0.08] text-signal" : "bg-danger/[0.08] text-danger"}`}>
                    {f.resolvedAt ? t("failures.resolved") : t("failures.open")}
                  </span>
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-muted mb-3 line-clamp-2 leading-relaxed">{f.description}</p>

              {/* Meta row */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-faint mb-4">
                <span>{t("failures.category")}: <span className="text-muted">{f.category}</span></span>
                <span>{t("failures.occurred")}: <span className="font-mono text-muted">{formatDate(f.occurredAt, locale)}</span></span>
                {f.resolvedAt && (
                  <span>{t("failures.resolvedAt")}: <span className="font-mono text-muted">{formatDate(f.resolvedAt, locale)}</span></span>
                )}
                {f.downtimeMinutes != null && (
                  <span>{t("failures.downtime")}: <span className="font-mono text-warn">{Math.round(f.downtimeMinutes / 60)}h</span></span>
                )}
              </div>

              {/* Root Causes */}
              {f.causes && f.causes.length > 0 && (
                <div className="mb-3">
                  <p className="eyebrow-label text-faint mb-2">{t("failures.rootCauses")}</p>
                  <div className="space-y-1">
                    {f.causes.map(c => (
                      <div key={c.id} className="flex items-center gap-2.5 text-xs">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.isConfirmed ? "bg-warn" : "bg-faint"}`} />
                        <span className="text-muted flex-1">{c.cause}</span>
                        <span className="text-faint font-mono">{Math.round(c.probability * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Corrective Actions */}
              {f.correctiveActions && f.correctiveActions.length > 0 && (
                <div>
                  <p className="eyebrow-label text-faint mb-2">{t("failures.correctiveActions")}</p>
                  <div className="space-y-1">
                    {f.correctiveActions.map(ca => {
                      const cs = CA_STYLE[ca.status] ?? { bg: "bg-muted/[0.06]", text: "text-muted" };
                      return (
                        <div key={ca.id} className="flex items-center gap-2.5 text-xs">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium border border-white/[0.05] ${cs.bg} ${cs.text}`}>
                            {ca.status}
                          </span>
                          <span className="text-muted">{ca.action}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
