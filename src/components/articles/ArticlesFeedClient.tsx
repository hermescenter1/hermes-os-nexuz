"use client";

import { useState, useMemo } from "react";
import Link                  from "next/link";
import { usePathname }       from "next/navigation";
import type { ArticleListItem, ArticleAuthorProfile, ArticleCategory, ArticleFeed } from "@/lib/articles/types";

// ── Label maps ────────────────────────────────────────────────────────────────

const CONTENT_TYPE_LABELS: Record<string, { en: string; fa: string }> = {
  TECHNICAL_ARTICLE:        { en: "Technical Article",          fa: "مقاله فنی"              },
  INDUSTRIAL_CASE_STUDY:    { en: "Industrial Case Study",      fa: "مطالعه موردی صنعتی"     },
  TROUBLESHOOTING_REPORT:   { en: "Troubleshooting Report",     fa: "گزارش عیب‌یابی"         },
  PROJECT_REPORT:           { en: "Project Report",             fa: "گزارش پروژه"            },
  MAINTENANCE_INSIGHT:      { en: "Maintenance Insight",        fa: "بینش نگهداشت"           },
  PLC_SCADA_TUTORIAL:       { en: "PLC/SCADA Tutorial",         fa: "آموزش PLC/SCADA"        },
  FAILURE_ANALYSIS:         { en: "Failure Analysis",           fa: "آنالیز خرابی"           },
  ASSET_RELIABILITY_NOTE:   { en: "Asset Reliability Note",     fa: "یادداشت قابلیت اطمینان" },
  ENGINEERING_OPINION:      { en: "Engineering Opinion",        fa: "دیدگاه مهندسی"         },
  RESEARCH_SUMMARY:         { en: "Research Summary",           fa: "خلاصه پژوهش"           },
  FIELD_COMMISSIONING_NOTE: { en: "Field Commissioning Note",   fa: "یادداشت راه‌اندازی"     },
  SAFETY_COMPLIANCE_NOTE:   { en: "Safety & Compliance",        fa: "ایمنی و انطباق"         },
};

function contentTypeBadgeColor(t: string) {
  if (t === "FAILURE_ANALYSIS" || t === "SAFETY_COMPLIANCE_NOTE") return "bg-danger/[0.10] text-danger";
  if (t === "TROUBLESHOOTING_REPORT") return "bg-warn/[0.10] text-warn";
  if (t === "INDUSTRIAL_CASE_STUDY") return "bg-hermes-gold/[0.12] text-hermes-gold";
  if (t === "ENGINEERING_OPINION") return "bg-ice/[0.10] text-ice";
  return "bg-signal/[0.10] text-signal";
}

function qualityDot(score?: number | null) {
  if (!score) return null;
  if (score >= 9.5) return <span className="hs-dot hs-dot--knowledge" title="Top Quality" />;
  if (score >= 8.5) return <span className="hs-dot hs-dot--reasoning" title="High Quality" />;
  return <span className="hs-dot hs-dot--nominal" title="Reviewed" />;
}

function fmtDate(d?: string | null, isFa = false) {
  if (!d) return "";
  const date = new Date(d);
  if (isFa) {
    try {
      return date.toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric" });
    } catch { return date.toLocaleDateString(); }
  }
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtNum(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

// ── Article Card ──────────────────────────────────────────────────────────────

function ArticleCard({ article, locale, isFa, size = "normal" }: {
  article: ArticleListItem;
  locale: string;
  isFa: boolean;
  size?: "normal" | "compact" | "hero";
}) {
  const typeLabel = CONTENT_TYPE_LABELS[article.contentType] ?? { en: article.contentType, fa: article.contentType };
  const href = `/${locale}/articles/${article.slug}`;
  const catHref = article.category ? `/${locale}/articles/category/${article.category.slug}` : null;
  const authorHref = `/${locale}/articles/author/${article.author.handle}`;

  if (size === "compact") return (
    <Link href={href} className="group flex gap-4 items-start p-4 rounded-xl border border-line/60 hover:border-signal/30 hover:bg-surface2/60 transition-all duration-150">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider ${contentTypeBadgeColor(article.contentType)}`}>
            {isFa ? typeLabel.fa : typeLabel.en}
          </span>
          {article.knowledgeMetadata?.humanReviewed && (
            <span className="hs-badge hs--knowledge text-[9px]">{isFa ? "بررسی شده" : "REVIEWED"}</span>
          )}
        </div>
        <h3 className="text-sm font-semibold text-ink group-hover:text-signal transition-colors line-clamp-2 leading-snug">{article.title}</h3>
        <div className="flex items-center gap-3 mt-2 text-xs text-faint">
          <span>{article.author.displayName}</span>
          <span>·</span>
          <span>{article.readingTimeMinutes} {isFa ? "دقیقه" : "min"}</span>
          <span>·</span>
          <span>{fmtNum(article.viewCount)} {isFa ? "بازدید" : "views"}</span>
        </div>
      </div>
    </Link>
  );

  if (size === "hero") return (
    <div className="relative rounded-2xl overflow-hidden border border-line/80 bg-surface"
      style={{ background: "linear-gradient(135deg, rgba(30,200,164,0.04) 0%, rgba(6,8,13,1) 60%)" }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 20% 20%, rgba(30,200,164,0.07) 0%, transparent 60%)" }} />
      <div className="relative p-8 md:p-10">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="hs-badge hs--knowledge">{isFa ? "انتخاب سردبیر" : "EDITOR'S PICK"}</span>
          {catHref && (
            <Link href={catHref} className="text-[10px] px-2 py-0.5 rounded border border-signal/30 text-signal hover:bg-signal/10 transition-colors font-mono uppercase tracking-wider">
              {isFa ? (article.category?.nameFa ?? article.category?.name) : article.category?.name}
            </Link>
          )}
          {article.knowledgeMetadata?.safetyCritical && (
            <span className="hs-badge hs--risk">{isFa ? "ایمنی بحرانی" : "SAFETY CRITICAL"}</span>
          )}
        </div>
        <Link href={href}>
          <h2 className="text-2xl md:text-3xl font-bold text-ink hover:text-signal transition-colors leading-snug mb-3">{article.title}</h2>
        </Link>
        {article.subtitle && (
          <p className="text-muted text-base leading-relaxed mb-4 max-w-2xl">{article.subtitle}</p>
        )}
        {article.excerpt && (
          <p className="text-muted text-sm leading-relaxed mb-6 max-w-2xl line-clamp-3">{article.excerpt}</p>
        )}
        <div className="flex flex-wrap items-center gap-6">
          <Link href={authorHref} className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-full bg-signal/20 border border-signal/30 flex items-center justify-center text-xs font-bold text-signal">
              {article.author.displayName.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-medium text-ink group-hover:text-signal transition-colors">{article.author.displayName}</p>
              <p className="text-xs text-faint">{article.author.roleTitle ?? article.author.company}</p>
            </div>
            {article.author.verifiedExpert && (
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-signal shrink-0" aria-label="Verified Expert">
                <path fillRule="evenodd" d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd"/>
              </svg>
            )}
          </Link>
          <div className="flex items-center gap-4 text-xs text-faint">
            <span>{fmtDate(article.publishedAt, isFa)}</span>
            <span>·</span>
            <span>{article.readingTimeMinutes} {isFa ? "دقیقه مطالعه" : "min read"}</span>
            <span>·</span>
            <span>{fmtNum(article.viewCount)} {isFa ? "بازدید" : "views"}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="group rounded-xl border border-line/60 bg-surface hover:border-signal/30 hover:bg-surface2/40 transition-all duration-200 flex flex-col">
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider ${contentTypeBadgeColor(article.contentType)}`}>
            {isFa ? typeLabel.fa : typeLabel.en}
          </span>
          {qualityDot(article.knowledgeMetadata?.articleQualityScore)}
          {article.author.verifiedExpert && (
            <span className="hs-badge hs--knowledge text-[9px]">{isFa ? "متخصص تأییدشده" : "EXPERT"}</span>
          )}
        </div>
        <Link href={href} className="flex-1">
          <h3 className="font-semibold text-ink group-hover:text-signal transition-colors leading-snug mb-2 line-clamp-2">{article.title}</h3>
          {article.excerpt && (
            <p className="text-sm text-muted leading-relaxed line-clamp-2">{article.excerpt}</p>
          )}
        </Link>
        {catHref && article.category && (
          <div className="mt-3">
            <Link href={catHref} className="text-xs text-signal/80 hover:text-signal transition-colors">
              {isFa ? article.category.nameFa : article.category.name}
            </Link>
          </div>
        )}
      </div>
      <div className="px-5 py-3 border-t border-line/40 flex items-center justify-between gap-3">
        <Link href={authorHref} className="flex items-center gap-2 group/author">
          <div className="w-6 h-6 rounded-full bg-signal/15 border border-signal/25 flex items-center justify-center text-[10px] font-bold text-signal">
            {article.author.displayName.charAt(0)}
          </div>
          <span className="text-xs text-muted group-hover/author:text-ink transition-colors truncate max-w-[100px]">
            {article.author.displayName}
          </span>
        </Link>
        <div className="flex items-center gap-3 text-xs text-faint shrink-0">
          <span>{article.readingTimeMinutes}{isFa ? "د" : "m"}</span>
          <span>·</span>
          <span>{fmtNum(article.viewCount)}</span>
          {article.reactionCount > 0 && <span>·</span>}
          {article.reactionCount > 0 && <span>{fmtNum(article.reactionCount)} {isFa ? "✓" : "✓"}</span>}
        </div>
      </div>
    </div>
  );
}

// ── Author Card ───────────────────────────────────────────────────────────────

function AuthorCard({ author, locale, isFa }: { author: ArticleAuthorProfile; locale: string; isFa: boolean }) {
  return (
    <Link href={`/${locale}/articles/author/${author.handle}`}
      className="group flex flex-col gap-3 p-5 rounded-xl border border-line/60 hover:border-signal/30 bg-surface hover:bg-surface2/40 transition-all duration-200">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-signal/30 to-ice/20 border border-signal/30 flex items-center justify-center text-base font-bold text-signal shrink-0">
          {author.displayName.charAt(0)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-ink group-hover:text-signal transition-colors truncate">{author.displayName}</p>
            {author.verifiedExpert && (
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-signal shrink-0">
                <path fillRule="evenodd" d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd"/>
              </svg>
            )}
          </div>
          <p className="text-xs text-faint truncate">{author.roleTitle ?? author.company}</p>
        </div>
      </div>
      {author.headline && (
        <p className="text-xs text-muted leading-relaxed line-clamp-2">{author.headline}</p>
      )}
      <div className="flex items-center gap-4 text-xs text-faint">
        <span>{fmtNum(author.followerCount)} {isFa ? "دنبال‌کننده" : "followers"}</span>
        <span>·</span>
        <span>{author.articleCount} {isFa ? "مقاله" : "articles"}</span>
      </div>
      {author.expertiseAreas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {author.expertiseAreas.slice(0, 3).map(area => (
            <span key={area} className="text-[10px] px-1.5 py-0.5 rounded bg-surface3 text-muted font-mono">{area}</span>
          ))}
        </div>
      )}
    </Link>
  );
}

// ── Main Feed Component ───────────────────────────────────────────────────────

interface Props {
  feed: ArticleFeed;
  view?: "feed" | "trending" | "latest" | "editors-picks" | "case-studies";
}

export function ArticlesFeedClient({ feed, view = "feed" }: Props) {
  const pathname = usePathname();
  const isFa   = pathname.startsWith("/fa");
  const locale = isFa ? "fa" : "en";
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("ALL");

  const articles = useMemo(() => {
    let list: ArticleListItem[] =
      view === "trending"      ? feed.trending :
      view === "latest"        ? feed.latest :
      view === "editors-picks" ? feed.editorsPicks :
      view === "case-studies"  ? feed.caseStudies :
      feed.latest;

    if (catFilter !== "ALL") list = list.filter(a => a.category?.slug === catFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.title.toLowerCase().includes(q) ||
        (a.excerpt ?? "").toLowerCase().includes(q) ||
        a.author.displayName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [feed, view, catFilter, search]);

  const hero = view === "feed" ? (feed.featured ?? feed.editorsPicks[0] ?? null) : null;
  const picks = view === "feed" ? feed.editorsPicks.slice(0, 3) : [];
  const trendingList = view === "feed" ? feed.trending.slice(0, 6) : [];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Module identity header */}
      <div className="border-b border-line/50 bg-surface/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <p className="eyebrow-mono text-signal text-[10px]">HERMES INDUSTRIAL JOURNAL</p>
                <p className="text-xs text-faint">{isFa ? "شبکه دانش صنعتی" : "Industrial Knowledge Network"}</p>
              </div>
              <div className="hidden md:flex items-center gap-1">
                {[
                  { href: `/articles`,               label: isFa ? "فید" : "Feed"             },
                  { href: `/articles/trending`,       label: isFa ? "پرطرفدار" : "Trending"    },
                  { href: `/articles/latest`,         label: isFa ? "جدیدترین" : "Latest"      },
                  { href: `/articles/authors`,        label: isFa ? "نویسندگان" : "Authors"    },
                  { href: `/articles/categories`,     label: isFa ? "دسته‌بندی" : "Categories" },
                ].map(l => {
                  const fullHref = `/${locale}${l.href}`;
                  const active = l.href === "/articles" ? pathname === fullHref : pathname.startsWith(fullHref);
                  return (
                    <Link key={l.href} href={fullHref}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-all ${active ? "text-signal bg-signal/10 font-medium" : "text-muted hover:text-ink hover:bg-surface3"}`}>
                      {l.label}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder={isFa ? "جست‌وجو در مقالات…" : "Search articles…"}
                className="bg-surface border border-line text-xs text-ink rounded-lg px-3 py-1.5 focus:outline-none focus:border-signal/50 w-48 hidden sm:block"
              />
              <Link href={`/${locale}/articles/write`}
                className="text-xs px-3 py-1.5 rounded-lg bg-signal text-bg font-semibold hover:bg-signal/90 transition-colors whitespace-nowrap">
                {isFa ? "+ نوشتن" : "+ Write"}
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 py-8">

        {/* Hero section (feed view only) */}
        {view === "feed" && hero && (
          <div className="mb-10">
            <ArticleCard article={hero} locale={locale} isFa={isFa} size="hero" />
          </div>
        )}

        {/* Editor's picks (feed view only) */}
        {view === "feed" && picks.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="w-1 h-5 rounded-full bg-signal inline-block" />
                <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">
                  {isFa ? "انتخاب سردبیر" : "Editor's Picks"}
                </h2>
              </div>
              <Link href={`/${locale}/articles/editors-picks`} className="text-xs text-signal hover:underline">
                {isFa ? "همه" : "See all"}
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {picks.map(a => <ArticleCard key={a.id} article={a} locale={locale} isFa={isFa} />)}
            </div>
          </section>
        )}

        {/* Main grid / list */}
        <div className={view === "feed" ? "grid grid-cols-1 lg:grid-cols-3 gap-8" : ""}>
          <div className={view === "feed" ? "lg:col-span-2" : ""}>
            {view === "feed" && (
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <span className="w-1 h-5 rounded-full bg-ice inline-block" />
                  <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">
                    {isFa ? "جدیدترین مقالات" : "Latest Articles"}
                  </h2>
                </div>
              </div>
            )}

            {view !== "feed" && (
              <div className="mb-6">
                <p className="eyebrow-mono text-signal mb-1">
                  {view === "trending"      ? (isFa ? "پرطرفدار" : "TRENDING") :
                   view === "latest"        ? (isFa ? "جدیدترین" : "LATEST") :
                   view === "editors-picks" ? (isFa ? "انتخاب سردبیر" : "EDITOR'S PICKS") :
                   (isFa ? "مطالعات موردی" : "CASE STUDIES")}
                </p>
                <p className="text-xs text-faint">{articles.length} {isFa ? "مقاله" : "articles"}</p>
              </div>
            )}

            {/* Category filter (non-feed) */}
            {view !== "feed" && feed.categories.length > 0 && (
              <div className="mb-5 flex flex-wrap gap-2">
                {["ALL", ...feed.categories.map(c => c.slug)].map(s => {
                  const cat = feed.categories.find(c => c.slug === s);
                  const label = s === "ALL" ? (isFa ? "همه" : "All") : (isFa ? (cat?.nameFa ?? s) : (cat?.name ?? s));
                  return (
                    <button key={s} onClick={() => setCatFilter(s)}
                      className={`text-xs px-3 py-1 rounded-full border transition-all ${catFilter === s ? "border-signal text-signal bg-signal/10" : "border-line text-muted hover:border-signal/40 hover:text-ink"}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            {articles.length === 0 ? (
              <div className="text-center py-20 border border-line/40 rounded-xl">
                <p className="text-muted">{isFa ? "مقاله‌ای یافت نشد" : "No articles found"}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {articles.map(a => <ArticleCard key={a.id} article={a} locale={locale} isFa={isFa} />)}
              </div>
            )}
          </div>

          {/* Sidebar (feed view only) */}
          {view === "feed" && (
            <aside className="space-y-8">
              {/* Trending */}
              {trendingList.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-1 h-4 rounded-full bg-warn inline-block" />
                    <h3 className="text-xs font-semibold text-ink uppercase tracking-wider">
                      {isFa ? "پرطرفدار" : "Trending"}
                    </h3>
                  </div>
                  <div className="flex flex-col gap-3">
                    {trendingList.map(a => <ArticleCard key={a.id} article={a} locale={locale} isFa={isFa} size="compact" />)}
                  </div>
                  <Link href={`/${locale}/articles/trending`} className="block text-xs text-signal hover:underline mt-3">
                    {isFa ? "مشاهده همه پرطرفدارها" : "View all trending"}
                  </Link>
                </section>
              )}

              {/* Top Authors */}
              {feed.topAuthors.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="w-1 h-4 rounded-full bg-signal inline-block" />
                      <h3 className="text-xs font-semibold text-ink uppercase tracking-wider">
                        {isFa ? "نویسندگان برتر" : "Top Authors"}
                      </h3>
                    </div>
                    <Link href={`/${locale}/articles/authors`} className="text-xs text-signal hover:underline">
                      {isFa ? "همه" : "All"}
                    </Link>
                  </div>
                  <div className="flex flex-col gap-3">
                    {feed.topAuthors.slice(0, 4).map(a => <AuthorCard key={a.id} author={a} locale={locale} isFa={isFa} />)}
                  </div>
                </section>
              )}

              {/* Categories */}
              {feed.categories.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="w-1 h-4 rounded-full bg-ice inline-block" />
                      <h3 className="text-xs font-semibold text-ink uppercase tracking-wider">
                        {isFa ? "دسته‌بندی‌ها" : "Categories"}
                      </h3>
                    </div>
                    <Link href={`/${locale}/articles/categories`} className="text-xs text-signal hover:underline">
                      {isFa ? "همه" : "All"}
                    </Link>
                  </div>
                  <div className="flex flex-col gap-1">
                    {feed.categories.slice(0, 10).map(c => (
                      <Link key={c.slug} href={`/${locale}/articles/category/${c.slug}`}
                        className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface2 transition-colors group">
                        <span className="text-xs text-muted group-hover:text-ink transition-colors">
                          {isFa ? c.nameFa : c.name}
                        </span>
                        {c.articleCount && (
                          <span className="text-[10px] text-faint tabular-nums">{c.articleCount}</span>
                        )}
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </aside>
          )}
        </div>

        {/* Authors grid (authors view) */}
        {view === "feed" && feed.topAuthors.length > 0 && (
          <section className="mt-12">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="w-1 h-5 rounded-full bg-signal inline-block" />
                <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">
                  {isFa ? "شبکه متخصصان" : "Expert Network"}
                </h2>
              </div>
              <Link href={`/${locale}/articles/authors`} className="text-xs text-signal hover:underline">
                {isFa ? "مشاهده همه" : "View all experts"}
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {feed.topAuthors.slice(0, 6).map(a => <AuthorCard key={a.id} author={a} locale={locale} isFa={isFa} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
