import { useTranslations } from "next-intl";
import { GlassCard }       from "@/components/ui/GlassCard";

/**
 * Asset Baselines dashboard — Phase 39.
 * Shows baseline computation design; live data from POST /api/predictive/baselines.
 */
export default function BaselinesPage() {
  const t = useTranslations("predictive");
  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-signal">{t("eyebrow")}</p>
        <h1 className="text-2xl font-bold text-white mt-1">{t("baselines.title")}</h1>
        <p className="text-white/50 text-sm mt-1">{t("baselines.subtitle")}</p>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
        <p className="text-amber-300 text-sm">{t("safetyBanner")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { days: "30", label: "30-day Baseline",  desc: "Short window for recent trend detection" },
          { days: "90", label: "90-day Baseline",  desc: "Standard window (recommended)" },
          { days: "180", label: "180-day Baseline", desc: "Long window for seasonal patterns" },
        ].map((w) => (
          <GlassCard key={w.days} className="p-5">
            <p className="text-3xl font-bold text-cyan-400 font-mono">{w.days}d</p>
            <p className="text-white font-semibold mt-1 text-sm">{w.label}</p>
            <p className="text-white/40 text-xs mt-1">{w.desc}</p>
          </GlassCard>
        ))}
      </div>

      <GlassCard className="p-5">
        <p className="font-mono text-xs uppercase text-white/30 mb-3">{t("baselines.noData")}</p>
        <p className="text-white/30 text-sm text-center py-6">{t("baselines.notEnoughData")}</p>
        <p className="text-white/20 font-mono text-xs text-center mt-2">
          POST /api/predictive/baselines {`{"assetId": "...", "windowDays": 90}`}
        </p>
      </GlassCard>

      <GlassCard className="p-5 space-y-3">
        <p className="font-mono text-xs uppercase text-white/30">{t("baselines.sampleCount")}</p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          {[
            ["Min Health Points",  "≥ 5 (data-sufficiency gate)"],
            ["Min History Span",   "≥ 7 days"],
            ["Metrics Included",   "Health, Efficiency, Availability, Alarm Rate"],
            ["Std Dev",            "Computed from health history for anomaly detection"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
              <p className="text-cyan-400 font-mono text-xs mb-0.5">{k}</p>
              <p className="text-white/40">{v}</p>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
