"use client";

import { useState } from "react";
import Link          from "next/link";
import { usePathname } from "next/navigation";
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
  if (t === "FAILURE_ANALYSIS" || t === "SAFETY_COMPLIANCE_NOTE") return "bg-danger/[0.10] text-danger";
  if (t === "TROUBLESHOOTING_REPORT") return "bg-warn/[0.10] text-warn";
  if (t === "INDUSTRIAL_CASE_STUDY")  return "bg-hermes-gold/[0.12] text-hermes-gold";
  if (t === "ENGINEERING_OPINION")    return "bg-ice/[0.10] text-ice";
  return "bg-signal/[0.10] text-signal";
}

// ── Safe content renderer ─────────────────────────────────────────────────────
// Renders plain-text markdown as styled React nodes (no HTML injection).

function ArticleContent({ content, isFa }: { content: string; isFa: boolean }) {
  const blocks = content.split(/\n{2,}/).filter(b => b.trim());
  return (
    <div className={`space-y-5 ${isFa ? "font-body" : ""}`}>
      {blocks.map((block, i) => {
        const t = block.trim();
        if (t.startsWith("### "))
          return <h3 key={i} className="text-lg font-bold text-ink mt-8 mb-3 border-b border-line/40 pb-2">{t.slice(4)}</h3>;
        if (t.startsWith("## "))
          return <h2 key={i} className="text-xl font-bold text-ink mt-10 mb-4 border-b border-signal/20 pb-2">{t.slice(3)}</h2>;
        if (t.startsWith("# "))
          return <h1 key={i} className="text-2xl font-bold text-ink mt-12 mb-5">{t.slice(2)}</h1>;
        if (t.startsWith("```")) {
          const code = t.replace(/^```\w*\n?/, "").replace(/```$/, "").trim();
          return (
            <pre key={i} className="bg-surface2 border border-line/60 rounded-xl p-5 overflow-x-auto text-sm font-mono text-signal/90 leading-relaxed">
              <code>{code}</code>
            </pre>
          );
        }
        if (t.startsWith("- ") || t.startsWith("* ")) {
          const items = t.split("\n").filter(l => l.trim().startsWith("- ") || l.trim().startsWith("* "));
          return (
            <ul key={i} className="list-none space-y-2 ps-0">
              {items.map((item, j) => (
                <li key={j} className="flex items-start gap-2 text-muted">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-signal shrink-0" />
                  <span>{item.replace(/^[-*]\s/, "")}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-muted leading-relaxed text-[0.9375rem]">{t}</p>
        );
      })}
    </div>
  );
}

// ── Actions bar (save, react, share) ─────────────────────────────────────────

function ActionsBar({ article, isFa }: { article: ArticleDetail; isFa: boolean }) {
  const [saved, setSaved]     = useState(false);
  const [reacted, setReacted] = useState<string | null>(null);

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
      ...(next
        ? { body: JSON.stringify({ articleId: article.id, reactionType: key }), headers: { "Content-Type": "application/json" } }
        : {}),
    }).catch(() => setReacted(reacted));
  }

  function handleShare() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href).catch(() => {});
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 py-5 border-y border-line/40">
      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-faint me-auto">
        <span>{fmtNum(article.viewCount)} {isFa ? "بازدید" : "views"}</span>
        <span>·</span>
        <span>{fmtNum(article.saveCount)} {isFa ? "ذخیره" : "saves"}</span>
        <span>·</span>
        <span>{fmtNum(article.reactionCount)} {isFa ? "واکنش" : "reactions"}</span>
      </div>

      {/* Reactions */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {reactions.map(r => (
          <button key={r.key} onClick={() => handleReact(r.key)}
            className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
              reacted === r.key
                ? "border-signal bg-signal/15 text-signal font-medium"
                : "border-line text-faint hover:border-signal/40 hover:text-ink"
            }`}>
            {isFa ? r.fa : r.en}
          </button>
        ))}
      </div>

      {/* Save */}
      <button onClick={handleSave}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all border ${
          saved
            ? "border-signal bg-signal/15 text-signal font-medium"
            : "border-line text-muted hover:border-signal/40 hover:text-ink"
        }`}>
        <svg viewBox="0 0 20 20" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
          <path d="M5 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14l-5-2.5L5 18V4Z"/>
        </svg>
        {isFa ? "ذخیره" : "Save"}
      </button>

      {/* Share */}
      <button onClick={handleShare}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-line text-muted hover:border-signal/40 hover:text-ink transition-all">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.518 2.518 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.474l6.733-3.366A2.52 2.52 0 0 1 13 4.5Z"/>
        </svg>
        {isFa ? "اشتراک‌گذاری" : "Share"}
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
    <div className="rounded-2xl border border-line/60 bg-surface overflow-hidden"
      style={{ background: "linear-gradient(135deg, rgba(30,200,164,0.04) 0%, rgba(6,8,13,1) 60%)" }}>
      <div className="p-6 flex flex-col sm:flex-row gap-5">
        {/* Avatar */}
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-signal/30 to-ice/20 border border-signal/30 flex items-center justify-center text-2xl font-bold text-signal shrink-0">
          {author.displayName.charAt(0)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Link href={`/${locale}/articles/author/${author.handle}`}
                  className="text-base font-bold text-ink hover:text-signal transition-colors">
                  {author.displayName}
                </Link>
                {author.verifiedExpert && (
                  <span className="hs-badge hs--knowledge text-[9px]">{isFa ? "متخصص تأییدشده" : "EXPERT"}</span>
                )}
              </div>
              <p className="text-sm text-muted">{author.roleTitle ?? author.company}</p>
              {author.location && <p className="text-xs text-faint mt-0.5">{author.location}</p>}
            </div>
            <button onClick={handleFollow}
              className={`shrink-0 text-xs px-4 py-1.5 rounded-lg border transition-all font-medium ${
                following
                  ? "border-signal bg-signal/15 text-signal"
                  : "border-signal text-signal hover:bg-signal/10"
              }`}>
              {following
                ? (isFa ? "دنبال‌شده" : "Following")
                : (isFa ? "دنبال کردن" : "Follow")}
            </button>
          </div>

          {author.headline && (
            <p className="text-sm text-muted leading-relaxed mb-3 line-clamp-2">{author.headline}</p>
          )}

          <div className="flex flex-wrap items-center gap-4 text-xs text-faint mb-3">
            <span>{fmtNum(author.followerCount)} {isFa ? "دنبال‌کننده" : "followers"}</span>
            <span>·</span>
            <span>{author.articleCount} {isFa ? "مقاله" : "articles"}</span>
            <span>·</span>
            <span>{fmtNum(author.totalViews)} {isFa ? "بازدید" : "views"}</span>
          </div>

          {author.expertiseAreas.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {author.expertiseAreas.map(area => (
                <span key={area} className="text-[10px] px-2 py-0.5 rounded bg-surface3 text-muted font-mono border border-line/40">
                  {area}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {author.bio && (
        <div className="px-6 pb-5 border-t border-line/30">
          <p className="text-sm text-muted leading-relaxed mt-4 line-clamp-3">{author.bio}</p>
          <Link href={`/${locale}/articles/author/${author.handle}`}
            className="text-xs text-signal hover:underline mt-2 inline-block">
            {isFa ? "مشاهده پروفایل کامل" : "View full profile"}
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Knowledge metadata block ──────────────────────────────────────────────────

function KnowledgeMetaBlock({ article, isFa }: { article: ArticleDetail; isFa: boolean }) {
  const km = article.knowledgeMetadata;
  if (!km || (!km.humanReviewed && !km.knowledgeEligible)) return null;

  const fields: Array<[string, string, string | null | boolean]> = [
    [isFa ? "حوزه صنعتی" : "Industrial Domain", "domain",   km.industrialDomain],
    [isFa ? "نوع دارایی" : "Asset Type",         "asset",    km.linkedAssetType],
    [isFa ? "تکنولوژی" : "Technology",            "tech",     km.linkedTechnology],
    [isFa ? "پلتفرم PLC" : "PLC Platform",        "plc",      km.linkedPLCPlatform],
    [isFa ? "فروشنده" : "Vendor",                 "vendor",   km.linkedVendor],
    [isFa ? "استاندارد" : "Standard",             "std",      km.linkedStandard],
    [isFa ? "حوزه نگهداشت" : "Maint. Domain",     "maint",    km.linkedMaintenanceDomain],
  ].filter(([,, val]) => !!val) as Array<[string, string, string]>;

  return (
    <div className="rounded-xl border border-signal/20 bg-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-signal/15 flex items-center gap-2"
        style={{ background: "linear-gradient(90deg, rgba(30,200,164,0.08) 0%, transparent 100%)" }}>
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-signal">
          <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" clipRule="evenodd"/>
        </svg>
        <p className="text-xs font-semibold text-signal uppercase tracking-wider">
          {isFa ? "متادیتای دانش صنعتی" : "Industrial Knowledge Metadata"}
        </p>
        {km.humanReviewed && (
          <span className="ms-auto hs-badge hs--knowledge text-[9px]">{isFa ? "بررسی انسانی" : "HUMAN REVIEWED"}</span>
        )}
        {km.safetyCritical && (
          <span className="hs-badge hs--risk text-[9px]">{isFa ? "ایمنی بحرانی" : "SAFETY CRITICAL"}</span>
        )}
      </div>
      <div className="p-5">
        {km.articleQualityScore && (
          <div className="flex items-center gap-3 mb-4">
            <p className="text-xs text-faint">{isFa ? "کیفیت محتوا:" : "Content Quality:"}</p>
            <div className="flex-1 h-1.5 rounded-full bg-surface3 overflow-hidden">
              <div className="h-full rounded-full bg-signal transition-all"
                style={{ width: `${(km.articleQualityScore / 10) * 100}%` }} />
            </div>
            <p className="text-xs font-mono text-signal">{km.articleQualityScore.toFixed(1)}/10</p>
          </div>
        )}
        {fields.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {fields.map(([label,, val]) => (
              <div key={label} className="bg-surface2 rounded-lg px-3 py-2">
                <p className="text-[10px] text-faint uppercase tracking-wide mb-0.5">{label}</p>
                <p className="text-xs text-ink font-medium">{val}</p>
              </div>
            ))}
          </div>
        )}
        {km.evidenceLevel && (
          <p className="text-xs text-faint mt-3">
            {isFa ? "سطح شواهد:" : "Evidence level:"} <span className="text-ink">{km.evidenceLevel}</span>
          </p>
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
      <div className="flex items-center gap-2 mb-5">
        <span className="w-1 h-5 rounded-full bg-signal inline-block" />
        <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">
          {isFa ? "مقالات مرتبط" : "Related Articles"}
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {articles.map(a => (
          <Link key={a.id} href={`/${locale}/articles/${a.slug}`}
            className="group flex flex-col gap-2 p-4 rounded-xl border border-line/60 hover:border-signal/30 bg-surface hover:bg-surface2/40 transition-all">
            <div className="flex items-center gap-2">
              {a.category && (
                <span className="text-[10px] text-signal font-mono uppercase tracking-wide">{isFa ? a.category.nameFa : a.category.name}</span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-ink group-hover:text-signal transition-colors leading-snug line-clamp-2">
              {a.title}
            </h3>
            <div className="flex items-center gap-3 text-xs text-faint mt-auto pt-2">
              <span>{a.author.displayName}</span>
              <span>·</span>
              <span>{a.readingTimeMinutes} {isFa ? "دقیقه" : "min"}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  article:  ArticleDetail;
  related:  ArticleListItem[];
}

export function ArticleDetailClient({ article, related }: Props) {
  const pathname = usePathname();
  const isFa     = pathname.startsWith("/fa");
  const locale   = isFa ? "fa" : "en";

  const typeLabel = CONTENT_TYPE_LABELS[article.contentType] ?? { en: article.contentType, fa: article.contentType };
  const catHref   = article.category ? `/${locale}/articles/category/${article.category.slug}` : null;

  return (
    <div className="min-h-screen">
      {/* Sticky header */}
      <div className="border-b border-line/50 bg-surface/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-3 text-xs text-faint">
          <Link href={`/${locale}/articles`} className="hover:text-ink transition-colors">
            {isFa ? "ژورنال" : "Journal"}
          </Link>
          <span>/</span>
          {article.category && catHref && (
            <>
              <Link href={catHref} className="hover:text-ink transition-colors">
                {isFa ? article.category.nameFa : article.category.name}
              </Link>
              <span>/</span>
            </>
          )}
          <span className="text-muted line-clamp-1">{article.title}</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Article header */}
        <header className="mb-8">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <span className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase tracking-wider ${contentTypeBadgeColor(article.contentType)}`}>
              {isFa ? typeLabel.fa : typeLabel.en}
            </span>
            {catHref && article.category && (
              <Link href={catHref}
                className="text-[10px] px-2 py-0.5 rounded border border-signal/30 text-signal hover:bg-signal/10 transition-colors font-mono uppercase tracking-wider">
                {isFa ? article.category.nameFa : article.category.name}
              </Link>
            )}
            {article.knowledgeMetadata?.humanReviewed && (
              <span className="hs-badge hs--knowledge text-[9px]">{isFa ? "بررسی شده" : "REVIEWED"}</span>
            )}
            {article.knowledgeMetadata?.safetyCritical && (
              <span className="hs-badge hs--risk text-[9px]">{isFa ? "ایمنی بحرانی" : "SAFETY CRITICAL"}</span>
            )}
            <span className="ms-auto text-[10px] text-faint font-mono uppercase">
              {article.language === "FA" ? "فارسی" : "EN"}
            </span>
          </div>

          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-bold text-ink leading-tight mb-4">
            {article.title}
          </h1>

          {/* Subtitle */}
          {article.subtitle && (
            <p className="text-lg text-muted leading-relaxed mb-5">{article.subtitle}</p>
          )}

          {/* Author + meta row */}
          <div className="flex flex-wrap items-center gap-5">
            <Link href={`/${locale}/articles/author/${article.author.handle}`}
              className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-signal/30 to-ice/20 border border-signal/30 flex items-center justify-center text-sm font-bold text-signal shrink-0">
                {article.author.displayName.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-ink group-hover:text-signal transition-colors">
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

            <div className="flex items-center gap-3 text-xs text-faint">
              <span>{fmtDate(article.publishedAt, isFa)}</span>
              <span>·</span>
              <span>{article.readingTimeMinutes} {isFa ? "دقیقه مطالعه" : "min read"}</span>
              {article.knowledgeMetadata?.articleQualityScore && (
                <>
                  <span>·</span>
                  <span className="text-signal font-mono">{article.knowledgeMetadata.articleQualityScore.toFixed(1)}/10</span>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Excerpt / lead */}
        {article.excerpt && (
          <div className="mb-8 p-5 rounded-xl border border-line/60 bg-surface2/40"
            style={{ borderInlineStart: "3px solid var(--signal)" }}>
            <p className="text-base text-muted leading-relaxed italic">{article.excerpt}</p>
          </div>
        )}

        {/* Actions bar */}
        <ActionsBar article={article} isFa={isFa} />

        {/* Article content */}
        <article className="mt-8 mb-10">
          <ArticleContent content={article.content} isFa={isFa} />
        </article>

        {/* Tags */}
        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2 mb-8 pt-6 border-t border-line/40">
            <span className="text-xs text-faint me-1">{isFa ? "برچسب‌ها:" : "Tags:"}</span>
            {article.tags.map(tag => (
              <Link key={tag.id} href={`/${locale}/articles/tag/${tag.slug}`}
                className="text-xs px-2.5 py-1 rounded-full border border-line/60 text-muted hover:border-signal/40 hover:text-ink transition-all">
                {isFa ? (tag.nameFa ?? tag.name) : tag.name}
              </Link>
            ))}
          </div>
        )}

        {/* Bottom actions (repeat) */}
        <ActionsBar article={article} isFa={isFa} />

        {/* Knowledge metadata */}
        {article.knowledgeMetadata && (
          <div className="mt-8">
            <KnowledgeMetaBlock article={article} isFa={isFa} />
          </div>
        )}

        {/* Author bio card */}
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1 h-4 rounded-full bg-signal inline-block" />
            <h2 className="text-xs font-semibold text-ink uppercase tracking-wider">
              {isFa ? "درباره نویسنده" : "About the Author"}
            </h2>
          </div>
          <AuthorCard article={article} isFa={isFa} locale={locale} />
        </div>

        {/* Related articles */}
        {related.length > 0 && (
          <div className="mt-12">
            <RelatedArticles articles={related} isFa={isFa} locale={locale} />
          </div>
        )}
      </div>
    </div>
  );
}
