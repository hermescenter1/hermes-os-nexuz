import { notFound, permanentRedirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getArticleFeed, getArticleArchivePage } from "@/lib/articles/db";
import { archivePageHref, parseArchivePage } from "@/lib/articles/archive-page";
import { ArticlesFeedClient } from "@/components/articles/ArticlesFeedClient";
import { buildMetadata }    from "@/lib/seo/metadata";

type Params = Promise<{ locale: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { locale } = await params;
  const { page: rawPage } = await searchParams;
  const parsed = parseArchivePage(rawPage);
  const t = await getTranslations({ locale, namespace: "journal" });

  if (parsed.kind === "page") {
    // Each archive page is its own document: self-canonical, its own title,
    // and no hreflang — page N of /de lists different articles than page N of
    // /en, and may not exist at all.
    return buildMetadata({
      locale,
      path:           archivePageHref("/articles/latest", parsed.page),
      title:          `${t("meta.latestTitle")} — ${t("pagination.page", { page: parsed.page })}`,
      description:    t("meta.latestDescription"),
      contentLocales: [locale],
    });
  }

  return buildMetadata({
    locale,
    path:        "/articles/latest",
    title:       t("meta.latestTitle"),
    description: t("meta.latestDescription"),
  });
}

export const dynamic = "force-dynamic";

export default async function LatestPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const basePath = `/${locale}/articles/latest`;
  const parsed = parseArchivePage((await searchParams).page);
  if (parsed.kind === "invalid") notFound();
  if (parsed.kind === "explicitFirst") permanentRedirect(basePath);
  const page = parsed.kind === "page" ? parsed.page : 1;

  const [feed, archive] = await Promise.all([
    getArticleFeed(locale),
    getArticleArchivePage(locale, page),
  ]);

  if (archive === null) {
    // Database unavailable: the first page keeps the feed's own fallback; a
    // deeper page fails loudly (5xx) instead of answering 404 for a page that
    // may well exist.
    if (page > 1) throw new Error("Journal archive is unavailable");
    return <ArticlesFeedClient feed={feed} view="latest" />;
  }

  if (page > Math.max(archive.totalPages, 1)) notFound();

  return (
    <ArticlesFeedClient
      feed={{ ...feed, latest: archive.items }}
      view="latest"
      pagination={{ page, totalPages: archive.totalPages, total: archive.total, basePath }}
    />
  );
}
