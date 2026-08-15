import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { PublicPageShell } from "@/components/public-site";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { CASES, CASE_CONTENT_LOCALES } from "@/lib/industrial/cases";
import { caseConfidenceFor } from "@/lib/industrial/case-explorer";
import { buildMetadata } from "@/lib/seo/metadata";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    CASES.map((c) => ({ locale, id: c.id }))
  );
}

/**
 * DISCOVERY-2A — case detail metadata.
 *
 * This page had NO `generateMetadata` at all, so it inherited the nearest
 * ancestor that declares `alternates`: `src/app/[locale]/layout.tsx`, whose
 * canonical is `${BASE_URL}/${locale}`. Every one of these pages was therefore
 * telling Google that the canonical version of a root-cause analysis is the
 * locale HOMEPAGE — which consolidates the site's strongest technical-evidence
 * corpus onto a page that does not contain it, and drops the cases from the
 * index entirely.
 *
 * The content locales are `en` and `fa` because that is what the DATA has:
 * `EngineeringCase` carries an `en` and an `fa` body and no German one, and the
 * page below reads `locale === "fa" ? c.fa : c.en`. Under /de a reader gets the
 * ENGLISH body with German chrome, so /de is not a German representation — it
 * canonicalises to /en and is not advertised as an alternate. Title and summary
 * are localised in all three catalogs, so the /de page still reads correctly;
 * it simply stops claiming to be a translation it is not.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const c = CASES.find((x) => x.id === id);
  if (!c) {
    return { title: "Not Found", robots: { index: false, follow: false } };
  }

  const tCase = await getTranslations({ locale, namespace: "brain.cases" });
  const tSummary = await getTranslations({ locale, namespace: "knowledgeCases" });

  // No `publishedTime`/`modifiedTime`: these records carry no timestamp, and one
  // is never invented (the same rule `articleSchema()` applies).
  return buildMetadata({
    locale,
    path: `/library/cases/${c.id}`,
    title: tCase(c.id),
    description: tSummary(c.id),
    keywords: c.keywords,
    contentLocales: CASE_CONTENT_LOCALES,
  });
}

function confTone(c: number): string {
  if (c >= 70) return "text-signal";
  if (c >= 40) return "text-[var(--warn)]";
  return "text-muted";
}

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const c = CASES.find((x) => x.id === id);
  if (!c) notFound();

  const t = await getTranslations("caseExplorer");
  const tCase = await getTranslations("brain.cases");
  const tDomain = await getTranslations("brain.domains");
  const tVendor = await getTranslations("brain.vendors");

  const content = locale === "fa" ? c.fa : c.en;
  const confidence = caseConfidenceFor(c.id);
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const pct = locale === "fa" ? "\u066A" : "%";

  const primary = content.rootCauses[0] ?? content.rootCause;
  const secondary = content.rootCauses.slice(1);

  return (
    <PublicPageShell>
      <article className="mx-auto max-w-3xl px-6 pb-20 pt-14">
        <Link href="/library/cases" className="font-mono text-xs text-muted hover:text-ink">
          <span className="back-arrow" aria-hidden="true" />
          {t("detail.back")}
        </Link>

        <div className="mt-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-sm uppercase tracking-widest text-signal">
              {t("eyebrow")}
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold leading-tight md:text-4xl">
              {tCase(c.id)}
            </h1>
          </div>
          <div className="text-end">
            <p className="font-body text-[0.7rem] uppercase tracking-wide text-muted">
              {t("card.confidence")}
            </p>
            <p className={`metric text-3xl ${confTone(confidence)}`}>
              {nf.format(confidence)}
              {pct}
            </p>
          </div>
        </div>

        {/* vendor / domain chips */}
        <div className="mt-5 flex flex-wrap gap-1.5">
          <span className="rounded-full border border-signalDim px-3 py-1 font-body text-xs text-signal" dir="ltr">
            {tVendor(c.vendor)}
          </span>
          <span className="rounded-full border border-line px-3 py-1 font-body text-xs text-muted">
            {tDomain(c.category)}
          </span>
        </div>

        {/* Problem */}
        <Section title={t("detail.problem")}>
          <p className="font-body text-base leading-relaxed text-ink">{content.symptoms}</p>
        </Section>

        {/* Root Cause Analysis */}
        <Section title={t("detail.rootCause")}>
          <p className="font-body text-base leading-relaxed text-ink">
            <span className="font-semibold">{t("detail.primaryLabel")}: </span>
            {primary}
          </p>
          {secondary.length > 0 && (
            <div className="mt-3">
              <p className="font-mono text-xs uppercase tracking-widest text-muted">
                {t("detail.secondaryLabel")}
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {secondary.map((s, i) => (
                  <li key={i} className="flex gap-3 font-body text-base leading-relaxed text-ink">
                    <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-signal" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        {/* Verification Steps */}
        <Section title={t("detail.verification")}>
          <ol className="space-y-2.5">
            {content.verificationSteps.map((v, i) => (
              <li key={i} className="flex gap-3 font-body text-base leading-relaxed text-ink">
                <span className="metric w-5 shrink-0 text-base text-muted">{nf.format(i + 1)}</span>
                {v}
              </li>
            ))}
          </ol>
        </Section>

        {/* Corrective Actions */}
        <Section title={t("detail.corrective")}>
          <ul className="space-y-2.5">
            {content.correctiveActions.map((a, i) => (
              <li key={i} className="flex gap-3 font-body text-base leading-relaxed text-ink">
                <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-signal" />
                {a}
              </li>
            ))}
          </ul>
        </Section>

        {/* Safety Notes */}
        <Section title={t("detail.safety")}>
          <p className="rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/5 px-4 py-3 font-body text-base leading-relaxed text-[var(--warn)]">
            {t("safetyGeneric")}
          </p>
        </Section>

        {/* Related domain / vendor */}
        <div className="mt-12 grid gap-4 border-t border-line pt-8 sm:grid-cols-2">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-muted">
              {t("detail.relatedDomain")}
            </p>
            <p className="mt-1 font-body text-sm text-ink">{tDomain(c.category)}</p>
          </div>
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-muted">
              {t("detail.relatedVendor")}
            </p>
            <p className="mt-1 font-body text-sm text-ink" dir="ltr">
              {tVendor(c.vendor)}
            </p>
          </div>
        </div>
      </article>
    </PublicPageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
