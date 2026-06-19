import { useTranslations }   from "next-intl";
import { GlassCard }          from "@/components/ui/GlassCard";

/**
 * Risk score dashboard page — Phase 39.
 * Displays risk scoring overview and links to asset-specific analysis.
 * Actual risk computation is triggered from the API (/api/predictive/risk).
 */
export default function RiskPage() {
  const t = useTranslations("predictive");
  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-signal">{t("eyebrow")}</p>
        <h1 className="text-2xl font-bold text-white mt-1">{t("risk.title")}</h1>
        <p className="text-white/50 text-sm mt-1">{t("risk.subtitle")}</p>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
        <p className="text-amber-300 text-sm">{t("safetyBanner")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassCard className="p-5">
          <p className="font-mono text-xs uppercase text-white/30 mb-2">{t("risk.score")}</p>
          <p className="text-white/40 text-sm">{t("risk.subtitle")}</p>
        </GlassCard>
        <GlassCard className="p-5">
          <p className="font-mono text-xs uppercase text-white/30 mb-2">{t("confidence.HIGH")}</p>
          <p className="text-white/40 text-sm">{t("confidence.explanation")}</p>
        </GlassCard>
        <GlassCard className="p-5">
          <p className="font-mono text-xs uppercase text-white/30 mb-2">{t("criticality.title")}</p>
          <p className="text-white/40 text-sm">{t("criticality.subtitle")}</p>
        </GlassCard>
      </div>

      <GlassCard className="p-5">
        <p className="font-mono text-xs uppercase text-white/30 mb-3">{t("assetRanking.title")}</p>
        <p className="text-white/30 text-sm text-center py-6">{t("insufficientData.banner")}</p>
        <p className="text-white/20 font-mono text-xs text-center mt-2">
          Use GET /api/predictive/risk to compute scores, then return here to view rankings.
        </p>
      </GlassCard>

      <GlassCard className="p-5">
        <p className="font-mono text-xs uppercase text-white/30 mb-3">Weight Configuration</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Health Trend",    weight: "30%" },
            { label: "Alarm Trend",     weight: "25%" },
            { label: "KPI Degradation", weight: "20%" },
            { label: "Tel. Quality",    weight: "15%" },
            { label: "Tel. Freshness",  weight: "10%" },
          ].map((w) => (
            <div key={w.label} className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-center">
              <p className="text-cyan-400 font-mono text-lg font-bold">{w.weight}</p>
              <p className="text-white/40 text-xs mt-1">{w.label}</p>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
