"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

/**
 * PHASE 89A — localized error boundary (H2).
 *
 * A Client Component, as Next.js App Router requires for error boundaries.
 * Renders WITHIN src/app/[locale]/layout.tsx, so the NextIntlClientProvider and
 * the per-locale <html lang dir> are already in place — Persian stays RTL,
 * English and German render LTR.
 *
 * INFORMATION DISCLOSURE: this boundary renders a generic localized message
 * ONLY. It never reads or displays error.message, error.stack, error.cause,
 * error.digest or any internal identifier, and it logs nothing — the repository
 * has no established safe client-error reporting sink, so per the brief none is
 * added.
 */
export default function LocalizedError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  const locale = useLocale();

  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
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
          {t("error.eyebrow")}
        </p>

        <div
          aria-hidden="true"
          className="mb-0 -mt-4 select-none text-[7rem] font-black leading-none text-ink/5"
        >
          !
        </div>

        <h1 className="mb-3 -mt-4 text-xl font-bold text-ink">{t("error.title")}</h1>

        <p className="mb-8 max-w-sm text-sm leading-relaxed text-muted">{t("error.body")}</p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="ds-focus inline-flex items-center gap-2 rounded-xl bg-signal px-5 py-2.5 text-sm font-bold text-bg shadow-[0_0_20px_rgba(30,200,164,0.12)] transition-colors hover:bg-signal/90"
          >
            {t("error.retry")}
          </button>
          <Link
            href={`/${locale}`}
            className="ds-focus inline-flex items-center gap-2 rounded-xl border border-line px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-ink/5"
          >
            {t("error.home")}
          </Link>
        </div>
      </div>
    </div>
  );
}
