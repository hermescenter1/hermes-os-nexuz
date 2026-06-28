import { setRequestLocale } from "next-intl/server";
import { getAllTags }        from "@/lib/articles/db";
import { buildMetadata }    from "@/lib/seo/metadata";
import Link                  from "next/link";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return buildMetadata({
    locale,
    path:        "/articles/tags",
    title:       locale === "fa"
      ? "برچسب‌های مقالات — ژورنال صنعتی هرمس"
      : "Article Tags — Hermes Industrial Journal",
    description: locale === "fa"
      ? "مرور برچسب‌های تخصصی مقالات صنعتی در هرمس"
      : "Browse all industrial article tags on Hermes",
  });
}

export const dynamic = "force-dynamic";

export default async function TagsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isFa = locale === "fa";
  const tags = await getAllTags();

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-line/50 bg-surface/60 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <p className="eyebrow-mono text-signal text-[10px] mb-2">
            {isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
          </p>
          <h1 className="text-3xl font-bold text-ink">
            {isFa ? "برچسب‌های تخصصی" : "Industrial Tags"}
          </h1>
          <p className="text-muted text-sm mt-2">
            {isFa ? `${tags.length} برچسب تخصصی` : `${tags.length} specialized tags`}
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex flex-wrap gap-3">
          {tags.map(tag => (
            <Link key={tag.id} href={`/${locale}/articles/tag/${tag.slug}`}
              className="group flex items-center gap-2 px-4 py-2 rounded-xl border border-line/60 hover:border-signal/40 bg-surface hover:bg-surface2/40 transition-all">
              <span className="text-sm text-muted group-hover:text-ink transition-colors">
                {isFa ? (tag.nameFa ?? tag.name) : tag.name}
              </span>
              {tag.articleCount && (
                <span className="text-[10px] font-mono text-faint bg-surface3 px-1.5 py-0.5 rounded">
                  {tag.articleCount}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
