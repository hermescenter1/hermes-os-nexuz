"use client";

import { useEffect, useState } from "react";

/**
 * PHASE 89A — global error boundary (H2, fail-safe).
 *
 * Next.js App Router renders src/app/global-error.tsx ONLY when the root layout
 * itself (or a provider it mounts) throws, so this boundary must NOT depend on
 * anything that may have already failed: no next-intl provider, no design-system
 * CSS, no app context. It therefore:
 *   - defines its own <html> and <body>,
 *   - carries its own inline trilingual strings (never the message catalog,
 *     which reaches the client via the provider that may be down),
 *   - styles itself inline (so it renders even if the stylesheet did not load).
 *
 * HYDRATION DETERMINISM (89A amendment)
 * The server render and the FIRST client render are byte-identical English:
 * `locale` starts at the "en" fallback and the URL is never consulted while
 * that first pass is produced. The locale is resolved from the pathname only
 * after mount, inside useEffect — which never runs during SSR or during
 * hydration — and is then held in component state. Because the two passes
 * always agree, `suppressHydrationWarning` is NOT used and no mismatch is
 * concealed. An unknown or malformed first path segment stays English.
 *
 * It exposes no error details (no message/stack/cause/digest) and logs nothing.
 */

const STRINGS = {
  fa: {
    title: "مشکلی پیش آمد",
    body: "خطای بحرانی رخ داد. لطفاً دوباره تلاش کنید.",
    retry: "تلاش دوباره",
    home: "بازگشت به خانه",
  },
  en: {
    title: "Something went wrong",
    body: "A critical error occurred. Please try again.",
    retry: "Try again",
    home: "Back to home",
  },
  de: {
    title: "Etwas ist schiefgelaufen",
    body: "Ein kritischer Fehler ist aufgetreten. Bitte versuchen Sie es erneut.",
    retry: "Erneut versuchen",
    home: "Zurück zur Startseite",
  },
} as const;

type Loc = keyof typeof STRINGS;

/** The deterministic fallback used by the server render and the first client render. */
const FALLBACK_LOCALE: Loc = "en";

/**
 * Map the first path segment to a supported locale.
 *
 * Pure and side-effect free — it takes the pathname as an argument rather than
 * reading `window`, so it is safe to unit-test and impossible to invoke during
 * the initial render path by accident. `hasOwnProperty` (not `in`) is used so a
 * segment such as `constructor` or `__proto__` cannot resolve through the
 * prototype chain; anything unrecognised stays on the English fallback.
 */
function localeFromPathname(pathname: string): Loc {
  const segment = pathname.split("/").filter(Boolean)[0];
  return segment !== undefined && Object.prototype.hasOwnProperty.call(STRINGS, segment)
    ? (segment as Loc)
    : FALLBACK_LOCALE;
}

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Deterministic on the server AND on the first client render — no browser
  // global is read to compute this initial value.
  const [locale, setLocale] = useState<Loc>(FALLBACK_LOCALE);

  useEffect(() => {
    // Post-mount only. Wrapped defensively because this is the last-resort
    // boundary: if the URL cannot be read for any reason, English must stand.
    try {
      setLocale(localeFromPathname(window.location.pathname));
    } catch {
      /* location unreadable — keep the English fallback */
    }
  }, []);

  const t = STRINGS[locale];
  const dir = locale === "fa" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          backgroundColor: "#06080D",
          color: "#E6EDF3",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: "28rem" }}>
          <p
            style={{
              margin: "0 0 20px",
              fontSize: "9px",
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              color: "#1EC8A4",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            Hermes OS
          </p>
          <h1 style={{ margin: "0 0 12px", fontSize: "20px", fontWeight: 700 }}>{t.title}</h1>
          <p style={{ margin: "0 0 32px", fontSize: "14px", lineHeight: 1.6, color: "#8CA0B3" }}>
            {t.body}
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                cursor: "pointer",
                borderRadius: "12px",
                border: "none",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 700,
                backgroundColor: "#1EC8A4",
                color: "#06080D",
              }}
            >
              {t.retry}
            </button>
            <a
              href={`/${locale}`}
              style={{
                borderRadius: "12px",
                border: "1px solid rgba(230,237,243,0.2)",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                color: "#E6EDF3",
                textDecoration: "none",
              }}
            >
              {t.home}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
