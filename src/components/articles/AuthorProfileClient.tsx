"use client";

import { useState }   from "react";
import Link            from "next/link";
import { useLocale }   from "next-intl";
import type { ArticleAuthorProfile, ArticleListItem } from "@/lib/articles/types";

function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function fmtDate(d: string, isFa = false) {
  const date = new Date(d);
  if (isFa) {
    try { return date.toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric" }); }
    catch { return date.toLocaleDateString(); }
  }
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const CONTENT_TYPE_LABELS: Record<string, { en: string; fa: string }> = {
  TECHNICAL_ARTICLE:        { en: "Technical Article",      fa: "مقاله فنی"          },
  INDUSTRIAL_CASE_STUDY:    { en: "Case Study",             fa: "مطالعه موردی"       },
  TROUBLESHOOTING_REPORT:   { en: "Troubleshooting",        fa: "عیب‌یابی"           },
  PROJECT_REPORT:           { en: "Project Report",         fa: "گزارش پروژه"        },
  MAINTENANCE_INSIGHT:      { en: "Maintenance Insight",    fa: "بینش نگهداشت"       },
  PLC_SCADA_TUTORIAL:       { en: "PLC/SCADA Tutorial",     fa: "آموزش PLC/SCADA"    },
  FAILURE_ANALYSIS:         { en: "Failure Analysis",       fa: "آنالیز خرابی"       },
  ASSET_RELIABILITY_NOTE:   { en: "Reliability Note",       fa: "قابلیت اطمینان"     },
  ENGINEERING_OPINION:      { en: "Engineering Opinion",    fa: "دیدگاه مهندسی"     },
  RESEARCH_SUMMARY:         { en: "Research Summary",       fa: "خلاصه پژوهش"       },
  FIELD_COMMISSIONING_NOTE: { en: "Field Note",             fa: "یادداشت میدانی"     },
  SAFETY_COMPLIANCE_NOTE:   { en: "Safety & Compliance",    fa: "ایمنی و انطباق"     },
};

function contentTypeBadgeColor(t: string) {
  if (t === "FAILURE_ANALYSIS" || t === "SAFETY_COMPLIANCE_NOTE") return "bg-danger/[0.10] text-danger border-danger/20";
  if (t === "TROUBLESHOOTING_REPORT") return "bg-warn/[0.10] text-warn border-warn/20";
  if (t === "INDUSTRIAL_CASE_STUDY")  return "bg-hermes-gold/[0.12] text-hermes-gold border-hermes-gold/20";
  return "bg-signal/[0.08] text-signal border-signal/20";
}

// ── Expert Reputation Block ───────────────────────────────────────────────────
// Computes all metrics from the real PUBLISHED + PUBLIC articles array.
// No fake scores, no stale counters, no AI labels.

function ReputationBlock({ author, articles, isFa }: { author: ArticleAuthorProfile; articles: ArticleListItem[]; isFa: boolean }) {
  const publishedCount = articles.length;
  if (publishedCount === 0) return null;

  const totalViews     = articles.reduce((s, a) => s + (a.viewCount     ?? 0), 0);
  const totalReactions = articles.reduce((s, a) => s + (a.reactionCount ?? 0), 0);
  const latestPublishedAt = articles.reduce((max, a) => {
    if (!a.publishedAt) return max;
    return !max || a.publishedAt > max ? a.publishedAt : max;
  }, null as string | null);

  // Deterministic trust level — transparent rule, no AI, no hidden weights
  const trustLevel = author.verifiedExpert || publishedCount >= 5
    ? (isFa ? "متخصص شناخته‌شده" : "Recognized Expert")
    : publishedCount >= 3
    ? (isFa ? "مشارکت‌کننده فعال" : "Active Contributor")
    : (isFa ? "مشارکت‌کننده جدید" : "New Contributor");

  return (
    <section className="rounded-xl border border-signal/15 overflow-hidden">
      {/* Header bar */}
      <div className="px-5 py-3.5 border-b border-signal/10 flex items-center gap-2.5 flex-wrap"
        style={{ background: "linear-gradient(90deg, rgba(30,200,164,0.07) 0%, rgba(30,200,164,0.02) 100%)" }}>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-signal/15 border border-signal/25 flex items-center justify-center">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-signal">
              <path fillRule="evenodd" d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd"/>
            </svg>
          </div>
          <p className="text-xs font-bold text-signal uppercase tracking-wider">
            {isFa ? "اعتبار تخصصی" : "Expert Reputation"}
          </p>
        </div>
        <div className="flex items-center gap-2 ms-auto flex-wrap">
          {author.verifiedExpert && (
            <span className="hs-badge hs--knowledge text-[9px]">{isFa ? "متخصص تأییدشده" : "VERIFIED EXPERT"}</span>
          )}
          <span className="hs-badge hs--reasoning text-[9px]">{isFa ? "تأییدشده توسط سردبیر" : "EDITORIAL APPROVED"}</span>
          <span className="hs-badge text-[9px] bg-signal/[0.08] text-signal border-signal/25">{isFa ? "نویسنده منتشرشده" : "PUBLISHED AUTHOR"}</span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Trust level — deterministic, labeled clearly */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-faint font-mono uppercase tracking-wider shrink-0">
            {isFa ? "سطح اعتبار:" : "Trust Level:"}
          </span>
          <span className="text-xs font-semibold text-ink">{trustLevel}</span>
        </div>

        {/* Stats grid — all from real PUBLISHED + PUBLIC articles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-surface2/60 rounded-lg px-3 py-2.5 border border-signal/15">
            <p className="text-[9px] text-faint uppercase tracking-widest mb-1 font-mono">
              {isFa ? "مقالات منتشرشده" : "Published"}
            </p>
            <p className="text-base font-bold text-signal">{publishedCount}</p>
          </div>
          {totalViews > 0 ? (
            <div className="bg-surface2/60 rounded-lg px-3 py-2.5 border border-line/20">
              <p className="text-[9px] text-faint uppercase tracking-widest mb-1 font-mono">
                {isFa ? "مجموع بازدید" : "Total Views"}
              </p>
              <p className="text-base font-bold text-ink">{fmtNum(totalViews)}</p>
            </div>
          ) : (
            <div className="bg-surface2/60 rounded-lg px-3 py-2.5 border border-line/20">
              <p className="text-[9px] text-faint uppercase tracking-widest mb-1 font-mono">
                {isFa ? "مجموع بازدید" : "Total Views"}
              </p>
              <p className="text-[10px] text-faint font-mono">{isFa ? "در انتظار" : "Pending"}</p>
            </div>
          )}
          {totalReactions > 0 && (
            <div className="bg-surface2/60 rounded-lg px-3 py-2.5 border border-line/20">
              <p className="text-[9px] text-faint uppercase tracking-widest mb-1 font-mono">
                {isFa ? "مجموع واکنش‌ها" : "Total Reactions"}
              </p>
              <p className="text-base font-bold text-ink">{fmtNum(totalReactions)}</p>
            </div>
          )}
          {latestPublishedAt && (
            <div className="bg-surface2/60 rounded-lg px-3 py-2.5 border border-line/20">
              <p className="text-[9px] text-faint uppercase tracking-widest mb-1 font-mono">
                {isFa ? "آخرین انتشار" : "Latest Pub."}
              </p>
              <p className="text-xs font-semibold text-ink">{fmtDate(latestPublishedAt, isFa)}</p>
            </div>
          )}
        </div>

        {/* Expertise areas */}
        {author.expertiseAreas.length > 0 && (
          <div>
            <p className="text-[9px] text-faint uppercase tracking-widest mb-2 font-mono">
              {isFa ? "حوزه‌های تخصص" : "Expertise Areas"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {author.expertiseAreas.map(area => (
                <span key={area}
                  className="text-[10px] px-2 py-0.5 rounded-full border border-signal/20 text-signal/80 font-mono bg-signal/5">
                  {area}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

interface Props {
  author:   ArticleAuthorProfile;
  articles: ArticleListItem[];
}

export function AuthorProfileClient({ author, articles }: Props) {
  const locale = useLocale();
  const isFa   = locale === "fa";
  const [filter, setFilter] = useState("ALL");

  const contentTypes    = ["ALL", ...Array.from(new Set(articles.map(a => a.contentType)))];
  const filtered        = filter === "ALL" ? articles : articles.filter(a => a.contentType === filter);
  const score           = author.industrialCredibilityScore;
  const isPublishedAuth = articles.length > 0;

  // Phase 75: Compute real totals from the PUBLISHED + PUBLIC articles array.
  // These override the stale denormalized counters on the profile model.
  const realTotalViews     = articles.reduce((s, a) => s + (a.viewCount     ?? 0), 0);
  const realTotalReactions = articles.reduce((s, a) => s + (a.reactionCount ?? 0), 0);

  return (
    <div className="min-h-screen">
      {/* Profile hero */}
      <div className="relative border-b border-line/30 overflow-hidden"
        style={{ background: "linear-gradient(180deg, rgba(30,200,164,0.07) 0%, rgba(6,8,13,0.98) 100%)" }}>

        {/* Grid texture */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(rgba(30,200,164,0.12) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            opacity: 0.5,
          }} />
        {/* Glows */}
        <div className="absolute -top-20 start-0 w-80 h-80 rounded-full blur-[90px] pointer-events-none"
          style={{ background: "rgba(30,200,164,0.09)" }} />
        <div className="absolute top-0 end-0 w-48 h-48 rounded-full blur-[60px] pointer-events-none"
          style={{ background: "rgba(30,200,164,0.04)" }} />

        <div className="relative max-w-4xl mx-auto px-6 py-14">
          {/* Top eyebrow */}
          <div className="mb-8">
            <Link href={`/${locale}/articles/authors`}
              className="inline-flex items-center gap-1.5 text-[10px] text-faint hover:text-signal font-mono uppercase tracking-wider transition-colors">
              <svg viewBox="0 0 20 20" fill="currentColor" className={`w-3 h-3 ${isFa ? "" : "rotate-180"}`}>
                <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd"/>
              </svg>
              {isFa ? "شبکه متخصصان" : "Expert Network"}
            </Link>
          </div>

          <div className="flex flex-col sm:flex-row gap-7 items-start">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-signal/35 to-ice/25 border-2 border-signal/30 flex items-center justify-center text-4xl font-bold text-signal shadow-[0_0_30px_rgba(30,200,164,0.12)]">
                {author.displayName.charAt(0)}
              </div>
              {author.verifiedExpert && (
                <div className="absolute -bottom-1 -end-1 w-7 h-7 rounded-full bg-signal flex items-center justify-center border-2"
                  style={{ borderColor: "var(--bg)" }}>
                  <svg viewBox="0 0 20 20" fill="white" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd"/>
                  </svg>
                </div>
              )}
            </div>

            {/* Identity */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex flex-wrap items-center gap-3 mb-1">
                    <h1 className="text-3xl font-bold text-ink">{author.displayName}</h1>
                    {author.verifiedExpert && (
                      <span className="hs-badge hs--knowledge">{isFa ? "متخصص تأییدشده صنعتی" : "VERIFIED EXPERT"}</span>
                    )}
                    {isPublishedAuth && (
                      <span className="hs-badge hs--reasoning">{isFa ? "نویسنده منتشرشده" : "PUBLISHED AUTHOR"}</span>
                    )}
                  </div>
                  <p className="text-muted text-sm font-mono">@{author.handle}</p>
                </div>

                {/* Follow is a future feature — no fake persistence */}
                <span className="shrink-0 text-xs px-4 py-2 rounded-xl border border-line/40 text-faint cursor-default opacity-60 select-none">
                  {isFa ? "به زودی" : "Coming Soon"}
                </span>
              </div>

              {author.roleTitle && <p className="text-base text-ink font-semibold mb-0.5">{author.roleTitle}</p>}
              {author.company    && <p className="text-sm text-muted mb-1">{author.company}</p>}
              {author.location   && (
                <p className="text-xs text-faint flex items-center gap-1.5">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 opacity-60">
                    <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 0 0 .281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 1 0 3 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 0 0 2.273 1.765 11.842 11.842 0 0 0 .994.573l.018.008.006.003ZM10 11.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" clipRule="evenodd"/>
                  </svg>
                  {author.location}
                </p>
              )}
            </div>
          </div>

          {/* Stats grid — Phase 75: totalViews uses real computed value from PUBLISHED+PUBLIC articles */}
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: isFa ? "مقالات منتشرشده" : "Published",    value: author.articleCount,    main: true  },
              { label: isFa ? "دنبال‌کننده" : "Followers",         value: author.followerCount,   main: false },
              { label: isFa ? "مجموع بازدید" : "Total Views",      value: realTotalViews,         main: false },
              { label: isFa ? "مجموع واکنش‌ها" : "Total Reactions", value: realTotalReactions,     main: false },
            ].map(s => (
              <div key={s.label}
                className={`rounded-xl p-4 border text-center transition-all ${
                  s.main
                    ? "border-signal/20 bg-signal/5"
                    : "border-line/40 bg-surface/50"
                }`}>
                <p className={`text-2xl font-bold font-mono ${s.main ? "text-signal" : "text-ink"}`}>
                  {fmtNum(s.value)}
                </p>
                <p className="text-[10px] text-faint mt-0.5 uppercase tracking-wider font-mono">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Credibility score */}
          {score && (
            <div className="mt-6 flex items-center gap-3">
              <p className="text-xs text-faint font-mono uppercase tracking-wider shrink-0">
                {isFa ? "اعتبار صنعتی" : "Industrial Credibility"}
              </p>
              <div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden max-w-xs">
                <div className="h-full rounded-full bg-gradient-to-r from-signal to-ice"
                  style={{ width: `${(score / 10) * 100}%` }} />
              </div>
              <p className="text-sm font-bold font-mono text-signal shrink-0">{score.toFixed(1)}<span className="text-faint font-normal text-xs">/10</span></p>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        {/* Phase 75: Expert Reputation & Trust Signals block */}
        <ReputationBlock author={author} articles={articles} isFa={isFa} />

        {/* Bio + headline */}
        {(author.bio ?? author.headline) && (
          <section className="space-y-4">
            {author.headline && (
              <div className="rounded-xl border border-signal/15 overflow-hidden">
                <div className="h-0.5 bg-gradient-to-r from-signal/50 to-transparent" />
                <p className="p-5 text-base text-muted leading-[1.8] italic">{author.headline}</p>
              </div>
            )}
            {author.bio && (
              <p className="text-muted leading-[1.8] text-sm">{author.bio}</p>
            )}
          </section>
        )}

        {/* Expertise areas */}
        {author.expertiseAreas.length > 0 && (
          <section>
            <p className="eyebrow-mono text-signal text-[9px] mb-3 tracking-[0.2em]">
              {isFa ? "حوزه‌های تخصص" : "AREAS OF EXPERTISE"}
            </p>
            <div className="flex flex-wrap gap-2">
              {author.expertiseAreas.map(area => (
                <span key={area}
                  className="text-xs px-3 py-1.5 rounded-full border border-signal/20 text-signal/80 font-mono bg-signal/5 hover:border-signal/40 hover:text-signal transition-colors">
                  {area}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Articles section */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="eyebrow-mono text-signal text-[9px] mb-1 tracking-[0.2em]">
                {isFa ? "محتوای منتشرشده" : "PUBLISHED CONTENT"}
              </p>
              <div className="flex items-center gap-2.5">
                <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-signal to-signal/20" />
                <h2 className="text-sm font-bold text-ink uppercase tracking-wider">
                  {isFa ? "مقالات نویسنده" : "Articles"}
                  <span className="ms-2 text-xs text-faint font-normal font-mono">({articles.length})</span>
                </h2>
              </div>
            </div>
          </div>

          {/* Content type filter */}
          {contentTypes.length > 2 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {contentTypes.map(ct => {
                const lab = ct === "ALL"
                  ? (isFa ? "همه" : "All")
                  : (isFa
                    ? (CONTENT_TYPE_LABELS[ct]?.fa ?? ct)
                    : (CONTENT_TYPE_LABELS[ct]?.en ?? ct));
                return (
                  <button key={ct} onClick={() => setFilter(ct)}
                    className={`text-xs px-3.5 py-1.5 rounded-full border transition-all font-mono ${
                      filter === ct
                        ? "border-signal text-signal bg-signal/8 font-semibold"
                        : "border-line/60 text-muted hover:border-signal/30 hover:text-ink"
                    }`}>
                    {lab}
                  </button>
                );
              })}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 border border-line/30 rounded-2xl bg-surface/30">
              <p className="text-muted text-sm">{isFa ? "مقاله‌ای یافت نشد" : "No articles found"}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(a => (
                <Link key={a.id} href={`/${locale}/articles/${a.slug}`}
                  className="group flex gap-4 p-4 rounded-xl border border-line/40 hover:border-signal/20 bg-surface/60 hover:bg-surface2/40 hover:shadow-[0_0_16px_rgba(30,200,164,0.04)] transition-all overflow-hidden">
                  {/* Type indicator */}
                  <div className="w-0.5 rounded-full shrink-0 self-stretch"
                    style={{ background: `linear-gradient(to bottom, rgba(30,200,164,0.6), rgba(30,200,164,0.1))` }} />

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wider ${contentTypeBadgeColor(a.contentType)}`}>
                        {isFa ? (CONTENT_TYPE_LABELS[a.contentType]?.fa ?? a.contentType) : (CONTENT_TYPE_LABELS[a.contentType]?.en ?? a.contentType)}
                      </span>
                      {a.knowledgeMetadata?.humanReviewed && (
                        <span className="hs-badge hs--knowledge text-[9px]">{isFa ? "بررسی شده" : "REVIEWED"}</span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-ink group-hover:text-signal transition-colors line-clamp-2 leading-snug mb-1.5">
                      {a.title}
                    </h3>
                    {a.excerpt && (
                      <p className="text-xs text-muted line-clamp-1 mb-2">{a.excerpt}</p>
                    )}
                    <div className="flex items-center gap-3 text-[10px] text-faint font-mono">
                      <span>{fmtDate(a.publishedAt ?? a.createdAt, isFa)}</span>
                      <span className="text-line">·</span>
                      <span>{a.readingTimeMinutes} {isFa ? "دقیقه" : "min"}</span>
                      <span className="text-line">·</span>
                      <span>{fmtNum(a.viewCount)} {isFa ? "بازدید" : "views"}</span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex items-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 text-signal ${isFa ? "rotate-180" : ""}`}>
                      <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd"/>
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
