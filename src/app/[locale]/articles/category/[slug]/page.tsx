import { notFound }              from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getArticlesByCategory_, getCategoryBySlug, getAllCategories, getArticleFeed } from "@/lib/articles/db";
import { ArticlesFeedClient }     from "@/components/articles/ArticlesFeedClient";
import { buildMetadata }          from "@/lib/seo/metadata";
import { categoryNameForLocale }  from "@/lib/articles/locale";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const cat = await getCategoryBySlug(slug);
  if (!cat) return { title: "Category Not Found", robots: { index: false, follow: false } };
  const t = await getTranslations({ locale, namespace: "journal" });
  // Phase 106: German is an active locale, so a /de category title used to fall
  // through to the English name. `categoryNameForLocale` owns the fallback.
  const name = categoryNameForLocale(cat, locale);
  return buildMetadata({
    locale,
    path:        `/articles/category/${slug}`,
    title:       t("meta.categoryTitle", { name }),
    description: cat.description ?? t("meta.categoryDescription", { name }),
  });
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
