import { setRequestLocale, getTranslations } from "next-intl/server";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { noIndexMetadata }   from "@/lib/seo/metadata";
import Link                   from "next/link";
import { getCurrentUser }     from "@/lib/auth/session";
import { listSavedArticles }  from "@/lib/articles/engagement";
import { ArticleCard }        from "@/components/articles/ArticlesFeedClient";

export const metadata = noIndexMetadata("Saved Articles — Hermes Industrial Journal");
export const dynamic  = "force-dynamic";

/**
 * A reader's bookmarked articles.
 *
 * This page previously rendered a HARD-CODED empty state — it never queried
 * anything, so it said "nothing saved yet" no matter how many bookmarks the
 * reader had. It now reads their real ArticleSave rows.
 *
 * The list is produced by `listSavedArticles`, which scopes to this user and
 * joins through to PUBLISHED + PUBLIC articles in a single bounded query, so a
 * bookmark whose article was later unpublished simply stops appearing rather
 * than becoming a way to reach withdrawn content.
 */
async function SavedContent({ locale }: { locale: string }) {
  const t = await getTranslations("journal");
  const isFa = locale === "fa";

  // Reached only behind RequireCapability, but read defensively: an expired
  // session must render the empty state, never crash the page.
  let saved: Awaited<ReturnType<typeof listSavedArticles>> = { articles: [], nextCursor: null };
  try {
    const user = await getCurrentUser();
    if (user) saved = await listSavedArticles(user.id);
  } catch { /* treat as no saved articles */ }

  return (
    <div className="min-h-screen">
      <div className="relative border-b border-line/30 overflow-hidden"
        style={{ background: "linear-gradient(180deg, rgba(30,200,164,0.05) 0%, rgba(6,8,13,0.98) 100%)" }}>
        <div className="absolute inset-0 pointer-events-none opacity-25"
          style={{ backgroundImage: "radial-gradient(rgba(30,200,164,0.14) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative max-w-4xl mx-auto px-6 py-10">
          <p className="eyebrow-mono text-signal text-[9px] mb-2 tracking-[0.2em]">
            {t("brandUpper")}
          </p>
          <h1 className="text-2xl font-bold text-ink">
            {t("lists.savedTitle")}
          </h1>
        </div>
      </div>

      {saved.articles.length === 0 ? (
        <div className="max-w-4xl mx-auto px-6 py-16 flex flex-col items-center text-center">
          <div className="relative mb-8">
            <div className="w-20 h-20 rounded-2xl bg-surface/80 border border-signal/20 flex items-center justify-center shadow-[0_0_30px_rgba(30,200,164,0.06)]">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8 text-signal/50">
                <path d="M5 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14l-5-2.5L5 18V4Z"/>
              </svg>
            </div>
            <div className="absolute -inset-2 rounded-2xl"
              style={{ background: "radial-gradient(circle, rgba(30,200,164,0.06) 0%, transparent 70%)" }} />
          </div>
          <h2 className="text-lg font-bold text-ink mb-2">
            {t("lists.savedEmpty")}
          </h2>
          <p className="text-muted text-sm mb-8 max-w-sm leading-relaxed">
            {t("lists.savedBody")}
          </p>
          <Link href={`/${locale}/articles`}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-signal text-signal text-sm font-bold hover:bg-signal/8 transition-all">
            {t("lists.browseJournal")}
          </Link>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {saved.articles.map((a) => (
              <ArticleCard key={a.id} article={a} locale={locale} isFa={isFa} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default async function SavedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <RequireCapability capability="dashboard" returnTo={`/${locale}/articles/saved`}>
      <SavedContent locale={locale} />
    </RequireCapability>
  );
}
