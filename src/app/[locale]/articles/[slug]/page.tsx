import { notFound }              from "next/navigation";
import { setRequestLocale }       from "next-intl/server";
import { getArticleDetailBySlug, getArticleFeed, incrementArticleViewCount } from "@/lib/articles/db";
import { ArticleDetailClient }    from "@/components/articles/ArticleDetailClient";
import { buildMetadata }          from "@/lib/seo/metadata";
import { JsonLd }                 from "@/components/seo/JsonLd";
import { BASE_URL }               from "@/lib/seo/config";
import type { ArticleDetail }     from "@/lib/articles/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const article = await getArticleDetailBySlug(slug);
  if (!article || article.status !== "PUBLISHED" || article.visibility !== "PUBLIC") {
    return { title: "Article Not Found", robots: { index: false, follow: false } };
  }
  // Build canonical + hreflang URLs from the PERSISTED slug, never the raw route
  // param (which may be percent-encoded or NFD). Keeps one canonical URL per
  // article regardless of how the incoming request encoded the slug (Phase 83).
  return buildMetadata({
    locale,
    path:          `/articles/${article.slug}`,
    title:         article.seoTitle  ?? article.title,
    description:   article.seoDescription ?? article.excerpt ?? "",
    noIndex:       article.noIndex || article.status !== "PUBLISHED",
    ogImage:       article.ogImageUrl ?? undefined,
    ogType:        "article",
    publishedTime: article.publishedAt ?? undefined,
    modifiedTime:  article.updatedAt,
  });
}

export const dynamic = "force-dynamic";

function buildArticleJsonLd(article: ArticleDetail, locale: string) {
  return {
    "@context": "https://schema.org",
    "@type":    "Article",
    headline:   article.title,
    description: article.excerpt ?? "",
    author: {
      "@type": "Person",
      name:    article.author.displayName,
      url:     `${BASE_URL}/${locale}/articles/author/${article.author.handle}`,
    },
    publisher: {
      "@type": "Organization",
      name:    "Hermes Industrial Journal",
      url:     BASE_URL,
    },
    datePublished:  article.publishedAt ?? undefined,
    dateModified:   article.updatedAt,
    url:            `${BASE_URL}/${locale}/articles/${article.slug}`,
    inLanguage:     article.language === "FA" ? "fa" : "en",
    keywords:       article.tags.map(t => t.name).join(", "),
    articleSection: article.category?.name ?? undefined,
  };
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [article, feed] = await Promise.all([
    getArticleDetailBySlug(slug),
    getArticleFeed(),
  ]);

  if (!article || article.status !== "PUBLISHED" || article.visibility !== "PUBLIC") {
    notFound();
  }

  // Phase 75: Fire-and-forget view count increment.
  // Only reached after PUBLISHED + PUBLIC check above.
  // Errors are logged and swallowed — never blocks page render.
  incrementArticleViewCount(article.id).catch((e: unknown) => {
    console.error("[articles] viewCount increment failed:", e instanceof Error ? e.message : String(e));
  });

  // Related: same category, excluding current article, up to 3
  const related = feed.latest
    .filter(a => a.id !== article.id && a.category?.slug === article.category?.slug)
    .slice(0, 3);

  // Fallback to trending if no related
  const finalRelated = related.length > 0
    ? related
    : feed.trending.filter(a => a.id !== article.id).slice(0, 3);

  return (
    <>
      <JsonLd data={[buildArticleJsonLd(article, locale)]} />
      <ArticleDetailClient article={article} related={finalRelated} />
    </>
  );
}
