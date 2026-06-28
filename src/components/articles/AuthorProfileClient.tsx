"use client";

import { useState } from "react";
import Link          from "next/link";
import { usePathname } from "next/navigation";
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
  if (t === "FAILURE_ANALYSIS" || t === "SAFETY_COMPLIANCE_NOTE") return "bg-danger/[0.10] text-danger";
  if (t === "TROUBLESHOOTING_REPORT") return "bg-warn/[0.10] text-warn";
  if (t === "INDUSTRIAL_CASE_STUDY")  return "bg-hermes-gold/[0.12] text-hermes-gold";
  return "bg-signal/[0.10] text-signal";
}

interface Props {
  author:   ArticleAuthorProfile;
  articles: ArticleListItem[];
}

export function AuthorProfileClient({ author, articles }: Props) {
  const pathname  = usePathname();
  const isFa      = pathname.startsWith("/fa");
  const locale    = isFa ? "fa" : "en";
  const [following, setFollowing] = useState(false);
  const [filter, setFilter]       = useState("ALL");

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

  const contentTypes = ["ALL", ...Array.from(new Set(articles.map(a => a.contentType)))];
  const filtered = filter === "ALL" ? articles : articles.filter(a => a.contentType === filter);

  const score = author.industrialCredibilityScore;

  return (
    <div className="min-h-screen">
      {/* Profile hero */}
      <div className="relative border-b border-line/50 overflow-hidden"
        style={{ background: "linear-gradient(180deg, rgba(30,200,164,0.07) 0%, rgba(6,8,13,0.98) 100%)" }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 30% 0%, rgba(30,200,164,0.12) 0%, transparent 60%)" }} />

        <div className="relative max-w-4xl mx-auto px-6 py-12">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-signal/40 to-ice/30 border-2 border-signal/40 flex items-center justify-center text-3xl font-bold text-signal shrink-0">
              {author.displayName.charAt(0)}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex flex-wrap items-center gap-3 mb-1">
                    <h1 className="text-2xl font-bold text-ink">{author.displayName}</h1>
                    {author.verifiedExpert && (
                      <span className="hs-badge hs--knowledge">{isFa ? "متخصص تأییدشده" : "VERIFIED EXPERT"}</span>
                    )}
                  </div>
                  <p className="text-muted text-sm">@{author.handle}</p>
                </div>
                <button onClick={handleFollow}
                  className={`shrink-0 text-sm px-5 py-2 rounded-xl border-2 transition-all font-semibold ${
                    following
                      ? "border-signal bg-signal/15 text-signal"
                      : "border-signal text-signal hover:bg-signal/10"
                  }`}>
                  {following ? (isFa ? "دنبال‌شده" : "Following") : (isFa ? "دنبال کردن" : "Follow")}
                </button>
              </div>

              {author.roleTitle && <p className="text-base text-ink font-medium mb-0.5">{author.roleTitle}</p>}
              {author.company    && <p className="text-sm text-muted mb-0.5">{author.company}</p>}
              {author.location   && (
                <p className="text-xs text-faint flex items-center gap-1">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                    <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 0 0 .281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 1 0 3 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 0 0 2.273 1.765 11.842 11.842 0 0 0 .994.573l.018.008.006.003ZM10 11.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" clipRule="evenodd"/>
                  </svg>
                  {author.location}
                </p>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: isFa ? "مقالات" : "Articles",   value: author.articleCount },
              { label: isFa ? "دنبال‌کننده" : "Followers", value: author.followerCount },
              { label: isFa ? "بازدید کل" : "Total Views", value: author.totalViews },
              { label: isFa ? "ذخیره‌شده" : "Total Saves", value: author.totalSaves },
            ].map(s => (
              <div key={s.label} className="bg-surface/60 rounded-xl p-4 border border-line/40 text-center">
                <p className="text-xl font-bold text-signal font-mono">{fmtNum(s.value)}</p>
                <p className="text-xs text-faint mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Credibility score */}
          {score && (
            <div className="mt-5 flex items-center gap-3">
              <p className="text-xs text-faint">{isFa ? "امتیاز اعتبار صنعتی:" : "Industrial Credibility:"}</p>
              <div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden max-w-xs">
                <div className="h-full rounded-full bg-gradient-to-r from-signal to-ice" style={{ width: `${(score / 10) * 100}%` }} />
              </div>
              <p className="text-xs font-mono text-signal">{score.toFixed(1)}/10</p>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Bio */}
        {author.bio && (
          <section>
            <p className="text-muted leading-relaxed">{author.bio}</p>
          </section>
        )}

        {/* Headline */}
        {author.headline && (
          <div className="p-4 rounded-xl border border-line/40 bg-surface2/40"
            style={{ borderInlineStart: "3px solid var(--signal)" }}>
            <p className="text-sm text-muted leading-relaxed italic">{author.headline}</p>
          </div>
        )}

        {/* Expertise */}
        {author.expertiseAreas.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-faint uppercase tracking-widest mb-3">
              {isFa ? "حوزه‌های تخصص" : "Areas of Expertise"}
            </p>
            <div className="flex flex-wrap gap-2">
              {author.expertiseAreas.map(area => (
                <span key={area} className="text-xs px-3 py-1 rounded-full border border-signal/30 text-signal/90 font-mono bg-signal/5">
                  {area}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Articles section */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <span className="w-1 h-5 rounded-full bg-signal inline-block" />
              <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">
                {isFa ? "مقالات نویسنده" : "Articles"}
              </h2>
              <span className="text-xs text-faint">({articles.length})</span>
            </div>
          </div>

          {/* Content type filter */}
          {contentTypes.length > 2 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {contentTypes.map(ct => {
                const lab = ct === "ALL"
                  ? (isFa ? "همه" : "All")
                  : (isFa
                    ? (CONTENT_TYPE_LABELS[ct]?.fa ?? ct)
                    : (CONTENT_TYPE_LABELS[ct]?.en ?? ct));
                return (
                  <button key={ct} onClick={() => setFilter(ct)}
                    className={`text-xs px-3 py-1 rounded-full border transition-all ${
                      filter === ct
                        ? "border-signal text-signal bg-signal/10 font-medium"
                        : "border-line text-muted hover:border-signal/40 hover:text-ink"
                    }`}>
                    {lab}
                  </button>
                );
              })}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="text-center py-16 border border-line/40 rounded-xl">
              <p className="text-muted text-sm">{isFa ? "مقاله‌ای یافت نشد" : "No articles found"}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(a => (
                <Link key={a.id} href={`/${locale}/articles/${a.slug}`}
                  className="group flex gap-4 p-4 rounded-xl border border-line/60 hover:border-signal/30 bg-surface hover:bg-surface2/40 transition-all">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider ${contentTypeBadgeColor(a.contentType)}`}>
                        {isFa ? (CONTENT_TYPE_LABELS[a.contentType]?.fa ?? a.contentType) : (CONTENT_TYPE_LABELS[a.contentType]?.en ?? a.contentType)}
                      </span>
                      {a.knowledgeMetadata?.humanReviewed && (
                        <span className="hs-badge hs--knowledge text-[9px]">{isFa ? "بررسی شده" : "REVIEWED"}</span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-ink group-hover:text-signal transition-colors line-clamp-2 leading-snug mb-1">
                      {a.title}
                    </h3>
                    {a.excerpt && (
                      <p className="text-xs text-muted line-clamp-1">{a.excerpt}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-faint">
                      <span>{fmtDate(a.publishedAt ?? a.createdAt, isFa)}</span>
                      <span>·</span>
                      <span>{a.readingTimeMinutes} {isFa ? "دقیقه" : "min"}</span>
                      <span>·</span>
                      <span>{fmtNum(a.viewCount)} {isFa ? "بازدید" : "views"}</span>
                    </div>
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
