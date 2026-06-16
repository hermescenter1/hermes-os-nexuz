import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { PageIntro } from "@/components/PageIntro";
import { CaseExplorerClient } from "@/components/library/CaseExplorerClient";

export default async function CasesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("caseExplorer");

  return (
    <PageShell>
      <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
      <CaseExplorerClient />
    </PageShell>
  );
}
