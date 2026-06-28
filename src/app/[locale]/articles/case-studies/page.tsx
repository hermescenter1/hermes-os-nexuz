import { setRequestLocale } from "next-intl/server";
import { getArticleFeed }   from "@/lib/articles/db";
import { ArticlesFeedClient } from "@/components/articles/ArticlesFeedClient";
import { buildMetadata }    from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return buildMetadata({
    locale,
    path:        "/articles/case-studies",
    title:       locale === "fa"
      ? "مطالعات موردی صنعتی — ژورنال صنعتی هرمس"
      : "Industrial Case Studies — Hermes Industrial Journal",
    description: locale === "fa"
      ? "مطالعات موردی واقعی از پروژه‌های صنعتی، اتوماسیون، نگهداشت و مدیریت دارایی"
      : "Real-world industrial project case studies covering automation, maintenance, and asset management",
  });
}

export const dynamic = "force-dynamic";

export default async function CaseStudiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const feed = await getArticleFeed();
  return <ArticlesFeedClient feed={feed} view="case-studies" />;
}
