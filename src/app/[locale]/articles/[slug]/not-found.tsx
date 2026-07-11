import Link       from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

// Renders WITHIN articles/layout.tsx and [locale]/layout.tsx — no <html>/<body>.
// Called by Next.js App Router when notFound() is thrown from the [slug] page
// (e.g. private/submitted/draft articles, or unknown slugs).
export default async function ArticleSlugNotFound() {
  let locale = "fa";
  try {
    locale = await getLocale();
  } catch { /* middleware header not set — default to fa */ }

  const t = await getTranslations({ locale, namespace: "journal" });

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
      {/* Dot-grid accent */}
      <div className="absolute inset-0 pointer-events-none opacity-10"
        style={{ backgroundImage: "radial-gradient(rgba(30,200,164,0.25) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />

      <div className="relative z-10 flex flex-col items-center">
        {/* Signal badge */}
        <p className="text-[9px] font-mono text-signal uppercase tracking-[0.25em] mb-5">
          {t("brandUpper")}
        </p>

        {/* 404 numeral */}
        <div className="text-[7rem] font-black leading-none text-ink/5 select-none mb-0 -mt-4">
          404
        </div>

        {/* Headline */}
        <h1 className="text-xl font-bold text-ink mb-3 -mt-4">
          {t("notFound.title")}
        </h1>

        {/* Body */}
        <p className="text-sm text-muted max-w-sm mb-8 leading-relaxed">
          {t("notFound.body")}
        </p>

        {/* CTA */}
        <Link
          href={`/${locale}/articles`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-signal text-bg text-sm font-bold hover:bg-signal/90 transition-colors shadow-[0_0_20px_rgba(30,200,164,0.12)]"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 0 1-1.414 0l-6-6a1 1 0 0 1 0-1.414l6-6a1 1 0 0 1 1.414 1.414L5.414 9H17a1 1 0 1 1 0 2H5.414l4.293 4.293a1 1 0 0 1 0 1.414Z" clipRule="evenodd"/>
          </svg>
          {t("notFound.back")}
        </Link>
      </div>
    </div>
  );
}
