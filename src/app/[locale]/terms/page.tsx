import { setRequestLocale, getTranslations } from "next-intl/server";
import { LegalPageShell } from "@/components/compliance/LegalPageShell";
import { PublicPageShell } from "@/components/public-site";
import { buildMetadata }  from "@/lib/seo/metadata";
import { SITE_NAME }      from "@/lib/seo/config";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({ locale, path: "/terms", title: p.terms.title, description: p.terms.description, keywords: p.terms.keywords });
}

/** Section keys in display order; each has `${key}Title` and `${key}Body`. */
const SECTIONS = ["acceptance", "use", "accounts", "billing", "ip", "liability", "law"] as const;

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  // The copy lives in `legalPages.terms` for fa/en/de; it was hard-coded
  // English, so /fa/terms and /de/terms served English text.
  const t = await getTranslations({ locale, namespace: "legalPages.terms" });

  return (
    <PublicPageShell ambient={1}>
      <LegalPageShell title={t("title")} eyebrow={t("eyebrow")} version="1.0" effective={t("effective")}>
        {SECTIONS.map((key) => (
          <section key={key}>
            <h2 className="font-mono text-base font-semibold text-ink mb-2">{t(`${key}Title`)}</h2>
            <p>{t(`${key}Body`, { site: SITE_NAME })}</p>
          </section>
        ))}
      </LegalPageShell>
    </PublicPageShell>
  );
}
