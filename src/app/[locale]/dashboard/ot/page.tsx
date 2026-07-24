// PHASE 94C1 — the OT Edge landing.
//
// A Server Component that renders only static, localized copy: the surface's
// purpose, the boundary of what it can and cannot tell an operator, and links
// into the two lists. It fetches nothing, so it can make no claim about any
// record — the counts live on the list pages, beside the rows they describe.

import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert, Card } from "@/components/ds";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("OT Edge");

export default async function OtEdgeOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("otEdge");

  const sections = [
    {
      href: "/dashboard/ot/gateways",
      heading: t("overview.gatewaysHeading"),
      body: t("gateways.subtitle"),
      link: t("overview.gatewaysLink"),
    },
    {
      href: "/dashboard/ot/devices",
      heading: t("overview.devicesHeading"),
      body: t("devices.subtitle"),
      link: t("overview.devicesLink"),
    },
  ];

  return (
    <>
      <PageHeader level="page" title={t("overview.title")} subtitle={t("overview.subtitle")} />

      {/* Stated once, prominently: this surface reports configuration. It does
          not monitor, and it cannot command. */}
      <Alert variant="information" title={t("advisory.title")} className="mt-6">
        <p>{t("advisory.body")}</p>
      </Alert>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.href} variant="standard" className="flex flex-col gap-3 p-6">
            <h2 className="text-title font-semibold text-text-primary">{section.heading}</h2>
            <p className="text-body text-text-secondary">{section.body}</p>
            <p className="mt-auto pt-2">
              <Link
                href={section.href}
                className="ds-focus font-medium text-brand-primary underline-offset-2 hover:underline"
              >
                {section.link}
              </Link>
            </p>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-label text-text-muted">{t("overview.scopeNote")}</p>
    </>
  );
}
