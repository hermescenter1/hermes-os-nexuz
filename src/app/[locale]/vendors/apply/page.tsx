import type { Metadata }             from "next";
import { buildMetadata }             from "@/lib/seo/metadata";
import { VendorApplicationForm }     from "@/components/vendors/VendorApplicationForm";
import { Link }                      from "@/i18n/navigation";
import { PublicPageShell }           from "@/components/public-site";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "vendors.apply" });
  return buildMetadata({
    locale,
    title:       t("metaTitle"),
    description: t("metaDescription"),
    path:        "/vendors/apply",
    keywords:    ["vendor application", "partner program", "industrial technology partner", "Hermes OS vendor"],
  });
}

// PHASE 104-I2 — /vendors/apply joins the public estate and stops shipping
// hard-coded English. The back link, eyebrow, heading, lede, benefit strip and
// page metadata were all English literals on a page with no public chrome.
//
// The former lede also carried an unqualified "reviewed within 5 business days"
// service commitment with nothing in the repository backing it; the localized
// copy states the partnership offer without asserting a turnaround the product
// cannot evidence.
export default async function VendorApplyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "vendors.apply" });

  const benefits = [
    { key: "verified", title: t("benefits.verifiedTitle"), desc: t("benefits.verifiedDesc") },
    { key: "reach",    title: t("benefits.reachTitle"),    desc: t("benefits.reachDesc") },
    { key: "panel",    title: t("benefits.panelTitle"),    desc: t("benefits.panelDesc") },
  ];

  return (
    <PublicPageShell>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 space-y-10">
        {/* Header */}
        <div>
          <Link
            href="/vendors"
            className="ds-focus inline-flex min-h-11 items-center gap-1 text-xs text-muted hover:text-ink transition-colors"
          >
            <span aria-hidden="true" className="rtl:rotate-180 inline-block">←</span> {t("back")}
          </Link>
          <p className="mt-4 font-mono text-xs uppercase tracking-widest text-muted">{t("eyebrow")}</p>
          <h1 className="mt-2 type-page-title">{t("title")}</h1>
          <p className="mt-3 text-sm text-muted max-w-2xl">
            {t("lede")}
          </p>
        </div>

        {/* Benefits strip */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {benefits.map(({ key, title, desc }) => (
            <div key={key} className="rounded-xl border border-line bg-surface p-5">
              <p className="text-sm font-semibold text-ink">{title}</p>
              <p className="mt-1.5 text-xs text-muted leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <VendorApplicationForm />
      </div>
    </PublicPageShell>
  );
}
