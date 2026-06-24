import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell }    from "@/components/PageShell";
import { PageIntro }    from "@/components/PageIntro";
import { BrainClient }  from "@/components/brain/BrainClient";
import { buildMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({ locale, path: "/brain", title: p.brain.title, description: p.brain.description, keywords: p.brain.keywords });
}

export default async function BrainPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("brain");

  return (
    <PageShell>
      <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
      <BrainClient />
    </PageShell>
  );
}
