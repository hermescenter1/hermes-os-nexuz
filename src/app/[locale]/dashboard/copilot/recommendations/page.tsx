import { useTranslations } from "next-intl";
import { GlassCard }       from "@/components/ui/GlassCard";

export default function RecommendationsPage() {
  const t = useTranslations("copilot");
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{t("recommendationsTitle")}</h1>
        <p className="text-white/50 text-sm mt-1">{t("recommendationsDesc")}</p>
      </div>
      <GlassCard title={t("recommendationsTitle")}>
        <p className="text-white/40 text-sm py-8 text-center">{t("noRecommendations")}</p>
      </GlassCard>
    </div>
  );
}
