import { useTranslations } from "next-intl";
import { GlassCard }       from "@/components/ui/GlassCard";

/**
 * RUL dashboard page — Phase 39.
 * Shows RUL model design; live data populated via /api/predictive/rul.
 */
export default function RULPage() {
  const t = useTranslations("predictive");
  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-signal">{t("eyebrow")}</p>
        <h1 className="text-2xl font-bold text-white mt-1">{t("remainingUsefulLife.title")}</h1>
        <p className="text-white/50 text-sm mt-1">{t("remainingUsefulLife.subtitle")}</p>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
        <p className="text-amber-300 text-sm">{t("safetyBanner")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GlassCard className="p-5 space-y-3">
          <p className="font-mono text-xs uppercase text-white/30">{t("remainingUsefulLife.range")}</p>
          <p className="text-white/50 text-sm">{t("remainingUsefulLife.subtitle")}</p>
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white/40">
            <p>RUL_point = (score − threshold) ÷ |degradationRate|</p>
            <p>range = [RUL × 0.70, RUL × 1.30]</p>
            <p>threshold = 20 · cap = 365 days</p>
          </div>
        </GlassCard>

        <GlassCard className="p-5 space-y-3">
          <p className="font-mono text-xs uppercase text-white/30">Special States</p>
          <div className="space-y-2 text-xs">
            {[
              { state: "no_degradation", color: "text-cyan-400",  desc: "Slope ≥ 0 — no deterioration detected" },
              { state: "at_threshold",   color: "text-red-400",   desc: "Score ≤ 20 — immediate inspection" },
              { state: "estimated",      color: "text-white/60",  desc: "Normal: min–max range provided" },
              { state: "insufficientData", color: "text-white/30", desc: "< 10 points or < 14 days history" },
            ].map((s) => (
              <div key={s.state} className="flex items-start gap-2">
                <span className={`font-mono shrink-0 ${s.color}`}>{s.state}</span>
                <span className="text-white/40">{s.desc}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-5">
        <p className="font-mono text-xs uppercase text-white/30 mb-3">{t("insufficientData.title")}</p>
        <p className="text-white/40 text-sm text-center py-6">{t("insufficientData.banner")}</p>
        <p className="text-white/20 font-mono text-xs text-center mt-2">
          Use GET /api/predictive/rul?assetId=xxx to retrieve per-asset estimates.
        </p>
      </GlassCard>
    </div>
  );
}
