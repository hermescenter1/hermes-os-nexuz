import { notFound }            from "next/navigation";
import { setRequestLocale }     from "next-intl/server";
import { getAuthorProfile, getAuthorArticles } from "@/lib/articles/db";
import { AuthorProfileClient }  from "@/components/articles/AuthorProfileClient";
import { buildMetadata }        from "@/lib/seo/metadata";
import { JsonLd }               from "@/components/seo/JsonLd";
import { BASE_URL }             from "@/lib/seo/config";

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
  return buildMetadata({
    locale,
    path:        `/articles/author/${handle}`,
    title:       locale === "fa"
      ? `${author.displayName} — متخصص صنعتی | ژورنال هرمس`
      : `${author.displayName} — Industrial Expert | Hermes Journal`,
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

  return (
    <>
      <JsonLd data={[buildPersonJsonLd(author, locale)]} />
      <AuthorProfileClient author={authorWithRealCount} articles={articles} />
    </>
  );
}
