import { setRequestLocale, getTranslations } from "next-intl/server";
import type { ReactNode }   from "react";
import { AppShell }         from "@/components/app-shell";
import { AtsSubNav }        from "@/components/ats/AtsSubNav";

/*
 * GATE B.1 F03 (R3) — this layout renders the header on all five authorized ATS
 * routes, so its eyebrow, title and subtitle are UI copy and must be localized.
 *
 * The eyebrow and title deliberately keep the branded tokens HERMES OS and ATS
 * INSIDE the translated string: the brand is stable across locales while the
 * descriptive words around it are not. Splitting them into a concatenation
 * would hard-code word order and break Persian.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ats" });
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function AtsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params:   Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("ats");

  return (
    <AppShell>
      <div className="mx-auto max-w-screen-2xl px-6 sm:px-8 pb-20">
        <div className="page-header-premium">
          <p className="eyebrow-label mb-2">{t("pageEyebrow")}</p>
          {/*
            * GATE B.2 — the German title is one compound word
            * ("Bewerbermanagementsystem") that cannot break at 320px, so the
            * heading rendered 346px wide inside a 272px box and pushed the
            * document 50px wide. break-words lets the word wrap; the type scale
            * is untouched and nothing is clipped or truncated. hyphens-auto lets
            * the browser break the compound at a real syllable boundary using the
            * document's de-DE lang, so the fallback hard break is a last resort.
            */}
          <h1 className="type-page-title hyphens-auto break-words">{t("pageTitle")}</h1>
          <p className="mt-2 type-secondary max-w-3xl">{t("pageSubtitle")}</p>
        </div>
        <AtsSubNav />
        {children}
      </div>
    </AppShell>
  );
}
