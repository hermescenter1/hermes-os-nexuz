import { setRequestLocale } from "next-intl/server";
import { getArticleFeed }   from "@/lib/articles/db";
import { ArticlesFeedClient } from "@/components/articles/ArticlesFeedClient";
import { buildMetadata }    from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return buildMetadata({
    locale,
    path:        "/articles/trending",
    title:       locale === "fa"
      ? "مقالات پرطرفدار — ژورنال صنعتی هرمس"
      : "Trending Articles — Hermes Industrial Journal",
    description: locale === "fa"
      ? "محبوب‌ترین مقالات تخصصی صنعتی در هرمس"
      : "Most popular industrial technical articles on Hermes",
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
