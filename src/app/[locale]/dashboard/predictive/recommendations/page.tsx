import { useTranslations } from "next-intl";
import { GlassCard }       from "@/components/ui/GlassCard";

/**
 * Maintenance Recommendations dashboard — Phase 39.
 * READ-ONLY: Displays recommendations only. Never executes or dispatches them.
 */
export default function RecommendationsPage() {
  const t = useTranslations("predictive");
  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-signal">{t("eyebrow")}</p>
        <h1 className="text-2xl font-bold text-white mt-1">{t("recommendations.title")}</h1>
        <p className="text-white/50 text-sm mt-1">{t("recommendations.subtitle")}</p>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
        <p className="text-amber-300 text-sm">{t("safetyBanner")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { type: "inspection",         label: t("recommendations.types.inspection"),         color: "border-red-500/20" },
          { type: "alarm_review",       label: t("recommendations.types.alarm_review"),       color: "border-amber-500/20" },
          { type: "maintenance_review", label: t("recommendations.types.maintenance_review"), color: "border-cyan-500/20" },
          { type: "comms_inspection",   label: t("recommendations.types.comms_inspection"),   color: "border-blue-500/20" },
        ].map((c) => (
          <GlassCard key={c.type} className={`p-4 ${c.color}`}>
            <p className="font-mono text-xs uppercase text-white/30 mb-2">{c.type}</p>
            <p className="text-white/60 text-sm">{c.label}</p>
          </GlassCard>
        ))}
      </div>

      <GlassCard className="p-5">
        <p className="font-mono text-xs uppercase text-white/30 mb-3">{t("recommendations.noData")}</p>
        <p className="text-white/30 text-sm text-center py-6">{t("insufficientData.banner")}</p>
        <p className="text-white/20 font-mono text-xs text-center mt-2">
          Use GET /api/predictive/recommendations to generate evidence-backed recommendations.
        </p>
      </GlassCard>

      <GlassCard className="p-5">
        <p className="font-mono text-xs uppercase text-white/30 mb-3">{t("evidence.title")}</p>
        <div className="space-y-2 text-xs text-white/40">
          <p>Every recommendation is backed by at minimum one of:</p>
          <ul className="list-disc list-inside space-y-1 text-white/30">
            <li>AssetHealthHistory trend (slope + sample count)</li>
            <li>TelemetryRecord quality metrics (BAD/STALE rate)</li>
            <li>KPIRecord efficiency / availability degradation</li>
            <li>Alarm frequency comparison (7d vs 30d)</li>
          </ul>
          <p className="mt-2 text-white/20">No recommendation is emitted without sufficient evidence.</p>
        </div>
      </GlassCard>
    </div>
  );
}
