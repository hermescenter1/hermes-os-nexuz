import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell }          from "@/components/PageShell";
import { PageIntro }          from "@/components/PageIntro";
import { CaseExplorerClient } from "@/components/library/CaseExplorerClient";
import { buildMetadata }      from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({ locale, path: "/library/cases", title: p.libraryCases.title, description: p.libraryCases.description, keywords: p.libraryCases.keywords });
}

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
