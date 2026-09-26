import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buildMetadata } from "@/lib/seo/metadata";
import { CONTACT_EMAIL, ORG_NAME } from "@/lib/seo/config";
import { RECRUITMENT_CONSENT_VERSION } from "@/lib/ats/policy";

/**
 * ATS — the candidate privacy notice (LEGAL DRAFT).
 *
 * The Stage-1 application form links here. The copy lives in
 * `careers.privacy` (en/fa/de) and describes the recruitment system as it is
 * built — preliminary screening that never decides, a recorded human decision,
 * retention set by the organization's approved policy, and the Data Request
 * Center as the one request route. It is marked as a draft on the page itself
 * and claims no legal compliance.
 *
 * The version shown IS the consent version intake records with every
 * acknowledgement (`RECRUITMENT_CONSENT_VERSION`), so "recorded with the notice
 * version" stays true. Changing this notice's substance means bumping that
 * constant — an owner decision, not a copy edit.
 *
 * Draft ⇒ `noIndex`: applicants can read it from the form; search engines do
 * not index a notice that is not final.
 */

/** The date this draft was prepared — shown, never used for any decision. */
const PREPARED_ON = new Date(Date.UTC(2026, 8, 26));

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "careers.privacy" });
  return buildMetadata({
    locale,
    path: "/careers/privacy",
    title: t("metaTitle"),
    description: t("metaDescription"),
    noIndex: true,
  });
}

const H2 = ({ children }: { children: ReactNode }) => (
  <h2 className="mb-2 text-base font-semibold text-ink">{children}</h2>
);
const UL = ({ children }: { children: ReactNode }) => (
  <ul className="list-disc space-y-1.5 ps-5 text-ink/80">{children}</ul>
);

export default async function CandidatePrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "careers.privacy" });

  const requestLink = (chunks: ReactNode) => (
    <Link href="/data-request" className="text-signal underline">
      {chunks}
    </Link>
  );
  const generalLink = (chunks: ReactNode) => (
    <Link href="/privacy" className="text-signal underline">
      {chunks}
    </Link>
  );
  const mail = (chunks: ReactNode) => (
    <a href={`mailto:${CONTACT_EMAIL}`} className="text-signal underline" dir="ltr">
      {chunks}
    </a>
  );
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(PREPARED_ON);

  return (
    <article className="mx-auto max-w-3xl px-6 py-12 sm:py-16" data-legal-status="draft">
      <header className="mb-8">
        <p className="eyebrow-label mb-2">{t("eyebrow")}</p>
        <h1 className="type-page-title mb-3">{t("title")}</h1>
        <p className="text-xs text-muted">
          {/* LRI…PDI isolate the Latin version token, so the RTL (fa) line does
              not reorder its hyphen-separated parts. */}
          {t("versionLine", { version: `\u2066${RECRUITMENT_CONSENT_VERSION}\u2069`, date })}
        </p>
      </header>

      <div role="note" className="mb-8 rounded-lg border border-amber-400/50 bg-amber-950/30 p-4">
        <p className="mb-1 text-sm font-semibold text-ink">{t("draftBadge")}</p>
        <p className="text-xs leading-relaxed text-muted">{t("draftNotice")}</p>
      </div>

      <div className="space-y-8 text-sm leading-relaxed text-ink/85">
        <p>{t.rich("intro", { general: generalLink })}</p>

        <section aria-labelledby="cp-s1">
          <H2><span id="cp-s1">{t("s1.title")}</span></H2>
          <p className="mb-2">{t("s1.lead")}</p>
          <UL>
            <li>{t("s1.provided")}</li>
            <li>{t("s1.confirmations")}</li>
            <li>{t("s1.process")}</li>
            <li>{t("s1.technical")}</li>
          </UL>
          <p className="mt-2">{t("s1.notRequested")}</p>
        </section>

        <section aria-labelledby="cp-s2">
          <H2><span id="cp-s2">{t("s2.title")}</span></H2>
          <div className="space-y-2">
            <p>{t("s2.p1")}</p>
            <p>{t("s2.p2")}</p>
            <p>{t("s2.p3")}</p>
            <p>{t("s2.p4")}</p>
          </div>
        </section>

        <section aria-labelledby="cp-s3">
          <H2><span id="cp-s3">{t("s3.title")}</span></H2>
          <div className="space-y-2">
            <p>{t("s3.p1")}</p>
            <p>{t("s3.p2")}</p>
          </div>
        </section>

        <section aria-labelledby="cp-s4">
          <H2><span id="cp-s4">{t("s4.title")}</span></H2>
          <p className="mb-2">{t("s4.purpose")}</p>
          <p className="mb-2">{t("s4.basisLead")}</p>
          <UL>
            <li>{t("s4.steps")}</li>
            <li>{t("s4.interest")}</li>
            <li>{t("s4.legal")}</li>
            <li>{t("s4.consent")}</li>
          </UL>
          <p className="mt-2">{t("s4.noSecondaryUse")}</p>
        </section>

        <section aria-labelledby="cp-s5">
          <H2><span id="cp-s5">{t("s5.title")}</span></H2>
          <div className="space-y-2">
            <p>{t("s5.p1")}</p>
            <p>{t("s5.p2")}</p>
            <p>{t("s5.p3")}</p>
            <p>{t("s5.p4")}</p>
          </div>
        </section>

        <section aria-labelledby="cp-s6">
          <H2><span id="cp-s6">{t("s6.title")}</span></H2>
          <p className="mb-2">{t("s6.lead")}</p>
          <UL>
            <li>{t("s6.access")}</li>
            <li>{t("s6.correction")}</li>
            <li>{t("s6.deletion")}</li>
            <li>{t("s6.objection")}</li>
            <li>{t("s6.withdraw")}</li>
          </UL>
          <div className="mt-2 space-y-2">
            <p>{t("s6.other")}</p>
            <p>{t.rich("s6.how", { link: requestLink })}</p>
            <p>{t("s6.complaint")}</p>
          </div>
        </section>

        <section aria-labelledby="cp-s7">
          <H2><span id="cp-s7">{t("s7.title")}</span></H2>
          <div className="space-y-2">
            <p>{t("s7.p1")}</p>
            <p>{t("s7.p2")}</p>
            <p>{t("s7.p3")}</p>
          </div>
        </section>

        <section aria-labelledby="cp-s8">
          <H2><span id="cp-s8">{t("s8.title")}</span></H2>
          <div className="space-y-2">
            <p>{t("s8.controller", { org: ORG_NAME })}</p>
            <p>{t.rich("s8.contact", { email: CONTACT_EMAIL, mail })}</p>
            <p>{t("s8.otherOrgs")}</p>
          </div>
        </section>

        <section aria-labelledby="cp-s9">
          <H2><span id="cp-s9">{t("s9.title")}</span></H2>
          <p className="mb-2">{t("s9.limits")}</p>
          <p className="mb-2">{t("s9.stepsLead")}</p>
          <ol className="list-decimal space-y-1.5 ps-5 text-ink/80">
            <li>{t.rich("s9.one", { link: requestLink })}</li>
            <li>{t("s9.two")}</li>
            <li>{t("s9.three")}</li>
            <li>{t("s9.four")}</li>
          </ol>
        </section>
      </div>

      <div className="mt-12 border-t border-line pt-6 text-xs">
        <Link href="/careers" className="ds-focus text-muted transition-colors hover:text-ink">
          <span aria-hidden="true" className="inline-block rtl:rotate-180">←</span> {t("backToCareers")}
        </Link>
      </div>
    </article>
  );
}
