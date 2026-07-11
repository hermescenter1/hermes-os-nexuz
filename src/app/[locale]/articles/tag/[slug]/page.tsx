import { notFound }              from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getArticlesByTag_, getTagBySlug, getAllCategories, getArticleFeed } from "@/lib/articles/db";
import { ArticlesFeedClient }     from "@/components/articles/ArticlesFeedClient";
import { buildMetadata }          from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const tag = await getTagBySlug(slug);
  if (!tag) return { title: "Tag Not Found", robots: { index: false, follow: false } };
  const t = await getTranslations({ locale, namespace: "journal" });
  const name = locale === "fa" ? (tag.nameFa ?? tag.name) : tag.name;
  return buildMetadata({
    locale,
    path:        `/articles/tag/${slug}`,
    title:       t("meta.tagTitle", { name }),
    description: t("meta.tagDescription", { name }),
  });
}

export const dynamic = "force-dynamic";

export default async function TagPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [tag, articles, categories, feed] = await Promise.all([
    getTagBySlug(slug),
    getArticlesByTag_(slug),
    getAllCategories(),
    getArticleFeed(),
  ]);

  if (!tag) notFound();

  const isFa = locale === "fa";
  const t    = await getTranslations({ locale, namespace: "journal" });

  const tagFeed = {
    ...feed,
    featured: articles[0] ?? null,
    editorsPicks: articles.slice(0, 6),
    trending: [...articles].sort((a, b) => b.viewCount - a.viewCount).slice(0, 8),
    latest: articles,
    caseStudies: articles.filter(a => a.contentType === "INDUSTRIAL_CASE_STUDY"),
    categories,
    totalArticles: articles.length,
  };

  return (
    <div>
      <div className="border-b border-line/50 bg-surface/60 backdrop-blur-sm">
        <div className="max-w-[1400px] mx-auto px-6 py-6">
          <p className="eyebrow-mono text-signal text-[10px] mb-1">
            {t("brandUpper")}
          </p>
          <h1 className="text-2xl font-bold text-ink">
            #{isFa ? (tag.nameFa ?? tag.name) : tag.name}
          </h1>
          <p className="text-faint text-xs mt-2">
            {articles.length} {t("articlesUnit")}
          </p>
        </div>
      </div>
      <ArticlesFeedClient feed={tagFeed} view="latest" />
    </div>
  );
}
