import { setRequestLocale, getTranslations } from "next-intl/server";
import { getArticleFeed }   from "@/lib/articles/db";
import { ArticlesFeedClient } from "@/components/articles/ArticlesFeedClient";
import { buildMetadata }    from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "journal" });
  return buildMetadata({
    locale,
    path:        "/articles/trending",
    title:       t("meta.trendingTitle"),
    description: t("meta.trendingDescription"),
  });
}

export const dynamic = "force-dynamic";

export default async function TrendingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const feed = await getArticleFeed();
  return <ArticlesFeedClient feed={feed} view="trending" />;
}
