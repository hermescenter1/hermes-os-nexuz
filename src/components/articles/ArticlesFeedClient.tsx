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
  if (t === "FAILURE_ANALYSIS" || t === "SAFETY_COMPLIANCE_NOTE") return "bg-danger/[0.10] text-danger border-danger/20";
  if (t === "TROUBLESHOOTING_REPORT") return "bg-warn/[0.10] text-warn border-warn/20";
  if (t === "INDUSTRIAL_CASE_STUDY") return "bg-hermes-gold/[0.12] text-hermes-gold border-hermes-gold/20";
  if (t === "ENGINEERING_OPINION") return "bg-ice/[0.10] text-ice border-ice/20";
  return "bg-signal/[0.08] text-signal border-signal/20";
}

function contentTypeBarColor(t: string) {
  if (t === "FAILURE_ANALYSIS" || t === "SAFETY_COMPLIANCE_NOTE") return "from-danger/60 to-danger/20";
  if (t === "TROUBLESHOOTING_REPORT") return "from-warn/60 to-warn/20";
  if (t === "INDUSTRIAL_CASE_STUDY") return "from-hermes-gold/60 to-hermes-gold/20";
  if (t === "ENGINEERING_OPINION") return "from-ice/60 to-ice/20";
  return "from-signal/60 to-signal/20";
}

function qualityBadge(score?: number | null, isFa = false) {
  if (!score) return null;
  if (score >= 9.5) return (
    <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-mono bg-signal/10 text-signal border border-signal/20 uppercase tracking-wide">
      <span className="w-1.5 h-1.5 rounded-full bg-signal inline-block" />
      {isFa ? "برتر" : "TOP"}
    </span>
  );
  if (score >= 8.5) return (
    <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-mono bg-ice/10 text-ice border border-ice/20 uppercase tracking-wide">
      <span className="w-1.5 h-1.5 rounded-full bg-ice inline-block" />
      {isFa ? "عالی" : "HIGH"}
    </span>
  );
  return null;
}

function fmtDate(d?: string | null, isFa = false) {
  if (!d) return "";
  const date = new Date(d);
  if (isFa) {
    try { return date.toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric" }); }
    catch { return date.toLocaleDateString(); }
  }
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtNum(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

// ── Verified icon ─────────────────────────────────────────────────────────────

function VerifiedIcon({ size = "sm" }: { size?: "sm" | "xs" }) {
  const cls = size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5";
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={`${cls} text-signal shrink-0`} aria-label="Verified Expert">
      <path fillRule="evenodd" d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd"/>
    </svg>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const dims = size === "lg" ? "w-10 h-10 text-base" : size === "md" ? "w-8 h-8 text-sm" : "w-6 h-6 text-[10px]";
  return (
    <div className={`${dims} rounded-full bg-gradient-to-br from-signal/25 to-ice/15 border border-signal/25 flex items-center justify-center font-bold text-signal shrink-0`}>
      {name.charAt(0)}
    </div>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ label, eyebrow, href, linkLabel, isFa }: {
  label: string; eyebrow?: string; href?: string; linkLabel?: string; isFa: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div>
        {eyebrow && <p className="eyebrow-mono text-signal text-[9px] mb-1">{eyebrow}</p>}
        <div className="flex items-center gap-2.5">
          <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-signal to-signal/20" />
          <h2 className="text-sm font-bold text-ink uppercase tracking-wider">{label}</h2>
        </div>
      </div>
      {href && linkLabel && (
        <Link href={href}
          className="flex items-center gap-1 text-xs text-signal/80 hover:text-signal transition-colors font-mono">
          {linkLabel}
          <svg viewBox="0 0 20 20" fill="currentColor" className={`w-3 h-3 ${isFa ? "rotate-180" : ""}`}>
            <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd"/>
          </svg>
        </Link>
      )}
    </div>
  );
}

// ── Article Card ──────────────────────────────────────────────────────────────

function ArticleCard({ article, locale, isFa, size = "normal" }: {
  article: ArticleListItem;
  locale: string;
  isFa: boolean;
  size?: "normal" | "compact" | "hero";
}) {
  const typeLabel = CONTENT_TYPE_LABELS[article.contentType] ?? { en: article.contentType, fa: article.contentType };
  const href      = `/${locale}/articles/${article.slug}`;
  const catHref   = article.category ? `/${locale}/articles/category/${article.category.slug}` : null;
  const authorHref = `/${locale}/articles/author/${article.author.handle}`;

  if (size === "compact") return (
    <Link href={href}
      className="group flex gap-3 items-start p-3.5 rounded-xl border border-line/40 hover:border-signal/20 bg-surface/60 hover:bg-surface2/60 transition-all duration-150">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wider ${contentTypeBadgeColor(article.contentType)}`}>
            {isFa ? typeLabel.fa : typeLabel.en}
          </span>
          {article.knowledgeMetadata?.humanReviewed && (
            <span className="hs-badge hs--knowledge text-[9px]">{isFa ? "بررسی" : "REVIEWED"}</span>
          )}
        </div>
        <h3 className="text-xs font-semibold text-ink group-hover:text-signal transition-colors line-clamp-2 leading-snug mb-1.5">{article.title}</h3>
        <div className="flex items-center gap-2 text-[10px] text-faint">
          <span className="truncate max-w-[80px]">{article.author.displayName}</span>
          <span className="text-line">·</span>
          <span>{article.readingTimeMinutes}{isFa ? "د" : "m"}</span>
          <span className="text-line">·</span>
          <span>{fmtNum(article.viewCount)}</span>
        </div>
      </div>
    </Link>
  );

  if (size === "hero") return (
    <div className="relative rounded-2xl overflow-hidden border border-signal/15"
      style={{ background: "linear-gradient(145deg, rgba(30,200,164,0.06) 0%, rgba(6,8,13,0.98) 55%, rgba(6,8,13,1) 100%)" }}>
      {/* Grid texture */}
      <div className="absolute inset-0 pointer-events-none opacity-40"
        style={{ backgroundImage: "radial-gradient(rgba(30,200,164,0.18) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
      {/* Glow */}
      <div className="absolute -top-12 -start-12 w-72 h-72 rounded-full blur-[80px] pointer-events-none"
        style={{ background: "rgba(30,200,164,0.10)" }} />

      <div className="relative p-8 md:p-12">
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <span className="hs-badge hs--knowledge">{isFa ? "انتخاب سردبیر" : "EDITOR'S PICK"}</span>
          {catHref && article.category && (
            <Link href={catHref}
              className="text-[10px] px-2.5 py-0.5 rounded-full border border-signal/30 text-signal hover:bg-signal/10 transition-colors font-mono uppercase tracking-wider">
              {isFa ? (article.category.nameFa ?? article.category.name) : article.category.name}
            </Link>
          )}
          {article.knowledgeMetadata?.safetyCritical && (
            <span className="hs-badge hs--risk">{isFa ? "ایمنی بحرانی" : "SAFETY CRITICAL"}</span>
          )}
          {qualityBadge(article.knowledgeMetadata?.articleQualityScore, isFa)}
        </div>

        {/* Title */}
        <Link href={href}>
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-ink hover:text-signal transition-colors leading-tight mb-4 max-w-2xl">
            {article.title}
          </h2>
        </Link>

        {/* Subtitle / excerpt */}
        {(article.subtitle ?? article.excerpt) && (
          <p className="text-base text-muted leading-relaxed mb-8 max-w-xl line-clamp-3">
            {article.subtitle ?? article.excerpt}
          </p>
        )}

        {/* Author + meta */}
        <div className="flex flex-wrap items-center gap-5 mb-8">
          <Link href={authorHref} className="flex items-center gap-2.5 group/auth">
            <Avatar name={article.author.displayName} size="md" />
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-ink group-hover/auth:text-signal transition-colors">
                  {article.author.displayName}
                </p>
                {article.author.verifiedExpert && <VerifiedIcon />}
              </div>
              <p className="text-xs text-faint">{article.author.roleTitle ?? article.author.company}</p>
            </div>
          </Link>
          <div className="flex items-center gap-3 text-xs text-faint">
            <span>{fmtDate(article.publishedAt, isFa)}</span>
            <span className="text-line">·</span>
            <span>{article.readingTimeMinutes} {isFa ? "دقیقه مطالعه" : "min read"}</span>
            <span className="text-line">·</span>
            <span>{fmtNum(article.viewCount)} {isFa ? "بازدید" : "views"}</span>
          </div>
        </div>

        {/* CTA */}
        <Link href={href}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-signal text-bg text-sm font-bold hover:bg-signal/90 transition-colors">
          {isFa ? "خواندن مقاله" : "Read Article"}
          <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 ${isFa ? "rotate-180" : ""}`}>
            <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd"/>
          </svg>
        </Link>
      </div>
    </div>
  );

  // Normal card
  return (
    <div className="group rounded-xl border border-line/40 bg-surface hover:border-signal/20 hover:shadow-[0_0_24px_rgba(30,200,164,0.05)] transition-all duration-200 flex flex-col overflow-hidden">
      {/* Content type color bar */}
      <div className={`h-0.5 w-full bg-gradient-to-r ${contentTypeBarColor(article.contentType)}`} />

      <div className="p-5 flex-1 flex flex-col">
        {/* Badges row */}
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wider ${contentTypeBadgeColor(article.contentType)}`}>
            {isFa ? typeLabel.fa : typeLabel.en}
          </span>
          {article.author.verifiedExpert && (
            <span className="hs-badge hs--knowledge text-[9px]">{isFa ? "متخصص" : "EXPERT"}</span>
          )}
          {qualityBadge(article.knowledgeMetadata?.articleQualityScore, isFa)}
        </div>

        {/* Title + excerpt */}
        <Link href={href} className="flex-1">
          <h3 className="font-bold text-ink group-hover:text-signal transition-colors leading-snug mb-2 line-clamp-2 text-[0.9375rem]">
            {article.title}
          </h3>
          {article.excerpt && (
            <p className="text-sm text-muted leading-relaxed line-clamp-2">{article.excerpt}</p>
          )}
        </Link>

        {/* Category tag */}
        {catHref && article.category && (
          <div className="mt-3">
            <Link href={catHref}
              className="inline-flex items-center gap-1 text-xs text-signal/70 hover:text-signal transition-colors font-mono">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5 opacity-60">
                <path fillRule="evenodd" d="M5.5 3A2.5 2.5 0 0 0 3 5.5v2.879a2.5 2.5 0 0 0 .732 1.767l6.5 6.5a2.5 2.5 0 0 0 3.536 0l2.878-2.878a2.5 2.5 0 0 0 0-3.536l-6.5-6.5A2.5 2.5 0 0 0 8.38 3H5.5ZM6 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/>
              </svg>
              {isFa ? article.category.nameFa : article.category.name}
            </Link>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-line/30 flex items-center justify-between gap-3 bg-surface2/20">
        <Link href={authorHref} className="flex items-center gap-2 group/auth min-w-0">
          <Avatar name={article.author.displayName} size="sm" />
          <span className="text-xs text-muted group-hover/auth:text-ink transition-colors truncate max-w-[90px]">
            {article.author.displayName}
          </span>
        </Link>
        <div className="flex items-center gap-2.5 text-[10px] text-faint font-mono shrink-0">
          <span>{article.readingTimeMinutes}{isFa ? "د" : "m"}</span>
          <span className="text-line">·</span>
          <span>{fmtNum(article.viewCount)}</span>
          {article.reactionCount > 0 && (
            <>
              <span className="text-line">·</span>
              <span className="text-signal/60">{fmtNum(article.reactionCount)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Author Card (sidebar) ─────────────────────────────────────────────────────

function AuthorCard({ author, locale, isFa }: { author: ArticleAuthorProfile; locale: string; isFa: boolean }) {
  return (
    <Link href={`/${locale}/articles/author/${author.handle}`}
      className="group flex gap-3 items-start p-4 rounded-xl border border-line/40 hover:border-signal/20 bg-surface/60 hover:bg-surface2/40 hover:shadow-[0_0_20px_rgba(30,200,164,0.05)] transition-all duration-200">
      <Avatar name={author.displayName} size="lg" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-sm font-semibold text-ink group-hover:text-signal transition-colors truncate">
            {author.displayName}
          </p>
          {author.verifiedExpert && <VerifiedIcon size="xs" />}
        </div>
        <p className="text-[10px] text-faint truncate mb-2">{author.roleTitle ?? author.company}</p>
        {author.industrialCredibilityScore && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-0.5 rounded-full bg-surface3 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-signal to-ice"
                style={{ width: `${(author.industrialCredibilityScore / 10) * 100}%` }} />
            </div>
            <span className="text-[9px] font-mono text-signal">{author.industrialCredibilityScore.toFixed(1)}</span>
          </div>
        )}
        {author.expertiseAreas.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {author.expertiseAreas.slice(0, 2).map(area => (
              <span key={area} className="text-[9px] px-1.5 py-0.5 rounded bg-surface3/80 text-faint font-mono border border-line/20">{area}</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

// ── Journal Masthead (feed view hero) ─────────────────────────────────────────

function JournalMasthead({ isFa, locale }: { isFa: boolean; locale: string }) {
  const chips = isFa ? [
    "مقالات تخصصی صنعتی",
    "۱۹ دسته‌بندی",
    "نویسندگان تأییدشده",
    "بررسی‌شده توسط متخصصان",
  ] : [
    "Peer-Reviewed Technical Articles",
    "19 Industrial Categories",
    "Verified Expert Authors",
    "Engineering-Grade Insights",
  ];

  return (
    <div className="relative overflow-hidden border-b border-line/30"
      style={{ background: "linear-gradient(180deg, rgba(30,200,164,0.05) 0%, rgba(6,8,13,0.98) 100%)" }}>
      {/* Dot grid texture */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(rgba(30,200,164,0.12) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          opacity: 0.6,
        }} />
      {/* Corner glow */}
      <div className="absolute -top-16 start-0 w-96 h-96 rounded-full blur-[100px] pointer-events-none"
        style={{ background: "rgba(30,200,164,0.07)" }} />
      <div className="absolute -bottom-20 end-0 w-64 h-64 rounded-full blur-[80px] pointer-events-none"
        style={{ background: "rgba(30,200,164,0.04)" }} />

      <div className="relative max-w-[1400px] mx-auto px-6 py-14 md:py-20">
        <div className="max-w-3xl">
          <p className="eyebrow-mono text-signal mb-4 tracking-[0.2em]">
            {isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
          </p>
          <h1 className="text-4xl md:text-5xl font-bold text-ink leading-tight mb-4">
            {isFa ? "شبکه دانش صنعتی" : "Industrial Knowledge Network"}
          </h1>
          <p className="text-base md:text-lg text-muted leading-relaxed max-w-2xl mb-8">
            {isFa
              ? "مقالات تخصصی، مطالعات موردی صنعتی، و بینش‌های عملیاتی از متخصصان برتر حوزه اتوماسیون، نگهداشت، و هوش مصنوعی صنعتی"
              : "Technical articles, industrial case studies, and operational insights from verified automation, maintenance, and industrial AI experts"}
          </p>

          {/* Signal chips */}
          <div className="flex flex-wrap gap-2 mb-8">
            {chips.map(chip => (
              <span key={chip}
                className="inline-flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-full border border-signal/20 bg-signal/5 text-signal font-mono uppercase tracking-wider">
                <span className="w-1 h-1 rounded-full bg-signal/60 inline-block" />
                {chip}
              </span>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex flex-wrap gap-3">
            <Link href={`/${locale}/articles/categories`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-signal text-bg text-sm font-bold hover:bg-signal/90 transition-colors">
              {isFa ? "مرور دسته‌بندی‌ها" : "Browse Categories"}
              <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 ${isFa ? "rotate-180" : ""}`}>
                <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd"/>
              </svg>
            </Link>
            <Link href={`/${locale}/articles/write`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-signal/25 text-signal text-sm font-bold hover:bg-signal/8 transition-colors">
              {isFa ? "+ نوشتن مقاله" : "+ Write Article"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── View Header (for sub-views) ───────────────────────────────────────────────

function ViewHeader({ view, articleCount, isFa, locale }: {
  view: string; articleCount: number; isFa: boolean; locale: string;
}) {
  const views: Record<string, { en: string; fa: string; eyebrow: string }> = {
    trending:       { en: "Trending Articles",  fa: "مقالات پرطرفدار",   eyebrow: "TRENDING NOW"      },
    latest:         { en: "Latest Articles",    fa: "جدیدترین مقالات",   eyebrow: "RECENTLY PUBLISHED" },
    "editors-picks":{ en: "Editor's Picks",     fa: "انتخاب سردبیر",     eyebrow: "CURATED SELECTION"  },
    "case-studies": { en: "Industrial Case Studies", fa: "مطالعات موردی صنعتی", eyebrow: "FIELD INTELLIGENCE" },
  };
  const v = views[view] ?? { en: "Articles", fa: "مقالات", eyebrow: "JOURNAL" };

  return (
    <div className="relative border-b border-line/30 overflow-hidden"
      style={{ background: "linear-gradient(180deg, rgba(30,200,164,0.04) 0%, transparent 100%)" }}>
      <div className="max-w-[1400px] mx-auto px-6 py-10">
        <p className="eyebrow-mono text-signal text-[9px] mb-2 tracking-[0.2em]">
          {isFa ? "ژورنال صنعتی هرمس — " : "HERMES INDUSTRIAL JOURNAL — "}
          {v.eyebrow}
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <h1 className="text-3xl font-bold text-ink">{isFa ? v.fa : v.en}</h1>
          <span className="text-sm text-faint font-mono mb-1">
            {articleCount} {isFa ? "مقاله" : "articles"}
          </span>
        </div>
      </div>
    </div>
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

  const hero    = view === "feed" ? (feed.featured ?? feed.editorsPicks[0] ?? null) : null;
  const picks   = view === "feed" ? feed.editorsPicks.slice(0, 3) : [];
  const trending = view === "feed" ? feed.trending.slice(0, 6) : [];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>

      {/* Sticky module header */}
      <div className="border-b border-line/30 bg-surface/70 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-6 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-sm bg-signal/15 border border-signal/30 flex items-center justify-center">
                  <span className="w-2 h-2 rounded-full bg-signal inline-block" />
                </div>
                <div>
                  <p className="eyebrow-mono text-signal text-[9px] leading-none">HERMES INDUSTRIAL JOURNAL</p>
                  <p className="text-[10px] text-faint leading-none mt-0.5">{isFa ? "شبکه دانش صنعتی" : "Industrial Knowledge Network"}</p>
                </div>
              </div>
              <nav className="hidden md:flex items-center gap-0.5">
                {[
                  { href: `/articles`,               label: isFa ? "فید" : "Feed"             },
                  { href: `/articles/trending`,       label: isFa ? "پرطرفدار" : "Trending"    },
                  { href: `/articles/latest`,         label: isFa ? "جدیدترین" : "Latest"      },
                  { href: `/articles/authors`,        label: isFa ? "نویسندگان" : "Experts"    },
                  { href: `/articles/categories`,     label: isFa ? "دسته‌بندی" : "Categories" },
                ].map(l => {
                  const fullHref = `/${locale}${l.href}`;
                  const active   = l.href === "/articles" ? pathname === fullHref : pathname.startsWith(fullHref);
                  return (
                    <Link key={l.href} href={fullHref}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                        active
                          ? "text-signal bg-signal/8 font-semibold"
                          : "text-muted hover:text-ink hover:bg-surface3/60"
                      }`}>
                      {l.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="relative hidden sm:block">
                <input
                  type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder={isFa ? "جست‌وجو…" : "Search…"}
                  className="bg-surface/80 border border-line/60 text-[11px] text-ink rounded-lg px-3 py-1.5 ps-8 focus:outline-none focus:border-signal/40 w-44 placeholder:text-faint"
                />
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-faint absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd"/>
                </svg>
              </div>
              <Link href={`/${locale}/articles/write`}
                className="inline-flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-lg bg-signal text-bg font-bold hover:bg-signal/90 transition-colors whitespace-nowrap">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                  <path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z"/>
                </svg>
                {isFa ? "نوشتن" : "Write"}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Journal masthead (feed view only) */}
      {view === "feed" && <JournalMasthead isFa={isFa} locale={locale} />}

      {/* View header (sub-views) */}
      {view !== "feed" && (
        <ViewHeader view={view} articleCount={articles.length} isFa={isFa} locale={locale} />
      )}

      <div className="max-w-[1400px] mx-auto px-6 py-8">

        {/* Hero article (feed) */}
        {view === "feed" && hero && (
          <div className="mb-12">
            <ArticleCard article={hero} locale={locale} isFa={isFa} size="hero" />
          </div>
        )}

        {/* Editor's picks (feed) */}
        {view === "feed" && picks.length > 0 && (
          <section className="mb-12">
            <SectionHeader
              label={isFa ? "انتخاب سردبیر" : "Editor's Picks"}
              eyebrow={isFa ? "محتوای برگزیده" : "CURATED CONTENT"}
              href={`/${locale}/articles/editors-picks`}
              linkLabel={isFa ? "مشاهده همه" : "See all"}
              isFa={isFa}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {picks.map(a => <ArticleCard key={a.id} article={a} locale={locale} isFa={isFa} />)}
            </div>
          </section>
        )}

        {/* Main content area */}
        <div className={view === "feed" ? "grid grid-cols-1 lg:grid-cols-3 gap-8" : ""}>
          <div className={view === "feed" ? "lg:col-span-2 space-y-8" : "space-y-6"}>

            {/* Latest articles header (feed) */}
            {view === "feed" && (
              <SectionHeader
                label={isFa ? "جدیدترین مقالات" : "Latest Articles"}
                eyebrow={isFa ? "به‌روزترین محتوا" : "RECENTLY PUBLISHED"}
                isFa={isFa}
              />
            )}

            {/* Category filter (non-feed) */}
            {view !== "feed" && feed.categories.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {["ALL", ...feed.categories.map(c => c.slug)].map(s => {
                  const cat = feed.categories.find(c => c.slug === s);
                  const label = s === "ALL"
                    ? (isFa ? "همه دسته‌بندی‌ها" : "All Categories")
                    : (isFa ? (cat?.nameFa ?? s) : (cat?.name ?? s));
                  return (
                    <button key={s} onClick={() => setCatFilter(s)}
                      className={`text-xs px-3.5 py-1.5 rounded-full border transition-all font-mono ${
                        catFilter === s
                          ? "border-signal text-signal bg-signal/8 font-semibold"
                          : "border-line/60 text-muted hover:border-signal/30 hover:text-ink"
                      }`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            {articles.length === 0 ? (
              <div className="flex flex-col items-center py-20 border border-line/30 rounded-2xl bg-surface/30">
                <div className="w-12 h-12 rounded-full border border-line/40 bg-surface2 flex items-center justify-center mb-4">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-faint">
                    <path fillRule="evenodd" d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Z" clipRule="evenodd"/>
                  </svg>
                </div>
                <p className="text-muted text-sm">{isFa ? "مقاله‌ای یافت نشد" : "No articles found"}</p>
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
              {trending.length > 0 && (
                <section className="rounded-xl border border-line/40 bg-surface/40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-line/30 flex items-center justify-between"
                    style={{ background: "linear-gradient(90deg, rgba(30,200,164,0.05) 0%, transparent 100%)" }}>
                    <div className="flex items-center gap-2">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-warn">
                        <path fillRule="evenodd" d="M12.577 4.878a.75.75 0 0 1 .919-.53l4.78 1.281a.75.75 0 0 1 .531.919l-1.281 4.78a.75.75 0 0 1-1.449-.387l.81-3.022a19.407 19.407 0 0 0-5.594 5.203.75.75 0 0 1-1.139.093L7 10.06l-4.72 4.72a.75.75 0 0 1-1.06-1.061l5.25-5.25a.75.75 0 0 1 1.06 0l3.074 3.073a20.923 20.923 0 0 1 5.545-5.062l-3.041-.815a.75.75 0 0 1-.53-.919Z" clipRule="evenodd"/>
                      </svg>
                      <p className="text-[10px] font-bold text-ink uppercase tracking-wider">
                        {isFa ? "پرطرفدار" : "Trending"}
                      </p>
                    </div>
                    <Link href={`/${locale}/articles/trending`} className="text-[10px] text-signal/70 hover:text-signal font-mono transition-colors">
                      {isFa ? "همه" : "All"}
                    </Link>
                  </div>
                  <div className="p-3 flex flex-col gap-1">
                    {trending.map((a, idx) => (
                      <Link key={a.id} href={`/${locale}/articles/${a.slug}`}
                        className="group flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-surface2/60 transition-all">
                        <span className="w-5 h-5 rounded-md bg-surface3 flex items-center justify-center text-[9px] font-bold text-faint font-mono shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-muted group-hover:text-ink transition-colors line-clamp-2 leading-snug">
                            {a.title}
                          </p>
                          <p className="text-[10px] text-faint mt-1">
                            {fmtNum(a.viewCount)} {isFa ? "بازدید" : "views"} · {a.readingTimeMinutes}{isFa ? "د" : "m"}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                  <div className="px-4 py-2.5 border-t border-line/20">
                    <Link href={`/${locale}/articles/trending`}
                      className="text-[10px] text-signal/70 hover:text-signal font-mono transition-colors">
                      {isFa ? "مشاهده همه پرطرفدارها →" : "View all trending →"}
                    </Link>
                  </div>
                </section>
              )}

              {/* Top Authors */}
              {feed.topAuthors.length > 0 && (
                <section>
                  <SectionHeader
                    label={isFa ? "نویسندگان برتر" : "Top Experts"}
                    href={`/${locale}/articles/authors`}
                    linkLabel={isFa ? "همه" : "All"}
                    isFa={isFa}
                  />
                  <div className="flex flex-col gap-2.5">
                    {feed.topAuthors.slice(0, 4).map(a => (
                      <AuthorCard key={a.id} author={a} locale={locale} isFa={isFa} />
                    ))}
                  </div>
                </section>
              )}

              {/* Categories */}
              {feed.categories.length > 0 && (
                <section className="rounded-xl border border-line/40 bg-surface/40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-line/30 flex items-center justify-between"
                    style={{ background: "linear-gradient(90deg, rgba(30,200,164,0.05) 0%, transparent 100%)" }}>
                    <p className="text-[10px] font-bold text-ink uppercase tracking-wider">
                      {isFa ? "دسته‌بندی‌ها" : "Categories"}
                    </p>
                    <Link href={`/${locale}/articles/categories`} className="text-[10px] text-signal/70 hover:text-signal font-mono transition-colors">
                      {isFa ? "همه" : "All"}
                    </Link>
                  </div>
                  <div className="p-2">
                    {feed.categories.slice(0, 10).map(c => (
                      <Link key={c.slug} href={`/${locale}/articles/category/${c.slug}`}
                        className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface2/60 transition-colors group">
                        <span className="text-xs text-muted group-hover:text-ink transition-colors">
                          {isFa ? c.nameFa : c.name}
                        </span>
                        {c.articleCount != null && (
                          <span className="text-[9px] text-faint font-mono tabular-nums">{c.articleCount}</span>
                        )}
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </aside>
          )}
        </div>

        {/* Expert network (feed bottom) */}
        {view === "feed" && feed.topAuthors.length > 0 && (
          <section className="mt-14 pt-10 border-t border-line/30">
            <SectionHeader
              label={isFa ? "شبکه متخصصان" : "Expert Network"}
              eyebrow={isFa ? "نویسندگان تأییدشده" : "VERIFIED AUTHORS"}
              href={`/${locale}/articles/authors`}
              linkLabel={isFa ? "مشاهده همه متخصصان" : "View all experts"}
              isFa={isFa}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {feed.topAuthors.slice(0, 6).map(a => (
                <Link key={a.id} href={`/${locale}/articles/author/${a.handle}`}
                  className="group flex gap-4 p-5 rounded-xl border border-line/40 hover:border-signal/20 bg-surface/60 hover:bg-surface2/40 hover:shadow-[0_0_20px_rgba(30,200,164,0.05)] transition-all duration-200">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-signal/25 to-ice/15 border border-signal/25 flex items-center justify-center text-lg font-bold text-signal shrink-0">
                    {a.displayName.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className="text-sm font-bold text-ink group-hover:text-signal transition-colors truncate">{a.displayName}</p>
                      {a.verifiedExpert && <VerifiedIcon size="xs" />}
                    </div>
                    <p className="text-[10px] text-faint truncate mb-2">{a.roleTitle ?? a.company}</p>
                    <div className="flex items-center gap-3 text-[10px] text-faint">
                      <span>{a.articleCount} {isFa ? "مقاله" : "articles"}</span>
                      <span className="text-line">·</span>
                      <span>{fmtNum(a.followerCount)} {isFa ? "دنبال‌کننده" : "followers"}</span>
                    </div>
                    {a.industrialCredibilityScore && (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-0.5 rounded-full bg-surface3 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-signal to-ice"
                            style={{ width: `${(a.industrialCredibilityScore / 10) * 100}%` }} />
                        </div>
                        <span className="text-[9px] font-mono text-signal shrink-0">{a.industrialCredibilityScore.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
