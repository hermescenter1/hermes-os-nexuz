import { setRequestLocale } from "next-intl/server";
import { getArticleFeed }   from "@/lib/articles/db";
import { ArticlesFeedClient } from "@/components/articles/ArticlesFeedClient";
import { buildMetadata }    from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return buildMetadata({
    locale,
    path:        "/articles/latest",
    title:       locale === "fa"
      ? "جدیدترین مقالات — ژورنال صنعتی هرمس"
      : "Latest Articles — Hermes Industrial Journal",
    description: locale === "fa"
      ? "آخرین مقالات تخصصی صنعتی منتشرشده در هرمس"
      : "Latest published industrial technical articles on Hermes",
  });
}

export const dynamic = "force-dynamic";

export default async function LatestPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const feed = await getArticleFeed();
  return <ArticlesFeedClient feed={feed} view="latest" />;
}
