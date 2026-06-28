import { setRequestLocale } from "next-intl/server";
import { getArticleFeed }   from "@/lib/articles/db";
import { ArticlesFeedClient } from "@/components/articles/ArticlesFeedClient";
import { buildMetadata }    from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return buildMetadata({
    locale,
    path:        "/articles/editors-picks",
    title:       locale === "fa"
      ? "انتخاب سردبیر — ژورنال صنعتی هرمس"
      : "Editor's Picks — Hermes Industrial Journal",
    description: locale === "fa"
      ? "بهترین مقالات تخصصی صنعتی انتخاب‌شده توسط هیئت تحریریه هرمس"
      : "Best industrial technical articles curated by the Hermes editorial team",
  });
}

export const dynamic = "force-dynamic";

export default async function EditorsPicksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const feed = await getArticleFeed();
  return <ArticlesFeedClient feed={feed} view="editors-picks" />;
}
