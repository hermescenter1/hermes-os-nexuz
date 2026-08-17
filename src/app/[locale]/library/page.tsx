import { setRequestLocale, getTranslations } from "next-intl/server";
import { PublicPageShell } from "@/components/public-site";
import { PageIntro }     from "@/components/PageIntro";
import { LibraryClient } from "@/components/library/LibraryClient";
import { Link }          from "@/i18n/navigation";
import { buildMetadata } from "@/lib/seo/metadata";
import { KNOWLEDGE }     from "@/lib/industrial/knowledge";
import { CASES, CASE_CONTENT_LOCALES } from "@/lib/industrial/cases";
import { VENDORS }       from "@/lib/industrial/vendors";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({
    locale,
    path: "/library",
    title:       p.library.title,
    description: p.library.description,
    keywords:    p.library.keywords,
  });
}

export default async function LibraryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("library");

  return (
    <PublicPageShell>
      <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
      {/* Brain connection — Knowledge Cloud is what the Brain cites */}
      <div className="mx-auto max-w-6xl px-6 pt-8">
        <p className="rounded-xl border border-signalDim bg-surface px-5 py-4 font-body text-sm leading-relaxed text-muted">
          <span className="me-2 inline-block h-1.5 w-1.5 rounded-full bg-signal align-middle" />
          {t("brainNote")}
        </p>
      </div>
      <LibraryClient />

      {/*
       * DISCOVERY-2D P1K — server-rendered discovery bridge.
       *
       * LibraryClient intentionally remains the interactive search/filter UX.
       * Its catalog arrives after hydration, so those links are not present in
       * the initial HTML. This compact public bridge exposes the exact static
       * authorities already admitted by sitemap.ts without creating a second
       * content registry.
       *
       * Case links follow CASE_CONTENT_LOCALES. In particular, no German case
       * detail link is advertised until German case bodies actually exist.
       */}
      <section
        aria-labelledby="library-discovery-heading"
        className="mx-auto max-w-6xl px-6 py-12"
      >
        <div className="rounded-2xl border border-signalDim bg-surface p-6 sm:p-8">
          <h2
            id="library-discovery-heading"
            className="font-body text-2xl font-semibold tracking-tight text-ink"
          >
            {t("categoriesLabel")}
          </h2>

          <div className="mt-8 grid gap-8 lg:grid-cols-3">
            <section aria-labelledby="library-discovery-knowledge">
              <h3
                id="library-discovery-knowledge"
                className="font-body text-base font-semibold text-ink"
              >
                {t("categoriesLabel")}
              </h3>

              <ul className="mt-4 space-y-2">
                {KNOWLEDGE.map((item) => (
                  <li key={`knowledge:${item.id}`}>
                    <Link
                      href={`/library/${item.id}`}
                      className="font-body text-sm text-muted underline-offset-4 transition-colors hover:text-signal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                    >
                      {item.id}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            {CASE_CONTENT_LOCALES.includes(locale) && (
              <section aria-labelledby="library-discovery-cases">
                <h3
                  id="library-discovery-cases"
                  className="font-body text-base font-semibold text-ink"
                >
                  {t("caseLabel")}
                </h3>

                <ul className="mt-4 space-y-2">
                  {CASES.map((item) => (
                    <li key={`case:${item.id}`}>
                      <Link
                        href={`/library/cases/${item.id}`}
                        className="font-body text-sm text-muted underline-offset-4 transition-colors hover:text-signal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                      >
                        {item.id}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="library-discovery-vendors">
              <h3
                id="library-discovery-vendors"
                className="font-body text-base font-semibold text-ink"
              >
                {t("vendorsLabel")}
              </h3>

              <ul className="mt-4 space-y-2">
                {VENDORS.map((vendor) => (
                  <li key={`vendor:${vendor.id}`}>
                    <Link
                      href={`/library/vendor/${vendor.id}`}
                      className="font-body text-sm text-muted underline-offset-4 transition-colors hover:text-signal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                    >
                      {vendor.id}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </section>
    </PublicPageShell>
  );
}
