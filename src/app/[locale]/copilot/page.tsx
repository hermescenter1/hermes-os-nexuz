import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell }     from "@/components/PageShell";
import { PageIntro }     from "@/components/PageIntro";
import { CopilotClient } from "@/components/copilot/CopilotClient";
import { buildMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({ locale, path: "/copilot", title: p.copilot.title, description: p.copilot.description, keywords: p.copilot.keywords });
}

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
