import { setRequestLocale, getTranslations } from "next-intl/server";
import { getAllAuthors }    from "@/lib/articles/db";
import { buildMetadata }   from "@/lib/seo/metadata";
import Link                 from "next/link";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "journal" });
  return buildMetadata({
    locale,
    path:        "/articles/authors",
    title:       t("meta.authorsTitle"),
    description: t("meta.authorsDescription"),
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
  const isFa    = locale === "fa";
  const t       = await getTranslations({ locale, namespace: "journal" });
  const authors = await getAllAuthors();

  function fmtNum(n: number) {
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(n);
  }

  function fmtDate(d: string | null | undefined) {
    if (!d) return null;
    try {
      return new Date(d).toLocaleDateString(isFa ? "fa-IR" : "en-US", { year: "numeric", month: "short" });
    } catch { return null; }
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="relative border-b border-line/30 overflow-hidden"
        style={{ background: "linear-gradient(180deg, rgba(30,200,164,0.06) 0%, rgba(6,8,13,0.98) 100%)" }}>
        <div className="absolute inset-0 pointer-events-none opacity-40"
          style={{ backgroundImage: "radial-gradient(rgba(30,200,164,0.14) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="absolute -top-12 start-0 w-64 h-64 rounded-full blur-[80px] pointer-events-none"
          style={{ background: "rgba(30,200,164,0.07)" }} />

        <div className="relative max-w-5xl mx-auto px-6 py-12">
          <p className="eyebrow-mono text-signal text-[9px] mb-3 tracking-[0.2em]">
            {t("brandUpper")}
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-ink mb-3">
            {t("browse.authorsHeading")}
          </h1>
          <p className="text-muted text-sm max-w-xl leading-relaxed">
            {t("browse.authorsCount", { count: String(authors.length) })}
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {authors.map(author => (
            <Link key={author.id} href={`/${locale}/articles/author/${author.handle}`}
              className="group flex flex-col gap-4 p-5 rounded-xl border border-line/40 hover:border-signal/20 bg-surface/60 hover:bg-surface2/40 hover:shadow-[0_0_24px_rgba(30,200,164,0.05)] transition-all duration-200 overflow-hidden">

              {/* Colored top bar */}
              <div className="h-0.5 -mx-5 -mt-5 bg-gradient-to-r from-signal/40 to-transparent" />

              {/* Avatar + Name */}
              <div className="flex items-start gap-3 pt-1">
                <div className="relative shrink-0">
                  {author.avatarUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={author.avatarUrl}
                      alt={`${author.displayName} profile photo`}
                      width={48}
                      height={48}
                      className="w-12 h-12 rounded-xl object-cover border border-signal/25"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-signal/30 to-ice/20 border border-signal/25 flex items-center justify-center text-lg font-bold text-signal">
                      {author.displayName.charAt(0)}
                    </div>
                  )}
                  {author.verifiedExpert && (
                    <div className="absolute -bottom-1 -end-1 w-5 h-5 rounded-full bg-signal flex items-center justify-center border border-bg">
                      <svg viewBox="0 0 20 20" fill="white" className="w-3 h-3">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd"/>
                      </svg>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink group-hover:text-signal transition-colors truncate mb-0.5">
                    {author.displayName}
                  </p>
                  <p className="text-[10px] text-faint truncate font-mono">{author.roleTitle ?? author.company}</p>
                  {/* All authors in this directory have published articles */}
                  <span className="inline-flex items-center gap-1 mt-1 text-[9px] px-1.5 py-px rounded border font-mono uppercase tracking-wider bg-signal/[0.08] text-signal border-signal/20">
                    {t("discover.publishedAuthor")}
                  </span>
                </div>
              </div>

              {/* Headline */}
              {author.headline && (
                <p className="text-xs text-muted leading-relaxed line-clamp-2">{author.headline}</p>
              )}

              {/* Credibility score */}
              {author.industrialCredibilityScore && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] text-faint uppercase tracking-widest font-mono">
                      {t("browse.industrialCredibility")}
                    </p>
                    <p className="text-[10px] font-bold font-mono text-signal">{author.industrialCredibilityScore.toFixed(1)}</p>
                  </div>
                  <div className="h-1 rounded-full bg-surface3 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-signal to-ice"
                      style={{ width: `${(author.industrialCredibilityScore / 10) * 100}%` }} />
                  </div>
                </div>
              )}

              {/* Stats — Phase 75: totalViews is real aggregate from PUBLISHED+PUBLIC articles */}
              <div className="flex flex-wrap items-center gap-3 text-[10px] text-faint font-mono">
                <span>{author.articleCount} {t("browse.publishedUnit")}</span>
                <span className="text-line">·</span>
                <span>{fmtNum(author.totalViews)} {t("viewsUnit")}</span>
                {author.latestPublishedAt && fmtDate(author.latestPublishedAt) && (
                  <>
                    <span className="text-line">·</span>
                    <span>{t("browse.latestLabel")} {fmtDate(author.latestPublishedAt)}</span>
                  </>
                )}
              </div>

              {/* Expertise tags */}
              {author.expertiseAreas.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-auto">
                  {author.expertiseAreas.slice(0, 3).map(area => (
                    <span key={area}
                      className="text-[9px] px-2 py-0.5 rounded-full border border-signal/15 text-signal/70 font-mono bg-signal/5">
                      {area}
                    </span>
                  ))}
                  {author.expertiseAreas.length > 3 && (
                    <span className="text-[9px] text-faint font-mono">+{author.expertiseAreas.length - 3}</span>
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
