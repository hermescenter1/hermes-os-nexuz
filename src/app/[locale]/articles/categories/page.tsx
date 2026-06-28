import { setRequestLocale } from "next-intl/server";
import { getAllCategories }  from "@/lib/articles/db";
import { buildMetadata }    from "@/lib/seo/metadata";
import Link                  from "next/link";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return buildMetadata({
    locale,
    path:        "/articles/categories",
    title:       locale === "fa"
      ? "دسته‌بندی مقالات — ژورنال صنعتی هرمس"
      : "Article Categories — Hermes Industrial Journal",
    description: locale === "fa"
      ? "مرور دسته‌بندی‌های تخصصی مقالات صنعتی در هرمس"
      : "Browse all industrial article categories on Hermes",
  });
}

export const dynamic = "force-dynamic";

export default async function CategoriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isFa       = locale === "fa";
  const categories = await getAllCategories();

  const maxCount = Math.max(...categories.map(c => c.articleCount ?? 0), 1);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="relative border-b border-line/30 overflow-hidden"
        style={{ background: "linear-gradient(180deg, rgba(30,200,164,0.05) 0%, rgba(6,8,13,0.98) 100%)" }}>
        <div className="absolute inset-0 pointer-events-none opacity-30"
          style={{ backgroundImage: "radial-gradient(rgba(30,200,164,0.14) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />

        <div className="relative max-w-5xl mx-auto px-6 py-12">
          <p className="eyebrow-mono text-signal text-[9px] mb-3 tracking-[0.2em]">
            {isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-ink mb-3">
            {isFa ? "دسته‌بندی‌های تخصصی" : "Industrial Categories"}
          </h1>
          <p className="text-muted text-sm">
            {isFa
              ? `${categories.length} دسته‌بندی تخصصی صنعتی`
              : `${categories.length} specialized industrial categories`}
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map(cat => {
            const pct = cat.articleCount ? (cat.articleCount / maxCount) * 100 : 0;
            return (
              <Link key={cat.id} href={`/${locale}/articles/category/${cat.slug}`}
                className="group flex flex-col gap-3 p-5 rounded-xl border border-line/40 hover:border-signal/20 bg-surface/60 hover:bg-surface2/40 hover:shadow-[0_0_20px_rgba(30,200,164,0.05)] transition-all duration-200 overflow-hidden">

                {/* Top indicator bar */}
                <div className="h-0.5 -mx-5 -mt-5 bg-gradient-to-r from-signal/30 to-transparent" />

                <div className="flex items-start justify-between gap-2 pt-1">
                  <h2 className="text-sm font-bold text-ink group-hover:text-signal transition-colors leading-snug">
                    {isFa ? cat.nameFa : cat.name}
                  </h2>
                  {cat.articleCount != null && (
                    <span className="text-[10px] font-bold font-mono text-signal shrink-0 bg-signal/8 border border-signal/15 px-2 py-0.5 rounded-full">
                      {cat.articleCount}
                    </span>
                  )}
                </div>

                {cat.description && (
                  <p className="text-xs text-muted leading-relaxed line-clamp-2">{cat.description}</p>
                )}

                {/* Article volume bar */}
                {cat.articleCount != null && cat.articleCount > 0 && (
                  <div className="h-0.5 rounded-full bg-surface3 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-signal/40 to-signal/10 transition-all"
                      style={{ width: `${pct}%` }} />
                  </div>
                )}

                <div className="flex items-center gap-1.5 mt-auto">
                  <span className="text-xs text-signal/70 group-hover:text-signal transition-colors font-mono">
                    {isFa ? "مشاهده مقالات" : "Browse articles"}
                  </span>
                  <svg viewBox="0 0 20 20" fill="currentColor"
                    className={`w-3 h-3 text-signal/60 group-hover:text-signal transition-all group-hover:translate-x-0.5 ${isFa ? "rotate-180" : ""}`}>
                    <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd"/>
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
