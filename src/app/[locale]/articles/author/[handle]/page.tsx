import { notFound }            from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getAuthorProfile, getAuthorArticles } from "@/lib/articles/db";
import { AuthorProfileClient }  from "@/components/articles/AuthorProfileClient";
import { buildMetadata }        from "@/lib/seo/metadata";
import { JsonLd }               from "@/components/seo/JsonLd";
import { BASE_URL }             from "@/lib/seo/config";
import { isRetiredIdentityHandle } from "@/lib/seo/retired-identity";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>;
}) {
  const { locale, handle } = await params;
  const author = await getAuthorProfile(handle);
  if (!author || !author.isActive) {
    return { title: "Author Not Found", robots: { index: false, follow: false } };
  }
  const t = await getTranslations({ locale, namespace: "journal" });
  // A handle carrying the retired company identity stays reachable — the row is
  // real and its articles are real — but is never offered to an index. It also
  // emits no canonical and no hreflang: `alternates: {}` suppresses the values
  // the segment chain would otherwise inherit, so nothing advertises a retired
  // identity as a canonical representation of this author.
  if (isRetiredIdentityHandle(handle)) {
    return {
      title:     t("meta.authorProfileTitle", { name: author.displayName }),
      robots:    { index: false, follow: true, googleBot: { index: false, follow: true } },
      alternates: {},
    };
  }
  return buildMetadata({
    locale,
    path:        `/articles/author/${handle}`,
    title:       t("meta.authorProfileTitle", { name: author.displayName }),
    description: author.headline ?? author.bio?.slice(0, 160) ?? "",
  });
}

export const dynamic = "force-dynamic";

function buildPersonJsonLd(author: { displayName: string; handle: string; headline: string | null; expertiseAreas: string[] }, locale: string) {
  return {
    "@context":   "https://schema.org",
    "@type":      "Person",
    name:         author.displayName,
    description:  author.headline ?? "",
    url:          `${BASE_URL}/${locale}/articles/author/${author.handle}`,
    knowsAbout:   author.expertiseAreas,
  };
}

export default async function AuthorProfilePage({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>;
}) {
  const { locale, handle } = await params;
  setRequestLocale(locale);

  const [author, articles] = await Promise.all([
    getAuthorProfile(handle),
    getAuthorArticles(handle),
  ]);

  if (!author || !author.isActive) notFound();

  // Override the stale counter field with the real PUBLISHED + PUBLIC count.
  const authorWithRealCount = { ...author, articleCount: articles.length };

  // No `Person` entity is published for a retired identity: its `url` would be
  // a machine-readable claim that the retired name is a current public author.
  // The page still renders, so existing links do not break.
  const jsonLd = isRetiredIdentityHandle(handle) ? [] : [buildPersonJsonLd(author, locale)];

  return (
    <>
      {jsonLd.length > 0 && <JsonLd data={jsonLd} />}
      <AuthorProfileClient author={authorWithRealCount} articles={articles} />
    </>
  );
}
