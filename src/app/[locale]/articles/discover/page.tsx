import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import {
  getAllCategories,
  getAllTags,
  searchDiscoveryArticles,
  searchDiscoveryExperts,
  type DiscoveryExpert,
} from "@/lib/articles/db";
import { buildMetadata } from "@/lib/seo/metadata";
import type { ArticleListItem, ArticleCategory, ArticleTag } from "@/lib/articles/types";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return buildMetadata({
    locale,
    path: "/articles/discover",
    title: locale === "fa"
      ? "کشف صنعتی — ژورنال صنعتی هرمس"
      : "Industrial Discovery — Hermes Industrial Journal",
    description: locale === "fa"
      ? "جستجوی مقاله‌ها و متخصصان صنعتی هرمس با فیلترهای پیشرفته"
      : "Search articles and experts on Hermes Industrial Journal with advanced filters",
  });
}

export const dynamic = "force-dynamic";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeParam(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 80) : "";
}

function buildTabUrl(base: URLSearchParams, tab: string) {
  const p = new URLSearchParams(base);
  p.set("tab", tab);
  return "?" + p.toString();
}

function buildClearUrl(locale: string) {
  return `/${locale}/articles/discover`;
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function fmtDate(d: string | null | undefined, isFa = false) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(isFa ? "fa-IR" : "en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch { return d.slice(0, 10); }
}

const CONTENT_TYPE_LABELS: Record<string, { en: string; fa: string }> = {
  TECHNICAL_ARTICLE:        { en: "Technical Article",   fa: "مقاله فنی" },
  INDUSTRIAL_CASE_STUDY:    { en: "Case Study",          fa: "مطالعه موردی" },
  TROUBLESHOOTING_REPORT:   { en: "Troubleshooting",     fa: "عیب‌یابی" },
  PROJECT_REPORT:           { en: "Project Report",      fa: "گزارش پروژه" },
  MAINTENANCE_INSIGHT:      { en: "Maintenance",         fa: "تعمیرات" },
  PLC_SCADA_TUTORIAL:       { en: "PLC/SCADA",           fa: "PLC/SCADA" },
  FAILURE_ANALYSIS:         { en: "Failure Analysis",    fa: "تحلیل خرابی" },
  ASSET_RELIABILITY_NOTE:   { en: "Reliability",         fa: "قابلیت اطمینان" },
  ENGINEERING_OPINION:      { en: "Opinion",             fa: "دیدگاه" },
  RESEARCH_SUMMARY:         { en: "Research",            fa: "پژوهش" },
  FIELD_COMMISSIONING_NOTE: { en: "Commissioning",       fa: "راه‌اندازی" },
  SAFETY_COMPLIANCE_NOTE:   { en: "Safety",              fa: "ایمنی" },
};

// ── Sub-components (server-only) ──────────────────────────────────────────────

function ArticleCard({ article, isFa, locale }: {
  article: ArticleListItem; isFa: boolean; locale: string;
}) {
  const categoryLabel = isFa
    ? article.category?.nameFa ?? article.category?.name
    : article.category?.name;
  const ctLabel = article.contentType
    ? (isFa
        ? CONTENT_TYPE_LABELS[article.contentType]?.fa
        : CONTENT_TYPE_LABELS[article.contentType]?.en) ?? article.contentType
    : null;
  return (
    <article className="group p-4 rounded-xl border border-line/40 hover:border-signal/20 bg-surface/50 hover:bg-surface2/40 transition-all">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {categoryLabel && (
            <span className="inline-block text-[9px] px-1.5 py-0.5 rounded border border-signal/20 bg-signal/[0.06] text-signal font-mono uppercase tracking-wider">
              {categoryLabel}
            </span>
          )}
          {ctLabel && (
            <span className="inline-block text-[9px] px-1.5 py-0.5 rounded border border-ice/20 bg-ice/[0.06] text-ice font-mono uppercase tracking-wider">
              {ctLabel}
            </span>
          )}
          {article.language === "FA" && (
            <span className="inline-block text-[9px] px-1.5 py-0.5 rounded border border-line/30 bg-surface3 text-muted font-mono">
              FA
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-faint font-mono shrink-0">
          <span>{fmtNum(article.viewCount)} {isFa ? "بازدید" : "views"}</span>
          <span>{fmtNum(article.reactionCount)} {isFa ? "واکنش" : "react"}</span>
        </div>
      </div>
      <Link href={`/${locale}/articles/${article.slug}`}
        className="block group-hover:text-signal transition-colors">
        <h3 className="text-sm font-bold text-ink group-hover:text-signal line-clamp-2 mb-1.5">
          {article.title}
        </h3>
      </Link>
      {article.excerpt && (
        <p className="text-xs text-muted line-clamp-2 mb-3">{article.excerpt}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {article.author.avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={article.author.avatarUrl} alt="" width={20} height={20}
              className="w-5 h-5 rounded-md object-cover border border-signal/20" aria-hidden="true" />
          ) : (
            <div className="w-5 h-5 rounded-md bg-signal/20 flex items-center justify-center text-[9px] font-bold text-signal" aria-hidden="true">
              {article.author.displayName.charAt(0)}
            </div>
          )}
          <Link href={`/${locale}/articles/author/${article.author.handle}`}
            className="text-[10px] text-muted hover:text-signal transition-colors font-medium">
            {article.author.displayName}
          </Link>
        </div>
        <span className="text-[10px] text-faint font-mono">
          {article.publishedAt ? fmtDate(article.publishedAt, isFa) : ""}
        </span>
      </div>
    </article>
  );
}

function ExpertCard({ expert, isFa, locale }: {
  expert: DiscoveryExpert; isFa: boolean; locale: string;
}) {
  return (
    <Link href={`/${locale}/articles/author/${expert.handle}`}
      className="group flex gap-4 p-4 rounded-xl border border-line/40 hover:border-signal/20 bg-surface/50 hover:bg-surface2/40 transition-all">
      {expert.avatarUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={expert.avatarUrl} alt={`${expert.displayName} profile photo`} width={48} height={48}
          className="w-12 h-12 rounded-xl object-cover border border-signal/20 shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-signal/30 to-ice/20 border border-signal/20 flex items-center justify-center text-lg font-bold text-signal shrink-0">
          {expert.displayName.charAt(0)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div>
            <p className="text-sm font-bold text-ink group-hover:text-signal transition-colors">
              {expert.displayName}
            </p>
            <p className="text-[10px] text-faint font-mono">@{expert.handle}</p>
          </div>
          {expert.verifiedExpert && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border border-signal/20 bg-signal/[0.06] text-signal font-mono shrink-0">
              {isFa ? "تایید شده" : "Verified"}
            </span>
          )}
        </div>
        {(expert.headline || expert.roleTitle) && (
          <p className="text-[10px] text-muted truncate mb-1.5">
            {expert.headline ?? expert.roleTitle}
          </p>
        )}
        {expert.expertiseAreas.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {expert.expertiseAreas.slice(0, 3).map(area => (
              <span key={area} className="text-[8px] px-1.5 py-0.5 rounded bg-surface3 text-muted border border-line/30 font-mono">
                {area}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 text-[9px] text-faint font-mono flex-wrap">
          <span className="text-signal font-semibold">
            {expert.publishedCount} {isFa ? "مقاله" : "pub"}
          </span>
          <span className="text-line">·</span>
          <span>{fmtNum(expert.totalViews)} {isFa ? "بازدید" : "views"}</span>
          {expert.latestPublishedAt && (
            <>
              <span className="text-line">·</span>
              <span>{fmtDate(expert.latestPublishedAt, isFa)}</span>
            </>
          )}
        </div>
        <div className="flex gap-1.5 mt-1.5 flex-wrap">
          <span className="text-[8px] px-1.5 py-0.5 rounded border border-signal/20 bg-signal/[0.04] text-signal font-mono">
            {isFa ? "نویسنده منتشرشده" : "Published Author"}
          </span>
          {expert.verifiedExpert && (
            <span className="text-[8px] px-1.5 py-0.5 rounded border border-ice/20 bg-ice/[0.04] text-ice font-mono">
              {isFa ? "متخصص تایید شده" : "Verified Expert"}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ isFa }: { isFa: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-xl border border-line/30 bg-surface/20">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-10 h-10 text-faint mb-3" aria-hidden="true">
        <circle cx="11" cy="11" r="8" strokeWidth="1.5"/>
        <path d="m21 21-4.35-4.35" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <p className="text-sm font-semibold text-muted mb-1">
        {isFa ? "نتیجه‌ای یافت نشد" : "No results found"}
      </p>
      <p className="text-xs text-faint">
        {isFa ? "فیلترها را تغییر دهید یا واژه دیگری جستجو کنید" : "Try adjusting your filters or search term"}
      </p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

interface SearchParams {
  q?:        string;
  category?: string;
  tag?:      string;
  lang?:     string;
  type?:     string;
  sort?:     string;
  tab?:      string;
}

export default async function DiscoverPage({
  params,
  searchParams,
}: {
  params:       Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isFa = locale === "fa";

  const sp          = await searchParams;
  const q           = sanitizeParam(sp.q);
  const categorySlug = sanitizeParam(sp.category) || undefined;
  const tagSlug      = sanitizeParam(sp.tag)      || undefined;
  const lang         = sanitizeParam(sp.lang)     || undefined;
  const contentType  = sanitizeParam(sp.type)     || undefined;
  const rawSort      = sanitizeParam(sp.sort);
  const tab          = sp.tab === "experts" ? "experts" : "articles";

  const articleSort = (rawSort === "views" || rawSort === "reactions" || rawSort === "latest")
    ? rawSort as "latest" | "views" | "reactions"
    : "latest";
  const expertSort = (rawSort === "views" || rawSort === "published" || rawSort === "latest")
    ? rawSort as "latest" | "views" | "published"
    : "views";

  const [categories, tags, articles, experts] = await Promise.all([
    getAllCategories(),
    getAllTags(),
    searchDiscoveryArticles({ q: q || undefined, category: categorySlug, tag: tagSlug, language: lang, contentType, sort: articleSort, limit: 20 }),
    searchDiscoveryExperts({ q: q || undefined, expertise: tagSlug, sort: expertSort, limit: 12 }),
  ]);

  // Build URLSearchParams for tab-switching links (preserves other filters)
  const currentParams = new URLSearchParams();
  if (q)            currentParams.set("q",        q);
  if (categorySlug) currentParams.set("category", categorySlug);
  if (tagSlug)      currentParams.set("tag",      tagSlug);
  if (lang)         currentParams.set("lang",     lang);
  if (contentType)  currentParams.set("type",     contentType);
  if (rawSort)      currentParams.set("sort",     rawSort);

  const hasFilters = !!(q || categorySlug || tagSlug || lang || contentType || rawSort);

  const T = {
    title:        isFa ? "کشف صنعتی"                     : "Industrial Discovery",
    subtitle:     isFa ? "جستجوی مقاله‌ها و متخصصان"    : "Search articles and experts",
    placeholder:  isFa ? "جستجو کنید..."                  : "Search articles, experts…",
    searchBtn:    isFa ? "جستجو"                          : "Search",
    clearBtn:     isFa ? "پاک‌کردن فیلترها"               : "Clear Filters",
    tabArticles:  isFa ? "مقاله‌ها"                       : "Articles",
    tabExperts:   isFa ? "متخصصان"                        : "Experts",
    filterLabel:  isFa ? "فیلترها"                        : "Filters",
    catLabel:     isFa ? "دسته‌بندی"                      : "Category",
    catAll:       isFa ? "همه دسته‌ها"                    : "All Categories",
    tagLabel:     isFa ? "برچسب / حوزه تخصص"             : "Tag / Expertise",
    tagAll:       isFa ? "همه برچسب‌ها"                   : "All Tags",
    langLabel:    isFa ? "زبان"                           : "Language",
    langAll:      isFa ? "همه زبان‌ها"                    : "All Languages",
    langEn:       isFa ? "انگلیسی"                        : "English",
    langFa:       isFa ? "فارسی"                         : "Persian",
    typeLabel:    isFa ? "نوع محتوا"                      : "Content Type",
    typeAll:      isFa ? "همه انواع"                       : "All Types",
    sortLabel:    isFa ? "مرتب‌سازی"                      : "Sort",
    sortLatest:   isFa ? "جدیدترین"                       : "Latest",
    sortViews:    isFa ? "پربازدیدترین"                   : "Most Viewed",
    sortReact:    isFa ? "پربازخوردترین"                  : "Most Reacted",
    sortPub:      isFa ? "بیشترین انتشار"                 : "Most Published",
    results:      (n: number) => isFa ? `${n} نتیجه` : `${n} result${n === 1 ? "" : "s"}`,
  };

  const articleSortOptions = [
    { value: "latest",    label: T.sortLatest },
    { value: "views",     label: T.sortViews },
    { value: "reactions", label: T.sortReact },
  ];
  const expertSortOptions = [
    { value: "views",     label: T.sortViews },
    { value: "published", label: T.sortPub },
    { value: "latest",    label: T.sortLatest },
  ];
  const sortOptions = tab === "experts" ? expertSortOptions : articleSortOptions;

  return (
    <div className="min-h-screen">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="relative border-b border-line/30 overflow-hidden"
        style={{ background: "linear-gradient(180deg, rgba(30,200,164,0.06) 0%, rgba(6,8,13,0.98) 100%)" }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: "radial-gradient(rgba(30,200,164,0.12) 1px, transparent 1px)", backgroundSize: "28px 28px", opacity: 0.3 }} />
        <div className="absolute -top-24 end-12 w-80 h-80 rounded-full blur-[100px] pointer-events-none"
          style={{ background: "rgba(100,180,255,0.05)" }} />
        <div className="relative max-w-5xl mx-auto px-6 py-10">
          <p className="eyebrow-mono text-signal text-[9px] mb-2 tracking-[0.2em]">
            {isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
          </p>
          <h1 className="text-2xl font-bold text-ink mb-1">{T.title}</h1>
          <p className="text-xs text-muted">{T.subtitle}</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
        {/* ── Search + Filters Form ─────────────────────────────────────── */}
        <form method="GET" action={`/${locale}/articles/discover`} className="space-y-3">
          <input type="hidden" name="tab" value={tab} />

          {/* Search bar */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <svg viewBox="0 0 20 20" fill="currentColor"
                className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none ${isFa ? "end-3" : "start-3"}`}
                aria-hidden="true">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd"/>
              </svg>
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder={T.placeholder}
                maxLength={80}
                autoComplete="off"
                className={`w-full h-10 rounded-xl border border-line/50 bg-surface/80 text-ink text-sm placeholder:text-faint focus:outline-none focus:border-signal/40 focus:ring-1 focus:ring-signal/20 transition-all ${isFa ? "pe-10 ps-4 text-right" : "ps-10 pe-4"}`}
              />
            </div>
            <button type="submit"
              className="px-5 h-10 rounded-xl bg-signal/10 border border-signal/30 text-signal text-sm font-semibold hover:bg-signal/15 transition-all shrink-0">
              {T.searchBtn}
            </button>
          </div>

          {/* Filter row */}
          <div className={`flex flex-wrap gap-2 items-center ${isFa ? "flex-row-reverse" : ""}`}>
            <span className="text-[10px] text-faint font-mono uppercase tracking-wider shrink-0">
              {T.filterLabel}:
            </span>

            {/* Category */}
            <select name="category" defaultValue={categorySlug ?? ""}
              className="h-8 rounded-lg border border-line/40 bg-surface/80 text-xs text-ink font-mono px-2 focus:outline-none focus:border-signal/30 transition-all">
              <option value="">{T.catAll}</option>
              {(categories as ArticleCategory[]).map(c => (
                <option key={c.id} value={c.slug}>
                  {isFa ? c.nameFa : c.name}
                </option>
              ))}
            </select>

            {/* Tag */}
            <select name="tag" defaultValue={tagSlug ?? ""}
              className="h-8 rounded-lg border border-line/40 bg-surface/80 text-xs text-ink font-mono px-2 focus:outline-none focus:border-signal/30 transition-all">
              <option value="">{T.tagAll}</option>
              {(tags as ArticleTag[]).map(t => (
                <option key={t.id} value={t.slug}>
                  {isFa ? (t.nameFa ?? t.name) : t.name}
                </option>
              ))}
            </select>

            {/* Language */}
            <select name="lang" defaultValue={lang ?? ""}
              className="h-8 rounded-lg border border-line/40 bg-surface/80 text-xs text-ink font-mono px-2 focus:outline-none focus:border-signal/30 transition-all">
              <option value="">{T.langAll}</option>
              <option value="EN">{T.langEn}</option>
              <option value="FA">{T.langFa}</option>
            </select>

            {/* Content type (articles only) */}
            {tab === "articles" && (
              <select name="type" defaultValue={contentType ?? ""}
                className="h-8 rounded-lg border border-line/40 bg-surface/80 text-xs text-ink font-mono px-2 focus:outline-none focus:border-signal/30 transition-all">
                <option value="">{T.typeAll}</option>
                {Object.entries(CONTENT_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{isFa ? l.fa : l.en}</option>
                ))}
              </select>
            )}

            {/* Sort */}
            <select name="sort" defaultValue={rawSort ?? ""}
              className="h-8 rounded-lg border border-line/40 bg-surface/80 text-xs text-ink font-mono px-2 focus:outline-none focus:border-signal/30 transition-all">
              <option value="">{T.sortLabel}</option>
              {sortOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {hasFilters && (
              <Link href={buildClearUrl(locale)}
                className="h-8 px-2.5 rounded-lg border border-line/30 text-faint hover:text-ink text-xs font-mono flex items-center transition-colors">
                × {T.clearBtn}
              </Link>
            )}
          </div>
        </form>

        {/* ── Tabs ──────────────────────────────────────────────────────── */}
        <div className="flex items-end gap-0 border-b border-line/30">
          <Link href={buildTabUrl(currentParams, "articles")}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
              tab === "articles"
                ? "border-signal text-signal"
                : "border-transparent text-muted hover:text-ink"
            }`}>
            {T.tabArticles}
            <span className="ms-1.5 text-[9px] font-mono text-faint">({articles.length})</span>
          </Link>
          <Link href={buildTabUrl(currentParams, "experts")}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
              tab === "experts"
                ? "border-signal text-signal"
                : "border-transparent text-muted hover:text-ink"
            }`}>
            {T.tabExperts}
            <span className="ms-1.5 text-[9px] font-mono text-faint">({experts.length})</span>
          </Link>
        </div>

        {/* ── Results ───────────────────────────────────────────────────── */}
        {tab === "articles" && (
          <section aria-label={T.tabArticles}>
            <p className="text-[10px] text-faint font-mono mb-3">
              {T.results(articles.length)}
              {articleSort !== "latest" && (
                <span className="ms-2 text-signal">
                  — {articleSortOptions.find(o => o.value === articleSort)?.label}
                </span>
              )}
            </p>
            {articles.length === 0 ? (
              <EmptyState isFa={isFa} />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {articles.map(a => (
                  <ArticleCard key={a.id} article={a} isFa={isFa} locale={locale} />
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "experts" && (
          <section aria-label={T.tabExperts}>
            <p className="text-[10px] text-faint font-mono mb-3">
              {T.results(experts.length)}
              {expertSort !== "views" && (
                <span className="ms-2 text-signal">
                  — {expertSortOptions.find(o => o.value === expertSort)?.label}
                </span>
              )}
            </p>
            {experts.length === 0 ? (
              <EmptyState isFa={isFa} />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {experts.map(e => (
                  <ExpertCard key={e.id} expert={e} isFa={isFa} locale={locale} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
