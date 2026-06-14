import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { KNOWLEDGE } from "@/lib/industrial/knowledge";
import { relatedArticles, relatedCases } from "@/lib/industrial/related";
import { ArticleBrainStats } from "@/components/library/ArticleBrainStats";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    KNOWLEDGE.map((l) => ({ locale, article: l.id }))
  );
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
  const cases = relatedCases(lib.id);

  return (
    <PageShell>
      <article className="mx-auto max-w-3xl px-6 pb-20 pt-14">
        <Link href="/library" className="font-mono text-xs text-muted hover:text-ink">
          <span className="back-arrow" aria-hidden="true" />{t("article.back")}
        </Link>

        <p className="mt-8 font-mono text-sm uppercase tracking-widest text-signal">
          {t(`categories.${lib.category}`)}
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold leading-tight md:text-4xl">
          {k(`${lib.id}.name`)}
        </h1>
        <p className="mt-4 font-body text-lg leading-relaxed text-muted">
          {k(`${lib.id}.summary`)}
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
          {k(`${lib.id}.overview`)}
        </p>

        {/* 2 — Engineering purpose */}
        <h2 className="mt-10 font-display text-xl font-bold">{t("article.purposeTitle")}</h2>
        <p className="mt-3 font-body text-base leading-relaxed text-ink">
          {k(`${lib.id}.purpose`)}
        </p>

        {/* 3 — How it works: narrative + the engineering points */}
        <h2 className="mt-10 font-display text-xl font-bold">{t("article.howTitle")}</h2>
        <p className="mt-3 font-body text-base leading-relaxed text-ink">
          {k(`${lib.id}.how`)}
        </p>
        <ul className="mt-4 space-y-3">
          {(["p1", "p2", "p3"] as const).map((p) => (
            <li key={p} className="flex gap-3 font-body text-base leading-relaxed text-ink">
              <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-signal" />
              {k(`${lib.id}.${p}`)}
            </li>
          ))}
        </ul>

        {/* 4 — Common faults */}
        <h2 className="mt-10 font-display text-xl font-bold">{t("article.faultsTitle")}</h2>
        <p className="mt-3 font-body text-base leading-relaxed text-ink">
          {k(`${lib.id}.faults`)}
        </p>

        {/* 5 — Diagnostic checks */}
        <h2 className="mt-10 font-display text-xl font-bold">{t("article.checksHeading")}</h2>
        <ol className="mt-4 space-y-3">
          {(["c1", "c2", "c3"] as const).map((c, i) => (
            <li key={c} className="flex gap-3 font-body text-base leading-relaxed text-ink">
              <span className="metric w-5 shrink-0 text-base text-muted">{i + 1}</span>
              {k(`${lib.id}.${c}`)}
            </li>
          ))}
        </ol>

        {/* 6 — Safety notes */}
        <h2 className="mt-10 font-display text-xl font-bold">{t("article.safetyTitle")}</h2>
        <p className="mt-3 rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/5 px-4 py-3 font-body text-base leading-relaxed text-[var(--warn)]">
          {k(`${lib.id}.safetyNote`)}
        </p>

        {/* 7 — Commissioning notes */}
        <h2 className="mt-10 font-display text-xl font-bold">{t("article.commissioningTitle")}</h2>
        <p className="mt-3 font-body text-base leading-relaxed text-ink">
          {k(`${lib.id}.commissioning`)}
        </p>

        {/* 8 — Related concepts (narrative; case links and related articles follow) */}
        <h2 className="mt-10 font-display text-xl font-bold">{t("article.conceptsTitle")}</h2>
        <p className="mt-3 font-body text-base leading-relaxed text-ink">
          {k(`${lib.id}.concepts`)}
        </p>
        <p className="mt-4 font-mono text-xs text-muted/70" dir="ltr">
          {lib.keywords.join(" · ")}
        </p>

        {/* engineering case links */}
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

        {/* related articles */}
        {related.length > 0 && (
          <>
            <h2 className="mt-12 border-t border-line pt-8 font-display text-xl font-bold">
              {t("article.relatedTitle")}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/library/${r.id}`}
                  className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-signal/40"
                >
                  <h3 className="font-display text-sm font-semibold text-ink">
                    {k(`${r.id}.name`)}
                  </h3>
                  <p className="mt-1 font-body text-xs leading-relaxed text-muted">
                    {k(`${r.id}.summary`)}
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
          {k(`${lib.id}.brainUse`)}
        </p>
        <div className="mt-4">
          <ArticleBrainStats articleId={lib.id} />
        </div>
      </article>
    </PageShell>
  );
}
