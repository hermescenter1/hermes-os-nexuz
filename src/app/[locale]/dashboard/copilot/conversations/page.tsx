import { useTranslations } from "next-intl";
import { GlassCard }       from "@/components/ui/GlassCard";

export default function ConversationsPage() {
  const t = useTranslations("copilot");
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{t("conversations")}</h1>
        <p className="text-white/50 text-sm mt-1">{t("conversationsDesc")}</p>
      </div>
      <GlassCard title="">
        <p className="text-white/40 text-sm py-8 text-center">{t("noConversations")}</p>
      </GlassCard>
    </div>
  );
}
