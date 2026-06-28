import { setRequestLocale } from "next-intl/server";
import { getAllAuthors }    from "@/lib/articles/db";
import { buildMetadata }   from "@/lib/seo/metadata";
import Link                 from "next/link";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return buildMetadata({
    locale,
    path:        "/articles/authors",
    title:       locale === "fa"
      ? "شبکه متخصصان صنعتی — ژورنال صنعتی هرمس"
      : "Industrial Expert Network — Hermes Industrial Journal",
    description: locale === "fa"
      ? "متخصصان تأییدشده صنعتی در هرمس — مهندسان اتوماسیون، PLC، SCADA، نگهداشت و دارایی"
      : "Verified industrial experts on Hermes — automation engineers, PLC/SCADA specialists, maintenance and asset professionals",
  });
}

export const dynamic = "force-dynamic";

export default async function AuthorsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isFa   = locale === "fa";
  const authors = await getAllAuthors();

  function fmtNum(n: number) {
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(n);
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-line/50 bg-surface/60 backdrop-blur-sm"
        style={{ background: "linear-gradient(180deg, rgba(30,200,164,0.05) 0%, rgba(6,8,13,0.98) 100%)" }}>
        <div className="max-w-5xl mx-auto px-6 py-8">
          <p className="eyebrow-mono text-signal text-[10px] mb-2">
            {isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
          </p>
          <h1 className="text-3xl font-bold text-ink mb-2">
            {isFa ? "شبکه متخصصان صنعتی" : "Industrial Expert Network"}
          </h1>
          <p className="text-muted text-sm">
            {isFa
              ? `${authors.length} متخصص تأییدشده در پلتفرم هرمس`
              : `${authors.length} verified industrial experts on the Hermes platform`}
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {authors.map(author => (
            <Link key={author.id} href={`/${locale}/articles/author/${author.handle}`}
              className="group flex flex-col gap-4 p-5 rounded-xl border border-line/60 hover:border-signal/30 bg-surface hover:bg-surface2/40 transition-all duration-200">
              {/* Avatar + Name */}
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-signal/30 to-ice/20 border border-signal/30 flex items-center justify-center text-lg font-bold text-signal shrink-0">
                  {author.displayName.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-sm font-semibold text-ink group-hover:text-signal transition-colors truncate">
                      {author.displayName}
                    </p>
                    {author.verifiedExpert && (
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-signal shrink-0">
                        <path fillRule="evenodd" d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd"/>
                      </svg>
                    )}
                  </div>
                  <p className="text-xs text-faint truncate">{author.roleTitle ?? author.company}</p>
                </div>
              </div>

              {/* Headline */}
              {author.headline && (
                <p className="text-xs text-muted leading-relaxed line-clamp-2">{author.headline}</p>
              )}

              {/* Stats */}
              <div className="flex items-center gap-4 text-xs text-faint">
                <span>{fmtNum(author.followerCount)} {isFa ? "دنبال‌کننده" : "followers"}</span>
                <span>·</span>
                <span>{author.articleCount} {isFa ? "مقاله" : "articles"}</span>
                <span>·</span>
                <span>{fmtNum(author.totalViews)} {isFa ? "بازدید" : "views"}</span>
              </div>

              {/* Credibility score */}
              {author.industrialCredibilityScore && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-surface3 overflow-hidden">
                    <div className="h-full rounded-full bg-signal" style={{ width: `${(author.industrialCredibilityScore / 10) * 100}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-signal">{author.industrialCredibilityScore.toFixed(1)}</span>
                </div>
              )}

              {/* Expertise tags */}
              {author.expertiseAreas.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-auto">
                  {author.expertiseAreas.slice(0, 3).map(area => (
                    <span key={area} className="text-[10px] px-1.5 py-0.5 rounded bg-surface3 text-muted font-mono border border-line/30">
                      {area}
                    </span>
                  ))}
                  {author.expertiseAreas.length > 3 && (
                    <span className="text-[10px] text-faint">+{author.expertiseAreas.length - 3}</span>
                  )}
                </div>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
