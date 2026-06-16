import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { PageIntro } from "@/components/PageIntro";
import { CopilotClient } from "@/components/copilot/CopilotClient";

export default async function CopilotPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("copilot");

  return (
    <PageShell>
      <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
      <CopilotClient />
    </PageShell>
  );
}
