import type { ReactNode } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { LegalPageShell } from "@/components/compliance/LegalPageShell";
import { PublicPageShell } from "@/components/public-site";
import { Link }           from "@/i18n/navigation";
import { buildMetadata }  from "@/lib/seo/metadata";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/seo/config";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({ locale, path: "/privacy", title: p.privacy.title, description: p.privacy.description, keywords: p.privacy.keywords });
}

const H2 = "font-mono text-base font-semibold text-ink mb-2";
const LIST = "list-disc list-inside space-y-1.5 text-ink/80";

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  // The copy lives in `legalPages.privacy` for fa/en/de; it was hard-coded
  // English, so /fa/privacy and /de/privacy served English text.
  const t = await getTranslations({ locale, namespace: "legalPages.privacy" });
  const strong = (c: ReactNode) => <strong>{c}</strong>;
  const rich = (key: string) => t.rich(key, { strong, site: SITE_NAME });

  return (
    <PublicPageShell ambient={1}>
      <LegalPageShell title={t("title")} eyebrow={t("eyebrow")} version="1.0" effective={t("effective")}>
        <section>
          <h2 className={H2}>{t("introTitle")}</h2>
          <p>{t("introBody", { site: SITE_NAME })}</p>
        </section>
        <section>
          <h2 className={H2}>{t("collectTitle")}</h2>
          <ul className={LIST}>
            <li>{rich("collectAccount")}</li>
            <li>{rich("collectUsage")}</li>
            <li>{rich("collectIndustrial")}</li>
            <li>
              {t.rich("collectCandidate", {
                strong,
                link: (c) => <Link href="/careers/privacy" className="text-signal hover:underline">{c}</Link>,
              })}
            </li>
            <li>{rich("collectAcademy")}</li>
            <li>{rich("collectConsent")}</li>
          </ul>
        </section>
        <section>
          <h2 className={H2}>{t("basisTitle")}</h2>
          <ul className={LIST}>
            <li>{rich("basisContract")}</li>
            <li>{rich("basisConsent")}</li>
            <li>{rich("basisInterests")}</li>
            <li>{rich("basisObligation")}</li>
          </ul>
        </section>
        <section>
          <h2 className={H2}>{t("retentionTitle")}</h2>
          <p>{t("retentionBody")}</p>
        </section>
        <section>
          <h2 className={H2}>{t("rightsTitle")}</h2>
          <p>
            {t.rich("rightsBody", {
              link: (c) => <Link href="/data-request" className="text-signal hover:underline">{c}</Link>,
            })}
          </p>
        </section>
        <section>
          <h2 className={H2}>{t("securityTitle")}</h2>
          <p>{t("securityBody")}</p>
        </section>
        <section>
          <h2 className={H2}>{t("contactTitle")}</h2>
          <p>
            {t.rich("contactBody", {
              // The canonical corporate contact; the page used to name an
              // address on a domain the company does not use.
              email: CONTACT_EMAIL,
              mail: (c) => <span className="text-ink" dir="ltr">{c}</span>,
            })}
          </p>
        </section>
      </LegalPageShell>
    </PublicPageShell>
  );
}
