import { useTranslations } from "next-intl";
import { GlassCard }       from "@/components/ui/GlassCard";

export default function InsightsPage() {
  const t = useTranslations("copilot");
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{t("insightsTitle")}</h1>
        <p className="text-white/50 text-sm mt-1">{t("insightsDesc")}</p>
      </div>
      <GlassCard title={t("insightsTitle")}>
        <p className="text-white/40 text-sm py-8 text-center">{t("noInsights")}</p>
      </GlassCard>
    </div>
  );
}
