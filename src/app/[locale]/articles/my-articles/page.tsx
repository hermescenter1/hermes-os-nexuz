import { setRequestLocale }  from "next-intl/server";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { getCurrentUser }    from "@/lib/auth/session";
import { getUserArticles }   from "@/lib/articles/db";
import { noIndexMetadata }   from "@/lib/seo/metadata";
import Link                   from "next/link";
import type { ArticleListItem } from "@/lib/articles/types";

export const metadata = noIndexMetadata("My Articles — Hermes Industrial Journal");
export const dynamic  = "force-dynamic";

function fmtDate(d: string, isFa: boolean) {
  const date = new Date(d);
  try {
    return date.toLocaleDateString(isFa ? "fa-IR" : "en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch {
    return date.toLocaleDateString();
  }
}

const STATUS_LABEL: Record<string, { en: string; fa: string; cls: string; dot: string }> = {
  DRAFT:     { en: "Draft",            fa: "پیش‌نویس",               cls: "bg-surface3 text-faint border-line/40",        dot: "bg-faint"   },
  SUBMITTED: { en: "Submitted",        fa: "ارسال‌شده برای بررسی",   cls: "bg-warn/10 text-warn border-warn/20",          dot: "bg-warn"    },
  IN_REVIEW: { en: "In Review",        fa: "در حال بررسی",           cls: "bg-ice/10 text-ice border-ice/20",             dot: "bg-ice"     },
  PUBLISHED: { en: "Published",        fa: "منتشرشده",               cls: "bg-signal/10 text-signal border-signal/20",    dot: "bg-signal"  },
  REJECTED:  { en: "Rejected",         fa: "ردشده",                  cls: "bg-danger/10 text-danger border-danger/20",    dot: "bg-danger"  },
  ARCHIVED:  { en: "Archived",         fa: "آرشیوشده",               cls: "bg-surface3 text-muted border-line/40",        dot: "bg-muted"   },
};

function ArticleRow({ article, isFa, locale }: { article: ArticleListItem; isFa: boolean; locale: string }) {
  const s = STATUS_LABEL[article.status] ?? STATUS_LABEL["DRAFT"];
  return (
    <div className="hs-card-depth flex items-start gap-4 p-4 rounded-xl border border-line/40 bg-surface hover:border-signal/20">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wider ${s.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
            {isFa ? s.fa : s.en}
          </span>
          {article.language && (
            <span className="text-[9px] text-faint font-mono border border-line/30 px-1.5 py-0.5 rounded">
              {article.language}
            </span>
          )}
        </div>
        <p className="text-sm font-semibold text-ink leading-snug line-clamp-2 mb-1">
          {article.title}
        </p>
        {article.excerpt && (
          <p className="text-xs text-muted line-clamp-2 leading-relaxed">{article.excerpt}</p>
        )}
        {article.status === "REJECTED" && article.rejectionReason && (
          <p className="mt-1.5 text-xs text-danger/80 bg-danger/5 border border-danger/15 rounded-lg px-3 py-2 leading-relaxed">
            <span className="font-semibold">{isFa ? "دلیل رد: " : "Reason: "}</span>
            {article.rejectionReason}
          </p>
        )}
        <p className="mt-2 text-[10px] text-faint font-mono">
          {isFa ? "بروزرسانی:" : "Updated:"} {fmtDate(article.updatedAt, isFa)}
        </p>
      </div>
      {article.status === "PUBLISHED" && article.visibility === "PUBLIC" && (
        <Link href={`/${locale}/articles/${article.slug}`}
          className="shrink-0 text-[10px] px-3 py-1.5 rounded-lg border border-signal/30 text-signal hover:bg-signal/5 transition-colors font-mono uppercase tracking-wider">
          {isFa ? "مشاهده" : "View"}
        </Link>
      )}
    </div>
  );
}

async function MyArticlesContent({ isFa, locale, userId }: { isFa: boolean; locale: string; userId: string }) {
  const articles = await getUserArticles(userId);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="relative border-b border-line/30 overflow-hidden"
        style={{ background: "linear-gradient(180deg, rgba(30,200,164,0.05) 0%, rgba(6,8,13,0.98) 100%)" }}>
        <div className="absolute inset-0 pointer-events-none opacity-25"
          style={{ backgroundImage: "radial-gradient(rgba(30,200,164,0.14) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative max-w-4xl mx-auto px-6 py-10 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow-mono text-signal text-[9px] mb-2 tracking-[0.2em]">
              {isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
            </p>
            <h1 className="text-2xl font-bold text-ink">
              {isFa ? "مقالات من" : "My Articles"}
            </h1>
            {articles.length > 0 && (
              <p className="mt-1 text-sm text-muted">
                {articles.length} {isFa ? "مقاله" : "article(s)"}
              </p>
            )}
          </div>
          <Link href={`/${locale}/articles/write`}
            className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-signal text-bg text-sm font-bold hover:bg-signal/90 transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"/>
            </svg>
            {isFa ? "نوشتن مقاله" : "Write Article"}
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {articles.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center text-center py-16">
            <div className="relative mb-8">
              <div className="w-20 h-20 rounded-2xl bg-surface border border-signal/20 flex items-center justify-center shadow-[0_0_30px_rgba(30,200,164,0.06)]">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8 text-signal/50">
                  <path fillRule="evenodd" d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm2 6a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Zm1 3a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2H7Z" clipRule="evenodd"/>
                </svg>
              </div>
              <div className="absolute -inset-2 rounded-2xl"
                style={{ background: "radial-gradient(circle, rgba(30,200,164,0.06) 0%, transparent 70%)" }} />
            </div>
            <h2 className="text-lg font-bold text-ink mb-2">
              {isFa ? "مقاله‌ای منتشر نشده" : "No articles yet"}
            </h2>
            <p className="text-muted text-sm mb-8 max-w-sm leading-relaxed">
              {isFa
                ? "اولین مقاله تخصصی صنعتی خود را برای جامعه هرمس بنویسید و دانش خود را به اشتراک بگذارید."
                : "Write your first industrial article and share your engineering expertise with the Hermes global community."}
            </p>
            <Link href={`/${locale}/articles/write`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-signal text-bg text-sm font-bold hover:bg-signal/90 transition-colors shadow-[0_0_20px_rgba(30,200,164,0.15)]">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z"/>
              </svg>
              {isFa ? "نوشتن اولین مقاله" : "Write Your First Article"}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {articles.map(a => (
              <ArticleRow key={a.id} article={a} isFa={isFa} locale={locale} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default async function MyArticlesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isFa = locale === "fa";
  const user = await getCurrentUser();

  return (
    <RequireCapability capability="dashboard">
      {user ? (
        <MyArticlesContent isFa={isFa} locale={locale} userId={user.id} />
      ) : (
        <div className="p-8 text-center text-muted">
          {isFa ? "ورود الزامی است." : "Please log in."}
        </div>
      )}
    </RequireCapability>
  );
}
