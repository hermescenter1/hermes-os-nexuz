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
  const tags  = await getAllTags();

  const maxCount = Math.max(...tags.map(t => t.articleCount ?? 0), 1);

  function tagSize(count: number | null | undefined): string {
    const pct = count ? count / maxCount : 0;
    if (pct > 0.7) return "text-base font-bold";
    if (pct > 0.4) return "text-sm font-semibold";
    if (pct > 0.15) return "text-sm font-medium";
    return "text-xs font-normal";
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="relative border-b border-line/30 overflow-hidden"
        style={{ background: "linear-gradient(180deg, rgba(30,200,164,0.05) 0%, rgba(6,8,13,0.98) 100%)" }}>
        <div className="absolute inset-0 pointer-events-none opacity-30"
          style={{ backgroundImage: "radial-gradient(rgba(30,200,164,0.14) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="absolute -top-8 end-0 w-48 h-48 rounded-full blur-[60px] pointer-events-none"
          style={{ background: "rgba(30,200,164,0.05)" }} />

        <div className="relative max-w-4xl mx-auto px-6 py-12">
          <p className="eyebrow-mono text-signal text-[9px] mb-3 tracking-[0.2em]">
            {isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-ink mb-3">
            {isFa ? "برچسب‌های تخصصی" : "Industrial Tags"}
          </h1>
          <p className="text-muted text-sm">
            {isFa
              ? `${tags.length} برچسب تخصصی صنعتی — اندازه بر اساس تعداد مقالات`
              : `${tags.length} specialized industrial tags — size indicates article count`}
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Section label */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-signal to-signal/20" />
          <p className="text-xs font-bold text-faint uppercase tracking-widest font-mono">
            {isFa ? "ابر برچسب‌ها" : "TAG CLOUD"}
          </p>
        </div>

        {/* Premium tag cloud */}
        <div className="flex flex-wrap gap-2.5 leading-[2.4]">
          {tags.map(tag => {
            const pct = tag.articleCount ? tag.articleCount / maxCount : 0;
            const opacity = 0.45 + pct * 0.55;
            return (
              <Link key={tag.id} href={`/${locale}/articles/tag/${tag.slug}`}
                className={`group inline-flex items-center gap-2 px-4 py-2 rounded-full border border-signal/20 bg-signal/5 hover:border-signal/40 hover:bg-signal/10 transition-all duration-200 ${tagSize(tag.articleCount)}`}
                style={{ opacity }}>
                <span className="text-ink group-hover:text-signal transition-colors">
                  {isFa ? (tag.nameFa ?? tag.name) : tag.name}
                </span>
                {tag.articleCount != null && tag.articleCount > 0 && (
                  <span className="text-[10px] font-mono text-faint group-hover:text-signal/70 transition-colors shrink-0">
                    {tag.articleCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
