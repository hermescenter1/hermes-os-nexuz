"use client";

import { useState }  from "react";
import Link            from "next/link";
import { useLocale }   from "next-intl";
import type { ArticleDetail, ArticleListItem } from "@/lib/articles/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONTENT_TYPE_LABELS: Record<string, { en: string; fa: string }> = {
  TECHNICAL_ARTICLE:        { en: "Technical Article",        fa: "مقاله فنی"              },
  INDUSTRIAL_CASE_STUDY:    { en: "Industrial Case Study",    fa: "مطالعه موردی صنعتی"     },
  TROUBLESHOOTING_REPORT:   { en: "Troubleshooting Report",   fa: "گزارش عیب‌یابی"         },
  PROJECT_REPORT:           { en: "Project Report",           fa: "گزارش پروژه"            },
  MAINTENANCE_INSIGHT:      { en: "Maintenance Insight",      fa: "بینش نگهداشت"           },
  PLC_SCADA_TUTORIAL:       { en: "PLC/SCADA Tutorial",       fa: "آموزش PLC/SCADA"        },
  FAILURE_ANALYSIS:         { en: "Failure Analysis",         fa: "آنالیز خرابی"           },
  ASSET_RELIABILITY_NOTE:   { en: "Asset Reliability Note",   fa: "یادداشت قابلیت اطمینان" },
  ENGINEERING_OPINION:      { en: "Engineering Opinion",      fa: "دیدگاه مهندسی"         },
  RESEARCH_SUMMARY:         { en: "Research Summary",         fa: "خلاصه پژوهش"           },
  FIELD_COMMISSIONING_NOTE: { en: "Field Commissioning Note", fa: "یادداشت راه‌اندازی"     },
  SAFETY_COMPLIANCE_NOTE:   { en: "Safety & Compliance",      fa: "ایمنی و انطباق"         },
};

const FA_ARTICLE_MAP: Record<string, { title: string; subtitle?: string; excerpt?: string }> = {
  "siemens-s7-1500-programming-best-practices": {
    title:    "بهترین شیوه‌های برنامه‌نویسی PLC زیمنس S7-1500",
    subtitle: "راهنمای جامع ساختاردهی و بهینه‌سازی پروژه‌های TIA Portal V18",
  },
  "scada-modernization-tehran-refinery-case-study": {
    title:    "مدرن‌سازی SCADA در پالایشگاه تهران: مطالعه موردی",
    subtitle: "مهاجرت ۱۸ ماهه از DCS قدیمی به SCADA مدرن بدون وقفه تولید",
  },
  "predictive-maintenance-vibration-analysis-field-results": {
    title:    "نگهداری پیش‌بینانه با آنالیز ارتعاشات: نتایج ۱۸ ماهه میدانی",
    subtitle: "نتایج کمّی پایش آنلاین ارتعاشات روی ۶۴ ماشین دوار در فولاد مبارکه",
  },
  "iec-61850-substation-protection-implementation": {
    title:    "پیاده‌سازی IEC 61850 در حفاظت پست‌های فشار قوی",
    subtitle: "راهنمای عملی GOOSE Messaging و Sampled Values در طرح‌های حفاظتی مدرن",
  },
  "vfd-motor-overheating-high-temperature-troubleshooting": {
    title:    "عیب‌یابی اضافه‌حرارت موتور VFD در محیط‌های با دمای بالا",
    subtitle: "تشخیص سیستماتیک تریپ حرارتی موتورهای ۲۵۰kW کمپرسور یک کارخانه سیمان",
  },
  "opc-ua-server-implementation-process-integration": {
    title:    "پیاده‌سازی سرور OPC-UA برای یکپارچه‌سازی داده فرآیندی",
    subtitle: "معماری امن و مقیاس‌پذیر OPC-UA برای یکپارچه‌سازی داده در سطح کارخانه",
  },
  "ai-anomaly-detection-gas-turbine": {
    title:    "تشخیص ناهنجاری با هوش مصنوعی در سیستم‌های توربین گاز",
    subtitle: "چگونه مدل‌های یادگیری ماشین تشخیص خرابی در جریان‌های سنسور توربین را متحول می‌کنند",
  },
  "digital-twin-pump-station-roi-analysis": {
    title:    "دوقلوی دیجیتال ایستگاه پمپاژ: تحلیل ROI پس از ۲۴ ماه",
    subtitle: "بازگشت سرمایه کمّی از دوقلوی دیجیتال با شبیه‌سازی هیدرولیکی آنی",
  },
  "ot-cybersecurity-scada-protection": {
    title:    "امنیت سایبری OT: حفاظت SCADA در برابر تهدیدات مدرن",
    subtitle: "راهنمای عملی پیاده‌سازی IEC 62443 در محیط‌های فناوری عملیاتی",
  },
  "future-industrial-ai-cognitive-automation": {
    title:    "آینده هوش مصنوعی صنعتی: از سیستم‌های قانون‌محور تا اتوماسیون شناختی",
    subtitle: "چشم‌انداز مهندسی از مسیر هوش ماشین در سیستم‌های صنعتی",
  },
  "bearing-failure-analysis-2mw-induction-motor": {
    title:    "آنالیز خرابی: شکست فاجعه‌بار بلبرینگ در موتور القایی ۲.۲ مگاواتی",
    subtitle: "تحلیل ریشه‌ای متالورژیکی و عملیاتی خرابی بلبرینگ موتور کیلن سیمان",
  },
  "sil-verification-process-plants-guide": {
    title:    "تأیید سطح یکپارچگی ایمنی (SIL): راهنمای گام‌به‌گام برای واحدهای فرآیندی",
    subtitle: "مرور عملی تأیید SIL طبق IEC 61511 برای سیستم ESD فشار بالا",
  },
};

function fmtDate(d?: string | null, isFa = false) {
  if (!d) return "";
  const date = new Date(d);
  if (isFa) {
    try { return date.toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" }); }
    catch { return date.toLocaleDateString(); }
  }
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function contentTypeBadgeColor(t: string) {
  if (t === "FAILURE_ANALYSIS" || t === "SAFETY_COMPLIANCE_NOTE") return "bg-danger/[0.10] text-danger border-danger/20";
  if (t === "TROUBLESHOOTING_REPORT") return "bg-warn/[0.10] text-warn border-warn/20";
  if (t === "INDUSTRIAL_CASE_STUDY")  return "bg-hermes-gold/[0.12] text-hermes-gold border-hermes-gold/20";
  if (t === "ENGINEERING_OPINION")    return "bg-ice/[0.10] text-ice border-ice/20";
  return "bg-signal/[0.08] text-signal border-signal/20";
}

// ── Safe content renderer ─────────────────────────────────────────────────────
// Renders plain-text markdown as styled React nodes (no HTML injection).

function ArticleContent({ content, isFa }: { content: string; isFa: boolean }) {
  const blocks = content.split(/\n{2,}/).filter(b => b.trim());
  return (
    <div className={`space-y-6 ${isFa ? "font-body" : ""}`}>
      {blocks.map((block, i) => {
        const t = block.trim();
        if (t.startsWith("### "))
          return (
            <h3 key={i} className="text-xl font-bold text-ink mt-10 mb-3">
              <span className="inline-flex items-center gap-2">
                <span className="w-1 h-5 rounded-full bg-signal/50 inline-block" />
                {t.slice(4)}
              </span>
            </h3>
          );
        if (t.startsWith("## "))
          return (
            <h2 key={i} className="text-2xl font-bold text-ink mt-12 mb-4 pb-3 border-b border-signal/15">
              {t.slice(3)}
            </h2>
          );
        if (t.startsWith("# "))
          return <h1 key={i} className="text-3xl font-bold text-ink mt-14 mb-5">{t.slice(2)}</h1>;
        if (t.startsWith("```")) {
          const code = t.replace(/^```\w*\n?/, "").replace(/```$/, "").trim();
          return (
            <div key={i} className="relative group">
              <div className="absolute top-3 end-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[9px] font-mono text-signal/60 uppercase tracking-wider">code</span>
              </div>
              <pre className="bg-surface2/80 border border-signal/10 rounded-xl p-5 overflow-x-auto text-sm font-mono text-signal/90 leading-relaxed">
                <code>{code}</code>
              </pre>
            </div>
          );
        }
        if (t.startsWith("- ") || t.startsWith("* ")) {
          const items = t.split("\n").filter(l => l.trim().startsWith("- ") || l.trim().startsWith("* "));
          return (
            <ul key={i} className="list-none space-y-2.5 ps-0">
              {items.map((item, j) => (
                <li key={j} className="flex items-start gap-3 text-muted leading-relaxed">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-signal/60 shrink-0" />
                  <span className="text-[0.9375rem]">{item.replace(/^[-*]\s/, "")}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-muted leading-[1.85] text-[0.9375rem]">{t}</p>
        );
      })}
    </div>
  );
}

// ── Trust strip ──────────────────────────────────────────────────────────────
// Shown only for PUBLISHED + PUBLIC articles (enforced by the page server component).
// Displays editorial trust badges and key metrics from real DB fields only.

function TrustStrip({ article, isFa }: { article: ArticleDetail; isFa: boolean }) {
  const showUpdated = article.updatedAt &&
    article.publishedAt &&
    // Only show "Updated" when the article was meaningfully re-edited after publish
    new Date(article.updatedAt).getTime() - new Date(article.publishedAt).getTime() > 86_400_000;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 py-3 px-4 rounded-xl border border-signal/10 bg-signal/[0.03]">
      {/* Editorial Approved badge */}
      <span className="inline-flex items-center gap-1.5 text-[9px] px-2.5 py-1 rounded-full border border-signal/30 text-signal/90 bg-signal/[0.08] font-mono uppercase tracking-wider">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 shrink-0">
          <path fillRule="evenodd" d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd"/>
        </svg>
        {isFa ? "تأییدشده توسط سردبیر" : "Editorial Approved"}
      </span>

      {/* Published Public badge */}
      <span className="inline-flex items-center gap-1.5 text-[9px] px-2.5 py-1 rounded-full border border-ice/30 text-ice/80 bg-ice/[0.06] font-mono uppercase tracking-wider">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 shrink-0">
          <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.536-4.464a.75.75 0 1 0-1.061-1.061 3.5 3.5 0 0 1-4.95 0 .75.75 0 0 0-1.06 1.06 5 5 0 0 0 7.07 0Zm.343-6.555-.144-.143a.75.75 0 0 0-1.06 1.06l.143.144a.75.75 0 0 0 1.061-1.061Zm-6.779-.21a.75.75 0 0 0 0 1.06l.144.144a.75.75 0 1 0 1.06-1.06l-.143-.144a.75.75 0 0 0-1.061 0Z" clipRule="evenodd"/>
        </svg>
        {isFa ? "مقاله منتشرشده" : "Published Article"}
      </span>

      {/* Right-side meta */}
      <div className="flex flex-wrap items-center gap-3 ms-auto text-[9px] text-faint font-mono">
        {article.viewCount > 0 && (
          <>
            <span>{fmtNum(article.viewCount)} {isFa ? "بازدید" : "views"}</span>
            <span className="text-line">·</span>
          </>
        )}
        <span>{article.readingTimeMinutes} {isFa ? "دقیقه مطالعه" : "min read"}</span>
        {article.publishedAt && (
          <>
            <span className="text-line">·</span>
            <span>{isFa ? "انتشار:" : "Published:"} {fmtDate(article.publishedAt, isFa)}</span>
          </>
        )}
        {showUpdated && (
          <>
            <span className="text-line">·</span>
            <span>{isFa ? "به‌روز:" : "Updated:"} {fmtDate(article.updatedAt, isFa)}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Actions bar ───────────────────────────────────────────────────────────────

function ActionsBar({ article, isFa }: { article: ArticleDetail; isFa: boolean }) {
  const [saved, setSaved]     = useState(false);
  const [reacted, setReacted] = useState<string | null>(null);
  const [copied, setCopied]   = useState(false);

  const reactions = [
    { key: "INSIGHTFUL", en: "Insightful", fa: "بینش‌افزا" },
    { key: "HELPFUL",    en: "Helpful",    fa: "مفید"       },
    { key: "DETAILED",   en: "Detailed",   fa: "جامع"       },
    { key: "PRACTICAL",  en: "Practical",  fa: "کاربردی"    },
  ] as const;

  async function handleSave() {
    const next = !saved;
    setSaved(next);
    await fetch("/api/articles/saved", {
      method: next ? "POST" : "DELETE",
      body:   next ? JSON.stringify({ articleId: article.id }) : undefined,
      headers: { "Content-Type": "application/json" },
    }).catch(() => setSaved(!next));
  }

  async function handleReact(key: string) {
    const next = reacted === key ? null : key;
    setReacted(next);
    await fetch("/api/articles/reactions", {
      method: next ? "POST" : "DELETE",
      ...(next ? { body: JSON.stringify({ articleId: article.id, reactionType: key }), headers: { "Content-Type": "application/json" } } : {}),
    }).catch(() => setReacted(reacted));
  }

  function handleShare() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5 py-5 border-y border-line/30">
      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-faint me-auto font-mono">
        <span>{fmtNum(article.viewCount)} {isFa ? "بازدید" : "views"}</span>
        <span className="text-line">·</span>
        <span>{fmtNum(article.saveCount)} {isFa ? "ذخیره" : "saves"}</span>
        <span className="text-line">·</span>
        <span>{fmtNum(article.reactionCount)} {isFa ? "واکنش" : "reactions"}</span>
      </div>

      {/* Reactions */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {reactions.map(r => (
          <button key={r.key} onClick={() => handleReact(r.key)}
            className={`text-[10px] px-2.5 py-1.5 rounded-full border transition-all font-mono uppercase tracking-wide ${
              reacted === r.key
                ? "border-signal bg-signal/12 text-signal font-semibold"
                : "border-line/60 text-faint hover:border-signal/30 hover:text-ink"
            }`}>
            {isFa ? r.fa : r.en}
          </button>
        ))}
      </div>

      {/* Save */}
      <button onClick={handleSave}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all border font-medium ${
          saved
            ? "border-signal bg-signal/12 text-signal"
            : "border-line/60 text-muted hover:border-signal/30 hover:text-ink"
        }`}>
        <svg viewBox="0 0 20 20" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
          <path d="M5 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14l-5-2.5L5 18V4Z"/>
        </svg>
        {isFa ? "ذخیره" : "Save"}
      </button>

      {/* Share */}
      <button onClick={handleShare}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all font-medium ${
          copied
            ? "border-signal bg-signal/12 text-signal"
            : "border-line/60 text-muted hover:border-signal/30 hover:text-ink"
        }`}>
        {copied ? (
          <>
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd"/>
            </svg>
            {isFa ? "کپی شد" : "Copied"}
          </>
        ) : (
          <>
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.518 2.518 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.474l6.733-3.366A2.52 2.52 0 0 1 13 4.5Z"/>
            </svg>
            {isFa ? "اشتراک‌گذاری" : "Share"}
          </>
        )}
      </button>
    </div>
  );
}

// ── Author card ───────────────────────────────────────────────────────────────

function AuthorCard({ article, isFa, locale }: { article: ArticleDetail; isFa: boolean; locale: string }) {
  const [following, setFollowing] = useState(false);
  const { author } = article;

  async function handleFollow() {
    const next = !following;
    setFollowing(next);
    await fetch("/api/articles/follow", {
      method: next ? "POST" : "DELETE",
      ...(next
        ? { body: JSON.stringify({ authorHandle: author.handle }), headers: { "Content-Type": "application/json" } }
        : {}),
    }).catch(() => setFollowing(!next));
  }

  return (
    <div className="rounded-2xl border border-line/40 overflow-hidden"
      style={{ background: "linear-gradient(145deg, rgba(30,200,164,0.05) 0%, rgba(6,8,13,0.98) 60%)" }}>
      {/* Top bar */}
      <div className="h-0.5 bg-gradient-to-r from-signal/60 via-signal/30 to-transparent" />

      <div className="p-6">
        {/* Author identity */}
        <div className="flex flex-col sm:flex-row gap-5">
          {author.avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={author.avatarUrl}
              alt={`${author.displayName} profile photo`}
              width={64}
              height={64}
              className="w-16 h-16 rounded-full object-cover border-2 border-signal/25 shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-signal/30 to-ice/20 border-2 border-signal/25 flex items-center justify-center text-2xl font-bold text-signal shrink-0">
              {author.displayName.charAt(0)}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <Link href={`/${locale}/articles/author/${author.handle}`}
                    className="text-lg font-bold text-ink hover:text-signal transition-colors">
                    {author.displayName}
                  </Link>
                  {author.verifiedExpert && (
                    <span className="hs-badge hs--knowledge text-[9px]">{isFa ? "متخصص تأییدشده" : "VERIFIED EXPERT"}</span>
                  )}
                </div>
                <p className="text-sm text-muted">{author.roleTitle ?? author.company}</p>
                {author.location && (
                  <p className="text-xs text-faint mt-0.5 flex items-center gap-1">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 opacity-60">
                      <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 0 0 .281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 1 0 3 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 0 0 2.273 1.765 11.842 11.842 0 0 0 .994.573l.018.008.006.003ZM10 11.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" clipRule="evenodd"/>
                    </svg>
                    {author.location}
                  </p>
                )}
              </div>
              <button onClick={handleFollow}
                className={`shrink-0 text-xs px-4 py-2 rounded-lg border-2 transition-all font-semibold ${
                  following
                    ? "border-signal bg-signal/12 text-signal"
                    : "border-signal text-signal hover:bg-signal/8"
                }`}>
                {following ? (isFa ? "دنبال‌شده" : "Following ✓") : (isFa ? "دنبال کردن" : "Follow")}
              </button>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap items-center gap-5 text-xs text-faint mb-3 font-mono">
              <span>{author.articleCount} {isFa ? "مقاله" : "articles"}</span>
              <span className="text-line">·</span>
              <span>{fmtNum(author.followerCount)} {isFa ? "دنبال‌کننده" : "followers"}</span>
              <span className="text-line">·</span>
              <span>{fmtNum(author.totalViews)} {isFa ? "بازدید" : "views"}</span>
            </div>

            {/* Expertise tags */}
            {author.expertiseAreas.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {author.expertiseAreas.slice(0, 5).map(area => (
                  <span key={area}
                    className="text-[10px] px-2 py-0.5 rounded-full border border-signal/20 text-signal/80 font-mono bg-signal/5">
                    {area}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bio */}
        {author.bio && (
          <div className="mt-5 pt-4 border-t border-line/20">
            <p className="text-sm text-muted leading-relaxed line-clamp-3">{author.bio}</p>
            <Link href={`/${locale}/articles/author/${author.handle}`}
              className="inline-flex items-center gap-1 text-xs text-signal hover:text-signal/80 transition-colors mt-2.5 font-medium">
              {isFa ? "مشاهده پروفایل کامل" : "View full profile"}
              <svg viewBox="0 0 20 20" fill="currentColor" className={`w-3 h-3 ${isFa ? "rotate-180" : ""}`}>
                <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd"/>
              </svg>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Knowledge metadata block ──────────────────────────────────────────────────

function KnowledgeMetaBlock({ article, isFa }: { article: ArticleDetail; isFa: boolean }) {
  const km = article.knowledgeMetadata;
  if (!km || (!km.humanReviewed && !km.knowledgeEligible)) return null;

  const fields: Array<[string, string | null | boolean]> = [
    [isFa ? "حوزه صنعتی" : "Industrial Domain",   km.industrialDomain],
    [isFa ? "نوع دارایی" : "Asset Type",           km.linkedAssetType],
    [isFa ? "تکنولوژی" : "Technology",             km.linkedTechnology],
    [isFa ? "پلتفرم PLC" : "PLC Platform",         km.linkedPLCPlatform],
    [isFa ? "فروشنده" : "Vendor",                  km.linkedVendor],
    [isFa ? "استاندارد" : "Standard",              km.linkedStandard],
    [isFa ? "حوزه نگهداشت" : "Maintenance Domain", km.linkedMaintenanceDomain],
  ].filter(([, val]) => !!val) as Array<[string, string]>;

  return (
    <div className="rounded-xl border border-signal/15 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-signal/10 flex items-center gap-2.5 flex-wrap"
        style={{ background: "linear-gradient(90deg, rgba(30,200,164,0.08) 0%, rgba(30,200,164,0.02) 100%)" }}>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-signal/15 border border-signal/25 flex items-center justify-center">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-signal">
              <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" clipRule="evenodd"/>
            </svg>
          </div>
          <p className="text-xs font-bold text-signal uppercase tracking-wider">
            {isFa ? "متادیتای دانش صنعتی" : "Industrial Knowledge Metadata"}
          </p>
        </div>
        <div className="flex items-center gap-2 ms-auto flex-wrap">
          {km.humanReviewed && (
            <span className="hs-badge hs--knowledge text-[9px]">{isFa ? "بررسی انسانی" : "HUMAN REVIEWED"}</span>
          )}
          {km.safetyCritical && (
            <span className="hs-badge hs--risk text-[9px]">{isFa ? "ایمنی بحرانی" : "SAFETY CRITICAL"}</span>
          )}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Quality score */}
        {km.articleQualityScore && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] text-faint uppercase tracking-wider font-mono">
                {isFa ? "امتیاز کیفیت محتوا" : "Content Quality Score"}
              </p>
              <p className="text-xs font-bold font-mono text-signal">{km.articleQualityScore.toFixed(1)}<span className="text-faint font-normal">/10</span></p>
            </div>
            <div className="h-1.5 rounded-full bg-surface3 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-signal to-ice transition-all"
                style={{ width: `${(km.articleQualityScore / 10) * 100}%` }} />
            </div>
          </div>
        )}

        {/* Fields grid */}
        {fields.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {fields.map(([label, val]) => (
              <div key={label} className="bg-surface2/60 rounded-lg px-3 py-2.5 border border-line/20">
                <p className="text-[9px] text-faint uppercase tracking-widest mb-1 font-mono">{label}</p>
                <p className="text-xs text-ink font-semibold truncate">{val}</p>
              </div>
            ))}
          </div>
        )}

        {km.evidenceLevel && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-faint">{isFa ? "سطح شواهد:" : "Evidence level:"}</span>
            <span className="text-ink font-medium">{km.evidenceLevel}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Related articles ──────────────────────────────────────────────────────────

function RelatedArticles({ articles, isFa, locale }: { articles: ArticleListItem[]; isFa: boolean; locale: string }) {
  if (!articles.length) return null;
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-6">
        <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-signal to-signal/20" />
        <div>
          <p className="eyebrow-mono text-signal text-[9px] mb-0.5">
            {isFa ? "بیشتر بخوانید" : "KEEP READING"}
          </p>
          <h2 className="text-sm font-bold text-ink uppercase tracking-wider">
            {isFa ? "مقالات مرتبط" : "Related Articles"}
          </h2>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {articles.map(a => (
          <Link key={a.id} href={`/${locale}/articles/${a.slug}`}
            className="group flex flex-col gap-3 p-4 rounded-xl border border-line/40 hover:border-signal/20 bg-surface/60 hover:bg-surface2/40 hover:shadow-[0_0_16px_rgba(30,200,164,0.04)] transition-all duration-200 overflow-hidden">
            <div className="h-0.5 -mx-4 -mt-4 bg-gradient-to-r from-signal/40 to-transparent" />
            <div className="flex items-center gap-1.5 pt-1">
              {a.category && (
                <span className="text-[9px] text-signal/70 font-mono uppercase tracking-wider">
                  {isFa ? a.category.nameFa : a.category.name}
                </span>
              )}
            </div>
            <h3 className="text-sm font-bold text-ink group-hover:text-signal transition-colors leading-snug line-clamp-2">
              {a.title}
            </h3>
            <div className="flex items-center gap-2 text-[10px] text-faint mt-auto font-mono">
              <span className="truncate max-w-[80px]">{a.author.displayName}</span>
              <span className="text-line">·</span>
              <span>{a.readingTimeMinutes} {isFa ? "د" : "m"}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  article: ArticleDetail;
  related: ArticleListItem[];
}

export function ArticleDetailClient({ article, related }: Props) {
  // useLocale() reads from the next-intl middleware request context — always a
  // stable string, never null. Do NOT use usePathname() from next/navigation here:
  // next-intl middleware rewrites paths before Next.js sees them, so usePathname()
  // can return null on async re-renders in App Router and crash the component.
  const locale = useLocale();
  const isFa   = locale === "fa";

  const typeLabel = CONTENT_TYPE_LABELS[article.contentType] ?? { en: article.contentType, fa: article.contentType };
  const catHref   = article.category ? `/${locale}/articles/category/${article.category.slug}` : null;

  return (
    <div className="min-h-screen">
      {/* Sticky breadcrumb header */}
      <div className="border-b border-line/30 bg-surface/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-2 text-xs text-faint">
          <Link href={`/${locale}/articles`}
            className="hover:text-signal transition-colors flex items-center gap-1 font-medium">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
              <path d="M2 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3Z"/>
            </svg>
            {isFa ? "ژورنال" : "Journal"}
          </Link>
          {article.category && catHref && (
            <>
              <span className="text-line">/</span>
              <Link href={catHref} className="hover:text-signal transition-colors">
                {isFa ? article.category.nameFa : article.category.name}
              </Link>
            </>
          )}
          <span className="text-line">/</span>
          <span className="text-muted line-clamp-1">
            {(isFa ? FA_ARTICLE_MAP[article.slug]?.title : null) ?? article.title}
          </span>
        </div>
      </div>

      {/* Article hero area */}
      <div className="relative border-b border-line/20 overflow-hidden"
        style={{ background: "linear-gradient(180deg, rgba(30,200,164,0.04) 0%, transparent 100%)" }}>
        <div className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: "radial-gradient(rgba(30,200,164,0.15) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }} />
        <div className="absolute -top-10 start-0 w-64 h-64 rounded-full blur-[80px] pointer-events-none opacity-40"
          style={{ background: "rgba(30,200,164,0.06)" }} />

        <div className="relative max-w-4xl mx-auto px-6 py-12 md:py-16">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-mono uppercase tracking-wider ${contentTypeBadgeColor(article.contentType)}`}>
              {isFa ? typeLabel.fa : typeLabel.en}
            </span>
            {catHref && article.category && (
              <Link href={catHref}
                className="text-[10px] px-2.5 py-0.5 rounded-full border border-signal/25 text-signal hover:bg-signal/8 transition-colors font-mono uppercase tracking-wider">
                {isFa ? article.category.nameFa : article.category.name}
              </Link>
            )}
            {article.knowledgeMetadata?.humanReviewed && (
              <span className="hs-badge hs--knowledge text-[9px]">{isFa ? "بررسی شده" : "REVIEWED"}</span>
            )}
            {article.knowledgeMetadata?.safetyCritical && (
              <span className="hs-badge hs--risk text-[9px]">{isFa ? "ایمنی بحرانی" : "SAFETY CRITICAL"}</span>
            )}
            <span className="ms-auto text-[9px] text-faint font-mono uppercase tracking-wider border border-line/40 px-2 py-0.5 rounded-full">
              {article.language === "FA" ? "فارسی / FA" : "English / EN"}
            </span>
          </div>

          {/* Title */}
          {isFa && FA_ARTICLE_MAP[article.slug] && (
            <p className="text-[10px] text-faint font-mono mb-2 opacity-55">{article.title}</p>
          )}
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-ink leading-tight mb-5 max-w-3xl">
            {(isFa ? FA_ARTICLE_MAP[article.slug]?.title : null) ?? article.title}
          </h1>

          {/* Subtitle */}
          {((isFa ? FA_ARTICLE_MAP[article.slug]?.subtitle : null) ?? article.subtitle) && (
            <p className="text-lg md:text-xl text-muted leading-relaxed mb-7 max-w-2xl">
              {(isFa ? FA_ARTICLE_MAP[article.slug]?.subtitle : null) ?? article.subtitle}
            </p>
          )}

          {/* Author + meta row */}
          <div className="flex flex-wrap items-center gap-5 pt-2">
            <Link href={`/${locale}/articles/author/${article.author.handle}`}
              className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-signal/30 to-ice/20 border-2 border-signal/25 flex items-center justify-center text-sm font-bold text-signal shrink-0">
                {article.author.displayName.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold text-ink group-hover:text-signal transition-colors">
                    {article.author.displayName}
                  </p>
                  {article.author.verifiedExpert && (
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-signal shrink-0">
                      <path fillRule="evenodd" d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd"/>
                    </svg>
                  )}
                </div>
                <p className="text-xs text-faint">{article.author.roleTitle ?? article.author.company}</p>
              </div>
            </Link>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-faint font-mono">
              <span>{fmtDate(article.publishedAt, isFa)}</span>
              <span className="text-line">·</span>
              <span>{article.readingTimeMinutes} {isFa ? "دقیقه مطالعه" : "min read"}</span>
              {article.knowledgeMetadata?.articleQualityScore && (
                <>
                  <span className="text-line">·</span>
                  <span className="text-signal font-bold">{article.knowledgeMetadata.articleQualityScore.toFixed(1)}<span className="text-faint font-normal">/10</span></span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Trust strip — editorial approval + key metrics (real DB fields only) */}
        <TrustStrip article={article} isFa={isFa} />

        {/* Excerpt / lead */}
        {article.excerpt && (
          <div className="mb-8 rounded-xl overflow-hidden border border-signal/15 bg-surface/40">
            <div className="h-0.5 bg-gradient-to-r from-signal/60 to-transparent" />
            <p className="p-5 text-base text-muted leading-[1.85] italic">{article.excerpt}</p>
          </div>
        )}

        {/* Actions bar */}
        <ActionsBar article={article} isFa={isFa} />

        {/* Article content */}
        <article className="mt-10 mb-12">
          <ArticleContent content={article.content} isFa={isFa} />
        </article>

        {/* Tags */}
        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 py-6 border-t border-line/30">
            <span className="text-xs text-faint me-1 font-mono uppercase tracking-wider self-center">
              {isFa ? "برچسب‌ها:" : "Tags:"}
            </span>
            {article.tags.map(tag => (
              <Link key={tag.id} href={`/${locale}/articles/tag/${tag.slug}`}
                className="text-xs px-3 py-1 rounded-full border border-line/50 text-muted hover:border-signal/30 hover:text-signal hover:bg-signal/5 transition-all font-mono">
                {isFa ? (tag.nameFa ?? tag.name) : tag.name}
              </Link>
            ))}
          </div>
        )}

        {/* Bottom actions */}
        <ActionsBar article={article} isFa={isFa} />

        {/* Knowledge metadata */}
        {article.knowledgeMetadata && (
          <div className="mt-10">
            <KnowledgeMetaBlock article={article} isFa={isFa} />
          </div>
        )}

        {/* Author card */}
        <div className="mt-12">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-signal to-signal/20" />
            <p className="text-xs font-bold text-ink uppercase tracking-wider">
              {isFa ? "درباره نویسنده" : "About the Author"}
            </p>
          </div>
          <AuthorCard article={article} isFa={isFa} locale={locale} />
        </div>

        {/* Related articles */}
        {related.length > 0 && (
          <div className="mt-14 pt-10 border-t border-line/20">
            <RelatedArticles articles={related} isFa={isFa} locale={locale} />
          </div>
        )}
      </div>
    </div>
  );
}
