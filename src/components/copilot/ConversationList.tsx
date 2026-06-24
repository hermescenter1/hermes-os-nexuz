"use client";

import { useTranslations }   from "next-intl";
import { GlassCard }         from "@/components/ui/GlassCard";
import type { ConversationRecord } from "@/lib/copilot/types";

interface Props { conversations: ConversationRecord[] }

export default function ConversationList({ conversations }: Props) {
  const t = useTranslations("copilot");
  if (conversations.length === 0) {
    return (
      <GlassCard title="">
        <p className="text-ink/40 text-sm py-8 text-center">{t("noConversations")}</p>
      </GlassCard>
    );
  }
  return (
    <GlassCard title={t("conversations")}>
      <div className="divide-y divide-white/5">
        {conversations.map((c) => (
          <div key={c.id} className="px-4 py-3 hover:bg-white/5">
            <p className="text-ink text-sm font-medium">{c.title}</p>
            <p className="text-ink/30 text-xs mt-0.5">{new Date(c.updatedAt).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
