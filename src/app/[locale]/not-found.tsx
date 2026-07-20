import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { DEFAULT_LOCALE } from "@/i18n/locales";

/**
 * PHASE 89A — general localized 404 boundary (H1).
 *
 * Renders WITHIN src/app/[locale]/layout.tsx, so it inherits that layout's
 * <html lang dir> and NextIntlClientProvider — Persian keeps RTL, English and
 * German render LTR, all with the premium design system. Replaces the Next.js
 * built-in English 404 for every notFound() call site that lacks a nearer
 * boundary. Exposes no route internals and no error details.
 */
export default async function LocalizedNotFound() {
  // getLocale reads the request locale set by the middleware; fall back to the
  // default active locale if the header is unavailable (never throws).
  let locale: string = DEFAULT_LOCALE;
  try {
    locale = await getLocale();
  } catch {
    /* middleware header not set — keep the default locale */
  }

  const t = await getTranslations({ locale, namespace: "errors" });

  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      {/* Dot-grid accent — decorative only */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-10"
        style={{
          backgroundImage: "radial-gradient(rgba(30,200,164,0.25) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      <div className="relative z-10 flex flex-col items-center">
        <p className="mb-5 font-mono text-[9px] uppercase tracking-[0.25em] text-signal">
          {t("notFound.eyebrow")}
        </p>

        <div
          aria-hidden="true"
          className="mb-0 -mt-4 select-none text-[7rem] font-black leading-none text-ink/5"
        >
          404
        </div>

        <h1 className="mb-3 -mt-4 text-xl font-bold text-ink">{t("notFound.title")}</h1>

        <p className="mb-8 max-w-sm text-sm leading-relaxed text-muted">{t("notFound.body")}</p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/${locale}`}
            className="ds-focus inline-flex items-center gap-2 rounded-xl bg-signal px-5 py-2.5 text-sm font-bold text-bg shadow-[0_0_20px_rgba(30,200,164,0.12)] transition-colors hover:bg-signal/90"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
              <path
                fillRule="evenodd"
                d="M9.707 16.707a1 1 0 0 1-1.414 0l-6-6a1 1 0 0 1 0-1.414l6-6a1 1 0 0 1 1.414 1.414L5.414 9H17a1 1 0 1 1 0 2H5.414l4.293 4.293a1 1 0 0 1 0 1.414Z"
                clipRule="evenodd"
              />
            </svg>
            {t("notFound.home")}
          </Link>
        </div>
      </div>
    </div>
  );
}
