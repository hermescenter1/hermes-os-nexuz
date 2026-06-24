import { useTranslations } from "next-intl";
import { GlassCard }       from "@/components/ui/GlassCard";

export default function CopilotPage() {
  const t = useTranslations("copilot");
  return (
    <div className="space-y-6 p-6 sm:p-8 max-w-7xl mx-auto">
      <div className="page-header-premium">
        <p className="eyebrow-label mb-2">Industrial AI</p>
        <h1 className="page-title" style={{ fontSize: "clamp(1.75rem,3vw,2.5rem)" }}>
          {t("title")}
        </h1>
        <p className="mt-2 text-base text-muted leading-relaxed max-w-2xl">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <GlassCard className="p-6 space-y-3">
          <p className="eyebrow-mono">{t("queryTitle")}</p>
          <p className="text-sm text-muted leading-relaxed">{t("queryDesc")}</p>
        </GlassCard>
        <GlassCard className="p-6 space-y-3">
          <p className="eyebrow-mono">{t("insightsTitle")}</p>
          <p className="text-sm text-muted leading-relaxed">{t("insightsDesc")}</p>
        </GlassCard>
        <GlassCard className="p-6 space-y-3">
          <p className="eyebrow-mono">{t("recommendationsTitle")}</p>
          <p className="text-sm text-muted leading-relaxed">{t("recommendationsDesc")}</p>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <GlassCard className="p-6 space-y-4">
          <p className="eyebrow-label">{t("safetyTitle")}</p>
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5 text-sm text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-signal flex-shrink-0" />
              {t("safetyReadOnly")}
            </div>
            <div className="flex items-center gap-2.5 text-sm text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-signal flex-shrink-0" />
              {t("safetyDeterministic")}
            </div>
            <div className="flex items-center gap-2.5 text-sm text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-signal flex-shrink-0" />
              {t("safetyNoLLM")}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-6 space-y-4">
          <p className="eyebrow-label">{t("intentsTitle")}</p>
          <div className="font-mono text-xs text-muted space-y-1.5">
            {[
              "dependency_question",
              "health_question",
              "alarm_question",
              "kpi_question",
              "anomaly_question",
              "general_status_question",
            ].map((intent) => (
              <div key={intent} className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-signal/50 flex-shrink-0" />
                {intent}
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
