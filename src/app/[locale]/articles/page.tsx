import { setRequestLocale }    from "next-intl/server";
import { getArticleFeed }       from "@/lib/articles/db";
import { ArticlesFeedClient }   from "@/components/articles/ArticlesFeedClient";
import { buildMetadata }        from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return buildMetadata({
    locale,
    path:        "/articles",
    title:       locale === "fa"
      ? "ژورنال صنعتی و شبکه متخصصان هرمس"
      : "Hermes Industrial Journal & Expert Network",
    description: locale === "fa"
      ? "پلتفرم نشر تخصصی صنعتی هرمس — مقالات فنی، مطالعات موردی، و شبکه متخصصان صنعتی"
      : "Hermes industrial knowledge publishing platform — technical articles, case studies, and expert network for automation and engineering professionals",
    keywords: locale === "fa"
      ? "ژورنال صنعتی، اتوماسیون، PLC، SCADA، مهندسی برق، نگهداری و تعمیرات"
      : "industrial journal, automation, PLC, SCADA, electrical engineering, maintenance, CMMS",
  });
}

export const dynamic = "force-dynamic";

export default async function ArticlesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const feed = await getArticleFeed();
  return <ArticlesFeedClient feed={feed} view="feed" />;
}
