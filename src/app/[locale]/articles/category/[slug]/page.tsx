import { notFound }              from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getArticlesByCategory_, getCategoryBySlug, getAllCategories, getArticleFeed } from "@/lib/articles/db";
import { ArticlesFeedClient }     from "@/components/articles/ArticlesFeedClient";
import { categoryNameForLocale }  from "@/lib/articles/locale";
import { taxonomyMetadata }       from "@/lib/seo/taxonomy-indexability";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const cat = await getCategoryBySlug(slug);
  const t = await getTranslations({ locale, namespace: "journal" });
  // Phase 106: German is an active locale, so a /de category title used to fall
  // through to the English name. `categoryNameForLocale` owns the fallback.
  const name = cat ? categoryNameForLocale(cat, locale) : "";
  // One call owns BOTH outcomes. A category archive is always noindex/follow in
  // this phase: `description` is a single non-localized column and the article
  // read falls back to other languages, so neither locale-specific editorial
  // copy nor a locale-specific article can be proven. An inactive category is
  // already absent here — `getAllCategories` filters `isActive: true` — so it
  // keeps the previous 404 and this module cannot widen availability. No article
  // count is read for metadata any more, which also removes a duplicate query.
  return taxonomyMetadata(
    { exists: Boolean(cat) },
    {
      notFoundTitle: "Category Not Found",
      title:         t("meta.categoryTitle", { name }),
      description:   cat?.description ?? t("meta.categoryDescription", { name }),
    },
  );
}

export const dynamic = "force-dynamic";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [cat, articles, categories, feed] = await Promise.all([
    getCategoryBySlug(slug),
    getArticlesByCategory_(slug, locale),
    getAllCategories(),
    getArticleFeed(locale),
  ]);

  if (!cat) notFound();

  const t    = await getTranslations({ locale, namespace: "journal" });

  // Build a feed object that filters to this category
  const catFeed = {
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
            {categoryNameForLocale(cat, locale)}
          </h1>
          {cat.description && (
            <p className="text-muted text-sm mt-1">{cat.description}</p>
          )}
          <p className="text-metadata text-xs mt-2">
            {articles.length} {t("articlesUnit")}
          </p>
        </div>
      </div>
      <ArticlesFeedClient feed={catFeed} view="latest" />
    </div>
  );
}
