import { notFound }            from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { PublicPageShell } from "@/components/public-site";
import { Link }               from "@/i18n/navigation";
import { routing }            from "@/i18n/routing";
import { KNOWLEDGE }          from "@/lib/industrial/knowledge";
import { relatedArticles, relatedCases } from "@/lib/industrial/related";
import { ArticleBrainStats }  from "@/components/library/ArticleBrainStats";
import { JsonLd }             from "@/components/seo/JsonLd";
import { articleSchema }      from "@/lib/seo/schemas";
import { buildMetadata }      from "@/lib/seo/metadata";
import { BASE_URL }           from "@/lib/seo/config";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    KNOWLEDGE.map((l) => ({ locale, article: l.id }))
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; article: string }>;
}) {
  const { locale, article } = await params;
  const lib = KNOWLEDGE.find((l) => l.id === article);
  if (!lib) {
    const tnf = await getTranslations({ locale, namespace: "meta" });
    return { title: (tnf.raw("pages") as Record<string, Record<string, string>>).libraryArticle.notFoundTitle };
  }

  const k = await getTranslations({ locale, namespace: "knowledge" });
  const name    = k(`${lib.id}.name`    as Parameters<typeof k>[0]);
  const summary = k(`${lib.id}.summary` as Parameters<typeof k>[0]);
  // 89C: localized title template (suffix was hardcoded English on fa/de).
  const tMeta = await getTranslations({ locale, namespace: "meta" });
  const pMeta = tMeta.raw("pages") as Record<string, Record<string, string>>;

  return buildMetadata({
    locale,
    path:        `/library/${article}`,
    title:       pMeta.libraryArticle.titleTemplate.replace("{name}", name),
    description: summary,
    keywords:    lib.keywords.join(", "),
    ogType:      "article",
    publishedTime: "2026-01-01T00:00:00Z",
    modifiedTime:  "2026-06-25T00:00:00Z",
  });
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ locale: string; article: string }>;
}) {
  const { locale, article } = await params;
  setRequestLocale(locale);

  const lib = KNOWLEDGE.find((l) => l.id === article);
  if (!lib) notFound();

  const t = await getTranslations("library");
  const b = await getTranslations("brain");
  const k = await getTranslations("knowledge");
  const related = relatedArticles(lib.id);
  const cases   = relatedCases(lib.id);

  const name    = k(`${lib.id}.name`    as Parameters<typeof k>[0]);
  const summary = k(`${lib.id}.summary` as Parameters<typeof k>[0]);

  return (
    <PublicPageShell>
      <JsonLd
        data={[
          articleSchema({
            headline:    name,
            description: summary,
            url:         `${BASE_URL}/${locale}/library/${lib.id}`,
            keywords:    lib.keywords,
            locale,
          }),
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home",    item: `${BASE_URL}/${locale}` },
              { "@type": "ListItem", position: 2, name: "Library", item: `${BASE_URL}/${locale}/library` },
              { "@type": "ListItem", position: 3, name: name,      item: `${BASE_URL}/${locale}/library/${lib.id}` },
            ],
          },
        ]}
      />
      <article className="mx-auto max-w-3xl px-6 pb-20 pt-14">
        <Link href="/library" className="font-mono text-xs text-muted hover:text-ink">
          <span className="back-arrow" aria-hidden="true" />{t("article.back")}
        </Link>

        <p className="mt-8 font-mono text-sm uppercase tracking-widest text-signal">
          {t(`categories.${lib.category}`)}
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold leading-tight md:text-4xl">
          {name}
        </h1>
        <p className="mt-4 font-body text-lg leading-relaxed text-muted">
          {summary}
        </p>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {lib.domains.map((d) => (
            <span key={d} className="rounded-full border border-line px-2.5 py-0.5 font-body text-xs text-muted">
              {b(`domains.${d}`)}
            </span>
          ))}
          {lib.vendor && (
            <Link
              href={`/library/vendor/${lib.vendor}`}
              className="rounded-full border border-signalDim px-2.5 py-0.5 font-body text-xs text-signal hover:bg-signal/10"
            >
              {b(`vendors.${lib.vendor}`)} · {t("article.vendorCenter")}
            </Link>
          )}
        </div>

        {/* 1 — Overview */}
        <h2 className="mt-10 font-display text-xl font-bold">{t("article.overviewTitle")}</h2>
        <p className="mt-3 font-body text-base leading-relaxed text-ink">
          {k(`${lib.id}.overview` as Parameters<typeof k>[0])}
        </p>

        {/* 2 — Engineering purpose */}
        <h2 className="mt-10 font-display text-xl font-bold">{t("article.purposeTitle")}</h2>
        <p className="mt-3 font-body text-base leading-relaxed text-ink">
          {k(`${lib.id}.purpose` as Parameters<typeof k>[0])}
        </p>

        {/* 3 — How it works */}
        <h2 className="mt-10 font-display text-xl font-bold">{t("article.howTitle")}</h2>
        <p className="mt-3 font-body text-base leading-relaxed text-ink">
          {k(`${lib.id}.how` as Parameters<typeof k>[0])}
        </p>
        <ul className="mt-4 space-y-3">
          {(["p1", "p2", "p3"] as const).map((p) => (
            <li key={p} className="flex gap-3 font-body text-base leading-relaxed text-ink">
              <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-signal" />
              {k(`${lib.id}.${p}` as Parameters<typeof k>[0])}
            </li>
          ))}
        </ul>

        {/* 4 — Common faults */}
        <h2 className="mt-10 font-display text-xl font-bold">{t("article.faultsTitle")}</h2>
        <p className="mt-3 font-body text-base leading-relaxed text-ink">
          {k(`${lib.id}.faults` as Parameters<typeof k>[0])}
        </p>

        {/* 5 — Diagnostic checks */}
        <h2 className="mt-10 font-display text-xl font-bold">{t("article.checksHeading")}</h2>
        <ol className="mt-4 space-y-3">
          {(["c1", "c2", "c3"] as const).map((c, i) => (
            <li key={c} className="flex gap-3 font-body text-base leading-relaxed text-ink">
              <span className="metric w-5 shrink-0 text-base text-muted">{i + 1}</span>
              {k(`${lib.id}.${c}` as Parameters<typeof k>[0])}
            </li>
          ))}
        </ol>

        {/* 6 — Safety notes */}
        <h2 className="mt-10 font-display text-xl font-bold">{t("article.safetyTitle")}</h2>
        <p className="mt-3 rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/5 px-4 py-3 font-body text-base leading-relaxed text-[var(--warn)]">
          {k(`${lib.id}.safetyNote` as Parameters<typeof k>[0])}
        </p>

        {/* 7 — Commissioning notes */}
        <h2 className="mt-10 font-display text-xl font-bold">{t("article.commissioningTitle")}</h2>
        <p className="mt-3 font-body text-base leading-relaxed text-ink">
          {k(`${lib.id}.commissioning` as Parameters<typeof k>[0])}
        </p>

        {/* 8 — Related concepts */}
        <h2 className="mt-10 font-display text-xl font-bold">{t("article.conceptsTitle")}</h2>
        <p className="mt-3 font-body text-base leading-relaxed text-ink">
          {k(`${lib.id}.concepts` as Parameters<typeof k>[0])}
        </p>
        {/*
          PHASE 87L.6F — the raw `lib.keywords` line was removed from the body.
          It is SEARCH METADATA, not article content: knowledge.ts documents the
          array as "bilingual MATCHING keywords only; all VISIBLE text lives in
          messages/*.json", it had no heading and was styled as debug text, and
          it rendered the same EN+FA (now +DE) token soup on every locale with a
          hard-coded dir="ltr" even on the RTL page. It already has a proper
          home: generateMetadata() above emits it as <meta name="keywords">.
          Search behaviour is unchanged — the array is untouched.
        */}

        {/* Engineering case links */}
        {cases.length > 0 && (
          <>
            <h2 className="mt-12 border-t border-line pt-8 font-display text-xl font-bold">
              {t("article.casesTitle")}
            </h2>
            <ul className="mt-4 space-y-3">
              {cases.map((c) => (
                <li key={c.id} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-display text-sm font-semibold text-ink">
                      {b(`cases.${c.id}`)}
                    </span>
                    <Link
                      href={`/library/vendor/${c.vendor}`}
                      className="rounded-full border border-signalDim px-2 py-0.5 font-body text-[0.65rem] text-signal hover:bg-signal/10"
                    >
                      {b(`vendors.${c.vendor}`)}
                    </Link>
                    <span className="rounded-full border border-line px-2 py-0.5 font-body text-[0.65rem] text-muted">
                      {b(`domains.${c.category}`)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Related articles */}
        {related.length > 0 && (
          <>
            <h2 className="mt-12 border-t border-line pt-8 font-display text-xl font-bold">
              {t("article.relatedTitle")}
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/library/${r.id}`}
                  className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-signal/40"
                >
                  <h3 className="font-display text-sm font-semibold text-ink">
                    {k(`${r.id}.name` as Parameters<typeof k>[0])}
                  </h3>
                  <p className="mt-1 font-body text-xs leading-relaxed text-muted">
                    {k(`${r.id}.summary` as Parameters<typeof k>[0])}
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}

        {/* 9 — When Hermes Brain uses this article */}
        <h2 className="mt-12 border-t border-line pt-8 font-display text-xl font-bold">
          {t("article.brainUseTitle")}
        </h2>
        <p className="mt-3 font-body text-base leading-relaxed text-ink">
          {k(`${lib.id}.brainUse` as Parameters<typeof k>[0])}
        </p>
        <div className="mt-4">
          <ArticleBrainStats articleId={lib.id} />
        </div>
      </article>
    </PublicPageShell>
  );
}
