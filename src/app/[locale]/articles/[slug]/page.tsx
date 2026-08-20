import { notFound }              from "next/navigation";
import { setRequestLocale }       from "next-intl/server";
import { getCurrentUser }         from "@/lib/auth/session";
import { can }                    from "@/lib/auth/roles";
import { getReactionSummary, isArticleSaved, listArticleComments } from "@/lib/articles/engagement";
import { getArticleDetailBySlug, getArticleFeed, incrementArticleViewCount } from "@/lib/articles/db";
import { ArticleDetailClient }    from "@/components/articles/ArticleDetailClient";
import { buildMetadata }          from "@/lib/seo/metadata";
import { JsonLd }                 from "@/components/seo/JsonLd";
import { BASE_URL }               from "@/lib/seo/config";
import { langTagForArticleLanguage } from "@/lib/articles/locale";
import { getPublicArticleLanguagesBySlug, resolveArticleContentLocales } from "@/lib/articles/seo";
import type { ArticleDetail }     from "@/lib/articles/types";

/**
 * Site-relative cover path -> absolute URL, or undefined when there is no
 * cover so `buildMetadata` falls back to the brand OG image as before.
 */
function absoluteCover(coverImageUrl: string | null): string | undefined {
  if (!coverImageUrl) return undefined;
  return coverImageUrl.startsWith("/") ? `${BASE_URL}${coverImageUrl}` : coverImageUrl;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  // Phase 106: resolve the edition this locale reads, so the title, description
  // and og: fields describe the page that is actually served — not a sibling
  // translation that happened to be found first.
  //
  // Phase 106B: the translation group is read ALONGSIDE it, not after it. Both
  // reads normalise the same route slug, so they address the same group without
  // the second one waiting on the first.
  const [article, groupLocales] = await Promise.all([
    getArticleDetailBySlug(slug, locale),
    getPublicArticleLanguagesBySlug(slug),
  ]);
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
    // An explicit ogImageUrl still wins. Otherwise the author's cover becomes
    // the social preview — absolutised, because OG_IMAGE_URL (the fallback
    // buildMetadata applies when this is undefined) is an absolute URL and
    // crawlers will not resolve a site-relative one.
    ogImage:       article.ogImageUrl ?? absoluteCover(article.coverImageUrl),
    ogType:        "article",
    publishedTime: article.publishedAt ?? undefined,
    modifiedTime:  article.updatedAt,
    // WHICH TRANSLATIONS THIS TOPIC REALLY HAS — DISCOVERY-2A's RULE, PHASE 106's
    // DATA MODEL.
    //
    // DISCOVERY-2A established the rule and it has not changed: hreflang is a
    // factual claim about the DOCUMENT, so a page may only advertise editions
    // that exist. At that time it was also true that `Article.slug` was globally
    // unique, that `ArtLanguage` was EN | FA, and that a translation therefore
    // could not exist — so the rule was implemented as `[article.language]`.
    //
    // Phase 106 invalidated those *facts* (not the rule): uniqueness moved to
    // `@@unique([slug, language])`, `ArtLanguage` gained DE, and one slug now
    // identifies a translation GROUP of up to three persisted editions. The
    // scalar kept claiming "no siblings exist" for topics that have two, which
    // is how 50 genuinely trilingual topics shipped with hreflang = NONE.
    //
    // The set now comes from the database: the served edition's own language,
    // plus every sibling edition that is PUBLISHED, PUBLIC and indexable. A
    // legacy single-language topic still yields exactly one locale and therefore
    // still emits no alternates at all.
    contentLocales: resolveArticleContentLocales({
      requestedLocale: locale,
      servedLanguage:  article.language,
      siblingLocales:  groupLocales,
    }),
  });
}

export const dynamic = "force-dynamic";

function buildArticleJsonLd(article: ArticleDetail, locale: string) {
  return {
    "@context": "https://schema.org",
    "@type":    "Article",
    headline:   article.title,
    description: article.excerpt ?? "",
    // Absolute, per schema.org. Dropped from the emitted JSON when the article
    // has no cover — an Article without `image` is valid, an Article with a
    // broken relative one is not.
    image:      absoluteCover(article.coverImageUrl),
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
    // The language the article is WRITTEN IN, from the row — not the route
    // locale, and no longer an EN-or-FA guess that silently mislabelled German.
    inLanguage:     langTagForArticleLanguage(article.language),
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
    getArticleDetailBySlug(slug, locale),
    getArticleFeed(locale),
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

  // Engagement is loaded on the server so the discussion is in the first paint
  // and is indexable. `getCurrentUser` is wrapped because an unauthenticated or
  // unconfigured auth context must leave the PUBLIC article fully readable —
  // the conversation is a public read, only posting needs a session.
  let viewerUser: { id: string; role?: string } | null = null;
  try {
    viewerUser = await getCurrentUser();
  } catch { /* anonymous reader */ }

  // Three bounded reads in parallel. `isArticleSaved` is a single lookup on the
  // ArticleSave composite key and returns false for an anonymous reader without
  // touching the database at all.
  const [reactions, comments, saved] = await Promise.all([
    getReactionSummary(article.id, viewerUser?.id ?? null),
    listArticleComments(article.id),
    isArticleSaved(article.id, viewerUser?.id ?? null),
  ]);

  return (
    <>
      <JsonLd data={[buildArticleJsonLd(article, locale)]} />
      <ArticleDetailClient
        article={article}
        related={finalRelated}
        engagement={{
          reactions,
          comments,
          saved,
          viewer: viewerUser
            // `isModerator` is the same `admin` capability the review endpoints
            // use, resolved on the server — the client is told what it may do,
            // it never asserts it.
            ? { id: viewerUser.id, isModerator: can(viewerUser.role as never, "admin") }
            : null,
        }}
      />
    </>
  );
}
