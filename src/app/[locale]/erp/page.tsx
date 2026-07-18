// PHASE 87H — premium ERP business-operations landing: attention → operational
// status → budget → KPIs → recent activity → next actions, all from the
// existing server-side getErpOverview(). The page owns the single H1 via
// PageHeader level="page"; a demo badge is shown when the CRM/ERP data layer
// is serving its deterministic mock fallback (no database), per convention.

import { getTranslations, setRequestLocale } from "next-intl/server";
import { getErpOverview }        from "@/lib/erp/db";
import { getPrisma }             from "@/lib/db/prisma";
import { PageHeader, PageStatusBadge } from "@/components/ui/PageHeader";
import { ErpCommandSurface }     from "@/components/business-operations";
import { noIndexMetadata }       from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("ERP Dashboard");
export const dynamic  = "force-dynamic";

export default async function ErpPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("businessOps");

  const overview = await getErpOverview();

  let demoData = false;
  try {
    demoData = (await getPrisma()) === null;
  } catch {
    demoData = true;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("header.eyebrow")}
        title={t("header.title")}
        subtitle={t("header.purpose")}
        level="page"
        status={demoData ? <PageStatusBadge label={t("header.demoBadge")} variant="simulated" /> : undefined}
      />
      <ErpCommandSurface overview={overview} locale={locale} />
    </div>
  );
}
