import { notFound }              from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getArticlesByTag_, getTagBySlug, getAllCategories, getArticleFeed } from "@/lib/articles/db";
import { ArticlesFeedClient }     from "@/components/articles/ArticlesFeedClient";
import { taxonomyMetadata }       from "@/lib/seo/taxonomy-indexability";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const tag = await getTagBySlug(slug);
  const t = await getTranslations({ locale, namespace: "journal" });
  const name = tag ? (locale === "fa" ? (tag.nameFa ?? tag.name) : tag.name) : "";
  // One call owns BOTH outcomes, so there is no second path by which a tag page
  // could acquire a canonical or an hreflang set. `ArticleTag` has no
  // description column, so a tag archive can never prove editorial copy of its
  // own and is always noindex/follow; a missing tag keeps the previous 404
  // metadata. The policy module holds the reasoning and the exact shapes.
  return taxonomyMetadata(
    { exists: Boolean(tag) },
    {
      notFoundTitle: "Tag Not Found",
      title:         t("meta.tagTitle", { name }),
      description:   t("meta.tagDescription", { name }),
    },
  );
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
    getArticlesByTag_(slug, locale),
    getAllCategories(),
    getArticleFeed(locale),
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
          <p className="text-metadata text-xs mt-2">
            {articles.length} {t("articlesUnit")}
          </p>
        </div>
      </div>
      <ArticlesFeedClient feed={tagFeed} view="latest" />
    </div>
  );
}
