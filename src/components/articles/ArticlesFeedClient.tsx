"use client";

import { useState, useMemo } from "react";
import Link                  from "next/link";
import { usePathname }       from "next/navigation";
import { useTranslations }   from "next-intl";
import type { ArticleListItem, ArticleAuthorProfile, ArticleCategory, ArticleFeed } from "@/lib/articles/types";
import { formatDate } from "@/lib/i18n/format";

// ── Persian content overlay map (slug → FA title/subtitle/excerpt) ───────────
// NOTE: This is localized ARTICLE CONTENT for seed/mock articles (not UI chrome),
// so it stays as data — it is not part of the message-catalog extraction.

const FA_ARTICLE_MAP: Record<string, { title: string; subtitle?: string; excerpt?: string }> = {
  "siemens-s7-1500-programming-best-practices": {
    title:    "بهترین شیوه‌های برنامه‌نویسی PLC زیمنس S7-1500",
    subtitle: "راهنمای جامع ساختاردهی و بهینه‌سازی پروژه‌های TIA Portal V18",
    excerpt:  "الگوهای برنامه‌نویسی اثبات‌شده، قراردادهای نام‌گذاری و ملاحظات ایمنی برای پروژه‌های PLC مقیاس‌بزرگ در محیط‌های صنعتی پرتقاضا.",
  },
  "scada-modernization-tehran-refinery-case-study": {
    title:    "مدرن‌سازی SCADA در پالایشگاه تهران: مطالعه موردی",
    subtitle: "مهاجرت ۱۸ ماهه از DCS قدیمی به SCADA مدرن بدون وقفه تولید",
    excerpt:  "جایگزینی DCS ۲۵ ساله در واحد تقطیر خام با ظرفیت ۱۵۰٬۰۰۰ بشکه در روز، با حفظ تولید پیوسته و صرفه‌جویی ۴.۹ میلیون دلاری.",
  },
  "predictive-maintenance-vibration-analysis-field-results": {
    title:    "نگهداری پیش‌بینانه با آنالیز ارتعاشات: نتایج ۱۸ ماهه میدانی",
    subtitle: "نتایج کمّی پایش آنلاین ارتعاشات روی ۶۴ ماشین دوار در فولاد مبارکه",
    excerpt:  "نرخ تشخیص ۹۰.۳٪، جلوگیری از ۳ خرابی فاجعه‌بار و صرفه‌جویی ۳.۲ میلیون دلاری در هزینه توقف تولید غیرمنتظره.",
  },
  "iec-61850-substation-protection-implementation": {
    title:    "پیاده‌سازی IEC 61850 در حفاظت پست‌های فشار قوی",
    subtitle: "راهنمای عملی GOOSE Messaging و Sampled Values در طرح‌های حفاظتی مدرن",
    excerpt:  "راهنمای گام‌به‌گام IEC 61850 در اتوماسیون پست برق: پیام‌رسانی GOOSE، مقادیر نمونه‌گیری‌شده، پیکربندی IED با فایل‌های SCL.",
  },
  "vfd-motor-overheating-high-temperature-troubleshooting": {
    title:    "عیب‌یابی اضافه‌حرارت موتور VFD در محیط‌های با دمای بالا",
    subtitle: "تشخیص سیستماتیک تریپ حرارتی موتورهای ۲۵۰kW کمپرسور یک کارخانه سیمان",
    excerpt:  "مطالعه موردی تریپ‌های مکرر اضافه‌بار حرارتی در دمای محیط ۵۲°C: علت ریشه‌ای هارمونیک‌های EDM و راهکارهای اصلاحی.",
  },
  "opc-ua-server-implementation-process-integration": {
    title:    "پیاده‌سازی سرور OPC-UA برای یکپارچه‌سازی داده فرآیندی",
    subtitle: "معماری امن و مقیاس‌پذیر OPC-UA برای یکپارچه‌سازی داده در سطح کارخانه",
    excerpt:  "راهنمای عملی سرور OPC-UA: طراحی فضای آدرس، انتخاب مدل امنیتی (IEC 62541) و تنظیم عملکرد برای پایگاه‌های بزرگ.",
  },
  "ai-anomaly-detection-gas-turbine": {
    title:    "تشخیص ناهنجاری با هوش مصنوعی در سیستم‌های توربین گاز",
    subtitle: "چگونه مدل‌های یادگیری ماشین تشخیص خرابی در جریان‌های سنسور توربین را متحول می‌کنند",
    excerpt:  "معماری LSTM Autoencoder و نتایج ۶ ماهه عملیاتی روی توربین ۵۰ مگاواتی: بازیابی ۹۴٪ با نرخ مثبت کاذب ۲.۱٪.",
  },
  "digital-twin-pump-station-roi-analysis": {
    title:    "دوقلوی دیجیتال ایستگاه پمپاژ: تحلیل ROI پس از ۲۴ ماه",
    subtitle: "بازگشت سرمایه کمّی از دوقلوی دیجیتال با شبیه‌سازی هیدرولیکی آنی",
    excerpt:  "تحلیل ۲۴ ماهه ROI: ۱۸.۳٪ صرفه‌جویی انرژی، ۴۸۰ هزار یورو پس‌انداز کل، بازگشت سرمایه ۷.۴ برابری (۷۴۲٪).",
  },
  "ot-cybersecurity-scada-protection": {
    title:    "امنیت سایبری OT: حفاظت SCADA در برابر تهدیدات مدرن",
    subtitle: "راهنمای عملی پیاده‌سازی IEC 62443 در محیط‌های فناوری عملیاتی",
    excerpt:  "چارچوب آزموده‌شده برای امنیت ICS: از بخش‌بندی شبکه و سخت‌سازی نقطه پایانی تا رویه‌های واکنش به حادثه.",
  },
  "future-industrial-ai-cognitive-automation": {
    title:    "آینده هوش مصنوعی صنعتی: از سیستم‌های قانون‌محور تا اتوماسیون شناختی",
    subtitle: "چشم‌انداز مهندسی از مسیر هوش ماشین در سیستم‌های صنعتی",
    excerpt:  "با ورود مدل‌های یادگیری ماشین به بهینه‌سازی فرآیند و تصمیم‌گیری خودمختار، نقش مهندس صنعتی از اپراتور به ناظر هوش مصنوعی ارتقا می‌یابد.",
  },
  "bearing-failure-analysis-2mw-induction-motor": {
    title:    "آنالیز خرابی: شکست فاجعه‌بار بلبرینگ در موتور القایی ۲.۲ مگاواتی",
    subtitle: "تحلیل ریشه‌ای متالورژیکی و عملیاتی خرابی بلبرینگ موتور کیلن سیمان",
    excerpt:  "خرابی بلبرینگ که ۴ روز توقف تولید ایجاد کرد. علت ریشه‌ای: آسیب EDM از جریان‌های شافت ناشی از عملکرد اینورتر VFD.",
  },
  "sil-verification-process-plants-guide": {
    title:    "تأیید سطح یکپارچگی ایمنی (SIL): راهنمای گام‌به‌گام برای واحدهای فرآیندی",
    subtitle: "مرور عملی تأیید SIL طبق IEC 61511 برای سیستم ESD فشار بالا",
    excerpt:  "فرآیند کامل تأیید SIL: تحلیل LOPA، تعیین SIL 2، محاسبه PFD با معماری 1oo2 و مستندسازی الزامات IEC 61511.",
  },
};

function getDisplay(article: { title: string; slug: string; subtitle?: string | null; excerpt?: string | null }, isFa: boolean) {
  if (!isFa) return { title: article.title, subtitle: article.subtitle ?? null, excerpt: article.excerpt ?? null, titleEn: null as string | null };
  const fa = FA_ARTICLE_MAP[article.slug];
  return {
    title:    fa?.title    ?? article.title,
    subtitle: fa?.subtitle ?? (article.subtitle ?? null),
    excerpt:  fa?.excerpt  ?? (article.excerpt  ?? null),
    titleEn:  fa ? article.title : null,
  };
}

// ── Content-type badge/bar colors (enum → CSS class; not user-facing text) ────

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

function QualityBadge({ score }: { score?: number | null }) {
  const t = useTranslations("journal");
  if (!score) return null;
  if (score >= 9.5) return (
    <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-mono bg-signal/10 text-signal border border-signal/20 uppercase tracking-wide">
      <span className="w-1.5 h-1.5 rounded-full bg-signal inline-block" />
      {t("badge.top")}
    </span>
  );
  if (score >= 8.5) return (
    <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-mono bg-ice/10 text-ice border border-ice/20 uppercase tracking-wide">
      <span className="w-1.5 h-1.5 rounded-full bg-ice inline-block" />
      {t("badge.high")}
    </span>
  );
  return null;
}

function fmtDate(d?: string | null, locale = "en") {
  if (!d) return "";
  return formatDate(d, locale, { year: "numeric", month: "short", day: "numeric" });
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
          {/* isFa here flips the arrow for RTL — CSS direction, not user-facing text */}
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
  const t = useTranslations("journal");
  const typeKey   = `contentType.${article.contentType}`;
  const typeLabel = t.has(typeKey) ? t(typeKey) : article.contentType;
  const href      = `/${locale}/articles/${article.slug}`;
  const catHref   = article.category ? `/${locale}/articles/category/${article.category.slug}` : null;
  const authorHref = `/${locale}/articles/author/${article.author.handle}`;

  const display = getDisplay(article, isFa);

  if (size === "compact") return (
    <Link href={href}
      className="group flex gap-3 items-start p-3.5 rounded-xl border border-line/40 hover:border-signal/20 bg-surface/60 hover:bg-surface2/60 transition-all duration-150">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wider ${contentTypeBadgeColor(article.contentType)}`}>
            {typeLabel}
          </span>
          {article.knowledgeMetadata?.humanReviewed && (
            <span className="hs-badge hs--knowledge text-[9px]">{t("badge.reviewed")}</span>
          )}
        </div>
        <h3 className="text-xs font-semibold text-ink group-hover:text-signal transition-colors line-clamp-2 leading-snug mb-1.5">{display.title}</h3>
        <div className="flex items-center gap-2 text-[10px] text-faint">
          <span className="truncate max-w-[80px]">{article.author.displayName}</span>
          <span className="text-line">·</span>
          <span>{article.readingTimeMinutes}{t("readingUnit")}</span>
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
          <span className="hs-badge hs--knowledge">{t("badge.editorsPick")}</span>
          {catHref && article.category && (
            <Link href={catHref}
              className="text-[10px] px-2.5 py-0.5 rounded-full border border-signal/30 text-signal hover:bg-signal/10 transition-colors font-mono uppercase tracking-wider">
              {isFa ? (article.category.nameFa ?? article.category.name) : article.category.name}
            </Link>
          )}
          {article.knowledgeMetadata?.safetyCritical && (
            <span className="hs-badge hs--risk">{t("badge.safetyCritical")}</span>
          )}
          <QualityBadge score={article.knowledgeMetadata?.articleQualityScore} />
        </div>

        {/* Title */}
        <Link href={href}>
          {display.titleEn && (
            <p className="text-[10px] text-faint font-mono mb-2 tracking-wide opacity-70">{display.titleEn}</p>
          )}
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-ink hover:text-signal transition-colors leading-tight mb-4 max-w-2xl">
            {display.title}
          </h2>
        </Link>

        {/* Subtitle / excerpt */}
        {(display.subtitle ?? display.excerpt) && (
          <p className="text-base text-muted leading-relaxed mb-8 max-w-xl line-clamp-3">
            {display.subtitle ?? display.excerpt}
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
            <span>{fmtDate(article.publishedAt, locale)}</span>
            <span className="text-line">·</span>
            <span>{article.readingTimeMinutes} {t("minRead")}</span>
            <span className="text-line">·</span>
            <span>{fmtNum(article.viewCount)} {t("viewsUnit")}</span>
          </div>
        </div>

        {/* CTA */}
        <Link href={href}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-signal text-bg text-sm font-bold hover:bg-signal/90 transition-colors">
          {t("readArticle")}
          <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 ${isFa ? "rotate-180" : ""}`}>
            <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd"/>
          </svg>
        </Link>
      </div>
    </div>
  );

  // Normal card
  return (
    <div className="hs-card-depth group rounded-xl border border-line/40 bg-surface hover:border-signal/20 flex flex-col overflow-hidden">
      {/* Content type color bar */}
      <div className={`h-0.5 w-full bg-gradient-to-r ${contentTypeBarColor(article.contentType)}`} />

      <div className="p-5 flex-1 flex flex-col">
        {/* Badges row */}
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wider ${contentTypeBadgeColor(article.contentType)}`}>
            {typeLabel}
          </span>
          {article.author.verifiedExpert && (
            <span className="hs-badge hs--knowledge text-[9px]">{t("badge.expert")}</span>
          )}
          <QualityBadge score={article.knowledgeMetadata?.articleQualityScore} />
        </div>

        {/* Title + excerpt */}
        <Link href={href} className="flex-1">
          {display.titleEn && (
            <p className="text-[9px] text-faint font-mono mb-1 truncate opacity-60">{display.titleEn}</p>
          )}
          <h3 className="font-bold text-ink group-hover:text-signal transition-colors leading-snug mb-2 line-clamp-2 text-[0.9375rem]">
            {display.title}
          </h3>
          {display.excerpt && (
            <p className="text-sm text-muted leading-relaxed line-clamp-2">{display.excerpt}</p>
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
          <span>{article.readingTimeMinutes}{t("readingUnit")}</span>
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

function AuthorCard({ author, locale }: { author: ArticleAuthorProfile; locale: string }) {
  return (
    <Link href={`/${locale}/articles/author/${author.handle}`}
      className="hs-card-depth group flex gap-3 items-start p-4 rounded-xl border border-line/40 hover:border-signal/20 bg-surface/60 hover:bg-surface2/40">
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

function JournalMasthead({ locale }: { locale: string }) {
  const t = useTranslations("journal");
  const chips   = t.raw("masthead.chips") as string[];
  const metrics = t.raw("masthead.metrics") as { value: string; label: string }[];
  // metric "live" flags are presentation, keyed by index (1st and 4th pulse)
  const liveIdx = new Set([0, 3]);

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

      <div className="relative max-w-[1400px] mx-auto px-6 py-10 md:py-14">
        <div className="max-w-3xl">
          <p className="eyebrow-mono text-signal mb-3 tracking-[0.2em]">
            {t("brandUpper")}
          </p>
          <h1 className="text-3xl md:text-5xl font-bold text-ink leading-tight mb-3">
            {t("knowledgeNetwork")}
          </h1>
          <p className="text-base text-muted leading-relaxed max-w-xl mb-6">
            {t("masthead.lede")}
          </p>

          {/* Editorial metrics strip */}
          <div className="flex flex-wrap gap-5 mb-6 ps-0.5">
            {metrics.map((m, i) => (
              <div key={m.label} className="flex items-center gap-2">
                {liveIdx.has(i) && <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse shrink-0" />}
                <span className="text-lg font-bold text-ink font-mono">{m.value}</span>
                <span className="text-[10px] text-faint uppercase tracking-wide">{m.label}</span>
              </div>
            ))}
          </div>

          {/* Signal chips */}
          <div className="flex flex-wrap gap-2 mb-6">
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
              {t("browseCategories")}
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd"/>
              </svg>
            </Link>
            <Link href={`/${locale}/articles/write`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-signal/25 text-signal text-sm font-bold hover:bg-signal/8 transition-colors">
              {t("writeArticlePlus")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── View Header (for sub-views) ───────────────────────────────────────────────

function ViewHeader({ view, articleCount, isFa }: {
  view: string; articleCount: number; isFa: boolean;
}) {
  const t = useTranslations("journal");
  const views: Record<string, { title: string; eyebrow: string }> = {
    trending:        { title: t("viewHeader.trendingTitle"),    eyebrow: t("viewHeader.trendingEyebrow") },
    latest:          { title: t("viewHeader.latestTitle"),      eyebrow: t("viewHeader.latestEyebrow") },
    "editors-picks": { title: t("viewHeader.picksTitle"),       eyebrow: t("viewHeader.picksEyebrow") },
    "case-studies":  { title: t("viewHeader.caseStudiesTitle"), eyebrow: t("viewHeader.caseStudiesEyebrow") },
  };
  const v = views[view] ?? { title: t("viewHeader.defaultTitle"), eyebrow: t("viewHeader.defaultEyebrow") };

  return (
    <div className="relative border-b border-line/30 overflow-hidden"
      style={{ background: "linear-gradient(180deg, rgba(30,200,164,0.04) 0%, transparent 100%)" }}>
      <div className="max-w-[1400px] mx-auto px-6 py-10">
        <p className="eyebrow-mono text-signal text-[9px] mb-2 tracking-[0.2em]">
          {t("viewHeaderBrand")}
          {v.eyebrow}
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <h1 className="text-3xl font-bold text-ink">{v.title}</h1>
          <span className="text-sm text-faint font-mono mb-1">
            {articleCount} {t("articlesUnit")}
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
  const t = useTranslations("journal");
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

  const topNav = [
    { href: `/articles`,           label: t("topNav.feed") },
    { href: `/articles/trending`,   label: t("topNav.trending") },
    { href: `/articles/latest`,     label: t("topNav.latest") },
    { href: `/articles/authors`,    label: t("topNav.experts") },
    { href: `/articles/categories`, label: t("topNav.categories") },
  ];

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
                  <p className="text-[10px] text-faint leading-none mt-0.5">{t("knowledgeNetwork")}</p>
                </div>
              </div>
              <nav className="hidden md:flex items-center gap-0.5">
                {topNav.map(l => {
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
                  placeholder={t("searchPlaceholder")}
                  className="text-[11px] text-ink rounded-lg px-3 py-1.5 ps-8 focus:outline-none w-44 placeholder:text-faint transition-all"
                  style={{
                    background: "rgba(6,8,13,0.75)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    backdropFilter: "blur(8px)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                  }}
                  onFocus={e => { (e.target as HTMLInputElement).style.borderColor = "rgba(30,200,164,0.35)"; (e.target as HTMLInputElement).style.boxShadow = "0 0 0 1px rgba(30,200,164,0.15), inset 0 1px 0 rgba(255,255,255,0.03)"; }}
                  onBlur={e  => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.07)"; (e.target as HTMLInputElement).style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.03)"; }}
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
                {t("write")}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Journal masthead (feed view only) */}
      {view === "feed" && <JournalMasthead locale={locale} />}

      {/* View header (sub-views) */}
      {view !== "feed" && (
        <ViewHeader view={view} articleCount={articles.length} isFa={isFa} />
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
              label={t("sections.editorsPicks")}
              eyebrow={t("sections.curatedContent")}
              href={`/${locale}/articles/editors-picks`}
              linkLabel={t("seeAll")}
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
                label={t("sections.latestArticles")}
                eyebrow={t("sections.recentlyPublished")}
                isFa={isFa}
              />
            )}

            {/* Category filter (non-feed) */}
            {view !== "feed" && feed.categories.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {["ALL", ...feed.categories.map(c => c.slug)].map(s => {
                  const cat = feed.categories.find(c => c.slug === s);
                  const label = s === "ALL"
                    ? t("allCategories")
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
                <p className="text-muted text-sm">{t("noArticles")}</p>
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
                        {t("sections.trending")}
                      </p>
                    </div>
                    <Link href={`/${locale}/articles/trending`} className="text-[10px] text-signal/70 hover:text-signal font-mono transition-colors">
                      {t("all")}
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
                            {(isFa ? FA_ARTICLE_MAP[a.slug]?.title : null) ?? a.title}
                          </p>
                          <p className="text-[10px] text-faint mt-1">
                            {fmtNum(a.viewCount)} {t("viewsUnit")} · {a.readingTimeMinutes}{t("readingUnit")}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                  <div className="px-4 py-2.5 border-t border-line/20">
                    <Link href={`/${locale}/articles/trending`}
                      className="text-[10px] text-signal/70 hover:text-signal font-mono transition-colors">
                      {t("sections.viewAllTrending")}
                    </Link>
                  </div>
                </section>
              )}

              {/* Top Authors */}
              {feed.topAuthors.length > 0 && (
                <section>
                  <SectionHeader
                    label={t("sections.topExperts")}
                    href={`/${locale}/articles/authors`}
                    linkLabel={t("all")}
                    isFa={isFa}
                  />
                  <div className="flex flex-col gap-2.5">
                    {feed.topAuthors.slice(0, 4).map(a => (
                      <AuthorCard key={a.id} author={a} locale={locale} />
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
                      {t("sections.categories")}
                    </p>
                    <Link href={`/${locale}/articles/categories`} className="text-[10px] text-signal/70 hover:text-signal font-mono transition-colors">
                      {t("all")}
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
              label={t("sections.expertNetwork")}
              eyebrow={t("sections.verifiedAuthors")}
              href={`/${locale}/articles/authors`}
              linkLabel={t("sections.viewAllExperts")}
              isFa={isFa}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {feed.topAuthors.slice(0, 6).map(a => (
                <Link key={a.id} href={`/${locale}/articles/author/${a.handle}`}
                  className="hs-card-depth group flex gap-4 p-5 rounded-xl border border-line/40 hover:border-signal/20 bg-surface/60 hover:bg-surface2/40">
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
                      <span>{a.articleCount} {t("articlesUnit")}</span>
                      <span className="text-line">·</span>
                      <span>{fmtNum(a.followerCount)} {t("followersUnit")}</span>
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
