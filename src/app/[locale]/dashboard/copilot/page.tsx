import { useTranslations }  from "next-intl";
import { GlassCard }        from "@/components/ui/GlassCard";

export default function CopilotPage() {
  const t = useTranslations("copilot");
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{t("title")}</h1>
        <p className="text-white/50 text-sm mt-1">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassCard title={t("queryTitle")}>
          <p className="text-white/40 text-sm px-4 pb-4">{t("queryDesc")}</p>
        </GlassCard>
        <GlassCard title={t("insightsTitle")}>
          <p className="text-white/40 text-sm px-4 pb-4">{t("insightsDesc")}</p>
        </GlassCard>
        <GlassCard title={t("recommendationsTitle")}>
          <p className="text-white/40 text-sm px-4 pb-4">{t("recommendationsDesc")}</p>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GlassCard title={t("safetyTitle")}>
          <div className="px-4 pb-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-white/60">
              <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
              {t("safetyReadOnly")}
            </div>
            <div className="flex items-center gap-2 text-sm text-white/60">
              <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
              {t("safetyDeterministic")}
            </div>
            <div className="flex items-center gap-2 text-sm text-white/60">
              <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
              {t("safetyNoLLM")}
            </div>
          </div>
        </GlassCard>
        <GlassCard title={t("intentsTitle")}>
          <div className="px-4 pb-4 text-white/40 text-xs font-mono space-y-1">
            <p>dependency_question</p>
            <p>health_question</p>
            <p>alarm_question</p>
            <p>kpi_question</p>
            <p>anomaly_question</p>
            <p>general_status_question</p>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
