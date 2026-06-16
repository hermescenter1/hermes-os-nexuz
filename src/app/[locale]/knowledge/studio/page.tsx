export const dynamic = "force-dynamic";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { PageIntro } from "@/components/PageIntro";
import { KnowledgeStudioClient } from "@/components/knowledge/KnowledgeStudioClient";
import { RequireCapability } from "@/components/auth/RequireCapability";

export default async function KnowledgeStudioPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("knowledgeStudio");

  return (
    <RequireCapability capability="authoring">
      <PageShell>
        <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
        <KnowledgeStudioClient />
      </PageShell>
    </RequireCapability>
  );
}
